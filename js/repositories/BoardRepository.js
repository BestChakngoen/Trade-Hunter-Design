import { ref, get, set, update, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

/**
 * BoardRepository - Manages Realtime Database operations for the stock market board (traderHunter/boards/{roomCode}).
 * Adheres to Single Responsibility Principle (SRP).
 */
export class BoardRepository {
  constructor(firebaseService) {
    this.firebaseService = firebaseService;
  }

  get realtimeDb() {
    return this.firebaseService.realtimeDb;
  }

  getBoardRef(roomCode) {
    return ref(this.realtimeDb, `traderHunter/boards/${roomCode}`);
  }

  async getBoardSnapshot(roomCode) {
    const boardRef = this.getBoardRef(roomCode);
    return await get(boardRef);
  }

  async createBoard(roomCode, stocks) {
    const boardRef = this.getBoardRef(roomCode);
    await set(boardRef, { stocks });
  }

  listenToBoard(roomCode, callback) {
    const boardRef = this.getBoardRef(roomCode);
    return onValue(boardRef, (snapshot) => {
      callback(snapshot.val());
    });
  }

  async updateStocksBoard(roomCode, stocks) {
    const boardRef = this.getBoardRef(roomCode);
    await update(boardRef, { 
      stocks,
      isReset: null,
      resetAt: null
    });
  }

  async setStocksBoard(roomCode, stocks, isReset = false) {
    const boardRef = this.getBoardRef(roomCode);
    const payload = { stocks: stocks || {} };
    if (isReset) {
      payload.isReset = true;
      payload.resetAt = Date.now();
    }
    await set(boardRef, payload);
  }
}
