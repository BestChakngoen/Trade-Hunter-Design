import { PlayerSessionService } from '../services/PlayerSessionService.js';
import { LobbyInputHandler } from './lobby/LobbyInputHandler.js';
import { LobbySessionCoordinator } from './lobby/LobbySessionCoordinator.js';
import { RoomSetupService } from './lobby/RoomSetupService.js';
import { LobbyDialogCoordinator } from './lobby/LobbyDialogCoordinator.js';

/**
 * LobbyController - Manages Game Room Joining, Creation, and Player Role Initialization.
 * Refactored into a high-level facade coordinating input UX, session recovery, room setup, and dialogs.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class LobbyController {
  constructor(state, renderer, firebaseService, sessionLockService = null, playerSessionService = null) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
    this.sessionLockService = sessionLockService;
    this.playerSessionService = playerSessionService || new PlayerSessionService();
    this.isSubmitting = false;

    // Specialized Sub-modules (Extracted in Phases 4 & C)
    this.inputHandler = new LobbyInputHandler(this.renderer, this.playerSessionService);
    this.sessionCoordinator = new LobbySessionCoordinator(this.firebaseService, this.sessionLockService, this.playerSessionService);
    this.roomSetupService = new RoomSetupService(this.state, this.renderer, this.firebaseService, this.sessionLockService, this.playerSessionService);
    this.dialogCoordinator = new LobbyDialogCoordinator(this.renderer, this.firebaseService, this.state, this.playerSessionService);
  }

  /**
   * Binds the Lobby Form submission and input events.
   * @param {Function} onJoinSuccess - Callback invoked when room join/creation succeeds.
   */
  bindLobbyEntrance(onJoinSuccess) {
    this.inputHandler.bindInputEvents();

    if (!this.renderer.lobbyForm) return;

    this.renderer.lobbyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (this.isSubmitting) return;

      const code = this.renderer.roomCodeInput ? this.renderer.roomCodeInput.value.trim().toUpperCase() : '';
      if (!code) {
        if (typeof this.renderer.triggerShakeCodeBox === 'function') {
          this.renderer.triggerShakeCodeBox();
        }
        return;
      }

      this.isSubmitting = true;

      const form = this.renderer.lobbyForm;
      const btn = this.renderer.joinRoomBtn;
      const indicator = this.renderer.lobbyCheckingIndicator || document.getElementById('lobbyCheckingIndicator');

      if (form) {
        form.classList.add('is-checking');
      }

      // Hide join button and show dedicated animated checking indicator
      if (btn) {
        btn.disabled = true;
        btn.classList.add('is-checking');
        btn.style.setProperty('display', 'none', 'important');
      }
      if (indicator) {
        indicator.style.setProperty('display', 'flex', 'important');
      }

      try {
        const joinResult = await this.joinOrCreateRoom(code);
        if (joinResult && typeof onJoinSuccess === 'function') {
          onJoinSuccess(code);
        }
      } catch (err) {
        if (err && (err.message === 'USER_CANCELLED_WAITING' || err.message === 'USER_RESET_ROOM')) {
          console.log("[Lobby] User cancelled or reset room from waiting screen.");
          return;
        }
        console.error("Lobby join error:", err);
        this.clearLobbyRoomCodeInput();
        this.renderer.showErrorAlert("เกิดข้อผิดพลาด", err.message || "ไม่สามารถระบุการเชื่อมต่อห้องเกมได้");
      } finally {
        this.isSubmitting = false;
        if (form) {
          form.classList.remove('is-checking');
        }
        if (indicator) {
          indicator.style.setProperty('display', 'none', 'important');
        }
        if (btn) {
          btn.classList.remove('is-checking');
          btn.style.removeProperty('display');
          btn.disabled = false;
        }
      }
    });
  }

  // --- Backward Compatibility Proxies ---
  updateRoomCodeSlots(val = '', isFocused = null) {
    this.inputHandler.updateRoomCodeSlots(val, isFocused);
  }

  clearLobbyRoomCodeInput() {
    this.inputHandler.clearLobbyRoomCodeInput();
  }

  withTimeout(promise, timeoutMs, errorMessage) {
    return this.sessionCoordinator.withTimeout(promise, timeoutMs, errorMessage);
  }

  // --- Dialog Coordinator Proxies (Backward Compatibility) ---
  async promptRoleSelection(code) {
    return this.dialogCoordinator.promptRoleSelection(code);
  }

  promptPlayerNameSelection(code, defaultName, existingNames = new Set()) {
    return this.dialogCoordinator.promptPlayerNameSelection(code, defaultName, existingNames);
  }

  async promptGameModeSelection(roomCode, currentUid) {
    return this.dialogCoordinator.promptGameModeSelection(roomCode, currentUid);
  }

  async waitForGameModeSelection(code) {
    return this.dialogCoordinator.waitForGameModeSelection(code);
  }

  async joinOrCreateRoom(code) {
    // 0. Reset local state before any new room entrance
    this.state.reset();

    // 1. Inspect room and session in Firebase
    const sessionInfo = await this.sessionCoordinator.inspectRoomAndSession(code);
    if (!sessionInfo.isAllowed) {
      this.clearLobbyRoomCodeInput();
      if (sessionInfo.reason === 'ROOM_RESET') {
        this.renderer.showErrorAlert(
          "ห้องเกมได้รับการรีเซ็ต",
          sessionInfo.message || "ห้องเกมนี้ถูกรีเซ็ตข้อมูลทั้งหมดโดย GM ระบบได้นำผู้เล่นทุกคนกลับสู่หน้าล็อบบี้แล้ว"
        );
      } else if (sessionInfo.reason === 'GM_KICKED') {
        this.renderer.showErrorAlert(
          "ถูกให้ออกจากห้อง",
          sessionInfo.message || "คุณถูกผู้ดูแลห้อง (GM) บังคับให้ออกจากห้องเกม และข้อมูลการเล่นทั้งหมดของคุณถูกรีเซ็ตเรียบร้อยแล้ว"
        );
      } else {
        if (typeof this.renderer.triggerShakeCodeBox === 'function') {
          this.renderer.triggerShakeCodeBox();
        }
        if (typeof this.renderer.showInvalidRoomModal === 'function') {
          await this.renderer.showInvalidRoomModal(code);
        }
      }
      this.clearLobbyRoomCodeInput();
      return false;
    }

    const {
      clientIp,
      roomExists,
      roomData,
      user,
      members,
      hasActiveGM,
      sessionToken,
      savedMember,
      maxPlayers
    } = sessionInfo;

    let role = null;
    let displayName = null;
    let restoredPortfolio = null;
    let restoredBackupProfile = null;
    let isRestoredPlayer = false;

    // 2. Resolve Role & Player Name
    const existingMemberByToken = sessionToken 
      ? Object.values(members || {}).find(m => m && m.sessionToken === sessionToken) 
      : null;
    const isReturningPlayer = (savedMember && savedMember.role === 'player') ||
      (members[user.uid] && members[user.uid].role === 'player') ||
      (existingMemberByToken && existingMemberByToken.role === 'player');

    if (isReturningPlayer) {
      role = 'player';
      const sourceMember = (members[user.uid] && members[user.uid].role === 'player')
        ? members[user.uid]
        : (existingMemberByToken || savedMember);
      displayName = sourceMember.displayName || 'Player';
      restoredPortfolio = sourceMember.portfolio || { cash: 20000 };
      restoredBackupProfile = sourceMember.backupPlayerProfile || null;
      isRestoredPlayer = true;
    } else if (!hasActiveGM) {
      role = await this.promptRoleSelection(code);
      if (!role) return false;

      if (role === 'game_master') {
        displayName = 'GM';
        const prevPlayerProfile = (savedMember && savedMember.portfolio)
          ? savedMember
          : (members[user.uid] && members[user.uid].portfolio ? members[user.uid] : null);
        if (prevPlayerProfile) {
          restoredBackupProfile = {
            displayName: prevPlayerProfile.displayName || 'Player',
            portfolio: prevPlayerProfile.portfolio
          };
        }
      } else {
        const existingNames = new Set(
          Object.values(members || {})
            .filter(m => m && m.role === 'player' && m.displayName)
            .map(m => m.displayName)
        );
        let nextIndex = 1;
        while (existingNames.has(`Player_${nextIndex}`)) {
          nextIndex++;
        }
        const defaultName = `Player_${nextIndex}`;
        displayName = await this.promptPlayerNameSelection(code, defaultName, existingNames);
        if (!displayName) return false;
      }
    } else {
      role = 'player';
      const existingNames = new Set(
        Object.values(members || {})
          .filter(m => m && m.role === 'player' && m.displayName)
          .map(m => m.displayName)
      );
      let nextIndex = 1;
      while (existingNames.has(`Player_${nextIndex}`)) {
        nextIndex++;
      }
      const defaultName = `Player_${nextIndex}`;
      displayName = await this.promptPlayerNameSelection(code, defaultName, existingNames);
      if (!displayName) return false;
    }

    // 3. Setup or Join Room via RoomSetupService
    const setupResult = await this.roomSetupService.setupOrJoinRoom({
      code,
      role,
      displayName,
      restoredPortfolio,
      restoredBackupProfile,
      sessionToken,
      clientIp,
      roomExists,
      roomData,
      members,
      maxPlayers,
      user
    });

    if (!setupResult) return false;
    const { finalRole, finalDisplayName } = setupResult;

    if (isRestoredPlayer) {
      this.renderer.showTopToast("DATA RESTORED", `โหลดข้อมูลเดิมของ ${finalDisplayName} เรียบร้อยแล้ว`, "success");
    }

    // 4. Game Mode Selection (Now GM is registered in Firebase)
    const freshSnap = await this.firebaseService.getRoomStateSnapshot(code);
    const freshRoomData = freshSnap && freshSnap.exists() ? freshSnap.val() : null;
    let gameMode = (freshRoomData && freshRoomData.roomSettings && freshRoomData.roomSettings.gameMode) ? freshRoomData.roomSettings.gameMode : null;

    if (!gameMode) {
      if (finalRole === 'game_master') {
        try {
          gameMode = await this.promptGameModeSelection(code, user.uid);
          if (!gameMode) gameMode = 'advance';
          await this.firebaseService.setRoomGameMode(code, gameMode);
        } catch (err) {
          if (err && err.message === 'GM_CANCELLED_GAME_MODE') {
            this.renderer.showLobby();
            return false;
          }
          throw err;
        }
      } else {
        try {
          gameMode = await this.waitForGameModeSelection(code);
        } catch (err) {
          if (err && (err.message === 'USER_CANCELLED_WAITING' || err.message === 'USER_RESET_ROOM')) {
            this.renderer.showLobby();
            return false;
          }
          throw err;
        }
      }
    }

    this.state.setGameMode(gameMode);
    this.state.setRoomCode(code);
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState({ page: 'in_game' }, '');
    }

    // 5. Register session lock and cleanup listeners
    await this.roomSetupService.registerSessionLock(code, user.uid);
    this.roomSetupService.configureDisconnectCleanup(code, user.uid, finalRole === 'game_master');
    await this.roomSetupService.syncLateJoinerBoard(code);

    // 6. Transition screens and activate UI state
    this.renderer.showDashboard();
    
    if (this.renderer.roleController) {
      this.renderer.roleController.style.display = 'flex';
    }
    if (this.renderer.spectatorToggleBtn) {
      this.renderer.spectatorToggleBtn.style.display = (this.state.role === 'game_master') ? 'block' : 'none';
    }
    this.state.isSpectating = false;
    this.renderer.updateSpectatorButtonUI(false);
    
    this.renderer.updateControlsVisibility(this.state.role, finalDisplayName, this.state.gameMode);
    this.renderer.updateRoomCodeDisplay(code);

    const stats = this.state.getPortfolioStats();
    this.renderer.updatePortfolioUI(stats, this.state.portfolio, this.state.boardStocks, this.state.pendingOrders, user.uid);
    return true;
  }
}
