import assert from 'node:assert';
import { LobbySessionCoordinator } from '../js/controllers/lobby/LobbySessionCoordinator.js';

async function runTests() {
  console.log("Running Reset Room Purge Verification Tests...");

  let deletedRooms = [];
  let clearedSessions = [];

  const mockFirebase = {
    checkRoomExists: async () => true,
    getRoomStateSnapshot: async (code) => {
      if (code === 'RESET_ROOM') {
        return {
          exists: () => true,
          val: () => ({
            status: 'RESET',
            isReset: true,
            members: null,
            kickedMembers: { 'user_1': { reason: 'ROOM_RESET' } }
          })
        };
      }
      if (code === 'KICKED_ROOM') {
        return {
          exists: () => true,
          val: () => ({
            status: 'ACTIVE',
            isReset: false,
            members: { 'other_user': { role: 'player' } },
            kickedMembers: { 'user_1': { reason: 'KICKED' } }
          })
        };
      }
      if (code === 'NORMAL_ROOM') {
        return {
          exists: () => true,
          val: () => ({
            status: 'ACTIVE',
            isReset: false,
            members: { 'other_user': { role: 'game_master' } }
          })
        };
      }
      return { exists: () => false, val: () => null };
    },
    getCurrentUser: () => ({ uid: 'user_1' }),
    deleteRoomData: async (code) => {
      deletedRooms.push(code);
    },
    clearKickedMember: async () => {}
  };

  const mockSessionLock = {
    fetchPublicIp: async () => '127.0.0.1',
    checkIpLimit: async () => true,
    getClientIp: async () => '127.0.0.1'
  };

  const mockPlayerSession = {
    clearRoomSession: (code) => {
      clearedSessions.push(code);
    },
    getOrCreateSessionToken: () => null
  };

  const coordinator = new LobbySessionCoordinator(mockFirebase, mockSessionLock, mockPlayerSession);

  // Test 1: Reset Room should be purged and allow fresh room creation
  const resetRes = await coordinator.inspectRoomAndSession('RESET_ROOM');
  assert.strictEqual(resetRes.isAllowed, true, 'User should be allowed into reset room to recreate it');
  assert.strictEqual(resetRes.roomExists, false, 'Reset room should be marked as non-existent (fresh slate)');
  assert.strictEqual(deletedRooms.includes('RESET_ROOM'), true, 'deleteRoomData should have been called on RESET_ROOM');
  assert.strictEqual(clearedSessions.includes('RESET_ROOM'), true, 'clearRoomSession should have been called');
  console.log("✔ Test 1 Passed: Reset room is safely purged and treated as fresh room for recreation!");

  // Test 2: Individually Kicked user from an active room should still be blocked
  const kickedRes = await coordinator.inspectRoomAndSession('KICKED_ROOM');
  assert.strictEqual(kickedRes.isAllowed, false, 'Individually kicked user should be denied');
  assert.strictEqual(kickedRes.reason, 'KICKED', 'Reason should be KICKED');
  assert.strictEqual(kickedRes.roomExists, true, 'Active room still exists');
  console.log("✔ Test 2 Passed: Individually kicked user remains blocked from active room!");

  // Test 3: Normal active room allows normal join
  const normalRes = await coordinator.inspectRoomAndSession('NORMAL_ROOM');
  assert.strictEqual(normalRes.isAllowed, true, 'Normal room is allowed');
  assert.strictEqual(normalRes.roomExists, true, 'Normal room exists');
  assert.strictEqual(normalRes.hasActiveGM, true, 'Active GM is recognized');
  console.log("✔ Test 3 Passed: Normal active room allows entry normally!");

  console.log("All Reset Room Purge Tests PASSED successfully! 🚀");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
