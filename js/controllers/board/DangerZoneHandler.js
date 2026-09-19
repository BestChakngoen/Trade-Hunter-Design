/**
 * DangerZoneHandler - Dedicated controller responsible for Danger Zone operations
 * including resetting market stock prices and atomic room purging with kick-all to lobby.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class DangerZoneHandler {
  constructor({ state, renderer, firebaseService, marketController = null, playerSessionService = null, onPriceReset = null }) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
    this.marketController = marketController;
    this.playerSessionService = playerSessionService;
    this.onPriceReset = onPriceReset;
  }

  /**
   * Binds Danger Zone Reset Market Price and Reset Entire Game Room buttons.
   */
  bindDangerZone() {
    if (this.renderer.resetMarketBtn) {
      this.renderer.resetMarketBtn.addEventListener('click', () => {
        if (this.state.role !== 'game_master') return;
        this.renderer.openConfirmModal();
      });
    }

    const closeConfirm = () => this.renderer.closeConfirmModal();
    
    const closeConfirmBtn = document.getElementById('closeConfirmModalBtn');
    const cancelResetBtn = document.getElementById('cancelResetBtn');
    
    if (closeConfirmBtn) closeConfirmBtn.addEventListener('click', closeConfirm);
    if (cancelResetBtn) cancelResetBtn.addEventListener('click', closeConfirm);
    
    if (this.renderer.confirmModal) {
      this.renderer.confirmModal.addEventListener('click', (e) => {
        if (e.target === this.renderer.confirmModal) closeConfirm();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.renderer.confirmModal && (this.renderer.confirmModal.classList.contains('show') || this.renderer.confirmModal.style.display === 'flex')) {
        closeConfirm();
      }
    });

    const confirmResetBtn = document.getElementById('confirmResetBtn');
    if (confirmResetBtn) {
      confirmResetBtn.addEventListener('click', async () => {
        if (this.state.role !== 'game_master' || this.state.isSpectating) return;

        const resetStocks = this.state.getResetStocks();
        try {
          const roomSnapshot = await this.firebaseService.getRoomStateSnapshot(this.state.roomCode);
          const roomData = roomSnapshot ? roomSnapshot.val() : null;

          const resetMembers = {};
          if (roomData && roomData.members) {
            Object.entries(roomData.members).forEach(([uid, member]) => {
              resetMembers[uid] = {
                ...member,
                portfolio: {
                  cash: 20000,
                  stocks: {},
                  debt: {}
                }
              };
            });
          }

          await this.firebaseService.updateRoom(this.state.roomCode, {
            stocks: resetStocks,
            members: resetMembers,
            pendingOrders: null,
            lastProcessedOrder: null,
            lastSalaryReceived: null,
            lastDividendReceived: null,
            lastDebtInterestReceived: null
          });
          await this.firebaseService.setStocksBoard(this.state.roomCode, resetStocks, true);

          this.state.undoStack = [];
          this.state.redoStack = [];
          this.state.pendingOrders = {};
          this.renderer.updateHistoryControlsUI(true, false, false);

          this.state.resetFilters();
          this.renderer.updateSortButtonsUI(this.state.sortStates);
          this.renderer.updateSectorPillsUI(this.state.selectedSectors);
          this.renderer.clearAllCardAnimations(this.state.originalCards);

          if (typeof this.onPriceReset === 'function') {
            this.onPriceReset();
          }
          closeConfirm();
          this.renderer.showTopToast("PRICE RESET", "รีเซ็ตราคาหุ้นกลับสู่ค่าเริ่มต้นเรียบร้อยแล้ว", "warning");
        } catch (error) {
          console.error("Failed to reset price in database:", error);
        }
      });
    }

    // Reset Game (Purge room data and return everyone to lobby)
    if (this.renderer.resetRoomDataBtn) {
      this.renderer.resetRoomDataBtn.addEventListener('click', () => {
        if (this.state.role !== 'game_master' || this.state.isSpectating) return;
        this.renderer.openConfirmResetRoomModal();
      });
    }

    const closeResetRoomConfirm = () => this.renderer.closeConfirmResetRoomModal();
    const cancelResetRoomBtn = document.getElementById('cancelResetRoomBtn');
    if (cancelResetRoomBtn) cancelResetRoomBtn.addEventListener('click', closeResetRoomConfirm);

    if (this.renderer.confirmResetRoomModal) {
      this.renderer.confirmResetRoomModal.addEventListener('click', (e) => {
        if (e.target === this.renderer.confirmResetRoomModal) closeResetRoomConfirm();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.renderer.confirmResetRoomModal && (this.renderer.confirmResetRoomModal.classList.contains('show') || this.renderer.confirmResetRoomModal.style.display === 'flex')) {
        closeResetRoomConfirm();
      }
    });

    const confirmResetRoomBtn = document.getElementById('confirmResetRoomBtn');
    if (confirmResetRoomBtn) {
      confirmResetRoomBtn.addEventListener('click', async () => {
        if (this.state.role !== 'game_master' || this.state.isSpectating) return;
        try {
          closeResetRoomConfirm();

          const code = this.state.roomCode;
          if (!code) return;

          const resetStocks = this.state.getResetStocks();

          // Unsubscribe GM listeners first to prevent receiving player-kick reset event
          if (this.marketController) {
            this.marketController.unsubscribeAll();
          }

          // Reset room state on cloud and kick all participants atomically
          await this.firebaseService.resetRoomWithKickAll(code, resetStocks);

          // Clear GM local action history & session
          this.state.undoStack = [];
          this.state.redoStack = [];
          this.state.pendingOrders = {};
          this.renderer.updateHistoryControlsUI(true, false, false);
          this.state.resetFilters();

          if (this.playerSessionService && code) {
            this.playerSessionService.clearRoomSession(code);
          }

          this.state.reset();
          this.renderer.hideGMTransferModal();
          this.renderer.hidePlayerNameModal();
          this.renderer.showLobby();
          this.renderer.showErrorAlert("รีเซ็ตเกมสำเร็จ", "ทำการรีเซ็ตข้อมูลเกมและนำผู้เล่นทุกคนรวมทั้ง GM กลับสู่ล็อบบี้เรียบร้อยแล้ว");
        } catch (error) {
          console.error("Failed to reset game in database:", error);
          this.renderer.showErrorAlert("เกิดข้อผิดพลาด", "ไม่สามารถรีเซ็ตเกมได้ โปรดลองอีกครั้ง");
        }
      });
    }
  }
}
