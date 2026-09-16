/**
 * PlayerSessionService - Manages persistent player sessions across page reloads,
 * disconnects, and accidental exits.
 * 
 * Follows Single Responsibility Principle (SRP):
 * Only responsible for persisting and restoring player session identity and state.
 */
export class PlayerSessionService {
  constructor() {
    this.storagePrefix = 'th_session_';
  }

  /**
   * Generates or retrieves a unique persistent session token for the given room.
   * @param {string} roomCode 
   * @returns {string} Unique session token
   */
  getOrCreateSessionToken(roomCode) {
    if (!roomCode) return null;
    const existingSession = this.getRoomSession(roomCode);
    if (existingSession && existingSession.sessionToken) {
      return existingSession.sessionToken;
    }
    const newToken = 'st_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    this.saveRoomSession(roomCode, { sessionToken: newToken });
    return newToken;
  }

  /**
   * Retrieves local session data for a specific room.
   * @param {string} roomCode 
   * @returns {Object|null}
   */
  getRoomSession(roomCode) {
    if (typeof window === 'undefined' || !window.localStorage || !roomCode) return null;
    try {
      const raw = localStorage.getItem(`${this.storagePrefix}${roomCode.toUpperCase()}`);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn("[PlayerSessionService] Failed to read localStorage:", e);
      return null;
    }
  }

  /**
   * Saves local session data for a specific room.
   * @param {string} roomCode 
   * @param {Object} data 
   */
  saveRoomSession(roomCode, data) {
    if (typeof window === 'undefined' || !window.localStorage || !roomCode) return;
    try {
      const current = this.getRoomSession(roomCode) || {};
      const merged = {
        ...current,
        ...data,
        roomCode: roomCode.toUpperCase(),
        updatedAt: Date.now()
      };
      localStorage.setItem(`${this.storagePrefix}${roomCode.toUpperCase()}`, JSON.stringify(merged));
      localStorage.setItem('th_last_active_room', roomCode.toUpperCase());
    } catch (e) {
      console.warn("[PlayerSessionService] Failed to save localStorage session:", e);
    }
  }

  /**
   * Clears saved session for a specific room.
   * @param {string} roomCode 
   */
  clearRoomSession(roomCode) {
    if (typeof window === 'undefined' || !window.localStorage || !roomCode) return;
    try {
      localStorage.removeItem(`${this.storagePrefix}${roomCode.toUpperCase()}`);
      if (localStorage.getItem('th_last_active_room') === roomCode.toUpperCase()) {
        localStorage.removeItem('th_last_active_room');
      }
    } catch (e) {
      console.warn("[PlayerSessionService] Failed to clear localStorage session:", e);
    }
  }

  /**
   * Gets the last active room code visited on this device.
   * @returns {string|null}
   */
  getLastActiveRoomCode() {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      return localStorage.getItem('th_last_active_room') || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Syncs latest player portfolio & identity to Firebase savedMembers node.
   * @param {string} roomCode 
   * @param {Object} firebaseService 
   * @param {string} sessionToken 
   * @param {Object} memberData 
   */
  async syncPlayerToFirebase(roomCode, firebaseService, sessionToken, memberData) {
    if (!roomCode || !firebaseService || !sessionToken || !memberData) return;
    try {
      const savedPayload = {
        sessionToken,
        displayName: memberData.displayName || 'Player',
        role: memberData.role || 'player',
        portfolio: memberData.portfolio || { cash: 20000 },
        backupPlayerProfile: memberData.backupPlayerProfile || null,
        lastActiveAt: Date.now()
      };
      await firebaseService.saveMemberSnapshot(roomCode, sessionToken, savedPayload);
    } catch (e) {
      console.warn("[PlayerSessionService] Error syncing member snapshot to Firebase:", e);
    }
  }

  /**
   * Fetches saved player profile from Firebase for a sessionToken.
   * @param {string} roomCode 
   * @param {Object} firebaseService 
   * @param {string} sessionToken 
   * @returns {Promise<Object|null>}
   */
  async fetchSavedPlayerFromFirebase(roomCode, firebaseService, sessionToken) {
    if (!roomCode || !firebaseService || !sessionToken) return null;
    try {
      return await firebaseService.getMemberSnapshot(roomCode, sessionToken);
    } catch (e) {
      console.warn("[PlayerSessionService] Error fetching saved player from Firebase:", e);
      return null;
    }
  }
}
