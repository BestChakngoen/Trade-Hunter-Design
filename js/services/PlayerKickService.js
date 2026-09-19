/**
 * PlayerKickService - Manages player kick operations, data purging, and eligible player filtering.
 * 
 * Follows Single Responsibility Principle (SRP):
 * Dedicated purely to player eviction logic, eligible candidate determination, and atomic data purge preparation.
 */
export class PlayerKickService {
  /**
   * Filters and formats active players in the room who can be kicked by the GM.
   * Excludes the GM themselves.
   * 
   * @param {Object} members Room members dictionary
   * @param {string} currentGmUid Current GM user id
   * @returns {Array<Object>} List of kickable player objects
   */
  static getEligiblePlayers(members, currentGmUid) {
    if (!members || typeof members !== 'object') return [];

    return Object.entries(members)
      .filter(([uid, data]) => uid !== currentGmUid && data && data.role === 'player')
      .map(([uid, data]) => ({
        uid,
        displayName: data.displayName || 'Player',
        cash: data.portfolio?.cash ?? 20000,
        stocks: data.portfolio?.stocks || {},
        debt: data.portfolio?.debt || {},
        sessionToken: data.sessionToken || null,
        joinedAt: data.joinedAt || 0,
        online: data.online !== false
      }));
  }

  /**
   * Builds an atomic update dictionary for Firebase Realtime Database
   * to purge all traces of a kicked player from the room:
   * 1. Remove active member node (members/{uid})
   * 2. Remove persistent session snapshots (savedMembers/{sessionToken})
   * 3. Remove all pending buy/sell/debt orders submitted by the player
   * 4. Record a kick signal in kickedMembers/{uid} for instant client eviction
   * 
   * @param {Object} roomData Current snapshot value of the game room
   * @param {string} targetUid User ID of the player to kick
   * @returns {Object} Atomic update map
   */
  static buildKickPurgeUpdates(roomData, targetUid) {
    if (!roomData || !targetUid) return {};

    const updates = {};

    // 1. Remove active member node
    updates[`members/${targetUid}`] = null;

    // 2. Identify and purge all savedMembers session snapshots for this user
    const memberObj = roomData.members ? roomData.members[targetUid] : null;
    const memberSessionToken = memberObj ? memberObj.sessionToken : null;

    if (memberSessionToken) {
      updates[`savedMembers/${memberSessionToken}`] = null;
    }

    if (roomData.savedMembers && typeof roomData.savedMembers === 'object') {
      Object.entries(roomData.savedMembers).forEach(([token, saved]) => {
        if (
          saved &&
          (saved.uid === targetUid ||
           saved.userId === targetUid ||
           saved.userUid === targetUid ||
           token === memberSessionToken)
        ) {
          updates[`savedMembers/${token}`] = null;
        }
      });
    }

    // 3. Remove all pending orders submitted by the target player
    if (roomData.pendingOrders && typeof roomData.pendingOrders === 'object') {
      Object.entries(roomData.pendingOrders).forEach(([orderId, order]) => {
        if (
          order &&
          (order.userId === targetUid ||
           order.uid === targetUid ||
           order.userUid === targetUid ||
           order.playerUid === targetUid)
        ) {
          updates[`pendingOrders/${orderId}`] = null;
        }
      });
    }

    // 4. Record kicked signal for real-time listener detection
    updates[`kickedMembers/${targetUid}`] = {
      reason: 'GM_KICKED',
      kickedAt: Date.now()
    };

    return updates;
  }
}
