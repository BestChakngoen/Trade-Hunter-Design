/**
 * DangerZoneHandler - Dedicated controller responsible for Danger Zone operations
 * including resetting market stock prices and atomic room purging with kick-all to lobby.
 * Also handles Player Danger Zone emergency actions (Become GM, Reset Game) for cases
 * where the GM is stuck or offline.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class DangerZoneHandler {
  constructor({ state, renderer, firebaseService, marketController = null, playerSessionService = null, onPriceReset = null, onBecomeGM = null }) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
    this.marketController = marketController;
    this.playerSessionService = playerSessionService;
    this.onPriceReset = onPriceReset;
    this.onBecomeGM = onBecomeGM;
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

  /**
   * Binds Player Danger Zone emergency buttons:
   * - Become GM: Claims GM role atomically when GM is stuck/offline.
   * - Reset Game: Resets room and returns all players to lobby.
   */
  bindPlayerDangerZone() {
    const becomeGmBtn = document.getElementById('playerBecomeGmBtn');
    if (becomeGmBtn) {
      becomeGmBtn.addEventListener('click', async () => {
        if (this.state.role !== 'player') return;

        const confirmResult = await this.renderer.showConfirmAlert(
          "รับตำแหน่ง Game Master?",
          "คุณต้องการเป็น Game Master หรือไม่? หากมี GM อยู่แล้ว จะถูก demote กลับเป็นผู้เล่นอัตโนมัติ ข้อมูลพอร์ตเดิมของคุณจะถูกบันทึกไว้",
          "ยืนยัน",
          "ยกเลิก"
        );
        if (!confirmResult || !confirmResult.isConfirmed) return;

        try {
          const currentUser = this.firebaseService.getCurrentUser();
          const currentUid = currentUser ? currentUser.uid : null;
          const playerName = this.state.playerName || 'Player';

          const { success } = await this.firebaseService.forceClaimGMRole(
            this.state.roomCode,
            currentUid,
            playerName
          );

          if (success) {
            if (typeof this.onBecomeGM === 'function') {
              this.onBecomeGM();
            }
            this.renderer.showTopToast(
              "BECOME GM SUCCESS",
              "คุณได้รับตำแหน่ง Game Master เรียบร้อยแล้ว!",
              "success"
            );
          } else {
            this.renderer.showErrorAlert(
              "อ้างสิทธิ์ไม่สำเร็จ",
              "ผู้เล่นคนอื่นอาจอ้างสิทธิ์ GM ไปก่อนแล้ว กรุณาลองใหม่อีกครั้ง"
            );
          }
        } catch (error) {
          console.error("[DangerZoneHandler] Failed to force-claim GM role:", error);
          this.renderer.showErrorAlert("เกิดข้อผิดพลาด", "ไม่สามารถอ้างสิทธิ์ GM ได้ โปรดลองอีกครั้ง");
        }
      });
    }

    const playerResetGameBtn = document.getElementById('playerResetGameBtn');
    if (playerResetGameBtn) {
      playerResetGameBtn.addEventListener('click', async () => {
        if (this.state.role !== 'player') return;

        // First confirmation
        const firstConfirm = await this.renderer.showConfirmAlert(
          "รีเซ็ตเกม?",
          "การดำเนินการนี้จะรีเซ็ตกระดานหุ้น ล้างคำสั่งซื้อขายทั้งหมด และนำผู้เล่นทุกคนรวมทั้งคุณกลับสู่หน้าล็อบบี้ คุณแน่ใจหรือไม่?",
          "ใช่, รีเซ็ตเกม",
          "ยกเลิก"
        );
        if (!firstConfirm || !firstConfirm.isConfirmed) return;

        // Second confirmation (double safety)
        const secondConfirm = await this.renderer.showConfirmAlert(
          "⚠️ ยืนยันอีกครั้ง",
          "ข้อมูลพอร์ตของผู้เล่นทุกคนจะถูกรีเซ็ตกลับค่าเริ่มต้น ไม่สามารถยกเลิกได้ ยืนยันการรีเซ็ตเกมหรือไม่?",
          "ยืนยัน รีเซ็ต",
          "ยกเลิก"
        );
        if (!secondConfirm || !secondConfirm.isConfirmed) return;

        try {
          const code = this.state.roomCode;
          if (!code) return;

          const resetStocks = this.state.getResetStocks();

          if (this.marketController) {
            this.marketController.unsubscribeAll();
          }

          await this.firebaseService.resetRoomWithKickAll(code, resetStocks);

          if (this.playerSessionService && code) {
            this.playerSessionService.clearRoomSession(code);
          }

          this.state.reset();
          this.renderer.hideGMTransferModal();
          this.renderer.hidePlayerNameModal();
          this.renderer.showLobby();
          this.renderer.showErrorAlert("รีเซ็ตเกมสำเร็จ", "ทำการรีเซ็ตข้อมูลเกมและนำผู้เล่นทุกคนกลับสู่ล็อบบี้เรียบร้อยแล้ว");
        } catch (error) {
          console.error("[DangerZoneHandler] Player failed to reset game:", error);
          this.renderer.showErrorAlert("เกิดข้อผิดพลาด", "ไม่สามารถรีเซ็ตเกมได้ โปรดลองอีกครั้ง");
        }
      });
    }
  }
}
