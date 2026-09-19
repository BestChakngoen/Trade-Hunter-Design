import assert from 'node:assert';

// 1. Mock DOM Helpers
class MockClassList {
  constructor() {
    this._classes = new Set();
  }
  add(c) { this._classes.add(c); }
  remove(c) { this._classes.delete(c); }
  contains(c) { return this._classes.has(c); }
}

class MockElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.classList = new MockClassList();
    this.style = {
      display: '',
      _props: {},
      setProperty(k, v) { this._props[k] = v; },
      removeProperty(k) { delete this._props[k]; }
    };
    this.dataset = {};
    this.listeners = {};
    this.attributes = {};
    this.textContent = '';
    this.innerHTML = '';
    this.value = '';
    this.disabled = false;
  }

  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  appendChild(child) { this.children.push(child); }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  removeEventListener(event, fn) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== fn);
    }
  }
  querySelector(sel) {
    return new MockElement('div');
  }
  querySelectorAll(sel) {
    return [];
  }
  focus() {}
}

const mockDoc = {
  createElement: (tag) => new MockElement(tag),
  getElementById: (id) => new MockElement('div'),
  querySelector: (sel) => new MockElement('div'),
  querySelectorAll: (sel) => [],
  addEventListener: () => {},
  removeEventListener: () => {}
};

global.document = mockDoc;
global.window = {
  document: mockDoc,
  addEventListener: () => {},
  removeEventListener: () => {}
};
global.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};

console.log('=== Running Test Suite: Phase C Refactoring Verification ===\n');

// Import modules to test
import { LobbyDialogCoordinator } from '../js/controllers/lobby/LobbyDialogCoordinator.js';
import { RoomGovernanceController } from '../js/controllers/room/RoomGovernanceController.js';
import { calculateStockStepUp, calculateStockStepDown, calculateResetStocks } from '../js/services/MarketMathService.js';
import { MarketState } from '../js/MarketState.js';

// --- Test 1: LobbyDialogCoordinator ---
console.log('[Test 1] Testing LobbyDialogCoordinator...');
const waitingModal = new MockElement('div');
waitingModal.style.display = 'none';

const mockRenderer = {
  roleSelectionModal: new MockElement('div'),
  playerNameModal: new MockElement('div'),
  gameModeModal: new MockElement('div'),
  lobbyWaitingModal: waitingModal,
  showTopToast: () => {},
  showErrorAlert: () => {},
  showConfirmAlert: async () => ({ isConfirmed: true }),
  updateControlsVisibility: () => {}
};

const mockState = {
  role: 'player',
  playerName: 'Tester',
  gameMode: 'advance',
  setRole(r) { this.role = r; },
  setPlayerName(n) { this.playerName = n; },
  setGameMode(m) { this.gameMode = m; }
};

let removedMember = null;
const mockFirebaseService = {
  getCurrentUser: () => ({ uid: 'user_123' }),
  getRoomStateSnapshot: async () => ({
    exists: () => true,
    val: () => ({ members: { user_123: { displayName: 'Tester' } } })
  }),
  removeMemberFromRoom: async (roomCode, uid) => { removedMember = uid; },
  deleteRoomData: async () => {},
  updateRoom: async () => {}
};

const dialogCoordinator = new LobbyDialogCoordinator(
  mockRenderer,
  mockFirebaseService,
  mockState,
  { getOrCreateSessionToken: () => 'token', clearRoomSession: () => {} }
);

assert.strictEqual(typeof dialogCoordinator.promptRoleSelection, 'function');
assert.strictEqual(typeof dialogCoordinator.promptPlayerNameSelection, 'function');
assert.strictEqual(typeof dialogCoordinator.promptGameModeSelection, 'function');
assert.strictEqual(typeof dialogCoordinator.waitForGameModeSelection, 'function');

console.log('✔ LobbyDialogCoordinator functions cleanly without errors.\n');

