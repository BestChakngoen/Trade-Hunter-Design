/**
 * HistoryStateManager - Manages continuous Undo & Redo room state snapshots,
 * stack truncation, and user member history sanitization.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class HistoryStateManager {
  constructor(maxSize = 50) {
    this.maxSize = maxSize;
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Pushes a full room state snapshot (stocks, members, pendingOrders) to the Undo stack.
   * @param {Object} roomData 
   */
  pushUndo(roomData) {
    if (!roomData) return;
    const snapshot = {
      stocks: JSON.parse(JSON.stringify(roomData.stocks || {})),
      members: JSON.parse(JSON.stringify(roomData.members || {})),
      pendingOrders: JSON.parse(JSON.stringify(roomData.pendingOrders || {}))
    };
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
    // Clear Redo stack when a new action is performed
    this.redoStack = [];
  }

  /**
   * Pops the most recent snapshot from the Undo stack.
   */
  popUndo() {
    if (this.undoStack.length === 0) return null;
    return this.undoStack.pop();
  }

  /**
   * Pushes a full room state snapshot to the Redo stack.
   * @param {Object} roomData 
   */
  pushRedo(roomData) {
    if (!roomData) return;
    const snapshot = {
      stocks: JSON.parse(JSON.stringify(roomData.stocks || {})),
      members: JSON.parse(JSON.stringify(roomData.members || {})),
      pendingOrders: JSON.parse(JSON.stringify(roomData.pendingOrders || {}))
    };
    this.redoStack.push(snapshot);
  }

  /**
   * Pops the most recent snapshot from the Redo stack.
   */
  popRedo() {
    if (this.redoStack.length === 0) return null;
    return this.redoStack.pop();
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Removes player UID from all undo and redo history snapshots.
   * @param {string} playerUid 
   */
  removeMemberFromHistory(playerUid) {
    if (!playerUid) return;
    const uidStr = String(playerUid).trim().toLowerCase();

    const cleanSnapshot = (snapshot) => {
      if (!snapshot) return;
      if (snapshot.members) {
        Object.keys(snapshot.members).forEach(uid => {
          if (String(uid).trim().toLowerCase() === uidStr) {
            delete snapshot.members[uid];
          }
        });
      }
      if (snapshot.pendingOrders) {
        Object.keys(snapshot.pendingOrders).forEach(orderId => {
          const order = snapshot.pendingOrders[orderId];
          if (order && String(order.uid || '').trim().toLowerCase() === uidStr) {
            delete snapshot.pendingOrders[orderId];
          }
        });
      }
    };

    this.undoStack.forEach(cleanSnapshot);
    this.redoStack.forEach(cleanSnapshot);
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
