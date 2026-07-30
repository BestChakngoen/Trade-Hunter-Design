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
        const isHidden = dropdownOptions.style.display === 'none' || dropdownOptions.style.display === '';
        dropdownOptions.style.display = isHidden ? 'block' : 'none';
      });
      
      const items = dropdownOptions.querySelectorAll('.dropdown-item');
      items.forEach(item => {
        item.addEventListener('click', () => {
          const val = item.getAttribute('data-value');
          tradeStockSelect.value = val;
          
          // Sync HTML inside display area
          dropdownSelectedContent.innerHTML = item.innerHTML;
          dropdownOptions.style.display = 'none';
          
          updateEstimatedCost();
        });
      });
      
      // Close list when clicking elsewhere
      document.addEventListener('click', () => {
        dropdownOptions.style.display = 'none';
      });
    }
    
    // Buy / Sell tab switching
    tradeTabBuy.addEventListener('click', (e) => {
      e.preventDefault();
      orderType = 'BUY';
      tradeTabBuy.classList.add('active');
      tradeTabSell.classList.remove('active');
      submitOrderBtn.className = "submit-order-btn buy-theme mt-4";
      submitOrderBtn.textContent = "SUBMIT BUY ORDER";
      updateEstimatedCost();
    });
    
    tradeTabSell.addEventListener('click', (e) => {
      e.preventDefault();
      orderType = 'SELL';
      tradeTabSell.classList.add('active');
      tradeTabBuy.classList.remove('active');
      submitOrderBtn.className = "submit-order-btn sell-theme mt-4";
      submitOrderBtn.textContent = "SUBMIT SELL ORDER";
      updateEstimatedCost();
    });
    
    // Form submission handler
    tradeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const symbol = tradeStockSelect.value;
      const vol = 1; // Volume locked to 1 share per trade
      
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
      
      if (orderType === 'BUY') {
        if (currentCash < totalCost) {
          this.renderer.showErrorAlert("เงินไม่พอ", `เงินสดของคุณไม่เพียงพอสำหรับการส่งคำสั่งซื้อหุ้นนี้ (ต้องการ: ${totalCost.toLocaleString()} THB, คุณมี: ${currentCash.toLocaleString()} THB)`);
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
        const username = user.displayName || user.email || 'Player';
        
        await this.firebaseService.updateRoom(this.state.roomCode, {
          [orderPath]: {
            id: orderId,
            uid: user.uid,
            username: username,
            type: orderType,
            symbol: symbol,
            volume: vol,
            price: currentPrice,
            createdAt: Date.now()
          }
        });
        
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
      
      let cash = memberData.portfolio?.cash ?? 1000000;
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
      
      this.renderer.showSuccessAlert("อนุมัติสำเร็จ", `อนุมัติคำสั่งซื้อขายของ ${order.username} เรียบร้อยแล้วที่ราคาตลาด ${tradePrice.toLocaleString()} THB และปรับราคาตลาดอัตโนมัติแล้ว`);
      
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
      this.renderer.showSuccessAlert("ปฏิเสธสำเร็จ", "คำสั่งซื้อขายได้รับการยกเลิกและลบออกจากระบบแล้ว");
    } catch (error) {
      console.error("Failed to reject order:", error);
      this.renderer.showErrorAlert("ข้อผิดพลาด", "ไม่สามารถยกเลิกคำสั่งซื้อขายได้");
    }
  }
}
