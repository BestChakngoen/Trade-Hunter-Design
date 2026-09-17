import { LobbyController } from './controllers/LobbyController.js';
import { TradeController } from './controllers/TradeController.js';
import { MarketBoardController } from './controllers/MarketBoardController.js';
import { TradeService } from './services/TradeService.js';
import { SessionLockService } from './services/SessionLockService.js';
import { SoundService } from './services/SoundService.js';
import { PlayerSessionService } from './services/PlayerSessionService.js';
import { GMHandoverService } from './services/GMHandoverService.js';

/**
 * MarketController - Main Facade Controller coordinating Lobby, Trading, and Market Board modules.
 */
export class MarketController {
  constructor(state, renderer, firebaseService) {
    this.state = state;
    this.renderer = renderer;
    this.renderer.state = state;
    this.firebaseService = firebaseService;

    // Audio & Sound FX Service
    this.soundService = new SoundService();

    // Multi-tab / Machine exclusivity service
    this.sessionLockService = new SessionLockService();

    // Player Persistent Session Service
    this.playerSessionService = new PlayerSessionService();

    // Sub-controllers following Single Responsibility Principle
    this.lobbyController = new LobbyController(state, renderer, firebaseService, this.sessionLockService, this.playerSessionService);
    this.tradeController = new TradeController(state, renderer, firebaseService);
    this.marketBoardController = new MarketBoardController(state, renderer, firebaseService);

    this.boardListenerUnsubscribe = null;
    this.roomListenerUnsubscribe = null;
    this.prevSalaryTimestamp = null;
    this.prevInterestTimestamp = null;
    this.prevDividendTimestamp = null;
    this.prevDebtInterestTimestamp = null;
  }

  get updateTradeFormPrice() {
    return this.tradeController.updateTradeFormPrice;
  }

