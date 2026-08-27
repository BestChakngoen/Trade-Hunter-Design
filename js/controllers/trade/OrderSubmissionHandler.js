import { TradeService, DEBT_INSTRUMENTS } from '../../services/TradeService.js';

/**
 * OrderSubmissionHandler - Handles validation and submission of Stock and Debt orders.
 */
export class OrderSubmissionHandler {
  constructor(state, renderer, firebaseService) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
  }

  validateOrderSubmission(orderType, symbol) {
    if (orderType === 'SELL') {
      const userPortfolio = this.state.portfolio ? (this.state.portfolio.stocks || {}) : {};
      const ownedCount = Object.keys(userPortfolio).filter(sym => userPortfolio[sym] && userPortfolio[sym].volume > 0).length;
      if (ownedCount === 0 || !symbol) {
        this.renderer.showErrorAlert("No Stocks Owned", "You do not have any stocks in your portfolio to sell.");
        return false;
      }
    }
    if (!symbol) {
      this.renderer.showErrorAlert("Invalid Selection", "Please select a stock before submitting your order.");
      return false;
    }
    return true;
  }

  async handleStockOrderSubmission(orderType, symbol, elements, updateEstimatedCost) {
    const vol = 1;

    if (!this.validateOrderSubmission(orderType, symbol)) return;

    const stock = this.state.boardStocks[symbol];
    const user = this.firebaseService.getCurrentUser();
    if (!stock || !user) return;

    const currentPrice = stock.value;
    const currentCash = this.state.portfolio.cash;
    const currentStocks = { ...this.state.portfolio.stocks };

    const { effectiveAvailableCash } = TradeService.calculateAvailableCash(
      currentCash, 
      this.state.pendingOrders, 
      user.uid
    );

    if (orderType === 'BUY' && effectiveAvailableCash < currentPrice) {
      this.renderer.showErrorAlert(
        "Insufficient Funds", 
        `Your available cash is insufficient for this BUY order.\nAvailable Cash: ${effectiveAvailableCash.toLocaleString()} THB\nRequired: ${currentPrice.toLocaleString()} THB`
      );
      return;
    }

    if (orderType === 'SELL') {
      const holding = currentStocks[symbol];
      if (!holding || holding.volume < vol) {
        const userVol = holding ? holding.volume : 0;
        this.renderer.showErrorAlert(
          "Insufficient Shares", 
          `You do not have enough shares of ${symbol} to sell.\nOwned: ${userVol.toLocaleString()} shares | Required: 1 share`
        );
        return;
      }
    }

    await this.processOrderSubmit(user, orderType, symbol, vol, currentPrice, elements, updateEstimatedCost);
  }

  async processOrderSubmit(user, orderType, symbol, vol, currentPrice, elements, updateEstimatedCost) {
    try {
      const orderId = TradeService.generateOrderId();
      const orderPath = `pendingOrders/${orderId}`;
      const username = this.state.playerName || 'Player_1';

      const newOrder = {
        id: orderId,
        uid: user.uid,
        username,
        type: orderType,
        symbol,
        volume: vol,
        price: currentPrice,
        createdAt: Date.now()
      };

      await this.firebaseService.updateRoom(this.state.roomCode, {
        [orderPath]: newOrder
      });

      if (!this.state.pendingOrders) this.state.pendingOrders = {};
      this.state.pendingOrders[orderId] = newOrder;

      const stats = this.state.getPortfolioStats();
      this.renderer.updatePortfolioUI(stats, this.state.portfolio, this.state.boardStocks, this.state.pendingOrders, user.uid);
      this.renderer.updatePlayerPendingOrdersUI(this.state.pendingOrders, user.uid);

      this.renderer.showTopToast(
        "ORDER SUBMITTED",
        `${orderType} order for ${symbol} (1 share) submitted successfully.`,
        "success"
      );

      if (elements && elements.tradeStockSelect) {
        elements.tradeStockSelect.value = '';
        if (elements.dropdownSelectedContent) {
          elements.dropdownSelectedContent.innerHTML = `<span class="text-gray-500">Select Stock</span>`;
        }
      }
      if (typeof updateEstimatedCost === 'function') {
        updateEstimatedCost();
      }

    } catch (error) {
      console.error("Order processing error:", error);
      this.renderer.showErrorAlert("ข้อผิดพลาด", "ไม่สามารถส่งคำสั่งซื้อขายได้");
    }
  }

  async submitDebtOrder(type, instrumentKey) {
    const config = DEBT_INSTRUMENTS[instrumentKey];
    if (!config) return;

    const user = this.firebaseService.getCurrentUser();
    if (!user) {
      this.renderer.showErrorAlert("Authentication Error", "You must be logged in to submit an order.");
      return;
    }

    const playerName = this.state.playerName || user.displayName || 'Player';
    const currentCash = this.state.portfolio?.cash ?? 20000;
    const currentDebt = this.state.portfolio?.debt ?? {};

    if (type === 'INVEST') {
      const availableCashObj = TradeService.calculateAvailableCash(currentCash, this.state.pendingOrders, user.uid);
      if (availableCashObj.effectiveAvailableCash < config.unitPrice) {
        this.renderer.showErrorAlert("Insufficient Cash", `You do not have enough available cash to invest in ${config.name}. Required: ${config.unitPrice.toLocaleString('en-US')}`);
        return;
      }
    } else if (type === 'REDEEM') {
      const currentVol = Number(currentDebt[instrumentKey] || 0);
      if (currentVol < 1) {
        this.renderer.showErrorAlert("Cannot Redeem", `You do not hold any units of ${config.name} to redeem.`);
        return;
      }
    }

    const orderId = TradeService.generateOrderId();
    const orderData = {
      id: orderId,
      uid: user.uid,
      username: playerName,
      category: 'DEBT',
      type: type,
      instrumentKey: instrumentKey,
      symbol: config.name,
      price: config.unitPrice,
      unitPrice: config.unitPrice,
      volume: 1,
      totalAmount: config.unitPrice,
      status: 'PENDING',
      timestamp: Date.now()
    };

    try {
      await this.firebaseService.updateRoom(this.state.roomCode, {
        [`pendingOrders/${orderId}`]: orderData
      });

      if (!this.state.pendingOrders) this.state.pendingOrders = {};
      this.state.pendingOrders[orderId] = orderData;

      const stats = this.state.getPortfolioStats();
      this.renderer.updatePortfolioUI(stats, this.state.portfolio, this.state.boardStocks, this.state.pendingOrders, user.uid);
      this.renderer.updatePlayerPendingOrdersUI(this.state.pendingOrders, user.uid);

      this.renderer.showTopToast(
        "ORDER SUBMITTED",
        `${type} order for 1 unit of ${config.name} submitted for GM approval.`,
        "info"
      );
    } catch (err) {
      console.error("Failed to submit debt order:", err);
      this.renderer.showErrorAlert("Error", "Failed to submit debt order.");
    }
  }
}
