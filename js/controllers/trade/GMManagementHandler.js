import { TradeService, DEBT_INSTRUMENTS } from '../../services/TradeService.js';

/**
 * GMManagementHandler - Handles GM actions: Order Approval/Rejection, Salary, Dividend, & Debt Interest.
 */
export class GMManagementHandler {
  constructor(state, renderer, firebaseService) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
  }

  async captureUndoSnapshot() {
    const [boardSnap, roomSnap] = await Promise.all([
      this.firebaseService.getBoardSnapshot(this.state.roomCode),
      this.firebaseService.getRoomStateSnapshot(this.state.roomCode)
    ]);
    const boardData = boardSnap ? boardSnap.val() : null;
    const roomData = roomSnap ? roomSnap.val() : null;

    if (boardData || roomData) {
      this.state.pushUndoSnapshot({
        stocks: boardData ? boardData.stocks : this.state.boardStocks,
        members: roomData ? roomData.members : {},
        pendingOrders: roomData ? roomData.pendingOrders : {}
      });
      this.renderer.updateHistoryControlsUI(true, this.state.canUndo(), this.state.canRedo());
    }
  }

  async approvePlayerOrder(orderId) {
    const order = this.state.pendingOrders ? this.state.pendingOrders[orderId] : null;
    if (!order) return;

    try {
      const roomSnapshot = await this.firebaseService.getRoomStateSnapshot(this.state.roomCode);
      if (!roomSnapshot || !roomSnapshot.exists()) return;

      const roomData = roomSnapshot.val();
      const memberData = roomData.members ? roomData.members[order.uid] : null;
      if (!memberData) {
        this.renderer.showErrorAlert("Error", "ไม่พบข้อมูลผู้เล่นในห้องนี้");
        return;
      }

      let cash = memberData.portfolio?.cash ?? 20000;
      let currentStocks = memberData.portfolio?.stocks ?? {};
      let currentDebt = memberData.portfolio?.debt ?? { fixAccount: 0, bond10Y: 0, bond20Y: 0 };
      const tradePrice = order.price || order.unitPrice || 0;
      const totalCost = (order.volume || 1) * tradePrice;
      let newPortfolio;

      if (order.category === 'DEBT') {
        const key = order.instrumentKey;
        const configPrice = DEBT_INSTRUMENTS[key]?.unitPrice || tradePrice;
        if (order.type === 'INVEST') {
          if (cash < configPrice) {
            this.renderer.showErrorAlert("Approval Failed", `ผู้เล่น ${order.username} มีเงินสดไม่เพียงพอสำหรับ ${order.symbol}`);
            return;
          }
          newPortfolio = {
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
            this.renderer.showErrorAlert("Approval Failed", `ผู้เล่น ${order.username} ไม่มีหน่วยลงทุนของ ${order.symbol} สำหรับขายคืน`);
            return;
          }
          newPortfolio = {
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
          this.renderer.showErrorAlert("Approval Failed", `ผู้เล่น ${order.username} มีเงินสดไม่เพียงพอสำหรับคำสั่ง BUY (ต้องการ: ${totalCost.toLocaleString()} บาท, มีอยู่: ${cash.toLocaleString()} บาท)`);
          return;
        }
        const calcPort = TradeService.calculateBuyPortfolio(cash, currentStocks, order.symbol, order.volume, tradePrice);
        newPortfolio = {
          ...calcPort,
          debt: currentDebt
        };
      } else {
        const holding = currentStocks[order.symbol];
        if (!holding || holding.volume < order.volume) {
          const userVol = holding ? holding.volume : 0;
          this.renderer.showErrorAlert("Approval Failed", `ผู้เล่น ${order.username} มีหุ้น ${order.symbol} ไม่เพียงพอสำหรับคำสั่ง SELL (ต้องการ: ${order.volume.toLocaleString()} หุ้น, มีอยู่: ${userVol.toLocaleString()} หุ้น)`);
          return;
        }
        const calcPort = TradeService.calculateSellPortfolio(cash, currentStocks, order.symbol, order.volume, tradePrice);
        newPortfolio = {
          ...calcPort,
          debt: currentDebt
        };
      }

      await this.captureUndoSnapshot();

      await this.firebaseService.updateRoom(this.state.roomCode, {
        [`members/${order.uid}/portfolio`]: newPortfolio,
        [`pendingOrders/${orderId}`]: null,
        [`lastProcessedOrder/${order.uid}`]: {
          id: orderId,
          type: order.type,
          symbol: order.symbol,
          volume: order.volume,
          status: 'APPROVED',
          timestamp: Date.now()
        }
      });

      const updatedStocks = order.type === 'BUY'
        ? this.state.getUpdatedStocksForUp(order.symbol)
        : this.state.getUpdatedStocksForDown(order.symbol);

      if (updatedStocks) {
        try {
          await this.firebaseService.updateStocksBoard(this.state.roomCode, updatedStocks);
        } catch (boardError) {
          console.error("Failed to automatically update stock step on board:", boardError);
        }
      }

      this.renderer.showTopToast(
        "ORDER APPROVED",
        `อนุมัติคำสั่ง ${order.type} หุ้น ${order.symbol} ของ ${order.displayName || order.username || 'ผู้เล่น'} เรียบร้อยแล้ว`,
        "success"
      );

    } catch (error) {
      console.error("Failed to approve order:", error);
      this.renderer.showErrorAlert("Error", "ไม่สามารถอนุมัติคำสั่งซื้อขายได้");
    }
  }

  async rejectPlayerOrder(orderId) {
    const order = this.state.pendingOrders ? this.state.pendingOrders[orderId] : null;
    try {
      await this.captureUndoSnapshot();
      
      const updateData = {
        [`pendingOrders/${orderId}`]: null
      };

      if (order && order.uid) {
        updateData[`lastProcessedOrder/${order.uid}`] = {
          id: orderId,
          type: order.type,
          symbol: order.symbol,
          volume: order.volume,
          status: 'REJECTED',
          timestamp: Date.now()
        };
      }

      await this.firebaseService.updateRoom(this.state.roomCode, updateData);

      this.renderer.showTopToast(
        "ORDER REJECTED",
        `ปฏิเสธคำสั่ง ${order ? order.type : ''} หุ้น ${order ? order.symbol : ''} ของ ${order ? (order.displayName || order.username || 'ผู้เล่น') : 'ผู้เล่น'} เรียบร้อยแล้ว`,
        "rejected"
      );
    } catch (error) {
      console.error("Failed to reject order:", error);
      this.renderer.showErrorAlert("Error", "ไม่สามารถปฏิเสธคำสั่งซื้อขายได้");
    }
  }

  async payPlayerSalary(playerUid) {
    try {
      const roomSnapshot = await this.firebaseService.getRoomStateSnapshot(this.state.roomCode);
      const roomData = roomSnapshot ? roomSnapshot.val() : null;

      if (!roomData || !roomData.members || !roomData.members[playerUid]) {
        this.renderer.showErrorAlert("Error", "ไม่พบข้อมูลผู้เล่นในห้องเกม");
        return;
      }

      const player = roomData.members[playerUid];
      const playerName = player.displayName || 'Player';

      const confirmResult = await this.renderer.showConfirmAlert(
        "Confirm Salary Payment",
        `คุณต้องการจ่ายเงินเดือน 10,000 บาท ให้กับผู้เล่น "${playerName}" หรือไม่?`,
        "YES",
        "NO"
      );

      if (!confirmResult || !confirmResult.isConfirmed) return;

      await this.captureUndoSnapshot();

      const currentCash = player.portfolio?.cash ?? 20000;
      const newCash = currentCash + 10000;

      await this.firebaseService.updateRoom(this.state.roomCode, {
        [`members/${playerUid}/portfolio/cash`]: newCash,
        [`lastSalaryReceived/${playerUid}`]: {
          amount: 10000,
          timestamp: Date.now()
        }
      });

      this.renderer.showTopToast(
        "SALARY PAID", 
        `โอนเงินเดือน 10,000 บาท ให้กับ "${playerName}" เรียบร้อยแล้ว`,
        "success"
      );
    } catch (error) {
      console.error("Failed to pay salary to player:", error);
      this.renderer.showErrorAlert("Error", "ไม่สามารถจ่ายเงินเดือนให้ผู้เล่นได้");
    }
  }

  async payPlayerDividend(playerUid) {
    try {
      const roomSnapshot = await this.firebaseService.getRoomStateSnapshot(this.state.roomCode);
      const roomData = roomSnapshot ? roomSnapshot.val() : null;

      if (!roomData || !roomData.members || !roomData.members[playerUid]) {
        this.renderer.showErrorAlert("Error", "ไม่พบข้อมูลผู้เล่นในห้องเกม");
        return;
      }

      const player = roomData.members[playerUid];
      const playerName = player.displayName || 'Player';
      const playerStocks = player.portfolio?.stocks || {};

      const dividendData = TradeService.calculatePlayerDividend(
        playerStocks, 
        this.state.boardStocks, 
        this.state.masterStocks, 
        this.state.originalCards
      );

      if (dividendData.totalDividend <= 0) {
        this.renderer.showErrorAlert(
          "No Dividend Payable", 
          `ผู้เล่น "${playerName}" ไม่มีหุ้นสำหรับรับเงินปันผล`
        );
        return;
      }

      const formattedDividend = dividendData.totalDividend.toLocaleString('en-US');
      const confirmResult = await this.renderer.showConfirmAlert(
        "Confirm Dividend Payment",
        `คุณต้องการจ่ายเงินปันผลหุ้นจำนวน ${formattedDividend} บาท ให้กับผู้เล่น "${playerName}" หรือไม่?`,
        "YES",
        "NO"
      );

      if (!confirmResult || !confirmResult.isConfirmed) return;

      await this.captureUndoSnapshot();

      const currentCash = player.portfolio?.cash ?? 20000;
      const newCash = currentCash + dividendData.totalDividend;

      await this.firebaseService.updateRoom(this.state.roomCode, {
        [`members/${playerUid}/portfolio/cash`]: newCash,
        [`lastDividendReceived/${playerUid}`]: {
          amount: dividendData.totalDividend,
          timestamp: Date.now()
        }
      });

      this.renderer.showTopToast(
        "DIVIDEND PAID", 
        `โอนเงินปันผลหุ้นจำนวน ${formattedDividend} บาท ให้กับ "${playerName}" เรียบร้อยแล้ว`,
        "success"
      );
    } catch (error) {
      console.error("Failed to pay dividend to player:", error);
      this.renderer.showErrorAlert("Error", "ไม่สามารถจ่ายเงินปันผลให้ผู้เล่นได้");
    }
  }

  async payAllPlayersDividend() {
    try {
      const roomSnapshot = await this.firebaseService.getRoomStateSnapshot(this.state.roomCode);
      const roomData = roomSnapshot ? roomSnapshot.val() : null;

      if (!roomData || !roomData.members) {
        this.renderer.showErrorAlert("Error", "ไม่พบข้อมูลห้องเกม");
        return;
      }

      const updates = {};
      const now = Date.now();
      let totalTransferredCount = 0;
      let totalAmountPaid = 0;

      Object.entries(roomData.members).forEach(([uid, member]) => {
        const role = (member.role || '').toLowerCase();
        const name = (member.displayName || '').toUpperCase();
        if (role === 'game_master' || name === 'GM') return;

        const playerStocks = member.portfolio?.stocks || {};
        const dividendData = TradeService.calculatePlayerDividend(
          playerStocks, 
          this.state.boardStocks, 
          this.state.masterStocks, 
          this.state.originalCards
        );

        if (dividendData.totalDividend > 0) {
          const currentCash = member.portfolio?.cash ?? 20000;
          const newCash = currentCash + dividendData.totalDividend;
          updates[`members/${uid}/portfolio/cash`] = newCash;
          updates[`lastDividendReceived/${uid}`] = {
            amount: dividendData.totalDividend,
            timestamp: now
          };
          totalTransferredCount++;
          totalAmountPaid += dividendData.totalDividend;
        }
      });

      if (totalTransferredCount === 0) {
        this.renderer.showErrorAlert(
          "No Dividend Payable", 
          "ยังไม่มีผู้เล่นคนใดถือครองหุ้นสำหรับรับเงินปันผล"
        );
        return;
      }

      const confirmResult = await this.renderer.showConfirmAlert(
        "Confirm Bulk Dividend Payment",
        `คุณต้องการจ่ายเงินปันผลหุ้นให้กับผู้เล่นทั้งหมด ${totalTransferredCount} คน รวมเป็นเงินทั้งสิ้น ${totalAmountPaid.toLocaleString('en-US')} บาท หรือไม่?`,
        "YES",
        "NO"
      );

      if (!confirmResult || !confirmResult.isConfirmed) return;

      await this.captureUndoSnapshot();
      await this.firebaseService.updateRoom(this.state.roomCode, updates);

      this.renderer.showTopToast(
        "BULK DIVIDEND PAID", 
        `จ่ายเงินปันผลหุ้นรวมเป็นเงิน ${totalAmountPaid.toLocaleString('en-US')} บาท ให้กับผู้เล่น ${totalTransferredCount} คน เรียบร้อยแล้ว`,
        "success"
      );
    } catch (error) {
      console.error("Failed to pay bulk dividend to players:", error);
      this.renderer.showErrorAlert("Error", "ไม่สามารถจ่ายเงินปันผลกลุ่มได้");
    }
  }

  async payPlayerDebtInterest(playerUid) {
    try {
      const roomSnapshot = await this.firebaseService.getRoomStateSnapshot(this.state.roomCode);
      const roomData = roomSnapshot ? roomSnapshot.val() : null;

      if (!roomData || !roomData.members || !roomData.members[playerUid]) {
        this.renderer.showErrorAlert("Error", "ไม่พบข้อมูลผู้เล่นในห้องเกม");
        return;
      }

      const player = roomData.members[playerUid];
      const playerName = player.displayName || 'Player';
      const playerDebt = player.portfolio?.debt || {};

      const debtInterestData = TradeService.calculatePlayerDebtInterest(playerDebt);

      if (debtInterestData.totalInterest <= 0) {
        this.renderer.showErrorAlert(
          "Cannot Pay Debt Interest", 
          `ผู้เล่น "${playerName}" ไม่มีหน่วยลงทุนตราสารหนี้สำหรับรับดอกเบี้ย`
        );
        return;
      }

      const formattedInterest = debtInterestData.totalInterest.toLocaleString('en-US');
      const confirmResult = await this.renderer.showConfirmAlert(
        "Confirm Debt Interest Payment",
        `คุณต้องการจ่ายดอกเบี้ยเงินกู้จำนวน ${formattedInterest} บาท ให้กับผู้เล่น "${playerName}" หรือไม่?`,
        "YES",
        "NO"
      );

      if (!confirmResult || !confirmResult.isConfirmed) return;

      await this.captureUndoSnapshot();

      const currentCash = player.portfolio?.cash ?? 20000;
      const newCash = currentCash + debtInterestData.totalInterest;

      await this.firebaseService.updateRoom(this.state.roomCode, {
        [`members/${playerUid}/portfolio/cash`]: newCash,
        [`lastDebtInterestReceived/${playerUid}`]: {
          amount: debtInterestData.totalInterest,
          timestamp: Date.now()
        }
      });

      this.renderer.showTopToast(
        "DEBT INTEREST PAID", 
        `โอนดอกเบี้ยเงินกู้จำนวน ${formattedInterest} บาท ให้กับ "${playerName}" เรียบร้อยแล้ว`,
        "success"
      );
    } catch (error) {
      console.error("Failed to pay debt interest to player:", error);
      this.renderer.showErrorAlert("Error", "ไม่สามารถจ่ายดอกเบี้ยเงินกู้ให้ผู้เล่นได้");
    }
  }
}
