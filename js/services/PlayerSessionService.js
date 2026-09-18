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
   * Generates a cryptographically secure token (CSPRNG).
   * @returns {string}
   */
  generateSecureToken() {
    if (typeof crypto !== 'undefined') {
      if (typeof crypto.randomUUID === 'function') {
        return 'st_' + crypto.randomUUID().replace(/-/g, '');
      }
      if (typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return 'st_' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      }
    }
    return 'st_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
  }

  /**
   * Generates or retrieves a unique persistent session token for the given room.
   * @param {string} roomCode 
   * @returns {string} Unique session token
   */
  getOrCreateSessionToken(roomCode) {
    if (!roomCode) return null;
    const key = `${this.storagePrefix}${roomCode.toUpperCase()}`;

    // 1. Check tab-scoped sessionStorage first so independent tabs don't collide
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.sessionToken) {
            return parsed.sessionToken;
          }
        }
      } catch (e) {
        console.warn("[PlayerSessionService] Failed to read sessionStorage:", e);
      }
    }

    // 2. Check localStorage fallback
    const existingSession = this.getRoomSession(roomCode);
    if (existingSession && existingSession.sessionToken) {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        try {
          sessionStorage.setItem(key, JSON.stringify(existingSession));
        } catch (e) {}
      }
      return existingSession.sessionToken;
    }

    // 3. Generate a new secure token
    const newToken = this.generateSecureToken();
    this.saveRoomSession(roomCode, { sessionToken: newToken });
    return newToken;
  }

  /**
   * Retrieves local session data for a specific room.
   * @param {string} roomCode 
   * @returns {Object|null}
   */
  getRoomSession(roomCode) {
    if (typeof window === 'undefined' || !roomCode) return null;
    const key = `${this.storagePrefix}${roomCode.toUpperCase()}`;
    if (window.sessionStorage) {
      try {
        const raw = sessionStorage.getItem(key);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
    }
    if (window.localStorage) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.warn("[PlayerSessionService] Failed to read localStorage:", e);
        return null;
      }
    }
    return null;
  }

  /**
   * Saves local session data for a specific room.
   * @param {string} roomCode 
   * @param {Object} data 
   */
  saveRoomSession(roomCode, data) {
    if (typeof window === 'undefined' || !roomCode) return;
    const rCode = roomCode.toUpperCase();
    const key = `${this.storagePrefix}${rCode}`;
    try {
      const current = this.getRoomSession(roomCode) || {};
      const merged = {
        ...current,
        ...data,
        roomCode: rCode,
        updatedAt: Date.now()
      };
      const serialized = JSON.stringify(merged);
      if (window.sessionStorage) {
        sessionStorage.setItem(key, serialized);
      }
      if (window.localStorage) {
        localStorage.setItem(key, serialized);
        localStorage.setItem('th_last_active_room', rCode);
      }
    } catch (e) {
      console.warn("[PlayerSessionService] Failed to save session:", e);
    }
  }

  /**
   * Clears saved session for a specific room.
   * @param {string} roomCode 
   */
  clearRoomSession(roomCode) {
    if (typeof window === 'undefined' || !roomCode) return;
    const rCode = roomCode.toUpperCase();
    const key = `${this.storagePrefix}${rCode}`;
    try {
      if (window.sessionStorage) {
        sessionStorage.removeItem(key);
      }
      if (window.localStorage) {
        localStorage.removeItem(key);
        if (localStorage.getItem('th_last_active_room') === rCode) {
          localStorage.removeItem('th_last_active_room');
        }
      }
    } catch (e) {
      console.warn("[PlayerSessionService] Failed to clear session:", e);
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
