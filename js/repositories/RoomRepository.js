import { ref, get, set, update, onValue, onDisconnect, runTransaction, goOnline } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

/**
 * RoomRepository - Manages Realtime Database operations for game room lifecycle,
 * members tracking, atomic room joining, session locks, and disconnect cleanup.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class RoomRepository {
  constructor(firebaseService) {
    this.firebaseService = firebaseService;
  }

  get realtimeDb() {
    return this.firebaseService.realtimeDb;
  }

  ensureConnection() {
    try {
      if (this.realtimeDb) {
        goOnline(this.realtimeDb);
      }
    } catch (e) {
      console.warn("[RoomRepository] Failed to reconnect Firebase:", e);
    }
  }

  getRoomRef(roomCode) {
    return ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}`);
  }

  async getRoomStateSnapshot(roomCode) {
    const roomRef = this.getRoomRef(roomCode);
    return await get(roomRef);
  }

  getUserInBoardRef(roomCode, userId) {
    return ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/members/${userId}`);
  }

  // Realtime Database: Initialize or Update Game Room data
  async createRoom(roomCode, roomSettings, members, clientIp = 'unknown') {
    const roomRef = this.getRoomRef(roomCode);
    const now = Date.now();
    const maxPlayers = (roomSettings && roomSettings.maxPlayers) ? roomSettings.maxPlayers : 5;
    const gameMode = (roomSettings && roomSettings.gameMode !== undefined && roomSettings.gameMode !== null) ? roomSettings.gameMode : null;

    await set(roomRef, {
      status: 'ACTIVE',
      isReset: false,
      createdAt: now,
      lastJoinedAt: now,
      lastActiveAt: now,
      creatorIp: clientIp || 'unknown',
      roomSettings: {
        maxPlayers,
        gameMode
      },
      members
    });
  }

  async updateRoom(roomCode, updateData) {
    const roomRef = this.getRoomRef(roomCode);
    const payload = { ...updateData };
    if (!payload.lastActiveAt) {
      payload.lastActiveAt = Date.now();
    }
    await update(roomRef, payload);
  }

  async setRoomGameMode(roomCode, gameMode) {
    const roomRef = this.getRoomRef(roomCode);
    await update(roomRef, {
      'roomSettings/gameMode': gameMode
    });
  }

  listenToRoom(roomCode, callback) {
    const roomRef = this.getRoomRef(roomCode);
    return onValue(roomRef, (snapshot) => {
      callback(snapshot.val());
    });
  }

  async setRoomMembers(roomCode, members) {
    const membersRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/members`);
    await set(membersRef, members || {});
  }

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
      console.error("[RoomRepository] Failed to safely restore room members snapshot:", err);
    }
  }

  async setMemberOnlineStatus(roomCode, userId, isOnline) {
    if (!roomCode || !userId) return;
    try {
      const updates = {
        [`members/${userId}/online`]: isOnline
      };
      if (!isOnline) {
        updates[`members/${userId}/disconnectedAt`] = Date.now();
      }
      await this.updateRoom(roomCode, updates);
    } catch (e) {
      console.error("[RoomRepository] Failed to update member online status:", e);
    }
  }

  configureDisconnectCleanup(roomCode, userId, isGM = false) {
    const userRef = this.getUserInBoardRef(roomCode, userId);
    const onlineRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/members/${userId}/online`);
    const disconnectedAtRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/members/${userId}/disconnectedAt`);

    if (isGM) {
      try {
        onDisconnect(onlineRef).cancel();
        onDisconnect(disconnectedAtRef).cancel();
      } catch (e) {}

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
      try {
        onDisconnect(userRef).cancel();
      } catch (e) {}

      onDisconnect(onlineRef).set(false).catch(err => {
        console.error("Failed to configure onDisconnect onlineRef:", err);
      });
      onDisconnect(disconnectedAtRef).set(Date.now()).catch(err => {
        console.error("Failed to configure onDisconnect disconnectedAtRef:", err);
      });
    }
  }

  async saveMemberSnapshot(roomCode, sessionToken, data) {
    if (!roomCode || !sessionToken || !data) return;
    const snapRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/savedMembers/${sessionToken}`);
    await update(snapRef, data);
  }

  async getMemberSnapshot(roomCode, sessionToken) {
    if (!roomCode || !sessionToken) return null;
    const snapRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/savedMembers/${sessionToken}`);
    const snapshot = await get(snapRef);
    return snapshot.exists() ? snapshot.val() : null;
  }

  async deleteRoomData(roomCode) {
    if (!roomCode) return;
    try {
      const roomRef = this.getRoomRef(roomCode);
      const boardRef = ref(this.realtimeDb, `traderHunter/boards/${roomCode}`);
      await set(roomRef, null);
      await set(boardRef, null);
    } catch (e) {
      console.error("[RoomRepository] Failed to purge empty room data:", e);
    }
  }

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
      console.error("[RoomRepository] Failed to remove member from room:", e);
    }
  }

  async joinRoomWithTransaction(roomCode, userObj, clientIp = 'unknown') {
    const roomRef = this.getRoomRef(roomCode);
    let assignedRole = userObj.role;

    const result = await runTransaction(roomRef, (currentData) => {
      if (currentData === null) {
        return currentData;
      }

      // Clear any prior kick signal so player can start cleanly
      if (currentData.kickedMembers && currentData.kickedMembers[userObj.uid]) {
        delete currentData.kickedMembers[userObj.uid];
      }

      const members = currentData.members || {};
      
      // Rejoining player with same UID
      if (members[userObj.uid]) {
        currentData.members[userObj.uid].online = true;
        if (clientIp && clientIp !== 'unknown') {
          currentData.members[userObj.uid].ip = clientIp;
        }
        currentData.lastActiveAt = Date.now();
        return currentData;
      }

      // Rejoining player with matching sessionToken (e.g. computer restarted or browser reopened with new anonymous UID)
      if (userObj.sessionToken) {
        const existingUidWithToken = Object.keys(members).find(uid => members[uid] && members[uid].sessionToken === userObj.sessionToken);
        if (existingUidWithToken && existingUidWithToken !== userObj.uid) {
          const oldMemberData = members[existingUidWithToken];
          delete currentData.members[existingUidWithToken];

          // Migrate pending orders from old UID to new UID
          if (currentData.pendingOrders) {
            Object.values(currentData.pendingOrders).forEach(order => {
              if (order && order.uid === existingUidWithToken) {
                order.uid = userObj.uid;
              }
            });
          }

          // Migrate player notification tracking maps
          ['lastSalaryReceived', 'lastDividendReceived', 'lastDebtInterestReceived', 'lastProcessedOrder'].forEach(mapKey => {
            if (currentData[mapKey] && currentData[mapKey][existingUidWithToken]) {
              currentData[mapKey][userObj.uid] = currentData[mapKey][existingUidWithToken];
              delete currentData[mapKey][existingUidWithToken];
            }
          });

          // Register new UID entry preserving portfolio and identity
          currentData.members[userObj.uid] = {
            ...oldMemberData,
            online: true,
            ip: clientIp || userObj.ip || oldMemberData.ip || 'unknown',
            lastActiveAt: Date.now()
          };

          if (currentData.savedMembers && currentData.savedMembers[userObj.sessionToken]) {
            currentData.savedMembers[userObj.sessionToken].ip = clientIp || userObj.ip || 'unknown';
            currentData.savedMembers[userObj.sessionToken].lastActiveAt = Date.now();
          }

          currentData.lastActiveAt = Date.now();
          assignedRole = oldMemberData.role || userObj.role;
          return currentData;
        }
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
        online: true,
        joinedAt: Date.now(),
        ip: clientIp || userObj.ip || 'unknown'
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

      currentData.status = 'ACTIVE';
      currentData.isReset = false;
      currentData.members[userObj.uid] = memberObj;
      currentData.lastJoinedAt = Date.now();
      currentData.lastActiveAt = Date.now();

      return currentData;
    });

    return {
      result,
      assignedRole
    };
  }

  async resetRoomWithKickAll(roomCode, resetStocks) {
    if (!roomCode) return;
    const roomRef = this.getRoomRef(roomCode);
    const boardRef = ref(this.realtimeDb, `traderHunter/boards/${roomCode}`);
    const now = Date.now();

    // Capture existing player UIDs into kickedMembers so offline/sleeping players get evicted upon return
    let kickedMembersMap = {};
    try {
      const snap = await get(roomRef);
      if (snap.exists()) {
        const val = snap.val() || {};
        const members = val.members || {};
        const savedMembers = val.savedMembers || {};
        const existingKicked = val.kickedMembers || {};
        kickedMembersMap = { ...existingKicked };

        Object.entries(members).forEach(([uid, data]) => {
          if (data && data.role === 'player') {
            kickedMembersMap[uid] = { reason: 'ROOM_RESET', kickedAt: now };
          }
        });
        Object.values(savedMembers).forEach(saved => {
          if (saved && saved.uid && saved.role === 'player') {
            kickedMembersMap[saved.uid] = { reason: 'ROOM_RESET', kickedAt: now };
          }
        });
      }
    } catch (e) {
      console.warn("[RoomRepository] Error capturing members for resetRoomWithKickAll:", e);
    }

    await update(roomRef, {
      status: 'RESET',
      isReset: true,
      resetAt: now,
      lastActiveAt: now,
      members: null,
      savedMembers: null,
      pendingOrders: null,
      gmTransferRequest: null,
      lastProcessedOrder: null,
      lastSalaryReceived: null,
      lastDividendReceived: null,
      lastDebtInterestReceived: null,
      stocks: resetStocks || null,
      kickedMembers: Object.keys(kickedMembersMap).length > 0 ? kickedMembersMap : null
    });

    if (resetStocks) {
      await set(boardRef, { stocks: resetStocks, isReset: true, resetAt: now });
    }
  }

  async checkMemberExists(roomCode, userId) {
    if (!roomCode || !userId) return false;
    try {
      const memberRef = this.getUserInBoardRef(roomCode, userId);
      const snapshot = await get(memberRef);
      return snapshot.exists();
    } catch (e) {
      console.error("[RoomRepository] Failed to check member existence on server:", e);
      return false;
    }
  }

  async verifyPlayerExistsOnServer(roomCode, userId, sessionToken = null) {
    if (!roomCode || !userId) return { exists: false, reason: 'INVALID_ARGS' };
    try {
      const memberRef = this.getUserInBoardRef(roomCode, userId);
      const memberSnap = await get(memberRef);
      if (memberSnap.exists()) {
        return {
          exists: true,
          hasMember: true,
          memberData: memberSnap.val()
        };
      }

      if (sessionToken) {
        const snapRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/savedMembers/${sessionToken}`);
        const savedSnap = await get(snapRef);
        if (savedSnap.exists()) {
          return {
            exists: true,
            hasSavedMember: true,
            savedMemberData: savedSnap.val()
          };
        }
      }

      return { exists: false, reason: 'MEMBER_NOT_FOUND' };
    } catch (e) {
      console.warn("[RoomRepository] Server verification network error, permitting active session fallback:", e);
      return { exists: true, fallback: true };
    }
  }

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
      console.warn("[RoomRepository] Could not set onDisconnect on userSession:", e);
    }
  }

  listenToUserSession(roomCode, userId, callback) {
    if (!this.realtimeDb || !roomCode || !userId) return () => {};
    const sessionRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/userSessions/${userId}`);
    return onValue(sessionRef, (snapshot) => {
      callback(snapshot.val());
    });
  }

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
      console.warn("[RoomRepository] Could not set onDisconnect on ipSession:", e);
    }
  }

  listenToIpSession(roomCode, sanitizedIp, callback) {
    if (!this.realtimeDb || !roomCode || !sanitizedIp) return () => {};
    const sessionRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/ipSessions/${sanitizedIp}`);
    return onValue(sessionRef, (snapshot) => {
      callback(snapshot.val());
    });
  }
}
