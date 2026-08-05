import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, setPersistence, inMemoryPersistence } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { getDatabase, ref, get, set, update, onValue, onDisconnect } from 'firebase/database';

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
    console.log("Authenticated anonymously with UID:", this.currentUser.uid);
  }

  getCurrentUser() {
    return this.currentUser;
  }

  // Check if room code exists in Firestore collection (games/traderHunter/rooms)
  async checkRoomExists(roomCode) {
    try {
      console.log("Checking room validity for code:", roomCode);
      const roomsSnapshot = await getDocs(collection(this.firestore, "games", "traderHunter", "rooms"));
      let exists = false;
      roomsSnapshot.forEach(doc => {
        if (doc.id === roomCode) {
          exists = true;
        }
      });
      return exists;
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

  // Realtime Database: Set trigger to clean up player node upon closing tab / disconnecting
  configureDisconnectCleanup(roomCode, userId) {
    const userRef = this.getUserInBoardRef(roomCode, userId);
    onDisconnect(userRef).remove().then(() => {
      console.log(`Configured onDisconnect cleanup for user ${userId}`);
    }).catch(err => {
      console.error("Failed to configure onDisconnect:", err);
    });
  }
}
