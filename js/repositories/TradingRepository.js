import { ref, set, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

/**
 * TradingRepository - Manages Realtime Database operations for trading orders,
 * atomic order approval, and order rejection transactions.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class TradingRepository {
  constructor(firebaseService) {
    this.firebaseService = firebaseService;
  }

  get realtimeDb() {
    return this.firebaseService.realtimeDb;
  }

  getRoomRef(roomCode) {
    return ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}`);
  }

  // Realtime Database: Overwrite room pending orders state for Undo/Redo
  async setPendingOrders(roomCode, pendingOrders) {
    const ordersRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/pendingOrders`);
    await set(ordersRef, pendingOrders || {});
  }

  // Realtime Database: Add a new pending order directly to pendingOrders node without modifying parent room
  async addPendingOrder(roomCode, orderId, orderData) {
    if (!roomCode || !orderId || !orderData) return;
    const orderRef = ref(this.realtimeDb, `traderHunter/gameRooms/${roomCode}/pendingOrders/${orderId}`);
    await set(orderRef, orderData);
  }

  // Realtime Database: Approve pending order atomically with transaction to eliminate race conditions
  async approveOrderWithTransaction(roomCode, orderId, debtInstrumentsConfig = {}) {
    if (!roomCode || !orderId) return { success: false, reason: 'Invalid parameters' };

    const roomRef = this.getRoomRef(roomCode);
    let approveSuccess = false;
    let failureReason = null;
    let approvedOrder = null;
    let newPortfolio = null;

    const result = await runTransaction(roomRef, (currentData) => {
      if (currentData === null) return currentData;

      const pendingOrders = currentData.pendingOrders || {};
      const order = pendingOrders[orderId];
      if (!order) {
        failureReason = "ORDER_NOT_FOUND";
        return;
      }

      const members = currentData.members || {};
      const member = members[order.uid];
      if (!member) {
        failureReason = "MEMBER_NOT_FOUND";
        return;
      }

      const portfolio = member.portfolio || { cash: 20000, stocks: {}, debt: { fixAccount: 0, bond10Y: 0, bond20Y: 0 } };
      let cash = portfolio.cash ?? 20000;
      let currentStocks = { ...(portfolio.stocks || {}) };
      let currentDebt = { ...(portfolio.debt || { fixAccount: 0, bond10Y: 0, bond20Y: 0 }) };

      const tradePrice = order.price || order.unitPrice || 0;
      const totalCost = (order.volume || 1) * tradePrice;
      let calculatedPortfolio;

      if (order.category === 'DEBT') {
        const key = order.instrumentKey;
        const configPrice = debtInstrumentsConfig[key]?.unitPrice || tradePrice;
        if (order.type === 'INVEST') {
          if (cash < configPrice) {
            failureReason = `INSUFFICIENT_FUNDS:${order.username || 'ผู้เล่น'}`;
            return;
          }
          calculatedPortfolio = {
            cash: cash - configPrice,
            stocks: currentStocks,
            debt: {
              ...currentDebt,
              [key]: (currentDebt[key] || 0) + 1
            }
          };
        } else { // REDEEM
          const currentVol = currentDebt[key] || 0;
          if (currentVol < 1) {
            failureReason = `INSUFFICIENT_DEBT:${order.username || 'ผู้เล่น'}`;
            return;
          }
          calculatedPortfolio = {
            cash: cash + configPrice,
            stocks: currentStocks,
            debt: {
              ...currentDebt,
              [key]: Math.max(0, currentVol - 1)
            }
          };
        }
      } else if (order.type === 'BUY') {
        if (cash < totalCost) {
          failureReason = `INSUFFICIENT_CASH:${totalCost}:${cash}`;
          return;
        }
        const newCash = cash - totalCost;
        const stocks = { ...currentStocks };
        const vol = order.volume || 1;
        if (stocks[order.symbol]) {
          const oldCost = stocks[order.symbol].volume * stocks[order.symbol].avgPrice;
          const newVolume = stocks[order.symbol].volume + vol;
          const newAvgPrice = (oldCost + totalCost) / newVolume;
          stocks[order.symbol] = {
            volume: newVolume,
            avgPrice: Math.round(newAvgPrice)
          };
        } else {
          stocks[order.symbol] = {
            volume: vol,
            avgPrice: tradePrice
          };
        }
        calculatedPortfolio = {
          cash: newCash,
          stocks,
          debt: currentDebt
        };
      } else { // SELL
        const holding = currentStocks[order.symbol];
        const vol = order.volume || 1;
        if (!holding || holding.volume < vol) {
          failureReason = `INSUFFICIENT_SHARES:${order.symbol}`;
          return;
        }
        const newCash = cash + totalCost;
        const stocks = { ...currentStocks };
        const newVolume = holding.volume - vol;
        if (newVolume <= 0) {
          delete stocks[order.symbol];
        } else {
          stocks[order.symbol] = {
            volume: newVolume,
            avgPrice: holding.avgPrice
          };
        }
        calculatedPortfolio = {
          cash: newCash,
          stocks,
          debt: currentDebt
        };
      }

      member.portfolio = calculatedPortfolio;
      newPortfolio = calculatedPortfolio;

      if (currentData.savedMembers && member.sessionToken) {
        if (currentData.savedMembers[member.sessionToken]) {
          currentData.savedMembers[member.sessionToken].portfolio = calculatedPortfolio;
        }
      }

      delete currentData.pendingOrders[orderId];

      if (!currentData.lastProcessedOrder) {
        currentData.lastProcessedOrder = {};
      }
      currentData.lastProcessedOrder[order.uid] = {
        id: orderId,
        type: order.type,
        symbol: order.symbol,
        volume: order.volume || 1,
        status: 'APPROVED',
        timestamp: Date.now()
      };

      approvedOrder = JSON.parse(JSON.stringify(order));
      approveSuccess = true;
      return currentData;
    });

    return {
      success: approveSuccess && result.committed,
      failureReason,
      approvedOrder,
      newPortfolio
    };
  }

  // Realtime Database: Reject pending order atomically with transaction
  async rejectOrderWithTransaction(roomCode, orderId) {
    if (!roomCode || !orderId) return { success: false, reason: 'Invalid parameters' };

    const roomRef = this.getRoomRef(roomCode);
    let rejectSuccess = false;
    let rejectedOrder = null;

    const result = await runTransaction(roomRef, (currentData) => {
      if (currentData === null) return currentData;

      const pendingOrders = currentData.pendingOrders || {};
      const order = pendingOrders[orderId];
      if (!order) return;

      rejectedOrder = JSON.parse(JSON.stringify(order));
      delete currentData.pendingOrders[orderId];

      if (!currentData.lastProcessedOrder) {
        currentData.lastProcessedOrder = {};
      }
      currentData.lastProcessedOrder[order.uid] = {
        id: orderId,
        type: order.type,
        symbol: order.symbol,
        volume: order.volume || 1,
        status: 'REJECTED',
        timestamp: Date.now()
      };

      rejectSuccess = true;
      return currentData;
    });

    return {
      success: rejectSuccess && result.committed,
      rejectedOrder
    };
  }
}
