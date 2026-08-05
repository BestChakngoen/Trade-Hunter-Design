/**
 * TradeController - Manages Trading Order Submission, Order Validation, GM Approvals, and Order Rejections.
 */
export class TradeController {
  constructor(state, renderer, firebaseService) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
    this.updateTradeFormPrice = null;
  }

  bindTradeFormEvents() {
    const tradeStockSelect = document.getElementById('tradeStockSelect');
    const tradePrice = document.getElementById('tradePrice');
    const tradeTabBuy = document.getElementById('tradeTabBuy');
    const tradeTabSell = document.getElementById('tradeTabSell');
    const submitOrderBtn = document.getElementById('submitOrderBtn');
    const tradeForm = document.getElementById('tradeForm');
    
    const dropdownSelected = document.getElementById('dropdownSelected');
    const dropdownSelectedContent = document.getElementById('dropdownSelectedContent');
    const dropdownOptions = document.getElementById('dropdownOptions');
    
    let orderType = 'BUY'; // Default is BUY
    
    if (!tradeStockSelect || !tradePrice || !tradeForm) return;
    
    const updateEstimatedCost = () => {
      const symbol = tradeStockSelect.value;
      const stock = this.state.boardStocks[symbol];
      const price = stock ? stock.value : 0;
      
      tradePrice.value = stock ? price.toLocaleString('en-US') : '';
    };
    this.updateTradeFormPrice = updateEstimatedCost;
    
    // Bind Custom Dropdown Events
    if (dropdownSelected && dropdownOptions) {
      dropdownSelected.addEventListener('click', (e) => {
        e.stopPropagation();
        updateDropdownOptions();
        const isHidden = dropdownOptions.style.display === 'none' || dropdownOptions.style.display === '';
        if (isHidden) {
          dropdownOptions.style.setProperty('display', 'block', 'important');
        } else {
          dropdownOptions.style.setProperty('display', 'none', 'important');
        }
      });
      
      const items = dropdownOptions.querySelectorAll('.dropdown-item');
      items.forEach(item => {
        item.addEventListener('click', () => {
          const val = item.getAttribute('data-value');
          tradeStockSelect.value = val;
          
          // Sync HTML inside display area
          dropdownSelectedContent.innerHTML = item.innerHTML;
          dropdownOptions.style.setProperty('display', 'none', 'important');
          
          updateEstimatedCost();
        });
      });
      
      // Close list when clicking elsewhere
      document.addEventListener('click', () => {
        dropdownOptions.style.setProperty('display', 'none', 'important');
      });
    }
    
    const updateDropdownOptions = () => {
      if (!dropdownOptions) return;
      const allItems = Array.from(dropdownOptions.querySelectorAll('.dropdown-item:not(.empty-state-item)'));

      // Always clean up any old quantity badges to keep the UI clean
      allItems.forEach(item => {
        const qtyBadge = item.querySelector('.dropdown-owned-badge');
        if (qtyBadge) qtyBadge.remove();
      });

      if (orderType === 'BUY') {
        const emptyState = dropdownOptions.querySelector('.empty-state-item');
        if (emptyState) emptyState.remove();

        allItems.forEach(item => {
          item.style.setProperty('display', 'flex', 'important');
        });

        // Ensure a valid stock is selected for BUY
        const currentVal = tradeStockSelect.value;
        const currentItem = allItems.find(i => i.getAttribute('data-value') === currentVal);
        if (!currentVal || !currentItem) {
          const first = allItems[0];
          if (first) {
            tradeStockSelect.value = first.getAttribute('data-value');
            dropdownSelectedContent.innerHTML = first.innerHTML;
          }
        } else {
          dropdownSelectedContent.innerHTML = currentItem.innerHTML;
        }
      } else if (orderType === 'SELL') {
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

          // Auto-select first owned item or update current selection HTML cleanly
          const currentVal = tradeStockSelect.value;
          if (ownedSymbols.includes(currentVal)) {
            const currentItem = allItems.find(i => i.getAttribute('data-value') === currentVal);
            if (currentItem) {
              dropdownSelectedContent.innerHTML = currentItem.innerHTML;
            } else if (firstOwnedItem) {
              tradeStockSelect.value = firstOwnedItem.getAttribute('data-value');
              dropdownSelectedContent.innerHTML = firstOwnedItem.innerHTML;
            }
          } else if (firstOwnedItem) {
            tradeStockSelect.value = firstOwnedItem.getAttribute('data-value');
            dropdownSelectedContent.innerHTML = firstOwnedItem.innerHTML;
          }
        }
      }

      updateEstimatedCost();
    };

    this.refreshDropdownOptions = updateDropdownOptions;

    // Buy / Sell tab switching
    tradeTabBuy.addEventListener('click', (e) => {
      e.preventDefault();
      orderType = 'BUY';
      tradeTabBuy.classList.add('active');
      tradeTabSell.classList.remove('active');
      submitOrderBtn.className = "submit-order-btn buy-theme mt-4";
      submitOrderBtn.textContent = "SUBMIT BUY ORDER";
      updateDropdownOptions();
    });
    
    tradeTabSell.addEventListener('click', (e) => {
      e.preventDefault();
      orderType = 'SELL';
      tradeTabSell.classList.add('active');
      tradeTabBuy.classList.remove('active');
      submitOrderBtn.className = "submit-order-btn sell-theme mt-4";
      submitOrderBtn.textContent = "SUBMIT SELL ORDER";
      updateDropdownOptions();
    });
    
    // Form submission handler
    tradeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const symbol = tradeStockSelect.value;
      const vol = 1; // Volume locked to 1 share per trade
      
      if (orderType === 'SELL') {
        const userPortfolio = this.state.portfolio ? (this.state.portfolio.stocks || {}) : {};
        const ownedCount = Object.keys(userPortfolio).filter(sym => userPortfolio[sym] && userPortfolio[sym].volume > 0).length;
        if (ownedCount === 0 || !symbol) {
          this.renderer.showErrorAlert("No stocks owned", "You do not have any stocks to sell.");
          return;
        }
      }

      if (!symbol) {
        this.renderer.showErrorAlert("ข้อมูลไม่ถูกต้อง", "กรุณาเลือกหุ้นที่จะทำรายการ");
        return;
      }
      
      const stock = this.state.boardStocks[symbol];
      if (!stock) {
        this.renderer.showErrorAlert("ข้อผิดพลาด", "ไม่พบข้อมูลราคาหุ้นตัวที่เลือก");
        return;
      }
      
      const currentPrice = stock.value;
      const totalCost = currentPrice;
      const user = this.firebaseService.getCurrentUser();
      if (!user) return;
      
      let currentCash = this.state.portfolio.cash;
      let currentStocks = { ...this.state.portfolio.stocks };

      // Calculate total cash tied up in user's pending BUY orders
      const targetUidStr = String(user.uid || '').trim().toLowerCase();
      const userPendingBuyOrders = Object.values(this.state.pendingOrders || {}).filter(
        o => o && o.uid && String(o.uid).trim().toLowerCase() === targetUidStr && o.type === 'BUY'
      );
      const pendingBuyTotal = userPendingBuyOrders.reduce((sum, o) => sum + (Number(o.volume || 1) * Number(o.price || 0)), 0);
      const effectiveAvailableCash = currentCash - pendingBuyTotal;
      
      console.log('🚀 [DEBUG TradeController Order Submit Check]', {
        userUid: user.uid,
        orderType,
        symbol,
        currentPrice,
        currentCash,
        pendingBuyTotal,
        effectiveAvailableCash
      });
      
      if (orderType === 'BUY') {
        if (effectiveAvailableCash < totalCost) {
          this.renderer.showErrorAlert(
            "เงินไม่พอ", 
            `เงินสดของคุณไม่เพียงพอสำหรับการส่งคำสั่งซื้อ (Available Cash ที่เหลือ: ${effectiveAvailableCash.toLocaleString()} THB, ต้องการ: ${totalCost.toLocaleString()} THB)`
          );
          return;
        }
      } else {
        // SELL ORDER Pre-check
        const holding = currentStocks[symbol];
        if (!holding || holding.volume < vol) {
          const userVol = holding ? holding.volume : 0;
          this.renderer.showErrorAlert("หุ้นไม่พอ", `คุณมีหุ้น ${symbol} ไม่เพียงพอสำหรับการส่งคำสั่งขาย (ต้องการขาย: 1 หุ้น, คุณมี: ${userVol.toLocaleString()} หุ้น)`);
          return;
        }
      }
      
      // Update Firebase under pendingOrders
      try {
        const orderId = 'order_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const orderPath = `pendingOrders/${orderId}`;
        const username = this.state.playerName || 'Player_1';
        
        const newOrder = {
          id: orderId,
          uid: user.uid,
          username: username,
          type: orderType,
          symbol: symbol,
          volume: vol,
          price: currentPrice,
          createdAt: Date.now()
        };

        console.log('📤 [DEBUG TradeController Submitting Order]', newOrder);

        await this.firebaseService.updateRoom(this.state.roomCode, {
          [orderPath]: newOrder
        });

        // Immediately sync local state and update UI
        if (!this.state.pendingOrders) this.state.pendingOrders = {};
        this.state.pendingOrders[orderId] = newOrder;
        
        const stats = this.state.getPortfolioStats();
        this.renderer.updatePortfolioUI(stats, this.state.portfolio, this.state.boardStocks, this.state.pendingOrders, user.uid);
        this.renderer.updatePlayerPendingOrdersUI(this.state.pendingOrders, user.uid);
        
        this.renderer.showSuccessAlert(
          "ส่งคำสั่งซื้อขายสำเร็จ",
          `คำสั่ง ${orderType} หุ้น ${symbol} จำนวน 1 หุ้น ถูกส่งไปรอ GM อนุมัติเรียบร้อยแล้ว`
        );
        
        // Reset inputs and display content
        tradeStockSelect.value = '';
        if (dropdownSelectedContent) {
          dropdownSelectedContent.innerHTML = `<span class="text-gray-500">Select Stock</span>`;
        }
        updateEstimatedCost();
        
      } catch (error) {
        console.error("Order processing error:", error);
        this.renderer.showErrorAlert("ข้อผิดพลาด", "ไม่สามารถส่งคำสั่งซื้อขายได้");
      }
    });
  }

  async approvePlayerOrder(orderId) {
    const order = this.state.pendingOrders[orderId];
    if (!order) return;
    
    try {
      // Fetch latest player snapshot to prevent race conditions
      const roomSnapshot = await this.firebaseService.getRoomStateSnapshot(this.state.roomCode);
      if (!roomSnapshot || !roomSnapshot.exists()) return;
      
      const roomData = roomSnapshot.val();
      const memberData = roomData.members[order.uid];
      if (!memberData) {
        this.renderer.showErrorAlert("ข้อผิดพลาด", "ไม่พบข้อมูลผู้เล่นในห้องเกมนี้");
        return;
      }
      
      let cash = memberData.portfolio?.cash ?? 20000;
      let stocks = { ...(memberData.portfolio?.stocks ?? {}) };
      
      const tradePrice = order.price;
      const totalCost = order.volume * tradePrice;
      
      if (order.type === 'BUY') {
        if (cash < totalCost) {
          this.renderer.showErrorAlert("อนุมัติไม่สำเร็จ", `ผู้เล่น ${order.username} มีเงินสดไม่เพียงพอสำหรับสั่งซื้อ (ต้องการ: ${totalCost.toLocaleString()} THB, ผู้เล่นมี: ${cash.toLocaleString()} THB)`);
          return;
        }
        cash -= totalCost;
        if (stocks[order.symbol]) {
          const oldCost = stocks[order.symbol].volume * stocks[order.symbol].avgPrice;
          const newVolume = stocks[order.symbol].volume + order.volume;
          const newAvgPrice = (oldCost + totalCost) / newVolume;
          stocks[order.symbol] = {
            volume: newVolume,
            avgPrice: Math.round(newAvgPrice)
          };
        } else {
          stocks[order.symbol] = {
            volume: order.volume,
            avgPrice: tradePrice
          };
        }
      } else {
        // SELL
        const holding = stocks[order.symbol];
        if (!holding || holding.volume < order.volume) {
          const userVol = holding ? holding.volume : 0;
          this.renderer.showErrorAlert("อนุมัติไม่สำเร็จ", `ผู้เล่น ${order.username} มีหุ้น ${order.symbol} ไม่เพียงพอสำหรับการขาย (ต้องการขาย: ${order.volume.toLocaleString()} หุ้น, ผู้เล่นมี: ${userVol.toLocaleString()} หุ้น)`);
          return;
        }
        cash += totalCost;
        const newVolume = holding.volume - order.volume;
        if (newVolume === 0) {
          delete stocks[order.symbol];
        } else {
          stocks[order.symbol] = {
            volume: newVolume,
            avgPrice: holding.avgPrice
          };
        }
      }
      
      // Update player portfolio & Delete pending order in atomic transaction
      await this.firebaseService.updateRoom(this.state.roomCode, {
        [`members/${order.uid}/portfolio`]: { cash, stocks },
        [`pendingOrders/${orderId}`]: null
      });

      // Update stock step in database automatically (BUY shifts price up, SELL shifts price down)
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

  async rejectPlayerOrder(orderId) {
    try {
      await this.firebaseService.updateRoom(this.state.roomCode, {
        [`pendingOrders/${orderId}`]: null
      });
    } catch (error) {
      console.error("Failed to reject order:", error);
      this.renderer.showErrorAlert("ข้อผิดพลาด", "ไม่สามารถยกเลิกคำสั่งซื้อขายได้");
    }
  }

  async payPlayerSalary(playerUid) {
    try {
      const roomSnapshot = await this.firebaseService.getRoomStateSnapshot(this.state.roomCode);
      const roomData = roomSnapshot ? roomSnapshot.val() : null;
      if (!roomData || !roomData.members || !roomData.members[playerUid]) {
        this.renderer.showErrorAlert("ข้อผิดพลาด", "ไม่พบข้อมูลผู้เล่นในระบบ");
        return;
      }

      const player = roomData.members[playerUid];
      const currentCash = player.portfolio?.cash ?? 20000;
      const newCash = currentCash + 10000;

      await this.firebaseService.updateRoom(this.state.roomCode, {
        [`members/${playerUid}/portfolio/cash`]: newCash
      });

      this.renderer.showSuccessAlert("โอนเงินเดือนสำเร็จ", `จ่ายเงินเดือนให้ ${player.displayName || 'Player'} จำนวน 10,000 บาท เรียบร้อยแล้ว`);
    } catch (error) {
      console.error("Failed to pay salary to player:", error);
      this.renderer.showErrorAlert("ข้อผิดพลาด", "ไม่สามารถจ่ายเงินเดือนให้ผู้เล่นได้");
    }
  }
}
