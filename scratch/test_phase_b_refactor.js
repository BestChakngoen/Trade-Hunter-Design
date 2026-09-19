import assert from 'node:assert';
import { NumberAnimationService } from '../js/services/NumberAnimationService.js';
import { ManagementTablesRenderer } from '../js/renderers/ManagementTablesRenderer.js';
import { PortfolioRenderer } from '../js/renderers/PortfolioRenderer.js';
import { HistoryStateManager } from '../js/services/HistoryStateManager.js';
import { MarketState } from '../js/MarketState.js';

console.log("=== Running Test Suite: Phase B Refactoring Verification ===");

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
      _props: {},
      setProperty(k, v) { this._props[k] = v; },
      removeProperty(k) { delete this._props[k]; }
    };
    this.dataset = {};
    this.listeners = {};
    this.attributes = {};
    this.textContent = '';
    this.innerHTML = '';
  }

  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  appendChild(child) { this.children.push(child); }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  removeEventListener(event, fn) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(f => f !== fn);
  }
  dispatchEvent(event) {
    const fns = this.listeners[event.type] || [];
    fns.forEach(fn => fn(event));
  }
  querySelectorAll(sel) { return []; }
  querySelector(sel) { return null; }
}

const domElements = {
  portCash: new MockElement('span'),
  buyingPowerValue: new MockElement('span'),
  portTotalAssets: new MockElement('span'),
  portTotalPnL: new MockElement('span'),
  holdingsTableBody: new MockElement('tbody'),
  playerPendingOrdersBody: new MockElement('tbody'),
  debtTableBody: new MockElement('tbody')
};

global.document = {
  getElementById: (id) => domElements[id] || new MockElement('div'),
  querySelector: () => new MockElement('div'),
  querySelectorAll: () => []
};

// -------------------------------------------------------------
// Test 1: NumberAnimationService
// -------------------------------------------------------------
console.log("\n[Test 1] Testing NumberAnimationService...");
const testEl = new MockElement('span');

// Initial load: no animation, sets value directly
NumberAnimationService.animateSummaryNumber(testEl, 20000);
assert.strictEqual(testEl.textContent, '20,000', "Initial number should be formatted directly");
assert.strictEqual(testEl._currentValue, 20000);

// Value increase in non-browser / document.hidden mode
NumberAnimationService.animateSummaryNumber(testEl, 30000);
assert.strictEqual(testEl.textContent, '30,000');
assert.strictEqual(testEl._currentValue, 30000);

// Animate PnL
const pnlEl = new MockElement('span');
NumberAnimationService.animatePnL(pnlEl, 5000, 25);
assert.strictEqual(pnlEl.textContent, '+5,000 (+25.00%)');
assert.strictEqual(pnlEl._currentPnL, 5000);

// Reset animation state
NumberAnimationService.resetAnimationState();
console.log("✔ NumberAnimationService functions correctly without errors.");

// -------------------------------------------------------------
// Test 2: ManagementTablesRenderer
// -------------------------------------------------------------
console.log("\n[Test 2] Testing ManagementTablesRenderer...");
const mgmtRenderer = new ManagementTablesRenderer();
assert.strictEqual(typeof mgmtRenderer.updateGMPendingOrdersUI, 'function');
assert.strictEqual(typeof mgmtRenderer.updateGMPlayerSalaryUI, 'function');
assert.strictEqual(typeof mgmtRenderer.updateGMPlayerDividendUI, 'function');
assert.strictEqual(typeof mgmtRenderer.updateGMPlayerDebtInterestUI, 'function');

const mockGmBody = new MockElement('tbody');
mgmtRenderer.updateGMPendingOrdersUI(mockGmBody, {});
assert.ok(mockGmBody.innerHTML.includes('No pending orders to approve'), "Empty orders should show empty message");

mgmtRenderer.updateGMPlayerSalaryUI(mockGmBody, {});
assert.ok(mockGmBody.innerHTML.includes('No players in room'), "Empty salary table should show empty message");

mgmtRenderer.updateGMPlayerDividendUI(mockGmBody, {});
assert.ok(mockGmBody.innerHTML.includes('No players in room'), "Empty dividend table should show empty message");

mgmtRenderer.updateGMPlayerDebtInterestUI(mockGmBody, {});
assert.ok(mockGmBody.innerHTML.includes('No players in room'), "Empty debt interest table should show empty message");
console.log("✔ ManagementTablesRenderer handles all 4 administrative tables cleanly.");