  init() {
    this.renderer.ensureViewGraphButtons();
    this.renderer.applyBetaColors(this.state.originalCards);
    this.renderer.showLobby();

    // Initialize machine & multi-tab session exclusivity listener
    if (this.sessionLockService) {
      this.sessionLockService.init((reason, newUserId) => this.handleKickedSession(reason, newUserId));
    }

    // 1. Bind Lobby Flow
    this.lobbyController.bindLobbyEntrance((code) => {
      this.activateBoardRealtimeListener();
    });

    // 2. Bind Market Board Operations
    this.marketBoardController.bindSectorFilter();
    this.marketBoardController.bindSizeFilter();
    this.marketBoardController.bindSortButtons();
    this.marketBoardController.bindResetBtn();
    this.marketBoardController.bindPriceControls();
    this.marketBoardController.bindHistoryButtons();
    this.marketBoardController.bindStockModals();
    this.marketBoardController.bindDangerZone();
    this.marketBoardController.bindSpectatorEvents();

    if (this.renderer.payAllDividendBtn) {
      this.renderer.payAllDividendBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await this.tradeController.payAllPlayersDividend();
      });
    }

    // 3. Tab Navigation & Trade Form Events
    this.renderer.bindTabEvents(async (tab) => {
      if (tab === 'portfolio') {
        const stats = this.state.getPortfolioStats();
        const user = this.firebaseService.getCurrentUser();
        const uid = user ? user.uid : null;
        this.renderer.updatePortfolioUI(stats, this.state.portfolio, this.state.boardStocks, this.state.pendingOrders, uid);
        const debtData = TradeService.calculateDebtInstrumentsValue(this.state.portfolio?.debt);
        this.renderer.updateDebtInstrumentsUI(
          debtData,
          async (key) => { await this.tradeController.submitDebtOrder('INVEST', key); },
          async (key) => { await this.tradeController.submitDebtOrder('REDEEM', key); }
        );
        if (this.tradeController.refreshDropdownOptions) {
          this.tradeController.refreshDropdownOptions();
        }
      } else if (tab === 'management') {
        await this.refreshManagementView();
      }
    });

    this.tradeController.bindTradeFormEvents();
    this.bindLeaveRoomButton();
    this.bindGMHandoverButton();
    this.bindGlobalProtectionEvents();
  }

  bindLeaveRoomButton() {
    const leaveBtn = document.getElementById('leaveRoomBtn');
    if (!leaveBtn) return;

    leaveBtn.addEventListener('click', async () => {
      const isGM = (this.state.role === 'game_master');
      const title = "Leave Room";
      const message = isGM 
        ? "คุณแน่ใจหรือไม่ว่าต้องการออกจากห้อง? ในฐานะ GM การออกจากห้องอาจส่งมอบสิทธิ์ให้ผู้เล่นคนอื่น หรือปิดเซสชันห้องเกมสำหรับทุกคน"
        : "คุณแน่ใจหรือไม่ว่าต้องการออกจากห้อง? (หากห้องยังไม่หมดอายุหรือยังมีผู้เล่นในห้อง คุณสามารถกลับเข้ามาเล่นต่อด้วยข้อมูลเดิมได้)";

      const result = await this.renderer.showConfirmAlert(title, message, "YES", "NO");
      if (!result || !result.isConfirmed) return;

      const roomCode = this.state.roomCode;
      const currentUser = this.firebaseService.getCurrentUser();
      const currentUid = currentUser ? currentUser.uid : null;

      this.unsubscribeAll();
      await this.removeMemberAndTransferIfNeeded(roomCode, currentUid, isGM);

      this.state.reset();
      this.renderer.showLobby();
    });
  }

  bindGMHandoverButton() {
    if (!this.renderer.openTransferGmModalBtn) return;

    this.renderer.openTransferGmModalBtn.addEventListener('click', async () => {
      const code = this.state.roomCode;
      if (!code) return;

      const roomSnap = await this.firebaseService.getRoomStateSnapshot(code);
      if (!roomSnap || !roomSnap.exists()) return;
      const roomData = roomSnap.val();
      const members = roomData.members || {};
      const currentUser = this.firebaseService.getCurrentUser();
      const currentUid = currentUser ? currentUser.uid : null;

      const eligiblePlayers = GMHandoverService.getEligiblePlayers(members, currentUid);

      this.renderer.showDirectTransferModal(eligiblePlayers, async (targetUid, targetPlayer) => {
        const hasBackup = Boolean(members[currentUid]?.backupPlayerProfile);
        const confirmResult = await this.renderer.showConfirmAlert(
          "ยืนยันการส่งมอบตำแหน่ง GM",
          `คุณต้องการส่งมอบสิทธิ์ GM ให้กับ "${targetPlayer.displayName}" หรือไม่? ${hasBackup ? '(ข้อมูลพอร์ตเดิมของคุณจะถูกโหลดกลับมา)' : ''}`,
          "ยืนยันส่งมอบ",
          "ยกเลิก"
        );

        if (!confirmResult || !confirmResult.isConfirmed) return;

        try {
          const res = await this.firebaseService.transferGMRoleDirectly(code, currentUid, targetUid);
          if (res && res.success) {
            this.renderer.showTopToast(
              "GM HANDOVER SUCCESS",
              `ส่งมอบตำแหน่ง GM ให้กับ "${targetPlayer.displayName}" สำเร็จแล้ว!`,
              "success"
            );
            if (res.formerGmRestoredProfile) {
              this.renderer.showTopToast(
                "DATA RESTORED",
                `โหลดข้อมูลเดิมของ ${res.formerGmRestoredProfile.displayName} เรียบร้อยแล้ว`,
                "approved"
              );
            }
          } else {
            this.renderer.showErrorAlert("Transfer Failed", "ไม่สามารถส่งมอบตำแหน่งได้ กรุณาลองใหม่อีกครั้ง");
          }
        } catch (err) {
          console.error("[MarketController] Error transferring GM role:", err);
          this.renderer.showErrorAlert("Error", "เกิดข้อผิดพลาดในการส่งมอบตำแหน่ง GM");
        }
      });
    });
  }

  // Real-time synchronization Orchestrator
  activateBoardRealtimeListener() {
    const code = this.state.roomCode;
    if (!code) return;

    const user = this.firebaseService.getCurrentUser();

    if (this.boardListenerUnsubscribe) {
      this.boardListenerUnsubscribe();
    }

    this.boardListenerUnsubscribe = this.firebaseService.listenToBoard(code, (firebaseBoard) => {
      if (!firebaseBoard) return;

      const oldPrices = {};
      Object.keys(this.state.boardStocks).forEach(name => {
        oldPrices[name] = this.state.boardStocks[name].value;
      });

      this.state.updateFromFirebaseBoard(firebaseBoard);

      this.renderer.applyPriceColors(this.state.originalCards, this.state.boardStocks, this.state.masterStocks, this.state.initialPrices);
      if (this.renderer.priceGrid) {
        const liveCards = Array.from(this.renderer.priceGrid.querySelectorAll('.price-card'));
        this.renderer.applyPriceColors(liveCards, this.state.boardStocks, this.state.masterStocks, this.state.initialPrices);
      }

      const changedStocks = [];
      firebaseBoard.stocks.forEach(stock => {
        const symbol = stock.name;
        const currentVal = stock.value;
        const prevVal = oldPrices[symbol];
        if (prevVal !== undefined && prevVal !== currentVal) {
          changedStocks.push({
            symbol,
            currentVal,
            prevVal,
            isUp: currentVal > prevVal
          });
        }
      });

      // Play Raise_price or Down_price sound for everyone when prices update
      if (changedStocks.length > 0 && this.soundService) {
        const upCount = changedStocks.filter(s => s.isUp).length;
        const downCount = changedStocks.filter(s => !s.isUp).length;
        if (upCount > downCount) {
          this.soundService.playRaisePrice();
        } else if (downCount > upCount) {
          this.soundService.playDownPrice();
        } else if (changedStocks[0].isUp) {
          this.soundService.playRaisePrice();
        } else {
          this.soundService.playDownPrice();
        }
      }

      // Real-time Toast Notifications for non-GM Players when stock prices are updated by GM
      if (this.state.role !== 'game_master' && changedStocks.length > 0) {
        if (changedStocks.length === 1) {
          const { symbol, currentVal, isUp } = changedStocks[0];
          this.renderer.showTopToast(
            isUp ? "STOCK PRICE INCREASED" : "STOCK PRICE DECREASED",
            `ราคาหุ้น ${symbol} ${isUp ? 'ปรับขึ้นเป็น' : 'ปรับลดลงเหลือ'} ${currentVal.toLocaleString('en-US')} บาท`,
            isUp ? "success" : "warning"
          );
        } else {
          const upCount = changedStocks.filter(s => s.isUp).length;
          const downCount = changedStocks.filter(s => !s.isUp).length;
          const isUp = upCount >= downCount;
          this.renderer.showTopToast(
            isUp ? "MARKET PRICE INCREASED" : "MARKET PRICE DECREASED",
            `ราคาหุ้นในตลาดถูกปรับเปลี่ยนทั้งหมด ${changedStocks.length} หุ้น`,
            isUp ? "success" : "warning"
          );
        }
      }

      firebaseBoard.stocks.forEach(stock => {
        const symbol = stock.name;
        const currentVal = stock.value;
        const prevVal = oldPrices[symbol];

        const card = this.state.originalCards.find(c => c.querySelector('.card-icon') && c.querySelector('.card-icon').textContent.trim() === symbol);
        const liveCard = this.renderer.priceGrid 
          ? Array.from(this.renderer.priceGrid.querySelectorAll('.price-card')).find(c => c.querySelector('.card-icon') && c.querySelector('.card-icon').textContent.trim() === symbol) 
          : null;

        const prevPrice = prevVal !== undefined ? prevVal : (stock.oldValue !== undefined ? stock.oldValue : currentVal);
        const direction = (prevPrice !== undefined && prevPrice !== null && prevPrice !== currentVal)
          ? (currentVal > prevPrice ? 'up' : 'down')
          : null;

        if (card) {
          card.setAttribute('data-price', currentVal);
          this.renderer.updateCardValue(card, currentVal, direction, prevPrice);
        }

        if (liveCard && liveCard !== card) {
          liveCard.setAttribute('data-price', currentVal);
          this.renderer.updateCardValue(liveCard, currentVal, direction, prevPrice);
        }

        const targetCard = liveCard || card;
        if (targetCard) {
          const chartContainer = targetCard.querySelector('.chart-container');
          if (chartContainer && (chartContainer.style.display === 'block' || chartContainer.style.display === 'flex')) {
            const master = this.state.masterStocks[symbol];
            const history = this.state.priceHistory[symbol] || [currentVal];
            const startPrice = master ? master.steps[master.startStep - 1] : (history[0] || currentVal);

            const changePct = startPrice === 0 ? 0 : ((currentVal - startPrice) / startPrice) * 100;

            const currentEl = chartContainer.querySelector('.stat-current-price');
            const changeEl = chartContainer.querySelector('.stat-change-pct');

            if (currentEl) {
              currentEl.textContent = currentVal.toLocaleString('en-US');
              currentEl.className = currentVal > startPrice ? 'stat-current-price text-xs font-bold text-positive' :
                                   currentVal < startPrice ? 'stat-current-price text-xs font-bold text-negative' :
                                   'stat-current-price text-xs font-bold text-neutral';
            }
            if (changeEl) {
              changeEl.textContent = `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%`;
              changeEl.className = changePct > 0 ? 'stat-change-pct text-xs font-bold text-positive' :
                                  changePct < 0 ? 'stat-change-pct text-xs font-bold text-negative' :
                                  'stat-change-pct text-xs font-bold text-gray-400';
            }

            const canvas = chartContainer.querySelector('.stock-chart-canvas');
            if (canvas) {
              this.renderer.drawCardChart(canvas, history);
            }
          }
        }
      });

      if (this.state.portfolio) {
        const stats = this.state.getPortfolioStats();
        const uid = user ? user.uid : null;
        this.renderer.updatePortfolioUI(stats, this.state.portfolio, this.state.boardStocks, this.state.pendingOrders, uid);
        const debtData = TradeService.calculateDebtInstrumentsValue(this.state.portfolio?.debt);
        this.renderer.updateDebtInstrumentsUI(
          debtData,
          async (key) => { await this.tradeController.submitDebtOrder('INVEST', key); },
          async (key) => { await this.tradeController.submitDebtOrder('REDEEM', key); }
        );
      }

      if (this.tradeController.updateTradeFormPrice) {
        this.tradeController.updateTradeFormPrice();
      }
    });

    if (user) {
      this.roomListenerUnsubscribe = this.firebaseService.listenToRoom(code, async (roomData) => {
        if (!roomData) {
          if (this.state.roomCode) {
            this.handleRoomExpired();
          }
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

        const orders = roomData.pendingOrders || {};
        this.state.updatePendingOrders(orders);

        // Update real-time room members count & capacity status badge
        this.renderer.updateRoomMembersUI(roomData.members, roomData.roomSettings);

        // GM Disconnect / Takeover Transfer Election Handler
        const members = roomData.members || {};
        const hasGM = Object.values(members).some(m => m && m.role === 'game_master');
        const transferReq = roomData.gmTransferRequest;

        if (!hasGM && Object.keys(members).length > 0 && (!transferReq || (!transferReq.active && !transferReq.claimedBy))) {
          this.firebaseService.triggerGMTransfer(code);
        }

        if (!hasGM && transferReq && transferReq.active && !transferReq.claimedBy) {
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
                  await this.refreshManagementView();
                  
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
              this.state.purgeUserData(uid);
            }
          });
        }
        this.prevMemberUids = currentMemberUids;

        if (roomData.roomSettings && roomData.roomSettings.gameMode) {
          this.state.setGameMode(roomData.roomSettings.gameMode);
        }

        // Check if player was evicted/removed from room (e.g. by GM Room Reset)
        if (this.state.role === 'player' && (!roomData.members || !roomData.members[currentUid])) {
          this.unsubscribeAll();
          if (this.playerSessionService && code) {
            this.playerSessionService.clearRoomSession(code);
          }
          this.state.reset();
          this.renderer.showLobby();
          this.renderer.showErrorAlert(
            "ออกจากห้อง",
            "ห้องเกมได้รับการรีเซ็ตโดย GM ระบบได้นำท่านกลับสู่หน้าล็อบบี้แล้ว"
          );
          return;
        }

        if (roomData.members && roomData.members[currentUid]) {
          const memberData = roomData.members[currentUid];
          const prevRole = this.state.role;
          this.state.updatePortfolioFromMemberData(memberData);

          // Detect live role transitions between GM and Player
          if (prevRole === 'game_master' && memberData.role === 'player') {
            this.state.isSpectating = false;
            this.renderer.updateControlsVisibility('player', memberData.displayName, this.state.gameMode);
            if (this.renderer.spectatorToggleBtn) this.renderer.spectatorToggleBtn.style.display = 'none';
            this.renderer.updateSpectatorButtonUI(false);
            this.firebaseService.configureDisconnectCleanup(code, currentUid, false);
            this.renderer.showTopToast("ROLE RESTORED", `คุณได้กลับสู่บทบาทผู้เล่น (${memberData.displayName}) และข้อมูลพอร์ตเดิมได้รับการกู้คืนแล้ว`, "approved");
          } else if (prevRole === 'player' && memberData.role === 'game_master') {
            this.renderer.updateControlsVisibility('game_master', 'GM', this.state.gameMode);
            if (this.renderer.spectatorToggleBtn) this.renderer.spectatorToggleBtn.style.display = 'block';
            this.firebaseService.configureDisconnectCleanup(code, currentUid, true);
            await this.refreshManagementView();
            this.renderer.showTopToast("GM ASSIGNED", "คุณได้รับการส่งมอบตำแหน่งเป็นผู้ควบคุมเกม (GM) เรียบร้อยแล้ว!", "approved");
          } else {
            this.renderer.updateControlsVisibility(this.state.role, this.state.playerName, this.state.gameMode);
          }

          // Keep savedMembers snapshot continuously synchronized with latest portfolio
          if (memberData.role === 'player' && memberData.portfolio && memberData.sessionToken && this.playerSessionService) {
            this.playerSessionService.syncPlayerToFirebase(code, this.firebaseService, memberData.sessionToken, memberData);
          }

          const stats = this.state.getPortfolioStats();
          this.renderer.updatePortfolioUI(stats, this.state.portfolio, this.state.boardStocks, orders, currentUid);
          const debtData = TradeService.calculateDebtInstrumentsValue(this.state.portfolio?.debt);
          this.renderer.updateDebtInstrumentsUI(
            debtData,
            async (key) => { await this.tradeController.submitDebtOrder('INVEST', key); },
            async (key) => { await this.tradeController.submitDebtOrder('REDEEM', key); }
          );
          if (this.tradeController.refreshDropdownOptions) {
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

          await this.refreshManagementView(roomData);
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
  }

  startRoomCountdownTimer(expiresAt) {
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

  async handleRoomExpired(customTitle = null, customMessage = null) {
    if (this.isHandlingExpiry) return;
    this.isHandlingExpiry = true;

    if (this.roomTimerInterval) {
      clearInterval(this.roomTimerInterval);
      this.roomTimerInterval = null;
    }

    const badge = document.getElementById('roomCountdownBadge');
    if (badge) badge.style.display = 'none';

    const roomCode = this.state.roomCode;
    this.unsubscribeAll();

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
        console.error("Failed to delete room on expiry:", e);
      }
    }

    this.state.reset();
    this.renderer.showLobby();

    this.isHandlingExpiry = false;
  }

  unsubscribeAll() {
    if (this.sessionLockService) {
      this.sessionLockService.cleanup();
    }
    if (this.roomTimerInterval) {
      clearInterval(this.roomTimerInterval);
      this.roomTimerInterval = null;
    }
    const badge = document.getElementById('roomCountdownBadge');
    if (badge) badge.style.display = 'none';

    if (this.boardListenerUnsubscribe) {
      this.boardListenerUnsubscribe();
      this.boardListenerUnsubscribe = null;
    }
    if (this.roomListenerUnsubscribe) {
      this.roomListenerUnsubscribe();
      this.roomListenerUnsubscribe = null;
    }
  }

  /**
   * Helper to remove member node and handle GM succession or room cleanup.
   */
  async removeMemberAndTransferIfNeeded(roomCode, currentUid, isGM) {
    if (!roomCode || !currentUid) return;

    if (isGM) {
      try {
        const roomSnap = await this.firebaseService.getRoomStateSnapshot(roomCode);
        const roomData = roomSnap ? roomSnap.val() : null;
        const members = roomData ? (roomData.members || {}) : {};
        const otherMembers = Object.keys(members).filter(uid => uid !== currentUid);

        await this.firebaseService.removeMemberFromRoom(roomCode, currentUid);

        if (otherMembers.length > 0) {
          await this.firebaseService.triggerGMTransfer(roomCode);
        } else {
          await this.firebaseService.deleteRoomData(roomCode);
        }
      } catch (e) {
        console.error("[MarketController] Failed to handle GM leave:", e);
      }
    } else {
      try {
        await this.firebaseService.removeMemberFromRoom(roomCode, currentUid);
      } catch (e) {
        console.error("[MarketController] Failed to remove player node on leave:", e);
      }
    }
  }

  /**
   * Handles automatic eviction when a newer tab/session is activated on the same machine/IP.
   */
  async handleKickedSession(reason, newUserId = null) {
    if (this.isBeingKicked) return;
    this.isBeingKicked = true;

    try {
      const roomCode = this.state.roomCode;
      const currentUser = this.firebaseService.getCurrentUser();
      const currentUid = currentUser ? currentUser.uid : null;
      const isGM = (this.state.role === 'game_master');

      this.unsubscribeAll();

      // Update room member count in Firebase: remove kicked tab's member if not identical to new session
      if (roomCode && currentUid && (!newUserId || currentUid !== newUserId)) {
        await this.removeMemberAndTransferIfNeeded(roomCode, currentUid, isGM);
      }

      this.state.reset();
      this.renderer.showLobby();
      await this.renderer.showErrorAlert(
        "SESSION DISCONNECTED",
        reason || "มีการเข้าเล่นจากแท็บใหม่ในเครื่องนี้ เซสชันของแท็บนี้ถูกปิดลงโดยอัตโนมัติ"
      );
    } catch (e) {
      console.error("[MarketController] Error handling kicked session:", e);
    } finally {
      this.isBeingKicked = false;
    }
  }

  async refreshManagementView(roomData = null) {
    if (this.state.role !== 'game_master' || this.state.isSpectating) return;

    if (!roomData) {
      if (!this.state.roomCode) return;
      try {
        const snap = await this.firebaseService.getRoomStateSnapshot(this.state.roomCode);
        roomData = snap && snap.exists() ? snap.val() : null;
      } catch (err) {
        console.warn("Could not fetch room snapshot for management view:", err);
      }
    }
    if (!roomData) return;

    const orders = roomData.pendingOrders || {};

    if (this.renderer.gmPendingOrdersSection) {
      this.renderer.gmPendingOrdersSection.style.display = 'block';
    }
    if (this.renderer.gmPlayerSalarySection) {
      this.renderer.gmPlayerSalarySection.style.display = 'block';
    }
    if (this.renderer.gmPlayerDividendSection) {
      this.renderer.gmPlayerDividendSection.style.display = 'block';
    }
    if (this.renderer.gmPlayerDebtInterestSection) {
      this.renderer.gmPlayerDebtInterestSection.style.display = 'block';
    }

    this.renderer.updateGMPendingOrdersUI(
      orders,
      async (orderId) => {
        await this.tradeController.approvePlayerOrder(orderId);
      },
      async (orderId) => {
        await this.tradeController.rejectPlayerOrder(orderId);
      }
    );
    this.renderer.updateGMPlayerSalaryUI(
      roomData.members,
      async (playerUid) => {
        await this.tradeController.payPlayerSalary(playerUid);
      }
    );
    this.renderer.updateGMPlayerDividendUI(
      roomData.members,
      this.state.boardStocks,
      this.state.masterStocks,
      this.state.originalCards,
      async (playerUid) => {
        await this.tradeController.payPlayerDividend(playerUid);
      }
    );
    this.renderer.updateGMPlayerDebtInterestUI(
      roomData.members,
      async (playerUid) => {
        await this.tradeController.payPlayerDebtInterest(playerUid);
      }
    );
  }

  bindGlobalProtectionEvents() {
    // 1. Prevent accidental reload via keyboard shortcuts (F5, Ctrl+R, Cmd+R)
    window.addEventListener('keydown', async (e) => {
      if ((e.key === 'F5') || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'))) {
        if (this.state.roomCode) {
          e.preventDefault();
          const result = await this.renderer.showConfirmAlert(
            "รีเฟรชหน้าเว็บ?",
            "คุณต้องการโหลดหน้านี้ใหม่หรือไม่? ข้อมูลหรือสถานะการเล่นปัจจุบันอาจมีการเปลี่ยนแปลง",
            "รีเฟรช",
            "ยกเลิก"
          );
          if (result && result.isConfirmed) {
            window.location.reload();
          }
        }
      }
    });

    // 2. Prevent accidental reload / tab close via browser controls
    window.addEventListener('beforeunload', (e) => {
      if (this.state.roomCode) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // 3. Prevent mobile back button / swipe back gesture navigation
    window.addEventListener('popstate', async () => {
      if (this.state.roomCode) {
        window.history.pushState({ page: 'in_game' }, '');
        const res = await this.renderer.showConfirmAlert(
          "ออกจากห้องเกม?",
          "คุณต้องการออกจากห้องเกมนี้ใช่หรือไม่?",
          "ออกจากห้อง",
          "อยู่ในเกมต่อ"
        );
        if (res && res.isConfirmed) {
          const leaveBtn = document.getElementById('leaveRoomBtn');
          if (leaveBtn) {
            leaveBtn.click();
          }
        }
      }
    });
  }
}
