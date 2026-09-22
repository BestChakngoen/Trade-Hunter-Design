import { TradeService } from '../../services/TradeService.js';
import { PlayerKickService } from '../../services/PlayerKickService.js';

/**
 * RoomSyncHandler - Dedicated handler for Real-time Room Synchronization,
 * player session lifecycle, GM election/takeover, salary/dividend notifications,
 * orders arrival alerts, and room expiration countdown timers.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class RoomSyncHandler {
  constructor({ state, renderer, firebaseService, soundService, tradeController, playerSessionService, marketController }) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
    this.soundService = soundService;
    this.tradeController = tradeController;
    this.playerSessionService = playerSessionService;
    this.marketController = marketController;

    this.roomListenerUnsubscribe = null;
    this.roomTimerInterval = null;
    this.roomExpiresAt = null;
    this.isHandlingExpiry = false;

    this.prevSalaryTimestamp = null;
    this.prevInterestTimestamp = null;
    this.prevDividendTimestamp = null;
    this.prevDebtInterestTimestamp = null;
    this.prevProcessedTimestamp = null;
    this.prevGMOrderIds = null;
    this.prevMemberUids = null;
    this.prevGMClaimedBy = null;
    this.latestRoomMembers = null;
  }

  get unsubscribeFn() {
    return this.roomListenerUnsubscribe;
  }

  /**
   * Activates real-time room listener for the given room code.
   */
  activate(code) {
    if (!code) return;

    const user = this.firebaseService.getCurrentUser();
    if (!user) return;

    if (this.roomListenerUnsubscribe) {
      this.roomListenerUnsubscribe();
      this.roomListenerUnsubscribe = null;
    }

    this.roomListenerUnsubscribe = this.firebaseService.listenToRoom(code, async (roomData) => {
      if (!roomData) {
        if (this.state.roomCode) {
          this.handleRoomExpired();
        }
        return;
      }

      // 1. Check if room was reset: Kick all participants to lobby & suppress GM takeover modal
      if (roomData.isReset || roomData.status === 'RESET') {
        if (this.state.role === 'game_master') {
          return; // GM has their own dedicated completion alert in MarketBoardController
        }
        this.renderer.hideGMTransferModal();
        this.renderer.hidePlayerNameModal();
        if (this.marketController) {
          this.marketController.unsubscribeAll();
        }
        if (this.playerSessionService && code) {
          this.playerSessionService.clearRoomSession(code);
        }
        this.state.reset();
        this.renderer.showLobby();
        this.renderer.showErrorAlert(
          "ห้องเกมได้รับการรีเซ็ต",
          "ห้องเกมนี้ถูกรีเซ็ตข้อมูลทั้งหมดโดย GM ระบบได้นำผู้เล่นทุกคนกลับสู่หน้าล็อบบี้แล้ว"
        );
        return;
      }

      // 3-Hour Room Session Expiration Check & Timer Initialization
      if (!roomData.expiresAt) {
        if (this.state.role === 'game_master') {
          const expiresAt = Date.now() + (3 * 60 * 60 * 1000);
          this.roomExpiresAt = expiresAt;
          this.firebaseService.updateRoom(code, { expiresAt });
        }
      } else {
        this.roomExpiresAt = roomData.expiresAt;
        this.startRoomCountdownTimer(roomData.expiresAt);
      }

      const currentUser = this.firebaseService.getCurrentUser();
      const currentUid = currentUser ? currentUser.uid : user.uid;

      // Check if this player was kicked by GM or evicted by room reset
      if (roomData.kickedMembers && roomData.kickedMembers[currentUid]) {
        const kickReason = roomData.kickedMembers[currentUid].reason;
        this.renderer.hideGMTransferModal();
        this.renderer.hideKickPlayerModal();
        this.renderer.hidePlayerNameModal();
        if (this.marketController) {
          this.marketController.unsubscribeAll();
        }
        if (this.playerSessionService && code) {
          this.playerSessionService.clearRoomSession(code);
        }
        this.firebaseService.clearKickedMember(code, currentUid).catch(() => {});
        this.state.reset();
        this.renderer.showLobby();
        if (kickReason === 'ROOM_RESET') {
          this.renderer.showErrorAlert(
            "ห้องเกมได้รับการรีเซ็ต",
            "ห้องเกมนี้ถูกรีเซ็ตข้อมูลทั้งหมดโดย GM ระบบได้นำผู้เล่นทุกคนกลับสู่หน้าล็อบบี้แล้ว"
          );
        } else {
          this.renderer.showErrorAlert(
            "ถูกให้ออกจากห้อง",
            "คุณถูกผู้ดูแลห้อง (GM) บังคับให้ออกจากห้องเกม และข้อมูลการเล่นทั้งหมดของคุณถูกรีเซ็ตเรียบร้อยแล้ว"
          );
        }
        return;
      }

      // Check if player is no longer registered as a member in the room (evicted by reset or room restart)
      if (this.state.role === 'player') {
        const members = roomData.members || {};
        if (!members[currentUid]) {
          this.renderer.hideGMTransferModal();
          this.renderer.hideKickPlayerModal();
          this.renderer.hidePlayerNameModal();
          if (this.marketController) {
            this.marketController.unsubscribeAll();
          }
          if (this.playerSessionService && code) {
            this.playerSessionService.clearRoomSession(code);
          }
          this.state.reset();
          this.renderer.showLobby();
          this.renderer.showErrorAlert(
            "ห้องเกมได้รับการรีเซ็ต",
            "ห้องเกมนี้ถูกรีเซ็ตข้อมูลทั้งหมดโดย GM ระบบได้นำคุณกลับสู่หน้าล็อบบี้แล้ว"
          );
          return;
        }
      }

      const orders = roomData.pendingOrders || {};
      this.state.updatePendingOrders(orders);

      // Update real-time room members count & capacity status badge
      this.renderer.updateRoomMembersUI(roomData.members, roomData.roomSettings);

      // GM Disconnect / Takeover Transfer Election Handler (Suppressed during room reset)
      const members = roomData.members || {};
      this.latestRoomMembers = members;

      // Real-time live update for Kick Player Modal if currently open
      if (this.state.role === 'game_master' && typeof this.renderer.isKickPlayerModalOpen === 'function' && this.renderer.isKickPlayerModalOpen()) {
        const eligiblePlayers = PlayerKickService.getEligiblePlayers(members, currentUid);
        this.renderer.updateKickPlayerList(eligiblePlayers);
      }
      const hasGM = Object.values(members).some(m => m && m.role === 'game_master' && m.online !== false);
      const transferReq = roomData.gmTransferRequest;
      const isResetState = Boolean(roomData.isReset || roomData.status === 'RESET');
      const activeMembersCount = Object.values(members).filter(m => m && m.online !== false).length;

      if (!isResetState && !hasGM && activeMembersCount > 0 && (!transferReq || (!transferReq.active && !transferReq.claimedBy))) {
        this.firebaseService.triggerGMTransfer(code);
      }

      if (!isResetState && !hasGM && transferReq && transferReq.active && !transferReq.claimedBy) {
        if (this.state.role !== 'game_master') {
          this.renderer.showGMTransferModal(
            async () => {
              const claimRes = await this.firebaseService.claimGMRoleWithTransaction(code, currentUid, this.state.playerName);
              if (claimRes && claimRes.claimed) {
                this.state.setRole('game_master');
                this.state.portfolio = null;
                this.state.isSpectating = false;
                this.renderer.hideGMTransferModal();
                this.renderer.updateControlsVisibility(this.state.role, this.state.playerName, this.state.gameMode);
                if (this.renderer.spectatorToggleBtn) {
                  this.renderer.spectatorToggleBtn.style.display = 'block';
                }
                this.renderer.updateSpectatorButtonUI(false);
                this.firebaseService.configureDisconnectCleanup(code, currentUid, true);

                // Refresh Management view immediately upon inheriting GM
                if (this.marketController) {
                  await this.marketController.refreshManagementView();
                }
                
                // Switch tab automatically to Market page as default upon taking over GM
                const tabMarketBtn = document.getElementById('tabMarketBtn');
                if (tabMarketBtn) {
                  tabMarketBtn.click();
                }

                this.renderer.showTopToast("GM TAKEOVER SUCCESS", "คุณได้สวมบทบาทเป็นผู้ควบคุมเกม (GM) คนใหม่แล้ว!", "success");
              } else {
                this.renderer.hideGMTransferModal();
                this.renderer.showTopToast("TAKEOVER FAILED", "ผู้เล่นคนอื่นได้ทำการสวมบทบาทเป็น GM ไปก่อนแล้ว!", "rejected");
              }
            },
            () => {
              // Declined by user
            }
          );
        }
      } else {
        this.renderer.hideGMTransferModal();
        if (transferReq && transferReq.claimedBy && transferReq.claimedBy !== this.prevGMClaimedBy) {
          this.prevGMClaimedBy = transferReq.claimedBy;
          if (transferReq.claimedBy !== currentUid) {
            const claimedName = transferReq.claimedByName || 'Player';
            this.renderer.showTopToast("NEW GM ELECTED", `${claimedName} ได้ทำการสวมบทบาทเป็น GM คนใหม่แล้ว!`, "approved");
          }
        }
      }

      // Detect members who left the room and purge their data from undo/redo history
      const currentMemberUids = new Set(Object.keys(roomData.members || {}));
      if (this.prevMemberUids) {
        this.prevMemberUids.forEach(uid => {
          if (!currentMemberUids.has(uid)) {
            if (typeof this.state.purgeUserData === 'function') {
              this.state.purgeUserData(uid);
            } else if (typeof this.state.removeMemberFromHistory === 'function') {
              this.state.removeMemberFromHistory(uid);
            }
          }
        });
      }
      this.prevMemberUids = currentMemberUids;

      if (roomData.roomSettings && roomData.roomSettings.gameMode) {
        this.state.setGameMode(roomData.roomSettings.gameMode);
      }

      // Check if player was evicted/removed from room (e.g. by GM Room Reset)
      if (this.state.role === 'player' && (!roomData.members || !roomData.members[currentUid])) {
        this.renderer.hideGMTransferModal();
        this.renderer.hideKickPlayerModal();
        this.renderer.hidePlayerNameModal();
        if (this.marketController) {
          this.marketController.unsubscribeAll();
        }
        if (this.playerSessionService && code) {
          this.playerSessionService.clearRoomSession(code);
        }
        this.state.reset();
        this.renderer.showLobby();
        this.renderer.showErrorAlert(
          "ออกจากห้อง",
          "ไม่พบข้อมูลผู้เล่นของคุณบนเซิร์ฟเวอร์ หรือห้องเกมได้รับการรีเซ็ต ระบบได้นำท่านกลับสู่หน้าล็อบบี้แล้ว"
        );
        return;
      }

      if (roomData.members && roomData.members[currentUid]) {
        const memberData = roomData.members[currentUid];
        if (memberData.online === false && !(this.marketController && this.marketController.isBeingKicked)) {
          this.firebaseService.setMemberOnlineStatus(code, currentUid, true);
        }
        const prevRole = this.state.role;
        this.state.updatePortfolioFromMemberData(memberData);

        // Detect live role transitions between GM and Player
        if (prevRole === 'game_master' && memberData.role === 'player') {
          this.state.isSpectating = false;
          this.renderer.hideKickPlayerModal();
          this.renderer.updateControlsVisibility('player', memberData.displayName, this.state.gameMode);
          if (this.renderer.spectatorToggleBtn) this.renderer.spectatorToggleBtn.style.display = 'none';
          this.renderer.updateSpectatorButtonUI(false);
          this.firebaseService.configureDisconnectCleanup(code, currentUid, false);

          // Show who claimed GM role (from gmTransferRequest) or generic message
          const claimedByName = roomData.gmTransferRequest?.claimedByName;
          const takenByMsg = claimedByName
            ? `ผู้เล่น "${claimedByName}" ได้อ้างสิทธิ์ตำแหน่ง GM แทนคุณแล้ว`
            : 'ตำแหน่ง GM ของคุณถูกโอนให้ผู้เล่นคนอื่นแล้ว';
          this.renderer.showTopToast("GM ROLE TAKEN", takenByMsg, "rejected");

          // Notify that portfolio was restored
          this.renderer.showTopToast("ROLE RESTORED", `คุณได้กลับสู่บทบาทผู้เล่น (${memberData.displayName}) และข้อมูลพอร์ตเดิมได้รับการกู้คืนแล้ว`, "approved");

          if (this.marketController && !this.marketController._playerNameModalCleanup) {
            setTimeout(() => {
              const prefill = (memberData.displayName && memberData.displayName !== 'GM') ? memberData.displayName : '';
              this.marketController.openPlayerNameModal({
                title: "แก้ไขชื่อผู้เล่น",
                subtitle: "คุณได้เปลี่ยนบทบาทเป็นผู้เล่นแล้ว โปรดระบุชื่อที่ต้องการใช้แสดงในห้องเกม (1 - 20 ตัวอักษร)",
                confirmText: "บันทึกชื่อ",
                initialValue: prefill,
                allowClose: false
              });
            }, 300);
          }
        } else if (prevRole === 'player' && memberData.role === 'game_master') {
          this.renderer.updateControlsVisibility('game_master', 'GM', this.state.gameMode);
          if (this.renderer.spectatorToggleBtn) this.renderer.spectatorToggleBtn.style.display = 'block';
          this.firebaseService.configureDisconnectCleanup(code, currentUid, true);
          if (this.marketController) {
            await this.marketController.refreshManagementView();
          }
          this.renderer.showTopToast("GM ASSIGNED", "คุณได้รับการส่งมอบตำแหน่งเป็นผู้ควบคุมเกม (GM) เรียบร้อยแล้ว!", "approved");
        } else {
          this.renderer.updateControlsVisibility(this.state.role, this.state.playerName, this.state.gameMode);
        }

        const stats = this.state.getPortfolioStats();
        this.renderer.updatePortfolioUI(stats, this.state.portfolio, this.state.boardStocks, orders, currentUid);
        const debtData = TradeService.calculateDebtInstrumentsValue(this.state.portfolio?.debt);
        this.renderer.updateDebtInstrumentsUI(
          debtData,
          async (key) => { if (this.tradeController) await this.tradeController.submitDebtOrder('INVEST', key); },
          async (key) => { if (this.tradeController) await this.tradeController.submitDebtOrder('REDEEM', key); }
        );
        if (this.tradeController && this.tradeController.refreshDropdownOptions) {
          this.tradeController.refreshDropdownOptions();
        }
      }

      this.renderer.updatePlayerPendingOrdersUI(orders, currentUid);

      // Player: Detect Trade Approval & Rejection Toast Notifications
      if (this.state.role === 'player') {
        const lastOrderMap = roomData.lastProcessedOrder || roomData.lastOrderProcessed || {};
        const myLastOrder = lastOrderMap[currentUid];
        
        if (myLastOrder && myLastOrder.timestamp && myLastOrder.timestamp !== this.prevProcessedTimestamp) {
          this.prevProcessedTimestamp = myLastOrder.timestamp;
          if (myLastOrder.status === 'APPROVED') {
            if (this.soundService) this.soundService.playApprove();
            this.renderer.showTopToast(
              "ORDER APPROVED",
              `คำสั่ง ${myLastOrder.type} หุ้น ${myLastOrder.symbol} (${myLastOrder.volume || 1} หุ้น) ได้รับการอนุมัติแล้ว`,
              "approved"
            );
          } else if (myLastOrder.status === 'REJECTED') {
            if (this.soundService) this.soundService.playReject();
            this.renderer.showTopToast(
              "ORDER REJECTED",
              `คำสั่ง ${myLastOrder.type} หุ้น ${myLastOrder.symbol} (${myLastOrder.volume || 1} หุ้น) ถูกปฏิเสธโดย GM`,
              "rejected"
            );
          }
        }

        const lastSalaryMap = roomData.lastSalaryReceived || {};
        const mySalary = lastSalaryMap[currentUid];
        if (mySalary && mySalary.timestamp && mySalary.timestamp !== this.prevSalaryTimestamp) {
          this.prevSalaryTimestamp = mySalary.timestamp;
          if (this.soundService) this.soundService.playReceiveMoney();
          this.renderer.showTopToast(
            "SALARY RECEIVED",
            `คุณได้รับเงินเดือนจำนวน ${Number(mySalary.amount || 10000).toLocaleString()} บาทจาก GM`,
            "success"
          );
        }

        const lastDividendMap = roomData.lastDividendReceived || roomData.lastInterestReceived || {};
        const myDividend = lastDividendMap[currentUid];
        if (myDividend && myDividend.timestamp && myDividend.timestamp !== this.prevDividendTimestamp) {
          this.prevDividendTimestamp = myDividend.timestamp;
          if (this.soundService) this.soundService.playReceiveMoney();
          this.renderer.showTopToast(
            "DIVIDEND RECEIVED",
            `คุณได้รับเงินปันผลหุ้นจำนวน ${Number(myDividend.amount || 0).toLocaleString('en-US')} บาทจาก GM`,
            "success"
          );
        }

        const lastDebtInterestMap = roomData.lastDebtInterestReceived || {};
        const myDebtInterest = lastDebtInterestMap[currentUid];
        if (myDebtInterest && myDebtInterest.timestamp && myDebtInterest.timestamp !== this.prevDebtInterestTimestamp) {
          this.prevDebtInterestTimestamp = myDebtInterest.timestamp;
          if (this.soundService) this.soundService.playReceiveMoney();
          this.renderer.showTopToast(
            "DEBT INTEREST RECEIVED",
            `คุณได้รับดอกเบี้ยเงินกู้จำนวน ${Number(myDebtInterest.amount || 0).toLocaleString('en-US')} บาทจาก GM`,
            "success"
          );
        }
      }

      // GM: Detect New Player Order Arrival
      if (this.state.role === 'game_master' && !this.state.isSpectating) {
        const currentGMOrderIds = new Set(Object.keys(orders));
        if (this.prevGMOrderIds) {
          currentGMOrderIds.forEach(orderId => {
            if (!this.prevGMOrderIds.has(orderId)) {
              const newOrder = orders[orderId];
              if (this.soundService) this.soundService.playWarning();
              this.renderer.showTopToast(
                "NEW ORDER RECEIVED",
                `${newOrder.username || 'ผู้เล่น'} ได้ส่งคำสั่ง ${newOrder.type} หุ้น ${newOrder.symbol}`,
                "warning"
              );
            }
          });
        }
        this.prevGMOrderIds = currentGMOrderIds;

        if (this.marketController) {
          await this.marketController.refreshManagementView(roomData);
        }
      } else {
        if (this.renderer.gmPendingOrdersSection) {
          this.renderer.gmPendingOrdersSection.style.display = 'none';
        }
        if (this.renderer.gmPlayerSalarySection) {
          this.renderer.gmPlayerSalarySection.style.display = 'none';
        }
        if (this.renderer.gmPlayerDividendSection) {
          this.renderer.gmPlayerDividendSection.style.display = 'none';
        }
        if (this.renderer.gmPlayerDebtInterestSection) {
          this.renderer.gmPlayerDebtInterestSection.style.display = 'none';
        }
      }
    });
  }

  /**
   * Starts room expiration countdown timer.
   */
  startRoomCountdownTimer(expiresAt) {
    if (typeof document === 'undefined') return;

    const badge = document.getElementById('roomCountdownBadge');
    const timerText = document.getElementById('roomCountdownTimerText');
    const icon = document.getElementById('roomCountdownIcon');
    if (!badge || !timerText) return;

    badge.style.display = 'block';

    const updateTimer = () => {
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        this.handleRoomExpired();
        return;
      }

      const totalSecs = Math.floor(remainingMs / 1000);
      const hours = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
      const mins = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
      const secs = String(totalSecs % 60).padStart(2, '0');

      timerText.textContent = `${hours}:${mins}:${secs}`;

      if (remainingMs < 10 * 60 * 1000) {
        timerText.style.color = '#ff453a';
        if (icon) icon.style.color = '#ff453a';
      } else {
        timerText.style.color = '#f3f4f6';
        if (icon) icon.style.color = '#34d399';
      }
    };

    updateTimer();
    if (this.roomTimerInterval) clearInterval(this.roomTimerInterval);
    this.roomTimerInterval = setInterval(updateTimer, 1000);
  }

  /**
   * Handles room expiration / timeout cleanup.
   */
  async handleRoomExpired(customTitle = null, customMessage = null) {
    if (this.isHandlingExpiry) return;
    this.isHandlingExpiry = true;

    if (this.roomTimerInterval) {
      clearInterval(this.roomTimerInterval);
      this.roomTimerInterval = null;
    }

    if (typeof document !== 'undefined') {
      const badge = document.getElementById('roomCountdownBadge');
      if (badge) badge.style.display = 'none';
    }

    const roomCode = this.state.roomCode;
    if (this.marketController) {
      this.marketController.unsubscribeAll();
    }

    const isExplicitReset = this.roomExpiresAt && Date.now() < this.roomExpiresAt;
    const title = customTitle || (isExplicitReset ? "ROOM RESET" : "SESSION EXPIRED");
    const message = customMessage || (isExplicitReset 
      ? "ห้องเกมนี้ถูกรีเซ็ตข้อมูลทั้งหมดโดย GM ระบบกำลังนำท่านกลับสู่หน้าล็อบบี้..." 
      : "The 3-hour room session limit has expired. Returning to lobby...");

    // 1. Display Modal Alert without OK button with 3.5s auto dismiss
    this.renderer.showAutoDismissModal(
      title,
      message,
      3500
    );

    // 2. Wait for 3.5 seconds
    await new Promise(resolve => setTimeout(resolve, 3500));

    // 3. Purge room data, reset state, and return to lobby
    if (roomCode) {
      try {
        await this.firebaseService.deleteRoomData(roomCode);
      } catch (e) {
        console.error("[RoomSyncHandler] Failed to delete room on expiry:", e);
      }
    }

    if (this.playerSessionService && roomCode) {
      this.playerSessionService.clearRoomSession(roomCode);
    }

    this.state.reset();
    this.renderer.showLobby();

    this.isHandlingExpiry = false;
  }

  unsubscribe() {
    if (this.roomTimerInterval) {
      clearInterval(this.roomTimerInterval);
      this.roomTimerInterval = null;
    }
    if (typeof document !== 'undefined') {
      const badge = document.getElementById('roomCountdownBadge');
      if (badge) badge.style.display = 'none';
    }

    if (this.roomListenerUnsubscribe) {
      this.roomListenerUnsubscribe();
      this.roomListenerUnsubscribe = null;
    }
    this.prevMemberUids = null;
  }

  reset() {
    this.unsubscribe();
  }
}
