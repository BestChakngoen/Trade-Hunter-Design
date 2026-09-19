/**
 * LobbySessionCoordinator - Manages room validity verification, stale room purging,
 * client IP detection, and returning player session recovery.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class LobbySessionCoordinator {
  constructor(firebaseService, sessionLockService = null, playerSessionService = null) {
    this.firebaseService = firebaseService;
    this.sessionLockService = sessionLockService;
    this.playerSessionService = playerSessionService;
  }

  withTimeout(promise, timeoutMs, errorMessage) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(errorMessage));
      }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
  }

  /**
   * Inspects room existence, stale state, and player session token in Firebase.
   */
  async inspectRoomAndSession(code) {
    // 1. Verify if room is permitted in Firestore
    const isAllowed = await this.withTimeout(
      this.firebaseService.checkRoomExists(code),
      8000,
      "หมดเวลาการเชื่อมต่อกับเซิร์ฟเวอร์ (Firestore Timeout)"
    );

    if (!isAllowed) {
      return { isAllowed: false };
    }

    const now = Date.now();

    // 2. Detect Client Public IP for access tracking
    let clientIp = 'unknown';
    if (this.sessionLockService) {
      try {
        clientIp = (await this.sessionLockService.fetchPublicIp()) || 'unknown';
      } catch (e) {
        console.warn("[LobbySessionCoordinator] Failed to fetch public IP:", e);
      }
    }

    // 3. Fetch room status & inspect stale/expired state from Firebase Realtime Database
    let roomExists = false;
    let roomData = null;

    const roomSnapshot = await this.withTimeout(
      this.firebaseService.getRoomStateSnapshot(code),
      8000,
      "หมดเวลาการเชื่อมต่อกับ Realtime Database"
    );

    if (roomSnapshot && roomSnapshot.exists()) {
      roomData = roomSnapshot.val();
      const members = roomData.members || {};
      const memberUids = Object.keys(members);
      const expiresAt = roomData.expiresAt;
      const isExpired = Boolean(expiresAt && expiresAt <= now);
      const isEnded = Boolean(roomData.isEnd);
      const isReset = Boolean(roomData.isReset || roomData.status === 'RESET');

      // Safe Purge: If room is marked as RESET, or has 0 members and (isExpired, isEnded, or has no members)
      const hasNoMembers = memberUids.length === 0;
      if (isReset || hasNoMembers || (isExpired && hasNoMembers) || (isEnded && hasNoMembers)) {
        await this.firebaseService.deleteRoomData(code);
        if (this.playerSessionService) {
          this.playerSessionService.clearRoomSession(code);
        }
        roomExists = false;
        roomData = null;
      } else {
        // Room has active players - preserve it!
        roomExists = true;
      }
    }

    let user = this.firebaseService.getCurrentUser();
    if (!user) {
      await this.firebaseService.init();
      user = this.firebaseService.getCurrentUser();
    }

    const members = roomData ? (roomData.members || {}) : {};
    const memberUids = Object.keys(members);
    const maxPlayers = (roomData && roomData.roomSettings && roomData.roomSettings.maxPlayers) ? roomData.roomSettings.maxPlayers : 5;

    // Check persistent session token for returning player recovery
    const sessionToken = this.playerSessionService ? this.playerSessionService.getOrCreateSessionToken(code) : null;
    const savedMember = (roomExists && roomData && roomData.savedMembers && sessionToken) ? roomData.savedMembers[sessionToken] : null;

    // Server-Side Verification: If room does not exist, or room exists but session token is not recognized on server and player UID is not in members:
    if (!roomExists || (sessionToken && !savedMember && (!members || !members[user?.uid]))) {
      if (this.playerSessionService) {
        this.playerSessionService.clearRoomSession(code);
      }
    }

    // Clear any leftover kickedMembers flag on server so kicked player can join fresh
    if (user && roomExists && roomData && roomData.kickedMembers && roomData.kickedMembers[user.uid]) {
      this.firebaseService.clearKickedMember(code, user.uid).catch(() => {});
    }

    // Check if room currently has an active GM (someone other than this user)
    const hasActiveGM = memberUids.some(uid => uid !== user?.uid && members[uid] && members[uid].role === 'game_master');

    return {
      isAllowed: true,
      clientIp,
      roomExists,
      roomData,
      user,
      members,
      memberUids,
      hasActiveGM,
      sessionToken,
      savedMember,
      maxPlayers
    };
  }
}
