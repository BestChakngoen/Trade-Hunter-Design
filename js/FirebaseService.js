import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, setPersistence, inMemoryPersistence } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { getDatabase, ref, get, set, update, onValue, onDisconnect, runTransaction } from 'firebase/database';

export class FirebaseService {
  constructor() {
    this.config = {
      apiKey: "AIzaSyDDd8sy4BhNsYshAzcWaAOwdpX6NkXDSU8",
      authDomain: "findice-5e064.firebaseapp.com",
      databaseURL: "https://findice-5e064-default-rtdb.asia-southeast1.firebasedatabase.app",
      projectId: "findice-5e064",
      storageBucket: "findice-5e064.appspot.com",
      messagingSenderId: "134132059445",
      appId: "1:134132059445:web:291101d57d139ec72e907c",
      measurementId: "G-VYRDV7MJ92"
    };
    
    this.app = null;
    this.auth = null;
    this.firestore = null;
    this.realtimeDb = null;
    this.currentUser = null;
  }

  async init() {
    this.app = initializeApp(this.config);
    this.auth = getAuth(this.app);
    this.firestore = getFirestore(this.app);
    this.realtimeDb = getDatabase(this.app);

    // Set persistence to inMemoryPersistence so each tab gets a unique independent UID
    try {
      await setPersistence(this.auth, inMemoryPersistence);
    } catch (e) {
      console.warn("Could not set inMemoryPersistence:", e);
    }

    // Sign in anonymously to obtain a UID for the Realtime Database member tracking
    const credential = await signInAnonymously(this.auth);
    this.currentUser = credential.user;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  // Check if room code exists in Firestore collection (games/traderHunter/rooms)
  async checkRoomExists(roomCode) {
    try {
      const roomDocRef = doc(this.firestore, "games", "traderHunter", "rooms", roomCode);
      const roomDocSnap = await getDoc(roomDocRef);
      return roomDocSnap.exists();
    } catch (error) {
      console.error("Error in checkRoomExists:", error);
      throw error;
    }
  }

  // Get master stocks lists and rules from Firestore (games/traderHunter)
  async getGameSetting() {
    try {
      const docRef = doc(this.firestore, "games", "traderHunter");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data();
      } else {
        throw new Error("No game settings config found on Firestore path 'games/traderHunter'!");
      }
    } catch (error) {
      console.error("Error in getGameSetting:", error);
      throw error;
    }
  }

  // Realtime Database: Get Reference to the Board (traderHunter/boards/{roomCode})
  getBoardRef(roomCode) {
    return ref(this.realtimeDb, `traderHunter/boards/${roomCode}`);
  }

