/**
 * LobbyController - Manages Game Room Joining, Creation, and Player Role Initialization.
 */
export class LobbyController {
  constructor(state, renderer, firebaseService) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
    this.isSubmitting = false;
  }

  bindLobbyEntrance(onJoinSuccess) {
    if (!this.renderer.lobbyForm) return;

    this.renderer.lobbyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (this.isSubmitting) return;

      const code = this.renderer.roomCodeInput.value.trim().toUpperCase();
      if (!code) return;

      this.isSubmitting = true;
      const btn = this.renderer.joinRoomBtn;
      let originalBtnHtml = '';
      if (btn) {
        originalBtnHtml = btn.innerHTML;
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.style.cursor = 'not-allowed';
        btn.innerHTML = `<span class="flex items-center justify-center gap-2"><svg class="animate-spin h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> CHECKING...</span>`;
      }

      try {
        await this.joinOrCreateRoom(code);
        if (typeof onJoinSuccess === 'function') {
          onJoinSuccess(code);
        }
      } catch (err) {
        console.error("Lobby join error:", err);
        this.renderer.showErrorAlert("เกิดข้อผิดพลาด", err.message || "ไม่สามารถระบุการเชื่อมต่อห้องเกมได้");
      } finally {
        this.isSubmitting = false;
        if (btn) {
          btn.disabled = false;
          btn.style.opacity = '1';
          btn.style.cursor = 'pointer';
          if (originalBtnHtml) {
            btn.innerHTML = originalBtnHtml;
          }
        }
      }
    });
  }

  async promptRoleSelection() {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    const modal = this.renderer.roleSelectionModal;
    const btnGM = this.renderer.roleOptGMBtn;
    const btnPlayer = this.renderer.roleOptPlayerBtn;
    const btnCancel = this.renderer.roleOptCancelBtn;

    if (!modal || !btnGM || !btnPlayer || !btnCancel) {
      const choice = confirm("กด OK เพื่อเลือกเป็น GM หรือ Cancel เพื่อเลือกเป็น Player");
      return choice ? 'game_master' : 'player';
    }

    return new Promise((resolve) => {
      modal.style.display = 'flex';

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

      const handleCancel = () => {
        cleanup();
        modal.style.display = 'none';
        resolve(null);
      };

      const cleanup = () => {
        btnGM.removeEventListener('click', handleGM);
        btnPlayer.removeEventListener('click', handlePlayer);
        btnCancel.removeEventListener('click', handleCancel);
      };

      btnGM.addEventListener('click', handleGM);
      btnPlayer.addEventListener('click', handlePlayer);
      btnCancel.addEventListener('click', handleCancel);
    });
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

  async joinOrCreateRoom(code) {
    // 0. Reset local state before any new room entrance
    this.state.reset();

    // 1. Verify if the code is permitted in Firestore
    const isAllowed = await this.withTimeout(
      this.firebaseService.checkRoomExists(code),
      8000,
      "หมดเวลาการเชื่อมต่อกับเซิร์ฟเวอร์ (Firestore Timeout)"
    );
    if (!isAllowed) {
      this.renderer.showErrorAlert(
        "รหัสไม่ถูกต้อง",
        "กรุณาตรวจสอบรหัสห้อง หรือติดต่อผู้ดูแลระบบได้ที่ Findice.edu@gmail.com"
      );
      return;
    }

    const now = Date.now();

    // 2. Fetch room status & inspect stale/expired state from Firebase Realtime Database
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

      // Check if room has stale members joined > 3.5 hours ago
      const hasStaleMembers = memberUids.some(uid => {
        const joinedAt = members[uid] ? members[uid].joinedAt : 0;
        return joinedAt && (now - joinedAt > 3.5 * 60 * 60 * 1000);
      });

      // Purge abandoned, expired, ended, or stale rooms completely!
      if (memberUids.length === 0 || isExpired || isEnded || hasStaleMembers) {
        await this.firebaseService.deleteRoomData(code);
        roomExists = false;
        roomData = null;
      } else {
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

    // Determine user role and display name
    let role = null;
    let displayName = null;

    if (roomExists && members[user.uid]) {
      // Re-joining player uses their existing role and name
      role = members[user.uid].role;
      displayName = members[user.uid].displayName || (role === 'game_master' ? 'GM' : 'Player_1');
    } else {
      // Check max capacity if room already exists
      const maxPlayers = (roomData && roomData.roomSettings && roomData.roomSettings.maxPlayers) ? roomData.roomSettings.maxPlayers : 10;
      if (roomExists && !members[user.uid] && memberUids.length >= maxPlayers) {
        await this.renderer.showRoomFullModal();
        return;
      }

      // Check if room already has GM
      const hasGM = memberUids.some(uid => members[uid] && members[uid].role === 'game_master');
      if (hasGM) {
        // Automatic assignment to Player if GM is already present
        role = 'player';
      } else {
        // No GM present -> Ask user to select role
        role = await this.promptRoleSelection();
        if (!role) {
          return;
        }
      }

      if (role === 'game_master') {
        displayName = 'GM';
      } else {
        const existingPlayersCount = memberUids.filter(uid => members[uid] && members[uid].role === 'player').length;
        displayName = `Player_${existingPlayersCount + 1}`;
      }
    }

    // 3. Initialize state parameters
    this.state.setRoomCode(code);

    // Fetch Master Settings from Firestore
    const gameSetting = await this.withTimeout(
      this.firebaseService.getGameSetting(),
      8000,
      "หมดเวลาการดึงข้อมูลการตั้งค่าเกม (getGameSetting Timeout)"
    );
    this.state.setMasterStocks(gameSetting.stocks);

    // 4. Create or Join logic
    const maxPlayers = (roomData && roomData.roomSettings && roomData.roomSettings.maxPlayers) ? roomData.roomSettings.maxPlayers : 10;

    if (!roomExists) {
      // Build initial board configuration from master steps
      const initialBoardStocks = gameSetting.stocks.map(s => {
        const startValue = s.steps[s.startStep - 1];
        return {
          name: s.name,
          value: startValue,
          step: s.startStep - 1,
          maxStep: s.steps.length,
          startStep: s.startStep - 1,
          oldValue: null,
          history: [startValue],
          updatedAt: null
        };
      });

      // Create fresh board state
      await this.firebaseService.createBoard(code, initialBoardStocks);

      // Create fresh room state with 3-hour expiration timestamp
      const expiresAt = now + (3 * 60 * 60 * 1000);
      const initialMemberObj = {
        role: role,
        displayName: displayName,
        joinedAt: now
      };
      if (role === 'player') {
        initialMemberObj.portfolio = { cash: 20000 };
      }

      await this.firebaseService.createRoom(code, gameSetting.roomSettings, {
        [user.uid]: initialMemberObj
      });
      await this.firebaseService.updateRoom(code, { expiresAt });

      this.state.setRole(role);
      this.state.setPlayerName(displayName);
    } else {
      if (members[user.uid]) {
        // Re-joining player
        if (!members[user.uid].portfolio && role === 'player') {
          await this.firebaseService.updateRoom(code, {
            [`members/${user.uid}/portfolio`]: {
              cash: 20000
            }
          });
        }
      } else {
        // Atomic transaction to handle high concurrency joining
        const txnResult = await this.firebaseService.joinRoomWithTransaction(code, {
          uid: user.uid,
          role: role,
          displayName: displayName
        }, maxPlayers);

        if (!txnResult || !txnResult.committed) {
          await this.renderer.showRoomFullModal();
          return;
        }
      }

      this.state.setRole(role);
      this.state.setPlayerName(displayName);
    }

    // Configure player cleanup on disconnect
    this.firebaseService.configureDisconnectCleanup(code, user.uid);

    // Sync latest board snapshot immediately for late-joining players
    try {
      const boardSnap = await this.firebaseService.getBoardSnapshot(code);
      if (boardSnap && boardSnap.exists()) {
        this.state.updateFromFirebaseBoard(boardSnap.val());
      }
    } catch (e) {
      console.warn("Could not sync initial board snapshot for late joiner:", e);
    }

    console.log("[Lobby] ✅ Room entrance process finished successfully!");
    // 5. Transition screens and activate UI state
    this.renderer.showDashboard();
    
    // Show role controller and configure spectator options
    if (this.renderer.roleController) {
      this.renderer.roleController.style.display = 'flex';
    }
    if (this.renderer.spectatorToggleBtn) {
      this.renderer.spectatorToggleBtn.style.display = (this.state.role === 'game_master') ? 'block' : 'none';
    }
    this.state.isSpectating = false;
    this.renderer.updateSpectatorButtonUI(false);
    
    this.renderer.updateControlsVisibility(this.state.role);
    this.renderer.updateRoomCodeDisplay(code);

    // Perform initial portfolio rendering with user UID
    const stats = this.state.getPortfolioStats();
    this.renderer.updatePortfolioUI(stats, this.state.portfolio, this.state.boardStocks, this.state.pendingOrders, user.uid);
  }
}
