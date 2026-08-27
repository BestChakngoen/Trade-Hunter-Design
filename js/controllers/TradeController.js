import { TradeFormController } from './trade/TradeFormController.js';
import { OrderSubmissionHandler } from './trade/OrderSubmissionHandler.js';
import { GMManagementHandler } from './trade/GMManagementHandler.js';

/**
 * TradeController - Facade Controller managing Trade Form Events, Order Submissions, and GM Operations.
 */
export class TradeController {
  constructor(state, renderer, firebaseService) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;

    this.formController = new TradeFormController(state, renderer);
    this.orderHandler = new OrderSubmissionHandler(state, renderer, firebaseService);
    this.gmHandler = new GMManagementHandler(state, renderer, firebaseService);
  }

  get updateTradeFormPrice() {
    return this.formController.updateTradeFormPrice;
  }

  get refreshDropdownOptions() {
    return this.formController.refreshDropdownOptions;
  }

  /**
   * Binds all trade form events, tab switches, custom dropdowns, and form submission.
   */
  bindTradeFormEvents() {
    this.formController.bindTradeFormEvents(
      (newType) => {
        // Tab switch callback
      },
      async (orderType, symbol, elements, updateEstimatedCost) => {
        await this.orderHandler.handleStockOrderSubmission(orderType, symbol, elements, updateEstimatedCost);
      }
    );
  }

  /**
   * Helper to capture full room and board snapshot before GM actions.
   */
  async captureUndoSnapshot() {
    return this.gmHandler.captureUndoSnapshot();
  }

  /**
   * GM Order Approval handler.
   */
  async approvePlayerOrder(orderId) {
    return this.gmHandler.approvePlayerOrder(orderId);
  }

  /**
   * GM Order Rejection handler.
   */
  async rejectPlayerOrder(orderId) {
    return this.gmHandler.rejectPlayerOrder(orderId);
  }

  /**
   * GM Salary Payment handler.
   */
  async payPlayerSalary(playerUid) {
    return this.gmHandler.payPlayerSalary(playerUid);
  }

  /**
   * GM Dividend Payment handler for a single player.
   */
  async payPlayerDividend(playerUid) {
    return this.gmHandler.payPlayerDividend(playerUid);
  }

  /**
   * GM Dividend Payment handler for ALL players in the room.
   */
  async payAllPlayersDividend() {
    return this.gmHandler.payAllPlayersDividend();
  }

  payPlayerInterest(playerUid) {
    return this.payPlayerDividend(playerUid);
  }

  payAllPlayersInterest() {
    return this.payAllPlayersDividend();
  }

  /**
   * Submit Debt Order (Invest or Redeem 1 unit).
   */
  async submitDebtOrder(type, instrumentKey) {
    return this.orderHandler.submitDebtOrder(type, instrumentKey);
  }

  /**
   * GM Debt Interest Payment handler for a single player.
   */
  async payPlayerDebtInterest(playerUid) {
    return this.gmHandler.payPlayerDebtInterest(playerUid);
  }
}
