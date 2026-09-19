import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInAnonymously, setPersistence, inMemoryPersistence } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

import { BoardRepository } from './repositories/BoardRepository.js';
import { RoomRepository } from './repositories/RoomRepository.js';
import { TradingRepository } from './repositories/TradingRepository.js';
import { GovernanceRepository } from './repositories/GovernanceRepository.js';

/**
 * FirebaseService - Unified Gateway Facade for Firebase Auth, Firestore, and Realtime Database domains.
 * Delegates domain operations to specialized repositories (BoardRepository, RoomRepository, TradingRepository, GovernanceRepository).
 * Adheres to Single Responsibility Principle (SRP).
 */
export class FirebaseService {
  constructor() {
    this.config = {
      apiKey: "AIzaSyDDd8sy4BhNsYshAzcWaAOwdpX6NkXDSU8",
      authDomain: "findice-5e064.firebaseapp.com",
      databaseURL: "https://findice-5e064-default-rtdb.asia-southeast1.firebasedatabase.app",
      projectId: "findice-5e064",
      storageBucket: "findice-5e064.appspot.com",
      messagingSenderId: "134132059445",
      appId: "1:134132059445:web:291101d57d139ec72e907c",
      measurementId: "G-VYRDV7MJ92"
    };
    
    this.app = null;
    this.auth = null;
    this.firestore = null;
    this.realtimeDb = null;
    this.currentUser = null;

    // Specialized Domain Repositories (Extracted in Phase 5)
    this.boardRepo = new BoardRepository(this);
    this.roomRepo = new RoomRepository(this);
    this.tradingRepo = new TradingRepository(this);
    this.governanceRepo = new GovernanceRepository(this);
  }

  async init() {
    if (getApps().length > 0) {
      this.app = getApp();
    } else {
      this.app = initializeApp(this.config);
    }
    this.auth = getAuth(this.app);
    this.firestore = getFirestore(this.app);
    this.realtimeDb = getDatabase(this.app);

    // If already signed in, reuse current user
    if (this.auth.currentUser) {
      this.currentUser = this.auth.currentUser;
      return;
    }

    // Set persistence to inMemoryPersistence so each tab gets a unique independent UID
    try {
      await setPersistence(this.auth, inMemoryPersistence);
    } catch (e) {
      console.warn("Could not set inMemoryPersistence:", e);
    }

    // Sign in anonymously to obtain a UID for the Realtime Database member tracking
    const credential = await signInAnonymously(this.auth);
    this.currentUser = credential.user;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  // --- Firestore Operations (Master Settings & Validation) ---
  async checkRoomExists(roomCode) {
    try {
      const roomDocRef = doc(this.firestore, "games", "traderHunter", "rooms", roomCode);
      const roomDocSnap = await getDoc(roomDocRef);
      return roomDocSnap.exists();
    } catch (error) {
      console.error("Error in checkRoomExists:", error);
      throw error;
    }
  }

  async getGameSetting() {
    try {
      const docRef = doc(this.firestore, "games", "traderHunter");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data();
      } else {
        throw new Error("No game settings config found on Firestore path 'games/traderHunter'!");
      }
    } catch (error) {
      console.error("Error in getGameSetting:", error);
      throw error;
    }
  }

  // --- Board Domain Delegations (BoardRepository) ---
  getBoardRef(roomCode) { return this.boardRepo.getBoardRef(roomCode); }
  async getBoardSnapshot(roomCode) { return await this.boardRepo.getBoardSnapshot(roomCode); }
  async createBoard(roomCode, stocks) { await this.boardRepo.createBoard(roomCode, stocks); }
  listenToBoard(roomCode, callback) { return this.boardRepo.listenToBoard(roomCode, callback); }
  async updateStocksBoard(roomCode, stocks) { await this.boardRepo.updateStocksBoard(roomCode, stocks); }
  async setStocksBoard(roomCode, stocks, isReset = false) { await this.boardRepo.setStocksBoard(roomCode, stocks, isReset); }

