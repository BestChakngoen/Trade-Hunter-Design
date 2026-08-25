/**
 * Normalizes stock price to full hundreds (e.g. 5238 -> 5200, 5265 -> 5300)
 */
export function normalizePriceToHundreds(price) {
  if (typeof price !== 'number' || isNaN(price)) return price;
  return Math.max(100, Math.round(price / 100) * 100);
}

/**
 * Calculates next price using exponential movement scaled by Beta volatility.
 * @param {number} currentPrice - Current price S_t
 * @param {number} beta - Stock Beta factor
 * @param {number} direction - Direction: +1 for Up, -1 for Down
 * @param {number} baseReturn - Base step return rate (default 0.05 = 5%)
 */
export function calculateExponentialBetaPrice(currentPrice, beta = 1.0, direction = 1, baseReturn = 0.05) {
  const effectiveBeta = Number(beta) || 1.0;
  const logReturn = direction * effectiveBeta * baseReturn;
  const rawNextPrice = currentPrice * Math.exp(logReturn);
  return normalizePriceToHundreds(rawNextPrice);
}

export class MarketState {
  constructor(cardElements) {
    this.originalCards = cardElements;
    this.selectedSectors = new Set(['ALL']);
    this.sortStates = {
      SECTOR: { enabled: false, dir: 'ASC' },
      BETA: { enabled: false, dir: 'DESC' },
      PRICE: { enabled: false, dir: 'DESC' },
      SIZE: { enabled: false, dir: 'DESC' }
    };
    
    this.roomCode = null;
    this.role = 'player'; // default role
    this.isSpectating = false; // spectator mode for GM
    
    // Master settings from Firestore (key: Stock Name)
    this.masterStocks = {}; 
    
    // Baseline starting prices for stock comparison (key: Stock Name)
    this.initialPrices = {};

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
    
    // Continuous Undo & Redo Action Stacks (Full Room State Snapshot)
    this.undoStack = [];
    this.redoStack = [];
  }

  // Push room state snapshot (stocks, members portfolio/cash, pendingOrders) to Undo stack
  pushUndoSnapshot(roomData) {
    if (!roomData) return;
    const snapshot = {
      stocks: JSON.parse(JSON.stringify(roomData.stocks || {})),
      members: JSON.parse(JSON.stringify(roomData.members || {})),
      pendingOrders: JSON.parse(JSON.stringify(roomData.pendingOrders || {}))
    };
    this.undoStack.push(snapshot);
    // Limit stack size to 50 items
    if (this.undoStack.length > 50) {
      this.undoStack.shift();
    }
    // Clear Redo stack when a new action is performed
    this.redoStack = [];
  }

  popUndoSnapshot() {
    if (this.undoStack.length === 0) return null;
    return this.undoStack.pop();
  }

  pushRedoSnapshot(roomData) {
    if (!roomData) return;
    const snapshot = {
      stocks: JSON.parse(JSON.stringify(roomData.stocks || {})),
      members: JSON.parse(JSON.stringify(roomData.members || {})),
      pendingOrders: JSON.parse(JSON.stringify(roomData.pendingOrders || {}))
    };
    this.redoStack.push(snapshot);
  }

