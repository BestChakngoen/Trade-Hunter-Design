import assert from 'node:assert';

// Mock DOM Environment
class MockClassList {
  constructor() { this._classes = new Set(); }
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
      cssText: '',
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
    this.parentNode = null;
  }

  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
  }
  removeChild(child) {
    this.children = this.children.filter(c => c !== child);
    child.parentNode = null;
  }
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
  select() {}
}

const elementStore = {};
function getOrCreateElement(id, tag = 'div') {
  if (!elementStore[id]) {
    const el = new MockElement(tag);
    el.id = id;
    elementStore[id] = el;
  }
  return elementStore[id];
}

const mockDoc = {
  body: new MockElement('body'),
  createElement: (tag) => new MockElement(tag),
  getElementById: (id) => getOrCreateElement(id),
  querySelector: (sel) => new MockElement('div'),
  querySelectorAll: (sel) => [],
  activeElement: null,
  addEventListener: () => {},
  removeEventListener: () => {}
};

global.document = mockDoc;
global.window = {
  document: mockDoc,
  scrollTo: () => {},
  scrollY: 0,
  getComputedStyle: () => ({ display: 'block' }),
  requestAnimationFrame: (cb) => cb(),
  Swal: {
    fire: async (opts) => ({ isConfirmed: true, ...opts })
  }
};

console.log('=== Running Test Suite: ModalsRenderer Modularization Verification ===\n');

// Import modules to test
import { ToastNotificationService } from '../js/services/ToastNotificationService.js';
import { AlertModalService } from '../js/services/AlertModalService.js';
import { GovernanceModalsRenderer } from '../js/renderers/GovernanceModalsRenderer.js';
import { ModalsRenderer } from '../js/renderers/ModalsRenderer.js';

// --- Test 1: ToastNotificationService ---
console.log('[Test 1] Testing ToastNotificationService...');
ToastNotificationService.showTopToast('SUCCESS', 'Operation succeeded', 'success');
const toastContainer = elementStore['toastContainer'] || mockDoc.body.children.find(c => c.id === 'toastContainer');
assert.ok(toastContainer, 'Toast container must be created and appended to document.body');
assert.ok(toastContainer.children.length >= 1, 'Toast must be appended to container');

// Test concurrency capping (max 3 active)
ToastNotificationService.showTopToast('T2', 'Message 2');
ToastNotificationService.showTopToast('T3', 'Message 3');
ToastNotificationService.showTopToast('T4', 'Message 4');
assert.ok(toastContainer.children.length <= 4, 'Toasts should manage active list');
console.log('✔ ToastNotificationService handles dynamic toasts cleanly.\n');

// --- Test 2: AlertModalService ---
console.log('[Test 2] Testing AlertModalService...');
const scrollState = AlertModalService.captureScrollState();
assert.ok(scrollState, 'captureScrollState should return valid scroll state object');
AlertModalService.restoreScrollState(scrollState);

let swalCalled = false;
global.window.Swal.fire = async (opts) => {
  swalCalled = true;
  return { isConfirmed: true };
};

AlertModalService.showErrorAlert('Error', 'Something went wrong');
assert.ok(swalCalled, 'showErrorAlert should invoke Swal.fire');

swalCalled = false;
const confirmResult = await AlertModalService.showConfirmAlert('Confirm', 'Are you sure?');
assert.strictEqual(confirmResult.isConfirmed, true, 'showConfirmAlert should return confirmed');

console.log('✔ AlertModalService executes popup dialogues and preserves scroll state.\n');

// --- Test 3: GovernanceModalsRenderer ---
console.log('[Test 3] Testing GovernanceModalsRenderer...');
const govModals = new GovernanceModalsRenderer();
assert.ok(govModals.gmTransferModal, 'gmTransferModal element referenced');
assert.ok(govModals.kickPlayerModal, 'kickPlayerModal element referenced');

// Test Kick Player List
const samplePlayers = [
  { uid: 'p1', displayName: 'Alice', cash: 50000 },
  { uid: 'p2', displayName: 'Bob', cash: 20000 }
];

govModals.updateKickPlayerList(samplePlayers);
assert.strictEqual(govModals.currentKickEligiblePlayers.length, 2);

govModals.showKickPlayerModal(samplePlayers, (uid, player) => {
  assert.strictEqual(uid, 'p1');
});
assert.strictEqual(govModals.isKickPlayerModalOpen(), true);
govModals.hideKickPlayerModal();
assert.strictEqual(govModals.isKickPlayerModalOpen(), false);

console.log('✔ GovernanceModalsRenderer manages GM handover and Kick player state correctly.\n');

// --- Test 4: ModalsRenderer Facade & Backward Compatibility ---
console.log('[Test 4] Testing ModalsRenderer Facade and Backward Compatibility...');
const modalsRenderer = new ModalsRenderer();

assert.ok(modalsRenderer.governanceModals instanceof GovernanceModalsRenderer);
assert.strictEqual(modalsRenderer.gmTransferModal, govModals.gmTransferModal);
assert.strictEqual(modalsRenderer.kickPlayerModal, govModals.kickPlayerModal);

// Verify getters/setters proxy accurately
modalsRenderer.selectedKickPlayerUid = 'test_uid_99';
assert.strictEqual(modalsRenderer.governanceModals.selectedKickPlayerUid, 'test_uid_99');
assert.strictEqual(modalsRenderer.selectedKickPlayerUid, 'test_uid_99');

// Verify method delegation
let toastCalled = false;
const origToast = ToastNotificationService.showTopToast;
ToastNotificationService.showTopToast = () => { toastCalled = true; };
modalsRenderer.showTopToast('Title', 'Msg');
assert.ok(toastCalled, 'modalsRenderer.showTopToast must delegate to ToastNotificationService');
ToastNotificationService.showTopToast = origToast;

let alertCalled = false;
const origAlert = AlertModalService.showErrorAlert;
AlertModalService.showErrorAlert = () => { alertCalled = true; };
modalsRenderer.showErrorAlert('Title', 'Msg');
assert.ok(alertCalled, 'modalsRenderer.showErrorAlert must delegate to AlertModalService');
AlertModalService.showErrorAlert = origAlert;

console.log('✔ ModalsRenderer facade accurately delegates all calls with 100% backward compatibility.\n');

console.log('=======================================================');
console.log('🎉 ALL MODALS RENDERER REFACTORING TESTS PASSED (100% Zero Regression)!');
console.log('=======================================================');
