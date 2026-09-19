/**
 * PriceControlHandler - Dedicated controller responsible for stock step up/down adjustments,
 * batch adjustments across visible sectors/sizes, and Undo/Redo room snapshot state restorations.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class PriceControlHandler {
  constructor(state, renderer, firebaseService) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
  }

  /**
   * Binds single stock step up/down controls on cards.
   */
  bindPriceControls() {
    if (!this.renderer.priceGrid) return;

    this.renderer.priceGrid.addEventListener('click', async (e) => {
      // Controls only permitted for GM role and when not spectating
      if (this.state.role !== 'game_master' || this.state.isSpectating) return;

      const btn = e.target.closest('.control-btn');
      if (!btn) return;
      
      const card = btn.closest('.price-card');
      if (!card) return;
      
      const symbol = card.querySelector('.card-icon')?.textContent.trim();
      if (!symbol) return;
      
      const isUp = btn.classList.contains('up');
      
      const updatedStocks = isUp 
        ? this.state.getUpdatedStocksForUp(symbol)
        : this.state.getUpdatedStocksForDown(symbol);

      if (!updatedStocks) return;

      // Save full room + board snapshot before changing stock price step
      const [boardSnap, roomSnap] = await Promise.all([
        this.firebaseService.getBoardSnapshot(this.state.roomCode),
        this.firebaseService.getRoomStateSnapshot(this.state.roomCode)
      ]);
      const boardData = boardSnap ? boardSnap.val() : null;
      const roomData = roomSnap ? roomSnap.val() : null;

      if (boardData || roomData) {
        this.state.pushUndoSnapshot({
          stocks: boardData ? boardData.stocks : this.state.boardStocks,
          members: roomData ? roomData.members : null,
          pendingOrders: roomData ? roomData.pendingOrders : null
        });
        const isGM = (this.state.role === 'game_master');
        this.renderer.updateHistoryControlsUI(isGM, this.state.canUndo(), this.state.canRedo());
      }

      try {
        await this.firebaseService.updateStocksBoard(this.state.roomCode, updatedStocks);
        const updatedStock = updatedStocks.find(s => s.name === symbol);
        const newPrice = updatedStock ? updatedStock.value.toLocaleString() : '';
        const prevStock = boardData && Array.isArray(boardData.stocks) ? boardData.stocks.find(s => s.name === symbol) : null;
        const isAtMin = !isUp && updatedStock && Number(updatedStock.value) <= 100 && prevStock && Number(prevStock.value) <= 100;
        this.renderer.showTopToast(
          isUp ? "STOCK PRICE INCREASED" : (isAtMin ? "STOCK PRICE AT MINIMUM" : "STOCK PRICE DECREASED"),
          isAtMin
            ? `ราคาหุ้น ${symbol} อยู่ที่ระดับต่ำสุดแล้ว (100 บาท)`
            : `ปรับราคาหุ้น ${symbol} ${isUp ? 'เพิ่มขึ้นเป็น' : 'ลดลงเหลือ'} ${newPrice} บาท`,
          isUp ? "success" : "warning"
        );
      } catch (error) {
        console.error("Failed to update stock step in database:", error);
      }
    });

    this.bindBatchPriceControls();
  }

  /**
   * Binds batch price increase and decrease buttons for visible stocks.
   */
  bindBatchPriceControls() {
    const incBtn = document.getElementById('batchIncreasePriceBtn');
    const decBtn = document.getElementById('batchDecreasePriceBtn');

    const handleBatchChange = async (isUp) => {
      if (this.state.role !== 'game_master' || this.state.isSpectating) return;

      // Collect target stock symbols that are currently filtered & visible on the board
      const visibleCards = this.state.getFilteredAndSortedCards();
      const targetSymbols = new Set();
      visibleCards.forEach(card => {
        const iconEl = card.querySelector('.card-icon');
        if (iconEl && iconEl.textContent) {
          targetSymbols.add(iconEl.textContent.trim());
        }
      });

      const updatedStocks = isUp
        ? this.state.getBatchUpdatedStocksForUp(targetSymbols)
        : this.state.getBatchUpdatedStocksForDown(targetSymbols);

      if (!updatedStocks) return;

      const [boardSnap, roomSnap] = await Promise.all([
        this.firebaseService.getBoardSnapshot(this.state.roomCode),
        this.firebaseService.getRoomStateSnapshot(this.state.roomCode)
      ]);
      const boardData = boardSnap ? boardSnap.val() : null;
      const roomData = roomSnap ? roomSnap.val() : null;

      if (boardData || roomData) {
        this.state.pushUndoSnapshot({
          stocks: boardData ? boardData.stocks : this.state.boardStocks,
          members: roomData ? roomData.members : null,
          pendingOrders: roomData ? roomData.pendingOrders : null
        });
        const isGM = (this.state.role === 'game_master');
        this.renderer.updateHistoryControlsUI(isGM, this.state.canUndo(), this.state.canRedo());
      }

      try {
        await this.firebaseService.updateStocksBoard(this.state.roomCode, updatedStocks);
        this.renderer.showTopToast(
          isUp ? "BATCH PRICE INCREASED" : "BATCH PRICE DECREASED",
          `ปรับราคาหุ้นกลุ่มที่แสดงอยู่ (+1 / -1 ช่อง) จำนวน ${targetSymbols.size} หุ้น`,
          isUp ? "success" : "warning"
        );
      } catch (error) {
        console.error("Failed to update batch stock step in database:", error);
      }
    };

    if (incBtn) incBtn.addEventListener('click', () => handleBatchChange(true));
    if (decBtn) decBtn.addEventListener('click', () => handleBatchChange(false));
  }

  /**
   * Binds continuous Undo & Redo buttons with full room snapshot recovery.
   */
  bindHistoryButtons() {
    const undoBtn = document.getElementById('undoActionBtn');
    const redoBtn = document.getElementById('redoActionBtn');

    if (undoBtn) {
      undoBtn.addEventListener('click', async () => {
        if (!this.state.canUndo()) return;

        try {
          // Fetch current state to save into Redo stack before applying Undo
          const [curBoardSnap, curRoomSnap] = await Promise.all([
            this.firebaseService.getBoardSnapshot(this.state.roomCode),
            this.firebaseService.getRoomStateSnapshot(this.state.roomCode)
          ]);
          const curBoardData = curBoardSnap ? curBoardSnap.val() : null;
          const curRoomData = curRoomSnap ? curRoomSnap.val() : null;

          this.state.pushRedoSnapshot({
            stocks: curBoardData ? curBoardData.stocks : this.state.boardStocks,
            members: curRoomData ? curRoomData.members : null,
            pendingOrders: curRoomData ? curRoomData.pendingOrders : null
          });

          const previousState = this.state.popUndoSnapshot();
          if (previousState) {
            if (previousState.stocks) {
              await this.firebaseService.setStocksBoard(this.state.roomCode, previousState.stocks);
            }
            if (previousState.members) {
              await this.firebaseService.restoreRoomMembersSnapshot(this.state.roomCode, previousState.members);
            }
            if (previousState.pendingOrders !== undefined) {
              await this.firebaseService.setPendingOrders(this.state.roomCode, previousState.pendingOrders);
            }

            const isGM = (this.state.role === 'game_master');
            this.renderer.updateHistoryControlsUI(isGM, this.state.canUndo(), this.state.canRedo());
            this.renderer.showTopToast("ACTION UNDONE", "ยกเลิกการกระทำล่าสุดของห้องเกมเรียบร้อยแล้ว", "info");
          }
        } catch (error) {
          console.error("Failed to undo room action:", error);
        }
      });
    }

    if (redoBtn) {
      redoBtn.addEventListener('click', async () => {
        if (!this.state.canRedo()) return;

        try {
          // Fetch current state to save into Undo stack before applying Redo
          const [curBoardSnap, curRoomSnap] = await Promise.all([
            this.firebaseService.getBoardSnapshot(this.state.roomCode),
            this.firebaseService.getRoomStateSnapshot(this.state.roomCode)
          ]);
          const curBoardData = curBoardSnap ? curBoardSnap.val() : null;
          const curRoomData = curRoomSnap ? curRoomSnap.val() : null;

          this.state.undoStack.push({
            stocks: curBoardData ? curBoardData.stocks : this.state.boardStocks,
            members: curRoomData ? curRoomData.members : null,
            pendingOrders: curRoomData ? curRoomData.pendingOrders : null
          });

          const nextState = this.state.popRedoSnapshot();
          if (nextState) {
            if (nextState.stocks) {
              await this.firebaseService.setStocksBoard(this.state.roomCode, nextState.stocks);
            }
            if (nextState.members) {
              await this.firebaseService.restoreRoomMembersSnapshot(this.state.roomCode, nextState.members);
            }
            if (nextState.pendingOrders !== undefined) {
              await this.firebaseService.setPendingOrders(this.state.roomCode, nextState.pendingOrders);
            }

            const isGM = (this.state.role === 'game_master');
            this.renderer.updateHistoryControlsUI(isGM, this.state.canUndo(), this.state.canRedo());
            this.renderer.showTopToast("ACTION REDONE", "ทำซ้ำการกระทำถัดไปของห้องเกมเรียบร้อยแล้ว", "info");
          }
        } catch (error) {
          console.error("Failed to redo room action:", error);
        }
      });
    }
  }
}