  popRedoSnapshot() {
    if (this.redoStack.length === 0) return null;
    return this.redoStack.pop();
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
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

  // Get or calculate starting price for stock comparison
  getStartPrice(symbol, currentValue) {
    if (!this.initialPrices) this.initialPrices = {};
    if (this.initialPrices[symbol] !== undefined) {
      return this.initialPrices[symbol];
    }
    const master = this.masterStocks ? this.masterStocks[symbol] : null;
    if (master && Array.isArray(master.steps) && master.startStep > 0) {
      const startVal = master.steps[master.startStep - 1];
      if (startVal !== undefined) {
        this.initialPrices[symbol] = startVal;
        return startVal;
      }
    }
    if (currentValue !== undefined) {
      this.initialPrices[symbol] = currentValue;
      return currentValue;
    }
    return 0;
  }

  // Get Beta value for a stock symbol from card dataset or default 1.0
  getStockBeta(symbol) {
    if (this.boardStocks[symbol] && this.boardStocks[symbol].beta !== undefined) {
      return parseFloat(this.boardStocks[symbol].beta) || 1.0;
    }
    const card = this.originalCards.find(c => {
      const titleEl = c.querySelector('.card-title');
      const iconEl = c.querySelector('.card-icon');
      const name = (titleEl ? titleEl.textContent : (iconEl ? iconEl.textContent : '')).trim();
      return name === symbol;
    });
    if (card) {
      const betaAttr = card.getAttribute('data-beta');
      if (betaAttr) return parseFloat(betaAttr) || 1.0;
    }
    return 1.0;
  }

  // Populate master settings from Firestore
  setMasterStocks(firestoreStocks) {
    this.masterStocks = {};
    if (!this.initialPrices) this.initialPrices = {};
    if (!Array.isArray(firestoreStocks)) return;
    firestoreStocks.forEach(stock => {
      if (!stock || !stock.name) return;
      const normalizedSteps = Array.isArray(stock.steps)
        ? stock.steps.map(val => normalizePriceToHundreds(val))
        : stock.steps;
      this.masterStocks[stock.name] = {
        name: stock.name,
        steps: normalizedSteps,
        startStep: stock.startStep
      };
      if (Array.isArray(normalizedSteps) && stock.startStep > 0) {
        const startVal = normalizedSteps[stock.startStep - 1];
        if (startVal !== undefined) {
          this.initialPrices[stock.name] = normalizePriceToHundreds(startVal);
        }
      }
    });
  }

  // Update local state when Firebase Realtime Database triggers an update
  updateFromFirebaseBoard(firebaseBoard) {
    if (!firebaseBoard || !firebaseBoard.stocks) return;

    firebaseBoard.stocks.forEach(stock => {
      const symbol = stock.name;
      stock.value = normalizePriceToHundreds(stock.value);
      this.boardStocks[symbol] = stock;

      const startPrice = this.getStartPrice(symbol, stock.value);

      const card = this.originalCards.find(c => c.querySelector('.card-icon') && c.querySelector('.card-icon').textContent.trim() === symbol);
      const activeGridCard = document.getElementById('priceGrid')
        ? Array.from(document.getElementById('priceGrid').querySelectorAll('.price-card')).find(c => c.querySelector('.card-icon') && c.querySelector('.card-icon').textContent.trim() === symbol)
        : null;

      [card, activeGridCard].forEach(targetCard => {
        if (!targetCard) return;
        targetCard.setAttribute('data-price', stock.value);
        const valueText = targetCard.querySelector('.card-value');
        const priceBox = targetCard.querySelector('.price-box');
        if (valueText) {
          valueText.textContent = stock.value.toLocaleString('en-US');
        }
        if (priceBox) {
          priceBox.classList.remove('price-up', 'price-down', 'price-neutral');
          if (stock.value > startPrice) {
            priceBox.classList.add('price-up');
            priceBox.style.setProperty('background-color', 'rgba(16, 185, 129, 0.18)', 'important');
            priceBox.style.setProperty('border', '1.5px solid rgba(16, 185, 129, 0.5)', 'important');
            priceBox.style.setProperty('box-shadow', '0 0 14px rgba(16, 185, 129, 0.25)', 'important');
            if (valueText) {
              valueText.style.setProperty('color', '#34d399', 'important');
              valueText.style.setProperty('text-shadow', '0 0 10px rgba(52, 211, 153, 0.5)', 'important');
            }
          } else if (stock.value < startPrice) {
            priceBox.classList.add('price-down');
            priceBox.style.setProperty('background-color', 'rgba(239, 68, 68, 0.18)', 'important');
            priceBox.style.setProperty('border', '1.5px solid rgba(239, 68, 68, 0.5)', 'important');
            priceBox.style.setProperty('box-shadow', '0 0 14px rgba(239, 68, 68, 0.25)', 'important');
            if (valueText) {
              valueText.style.setProperty('color', '#f87171', 'important');
              valueText.style.setProperty('text-shadow', '0 0 10px rgba(248, 113, 113, 0.5)', 'important');
            }
          } else {
            priceBox.classList.add('price-neutral');
            priceBox.style.setProperty('background-color', '#e5e7eb', 'important');
            priceBox.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.1)', 'important');
            priceBox.style.setProperty('box-shadow', 'none', 'important');
            if (valueText) {
              valueText.style.setProperty('color', '#111827', 'important');
              valueText.style.setProperty('text-shadow', 'none', 'important');
            }
          }
        }
      });

      if (Array.isArray(stock.history) && stock.history.length > 0) {
        this.priceHistory[symbol] = stock.history.map(val => normalizePriceToHundreds(val));
      } else {
        if (!this.priceHistory[symbol]) {
          this.priceHistory[symbol] = [startPrice];
        }
        if (this.priceHistory[symbol][this.priceHistory[symbol].length - 1] !== stock.value) {
          this.priceHistory[symbol].push(stock.value);
        }
      }
    });
  }