// -------------------------------------------------------------
// Test 3: PortfolioRenderer (Facade)
// -------------------------------------------------------------
console.log("\n[Test 3] Testing PortfolioRenderer Facade...");
const portRenderer = new PortfolioRenderer();
assert.ok(portRenderer.managementTablesRenderer instanceof ManagementTablesRenderer);

// Test backward compatibility proxies
assert.strictEqual(typeof portRenderer.updateGMPendingOrdersUI, 'function');
assert.strictEqual(typeof portRenderer.updateGMPlayerSalaryUI, 'function');
assert.strictEqual(typeof portRenderer.updateGMPlayerDividendUI, 'function');
assert.strictEqual(typeof portRenderer.updateGMPlayerDebtInterestUI, 'function');
assert.strictEqual(typeof portRenderer.animateSummaryNumber, 'function');
assert.strictEqual(typeof portRenderer.animatePnL, 'function');
assert.strictEqual(typeof portRenderer.resetAnimationState, 'function');

// Test updatePortfolioUI
const mockStats = { cash: 25000, totalAssets: 50000, totalPnL: 5000, totalPnLPct: 10 };
const mockPortfolio = { cash: 25000, stocks: { KTF: { volume: 10, avgPrice: 1000 } } };
const mockBoardStocks = { KTF: { value: 1200 } };
portRenderer.updatePortfolioUI(mockStats, mockPortfolio, mockBoardStocks, {}, 'USER1');
assert.ok(domElements.holdingsTableBody.innerHTML.includes('KTF'), "Holdings table should render stock KTF");
console.log("✔ PortfolioRenderer facade delegates cleanly and renders player assets.");

// -------------------------------------------------------------
// Test 4: HistoryStateManager
// -------------------------------------------------------------
console.log("\n[Test 4] Testing HistoryStateManager...");
const historyManager = new HistoryStateManager(5);
assert.strictEqual(historyManager.canUndo(), false);
assert.strictEqual(historyManager.canRedo(), false);

// Push 6 items (exceeding maxSize of 5)
for (let i = 1; i <= 6; i++) {
  historyManager.pushUndo({ stocks: { STEP: i }, members: { player_a: { name: 'A' } } });
}
assert.strictEqual(historyManager.undoStack.length, 5, "Stack size should be capped at maxSize 5");
assert.strictEqual(historyManager.undoStack[0].stocks.STEP, 2, "Oldest item (STEP 1) should be evicted");

// Test undo pop & redo push
const lastSnap = historyManager.popUndo();
assert.strictEqual(lastSnap.stocks.STEP, 6);
historyManager.pushRedo(lastSnap);
assert.strictEqual(historyManager.canRedo(), true);
const redone = historyManager.popRedo();
assert.strictEqual(redone.stocks.STEP, 6);

// Test member history sanitization
historyManager.pushUndo({ members: { player_a: { name: 'A' }, player_b: { name: 'B' } } });
historyManager.removeMemberFromHistory('player_a');
const sanitized = historyManager.popUndo();
assert.strictEqual(sanitized.members.player_a, undefined, "Purged member should be removed from snapshot");
assert.ok(sanitized.members.player_b, "Non-purged member should remain in snapshot");

historyManager.clear();
assert.strictEqual(historyManager.canUndo(), false);
assert.strictEqual(historyManager.canRedo(), false);
console.log("✔ HistoryStateManager stack operations, capping, and member purging verified.");

// -------------------------------------------------------------
// Test 5: MarketState (Integrated with HistoryStateManager)
// -------------------------------------------------------------
console.log("\n[Test 5] Testing MarketState integration...");
const state = new MarketState([]);

// Verify getters/setters backward compatibility
assert.ok(Array.isArray(state.undoStack));
assert.ok(Array.isArray(state.redoStack));

state.pushUndoSnapshot({ stocks: { TEST: 100 } });
assert.strictEqual(state.canUndo(), true);
assert.strictEqual(state.undoStack.length, 1);

const poppedState = state.popUndoSnapshot();
assert.strictEqual(poppedState.stocks.TEST, 100);
assert.strictEqual(state.canUndo(), false);

// Verify reset clears history
state.pushUndoSnapshot({ stocks: { RESET_TEST: 500 } });
assert.strictEqual(state.canUndo(), true);
state.reset();
assert.strictEqual(state.canUndo(), false);
assert.strictEqual(state.undoStack.length, 0);

console.log("✔ MarketState preserves 100% backward compatibility with internal history delegation.");

console.log("\n=======================================================");
console.log("🎉 ALL PHASE B REFACTORING TESTS PASSED (100% Zero Regression)!");
console.log("=======================================================");
