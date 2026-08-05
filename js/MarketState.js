export class MarketState {
  constructor(cardElements) {
    this.originalCards = cardElements;
    this.selectedSectors = new Set(['ALL']);
    this.sortStates = {
      SECTOR: { enabled: false, dir: 'ASC' },
      BETA: { enabled: false, dir: 'DESC' },
      PRICE: { enabled: false, dir: 'DESC' }
    };
    
    this.roomCode = null;
    this.role = 'player'; // default role
    this.isSpectating = false; // spectator mode for GM
    
    // Master settings from Firestore (key: Stock Name)
    this.masterStocks = {}; 
    
    // Current board state from Realtime Database (key: Stock Name)
    this.boardStocks = {};
    
    // Track price history locally for charts
    this.priceHistory = {};
    
    // Player portfolio state
    this.portfolio = {
      cash: 20000,
      stocks: {}
    };
    
    // Pending orders queue
    this.pendingOrders = {};
    // Player info
    this.playerName = 'Player_1';
  }

  setRoomCode(code) {
    this.roomCode = code;
  }

  setRole(role) {
    this.role = role;
  }

  setPlayerName(name) {
    this.playerName = name;
  }

  // Populate master settings from Firestore
  setMasterStocks(firestoreStocks) {
    this.masterStocks = {};
    firestoreStocks.forEach(stock => {
      this.masterStocks[stock.name] = {
        name: stock.name,
        steps: stock.steps,
        startStep: stock.startStep
      };
    });
  }

  // Update local state when Firebase Realtime Database triggers an update
  updateFromFirebaseBoard(firebaseBoard) {
    if (!firebaseBoard || !firebaseBoard.stocks) return;

    firebaseBoard.stocks.forEach(stock => {
      const symbol = stock.name;
      this.boardStocks[symbol] = stock;

      // Find the corresponding HTML card element and sync its attribute
      const card = this.originalCards.find(c => c.querySelector('.card-icon').textContent.trim() === symbol);
      if (card) {
        card.setAttribute('data-price', stock.value);
      }

      // Record price history for chart rendering
      if (!this.priceHistory[symbol]) {
        // Initialize history with starting price if available
        const master = this.masterStocks[symbol];
        const startPrice = master ? master.steps[master.startStep - 1] : stock.value;
        this.priceHistory[symbol] = [startPrice];
      }

      // Push latest value if it differs from the last recorded one
      const history = this.priceHistory[symbol];
      if (history[history.length - 1] !== stock.value) {
        history.push(stock.value);
      }
    });
  }

  // Generate updated stocks list for saving to Firebase when upgrading price step
  getUpdatedStocksForUp(symbol) {
    const boardStocksArray = Object.values(this.boardStocks);
    const stockIndex = boardStocksArray.findIndex(s => s.name === symbol);
    if (stockIndex === -1) return null;

    const currentStock = boardStocksArray[stockIndex];
    const master = this.masterStocks[symbol];
    if (!master) return null;

    const nextStep = currentStock.step + 1;
    if (nextStep >= master.steps.length) return null; // Already at max step
    
    const nextValue = master.steps[nextStep];
    if (nextValue < 0) return null; // Prevent value dropping below 0

    const updatedStocks = boardStocksArray.map(s => {
      if (s.name === symbol) {
        return {
          ...s,
          step: nextStep,
          value: nextValue,
          oldValue: currentStock.value,
          updatedAt: Date.now()
        };
      }
      return s;
    });

    return updatedStocks;
  }

  // Generate updated stocks list for saving to Firebase when downgrading price step
  getUpdatedStocksForDown(symbol) {
    const boardStocksArray = Object.values(this.boardStocks);
    const stockIndex = boardStocksArray.findIndex(s => s.name === symbol);
    if (stockIndex === -1) return null;

    const currentStock = boardStocksArray[stockIndex];
    const master = this.masterStocks[symbol];
    if (!master) return null;

    let prevStep = currentStock.step - 1;
    if (prevStep < 0) {
      prevStep = 0; // Clamp to lowest step 0 instead of wrapping
    }

    const nextValue = master.steps[prevStep];
    if (nextValue < 0) return null; // Prevent value dropping below 0

    const updatedStocks = boardStocksArray.map(s => {
      if (s.name === symbol) {
        return {
          ...s,
          step: prevStep,
          value: nextValue,
          oldValue: currentStock.value,
          updatedAt: Date.now()
        };
      }
      return s;
    });

    return updatedStocks;
  }

  // Reset entire market state back to initial steps
  getResetStocks() {
    return Object.values(this.boardStocks).map(s => {
      const master = this.masterStocks[s.name];
      if (!master) return s;
      const startIdx = master.startStep - 1;
      return {
        ...s,
        step: startIdx,
        value: master.steps[startIdx],
        oldValue: null,
        updatedAt: Date.now()
      };
    });
  }

  resetFilters() {
    this.sortStates = {
      SECTOR: { enabled: false, dir: 'ASC' },
      BETA: { enabled: false, dir: 'DESC' },
      PRICE: { enabled: false, dir: 'DESC' }
    };
    this.selectedSectors.clear();
    this.selectedSectors.add('ALL');
  }

  getFilteredAndSortedCards() {
    let filtered = this.originalCards.filter(card => {
      const sector = card.getAttribute('data-sector');
      return this.selectedSectors.has('ALL') || this.selectedSectors.has(sector);
    });

    const isSectorActive = this.sortStates.SECTOR.enabled;
    const isBetaActive = this.sortStates.BETA.enabled;
    const isPriceActive = this.sortStates.PRICE.enabled;

    if (isSectorActive || isBetaActive || isPriceActive) {
      filtered.sort((a, b) => {
        // 1. Sort by Sector (if enabled) - always ASC (A-Z)
        if (isSectorActive) {
          const valA = a.getAttribute('data-sector') || '';
          const valB = b.getAttribute('data-sector') || '';
          const comparison = valA.localeCompare(valB);
          if (comparison !== 0) return comparison;
        }

        // 2. Sort by Beta (if enabled)
        if (isBetaActive) {
          const valA = parseFloat(a.getAttribute('data-beta'));
          const valB = parseFloat(b.getAttribute('data-beta'));
          const comparison = this.sortStates.BETA.dir === 'DESC' ? valB - valA : valA - valB;
          if (comparison !== 0) return comparison;
        }

        // 3. Sort by Price (if enabled)
        if (isPriceActive) {
          const valA = parseFloat(a.getAttribute('data-price'));
          const valB = parseFloat(b.getAttribute('data-price'));
          const comparison = this.sortStates.PRICE.dir === 'DESC' ? valB - valA : valA - valB;
          if (comparison !== 0) return comparison;
        }

        return 0;
      });
    }
    return filtered;
  }

  static calculateBetaColor(beta) {
    let hue = 0;
    if (beta <= 0) {
      hue = 140; // Green
    } else if (beta < 1) {
      hue = 140 - beta * 95; // Green -> Yellow
    } else if (beta < 2) {
      hue = 45 - (beta - 1) * 45; // Yellow -> Red
    } else {
      hue = 0; // Red
    }
    return {
      color: `hsl(${hue}, 95%, 65%)`,
      shadow: `0 0 8px hsl(${hue}, 95%, 65%, 0.3)`
    };
  }

  getChartMetrics(symbol, currentPrice) {
    const history = this.priceHistory[symbol] || [currentPrice];
    const initialPrice = history[0];
    const changePct = initialPrice > 0 ? ((currentPrice - initialPrice) / initialPrice) * 100 : 0;
    return {
      initialPrice,
      changePct,
      history
    };
  }

  updatePortfolioFromMemberData(memberData) {
    if (memberData) {
      if (memberData.displayName) {
        this.playerName = memberData.displayName;
      }
      if (memberData.portfolio) {
        this.portfolio = {
          cash: memberData.portfolio.cash ?? 20000,
          stocks: memberData.portfolio.stocks ?? {}
        };
      }
    } else {
      this.portfolio = {
        cash: 20000,
        stocks: {}
      };
    }
  }

  getPortfolioStats() {
    let totalStocksValue = 0;
    let totalCost = 0;
    
    Object.keys(this.portfolio.stocks).forEach(symbol => {
      const holding = this.portfolio.stocks[symbol];
      if (holding.volume > 0) {
        const currentStock = this.boardStocks[symbol];
        const marketPrice = currentStock ? currentStock.value : holding.avgPrice;
        
        totalStocksValue += holding.volume * marketPrice;
        totalCost += holding.volume * holding.avgPrice;
      }
    });
    
    const totalAssets = this.portfolio.cash + totalStocksValue;
    const totalPnL = totalStocksValue - totalCost;
    const totalPnLPct = totalCost === 0 ? 0 : (totalPnL / totalCost) * 100;
    
    return {
      cash: this.portfolio.cash,
      stocksValue: totalStocksValue,
      totalAssets: totalAssets,
      totalPnL: totalPnL,
      totalPnLPct: totalPnLPct
    };
  }

  updatePendingOrders(ordersData) {
    this.pendingOrders = ordersData || {};
  }
}
