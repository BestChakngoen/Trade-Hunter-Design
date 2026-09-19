/**
 * AppLifecycleService - Handles window security, accidental reload/exit protection,
 * and page lifecycle re-verification (visibilitychange, focus, pageshow / BFCache).
 * Adheres to Single Responsibility Principle (SRP).
 */
export class AppLifecycleService {
  constructor({ state, renderer, firebaseService, playerSessionService, onEvicted, onRoomExpired }) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
    this.playerSessionService = playerSessionService;
    this.onEvicted = onEvicted;
    this.onRoomExpired = onRoomExpired;
  }

  /**
   * Prevents accidental navigation, reload shortcuts, and browser back actions.
   */
  bindGlobalProtectionEvents() {
    if (typeof window === 'undefined') return;

    // 1. Prevent accidental reload via keyboard shortcuts (F5, Ctrl+R, Cmd+R)
    window.addEventListener('keydown', async (e) => {
      if ((e.key === 'F5') || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'))) {
        if (this.state.roomCode) {
          e.preventDefault();
          const result = await this.renderer.showConfirmAlert(
            "รีเฟรชหน้าเว็บ?",
            "คุณต้องการโหลดหน้านี้ใหม่หรือไม่? ข้อมูลหรือสถานะการเล่นปัจจุบันอาจมีการเปลี่ยนแปลง",
            "รีเฟรช",
            "ยกเลิก"
          );
          if (result && result.isConfirmed) {
            window.location.reload();
          }
        }
      }
    });

    // 2. Prevent accidental reload / tab close via browser controls
    window.addEventListener('beforeunload', (e) => {
      if (this.state.roomCode) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // 3. Prevent mobile back button / swipe back gesture navigation
    window.addEventListener('popstate', async () => {
      if (this.state.roomCode) {
        window.history.pushState({ page: 'in_game' }, '');
        const res = await this.renderer.showConfirmAlert(
          "ออกจากห้องเกม?",
          "คุณต้องการออกจากห้องเกมนี้ใช่หรือไม่?",
          "ออกจากห้อง",
          "อยู่ในเกมต่อ"
        );
        if (res && res.isConfirmed) {
          const leaveBtn = document.getElementById('leaveRoomBtn');
          if (leaveBtn) {
            leaveBtn.click();
          }
        }
      }
    });
  }

  /**
   * Re-verifies room membership and state when the user returns to the tab or app.
   */
  bindLifecycleReverificationEvents() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const handleReverify = async () => {
      const code = this.state.roomCode;
      if (!code || this.state.role !== 'player') return;

      let user = this.firebaseService.getCurrentUser();
      if (!user) {
        // Allow brief moment for auth token re-establishment after waking from device sleep
        await new Promise(r => setTimeout(r, 350));
        user = this.firebaseService.getCurrentUser();
      }
      const currentUid = user ? user.uid : null;

      try {
        const snap = await this.firebaseService.getRoomStateSnapshot(code);
        if (!snap || !snap.exists()) {
          // Room was deleted or wiped
          if (typeof this.onRoomExpired === 'function') {
            this.onRoomExpired();
          }
          return;
        }

        const roomData = snap.val() || {};
        const isReset = Boolean(roomData.isReset || roomData.status === 'RESET');
        const isKicked = Boolean(currentUid && roomData.kickedMembers && roomData.kickedMembers[currentUid]);
        const members = roomData.members || {};
        const isNotInMembers = currentUid ? !members[currentUid] : false;

        if (isReset || isKicked || isNotInMembers) {
          const kickReason = isKicked ? roomData.kickedMembers[currentUid]?.reason : (isReset ? 'ROOM_RESET' : null);
          if (typeof this.onEvicted === 'function') {
            this.onEvicted({ isReset, isKicked, kickReason, isNotInMembers, code, currentUid });
          }
        }
      } catch (e) {
        console.warn("[AppLifecycleService] Error during lifecycle room re-verification:", e);
      }
    };

    // 1. Tab visibility changes (waking up from device sleep / switching back from another tab or app)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleReverify();
      }
    });

    // 2. Window focus (switching back from another application or desktop window)
    window.addEventListener('focus', () => {
      handleReverify();
    });

    // 3. Page restored from BFCache (Back-Forward Cache)
    window.addEventListener('pageshow', (e) => {
      if (e.persisted || document.visibilityState === 'visible') {
        handleReverify();
      }
    });
  }
}
