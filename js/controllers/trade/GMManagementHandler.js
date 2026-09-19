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
      await this.captureUndoSnapshot();

      const result = await this.firebaseService.approveOrderWithTransaction(
        this.state.roomCode,
        orderId,
        DEBT_INSTRUMENTS
      );

      if (!result.success) {
        if (result.failureReason) {
          if (result.failureReason.startsWith('INSUFFICIENT_FUNDS:')) {
            const name = result.failureReason.split(':')[1];
            this.renderer.showErrorAlert("Approval Failed", `ผู้เล่น ${name} มีเงินสดไม่เพียงพอสำหรับ ${order.symbol}`);
          } else if (result.failureReason.startsWith('INSUFFICIENT_DEBT:')) {
            const name = result.failureReason.split(':')[1];
            this.renderer.showErrorAlert("Approval Failed", `ผู้เล่น ${name} ไม่มีหน่วยลงทุนของ ${order.symbol} สำหรับขายคืน`);
          } else if (result.failureReason.startsWith('INSUFFICIENT_CASH:')) {
            const [, cost, cash] = result.failureReason.split(':');
            this.renderer.showErrorAlert("Approval Failed", `ผู้เล่น ${order.username || 'ผู้เล่น'} มีเงินสดไม่เพียงพอสำหรับคำสั่ง BUY (ต้องการ: ${Number(cost).toLocaleString()} บาท, มีอยู่: ${Number(cash).toLocaleString()} บาท)`);
          } else if (result.failureReason.startsWith('INSUFFICIENT_SHARES:')) {
            this.renderer.showErrorAlert("Approval Failed", `ผู้เล่น ${order.username || 'ผู้เล่น'} มีหุ้น ${order.symbol} ไม่เพียงพอสำหรับคำสั่ง SELL`);
          } else if (result.failureReason === 'ORDER_NOT_FOUND') {
            this.renderer.showErrorAlert("Notice", "คำสั่งนี้ได้รับการประมวลผลหรือถูกยกเลิกไปแล้ว");
          } else if (result.failureReason === 'MEMBER_NOT_FOUND') {
            this.renderer.showErrorAlert("Approval Failed", "ไม่พบข้อมูลผู้เล่นของผู้ส่งคำสั่งนี้ในห้องเกมบนเซิร์ฟเวอร์");
          } else {
            this.renderer.showErrorAlert("Approval Failed", "ไม่สามารถอนุมัติคำสั่งซื้อขายได้");
          }
        } else {
          this.renderer.showErrorAlert("Notice", "คำสั่งนี้ได้รับการประมวลผลหรือถูกยกเลิกไปแล้ว");
        }
        return;
      }

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

      const result = await this.firebaseService.rejectOrderWithTransaction(
        this.state.roomCode,
        orderId
      );

      if (!result.success) {
        console.warn("Reject order transaction did not commit or order was already handled");
      }

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

      // Fetch fresh snapshot to avoid race condition with live player trading
      const freshSnap = await this.firebaseService.getRoomStateSnapshot(this.state.roomCode);
      const freshData = freshSnap ? freshSnap.val() : null;
      const freshPlayer = freshData?.members?.[playerUid];
      if (!freshPlayer) {
        this.renderer.showErrorAlert("Error", "ไม่พบข้อมูลผู้เล่นในห้องเกม");
        return;
      }

      const currentCash = freshPlayer.portfolio?.cash ?? 20000;
      const newCash = currentCash + 10000;
      const sessionToken = freshPlayer.sessionToken || null;

      const updates = {
        [`members/${playerUid}/portfolio/cash`]: newCash,
        [`lastSalaryReceived/${playerUid}`]: {
          amount: 10000,
          timestamp: Date.now()
        }
      };

      // Also update persistent snapshot in savedMembers so cash is NOT lost on page reload!
      if (sessionToken && freshData.savedMembers && freshData.savedMembers[sessionToken]) {
        updates[`savedMembers/${sessionToken}/portfolio/cash`] = newCash;
      }

      await this.firebaseService.updateRoom(this.state.roomCode, updates);

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

      // Fetch fresh snapshot to avoid race condition with live player trading
      const freshSnap = await this.firebaseService.getRoomStateSnapshot(this.state.roomCode);
      const freshData = freshSnap ? freshSnap.val() : null;
      const freshPlayer = freshData?.members?.[playerUid];
      if (!freshPlayer) {
        this.renderer.showErrorAlert("Error", "ไม่พบข้อมูลผู้เล่นในห้องเกม");
        return;
      }

      const currentCash = freshPlayer.portfolio?.cash ?? 20000;
      const newCash = currentCash + dividendData.totalDividend;
      const sessionToken = freshPlayer.sessionToken || null;

      const updates = {
        [`members/${playerUid}/portfolio/cash`]: newCash,
        [`lastDividendReceived/${playerUid}`]: {
          amount: dividendData.totalDividend,
          timestamp: Date.now()
        }
      };

      // Also update persistent snapshot in savedMembers so dividend is NOT lost on page reload!
      if (sessionToken && freshData.savedMembers && freshData.savedMembers[sessionToken]) {
        updates[`savedMembers/${sessionToken}/portfolio/cash`] = newCash;
      }

      await this.firebaseService.updateRoom(this.state.roomCode, updates);

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
        if (member.online === false) return;

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
          // Also update savedMembers persistent snapshot
          if (member.sessionToken && roomData.savedMembers && roomData.savedMembers[member.sessionToken]) {
            updates[`savedMembers/${member.sessionToken}/portfolio/cash`] = newCash;
          }
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

      // Fetch fresh snapshot to avoid race condition with live player trading
      const freshSnap = await this.firebaseService.getRoomStateSnapshot(this.state.roomCode);
      const freshData = freshSnap ? freshSnap.val() : null;
      const freshPlayer = freshData?.members?.[playerUid];
      if (!freshPlayer) {
        this.renderer.showErrorAlert("Error", "ไม่พบข้อมูลผู้เล่นในห้องเกม");
        return;
      }

      const currentCash = freshPlayer.portfolio?.cash ?? 20000;
      const newCash = currentCash + debtInterestData.totalInterest;
      const sessionToken = freshPlayer.sessionToken || null;

      const updates = {
        [`members/${playerUid}/portfolio/cash`]: newCash,
        [`lastDebtInterestReceived/${playerUid}`]: {
          amount: debtInterestData.totalInterest,
          timestamp: Date.now()
        }
      };

      // Also update persistent snapshot in savedMembers so debt interest is NOT lost on page reload!
      if (sessionToken && freshData.savedMembers && freshData.savedMembers[sessionToken]) {
        updates[`savedMembers/${sessionToken}/portfolio/cash`] = newCash;
      }

      await this.firebaseService.updateRoom(this.state.roomCode, updates);

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
