export const DEBT_INSTRUMENTS = {
  fixAccount: { key: 'fixAccount', name: 'Fix Account', unitPrice: 10000, interestRate: 100 },
  bond10Y: { key: 'bond10Y', name: '10 Years Bond', unitPrice: 20000, interestRate: 500 },
  bond20Y: { key: 'bond20Y', name: '20 Years Bond', unitPrice: 20000, interestRate: 700 }
};

/**
 * TradeService - Handles business logic, financial calculations, portfolio updates, and validation for trading transactions.
 */
export class TradeService {
  /**
   * Calculates effective available cash considering pending BUY orders and Debt INVEST orders.
   */
  static calculateAvailableCash(currentCash, pendingOrders = {}, userUid = '') {
    const targetUidStr = String(userUid || '').trim().toLowerCase();
    const userPendingBuyOrders = Object.values(pendingOrders || {}).filter(
      o => o && o.uid && String(o.uid).trim().toLowerCase() === targetUidStr && 
      (o.type === 'BUY' || (o.category === 'DEBT' && o.type === 'INVEST'))
    );
    const pendingBuyTotal = userPendingBuyOrders.reduce((sum, o) => {
      if (o.category === 'DEBT') {
        return sum + (Number(o.totalAmount || (Number(o.volume || 1) * Number(o.unitPrice || 0))));
      }
      return sum + (Number(o.volume || 1) * Number(o.price || 0));
    }, 0);
    return {
      pendingBuyTotal,
      effectiveAvailableCash: Math.max(0, currentCash - pendingBuyTotal)
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

  /**
   * Returns interest rate amount per share based on stock size (S: 1000, M: 2000, L: 3000).
   */
  static getInterestRateBySize(size) {
    const s = String(size || 'M').toUpperCase().trim();
    if (s === 'S') return 1000;
    if (s === 'L') return 3000;
    return 2000; // Default for 'M'
  }

  /**
   * Resolves stock size from boardStocks, masterStocks, or card DOM dataset.
   */
  static getStockSize(symbol, boardStocks = {}, masterStocks = {}, originalCards = []) {
    if (boardStocks[symbol] && boardStocks[symbol].size) {
      return boardStocks[symbol].size;
    }
    if (masterStocks && masterStocks[symbol] && masterStocks[symbol].size) {
      return masterStocks[symbol].size;
    }
    if (Array.isArray(originalCards) && originalCards.length > 0) {
      const card = originalCards.find(c => {
        const titleEl = c.querySelector('.card-title');
        const iconEl = c.querySelector('.card-icon');
        const name = (titleEl ? titleEl.textContent : (iconEl ? iconEl.textContent : '')).trim();
        return name === symbol;
      });
      if (card && card.getAttribute('data-size')) {
        return card.getAttribute('data-size');
      }
    }
    return 'M';
  }

  /**
   * Calculates player dividend details and total dividend based on stock holdings (S: 1000, M: 2000, L: 3000).
   */
  static calculatePlayerDividend(stocks = {}, boardStocks = {}, masterStocks = {}, originalCards = []) {
    let totalDividend = 0;
    const breakdown = [];

    Object.entries(stocks || {}).forEach(([symbol, holding]) => {
      const volume = Number(holding?.volume || 0);
      if (volume > 0) {
        const size = this.getStockSize(symbol, boardStocks, masterStocks, originalCards);
        const ratePerShare = this.getInterestRateBySize(size);
        const stockDividend = volume * ratePerShare;
        totalDividend += stockDividend;
        breakdown.push({
          symbol,
          volume,
          size,
          ratePerShare,
          stockDividend
        });
      }
    });

    return {
      totalDividend,
      totalInterest: totalDividend,
      breakdown
    };
  }

  static calculatePlayerInterest(stocks = {}, boardStocks = {}, masterStocks = {}, originalCards = []) {
    return this.calculatePlayerDividend(stocks, boardStocks, masterStocks, originalCards);
  }

  /**
   * Calculates total value and item breakdown for player debt instruments.
   */
  static calculateDebtInstrumentsValue(debt = {}) {
    let totalValue = 0;
    const items = [];
    Object.entries(DEBT_INSTRUMENTS).forEach(([key, config]) => {
      const volume = Number(debt[key] || 0);
      const value = volume * config.unitPrice;
      totalValue += value;
      items.push({
        key,
        name: config.name,
        unitPrice: config.unitPrice,
        interestRate: config.interestRate,
        volume,
        value
      });
    });
    return { totalValue, items };
  }

  /**
   * Calculates player debt interest breakdown and total.
   */
  static calculatePlayerDebtInterest(debt = {}) {
    let totalInterest = 0;
    const breakdown = [];
    Object.entries(DEBT_INSTRUMENTS).forEach(([key, config]) => {
      const volume = Number(debt[key] || 0);
      if (volume > 0) {
        const itemInterest = volume * config.interestRate;
        totalInterest += itemInterest;
        breakdown.push({
          key,
          name: config.name,
          volume,
          interestRate: config.interestRate,
          itemInterest
        });
      }
    });
    return { totalInterest, breakdown };
  }
}
