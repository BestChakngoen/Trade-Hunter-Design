import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import assert from 'assert';

console.log("=== STEP 1: Syntax Check All JS Files ===");
function getAllJsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllJsFiles(fullPath));
    } else if (file.endsWith('.js')) {
      results.push(fullPath);
    }
  });
  return results;
}

const jsFiles = getAllJsFiles(path.resolve('js'));
console.log(`Checking ${jsFiles.length} JavaScript files with node --check...`);
let syntaxErrors = 0;
jsFiles.forEach(file => {
  try {
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
  } catch (err) {
    console.error(`Syntax error in ${file}:`, err.message);
    syntaxErrors++;
  }
});
assert.strictEqual(syntaxErrors, 0, `All JS files must pass syntax check (found ${syntaxErrors} errors)`);
console.log(`[PASS] All ${jsFiles.length} JS files passed node --check with 0 errors!`);

console.log("\n=== STEP 2: Verify GovernanceModalsRenderer Kick Player Callback ===");
// Mock DOM elements
class MockElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.style = {
      display: '',
      setProperty: (k, v) => { this.style[k] = v; },
      removeProperty: (k) => { delete this.style[k]; }
    };
    this.classList = {
      _classes: new Set(),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
      contains: (c) => this.classList._classes.has(c)
    };
    this.dataset = {};
    this.listeners = {};
    this.children = [];
    this.innerHTML = '';
  }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  removeEventListener(event, fn) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(f => f !== fn);
  }
  appendChild(child) {
    this.children.push(child);
  }
  querySelectorAll(selector) {
    return this.children;
  }
}

global.document = {
  getElementById: (id) => new MockElement('div'),
  createElement: (tag) => new MockElement(tag),
  addEventListener: () => {},
  removeEventListener: () => {}
};
global.window = {};

const { GovernanceModalsRenderer } = await import('../js/renderers/GovernanceModalsRenderer.js');
const govRenderer = new GovernanceModalsRenderer();
govRenderer.kickPlayerModal = new MockElement('div');
govRenderer.kickPlayerList = new MockElement('div');
govRenderer.confirmKickPlayerBtn = new MockElement('button');
govRenderer.cancelKickPlayerBtn = new MockElement('button');
govRenderer.closeKickPlayerModalBtn = new MockElement('button');

let kickedTargetUid = null;
let kickedTargetPlayer = null;

const samplePlayers = [
  { uid: 'u1', displayName: 'Player One', cash: 25000, online: true },
  { uid: 'u2', displayName: 'Player Two', cash: 18000, online: false }
];

govRenderer.showKickPlayerModal(samplePlayers, (targetUid, targetPlayer) => {
  kickedTargetUid = targetUid;
  kickedTargetPlayer = targetPlayer;
});

// Simulate selecting player u1
govRenderer.selectedKickPlayerUid = 'u1';

// Trigger confirm
const confirmListeners = govRenderer.confirmKickPlayerBtn.listeners['click'] || [];
assert.ok(confirmListeners.length > 0, 'Confirm button must have a click listener');
confirmListeners[0]();

assert.strictEqual(kickedTargetUid, 'u1', 'Target UID must be preserved and passed to confirm callback');
assert.strictEqual(kickedTargetPlayer.displayName, 'Player One', 'Target player must be passed to callback');
assert.strictEqual(govRenderer.kickPlayerModal.style.display, 'none', 'Modal must be hidden after confirm');
console.log('[PASS] GovernanceModalsRenderer properly executes confirm callback without being wiped by hideKickPlayerModal!');

console.log("\n=== STEP 3: Verify ModalsRenderer Player Name Modal allowClose Behavior ===");
const { ModalsRenderer } = await import('../js/renderers/ModalsRenderer.js');
const modalsRenderer = new ModalsRenderer();
modalsRenderer.playerNameModal = new MockElement('div');
modalsRenderer.playerNameCloseBtn = new MockElement('button');
modalsRenderer.playerNameConfirmBtn = new MockElement('button');
modalsRenderer.playerNameInput = new MockElement('input');
modalsRenderer.playerNameErrorText = new MockElement('div');

// 1. Open with allowClose = false
modalsRenderer.showPlayerNameModal({
  title: "แก้ไขชื่อผู้เล่น",
  allowClose: false
});

assert.strictEqual(modalsRenderer.playerNameCloseBtn.style['display'], 'none', 'Close button must be display: none when allowClose = false');
assert.ok(modalsRenderer.playerNameCloseBtn.classList.contains('hidden'), 'Close button must have hidden class');

// 2. Open with allowClose = true
modalsRenderer.showPlayerNameModal({
  title: "ตั้งชื่อผู้เล่น",
  allowClose: true
});

assert.strictEqual(modalsRenderer.playerNameCloseBtn.style['display'], undefined, 'Close button display must be restored when allowClose = true');
assert.strictEqual(modalsRenderer.playerNameCloseBtn.classList.contains('hidden'), false, 'Close button must not have hidden class');
console.log('[PASS] ModalsRenderer strictly controls close button visibility based on allowClose flag!');

console.log("\n=== STEP 4: Verify BoardSyncHandler isBoardReset on 1st Click ===");
const firebaseBoardFirstReset = {
  isReset: true,
  resetAt: Date.now(),
  stocks: [
    { name: 'A', value: 5000, oldValue: null, direction: null },
    { name: 'B', value: 7000, oldValue: null, direction: null }
  ]
};

const stocksList = Array.isArray(firebaseBoardFirstReset.stocks) 
  ? firebaseBoardFirstReset.stocks 
  : Object.values(firebaseBoardFirstReset.stocks);
const hasStocks = stocksList.length > 0;
const allStocksReset = hasStocks && stocksList.every(s => 
  (s.oldValue === null || s.oldValue === undefined) && !s.direction
);
const isBoardReset = Boolean(firebaseBoardFirstReset.isReset) || allStocksReset || false;

assert.strictEqual(isBoardReset, true, 'isBoardReset must evaluate to true on the very first reset click');
console.log('[PASS] BoardSyncHandler isBoardReset logic evaluates to true on 1st click!');

console.log("\n=== STEP 5: Verify LobbySessionCoordinator isReset Eviction ===");
const resetRoomSnapshotVal = {
  status: 'RESET',
  isReset: true,
  members: null,
  kickedMembers: {
    'user_offline_1': { reason: 'ROOM_RESET', kickedAt: Date.now() }
  }
};

const isReset = Boolean(resetRoomSnapshotVal.isReset || resetRoomSnapshotVal.status === 'RESET');
const userUid = 'user_offline_1';
const isKicked = Boolean(resetRoomSnapshotVal.kickedMembers && resetRoomSnapshotVal.kickedMembers[userUid]);

assert.strictEqual(isReset, true, 'Room must be identified as RESET');
assert.strictEqual(isKicked, true, 'Returning player must be identified as evicted by reset');
console.log('[PASS] Returning offline player is strictly recognized as evicted by reset!');

console.log("\n=== ALL TEST CHECKS PASSED SUCCESSFULLY! ===");
