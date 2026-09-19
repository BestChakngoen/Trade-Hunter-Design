/**
 * RoomSetupService - Manages initial game board setup from master stocks,
 * atomic Firebase room creation / transaction joining, and session lock registration.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class RoomSetupService {
  constructor(state, renderer, firebaseService, sessionLockService = null, playerSessionService = null) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
    this.sessionLockService = sessionLockService;
    this.playerSessionService = playerSessionService;
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

  /**
   * Initializes master stocks and executes atomic room creation or joining transaction.
   */
  async setupOrJoinRoom({
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
  }) {
    // 1. Fetch Master Settings from Firestore
    const gameSetting = await this.withTimeout(
      this.firebaseService.getGameSetting(),
      8000,
      "หมดเวลาการดึงข้อมูลการตั้งค่าเกม (getGameSetting Timeout)"
    );
    this.state.setMasterStocks(gameSetting.stocks);

    const now = Date.now();
    let finalRole = role;
    let finalDisplayName = displayName;

    // 2. Atomically register role in Firebase
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
        role: finalRole,
        displayName: finalDisplayName,
        joinedAt: now,
        ip: clientIp,
        sessionToken: sessionToken || null,
        online: true
      };
      if (finalRole === 'player') {
        initialMemberObj.portfolio = restoredPortfolio || { cash: 20000 };
      }
      if (restoredBackupProfile) {
        initialMemberObj.backupPlayerProfile = restoredBackupProfile;
      }

      // Concurrency check: see if room was created while dialog was open
      const freshSnap = await this.firebaseService.getRoomStateSnapshot(code);
      if (freshSnap && freshSnap.exists()) {
        await this.firebaseService.joinRoomWithTransaction(code, {
          uid: user.uid,
          role: finalRole,
          displayName: finalDisplayName,
          portfolio: restoredPortfolio,
          sessionToken: sessionToken,
          backupPlayerProfile: restoredBackupProfile,
          ip: clientIp
        }, clientIp);
      } else {
        await this.firebaseService.createRoom(code, {
          maxPlayers,
          gameMode: null
        }, {
          [user.uid]: initialMemberObj
        }, clientIp);
        await this.firebaseService.updateRoom(code, { expiresAt });
      }
    } else {
      if (members && members[user.uid]) {
        // Re-joining member
        const updates = {
          [`members/${user.uid}/online`]: true,
          [`members/${user.uid}/role`]: finalRole,
          [`members/${user.uid}/displayName`]: finalDisplayName
        };
        if (roomData && roomData.kickedMembers && roomData.kickedMembers[user.uid]) {
          updates[`kickedMembers/${user.uid}`] = null;
        }
        if (clientIp && clientIp !== 'unknown') {
          updates[`members/${user.uid}/ip`] = clientIp;
          if (sessionToken && roomData && roomData.savedMembers && roomData.savedMembers[sessionToken]) {
            updates[`savedMembers/${sessionToken}/ip`] = clientIp;
          }
        }
        if (sessionToken && !members[user.uid].sessionToken) {
          updates[`members/${user.uid}/sessionToken`] = sessionToken;
        }
        if (finalRole === 'game_master') {
          if (restoredBackupProfile) {
            updates[`members/${user.uid}/backupPlayerProfile`] = restoredBackupProfile;
          }
        } else if (finalRole === 'player') {
          if (!members[user.uid].portfolio || restoredPortfolio) {
            updates[`members/${user.uid}/portfolio`] = restoredPortfolio || members[user.uid].portfolio || { cash: 20000 };
          }
        }
        if (Object.keys(updates).length > 0) {
          await this.firebaseService.updateRoom(code, updates);
        }
      } else {
        // Atomic transaction to handle high concurrency joining & GM demotion
        const txnRes = await this.firebaseService.joinRoomWithTransaction(code, {
          uid: user.uid,
          role: finalRole,
          displayName: finalDisplayName,
          portfolio: restoredPortfolio,
          sessionToken: sessionToken,
          backupPlayerProfile: restoredBackupProfile,
          ip: clientIp
        }, clientIp);

        if (!txnRes || (txnRes.result && !txnRes.result.committed)) {
          await this.renderer.showErrorAlert("เข้าห้องไม่สำเร็จ", "ไม่สามารถเข้าร่วมห้องได้ในขณะนี้ โปรดลองใหม่อีกครั้ง");
          return null;
        }

        if (txnRes.assignedRole) {
          finalRole = txnRes.assignedRole;
          if (finalRole === 'player' && finalDisplayName === 'GM') {
            const existingNames = new Set(
              Object.values(members || {})
                .filter(m => m && m.role === 'player' && m.displayName)
                .map(m => m.displayName)
            );
            let nextIndex = 1;
            while (existingNames.has(`Player_${nextIndex}`)) {
              nextIndex++;
            }
            finalDisplayName = `Player_${nextIndex}`;
          }
        }
      }
    }

    this.state.setRole(finalRole);
    this.state.setPlayerName(finalDisplayName);

    if (restoredPortfolio && finalRole === 'player') {
      this.state.portfolio = JSON.parse(JSON.stringify(restoredPortfolio));
    }

    if (this.playerSessionService && sessionToken) {
      this.playerSessionService.saveRoomSession(code, {
        sessionToken,
        role: finalRole,
        displayName: finalDisplayName,
        uid: user.uid,
        ip: clientIp
      });
      await this.playerSessionService.syncPlayerToFirebase(code, this.firebaseService, sessionToken, {
        displayName: finalDisplayName,
        role: finalRole,
        portfolio: restoredPortfolio || (finalRole === 'player' ? { cash: 20000 } : null),
        backupPlayerProfile: restoredBackupProfile,
        ip: clientIp
      });
    }

    return {
      finalRole,
      finalDisplayName,
      user
    };
  }

  /**
   * Syncs initial board snapshot immediately for late joiners.
   */
  async syncLateJoinerBoard(code) {
    try {
      const boardSnap = await this.firebaseService.getBoardSnapshot(code);
      if (boardSnap && boardSnap.exists()) {
        this.state.updateFromFirebaseBoard(boardSnap.val());
      }
    } catch (e) {
      console.warn("[RoomSetupService] Could not sync initial board snapshot for late joiner:", e);
    }
  }

  /**
   * Configures player / GM disconnect cleanup in Firebase.
   */
  configureDisconnectCleanup(code, uid, isGM) {
    this.firebaseService.configureDisconnectCleanup(code, uid, isGM);
  }

  /**
   * Registers machine exclusivity lock.
   */
  async registerSessionLock(code, uid) {
    if (this.sessionLockService) {
      await this.sessionLockService.registerSession(code, this.firebaseService, uid);
    }
  }
}
