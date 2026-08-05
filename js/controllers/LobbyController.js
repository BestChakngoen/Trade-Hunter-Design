/**
 * LobbyController - Manages Game Room Joining, Creation, and Player Role Initialization.
 */
export class LobbyController {
  constructor(state, renderer, firebaseService) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
  }

  bindLobbyEntrance(onJoinSuccess) {
    if (!this.renderer.lobbyForm) return;

    this.renderer.lobbyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = this.renderer.roomCodeInput.value.trim().toUpperCase();
      if (!code) return;

      try {
        await this.joinOrCreateRoom(code);
        if (typeof onJoinSuccess === 'function') {
          onJoinSuccess(code);
        }
      } catch (err) {
        console.error("Lobby join error:", err);
        this.renderer.showErrorAlert("เกิดข้อผิดพลาด", err.message || "ไม่สามารถระบุการเชื่อมต่อห้องเกมได้");
      }
    });
  }

  async joinOrCreateRoom(code) {
    // 1. Verify if the code is permitted in Firestore
    const isAllowed = await this.firebaseService.checkRoomExists(code);
    if (!isAllowed) {
      this.renderer.showErrorAlert(
        "รหัสไม่ถูกต้อง",
        "กรุณาตรวจสอบรหัสห้อง หรือติดต่อผู้ดูแลระบบได้ที่ Findice.edu@gmail.com"
      );
      return;
    }

    // 2. Fetch room status from Firebase Realtime Database
    let roomExists = false;
    let isEnd = false;

    const roomSnapshot = await this.firebaseService.getRoomStateSnapshot(code);
    if (roomSnapshot && roomSnapshot.exists()) {
      roomExists = true;
      isEnd = roomSnapshot.val().isEnd || false;
    }

    const user = this.firebaseService.getCurrentUser();
    const now = Date.now();

    // 3. Initialize state parameters
    this.state.setRoomCode(code);

    // Fetch Master Settings from Firestore first
    const gameSetting = await this.firebaseService.getGameSetting();
    this.state.setMasterStocks(gameSetting.stocks);

    // 4. Create or Join logic
    if (!roomExists || isEnd) {
      // Admin/Host opens the room first -> Role is Game Master
      this.state.setRole('game_master');

      // Build initial board configuration from master steps
      const initialBoardStocks = gameSetting.stocks.map(s => ({
        name: s.name,
        value: s.steps[s.startStep - 1],
        step: s.startStep - 1,
        maxStep: s.steps.length,
        startStep: s.startStep - 1,
        oldValue: null,
        updatedAt: null
      }));

      // Create board state
      await this.firebaseService.createBoard(code, initialBoardStocks);

      // Create room state
      await this.firebaseService.createRoom(code, gameSetting.roomSettings, {
        [user.uid]: {
          role: 'game_master',
          displayName: 'GM',
          joinedAt: now
        }
      });
      this.state.setRole('game_master');
      this.state.setPlayerName('GM');
    } else {
      // Room already exists -> Determine role based on current members
      const roomData = roomSnapshot.val();
      const members = roomData.members || {};
      const memberUids = Object.keys(members);
      
      let role = 'player';
      let displayName = 'Player_1';
      
      if (members[user.uid]) {
        // Re-joining player uses their existing role and name
        role = members[user.uid].role;
        displayName = members[user.uid].displayName || (role === 'game_master' ? 'GM' : 'Player_1');
        if (!members[user.uid].portfolio) {
          await this.firebaseService.updateRoom(code, {
            [`members/${user.uid}/portfolio`]: {
              cash: 20000
            }
          });
        }
      } else {
        // New participant: If max capacity allows, add them. Otherwise raise error.
        const maxPlayers = (roomData.roomSettings && roomData.roomSettings.maxPlayers) ? roomData.roomSettings.maxPlayers : 10;
        if (maxPlayers - memberUids.length <= 0) {
          this.renderer.showErrorAlert("ห้องเต็ม", "จำนวนผู้เข้าร่วมในห้องนี้เต็มขีดจำกัดแล้ว");
          return;
        }
        // If no members at all or room lacks a GM, assign game_master, else player
        const hasMaster = memberUids.some(uid => members[uid] && members[uid].role === 'game_master');
        role = (memberUids.length === 0 || !hasMaster) ? 'game_master' : 'player';

        if (role === 'game_master') {
          displayName = 'GM';
        } else {
          // Count existing players in room to determine sequence
          const existingPlayersCount = memberUids.filter(uid => members[uid] && members[uid].role === 'player').length;
          displayName = `Player_${existingPlayersCount + 1}`;
        }

        // Save to Firebase member list with default portfolio and displayName
        await this.firebaseService.updateRoom(code, {
          lastJoinedAt: now,
          [`members/${user.uid}`]: {
            role: role,
            displayName: displayName,
            joinedAt: now,
            portfolio: {
              cash: 20000
            }
          }
        });
      }

      this.state.setRole(role);
      this.state.setPlayerName(displayName);
    }

    // Configure player cleanup on disconnect
    this.firebaseService.configureDisconnectCleanup(code, user.uid);

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
