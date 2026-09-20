import { ref, get, update, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { PlayerKickService } from '../services/PlayerKickService.js';

/**
 * GovernanceRepository - Manages Realtime Database operations for GM election,
 * role transfers, player kicks, and governance state.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class GovernanceRepository {
  constructor(firebaseService) {
    this.firebaseService = firebaseService;
  }

  get realtimeDb() {
    return this.firebaseService.realtimeDb;
  }

  getRoomRef(roomCode) {
    return ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}`);
  }

  async getRoomStateSnapshot(roomCode) {
    const roomRef = this.getRoomRef(roomCode);
    return await get(roomRef);
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
      console.error("[GovernanceRepository] Failed to trigger GM transfer:", e);
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
    }, { applyLocally: false });

    return {
      result,
      claimed: claimSuccess && result.committed
    };
  }

  // Realtime Database: Directly transfer GM role to a selected player & restore former GM's player profile
  async transferGMRoleDirectly(roomCode, currentGmUid, targetPlayerUid) {
    if (!roomCode || !currentGmUid || !targetPlayerUid) {
      return { success: false, reason: 'Missing required parameters' };
    }

    const roomSnap = await this.getRoomStateSnapshot(roomCode);
    if (!roomSnap || !roomSnap.exists()) {
      return { success: false, reason: 'Room not found' };
    }
    const roomData = roomSnap.val();
    const members = roomData.members || {};

    // Validate current GM and target player exist
    if (!members[currentGmUid] || members[currentGmUid].role !== 'game_master') {
      return { success: false, reason: 'Current user is not GM' };
    }
    if (!members[targetPlayerUid] || members[targetPlayerUid].role !== 'player') {
      return { success: false, reason: 'Target user is not a player' };
    }

    // 1. Backup target player's profile and elevate target to GM
    const targetBackup = {
      displayName: members[targetPlayerUid].displayName || 'Player',
      portfolio: members[targetPlayerUid].portfolio ? JSON.parse(JSON.stringify(members[targetPlayerUid].portfolio)) : { cash: 20000 },
      timestamp: Date.now()
    };
    const targetPlayerOriginalProfile = targetBackup;

    const updates = {};

    // Target player becomes GM
    updates[`members/${targetPlayerUid}/backupPlayerProfile`] = targetBackup;
    updates[`members/${targetPlayerUid}/role`] = 'game_master';
    updates[`members/${targetPlayerUid}/displayName`] = 'GM';
    updates[`members/${targetPlayerUid}/portfolio`] = null;
    updates[`members/${targetPlayerUid}/online`] = true;

    // Clear pending orders of target player
    if (roomData.pendingOrders) {
      Object.keys(roomData.pendingOrders).forEach(orderId => {
        const order = roomData.pendingOrders[orderId];
        if (order && (order.uid === targetPlayerUid || order.userUid === targetPlayerUid)) {
          updates[`pendingOrders/${orderId}`] = null;
        }
      });
    }

    // 2. Restore former GM back to player mode
    let formerGmRestoredProfile = null;
    const gmSessionToken = members[currentGmUid]?.sessionToken;
    const savedMemberProfile = (roomData.savedMembers && gmSessionToken) ? roomData.savedMembers[gmSessionToken] : null;

    if (members[currentGmUid].backupPlayerProfile) {
      const backup = members[currentGmUid].backupPlayerProfile;
      updates[`members/${currentGmUid}/role`] = 'player';
      updates[`members/${currentGmUid}/displayName`] = backup.displayName || 'Player';
      updates[`members/${currentGmUid}/portfolio`] = backup.portfolio ? JSON.parse(JSON.stringify(backup.portfolio)) : { cash: 20000 };
      updates[`members/${currentGmUid}/backupPlayerProfile`] = null;
      updates[`members/${currentGmUid}/online`] = true;
      formerGmRestoredProfile = backup;
    } else if (savedMemberProfile && savedMemberProfile.backupPlayerProfile) {
      const backup = savedMemberProfile.backupPlayerProfile;
      updates[`members/${currentGmUid}/role`] = 'player';
      updates[`members/${currentGmUid}/displayName`] = backup.displayName || 'Player';
      updates[`members/${currentGmUid}/portfolio`] = backup.portfolio ? JSON.parse(JSON.stringify(backup.portfolio)) : { cash: 20000 };
      updates[`members/${currentGmUid}/backupPlayerProfile`] = null;
      updates[`members/${currentGmUid}/online`] = true;
      formerGmRestoredProfile = backup;
    } else {
      const existingNames = new Set(
        Object.values(members)
          .filter(m => m && m.role === 'player' && m.displayName && m !== members[currentGmUid])
          .map(m => m.displayName)
      );

      // Check if savedMemberProfile has a custom player displayName that is not 'GM' and not taken
      let resolvedName = null;
      if (savedMemberProfile && savedMemberProfile.displayName && savedMemberProfile.displayName !== 'GM' && !existingNames.has(savedMemberProfile.displayName)) {
        resolvedName = savedMemberProfile.displayName;
      }

      if (!resolvedName) {
        let nextIdx = 1;
        while (existingNames.has(`Player_${nextIdx}`)) nextIdx++;
        resolvedName = `Player_${nextIdx}`;
      }

      const restoredPortfolio = (savedMemberProfile && savedMemberProfile.portfolio) ? JSON.parse(JSON.stringify(savedMemberProfile.portfolio)) : { cash: 20000 };
      updates[`members/${currentGmUid}/role`] = 'player';
      updates[`members/${currentGmUid}/displayName`] = resolvedName;
      updates[`members/${currentGmUid}/portfolio`] = restoredPortfolio;
      updates[`members/${currentGmUid}/backupPlayerProfile`] = null;
      updates[`members/${currentGmUid}/online`] = true;
      formerGmRestoredProfile = { displayName: resolvedName, portfolio: restoredPortfolio };
    }

    // 3. Update savedMembers persistent snapshots if node exists
    if (roomData.savedMembers) {
      const targetSession = members[targetPlayerUid].sessionToken;
      if (targetSession && roomData.savedMembers[targetSession]) {
        updates[`savedMembers/${targetSession}/role`] = 'game_master';
        updates[`savedMembers/${targetSession}/displayName`] = 'GM';
        updates[`savedMembers/${targetSession}/backupPlayerProfile`] = targetBackup;
        updates[`savedMembers/${targetSession}/portfolio`] = null;
        updates[`savedMembers/${targetSession}/online`] = true;
      }

      const gmSession = members[currentGmUid].sessionToken;
      if (gmSession && roomData.savedMembers[gmSession]) {
        updates[`savedMembers/${gmSession}/role`] = 'player';
        updates[`savedMembers/${gmSession}/displayName`] = formerGmRestoredProfile.displayName;
        updates[`savedMembers/${gmSession}/portfolio`] = formerGmRestoredProfile.portfolio;
        updates[`savedMembers/${gmSession}/backupPlayerProfile`] = null;
        updates[`savedMembers/${gmSession}/online`] = true;
      }
    }

    // 4. Update handover event notification & reset transfer request
    updates['gmHandoverEvent'] = {
      fromUid: currentGmUid,
      toUid: targetPlayerUid,
      toName: targetBackup.displayName,
      timestamp: Date.now()
    };

    updates['gmTransferRequest'] = {
      active: false,
      claimedBy: targetPlayerUid,
      claimedByName: targetBackup.displayName,
      timestamp: Date.now()
    };

    const roomRef = this.getRoomRef(roomCode);
    await update(roomRef, updates);

    return {
      success: true,
      formerGmRestoredProfile,
      targetPlayerOriginalProfile
    };
  }

  // Realtime Database: Force kick a player and purge all their data from room atomically
  async kickPlayerAndPurgeData(roomCode, targetUid) {
    if (!roomCode || !targetUid) return { success: false, reason: 'Invalid parameters' };

    const roomSnap = await this.getRoomStateSnapshot(roomCode);
    if (!roomSnap || !roomSnap.exists()) {
      return { success: false, reason: 'Room not found' };
    }
    const roomData = roomSnap.val();
    const updates = PlayerKickService.buildKickPurgeUpdates(roomData, targetUid);

    const roomRef = this.getRoomRef(roomCode);
    await update(roomRef, updates);
    return { success: true };
  }

  // Realtime Database: Clear kicked player flag so they can rejoin cleanly later
  async clearKickedMember(roomCode, uid) {
    if (!roomCode || !uid) return;
    try {
      const roomRef = this.getRoomRef(roomCode);
      await update(roomRef, { [`kickedMembers/${uid}`]: null });
    } catch (e) {
      console.warn("[GovernanceRepository] Failed to clear kicked member flag:", e);
    }
  }
}
