import assert from 'node:assert';

// Mock Browser and DOM Environment
const mockInput = {
  value: '',
  selectionStart: 0,
  selectionEnd: 0,
  setSelectionRange: () => {},
  closest: () => ({ classList: { add: () => {}, remove: () => {} }, addEventListener: () => {} }),
  addEventListener: () => {},
  focus: () => {}
};

const mockSlots = [
  { textContent: '', classList: { add: () => {}, remove: () => {}, contains: () => false } },
  { textContent: '', classList: { add: () => {}, remove: () => {}, contains: () => false } },
  { textContent: '', classList: { add: () => {}, remove: () => {}, contains: () => false } },
  { textContent: '', classList: { add: () => {}, remove: () => {}, contains: () => false } },
  { textContent: '', classList: { add: () => {}, remove: () => {}, contains: () => false } },
  { textContent: '', classList: { add: () => {}, remove: () => {}, contains: () => false } }
];

const mockSlotsContainer = {
  classList: { add: () => {}, remove: () => {} },
  style: { cssText: '' },
  querySelectorAll: () => mockSlots
};

global.document = {
  querySelector: (sel) => null,
  getElementById: (id) => {
    if (id === 'roomCodeSlots') return mockSlotsContainer;
    if (id === 'lobbyScreen') return { classList: { add: () => {}, remove: () => {} } };
    return {
      style: { display: 'none' },
      classList: { add: () => {}, remove: () => {} },
      addEventListener: () => {}
    };
  },
  createElement: (tag) => ({
    style: {},
    classList: { add: () => {}, remove: () => {} }
  }),
  addEventListener: () => {},
  removeEventListener: () => {}
};

global.window = {
  visualViewport: {
    height: 800,
    addEventListener: () => {}
  },
  innerHeight: 800,
  history: { pushState: () => {} }
};

