import { TradeService } from '../services/TradeService.js';

/**
 * TradeController - Manages Trading Order Submission, Order Validation, GM Approvals, and Order Rejections.
 */
export class TradeController {
  constructor(state, renderer, firebaseService) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
    this.updateTradeFormPrice = null;
    this.refreshDropdownOptions = null;
  }

  /**
   * Binds all trade form events, tab switches, custom dropdowns, and form submission.
   */
  bindTradeFormEvents() {
    const elements = this.getFormElements();
    if (!elements.tradeStockSelect || !elements.tradePrice || !elements.tradeForm) return;

    let orderType = 'BUY'; // Default order mode

    const updateEstimatedCost = () => {
      const symbol = elements.tradeStockSelect.value;
      const stock = this.state.boardStocks[symbol];
      elements.tradePrice.value = stock ? stock.value.toLocaleString('en-US') : '';

      // Update real-time price badges on all dropdown items
      if (elements.dropdownOptions) {
        const allItems = Array.from(elements.dropdownOptions.querySelectorAll('.dropdown-item:not(.empty-state-item)'));
        allItems.forEach(item => {
          const val = item.getAttribute('data-value');
          const itemStock = this.state.boardStocks[val];
          const itemPrice = itemStock ? itemStock.value : 0;

          let priceBadge = item.querySelector('.dropdown-price-badge');
          if (!priceBadge) {
            priceBadge = document.createElement('span');
            priceBadge.className = 'dropdown-price-badge text-emerald-400 font-mono font-bold text-xs ml-auto shrink-0 pl-2';
            item.appendChild(priceBadge);
          }
          priceBadge.textContent = `${itemPrice.toLocaleString('en-US')} THB`;
        });

        // Sync selected option display content (Clean icon + symbol without price badge)
        const currentItem = allItems.find(i => i.getAttribute('data-value') === symbol);
        this.setDropdownSelectedDisplay(elements.dropdownSelectedContent, currentItem);
      }
    };
    this.updateTradeFormPrice = updateEstimatedCost;

    const updateDropdownOptions = () => this.updateDropdownItemsUI(elements, orderType, updateEstimatedCost);
    this.refreshDropdownOptions = updateDropdownOptions;

    this.bindCustomDropdownEvents(elements, updateDropdownOptions, updateEstimatedCost);
    this.bindTabSwitchEvents(elements, (newType) => {
      orderType = newType;
      updateDropdownOptions();
    });
    this.bindFormSubmission(elements, () => orderType, updateEstimatedCost);
  }

  /**
   * Helper to set selected stock display without price badge.
   */
  setDropdownSelectedDisplay(dropdownSelectedContent, item) {
    if (!dropdownSelectedContent) return;
    if (!item) {
      dropdownSelectedContent.innerHTML = `<span class="text-gray-500">Select Stock</span>`;
      return;
    }
    const clone = item.cloneNode(true);
    const priceBadge = clone.querySelector('.dropdown-price-badge');
    if (priceBadge) priceBadge.remove();
    dropdownSelectedContent.innerHTML = clone.innerHTML;
  }

  /**
   * Retrieves trade form DOM elements.
   */
  getFormElements() {
    return {
      tradeStockSelect: document.getElementById('tradeStockSelect'),
      tradePrice: document.getElementById('tradePrice'),
      tradeTabBuy: document.getElementById('tradeTabBuy'),
      tradeTabSell: document.getElementById('tradeTabSell'),
      submitOrderBtn: document.getElementById('submitOrderBtn'),
      tradeForm: document.getElementById('tradeForm'),
      dropdownSelected: document.getElementById('dropdownSelected'),
      dropdownSelectedContent: document.getElementById('dropdownSelectedContent'),
      dropdownOptions: document.getElementById('dropdownOptions')
    };
  }

  /**
   * Binds custom styled stock dropdown selection and click-outside events.
   */
  bindCustomDropdownEvents(elements, updateDropdownOptions, updateEstimatedCost) {
    const { dropdownSelected, dropdownSelectedContent, dropdownOptions, tradeStockSelect } = elements;
    if (!dropdownSelected || !dropdownOptions) return;

    const dropdownContainer = document.getElementById('tradeStockDropdown');

    const closeDropdown = () => {
      if (dropdownContainer) dropdownContainer.classList.remove('open');
    };

    dropdownSelected.addEventListener('click', (e) => {
      e.stopPropagation();
      updateDropdownOptions();
      if (dropdownContainer) {
        dropdownContainer.classList.toggle('open');
      }
    });

    const items = dropdownOptions.querySelectorAll('.dropdown-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const val = item.getAttribute('data-value');
        tradeStockSelect.value = val;
        this.setDropdownSelectedDisplay(dropdownSelectedContent, item);
        closeDropdown();
        updateEstimatedCost();
      });
    });

    document.addEventListener('click', () => {
      closeDropdown();
    });
  }

  /**
   * Updates dropdown option visibility and badge based on BUY/SELL mode.
   */
  updateDropdownItemsUI(elements, orderType, updateEstimatedCost) {
    const { dropdownOptions } = elements;
    if (!dropdownOptions) return;

    const allItems = Array.from(dropdownOptions.querySelectorAll('.dropdown-item:not(.empty-state-item)'));
    allItems.forEach(item => {
      const qtyBadge = item.querySelector('.dropdown-owned-badge');
      if (qtyBadge) qtyBadge.remove();

      // Attach / Update real-time price badge for every item
      const val = item.getAttribute('data-value');
      const itemStock = this.state.boardStocks[val];
      const itemPrice = itemStock ? itemStock.value : 0;

      let priceBadge = item.querySelector('.dropdown-price-badge');
      if (!priceBadge) {
        priceBadge = document.createElement('span');
        priceBadge.className = 'dropdown-price-badge text-emerald-400 font-mono font-bold text-xs ml-auto shrink-0 pl-2';
        item.appendChild(priceBadge);
      }
      priceBadge.textContent = `${itemPrice.toLocaleString('en-US')} THB`;
    });

    if (orderType === 'BUY') {
      this.renderBuyDropdownUI(elements, allItems);
    } else {
      this.renderSellDropdownUI(elements, allItems);
    }

    updateEstimatedCost();
  }

  renderBuyDropdownUI(elements, allItems) {
    const { dropdownOptions, tradeStockSelect, dropdownSelectedContent } = elements;
    const emptyState = dropdownOptions.querySelector('.empty-state-item');
    if (emptyState) emptyState.remove();

    allItems.forEach(item => item.style.setProperty('display', 'flex', 'important'));

    const currentVal = tradeStockSelect.value;
    const currentItem = allItems.find(i => i.getAttribute('data-value') === currentVal);
    if (!currentVal || !currentItem) {
      const first = allItems[0];
      if (first) {
        tradeStockSelect.value = first.getAttribute('data-value');
        this.setDropdownSelectedDisplay(dropdownSelectedContent, first);
      }
    } else {
      this.setDropdownSelectedDisplay(dropdownSelectedContent, currentItem);
    }
  }

  renderSellDropdownUI(elements, allItems) {
    const { dropdownOptions, tradeStockSelect, dropdownSelectedContent } = elements;
    const userPortfolio = this.state.portfolio ? (this.state.portfolio.stocks || {}) : {};
    const ownedSymbols = Object.keys(userPortfolio).filter(sym => userPortfolio[sym] && (Number(userPortfolio[sym].volume) > 0));

    let ownedCount = 0;
    let firstOwnedItem = null;

    allItems.forEach(item => {
      const val = item.getAttribute('data-value');
      if (ownedSymbols.includes(val)) {
        item.style.setProperty('display', 'flex', 'important');
        ownedCount++;
        if (!firstOwnedItem) firstOwnedItem = item;
      } else {
        item.style.setProperty('display', 'none', 'important');
      }
    });

    if (ownedCount === 0) {
      let emptyState = dropdownOptions.querySelector('.empty-state-item');
      if (!emptyState) {
        emptyState = document.createElement('div');
        emptyState.className = 'empty-state-item p-3 text-center text-xs text-gray-400 italic cursor-not-allowed';
        emptyState.textContent = 'No stocks owned';
        dropdownOptions.appendChild(emptyState);
      }
      tradeStockSelect.value = '';
      dropdownSelectedContent.innerHTML = `<span class="text-gray-400 italic">No stocks owned</span>`;
    } else {
      const emptyState = dropdownOptions.querySelector('.empty-state-item');
      if (emptyState) emptyState.remove();

      const currentVal = tradeStockSelect.value;
      if (ownedSymbols.includes(currentVal)) {
        const currentItem = allItems.find(i => i.getAttribute('data-value') === currentVal);
        this.setDropdownSelectedDisplay(dropdownSelectedContent, currentItem || firstOwnedItem);
      } else if (firstOwnedItem) {
        tradeStockSelect.value = firstOwnedItem.getAttribute('data-value');
        this.setDropdownSelectedDisplay(dropdownSelectedContent, firstOwnedItem);
      }
    }
  }

  /**
   * Binds Buy/Sell tab buttons for switching trade mode.
   */
  bindTabSwitchEvents(elements, onOrderTypeChange) {
    const { tradeTabBuy, tradeTabSell, submitOrderBtn } = elements;

    tradeTabBuy.addEventListener('click', (e) => {
      e.preventDefault();
      tradeTabBuy.classList.add('active');
      tradeTabSell.classList.remove('active');
      submitOrderBtn.className = "submit-order-btn buy-theme mt-4";
      submitOrderBtn.textContent = "SUBMIT BUY ORDER";
      onOrderTypeChange('BUY');
    });

    tradeTabSell.addEventListener('click', (e) => {
      e.preventDefault();
      tradeTabSell.classList.add('active');
      tradeTabBuy.classList.remove('active');
      submitOrderBtn.className = "submit-order-btn sell-theme mt-4";
      submitOrderBtn.textContent = "SUBMIT SELL ORDER";
      onOrderTypeChange('SELL');
    });
  }

  /**
   * Binds form submission for submitting trade orders to Firebase.
   */
  bindFormSubmission(elements, getOrderType, updateEstimatedCost) {
    const { tradeForm, tradeStockSelect, dropdownSelectedContent } = elements;

    tradeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const orderType = getOrderType();
      const symbol = tradeStockSelect.value;
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
          "เงินไม่พอ", 
          `เงินสดของคุณไม่เพียงพอสำหรับการส่งคำสั่งซื้อ (Available Cash ที่เหลือ: ${effectiveAvailableCash.toLocaleString()} THB, ต้องการ: ${currentPrice.toLocaleString()} THB)`
        );
        return;
      }

      if (orderType === 'SELL') {
        const holding = currentStocks[symbol];
        if (!holding || holding.volume < vol) {
          const userVol = holding ? holding.volume : 0;
          this.renderer.showErrorAlert("หุ้นไม่พอ", `คุณมีหุ้น ${symbol} ไม่เพียงพอสำหรับการส่งคำสั่งขาย (ต้องการขาย: 1 หุ้น, คุณมี: ${userVol.toLocaleString()} หุ้น)`);
          return;
        }
      }

      await this.processOrderSubmit(user, orderType, symbol, vol, currentPrice, elements, updateEstimatedCost);
    });
  }

  validateOrderSubmission(orderType, symbol) {
    if (orderType === 'SELL') {
      const userPortfolio = this.state.portfolio ? (this.state.portfolio.stocks || {}) : {};
      const ownedCount = Object.keys(userPortfolio).filter(sym => userPortfolio[sym] && userPortfolio[sym].volume > 0).length;
      if (ownedCount === 0 || !symbol) {
        this.renderer.showErrorAlert("No stocks owned", "You do not have any stocks to sell.");
        return false;
      }
    }
    if (!symbol) {
      this.renderer.showErrorAlert("ข้อมูลไม่ถูกต้อง", "กรุณาเลือกหุ้นที่จะทำรายการ");
      return false;
    }
    return true;
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

      this.renderer.showSuccessAlert(
        "ส่งคำสั่งซื้อขายสำเร็จ",
        `คำสั่ง ${orderType} หุ้น ${symbol} จำนวน 1 หุ้น ถูกส่งไปรอ GM อนุมัติเรียบร้อยแล้ว`
      );

      elements.tradeStockSelect.value = '';
      if (elements.dropdownSelectedContent) {
        elements.dropdownSelectedContent.innerHTML = `<span class="text-gray-500">Select Stock</span>`;
      }
      updateEstimatedCost();

    } catch (error) {
      console.error("Order processing error:", error);
      this.renderer.showErrorAlert("ข้อผิดพลาด", "ไม่สามารถส่งคำสั่งซื้อขายได้");
    }
  }

  /**
   * Helper to capture full room and board snapshot before GM actions.
   */
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

  /**
   * GM Order Approval handler.
   */
  async approvePlayerOrder(orderId) {
    const order = this.state.pendingOrders[orderId];
    if (!order) return;

    try {
      const roomSnapshot = await this.firebaseService.getRoomStateSnapshot(this.state.roomCode);
      if (!roomSnapshot || !roomSnapshot.exists()) return;

      const roomData = roomSnapshot.val();
      const memberData = roomData.members[order.uid];
      if (!memberData) {
        this.renderer.showErrorAlert("ข้อผิดพลาด", "ไม่พบข้อมูลผู้เล่นในห้องเกมนี้");
        return;
      }

      let cash = memberData.portfolio?.cash ?? 20000;
      let currentStocks = memberData.portfolio?.stocks ?? {};
      const tradePrice = order.price;
      const totalCost = order.volume * tradePrice;
      let newPortfolio;

      if (order.type === 'BUY') {
        if (cash < totalCost) {
          this.renderer.showErrorAlert("อนุมัติไม่สำเร็จ", `ผู้เล่น ${order.username} มีเงินสดไม่เพียงพอสำหรับสั่งซื้อ (ต้องการ: ${totalCost.toLocaleString()} THB, ผู้เล่นมี: ${cash.toLocaleString()} THB)`);
          return;
        }
        newPortfolio = TradeService.calculateBuyPortfolio(cash, currentStocks, order.symbol, order.volume, tradePrice);
      } else {
        const holding = currentStocks[order.symbol];
        if (!holding || holding.volume < order.volume) {
          const userVol = holding ? holding.volume : 0;
          this.renderer.showErrorAlert("อนุมัติไม่สำเร็จ", `ผู้เล่น ${order.username} มีหุ้น ${order.symbol} ไม่เพียงพอสำหรับการขาย (ต้องการขาย: ${order.volume.toLocaleString()} หุ้น, ผู้เล่นมี: ${userVol.toLocaleString()} หุ้น)`);
          return;
        }
        newPortfolio = TradeService.calculateSellPortfolio(cash, currentStocks, order.symbol, order.volume, tradePrice);
      }

      await this.captureUndoSnapshot();

      await this.firebaseService.updateRoom(this.state.roomCode, {
        [`members/${order.uid}/portfolio`]: newPortfolio,
        [`pendingOrders/${orderId}`]: null
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

    } catch (error) {
      console.error("Failed to approve order:", error);
      this.renderer.showErrorAlert("ข้อผิดพลาด", "ไม่สามารถอนุมัติคำสั่งซื้อขายได้");
    }
  }

  /**
   * GM Order Rejection handler.
   */
  async rejectPlayerOrder(orderId) {
    try {
      await this.captureUndoSnapshot();
      await this.firebaseService.updateRoom(this.state.roomCode, {
        [`pendingOrders/${orderId}`]: null
      });
    } catch (error) {
      console.error("Failed to reject order:", error);
      this.renderer.showErrorAlert("ข้อผิดพลาด", "ไม่สามารถยกเลิกคำสั่งซื้อขายได้");
    }
  }

  /**
   * GM Salary Payment handler.
   */
  async payPlayerSalary(playerUid) {
    try {
      const roomSnapshot = await this.firebaseService.getRoomStateSnapshot(this.state.roomCode);
      const roomData = roomSnapshot ? roomSnapshot.val() : null;

      if (!roomData || !roomData.members || !roomData.members[playerUid]) {
        this.renderer.showErrorAlert("ข้อผิดพลาด", "ไม่พบข้อมูลผู้เล่นในระบบ");
        return;
      }

      const player = roomData.members[playerUid];
      const playerName = player.displayName || 'Player';

      const confirmResult = await this.renderer.showConfirmAlert(
        "ยืนยันการจ่ายเงินเดือน",
        `ต้องการจ่ายเงินเดือนจำนวน 10,000 บาท ให้ผู้เล่น "${playerName}" ใช่หรือไม่?`,
        "YES",
        "NO"
      );

      if (!confirmResult || !confirmResult.isConfirmed) return;

      await this.captureUndoSnapshot();

      const currentCash = player.portfolio?.cash ?? 20000;
      const newCash = currentCash + 10000;

      await this.firebaseService.updateRoom(this.state.roomCode, {
        [`members/${playerUid}/portfolio/cash`]: newCash
      });

      this.renderer.showSuccessAlert("โอนเงินเดือนสำเร็จ", `จ่ายเงินเดือนให้ ${playerName} จำนวน 10,000 บาท เรียบร้อยแล้ว`);
    } catch (error) {
      console.error("Failed to pay salary to player:", error);
      this.renderer.showErrorAlert("ข้อผิดพลาด", "ไม่สามารถจ่ายเงินเดือนให้ผู้เล่นได้");
    }
  }
}
