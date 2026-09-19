import assert from 'node:assert';

// Mock Browser and DOM Environment
global.document = {
  querySelector: (sel) => ({
    style: { display: 'block', setProperty: () => {}, removeProperty: () => {} },
    querySelectorAll: () => [],
    setAttribute: () => {},
    removeAttribute: () => {},
    animate: () => {}
  }),
  getElementById: (id) => ({
    id,
    style: { display: 'none', setProperty: () => {}, removeProperty: () => {} },
    classList: { add: () => {}, remove: () => {}, contains: () => false },
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
  }),
  createElement: (tag) => ({
    tagName: tag,
    style: { cssText: '', setProperty: () => {}, removeProperty: () => {} },
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    dataset: {},
    innerHTML: '',
    textContent: '',
    children: [],
    appendChild: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => []
  }),
  body: { appendChild: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {}
};

global.window = {
  scrollY: 0,
  scrollTo: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  history: { pushState: () => {} },
  location: { reload: () => {} },
  Swal: { fire: () => Promise.resolve({ isConfirmed: true }) }
};
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);

async function runTests() {
  console.log('Testing Phase 3 Refactor: BoardSyncHandler, RoomSyncHandler, AppLifecycleService & MarketController facade...');

  const { BoardSyncHandler } = await import('../js/controllers/sync/BoardSyncHandler.js');
  const { RoomSyncHandler } = await import('../js/controllers/sync/RoomSyncHandler.js');
  const { AppLifecycleService } = await import('../js/services/AppLifecycleService.js');
  const { MarketController } = await import('../js/MarketController.js');

  // Mock Dependencies
  const mockState = {
    roomCode: 'ROOM123',
    role: 'player',
    playerName: 'Player_1',
    gameMode: 'advance',
    boardStocks: {
      'TEST': { name: 'TEST', value: 100 }
    },
    masterStocks: {},
    originalCards: [],
    initialPrices: { 'TEST': 100 },
    priceHistory: {},
    portfolio: { cash: 10000, stocks: {} },
    pendingOrders: {},
    getPortfolioStats: () => ({ totalAssets: 10000, cash: 10000, unrealizedPL: 0 }),
    updateFromFirebaseBoard: () => {},
    updatePendingOrders: () => {},
    updatePortfolioFromMemberData: () => {},
    reset: () => {},
    setRole: (r) => { mockState.role = r; },
    setPlayerName: (n) => { mockState.playerName = n; },
    setGameMode: (m) => { mockState.gameMode = m; }
  };

  const mockRenderer = {
    state: null,
    priceGrid: null,
    originalCards: [],
    applyBetaColors: () => {},
    applyPriceColors: () => {},
    updateCardValue: () => {},
    updatePortfolioUI: () => {},
    updateDebtInstrumentsUI: () => {},
    updatePlayerPendingOrdersUI: () => {},
    updateGMPendingOrdersUI: () => {},
    updateGMPlayerSalaryUI: () => {},
    updateGMPlayerDividendUI: () => {},
    updateGMPlayerDebtInterestUI: () => {},
    updateRoomMembersUI: () => {},
    updateControlsVisibility: () => {},
    updateSpectatorButtonUI: () => {},
    showTopToast: () => {},
    showErrorAlert: () => {},
    showConfirmAlert: () => Promise.resolve({ isConfirmed: true }),
    showAutoDismissModal: () => {},
    hideGMTransferModal: () => {},
    hideKickPlayerModal: () => {},
    hidePlayerNameModal: () => {},
    showLobby: () => {},
    ensureViewGraphButtons: () => {},
    applyBetaColors: () => {},
    bindTabEvents: () => {},
    payAllDividendBtn: null,
    lobbyForm: null
  };

  let boardListenerCb = null;
  let roomListenerCb = null;

  const mockFirebase = {
    getCurrentUser: () => ({ uid: 'user_abc' }),
    listenToBoard: (code, cb) => {
      boardListenerCb = cb;
      return () => { boardListenerCb = null; };
    },
    listenToRoom: (code, cb) => {
      roomListenerCb = cb;
      return () => { roomListenerCb = null; };
    },
    updateRoom: async () => {},
    deleteRoomData: async () => {},
    clearKickedMember: async () => {},
    removeMemberFromRoom: async () => {},
    setMemberOnlineStatus: async () => {},
    triggerGMTransfer: async () => {},
    getRoomStateSnapshot: async () => ({ exists: () => true, val: () => ({ members: {} }) })
  };

  // Test 1: BoardSyncHandler instantiation and event flow
  let soundPlayed = false;
  const mockSound = {
    playRaisePrice: () => { soundPlayed = true; },
    playDownPrice: () => { soundPlayed = true; },
    playApprove: () => {},
    playReject: () => {},
    playReceiveMoney: () => {},
    playWarning: () => {}
  };

  const boardHandler = new BoardSyncHandler({
    state: mockState,
    renderer: mockRenderer,
    firebaseService: mockFirebase,
    soundService: mockSound,
    tradeController: { updateTradeFormPrice: () => {} }
  });

  boardHandler.activate('ROOM123');
  assert.strictEqual(typeof boardListenerCb, 'function', 'listenToBoard callback should be registered');
  
  // Simulate board price update
  boardListenerCb({
    stocks: [{ name: 'TEST', value: 120, oldValue: 100 }]
  });
  assert.strictEqual(boardHandler.hasReceivedInitialBoard, true, 'hasReceivedInitialBoard should be true');
  boardHandler.unsubscribe();
  assert.strictEqual(boardListenerCb, null, 'Board listener should unsubscribe');
  console.log('✔ Test 1 Passed: BoardSyncHandler activates, processes updates, and unsubscribes cleanly');

  // Test 2: RoomSyncHandler instantiation and room expiration
  let autoDismissCalled = false;
  mockRenderer.showAutoDismissModal = (title, msg) => {
    autoDismissCalled = true;
  };

  const roomHandler = new RoomSyncHandler({
    state: mockState,
    renderer: mockRenderer,
    firebaseService: mockFirebase,
    soundService: mockSound,
    tradeController: {},
    playerSessionService: { clearRoomSession: () => {} },
    marketController: { unsubscribeAll: () => {} }
  });

  roomHandler.activate('ROOM123');
  assert.strictEqual(typeof roomListenerCb, 'function', 'listenToRoom callback should be registered');
  roomHandler.unsubscribe();
  assert.strictEqual(roomListenerCb, null, 'Room listener should unsubscribe');
  console.log('✔ Test 2 Passed: RoomSyncHandler activates and unsubscribes cleanly');

  // Test 3: AppLifecycleService
  const appLifecycle = new AppLifecycleService({
    state: mockState,
    renderer: mockRenderer,
    firebaseService: mockFirebase,
    playerSessionService: {},
    onEvicted: () => {},
    onRoomExpired: () => {}
  });
  assert.ok(appLifecycle, 'AppLifecycleService should instantiate');
  appLifecycle.bindGlobalProtectionEvents();
  appLifecycle.bindLifecycleReverificationEvents();
  console.log('✔ Test 3 Passed: AppLifecycleService instantiated and binds protection');

  // Test 4: MarketController Facade Integration
  const controller = new MarketController(mockState, mockRenderer, mockFirebase);
  assert.ok(controller.boardSyncHandler instanceof BoardSyncHandler, 'Controller holds BoardSyncHandler');
  assert.ok(controller.roomSyncHandler instanceof RoomSyncHandler, 'Controller holds RoomSyncHandler');
  assert.ok(controller.appLifecycleService instanceof AppLifecycleService, 'Controller holds AppLifecycleService');

  // Test 4b: Facade activation and unsubscription
  controller.activateBoardRealtimeListener();
  assert.ok(controller.boardListenerUnsubscribe, 'boardListenerUnsubscribe proxy getter works');
  assert.ok(controller.roomListenerUnsubscribe, 'roomListenerUnsubscribe proxy getter works');

  // Test 4c: Verify controller.init() lifecycle binding
  assert.doesNotThrow(() => controller.init(), 'controller.init() should run without errors');
  console.log('✔ Test 4 Passed: MarketController acts as a clean Facade coordinating sync handlers and initializes cleanly');

  console.log('\nAll Phase 3 Refactoring Tests PASSED successfully! 🚀');
}

runTests().catch(err => {
  console.error('Test FAILED:', err);
  process.exit(1);
});
