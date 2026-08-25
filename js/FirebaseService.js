import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, setPersistence, inMemoryPersistence } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { getDatabase, ref, get, set, update, onValue, onDisconnect, runTransaction } from 'firebase/database';

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
  }

  async init() {
    this.app = initializeApp(this.config);
    this.auth = getAuth(this.app);
    this.firestore = getFirestore(this.app);
    this.realtimeDb = getDatabase(this.app);

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

  // Check if room code exists in Firestore collection (games/traderHunter/rooms)
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

  // Get master stocks lists and rules from Firestore (games/traderHunter)
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

  // Realtime Database: Get Reference to the Board (traderHunter/boards/{roomCode})
  getBoardRef(roomCode) {
    return ref(this.realtimeDb, `traderHunter/boards/${roomCode}`);
  }

  // Realtime Database: Get Reference to the Game Room Info (traderHunter/gameRooms/{roomCode})
  getRoomRef(roomCode) {
    return ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}`);
  }

  // Realtime Database: Get a one-time snapshot of the room state
  async getRoomStateSnapshot(roomCode) {
    const roomRef = this.getRoomRef(roomCode);
    return await get(roomRef);
  }

  // Realtime Database: Get a one-time snapshot of the board state
  async getBoardSnapshot(roomCode) {
    const boardRef = this.getBoardRef(roomCode);
    return await get(boardRef);
  }

  // Realtime Database: Get Reference to member inside a Room (traderHunter/gameRooms/{roomCode}/members/{userId})
  getUserInBoardRef(roomCode, userId) {
    return ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/members/${userId}`);
  }

  // Realtime Database: Create a new Board state
  async createBoard(roomCode, stocks) {
    const boardRef = this.getBoardRef(roomCode);
    await set(boardRef, { stocks });
  }

  // Realtime Database: Initialize or Update Game Room data
  async createRoom(roomCode, roomSettings, members) {
    const roomRef = this.getRoomRef(roomCode);
    const now = Date.now();
    await set(roomRef, {
      createdAt: now,
      lastJoinedAt: now,
      roomSettings: {
        maxPlayers: roomSettings.maxPlayers || 10
      },
      members
    });
  }

  async updateRoom(roomCode, updateData) {
    const roomRef = this.getRoomRef(roomCode);
    await update(roomRef, updateData);
  }

  // Realtime Database: Listen to Board updates in real-time
  listenToBoard(roomCode, callback) {
    const boardRef = this.getBoardRef(roomCode);
    return onValue(boardRef, (snapshot) => {
      callback(snapshot.val());
    });
  }

  // Realtime Database: Listen to Room data changes
  listenToRoom(roomCode, callback) {
    const roomRef = this.getRoomRef(roomCode);
    return onValue(roomRef, (snapshot) => {
      callback(snapshot.val());
    });
  }

  // Realtime Database: Set stocks price values
  async updateStocksBoard(roomCode, stocks) {
    const boardRef = this.getBoardRef(roomCode);
    await update(boardRef, { stocks });
  }

  // Realtime Database: Overwrite stocks board state for Undo/Redo
  async setStocksBoard(roomCode, stocks) {
    const boardRef = this.getBoardRef(roomCode);
    await set(boardRef, { stocks: stocks || {} });
  }

  // Realtime Database: Overwrite room members state for Undo/Redo
  async setRoomMembers(roomCode, members) {
    const membersRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/members`);
    await set(membersRef, members || {});
  }

  // Realtime Database: Overwrite room pending orders state for Undo/Redo
  async setPendingOrders(roomCode, pendingOrders) {
    const ordersRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/pendingOrders`);
    await set(ordersRef, pendingOrders || {});
  }

  // Realtime Database: Set trigger to clean up player node upon closing tab / disconnecting
  configureDisconnectCleanup(roomCode, userId) {
    const userRef = this.getUserInBoardRef(roomCode, userId);
    onDisconnect(userRef).remove().catch(err => {
      console.error("Failed to configure onDisconnect:", err);
    });
  }

  // Realtime Database: Delete room and board data when empty
  async deleteRoomData(roomCode) {
    if (!roomCode) return;
    try {
      const roomRef = this.getRoomRef(roomCode);
      const boardRef = this.getBoardRef(roomCode);
      await set(roomRef, null);
      await set(boardRef, null);
    } catch (e) {
      console.error("Failed to purge empty room data:", e);
    }
  }

  // Realtime Database: Remove a specific member node and their pending orders from room
  async removeMemberFromRoom(roomCode, userId) {
    if (!roomCode || !userId) return;
    try {
      const userRef = this.getUserInBoardRef(roomCode, userId);
      await set(userRef, null);

      // Purge all pending orders submitted by this player
      const roomSnapshot = await this.getRoomStateSnapshot(roomCode);
      if (roomSnapshot && roomSnapshot.exists()) {
        const roomData = roomSnapshot.val();
        const pendingOrders = roomData.pendingOrders || {};
        const updates = {};
        Object.entries(pendingOrders).forEach(([orderId, order]) => {
          if (order && order.uid === userId) {
            updates[`pendingOrders/${orderId}`] = null;
          }
        });
        if (Object.keys(updates).length > 0) {
          await this.updateRoom(roomCode, updates);
        }
      }
    } catch (e) {
      console.error("Failed to remove member from room:", e);
    }
  }

  // Realtime Database: Join room atomically with transaction to handle high concurrency
  async joinRoomWithTransaction(roomCode, userObj, maxPlayers = 10) {
    const roomRef = this.getRoomRef(roomCode);
    
    const result = await runTransaction(roomRef, (currentData) => {
      if (currentData === null) {
        return currentData;
      }

      const members = currentData.members || {};
      const memberUids = Object.keys(members);
      
      // Rejoining player
      if (members[userObj.uid]) {
        return currentData;
      }

      // Concurrency Limit Check
      if (memberUids.length >= maxPlayers) {
        return; // Abort transaction (returns committed: false)
      }

      if (!currentData.members) {
        currentData.members = {};
      }

      const memberObj = {
        role: userObj.role,
        displayName: userObj.displayName,
        joinedAt: Date.now()
      };
      if (userObj.role === 'player') {
        memberObj.portfolio = { cash: 20000 };
      }

      currentData.members[userObj.uid] = memberObj;
      currentData.lastJoinedAt = Date.now();

      return currentData;
    });

    return result;
  }
}
