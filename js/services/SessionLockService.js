/**
 * SessionLockService - Manages single-active-tab & IP lock per machine.
 * Automatically kicks older tabs/sessions when a new tab joins the room on the same machine/IP.
 */
export class SessionLockService {
  constructor() {
    this.sessionId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    this.broadcastChannel = null;
    this.onKickCallback = null;
    this.clientIp = null;
    this.ipListenerUnsubscribe = null;
    this.currentRoomCode = null;
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
            if (sessionId && sessionId !== this.sessionId && this.currentRoomCode && this.currentRoomCode === roomCode) {
              this.triggerKick("มีการเข้าเล่นจากแท็บใหม่ในเครื่องนี้ เซสชันของแท็บนี้ถูกปิดลงโดยอัตโนมัติ", newUserId);
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
        if (event && event.key === 'trade_hunter_active_session' && event.newValue) {
          try {
            const data = JSON.parse(event.newValue);
            if (data && data.sessionId && data.sessionId !== this.sessionId && this.currentRoomCode && this.currentRoomCode === data.roomCode) {
              this.triggerKick("มีการเข้าเล่นจากแท็บใหม่ในเครื่องนี้ เซสชันของแท็บนี้ถูกปิดลงโดยอัตโนมัติ", data.newUserId);
            }
          } catch (e) {
            // ignore parse error
          }
        }
      });
    }
  }

  /**
   * Fetches public IP with a fast timeout (2.5s) to support cross-browser IP locking.
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
   * Registers this tab as the sole active session for the specified room.
   * Kicks any other tab on the same machine and registers on Firebase Realtime DB by IP.
   */
  async registerSession(roomCode, firebaseService, userId) {
    this.currentRoomCode = roomCode;
    this.isKicked = false;

    // 1. Broadcast to same-machine tabs to kick older sessions immediately
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
      localStorage.setItem('trade_hunter_active_session', JSON.stringify(sessionPayload));
    } catch (e) {
      console.warn("[SessionLockService] Failed to set localStorage session:", e);
    }

    // 2. Cross-browser / IP-level locking via Firebase Realtime Database
    if (firebaseService && roomCode) {
      try {
        const ip = await this.fetchPublicIp();
        if (ip) {
          const sanitizedIp = ip.replace(/[.#$[\]]/g, '_');
          
          // Cleanup prior listener if any
          this.cleanupIpListener();

          // Register this session on Firebase under room ipSessions
          await firebaseService.registerIpSession(roomCode, sanitizedIp, this.sessionId, userId);

          // Listen to changes in this IP node; if a newer session overrides it, kick this tab
          this.ipListenerUnsubscribe = firebaseService.listenToIpSession(roomCode, sanitizedIp, (data) => {
            if (data && data.sessionId && data.sessionId !== this.sessionId && !this.isKicked) {
              this.triggerKick("พบการเข้าเล่นจากแท็บหรือเบราว์เซอร์ใหม่บนเครื่อง/IP เดียวกัน เซสชันในแท็บนี้ถูกปิดลงโดยอัตโนมัติ", data.userId);
            }
          });
        }
      } catch (err) {
        console.warn("[SessionLockService] Firebase IP registration error:", err);
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

  cleanupIpListener() {
    if (typeof this.ipListenerUnsubscribe === 'function') {
      try {
        this.ipListenerUnsubscribe();
      } catch (e) {
        // ignore
      }
      this.ipListenerUnsubscribe = null;
    }
  }

  cleanup() {
    this.currentRoomCode = null;
    this.cleanupIpListener();
  }
}
