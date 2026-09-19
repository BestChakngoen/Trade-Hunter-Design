import assert from 'node:assert';

// Mock DOM environment
global.document = {
  querySelector: (sel) => {
    return {
      style: {
        display: 'block',
        setProperty: () => {},
        removeProperty: () => {}
      },
      querySelectorAll: () => [],
      setAttribute: () => {},
      removeAttribute: () => {},
      animate: () => {}
    };
  },
  getElementById: (id) => {
    return {
      id,
      style: {
        display: 'none',
        setProperty: () => {},
        removeProperty: () => {}
      },
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
      appendChild: () => {},
      setAttribute: () => {},
      removeAttribute: () => {},
      value: '',
      textContent: '',
      disabled: false
    };
  },
  createElement: (tag) => {
    return {
      tagName: tag,
      style: {
        cssText: '',
        setProperty: () => {},
        removeProperty: () => {}
      },
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      dataset: {},
      innerHTML: '',
      textContent: '',
      children: [],
      appendChild: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => []
    };
  },
  body: {
    appendChild: () => {}
  }
};

global.window = {
  scrollY: 0,
  scrollTo: () => {},
  Swal: {
    fire: () => Promise.resolve({ isConfirmed: true })
  }
};
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);

async function runTests() {
  console.log('Testing Phase 2 Refactor: ModalsRenderer & MarketRenderer decoupling...');

  const { ModalsRenderer } = await import('../js/renderers/ModalsRenderer.js');
  const { MarketRenderer } = await import('../js/MarketRenderer.js');

  // Test 1: ModalsRenderer instantiation
  const modalsRenderer = new ModalsRenderer();
  assert.ok(modalsRenderer, 'ModalsRenderer should instantiate');
  assert.ok(modalsRenderer.playerNameModal, 'playerNameModal element should be queried');
  assert.ok(modalsRenderer.kickPlayerModal, 'kickPlayerModal element should be queried');
  assert.strictEqual(modalsRenderer.selectedKickPlayerUid, null, 'selectedKickPlayerUid starts null');
  console.log('✔ Test 1 Passed: ModalsRenderer instantiated correctly');

  // Test 2: MarketRenderer facade instantiation & sub-renderer linking
  const renderer = new MarketRenderer();
  assert.ok(renderer.modalsRenderer instanceof ModalsRenderer, 'MarketRenderer should own a ModalsRenderer instance');
  console.log('✔ Test 2 Passed: MarketRenderer holds ModalsRenderer');

  // Test 3: Backward compatibility getters
  assert.strictEqual(renderer.playerNameModal, renderer.modalsRenderer.playerNameModal, 'playerNameModal getter should proxy to modalsRenderer');
  assert.strictEqual(renderer.roleSelectionModal, renderer.modalsRenderer.roleSelectionModal, 'roleSelectionModal getter should proxy to modalsRenderer');
  assert.strictEqual(renderer.confirmResetRoomModal, renderer.modalsRenderer.confirmResetRoomModal, 'confirmResetRoomModal getter should proxy to modalsRenderer');
  assert.strictEqual(renderer.kickPlayerModal, renderer.modalsRenderer.kickPlayerModal, 'kickPlayerModal getter should proxy to modalsRenderer');
  
  // Test 3b: Getter and setter for mutable state
  renderer.selectedKickPlayerUid = 'player_123';
  assert.strictEqual(renderer.modalsRenderer.selectedKickPlayerUid, 'player_123', 'Setting selectedKickPlayerUid on renderer updates modalsRenderer');
  assert.strictEqual(renderer.selectedKickPlayerUid, 'player_123', 'Getting selectedKickPlayerUid returns updated value');
  console.log('✔ Test 3 Passed: All backward compatibility getters/setters proxy accurately');

  // Test 4: Modal methods delegation
  let errorSet = false;
  renderer.modalsRenderer.playerNameErrorText = {
    textContent: '',
    style: { display: 'none' }
  };
  renderer.showPlayerNameError('Name is too long');
  assert.strictEqual(renderer.modalsRenderer.playerNameErrorText.textContent, 'Name is too long');
  assert.strictEqual(renderer.modalsRenderer.playerNameErrorText.style.display, 'block');
  console.log('✔ Test 4 Passed: showPlayerNameError delegated properly');

  // Test 5: SweetAlert delegation
  const alertResult = await renderer.showConfirmAlert('Reset Room?', 'Are you sure?');
  assert.deepStrictEqual(alertResult, { isConfirmed: true }, 'showConfirmAlert should return Swal promise result');
  console.log('✔ Test 5 Passed: showConfirmAlert delegated properly');

  // Test 6: Kick Player state handling
  const dummyPlayers = [
    { uid: 'u1', displayName: 'Alice', cash: 5000 },
    { uid: 'u2', displayName: 'Bob', cash: 3000 }
  ];
  renderer.modalsRenderer.kickPlayerList = {
    innerHTML: '',
    appendChild: () => {},
    querySelectorAll: () => []
  };
  renderer.updateKickPlayerList(dummyPlayers);
  assert.strictEqual(renderer.modalsRenderer.currentKickEligiblePlayers.length, 2, 'Eligible players updated');
  console.log('✔ Test 6 Passed: updateKickPlayerList updates internal state');

  console.log('\nAll Phase 2 Refactoring Tests PASSED successfully! 🚀');
}

runTests().catch(err => {
  console.error('Test FAILED:', err);
  process.exit(1);
});
