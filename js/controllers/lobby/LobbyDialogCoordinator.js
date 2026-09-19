/**
 * LobbyDialogCoordinator - Dedicated coordinator for interactive lobby promise-based modal dialogs:
 * Role selection, Player Name entry, Game Mode selection, and Waiting for GM.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class LobbyDialogCoordinator {
  constructor(renderer, firebaseService, state = null, playerSessionService = null) {
    this.renderer = renderer;
    this.firebaseService = firebaseService;
    this.state = state;
    this.playerSessionService = playerSessionService;
  }

  /**
   * Prompts user to select role (GM or Player) when entering an unclaimed room.
   * Auto-resolves to 'player' if another user claims GM while dialog is open.
   * @param {string} code 
   * @returns {Promise<'game_master'|'player'|null>}
   */
  async promptRoleSelection(code) {
    if (typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    const modal = this.renderer.roleSelectionModal;
    const btnGM = this.renderer.roleOptGMBtn;
    const btnPlayer = this.renderer.roleOptPlayerBtn;
    const btnClose = this.renderer.roleOptCloseBtn;

    if (!modal || !btnGM || !btnPlayer || !btnClose) {
      if (typeof confirm !== 'undefined') {
        const choice = confirm("กด OK เพื่อเลือกเป็น GM หรือ Cancel เพื่อเลือกเป็น Player");
        return choice ? 'game_master' : 'player';
      }
      return 'player';
    }

    return new Promise((resolve) => {
      modal.style.display = 'flex';
      let roomUnsub = null;

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          handleClose();
        }
      };

      const cleanup = () => {
        if (typeof roomUnsub === 'function') {
          roomUnsub();
          roomUnsub = null;
        }
        document.removeEventListener('keydown', handleKeyDown);
        btnGM.removeEventListener('click', handleGM);
        btnPlayer.removeEventListener('click', handlePlayer);
        btnClose.removeEventListener('click', handleClose);
      };

      const handleGM = () => {
        cleanup();
        modal.style.display = 'none';
        resolve('game_master');
      };

      const handlePlayer = () => {
        cleanup();
        modal.style.display = 'none';
        resolve('player');
      };

      const handleClose = () => {
        cleanup();
        modal.style.display = 'none';
        resolve(null);
      };

      document.addEventListener('keydown', handleKeyDown);
      btnGM.addEventListener('click', handleGM);
      btnPlayer.addEventListener('click', handlePlayer);
      btnClose.addEventListener('click', handleClose);

      // Realtime Listener: Auto-dismiss modal if someone claims GM in this room code while modal is open
      if (code) {
        roomUnsub = this.firebaseService.listenToRoom(code, (roomData) => {
          if (roomData && roomData.members) {
            const hasGM = Object.values(roomData.members).some(m => m && m.role === 'game_master');
            if (hasGM) {
              cleanup();
              modal.style.display = 'none';
              resolve('player');
            }
          }
        });
      }
    });
  }

  /**
   * Prompts user to input their player display name with duplicate and length validation.
   * @param {string} code 
   * @param {string} defaultName 
   * @param {Set<string>} existingNames 
   * @returns {Promise<string|null>}
   */
  promptPlayerNameSelection(code, defaultName, existingNames = new Set()) {
    const modal = this.renderer.playerNameModal;
    const input = this.renderer.playerNameInput;
    const btnConfirm = this.renderer.playerNameConfirmBtn;
    const btnClose = this.renderer.playerNameCloseBtn;

    if (!modal || !input || !btnConfirm) {
      return Promise.resolve(defaultName);
    }

    return new Promise((resolve) => {
      let savedName = '';
      try {
        if (typeof localStorage !== 'undefined') {
          savedName = localStorage.getItem('traderHunter_playerName') || '';
        }
      } catch (e) {}

      let initialVal = defaultName;
      if (savedName && savedName.trim() && !existingNames.has(savedName.trim())) {
        initialVal = savedName.trim();
      }

      this.renderer.showPlayerNameModal({
        title: "ตั้งชื่อผู้เล่นของคุณ",
        subtitle: "โปรดระบุชื่อที่ต้องการใช้แสดงในห้องเกม (1 - 20 ตัวอักษร)",
        confirmText: "เข้าสู่เกม",
        initialValue: initialVal
      });

      const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleConfirm();
        } else if (e.key === 'Escape') {
          handleClose();
        }
      };

      const handleOverlayClick = (e) => {
        if (e.target === modal) {
          handleClose();
        }
      };

      const cleanup = () => {
        document.removeEventListener('keydown', handleKeyDown);
        btnConfirm.removeEventListener('click', handleConfirm);
        if (btnClose) btnClose.removeEventListener('click', handleClose);
        modal.removeEventListener('click', handleOverlayClick);
      };

      const handleConfirm = () => {
        const raw = (input.value || '').trim();
        if (!raw) {
          this.renderer.showPlayerNameError("กรุณากรอกชื่อผู้เล่น");
          return;
        }
        if (raw.length < 1 || raw.length > 20) {
          this.renderer.showPlayerNameError("ความยาวชื่อต้องอยู่ระหว่าง 1 - 20 ตัวอักษร");
          return;
        }
        const upper = raw.toUpperCase();
        if (upper === 'GM' || upper === 'GAME MASTER' || upper === 'GAME_MASTER') {
          this.renderer.showPlayerNameError("สงวนสิทธิ์ห้ามใช้ชื่อ GM หรือ Game Master");
          return;
        }
        if (existingNames.has(raw)) {
          this.renderer.showPlayerNameError(`ชื่อ "${raw}" มีผู้เล่นอื่นในห้องใช้อยู่แล้ว โปรดตั้งชื่ออื่น`);
          return;
        }

        cleanup();
        this.renderer.hidePlayerNameModal();
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('traderHunter_playerName', raw);
          }
        } catch (e) {}
        resolve(raw);
      };

      const handleClose = () => {
        cleanup();
        this.renderer.hidePlayerNameModal();
        resolve(null);
      };

      document.addEventListener('keydown', handleKeyDown);
      btnConfirm.addEventListener('click', handleConfirm);
      if (btnClose) btnClose.addEventListener('click', handleClose);
      modal.addEventListener('click', handleOverlayClick);
    });
  }

  /**
   * Prompts Game Master to select Game Mode (Basic or Advance).
   * @param {string} roomCode 
   * @param {string} currentUid 
   * @returns {Promise<'basic'|'advance'>}
   */
  async promptGameModeSelection(roomCode, currentUid) {
    const modal = this.renderer.gameModeSelectionModal;
    const btnBasic = this.renderer.gameModeBasicBtn;
    const btnAdvance = this.renderer.gameModeAdvanceBtn;
    const btnClose = this.renderer.gameModeCloseBtn;

    if (!modal || !btnBasic || !btnAdvance) {
      return 'advance';
    }

    return new Promise((resolve, reject) => {
      modal.style.display = 'flex';

      const handleBasic = () => {
        cleanup();
        modal.style.display = 'none';
        resolve('basic');
      };

      const handleAdvance = () => {
        cleanup();
        modal.style.display = 'none';
        resolve('advance');
      };

      const handleClose = async () => {
        cleanup();
        modal.style.display = 'none';
        if (roomCode) {
          try {
            await this.firebaseService.deleteRoomData(roomCode);
          } catch (e) {
            console.warn("Could not delete room on GM cancel game mode:", e);
          }
        }
        reject(new Error('GM_CANCELLED_GAME_MODE'));
      };

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          handleClose();
        }
      };

      const cleanup = () => {
        document.removeEventListener('keydown', handleKeyDown);
        btnBasic.removeEventListener('click', handleBasic);
        btnAdvance.removeEventListener('click', handleAdvance);
        if (btnClose) btnClose.removeEventListener('click', handleClose);
      };

      document.addEventListener('keydown', handleKeyDown);
      btnBasic.addEventListener('click', handleBasic);
      btnAdvance.addEventListener('click', handleAdvance);
      if (btnClose) btnClose.addEventListener('click', handleClose);
    });
  }

  /**
   * Displays waiting screen for players while GM selects the game mode.
   * Provides emergency Room Reset option if GM disconnected.
   * @param {string} code 
   * @returns {Promise<string>}
   */
  async waitForGameModeSelection(code) {
    const modal = this.renderer.waitingForGMModal;
    const closeBtn = this.renderer.waitingCloseBtn;
    const resetBtn = this.renderer.waitingResetRoomBtn;
    if (modal) modal.style.display = 'flex';
    this.renderer.updateRoomCodeDisplay(code);

    return new Promise((resolve, reject) => {
      let unsub = null;

      const cleanup = () => {
        if (typeof unsub === 'function') {
          unsub();
          unsub = null;
        }
        if (closeBtn) {
          closeBtn.removeEventListener('click', handleClose);
        }
        if (resetBtn) {
          resetBtn.removeEventListener('click', handleResetRoom);
        }
        if (modal) modal.style.display = 'none';
      };

      const checkMode = (roomVal) => {
        if (!roomVal) {
          cleanup();
          reject(new Error('USER_CANCELLED_WAITING'));
          return;
        }
        const mode = roomVal?.roomSettings?.gameMode;
        if (mode) {
          cleanup();
          resolve(mode);
        }
      };

      const handleClose = async () => {
        cleanup();
        const currentUser = this.firebaseService.getCurrentUser();
        if (code && currentUser?.uid) {
          try {
            await this.firebaseService.removeMemberFromRoom(code, currentUser.uid);
            const roomSnap = await this.firebaseService.getRoomStateSnapshot(code);
            const roomData = roomSnap ? roomSnap.val() : null;
            const remainingMembers = roomData ? (roomData.members || {}) : {};
            if (Object.keys(remainingMembers).length === 0) {
              await this.firebaseService.deleteRoomData(code);
            }
          } catch (e) {
            console.warn("Could not remove member on cancel waiting:", e);
          }
        }
        if (this.playerSessionService && code) {
          const token = this.playerSessionService.getOrCreateSessionToken(code);
          if (token) {
            try {
              await this.firebaseService.updateRoom(code, {
                [`savedMembers/${token}`]: null
              });
            } catch (e) {}
          }
          this.playerSessionService.clearRoomSession(code);
        }
        reject(new Error('USER_CANCELLED_WAITING'));
      };

      const handleResetRoom = async () => {
        const confirmed = await this.renderer.showConfirmAlert(
          "รีเซ็ตห้องเกมทั้งหมด?",
          "คุณต้องการล้างข้อมูลห้องเกมนี้ทั้งหมดใช่หรือไม่? ข้อมูลผู้เล่น คำสั่งซื้อขาย และสถานะ GM เดิมที่ค้างอยู่จะถูกล้างทิ้งทั้งหมด เพื่อเริ่มต้นเซสชันใหม่",
          "รีเซ็ตห้อง",
          "ยกเลิก"
        );
        if (!confirmed) return;

        cleanup();

        try {
          const resetStocks = this.state && this.state.getResetStocks ? this.state.getResetStocks() : null;
          await this.firebaseService.resetRoomWithKickAll(code, resetStocks);
          await this.firebaseService.deleteRoomData(code);
        } catch (e) {
          console.error("Failed to reset room data from waiting modal:", e);
        }

        const currentUser = this.firebaseService.getCurrentUser();
        if (code && currentUser?.uid) {
          try {
            await this.firebaseService.removeMemberFromRoom(code, currentUser.uid);
          } catch (e) {}
        }
        if (this.playerSessionService && code) {
          this.playerSessionService.clearRoomSession(code);
        }
        if (this.state) {
          this.state.reset();
        }

        this.renderer.showLobby();
        this.renderer.showTopToast(
          "ROOM RESET SUCCESS",
          "รีเซ็ตห้องเกมสำเร็จ คุณสามารถกด JOIN ด้วยรหัสห้องเดิมเพื่อเลือกบทบาท GM และเริ่มเกมใหม่ได้ทันที",
          "approved",
          5000
        );

        reject(new Error('USER_RESET_ROOM'));
      };

      if (closeBtn) {
        closeBtn.addEventListener('click', handleClose);
      }
      if (resetBtn) {
        resetBtn.addEventListener('click', handleResetRoom);
      }

      unsub = this.firebaseService.listenToRoom(code, (data) => {
        checkMode(data);
      });
    });
  }
}
