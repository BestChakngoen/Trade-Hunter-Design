import { TradeService } from '../../services/TradeService.js';

/**
 * BoardSyncHandler - Dedicated handler for Real-time Stock Board synchronization,
 * price change detection, card value updates, audio triggers, and open chart updates.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class BoardSyncHandler {
  constructor({ state, renderer, firebaseService, soundService, tradeController }) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
    this.soundService = soundService;
    this.tradeController = tradeController;

    this.boardListenerUnsubscribe = null;
    this.hasReceivedInitialBoard = false;
  }

  get unsubscribeFn() {
    return this.boardListenerUnsubscribe;
  }

  /**
   * Activates real-time board listener for the given room code.
   */
  activate(code) {
    if (!code) return;

    if (this.boardListenerUnsubscribe) {
      this.boardListenerUnsubscribe();
      this.boardListenerUnsubscribe = null;
    }

    this.hasReceivedInitialBoard = false;

    this.boardListenerUnsubscribe = this.firebaseService.listenToBoard(code, (firebaseBoard) => {
      if (!firebaseBoard) return;

      const user = this.firebaseService.getCurrentUser();
      const isFirstLoad = !this.hasReceivedInitialBoard;
      this.hasReceivedInitialBoard = true;

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
      if (Array.isArray(firebaseBoard.stocks)) {
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
      }

      // Check if this board update is a Reset action (e.g. GM clicked Reset Price or Room Reset)
      const stocksList = Array.isArray(firebaseBoard.stocks) 
        ? firebaseBoard.stocks 
        : (firebaseBoard.stocks && typeof firebaseBoard.stocks === 'object' ? Object.values(firebaseBoard.stocks) : []);
      const hasStocks = stocksList.length > 0;
      const allStocksReset = hasStocks && stocksList.every(s => 
        (s.oldValue === null || s.oldValue === undefined) && !s.direction
      );
      const isBoardReset = Boolean(firebaseBoard.isReset) || allStocksReset || isFirstLoad;

      // Play Raise_price or Down_price sound for everyone when prices update (suppressed during board reset or initial load)
      if (!isFirstLoad && !isBoardReset && changedStocks.length > 0 && this.soundService) {
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
      if (!isFirstLoad) {
        if (!isBoardReset && this.state.role !== 'game_master' && changedStocks.length > 0) {
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
        } else if (isBoardReset && this.state.role !== 'game_master') {
          this.renderer.showTopToast(
            "PRICE RESET",
            "GM ได้ทำการรีเซ็ตราคาหุ้นกลับสู่ค่าเริ่มต้น",
            "warning"
          );
        }
      }

      if (Array.isArray(firebaseBoard.stocks)) {
        firebaseBoard.stocks.forEach(stock => {
          const symbol = stock.name;
          const currentVal = stock.value;
          const prevVal = oldPrices[symbol];

          const card = this.state.originalCards.find(c => c.querySelector('.card-icon') && c.querySelector('.card-icon').textContent.trim() === symbol);
          const liveCard = this.renderer.priceGrid 
            ? Array.from(this.renderer.priceGrid.querySelectorAll('.price-card')).find(c => c.querySelector('.card-icon') && c.querySelector('.card-icon').textContent.trim() === symbol) 
            : null;

          // Determine styling direction for price box (green/red/neutral)
          let styleDirection = null;
          if (isBoardReset) {
            styleDirection = 'neutral';
          } else if (stock.direction) {
            styleDirection = stock.direction;
          } else if (Number(currentVal) === 100) {
            styleDirection = 'down';
          } else if (stock.oldValue !== null && stock.oldValue !== undefined) {
            if (stock.value > stock.oldValue) styleDirection = 'up';
            else if (stock.value < stock.oldValue) styleDirection = 'down';
          } else if (prevVal !== undefined && prevVal !== currentVal) {
            styleDirection = currentVal > prevVal ? 'up' : 'down';
          }

          // Only animate if this specific stock's price actually changed in this update
          const hasPriceChanged = !isFirstLoad && !isBoardReset && prevVal !== undefined && prevVal !== currentVal;
          const animDirection = hasPriceChanged ? (stock.direction || (currentVal > prevVal ? 'up' : 'down')) : null;
          const shouldAnimate = Boolean(hasPriceChanged && animDirection);

          const prevPrice = isBoardReset ? null : (prevVal !== undefined ? prevVal : stock.oldValue);

          if (card) {
            card.setAttribute('data-price', currentVal);
            this.renderer.updateCardValue(card, currentVal, styleDirection, prevPrice, shouldAnimate);
          }

          if (liveCard && liveCard !== card) {
            liveCard.setAttribute('data-price', currentVal);
            this.renderer.updateCardValue(liveCard, currentVal, styleDirection, prevPrice, shouldAnimate);
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
      }

      if (this.state.portfolio) {
        const stats = this.state.getPortfolioStats();
        const uid = user ? user.uid : null;
        this.renderer.updatePortfolioUI(stats, this.state.portfolio, this.state.boardStocks, this.state.pendingOrders, uid);
        const debtData = TradeService.calculateDebtInstrumentsValue(this.state.portfolio?.debt);
        this.renderer.updateDebtInstrumentsUI(
          debtData,
          async (key) => { if (this.tradeController) await this.tradeController.submitDebtOrder('INVEST', key); },
          async (key) => { if (this.tradeController) await this.tradeController.submitDebtOrder('REDEEM', key); }
        );
      }

      if (this.tradeController && this.tradeController.updateTradeFormPrice) {
        this.tradeController.updateTradeFormPrice();
      }
    });
  }

  unsubscribe() {
    if (this.boardListenerUnsubscribe) {
      this.boardListenerUnsubscribe();
      this.boardListenerUnsubscribe = null;
    }
    this.hasReceivedInitialBoard = false;
  }

  reset() {
    this.unsubscribe();
  }
}
