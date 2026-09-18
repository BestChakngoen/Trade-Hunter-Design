/**
 * SessionLockService - Manages single-active-tab & IP lock per machine.
 * Automatically kicks older tabs/sessions when a new tab joins the room on the same machine/IP.
 */
export class SessionLockService {
  constructor() {
    this.sessionId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? 'tab_' + crypto.randomUUID()
      : 'tab_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    this.broadcastChannel = null;
    this.onKickCallback = null;
    this.clientIp = null;
    this.userListenerUnsubscribe = null;
    this.currentRoomCode = null;
    this.currentUserId = null;
    this.isKicked = false;
  }

  /**
   * Initializes BroadcastChannel and storage listeners for same-machine tab synchronization.
   * @param {Function} onKick - Callback executed when this tab is kicked by a newer tab.
   */
  init(onKick) {
    this.onKickCallback = onKick;

    // 1. Setup BroadcastChannel for modern browsers (0-latency intra-browser communication)
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel('trade_hunter_tab_lock');
        this.broadcastChannel.onmessage = (event) => {
          if (event && event.data && event.data.type === 'NEW_SESSION_ACTIVE') {
            const { sessionId, roomCode, newUserId } = event.data;
            // Only kick if it is the SAME room AND the SAME user account
            if (
              sessionId &&
              sessionId !== this.sessionId &&
              this.currentRoomCode &&
              this.currentRoomCode === roomCode &&
              this.currentUserId &&
              newUserId &&
              this.currentUserId === newUserId
            ) {
              this.triggerKick("พบบัญชีนี้เปิดใช้งานในแท็บใหม่ เซสชันในแท็บนี้จึงถูกปิดลงโดยอัตโนมัติ", newUserId);
            }
          }
        };
      } catch (err) {
        console.warn("[SessionLockService] BroadcastChannel unavailable:", err);
      }
    }

    // 2. Setup localStorage storage event listener (cross-window/tab fallback)
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event && event.key && event.key.startsWith('trade_hunter_active_session_') && event.newValue) {
          try {
            const data = JSON.parse(event.newValue);
            // Only kick if it is the SAME room AND the SAME user account
            if (
              data &&
              data.sessionId &&
              data.sessionId !== this.sessionId &&
              this.currentRoomCode &&
              this.currentRoomCode === data.roomCode &&
              this.currentUserId &&
              data.newUserId &&
              this.currentUserId === data.newUserId
            ) {
              this.triggerKick("พบบัญชีนี้เปิดใช้งานในแท็บใหม่ เซสชันในแท็บนี้จึงถูกปิดลงโดยอัตโนมัติ", data.newUserId);
            }
          } catch (e) {
            // ignore parse error
          }
        }
      });
    }
  }

  /**
   * Fetches public IP if needed.
   */
  async fetchPublicIp() {
    if (this.clientIp) return this.clientIp;
    try {
      const res = await Promise.race([
        fetch('https://api.ipify.org?format=json').then(r => r.json()),
        new Promise((_, reject) => setTimeout(() => reject(new Error('IP fetch timeout')), 2500))
      ]);
      if (res && res.ip) {
        this.clientIp = String(res.ip).trim();
      }
    } catch (err) {
      console.warn("[SessionLockService] Public IP detection skipped/timed out:", err.message);
    }
    return this.clientIp;
  }

  /**
   * Registers this tab as the sole active session for the specified user and room.
   * Kicks older tabs on the same machine (BroadcastChannel/localStorage) and older sessions for this user on Firebase.
   * Supports multiple players on the same Wi-Fi network (NAT) without collisions.
   */
  async registerSession(roomCode, firebaseService, userId) {
    this.currentRoomCode = roomCode;
    this.currentUserId = userId;
    this.isKicked = false;

    // 1. Broadcast to same-machine tabs to kick older sessions of the SAME user immediately
    const sessionPayload = {
      type: 'NEW_SESSION_ACTIVE',
      sessionId: this.sessionId,
      roomCode: roomCode,
      newUserId: userId,
      timestamp: Date.now()
    };

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(sessionPayload);
      } catch (e) {
        console.warn("[SessionLockService] Failed to post message:", e);
      }
    }

    try {
      localStorage.setItem(`trade_hunter_active_session_${userId}`, JSON.stringify(sessionPayload));
    } catch (e) {
      console.warn("[SessionLockService] Failed to set localStorage session:", e);
    }

    // 2. User-level session locking via Firebase Realtime Database
    if (firebaseService && roomCode && userId) {
      try {
        this.cleanupUserListener();

        if (typeof firebaseService.registerUserSession === 'function') {
          await firebaseService.registerUserSession(roomCode, userId, this.sessionId);

          this.userListenerUnsubscribe = firebaseService.listenToUserSession(roomCode, userId, (data) => {
            if (
              data && 
              data.sessionId && 
              data.sessionId !== this.sessionId && 
              this.currentUserId && 
              data.userId === this.currentUserId && 
              !this.isKicked
            ) {
              this.triggerKick("พบการเข้าเล่นจากแท็บหรืออุปกรณ์ใหม่ด้วยบัญชีนี้ เซสชันในแท็บนี้ถูกปิดลงโดยอัตโนมัติ", data.userId);
            }
          });
        }
      } catch (err) {
        console.warn("[SessionLockService] Firebase user session registration error:", err);
      }
    }
  }

  /**
   * Triggers the kick callback and cleans up session state.
   */
  triggerKick(reason, newUserId = null) {
    if (this.isKicked) return;
    this.isKicked = true;
    this.cleanup();
    if (typeof this.onKickCallback === 'function') {
      this.onKickCallback(reason, newUserId);
    }
  }

  cleanupUserListener() {
    if (typeof this.userListenerUnsubscribe === 'function') {
      try {
        this.userListenerUnsubscribe();
      } catch (e) {
        // ignore
      }
      this.userListenerUnsubscribe = null;
    }
  }

  cleanup() {
    this.currentRoomCode = null;
    this.currentUserId = null;
    this.cleanupUserListener();
  }
}
