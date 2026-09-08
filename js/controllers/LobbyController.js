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

    if (this.renderer.roomCodeInput) {
      this.renderer.roomCodeInput.addEventListener('input', (e) => {
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        const originalVal = e.target.value;
        const cleanedVal = originalVal.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (originalVal !== cleanedVal) {
          e.target.value = cleanedVal;
          if (start !== null && end !== null) {
            const diff = originalVal.length - cleanedVal.length;
            const newPos = Math.max(0, start - diff);
            e.target.setSelectionRange(newPos, newPos);
          }
        }
        this.updateRoomCodeSlots(e.target.value);
      });
      this.renderer.roomCodeInput.addEventListener('focus', () => {
        this.updateRoomCodeSlots(this.renderer.roomCodeInput.value);
      });
      this.renderer.roomCodeInput.addEventListener('blur', () => {
        const slotsContainer = document.getElementById('roomCodeSlots');
        if (slotsContainer) {
          slotsContainer.querySelectorAll('.code-slot').forEach(slot => slot.classList.remove('active-focus'));
        }
      });
    }

    const triggerShakeIfEmpty = (e) => {
      const code = this.renderer.roomCodeInput ? this.renderer.roomCodeInput.value.trim().toUpperCase() : '';
      if (!code) {
        if (e) e.preventDefault();
        if (typeof this.renderer.triggerShakeCodeBox === 'function') {
          this.renderer.triggerShakeCodeBox();
        }
        return true;
      }
      return false;
    };

    if (this.renderer.joinRoomBtn) {
      this.renderer.joinRoomBtn.addEventListener('click', (e) => {
        if (triggerShakeIfEmpty(e)) return;
      });
    }

    const keySubmitBtn = document.querySelector('.lobby-key-submit-btn');
    if (keySubmitBtn) {
      keySubmitBtn.addEventListener('click', (e) => {
        if (triggerShakeIfEmpty(e)) return;
      });
    }

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
        if (err && err.message === 'USER_CANCELLED_WAITING') {
          console.log("[Lobby] User cancelled waiting for GM.");
          return;
        }
        console.error("Lobby join error:", err);
        this.clearLobbyRoomCodeInput();
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

  async promptRoleSelection(code) {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    const modal = this.renderer.roleSelectionModal;
    const btnGM = this.renderer.roleOptGMBtn;
    const btnPlayer = this.renderer.roleOptPlayerBtn;
    const btnClose = this.renderer.roleOptCloseBtn;

    if (!modal || !btnGM || !btnPlayer || !btnClose) {
      const choice = confirm("กด OK เพื่อเลือกเป็น GM หรือ Cancel เพื่อเลือกเป็น Player");
      return choice ? 'game_master' : 'player';
    }

    return new Promise((resolve) => {
      modal.style.display = 'flex';
      let roomUnsub = null;

      const cleanup = () => {
        if (typeof roomUnsub === 'function') {
          roomUnsub();
          roomUnsub = null;
        }
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

      const cleanup = () => {
        btnBasic.removeEventListener('click', handleBasic);
        btnAdvance.removeEventListener('click', handleAdvance);
        if (btnClose) btnClose.removeEventListener('click', handleClose);
      };

      btnBasic.addEventListener('click', handleBasic);
      btnAdvance.addEventListener('click', handleAdvance);
      if (btnClose) btnClose.addEventListener('click', handleClose);
    });
  }

  async waitForGameModeSelection(code) {
    const modal = this.renderer.waitingForGMModal;
    const closeBtn = this.renderer.waitingCloseBtn;
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
          } catch (e) {
            console.warn("Could not remove member on cancel waiting:", e);
          }
        }
        reject(new Error('USER_CANCELLED_WAITING'));
      };

      if (closeBtn) {
        closeBtn.addEventListener('click', handleClose);
      }

      unsub = this.firebaseService.listenToRoom(code, (data) => {
        checkMode(data);
      });
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
      this.clearLobbyRoomCodeInput();
      if (typeof this.renderer.triggerShakeCodeBox === 'function') {
        this.renderer.triggerShakeCodeBox();
      }
      if (typeof this.renderer.showInvalidRoomModal === 'function') {
        await this.renderer.showInvalidRoomModal(code);
      }
      this.clearLobbyRoomCodeInput();
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

      // Purge expired or ended rooms completely!
      if (memberUids.length === 0 || isExpired || isEnded) {
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
      // Check max capacity if room already exists (Default 5 players max)
      const maxPlayers = (roomData && roomData.roomSettings && roomData.roomSettings.maxPlayers) ? roomData.roomSettings.maxPlayers : 5;
      if (roomExists && !members[user.uid] && memberUids.length >= maxPlayers) {
        const roomFullAction = await this.renderer.showRoomFullModal();
        if (roomFullAction === 'reset') {
          await this.firebaseService.deleteRoomData(code);
          return this.joinOrCreateRoom(code);
        }
        return;
      }

      // Check if room already has GM
      const hasGM = memberUids.some(uid => members[uid] && members[uid].role === 'game_master');
      if (hasGM) {
        // Automatic assignment to Player if GM is already present (No Role Modal shown)
        role = 'player';
      } else {
        // No GM present -> Ask user to select role (Pass room code for real-time claim detection)
        role = await this.promptRoleSelection(code);
        if (!role) {
          return;
        }
      }

      if (role === 'game_master') {
        displayName = 'GM';
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
        displayName = `Player_${nextIndex}`;
      }
    }

    // Fetch Master Settings from Firestore
    const gameSetting = await this.withTimeout(
      this.firebaseService.getGameSetting(),
      8000,
      "หมดเวลาการดึงข้อมูลการตั้งค่าเกม (getGameSetting Timeout)"
    );
    this.state.setMasterStocks(gameSetting.stocks);

    // 3. ATOMICALLY REGISTER ROLE IN FIREBASE IMMEDIATELY
    // Register role in Firebase so other clients see GM in real-time right away!
    const maxPlayers = (roomData && roomData.roomSettings && roomData.roomSettings.maxPlayers) ? roomData.roomSettings.maxPlayers : 5;

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

      // Double check if room was created by another client while promptRoleSelection modal was open
      const freshSnap = await this.firebaseService.getRoomStateSnapshot(code);
      if (freshSnap && freshSnap.exists()) {
        await this.firebaseService.joinRoomWithTransaction(code, {
          uid: user.uid,
          role: role,
          displayName: displayName
        }, maxPlayers);
      } else {
        await this.firebaseService.createRoom(code, {
          maxPlayers,
          gameMode: null
        }, {
          [user.uid]: initialMemberObj
        });
        await this.firebaseService.updateRoom(code, { expiresAt });
      }

      roomExists = true;
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
        // Atomic transaction to handle high concurrency joining & GM demotion
        const txnRes = await this.firebaseService.joinRoomWithTransaction(code, {
          uid: user.uid,
          role: role,
          displayName: displayName
        }, maxPlayers);

        if (!txnRes || (txnRes.result && !txnRes.result.committed)) {
          await this.renderer.showRoomFullModal();
          return;
        }

        if (txnRes.assignedRole) {
          role = txnRes.assignedRole;
          if (role === 'player' && displayName === 'GM') {
            const existingNames = new Set(
              Object.values(members || {})
                .filter(m => m && m.role === 'player' && m.displayName)
                .map(m => m.displayName)
            );
            let nextIndex = 1;
            while (existingNames.has(`Player_${nextIndex}`)) {
              nextIndex++;
            }
            displayName = `Player_${nextIndex}`;
          }
        }
      }
    }

    this.state.setRole(role);
    this.state.setPlayerName(displayName);

    // 4. GAME MODE SELECTION (Now GM is officially registered in Firebase, other clients see GM instantly!)
    const freshSnap = await this.firebaseService.getRoomStateSnapshot(code);
    const freshRoomData = freshSnap && freshSnap.exists() ? freshSnap.val() : null;
    let gameMode = (freshRoomData && freshRoomData.roomSettings && freshRoomData.roomSettings.gameMode) ? freshRoomData.roomSettings.gameMode : null;

    if (!gameMode) {
      if (role === 'game_master') {
        try {
          gameMode = await this.promptGameModeSelection(code, user.uid);
          if (!gameMode) gameMode = 'advance';
          await this.firebaseService.setRoomGameMode(code, gameMode);
        } catch (err) {
          if (err && err.message === 'GM_CANCELLED_GAME_MODE') {
            this.renderer.showLobby();
            return;
          }
          throw err;
        }
      } else {
        try {
          gameMode = await this.waitForGameModeSelection(code);
        } catch (err) {
          if (err && err.message === 'USER_CANCELLED_WAITING') {
            this.renderer.showLobby();
            return;
          }
          throw err;
        }
      }
    }

    this.state.setGameMode(gameMode);
    this.state.setRoomCode(code);

    // Configure player/GM cleanup on disconnect
    this.firebaseService.configureDisconnectCleanup(code, user.uid, role === 'game_master');

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
    
    this.renderer.updateControlsVisibility(this.state.role, displayName, this.state.gameMode);
    this.renderer.updateRoomCodeDisplay(code);

    // Perform initial portfolio rendering with user UID
    const stats = this.state.getPortfolioStats();
    this.renderer.updatePortfolioUI(stats, this.state.portfolio, this.state.boardStocks, this.state.pendingOrders, user.uid);
  }

  updateRoomCodeSlots(val = '') {
    const slotsContainer = document.getElementById('roomCodeSlots');
    if (!slotsContainer) return;
    const slots = slotsContainer.querySelectorAll('.code-slot');
    const cleanVal = (val || '').trim().toUpperCase();

    if (cleanVal.length > 0) {
      slotsContainer.classList.add('visible-slots');
      slotsContainer.style.cssText = 'display: flex !important; opacity: 1 !important;';
    } else {
      slotsContainer.classList.remove('visible-slots');
      slotsContainer.style.cssText = 'display: none !important; opacity: 0 !important;';
    }

    slots.forEach((slot, index) => {
      const char = cleanVal[index] || '';
      slot.textContent = char;
      if (char && cleanVal.length > 0) {
        slot.classList.add('filled');
      } else {
        slot.classList.remove('filled');
      }
      if (cleanVal.length > 0 && index === cleanVal.length && cleanVal.length < 6) {
        slot.classList.add('active-focus');
      } else {
        slot.classList.remove('active-focus');
      }
    });
  }

  clearLobbyRoomCodeInput() {
    if (this.renderer.roomCodeInput) {
      this.renderer.roomCodeInput.value = '';
    }
    this.updateRoomCodeSlots('');
    if (typeof this.renderer.clearRoomCodeSlots === 'function') {
      this.renderer.clearRoomCodeSlots();
    }
  }
}