async function runTests() {
  console.log('Testing Phase 4 Refactor: LobbyInputHandler, LobbySessionCoordinator, RoomSetupService & LobbyController facade...');

  const { LobbyInputHandler } = await import('../js/controllers/lobby/LobbyInputHandler.js');
  const { LobbySessionCoordinator } = await import('../js/controllers/lobby/LobbySessionCoordinator.js');
  const { RoomSetupService } = await import('../js/controllers/lobby/RoomSetupService.js');
  const { LobbyController } = await import('../js/controllers/LobbyController.js');

  const mockRenderer = {
    roomCodeInput: mockInput,
    joinRoomBtn: { addEventListener: () => {}, style: {} },
    lobbyForm: { addEventListener: () => {} },
    clearRoomCodeSlots: () => {},
    triggerShakeCodeBox: () => {},
    showInvalidRoomModal: () => Promise.resolve(),
    showErrorAlert: () => Promise.resolve(),
    showTopToast: () => {},
    showDashboard: () => {},
    updateControlsVisibility: () => {},
    updateRoomCodeDisplay: () => {},
    updatePortfolioUI: () => {},
    roleSelectionModal: null,
    playerNameModal: null,
    gameModeSelectionModal: null,
    waitingForGMModal: null
  };

  const mockSessionLock = {
    fetchPublicIp: async () => '127.0.0.1',
    registerSession: async () => {}
  };

  const mockPlayerSession = {
    getLastActiveRoomCode: () => 'LAST12',
    getOrCreateSessionToken: () => 'token_xyz',
    saveRoomSession: () => {},
    syncPlayerToFirebase: async () => {},
    clearRoomSession: () => {}
  };

  const mockFirebase = {
    checkRoomExists: async (code) => code === 'VALID1',
    getRoomStateSnapshot: async (code) => ({
      exists: () => false,
      val: () => null
    }),
    getCurrentUser: () => ({ uid: 'user_1' }),
    getGameSetting: async () => ({
      stocks: [{ name: 'ALPHA', steps: [100, 200], startStep: 1 }]
    }),
    createBoard: async () => {},
    createRoom: async () => {},
    updateRoom: async () => {},
    joinRoomWithTransaction: async () => ({ result: { committed: true } }),
    configureDisconnectCleanup: () => {},
    getBoardSnapshot: async () => ({ exists: () => false })
  };

  const mockState = {
    reset: () => {},
    setMasterStocks: () => {},
    setRole: () => {},
    setPlayerName: () => {},
    setGameMode: () => {},
    setRoomCode: () => {},
    getPortfolioStats: () => ({ totalAssets: 20000 }),
    updateFromFirebaseBoard: () => {}
  };

  // Test 1: LobbyInputHandler
  const inputHandler = new LobbyInputHandler(mockRenderer, mockPlayerSession);
  assert.ok(inputHandler, 'LobbyInputHandler instantiates');
  inputHandler.updateRoomCodeSlots('TEST12', true);
  assert.strictEqual(mockSlots[0].textContent, 'T', 'Slot 0 receives T');
  assert.strictEqual(mockSlots[1].textContent, 'E', 'Slot 1 receives E');
  inputHandler.clearLobbyRoomCodeInput();
  assert.strictEqual(mockInput.value, '', 'Input value cleared');
  console.log('✔ Test 1 Passed: LobbyInputHandler manages PIN code slots cleanly');

  // Test 2: LobbySessionCoordinator
  const sessionCoord = new LobbySessionCoordinator(mockFirebase, mockSessionLock, mockPlayerSession);
  const validRes = await sessionCoord.inspectRoomAndSession('VALID1');
  assert.strictEqual(validRes.isAllowed, true, 'Valid room is allowed');
  assert.strictEqual(validRes.clientIp, '127.0.0.1', 'Client IP is fetched');

  const invalidRes = await sessionCoord.inspectRoomAndSession('INVALID');
  assert.strictEqual(invalidRes.isAllowed, false, 'Invalid room is rejected');
  console.log('✔ Test 2 Passed: LobbySessionCoordinator correctly verifies room and session state');

  // Test 3: RoomSetupService
  const roomSetup = new RoomSetupService(mockState, mockRenderer, mockFirebase, mockSessionLock, mockPlayerSession);
  const setupRes = await roomSetup.setupOrJoinRoom({
    code: 'VALID1',
    role: 'game_master',
    displayName: 'GM',
    restoredPortfolio: null,
    restoredBackupProfile: null,
    sessionToken: 'token_xyz',
    clientIp: '127.0.0.1',
    roomExists: false,
    roomData: null,
    members: {},
    maxPlayers: 5,
    user: { uid: 'user_1' }
  });
  assert.ok(setupRes, 'Room setup succeeded');
  assert.strictEqual(setupRes.finalRole, 'game_master', 'Final role set to game_master');
  console.log('✔ Test 3 Passed: RoomSetupService executes atomic board & room creation');

  // Test 4: LobbyController Facade Integration
  const lobby = new LobbyController(mockState, mockRenderer, mockFirebase, mockSessionLock, mockPlayerSession);
  assert.ok(lobby.inputHandler instanceof LobbyInputHandler, 'LobbyController holds LobbyInputHandler');
  assert.ok(lobby.sessionCoordinator instanceof LobbySessionCoordinator, 'LobbyController holds LobbySessionCoordinator');
  assert.ok(lobby.roomSetupService instanceof RoomSetupService, 'LobbyController holds RoomSetupService');

  // Test 4b: Backward compatibility proxy methods
  assert.strictEqual(typeof lobby.bindLobbyEntrance, 'function', 'lobby.bindLobbyEntrance must be a function');
  lobby.updateRoomCodeSlots('ABC');
  assert.strictEqual(mockSlots[0].textContent, 'A');
  lobby.clearLobbyRoomCodeInput();
  assert.strictEqual(mockInput.value, '');
  console.log('✔ Test 4 Passed: LobbyController acts as a clean Facade coordinating lobby entrance');

  console.log('\nAll Phase 4 Refactoring Tests PASSED successfully! 🚀');
}

runTests().catch(err => {
  console.error('Test FAILED:', err);
  process.exit(1);
});