  // Realtime Database: Get Reference to the Game Room Info (traderHunter/gameRooms/{roomCode})
  getRoomRef(roomCode) {
    return ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}`);
  }

  // Realtime Database: Get a one-time snapshot of the room state
  async getRoomStateSnapshot(roomCode) {
    const roomRef = this.getRoomRef(roomCode);
    return await get(roomRef);
  }

  // Realtime Database: Get a one-time snapshot of the board state
  async getBoardSnapshot(roomCode) {
    const boardRef = this.getBoardRef(roomCode);
    return await get(boardRef);
  }

  // Realtime Database: Get Reference to member inside a Room (traderHunter/gameRooms/{roomCode}/members/{userId})
  getUserInBoardRef(roomCode, userId) {
    return ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/members/${userId}`);
  }

  // Realtime Database: Create a new Board state
  async createBoard(roomCode, stocks) {
    const boardRef = this.getBoardRef(roomCode);
    await set(boardRef, { stocks });
  }

  // Realtime Database: Initialize or Update Game Room data
  async createRoom(roomCode, roomSettings, members) {
    const roomRef = this.getRoomRef(roomCode);
    const now = Date.now();
    const maxPlayers = (roomSettings && roomSettings.maxPlayers) ? roomSettings.maxPlayers : 5;
    const gameMode = (roomSettings && roomSettings.gameMode !== undefined && roomSettings.gameMode !== null) ? roomSettings.gameMode : null;

    await set(roomRef, {
      createdAt: now,
      lastJoinedAt: now,
      roomSettings: {
        maxPlayers,
        gameMode
      },
      members
    });
  }

  async updateRoom(roomCode, updateData) {
    const roomRef = this.getRoomRef(roomCode);
    await update(roomRef, updateData);
  }

  async setRoomGameMode(roomCode, gameMode) {
    const roomRef = this.getRoomRef(roomCode);
    await update(roomRef, {
      'roomSettings/gameMode': gameMode
    });
  }

  // Realtime Database: Listen to Board updates in real-time
  listenToBoard(roomCode, callback) {
    const boardRef = this.getBoardRef(roomCode);
    return onValue(boardRef, (snapshot) => {
      callback(snapshot.val());
    });
  }

  // Realtime Database: Listen to Room data changes
  listenToRoom(roomCode, callback) {
    const roomRef = this.getRoomRef(roomCode);
    return onValue(roomRef, (snapshot) => {
      callback(snapshot.val());
    });
  }

  // Realtime Database: Set stocks price values
  async updateStocksBoard(roomCode, stocks) {
    const boardRef = this.getBoardRef(roomCode);
    await update(boardRef, { stocks });
  }

  // Realtime Database: Overwrite stocks board state for Undo/Redo
  async setStocksBoard(roomCode, stocks) {
    const boardRef = this.getBoardRef(roomCode);
    await set(boardRef, { stocks: stocks || {} });
  }

  // Realtime Database: Overwrite room members state for Undo/Redo
  async setRoomMembers(roomCode, members) {
    const membersRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/members`);
    await set(membersRef, members || {});
  }

  // Realtime Database: Safely restore members snapshot for Undo/Redo without wiping newly joined members
  async restoreRoomMembersSnapshot(roomCode, snapshotMembers) {
    if (!roomCode || !snapshotMembers) return;
    try {
      const roomSnap = await this.getRoomStateSnapshot(roomCode);
      if (!roomSnap || !roomSnap.exists()) return;
      const currentData = roomSnap.val();

      const updates = {};
      Object.keys(snapshotMembers).forEach(uid => {
        const snapMember = snapshotMembers[uid];
        if (snapMember) {
          if (snapMember.portfolio !== undefined) {
            updates[`members/${uid}/portfolio`] = snapMember.portfolio;
            if (currentData.savedMembers && snapMember.sessionToken && currentData.savedMembers[snapMember.sessionToken]) {
              updates[`savedMembers/${snapMember.sessionToken}/portfolio`] = snapMember.portfolio;
            }
          }
          if (snapMember.role !== undefined) {
            updates[`members/${uid}/role`] = snapMember.role;
          }
          if (snapMember.displayName !== undefined) {
            updates[`members/${uid}/displayName`] = snapMember.displayName;
          }
        }
      });

      if (Object.keys(updates).length > 0) {
        await this.updateRoom(roomCode, updates);
      }
    } catch (err) {
      console.error("Failed to safely restore room members snapshot:", err);
    }
  }

  // Realtime Database: Overwrite room pending orders state for Undo/Redo
  async setPendingOrders(roomCode, pendingOrders) {
    const ordersRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/pendingOrders`);
    await set(ordersRef, pendingOrders || {});
  }

  // Realtime Database: Set trigger to clean up player/GM node upon closing tab / disconnecting
  configureDisconnectCleanup(roomCode, userId, isGM = false) {
    const userRef = this.getUserInBoardRef(roomCode, userId);
    if (isGM) {
      const gmTransferRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/gmTransferRequest`);
      onDisconnect(userRef).remove().catch(err => {
        console.error("Failed to configure GM onDisconnect userRef:", err);
      });
      onDisconnect(gmTransferRef).set({
        active: true,
        claimedBy: null,
        timestamp: Date.now()
      }).catch(err => {
        console.error("Failed to configure GM onDisconnect transferRef:", err);
      });
    } else {
      onDisconnect(userRef).remove().catch(err => {
        console.error("Failed to configure onDisconnect:", err);
      });
    }
  }

  // Realtime Database: Trigger GM election request manually
  async triggerGMTransfer(roomCode) {
    if (!roomCode) return;
    try {
      const roomRef = this.getRoomRef(roomCode);
      await update(roomRef, {
        gmTransferRequest: {
          active: true,
          claimedBy: null,
          timestamp: Date.now()
        }
      });
    } catch (e) {
      console.error("Failed to trigger GM transfer:", e);
    }
  }

  // Realtime Database: Claim GM role atomically with transaction (First-Come, First-Served)
  async claimGMRoleWithTransaction(roomCode, userId, userName) {
    const roomRef = this.getRoomRef(roomCode);
    let claimSuccess = false;

    const result = await runTransaction(roomRef, (currentData) => {
      if (currentData === null) return currentData;

      const members = currentData.members || {};
      const currentGM = Object.values(members).find(m => m && m.role === 'game_master');
      
      // If GM already exists, claim fails
      if (currentGM) {
        return;
      }

      if (!members[userId]) {
        return;
      }

      // Preserve player profile before promoting to GM so it can be restored later
      const originalProfile = {
        displayName: members[userId].displayName || userName || 'Player',
        portfolio: members[userId].portfolio ? JSON.parse(JSON.stringify(members[userId].portfolio)) : { cash: 20000 },
        timestamp: Date.now()
      };
      members[userId].backupPlayerProfile = originalProfile;

      // Promote player to GM
      members[userId].role = 'game_master';
      members[userId].displayName = 'GM';
      members[userId].portfolio = null;

      // Also update savedMembers if sessionToken is present
      if (currentData.savedMembers && members[userId].sessionToken) {
        const sTok = members[userId].sessionToken;
        if (currentData.savedMembers[sTok]) {
          currentData.savedMembers[sTok].role = 'game_master';
          currentData.savedMembers[sTok].displayName = 'GM';
          currentData.savedMembers[sTok].backupPlayerProfile = originalProfile;
          currentData.savedMembers[sTok].portfolio = null;
        }
      }

      // Clear any pending orders associated with this player
      if (currentData.pendingOrders) {
        Object.keys(currentData.pendingOrders).forEach(orderId => {
          const order = currentData.pendingOrders[orderId];
          if (order && (order.uid === userId || order.userUid === userId)) {
            delete currentData.pendingOrders[orderId];
          }
        });
      }

      currentData.gmTransferRequest = {
        active: false,
        claimedBy: userId,
        claimedByName: userName || 'Player',
        timestamp: Date.now()
      };

      claimSuccess = true;
      return currentData;
    });

    return {
      result,
      claimed: claimSuccess && result.committed
    };
  }

  // Realtime Database: Directly transfer GM role to a selected player & restore former GM's player profile
  async transferGMRoleDirectly(roomCode, currentGmUid, targetPlayerUid) {
    const roomRef = this.getRoomRef(roomCode);
    let transferSuccess = false;
    let formerGmRestoredProfile = null;
    let targetPlayerOriginalProfile = null;

    const result = await runTransaction(roomRef, (currentData) => {
      if (currentData === null) return currentData;
      const members = currentData.members || {};

      // Validate current GM and target player exist
      if (!members[currentGmUid] || members[currentGmUid].role !== 'game_master') {
        return;
      }
      if (!members[targetPlayerUid] || members[targetPlayerUid].role !== 'player') {
        return;
      }

      // 1. Backup target player's profile and elevate target to GM
      const targetBackup = {
        displayName: members[targetPlayerUid].displayName || 'Player',
        portfolio: members[targetPlayerUid].portfolio ? JSON.parse(JSON.stringify(members[targetPlayerUid].portfolio)) : { cash: 20000 },
        timestamp: Date.now()
      };
      targetPlayerOriginalProfile = targetBackup;
      members[targetPlayerUid].backupPlayerProfile = targetBackup;
      members[targetPlayerUid].role = 'game_master';
      members[targetPlayerUid].displayName = 'GM';
      members[targetPlayerUid].portfolio = null;

      // Clear pending orders of target player
      if (currentData.pendingOrders) {
        Object.keys(currentData.pendingOrders).forEach(orderId => {
          const order = currentData.pendingOrders[orderId];
          if (order && (order.uid === targetPlayerUid || order.userUid === targetPlayerUid)) {
            delete currentData.pendingOrders[orderId];
          }
        });
      }

      // 2. Restore former GM back to player mode
      if (members[currentGmUid].backupPlayerProfile) {
        // Rollback to their saved original profile
        const backup = members[currentGmUid].backupPlayerProfile;
        members[currentGmUid].role = 'player';
        members[currentGmUid].displayName = backup.displayName || 'Player';
        members[currentGmUid].portfolio = backup.portfolio ? JSON.parse(JSON.stringify(backup.portfolio)) : { cash: 20000 };
        delete members[currentGmUid].backupPlayerProfile;
        formerGmRestoredProfile = backup;
      } else {
        // Original GM who wasn't a player before
        const existingNames = new Set(
          Object.values(members)
            .filter(m => m && m.role === 'player' && m.displayName)
            .map(m => m.displayName)
        );
        let nextIdx = 1;
        while (existingNames.has(`Player_${nextIdx}`)) nextIdx++;
        const newName = `Player_${nextIdx}`;

        members[currentGmUid].role = 'player';
        members[currentGmUid].displayName = newName;
        members[currentGmUid].portfolio = { cash: 20000 };
        formerGmRestoredProfile = { displayName: newName, portfolio: { cash: 20000 } };
      }

      // 3. Update savedMembers persistent snapshots if node exists
      if (currentData.savedMembers) {
        const targetSession = members[targetPlayerUid].sessionToken;
        if (targetSession && currentData.savedMembers[targetSession]) {
          currentData.savedMembers[targetSession].role = 'game_master';
          currentData.savedMembers[targetSession].displayName = 'GM';
          currentData.savedMembers[targetSession].backupPlayerProfile = targetBackup;
          currentData.savedMembers[targetSession].portfolio = null;
        }

        const gmSession = members[currentGmUid].sessionToken;
        if (gmSession && currentData.savedMembers[gmSession]) {
          currentData.savedMembers[gmSession].role = 'player';
          currentData.savedMembers[gmSession].displayName = members[currentGmUid].displayName;
          currentData.savedMembers[gmSession].portfolio = members[currentGmUid].portfolio;
          delete currentData.savedMembers[gmSession].backupPlayerProfile;
        }
      }

      // 4. Update handover event notification
      currentData.gmHandoverEvent = {
        fromUid: currentGmUid,
        toUid: targetPlayerUid,
        toName: targetBackup.displayName,
        timestamp: Date.now()
      };

      currentData.gmTransferRequest = {
        active: false,
        claimedBy: targetPlayerUid,
        claimedByName: targetBackup.displayName,
        timestamp: Date.now()
      };

      transferSuccess = true;
      return currentData;
    });

    return {
      success: transferSuccess && result.committed,
      formerGmRestoredProfile,
      targetPlayerOriginalProfile
    };
  }

  // Realtime Database: Approve pending order atomically with transaction to eliminate race conditions
  async approveOrderWithTransaction(roomCode, orderId, debtInstrumentsConfig = {}) {
    if (!roomCode || !orderId) return { success: false, reason: 'Invalid parameters' };

    const roomRef = this.getRoomRef(roomCode);
    let approveSuccess = false;
    let failureReason = null;
    let approvedOrder = null;
    let newPortfolio = null;

    const result = await runTransaction(roomRef, (currentData) => {
      if (currentData === null) return currentData;

      const pendingOrders = currentData.pendingOrders || {};
      const order = pendingOrders[orderId];
      if (!order) {
        failureReason = "ORDER_NOT_FOUND";
        return;
      }

      const members = currentData.members || {};
      const member = members[order.uid];
      if (!member) {
        failureReason = "MEMBER_NOT_FOUND";
        return;
      }

      const portfolio = member.portfolio || { cash: 20000, stocks: {}, debt: { fixAccount: 0, bond10Y: 0, bond20Y: 0 } };
      let cash = portfolio.cash ?? 20000;
      let currentStocks = { ...(portfolio.stocks || {}) };
      let currentDebt = { ...(portfolio.debt || { fixAccount: 0, bond10Y: 0, bond20Y: 0 }) };

      const tradePrice = order.price || order.unitPrice || 0;
      const totalCost = (order.volume || 1) * tradePrice;
      let calculatedPortfolio;

      if (order.category === 'DEBT') {
        const key = order.instrumentKey;
        const configPrice = debtInstrumentsConfig[key]?.unitPrice || tradePrice;
        if (order.type === 'INVEST') {
          if (cash < configPrice) {
            failureReason = `INSUFFICIENT_FUNDS:${order.username || 'ผู้เล่น'}`;
            return;
          }
          calculatedPortfolio = {
            cash: cash - configPrice,
            stocks: currentStocks,
            debt: {
              ...currentDebt,
              [key]: (currentDebt[key] || 0) + 1
            }
          };
        } else { // REDEEM
          const currentVol = currentDebt[key] || 0;
          if (currentVol < 1) {
            failureReason = `INSUFFICIENT_DEBT:${order.username || 'ผู้เล่น'}`;
            return;
          }
          calculatedPortfolio = {
            cash: cash + configPrice,
            stocks: currentStocks,
            debt: {
              ...currentDebt,
              [key]: Math.max(0, currentVol - 1)
            }
          };
        }
      } else if (order.type === 'BUY') {
        if (cash < totalCost) {
          failureReason = `INSUFFICIENT_CASH:${totalCost}:${cash}`;
          return;
        }
        const newCash = cash - totalCost;
        const stocks = { ...currentStocks };
        const vol = order.volume || 1;
        if (stocks[order.symbol]) {
          const oldCost = stocks[order.symbol].volume * stocks[order.symbol].avgPrice;
          const newVolume = stocks[order.symbol].volume + vol;
          const newAvgPrice = (oldCost + totalCost) / newVolume;
          stocks[order.symbol] = {
            volume: newVolume,
            avgPrice: Math.round(newAvgPrice)
          };
        } else {
          stocks[order.symbol] = {
            volume: vol,
            avgPrice: tradePrice
          };
        }
        calculatedPortfolio = {
          cash: newCash,
          stocks,
          debt: currentDebt
        };
      } else { // SELL
        const holding = currentStocks[order.symbol];
        const vol = order.volume || 1;
        if (!holding || holding.volume < vol) {
          failureReason = `INSUFFICIENT_SHARES:${order.symbol}`;
          return;
        }
        const newCash = cash + totalCost;
        const stocks = { ...currentStocks };
        const newVolume = holding.volume - vol;
        if (newVolume <= 0) {
          delete stocks[order.symbol];
        } else {
          stocks[order.symbol] = {
            volume: newVolume,
            avgPrice: holding.avgPrice
          };
        }
        calculatedPortfolio = {
          cash: newCash,
          stocks,
          debt: currentDebt
        };
      }

      member.portfolio = calculatedPortfolio;
      newPortfolio = calculatedPortfolio;

      if (currentData.savedMembers && member.sessionToken) {
        if (currentData.savedMembers[member.sessionToken]) {
          currentData.savedMembers[member.sessionToken].portfolio = calculatedPortfolio;
        }
      }

      delete currentData.pendingOrders[orderId];

      if (!currentData.lastProcessedOrder) {
        currentData.lastProcessedOrder = {};
      }
      currentData.lastProcessedOrder[order.uid] = {
        id: orderId,
        type: order.type,
        symbol: order.symbol,
        volume: order.volume || 1,
        status: 'APPROVED',
        timestamp: Date.now()
      };

      approvedOrder = JSON.parse(JSON.stringify(order));
      approveSuccess = true;
      return currentData;
    });

    return {
      success: approveSuccess && result.committed,
      failureReason,
      approvedOrder,
      newPortfolio
    };
  }

  // Realtime Database: Reject pending order atomically with transaction
  async rejectOrderWithTransaction(roomCode, orderId) {
    if (!roomCode || !orderId) return { success: false, reason: 'Invalid parameters' };

    const roomRef = this.getRoomRef(roomCode);
    let rejectSuccess = false;
    let rejectedOrder = null;

    const result = await runTransaction(roomRef, (currentData) => {
      if (currentData === null) return currentData;

      const pendingOrders = currentData.pendingOrders || {};
      const order = pendingOrders[orderId];
      if (!order) return;

      rejectedOrder = JSON.parse(JSON.stringify(order));
      delete currentData.pendingOrders[orderId];

      if (!currentData.lastProcessedOrder) {
        currentData.lastProcessedOrder = {};
      }
      currentData.lastProcessedOrder[order.uid] = {
        id: orderId,
        type: order.type,
        symbol: order.symbol,
        volume: order.volume || 1,
        status: 'REJECTED',
        timestamp: Date.now()
      };

      rejectSuccess = true;
      return currentData;
    });

    return {
      success: rejectSuccess && result.committed,
      rejectedOrder
    };
  }

  // Realtime Database: Save or update player snapshot in savedMembers
  async saveMemberSnapshot(roomCode, sessionToken, data) {
    if (!roomCode || !sessionToken || !data) return;
    const snapRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/savedMembers/${sessionToken}`);
    await update(snapRef, data);
  }

  // Realtime Database: Retrieve player snapshot from savedMembers
  async getMemberSnapshot(roomCode, sessionToken) {
    if (!roomCode || !sessionToken) return null;
    const snapRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/savedMembers/${sessionToken}`);
    const snapshot = await get(snapRef);
    return snapshot.exists() ? snapshot.val() : null;
  }

  // Realtime Database: Delete room and board data when empty
  async deleteRoomData(roomCode) {
    if (!roomCode) return;
    try {
      const roomRef = this.getRoomRef(roomCode);
      const boardRef = this.getBoardRef(roomCode);
      await set(roomRef, null);
      await set(boardRef, null);
    } catch (e) {
      console.error("Failed to purge empty room data:", e);
    }
  }

  // Realtime Database: Remove a specific member node and their pending orders from room
  async removeMemberFromRoom(roomCode, userId) {
    if (!roomCode || !userId) return;
    try {
      const userRef = this.getUserInBoardRef(roomCode, userId);
      await set(userRef, null);

      // Purge all pending orders submitted by this player
      const roomSnapshot = await this.getRoomStateSnapshot(roomCode);
      if (roomSnapshot && roomSnapshot.exists()) {
        const roomData = roomSnapshot.val();
        const updates = {};
        const pendingOrders = roomData.pendingOrders || {};
        Object.entries(pendingOrders).forEach(([orderId, order]) => {
          if (order && order.uid === userId) {
            updates[`pendingOrders/${orderId}`] = null;
          }
        });
        if (Object.keys(updates).length > 0) {
          await this.updateRoom(roomCode, updates);
        }
      }
    } catch (e) {
      console.error("Failed to remove member from room:", e);
    }
  }

  // Realtime Database: Join room atomically with transaction to handle high concurrency
  async joinRoomWithTransaction(roomCode, userObj) {
    const roomRef = this.getRoomRef(roomCode);
    let assignedRole = userObj.role;

    const result = await runTransaction(roomRef, (currentData) => {
      if (currentData === null) {
        return currentData;
      }

      const members = currentData.members || {};
      
      // Rejoining player
      if (members[userObj.uid]) {
        return currentData;
      }

      if (!currentData.members) {
        currentData.members = {};
      }

      // Check if GM already exists in members
      const hasGM = Object.values(members).some(m => m && m.role === 'game_master');
      let targetRole = userObj.role;
      let targetName = userObj.displayName;

      if (targetRole === 'game_master' && hasGM) {
        // Demote to Player automatically if GM already exists!
        targetRole = 'player';
        const existingNames = new Set(
          Object.values(members)
            .filter(m => m && m.role === 'player' && m.displayName)
            .map(m => m.displayName)
        );
        let nextIndex = 1;
        while (existingNames.has(`Player_${nextIndex}`)) {
          nextIndex++;
        }
        targetName = `Player_${nextIndex}`;
      }

      assignedRole = targetRole;

      const memberObj = {
        role: targetRole,
        displayName: targetName,
        joinedAt: Date.now()
      };
      if (targetRole === 'player') {
        memberObj.portfolio = userObj.portfolio ? JSON.parse(JSON.stringify(userObj.portfolio)) : { cash: 20000 };
      }
      if (userObj.sessionToken) {
        memberObj.sessionToken = userObj.sessionToken;
      }
      if (userObj.backupPlayerProfile) {
        memberObj.backupPlayerProfile = userObj.backupPlayerProfile;
      }

      currentData.members[userObj.uid] = memberObj;
      currentData.lastJoinedAt = Date.now();

      return currentData;
    });

    return {
      result,
      assignedRole
    };
  }

  // Register User session lock for tab/device exclusivity per user
  async registerUserSession(roomCode, userId, sessionId) {
    if (!this.realtimeDb || !roomCode || !userId) return;
    const sessionRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/userSessions/${userId}`);
    await set(sessionRef, {
      sessionId,
      userId,
      timestamp: Date.now()
    });
    try {
      onDisconnect(sessionRef).remove();
    } catch (e) {
      console.warn("Could not set onDisconnect on userSession:", e);
    }
  }

  // Listen to User session lock changes
  listenToUserSession(roomCode, userId, callback) {
    if (!this.realtimeDb || !roomCode || !userId) return () => {};
    const sessionRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/userSessions/${userId}`);
    const unsubscribe = onValue(sessionRef, (snapshot) => {
      callback(snapshot.val());
    });
    return unsubscribe;
  }

  // Register IP session lock for machine/tab exclusivity (Legacy fallback)
  async registerIpSession(roomCode, sanitizedIp, sessionId, userId) {
    if (!this.realtimeDb || !roomCode || !sanitizedIp) return;
    const sessionRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/ipSessions/${sanitizedIp}`);
    await set(sessionRef, {
      sessionId,
      userId,
      timestamp: Date.now()
    });
    try {
      onDisconnect(sessionRef).remove();
    } catch (e) {
      console.warn("Could not set onDisconnect on ipSession:", e);
    }
  }

  // Listen to IP session lock changes (Legacy fallback)
  listenToIpSession(roomCode, sanitizedIp, callback) {
    if (!this.realtimeDb || !roomCode || !sanitizedIp) return () => {};
    const sessionRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/ipSessions/${sanitizedIp}`);
    const unsubscribe = onValue(sessionRef, (snapshot) => {
      callback(snapshot.val());
    });
    return unsubscribe;
  }
}
