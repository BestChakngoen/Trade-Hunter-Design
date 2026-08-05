import { LobbyController } from './controllers/LobbyController.js';
import { TradeController } from './controllers/TradeController.js';
import { MarketBoardController } from './controllers/MarketBoardController.js';

/**
 * MarketController - Main Facade Controller coordinating Lobby, Trading, and Market Board modules.
 */
export class MarketController {
  constructor(state, renderer, firebaseService) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;

    // Sub-controllers following Single Responsibility Principle
    this.lobbyController = new LobbyController(state, renderer, firebaseService);
    this.tradeController = new TradeController(state, renderer, firebaseService);
    this.marketBoardController = new MarketBoardController(state, renderer, firebaseService);

    this.boardListenerUnsubscribe = null;
    this.roomListenerUnsubscribe = null;
  }

  get updateTradeFormPrice() {
    return this.tradeController.updateTradeFormPrice;
  }

  init() {
    this.renderer.ensureViewGraphButtons();
    this.renderer.applyBetaColors(this.state.originalCards);
    this.renderer.showLobby();

    // 1. Bind Lobby Flow
    this.lobbyController.bindLobbyEntrance((code) => {
      this.activateBoardRealtimeListener();
    });

    // 2. Bind Market Board Operations
    this.marketBoardController.bindSectorFilter();
    this.marketBoardController.bindSortButtons();
    this.marketBoardController.bindResetBtn();
    this.marketBoardController.bindPriceControls();
    this.marketBoardController.bindStockModals();
    this.marketBoardController.bindDangerZone();
    this.marketBoardController.bindSpectatorEvents();

    // 3. Tab Navigation & Trade Form Events
    this.renderer.bindTabEvents((tab) => {
      if (tab === 'portfolio') {
        const stats = this.state.getPortfolioStats();
        const user = this.firebaseService.getCurrentUser();
        const uid = user ? user.uid : null;
        this.renderer.updatePortfolioUI(stats, this.state.portfolio, this.state.boardStocks, this.state.pendingOrders, uid);
        if (this.tradeController.refreshDropdownOptions) {
          this.tradeController.refreshDropdownOptions();
        }
      }
    });

    this.tradeController.bindTradeFormEvents();
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

      firebaseBoard.stocks.forEach(stock => {
        const symbol = stock.name;
        const currentVal = stock.value;
        const prevVal = oldPrices[symbol];

        const card = this.state.originalCards.find(c => c.querySelector('.card-icon').textContent.trim() === symbol);
        if (card) {
          card.setAttribute('data-price', currentVal);

          const valueText = card.querySelector('.card-value');
          if (valueText) {
            valueText.textContent = currentVal.toLocaleString('en-US');
          }

          if (prevVal !== undefined && prevVal !== currentVal) {
            const direction = currentVal > prevVal ? 'up' : 'down';
            this.renderer.updateCardValue(card, currentVal, direction);

            const chartContainer = card.querySelector('.chart-container');
            if (chartContainer && chartContainer.style.display === 'block') {
              const master = this.state.masterStocks[symbol];
              const history = this.state.priceHistory[symbol] || [currentVal];
              const startPrice = master ? master.steps[master.startStep - 1] : currentVal;

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
        }
      });

      if (this.state.portfolio) {
        const stats = this.state.getPortfolioStats();
        const uid = user ? user.uid : null;
        this.renderer.updatePortfolioUI(stats, this.state.portfolio, this.state.boardStocks, this.state.pendingOrders, uid);
      }

      if (this.tradeController.updateTradeFormPrice) {
        this.tradeController.updateTradeFormPrice();
      }
    });

    if (user) {
      this.roomListenerUnsubscribe = this.firebaseService.listenToRoom(code, (roomData) => {
        if (!roomData) return;

        const currentUser = this.firebaseService.getCurrentUser();
        const currentUid = currentUser ? currentUser.uid : user.uid;

        const orders = roomData.pendingOrders || {};
        this.state.updatePendingOrders(orders);

        if (roomData.members && roomData.members[currentUid]) {
          const memberData = roomData.members[currentUid];
          this.state.updatePortfolioFromMemberData(memberData);

          this.renderer.updateControlsVisibility(this.state.role, this.state.playerName);

          const stats = this.state.getPortfolioStats();
          this.renderer.updatePortfolioUI(stats, this.state.portfolio, this.state.boardStocks, orders, currentUid);
          if (this.tradeController.refreshDropdownOptions) {
            this.tradeController.refreshDropdownOptions();
          }
        }

        this.renderer.updatePlayerPendingOrdersUI(orders, currentUid);

        if (this.state.role === 'game_master' && !this.state.isSpectating) {
          if (this.renderer.gmPendingOrdersSection) {
            this.renderer.gmPendingOrdersSection.style.display = 'block';
          }
          if (this.renderer.gmPlayerSalarySection) {
            this.renderer.gmPlayerSalarySection.style.display = 'block';
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
        } else {
          if (this.renderer.gmPendingOrdersSection) {
            this.renderer.gmPendingOrdersSection.style.display = 'none';
          }
          if (this.renderer.gmPlayerSalarySection) {
            this.renderer.gmPlayerSalarySection.style.display = 'none';
          }
        }
      });
    }
  }

  unsubscribeAll() {
    if (this.boardListenerUnsubscribe) {
      this.boardListenerUnsubscribe();
      this.boardListenerUnsubscribe = null;
    }
    if (this.roomListenerUnsubscribe) {
      this.roomListenerUnsubscribe();
      this.roomListenerUnsubscribe = null;
    }
  }
}
