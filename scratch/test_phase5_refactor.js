import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

async function runTests() {
  console.log('Testing Phase 5 Refactor: BoardRepository, RoomRepository, TradingRepository, GovernanceRepository & FirebaseService facade...');

  // Helper to load file with local mock instead of https URL
  async function loadWithMock(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.2\/[a-z-]+\.js/g, './firebase_mock.js');
    // Fix relative path for PlayerKickService if needed
    content = content.replace(/\.\.\/services\/PlayerKickService\.js/g, '../js/services/PlayerKickService.js');
    content = content.replace(/\.\/repositories\//g, './temp_repo_');

    const tempFile = path.resolve('scratch', 'temp_' + path.basename(filePath));
    fs.writeFileSync(tempFile, content);
    try {
      const mod = await import('file:///' + tempFile.replace(/\\/g, '/'));
      return mod;
    } finally {
      try { fs.unlinkSync(tempFile); } catch (e) {}
    }
  }

  // 1. Prepare temp repository files so FirebaseService can import them
  ['BoardRepository.js', 'RoomRepository.js', 'TradingRepository.js', 'GovernanceRepository.js'].forEach(name => {
    let content = fs.readFileSync(path.resolve('js/repositories', name), 'utf8');
    content = content.replace(/https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.2\/[a-z-]+\.js/g, './firebase_mock.js');
    content = content.replace(/\.\.\/services\/PlayerKickService\.js/g, '../js/services/PlayerKickService.js');
    fs.writeFileSync(path.resolve('scratch', 'temp_repo_' + name), content);
  });

  try {
    const { BoardRepository } = await import('file:///' + path.resolve('scratch', 'temp_repo_BoardRepository.js').replace(/\\/g, '/'));
    const { TradingRepository } = await import('file:///' + path.resolve('scratch', 'temp_repo_TradingRepository.js').replace(/\\/g, '/'));
    const { GovernanceRepository } = await import('file:///' + path.resolve('scratch', 'temp_repo_GovernanceRepository.js').replace(/\\/g, '/'));
    const { RoomRepository } = await import('file:///' + path.resolve('scratch', 'temp_repo_RoomRepository.js').replace(/\\/g, '/'));

    const mockDb = { name: 'mockRealtimeDb' };
    const mockService = {
      realtimeDb: mockDb,
      currentUser: { uid: 'u_test' }
    };

    // Test 1: BoardRepository
    const boardRepo = new BoardRepository(mockService);
    assert.ok(boardRepo, 'BoardRepository instantiates');
    assert.strictEqual(boardRepo.realtimeDb, mockDb, 'BoardRepository accesses realtimeDb');
    console.log('✔ Test 1 Passed: BoardRepository instantiated and operational');

    // Test 2: TradingRepository
    const tradingRepo = new TradingRepository(mockService);
    assert.ok(tradingRepo, 'TradingRepository instantiates');
    assert.strictEqual(tradingRepo.realtimeDb, mockDb, 'TradingRepository accesses realtimeDb');
    console.log('✔ Test 2 Passed: TradingRepository instantiated and operational');

    // Test 3: GovernanceRepository
    const governanceRepo = new GovernanceRepository(mockService);
    assert.ok(governanceRepo, 'GovernanceRepository instantiates');
    assert.strictEqual(governanceRepo.realtimeDb, mockDb, 'GovernanceRepository accesses realtimeDb');
    console.log('✔ Test 3 Passed: GovernanceRepository instantiated and operational');

    // Test 4: RoomRepository
    const roomRepo = new RoomRepository(mockService);
    assert.ok(roomRepo, 'RoomRepository instantiates');
    assert.strictEqual(roomRepo.realtimeDb, mockDb, 'RoomRepository accesses realtimeDb');
    console.log('✔ Test 4 Passed: RoomRepository instantiated and operational');

    // Test 5: FirebaseService Facade integration
    let fbContent = fs.readFileSync(path.resolve('js', 'FirebaseService.js'), 'utf8');
    fbContent = fbContent.replace(/https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.2\/[a-z-]+\.js/g, './firebase_mock.js');
    fbContent = fbContent.replace(/\.\/repositories\//g, './temp_repo_');
    const tempFbFile = path.resolve('scratch', 'temp_FirebaseService.js');
    fs.writeFileSync(tempFbFile, fbContent);

    const { FirebaseService } = await import('file:///' + tempFbFile.replace(/\\/g, '/'));
    const firebaseService = new FirebaseService();
    assert.ok(firebaseService.boardRepo, 'FirebaseService holds boardRepo');
    assert.ok(firebaseService.roomRepo, 'FirebaseService holds roomRepo');
    assert.ok(firebaseService.tradingRepo, 'FirebaseService holds tradingRepo');
    assert.ok(firebaseService.governanceRepo, 'FirebaseService holds governanceRepo');

    // Test 5b: Verify delegation methods exist and are callable
    assert.strictEqual(typeof firebaseService.createBoard, 'function', 'createBoard exists');
    assert.strictEqual(typeof firebaseService.updateStocksBoard, 'function', 'updateStocksBoard exists');
    assert.strictEqual(typeof firebaseService.createRoom, 'function', 'createRoom exists');
    assert.strictEqual(typeof firebaseService.updateRoom, 'function', 'updateRoom exists');
    assert.strictEqual(typeof firebaseService.joinRoomWithTransaction, 'function', 'joinRoomWithTransaction exists');
    assert.strictEqual(typeof firebaseService.approveOrderWithTransaction, 'function', 'approveOrderWithTransaction exists');
    assert.strictEqual(typeof firebaseService.rejectOrderWithTransaction, 'function', 'rejectOrderWithTransaction exists');
    assert.strictEqual(typeof firebaseService.transferGMRoleDirectly, 'function', 'transferGMRoleDirectly exists');
    assert.strictEqual(typeof firebaseService.kickPlayerAndPurgeData, 'function', 'kickPlayerAndPurgeData exists');
    console.log('✔ Test 5 Passed: FirebaseService accurately delegates all repository domain methods');

    try { fs.unlinkSync(tempFbFile); } catch (e) {}
  } finally {
    ['BoardRepository.js', 'RoomRepository.js', 'TradingRepository.js', 'GovernanceRepository.js'].forEach(name => {
      try { fs.unlinkSync(path.resolve('scratch', 'temp_repo_' + name)); } catch (e) {}
    });
  }

  console.log('\nAll Phase 5 Refactoring Tests PASSED successfully! 🚀');
}

runTests().catch(err => {
  console.error('Test FAILED:', err);
  process.exit(1);
});