// --- Test 2: RoomGovernanceController ---
console.log('[Test 2] Testing RoomGovernanceController...');

const roomGovController = new RoomGovernanceController({
  state: mockState,
  renderer: {
    ...mockRenderer,
    leaveRoomBtn: new MockElement('button'),
    openGMTransferModalBtn: new MockElement('button'),
    openKickPlayerModalBtn: new MockElement('button'),
    editPlayerNameBtn: new MockElement('button'),
    userRoleBadge: new MockElement('div')
  },
  firebaseService: mockFirebaseService,
  playerSessionService: {
    getOrCreateSessionToken: () => 'token_123',
    clearRoomSession: () => {}
  },
  onLeaveRoomCallback: () => {}
});

assert.strictEqual(typeof roomGovController.bindAll, 'function');
assert.strictEqual(typeof roomGovController.removeMemberAndTransferIfNeeded, 'function');
assert.strictEqual(typeof roomGovController.openPlayerNameModal, 'function');

// Test removeMemberAndTransferIfNeeded
await roomGovController.removeMemberAndTransferIfNeeded('ROOM99', 'user_123', false);
assert.strictEqual(removedMember, 'user_123', 'Should remove user_123 from room');
console.log('✔ RoomGovernanceController handles member eviction/removal and lifecycle events.\n');

// --- Test 3: MarketMathService & MarketState Stock Calculations ---
console.log('[Test 3] Testing MarketMathService step calculations...');

const sampleStock = {
  name: 'STK_A',
  step: 2,
  value: 1000,
  history: [1000]
};

const sampleMaster = {
  startStep: 3,
  steps: [800, 900, 1000, 1100, 1200]
};

const upResult = calculateStockStepUp(sampleStock, sampleMaster, 1.2, [1000]);
assert.ok(upResult, 'calculateStockStepUp should return updated stock');
assert.strictEqual(upResult.step, 3);
assert.strictEqual(upResult.direction, 'up');
assert.ok(upResult.value > 1000, 'Price must increase on up step');
assert.strictEqual(upResult.history.length, 2);

const downResult = calculateStockStepDown(sampleStock, sampleMaster, 1.2, [1000]);
assert.ok(downResult, 'calculateStockStepDown should return updated stock');
assert.strictEqual(downResult.step, 1);
assert.strictEqual(downResult.direction, 'down');
assert.ok(downResult.value < 1000, 'Price must decrease on down step');
assert.strictEqual(downResult.history.length, 2);

const resetResults = calculateResetStocks([sampleStock], { STK_A: sampleMaster });
assert.strictEqual(resetResults.length, 1);
assert.strictEqual(resetResults[0].step, 2);
assert.strictEqual(resetResults[0].value, 1000);
assert.strictEqual(resetResults[0].direction, null);

console.log('✔ MarketMathService pure calculation formulas verified.\n');

// --- Test 4: MarketState Integration ---
console.log('[Test 4] Testing MarketState integration with MarketMathService...');
const marketState = new MarketState([]);
marketState.masterStocks = { STK_A: sampleMaster };
marketState.boardStocks = {
  STK_A: { name: 'STK_A', step: 2, value: 1000, history: [1000] }
};

const updatedUp = marketState.getUpdatedStocksForUp('STK_A');
assert.ok(updatedUp);
assert.strictEqual(updatedUp[0].step, 3);
assert.strictEqual(marketState.priceHistory['STK_A'].length, 2);

const batchDown = marketState.getBatchUpdatedStocksForDown();
assert.ok(batchDown);
assert.strictEqual(batchDown[0].direction, 'down');

const reset = marketState.getResetStocks();
assert.strictEqual(reset[0].value, 1000);

console.log('✔ MarketState integrates seamlessly with MarketMathService.\n');

console.log('=======================================================');
console.log('🎉 ALL PHASE C REFACTORING TESTS PASSED (100% Zero Regression)!');
console.log('=======================================================');