  // --- Room Domain Delegations (RoomRepository) ---
  getRoomRef(roomCode) { return this.roomRepo.getRoomRef(roomCode); }
  async getRoomStateSnapshot(roomCode) { return await this.roomRepo.getRoomStateSnapshot(roomCode); }
  getUserInBoardRef(roomCode, userId) { return this.roomRepo.getUserInBoardRef(roomCode, userId); }
  async createRoom(roomCode, roomSettings, members, clientIp = 'unknown') { await this.roomRepo.createRoom(roomCode, roomSettings, members, clientIp); }
  async updateRoom(roomCode, updateData) { await this.roomRepo.updateRoom(roomCode, updateData); }
  async setRoomGameMode(roomCode, gameMode) { await this.roomRepo.setRoomGameMode(roomCode, gameMode); }
  listenToRoom(roomCode, callback) { return this.roomRepo.listenToRoom(roomCode, callback); }
  async setRoomMembers(roomCode, members) { await this.roomRepo.setRoomMembers(roomCode, members); }
  async restoreRoomMembersSnapshot(roomCode, snapshotMembers) { await this.roomRepo.restoreRoomMembersSnapshot(roomCode, snapshotMembers); }
  async setMemberOnlineStatus(roomCode, userId, isOnline) { await this.roomRepo.setMemberOnlineStatus(roomCode, userId, isOnline); }
  configureDisconnectCleanup(roomCode, userId, isGM = false) { this.roomRepo.configureDisconnectCleanup(roomCode, userId, isGM); }
  async saveMemberSnapshot(roomCode, sessionToken, data) { await this.roomRepo.saveMemberSnapshot(roomCode, sessionToken, data); }
  async getMemberSnapshot(roomCode, sessionToken) { return await this.roomRepo.getMemberSnapshot(roomCode, sessionToken); }
  async deleteRoomData(roomCode) { await this.roomRepo.deleteRoomData(roomCode); }
  async removeMemberFromRoom(roomCode, userId) { await this.roomRepo.removeMemberFromRoom(roomCode, userId); }
  async joinRoomWithTransaction(roomCode, userObj, clientIp = 'unknown') { return await this.roomRepo.joinRoomWithTransaction(roomCode, userObj, clientIp); }
  async resetRoomWithKickAll(roomCode, resetStocks) { await this.roomRepo.resetRoomWithKickAll(roomCode, resetStocks); }
  async checkMemberExists(roomCode, userId) { return await this.roomRepo.checkMemberExists(roomCode, userId); }
  async verifyPlayerExistsOnServer(roomCode, userId, sessionToken = null) { return await this.roomRepo.verifyPlayerExistsOnServer(roomCode, userId, sessionToken); }
  async registerUserSession(roomCode, userId, sessionId) { await this.roomRepo.registerUserSession(roomCode, userId, sessionId); }
  listenToUserSession(roomCode, userId, callback) { return this.roomRepo.listenToUserSession(roomCode, userId, callback); }
  async registerIpSession(roomCode, sanitizedIp, sessionId, userId) { await this.roomRepo.registerIpSession(roomCode, sanitizedIp, sessionId, userId); }
  listenToIpSession(roomCode, sanitizedIp, callback) { return this.roomRepo.listenToIpSession(roomCode, sanitizedIp, callback); }

  // --- Trading Domain Delegations (TradingRepository) ---
  async setPendingOrders(roomCode, pendingOrders) { await this.tradingRepo.setPendingOrders(roomCode, pendingOrders); }
  async addPendingOrder(roomCode, orderId, orderData) { await this.tradingRepo.addPendingOrder(roomCode, orderId, orderData); }
  async approveOrderWithTransaction(roomCode, orderId, debtInstrumentsConfig = {}) { return await this.tradingRepo.approveOrderWithTransaction(roomCode, orderId, debtInstrumentsConfig); }
  async rejectOrderWithTransaction(roomCode, orderId) { return await this.tradingRepo.rejectOrderWithTransaction(roomCode, orderId); }

  // --- Governance Domain Delegations (GovernanceRepository) ---
  async triggerGMTransfer(roomCode) { await this.governanceRepo.triggerGMTransfer(roomCode); }
  async claimGMRoleWithTransaction(roomCode, userId, userName) { return await this.governanceRepo.claimGMRoleWithTransaction(roomCode, userId, userName); }
  async transferGMRoleDirectly(roomCode, currentGmUid, targetPlayerUid) { return await this.governanceRepo.transferGMRoleDirectly(roomCode, currentGmUid, targetPlayerUid); }
  async kickPlayerAndPurgeData(roomCode, targetUid) { return await this.governanceRepo.kickPlayerAndPurgeData(roomCode, targetUid); }
  async clearKickedMember(roomCode, uid) { await this.governanceRepo.clearKickedMember(roomCode, uid); }
}
