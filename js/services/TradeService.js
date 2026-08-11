/**
 * TradeService - Handles business logic, financial calculations, portfolio updates, and validation for trading transactions.
 */
export class TradeService {
  /**
   * Calculates effective available cash considering pending BUY orders.
   */
  static calculateAvailableCash(currentCash, pendingOrders = {}, userUid = '') {
    const targetUidStr = String(userUid || '').trim().toLowerCase();
    const userPendingBuyOrders = Object.values(pendingOrders || {}).filter(
      o => o && o.uid && String(o.uid).trim().toLowerCase() === targetUidStr && o.type === 'BUY'
    );
    const pendingBuyTotal = userPendingBuyOrders.reduce(
      (sum, o) => sum + (Number(o.volume || 1) * Number(o.price || 0)), 
      0
    );
    return {
      pendingBuyTotal,
      effectiveAvailableCash: currentCash - pendingBuyTotal
    };
  }

  /**
   * Calculates new portfolio cash and stock holdings after a BUY order approval.
   */
  static calculateBuyPortfolio(currentCash, currentStocks = {}, symbol, volume, tradePrice) {
    const totalCost = volume * tradePrice;
    const newCash = currentCash - totalCost;
    const stocks = { ...currentStocks };

    if (stocks[symbol]) {
      const oldCost = stocks[symbol].volume * stocks[symbol].avgPrice;
      const newVolume = stocks[symbol].volume + volume;
      const newAvgPrice = (oldCost + totalCost) / newVolume;
      stocks[symbol] = {
        volume: newVolume,
        avgPrice: Math.round(newAvgPrice)
      };
    } else {
      stocks[symbol] = {
        volume: volume,
        avgPrice: tradePrice
      };
    }

    return { cash: newCash, stocks };
  }

  /**
   * Calculates new portfolio cash and stock holdings after a SELL order approval.
   */
  static calculateSellPortfolio(currentCash, currentStocks = {}, symbol, volume, tradePrice) {
    const totalCost = volume * tradePrice;
    const newCash = currentCash + totalCost;
    const stocks = { ...currentStocks };
    const holding = stocks[symbol];

    const newVolume = holding.volume - volume;
    if (newVolume <= 0) {
      delete stocks[symbol];
    } else {
      stocks[symbol] = {
        volume: newVolume,
        avgPrice: holding.avgPrice
      };
    }

    return { cash: newCash, stocks };
  }

  /**
   * Generates a unique pending order ID.
   */
  static generateOrderId() {
    return 'order_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}