  // Generate updated stocks list for saving to Firebase when upgrading price step (Exponential Beta Model)
  getUpdatedStocksForUp(symbol) {
    const boardStocksArray = Object.values(this.boardStocks);
    const stockIndex = boardStocksArray.findIndex(s => s.name === symbol);
    if (stockIndex === -1) return null;

    const currentStock = boardStocksArray[stockIndex];
    const master = this.masterStocks[symbol];
    if (!master) return null;

    const nextStep = currentStock.step + 1;
    const beta = this.getStockBeta(symbol);
    
    // Exponential Beta calculation: slope varies dynamically by Beta (16% base step scaling - doubled)
    const nextValue = calculateExponentialBetaPrice(currentStock.value, beta, 1, 0.16);
    if (nextValue < 0) return null;

    const updatedStocks = boardStocksArray.map(s => {
      if (s.name === symbol) {
        const startPrice = master ? normalizePriceToHundreds(master.steps[master.startStep - 1]) : s.value;
        const currentHistory = Array.isArray(s.history) ? s.history : (this.priceHistory[symbol] || [startPrice]);
        const newHistory = [...currentHistory, nextValue];
        this.priceHistory[symbol] = newHistory;

        return {
          ...s,
          step: nextStep,
          value: nextValue,
          oldValue: currentStock.value,
          history: newHistory,
          updatedAt: Date.now()
        };
      }
      return s;
    });

    return updatedStocks;
  }

  // Generate updated stocks list for saving to Firebase when downgrading price step (Exponential Beta Model)
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

    const beta = this.getStockBeta(symbol);
    
    // Exponential Beta calculation: slope varies dynamically by Beta (16% base step scaling - doubled)
    const nextValue = Math.max(100, calculateExponentialBetaPrice(currentStock.value, beta, -1, 0.16));
    if (nextValue < 0) return null; // Prevent value dropping below 0

    const updatedStocks = boardStocksArray.map(s => {
      if (s.name === symbol) {
        const startPrice = master ? normalizePriceToHundreds(master.steps[master.startStep - 1]) : s.value;
        const currentHistory = Array.isArray(s.history) ? s.history : (this.priceHistory[symbol] || [startPrice]);
        const newHistory = [...currentHistory, nextValue];
        this.priceHistory[symbol] = newHistory;

        return {
          ...s,
          step: prevStep,
          value: nextValue,
          oldValue: currentStock.value,
          history: newHistory,
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
      const startPrice = normalizePriceToHundreds(master.steps[startIdx]);
      this.priceHistory[s.name] = [startPrice];
      return {
        ...s,
        step: startIdx,
        value: startPrice,
        oldValue: null,
        history: [startPrice],
        updatedAt: Date.now()
      };
    });
  }

  resetFilters() {
    this.sortStates = {
      SECTOR: { enabled: false, dir: 'ASC' },
      BETA: { enabled: false, dir: 'DESC' },
      PRICE: { enabled: false, dir: 'DESC' },
      SIZE: { enabled: false, dir: 'DESC' }
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
    const isSizeActive = this.sortStates.SIZE ? this.sortStates.SIZE.enabled : false;

    if (isSectorActive || isBetaActive || isPriceActive || isSizeActive) {
      const sizeWeight = { 'L': 3, 'M': 2, 'S': 1 };
      filtered.sort((a, b) => {
        // Priority 1: Sort by Sector (if enabled) - always ASC (A-Z)
        if (isSectorActive) {
          const valA = a.getAttribute('data-sector') || '';
          const valB = b.getAttribute('data-sector') || '';
          const comparison = valA.localeCompare(valB);
          if (comparison !== 0) return comparison;
        }

        // Priority 2: Sort by Price (if enabled)
        if (isPriceActive) {
          const valA = parseFloat(a.getAttribute('data-price'));
          const valB = parseFloat(b.getAttribute('data-price'));
          const comparison = this.sortStates.PRICE.dir === 'DESC' ? valB - valA : valA - valB;
          if (comparison !== 0) return comparison;
        }

        // Priority 3: Sort by Beta (if enabled)
        if (isBetaActive) {
          const valA = parseFloat(a.getAttribute('data-beta'));
          const valB = parseFloat(b.getAttribute('data-beta'));
          const comparison = this.sortStates.BETA.dir === 'DESC' ? valB - valA : valA - valB;
          if (comparison !== 0) return comparison;
        }

        // Priority 4: Sort by Size (if enabled)
        if (isSizeActive) {
          const valA = sizeWeight[a.getAttribute('data-size')] || 0;
          const valB = sizeWeight[b.getAttribute('data-size')] || 0;
          const comparison = this.sortStates.SIZE.dir === 'DESC' ? valB - valA : valA - valB;
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

  reset() {
    this.roomCode = null;
    this.role = 'player';
    this.isSpectating = false;
    this.boardStocks = {};
    this.portfolio = { cash: 20000, stocks: {} };
    this.pendingOrders = {};
    this.priceHistory = {};
    this.undoStack = [];
    this.redoStack = [];
  }
}
