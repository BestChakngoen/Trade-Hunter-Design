import { TradeService } from './services/TradeService.js';

/**
 * Normalizes stock price to full hundreds (e.g. 5238 -> 5200, 5265 -> 5300)
 */
export function normalizePriceToHundreds(price) {
  if (price === null || price === undefined) return 100;
  const cleanPrice = typeof price === 'string' ? parseFloat(price.replace(/,/g, '')) : Number(price);
  if (isNaN(cleanPrice) || cleanPrice < 100) return 100;
  return Math.max(100, Math.round(cleanPrice / 100) * 100);
}

/**
 * Calculates next price using exponential movement scaled by Beta volatility.
 * @param {number|string} currentPrice - Current price S_t
 * @param {number} beta - Stock Beta factor
 * @param {number} direction - Direction: +1 for Up, -1 for Down
 * @param {number} baseReturn - Base step return rate (default 0.05 = 5%)
 */
export function calculateExponentialBetaPrice(currentPrice, beta = 1.0, direction = 1, baseReturn = 0.05) {
  const cleanPrice = normalizePriceToHundreds(currentPrice);
  const effectiveBeta = Number(beta) || 1.0;
  const logReturn = direction * effectiveBeta * baseReturn;
  const rawNextPrice = cleanPrice * Math.exp(logReturn);
  let nextPrice = normalizePriceToHundreds(rawNextPrice);

  // Ensure price moves by at least 100 in the target direction when rounded
  if (direction > 0 && nextPrice <= cleanPrice) {
    nextPrice = cleanPrice + 100;
  } else if (direction < 0 && nextPrice >= cleanPrice) {
    nextPrice = Math.max(100, cleanPrice - 100);
  }

  return nextPrice;
}

export class MarketState {
  constructor(cardElements) {
    this.originalCards = cardElements;
    this.selectedSectors = new Set();
    this.selectedSizes = new Set();
    this.sortStates = {
      SECTOR: { enabled: false, dir: 'ASC' },
      PRICE: { enabled: false, dir: 'DESC' }
    };
    
    this.roomCode = null;
    this.role = 'player'; // default role
    this.gameMode = 'advance'; // 'basic' | 'advance'
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

  setRoomCode(code) {
    this.roomCode = code;
  }

  setRole(role) {
    this.role = role;
  }

  setPlayerName(name) {
    this.playerName = name;
  }

  setGameMode(mode) {
    this.gameMode = mode;
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

  // Remove player UID from all undo and redo history snapshots
  removeMemberFromHistory(playerUid) {
    if (!playerUid) return;
    const uidStr = String(playerUid).trim().toLowerCase();

    const cleanSnapshot = (snapshot) => {
      if (!snapshot) return;
      if (snapshot.members) {
        Object.keys(snapshot.members).forEach(uid => {
          if (String(uid).trim().toLowerCase() === uidStr) {
            delete snapshot.members[uid];
          }
        });
      }
      if (snapshot.pendingOrders) {
        Object.keys(snapshot.pendingOrders).forEach(orderId => {
          const order = snapshot.pendingOrders[orderId];
          if (order && String(order.uid || '').trim().toLowerCase() === uidStr) {
            delete snapshot.pendingOrders[orderId];
          }
        });
      }
    };

    this.undoStack.forEach(cleanSnapshot);
    this.redoStack.forEach(cleanSnapshot);
  }

  purgeUserData(playerUid) {
    this.removeMemberFromHistory(playerUid);
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

  // Get Stock Size (S, M, L) for a stock symbol
  getStockSize(symbol) {
    if (this.boardStocks[symbol] && this.boardStocks[symbol].size) {
      return this.boardStocks[symbol].size;
    }
    if (this.masterStocks && this.masterStocks[symbol] && this.masterStocks[symbol].size) {
      return this.masterStocks[symbol].size;
    }
    const card = this.originalCards.find(c => {
      const titleEl = c.querySelector('.card-title');
      const iconEl = c.querySelector('.card-icon');
      const name = (titleEl ? titleEl.textContent : (iconEl ? iconEl.textContent : '')).trim();
      return name === symbol;
    });
    if (card) {
      const sizeAttr = card.getAttribute('data-size');
      if (sizeAttr) return sizeAttr;
    }
    return 'M';
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

          let isUp = false;
          let isDown = false;
          if (stock.direction === 'up') {
            isUp = true;
          } else if (stock.direction === 'down') {
            isDown = true;
          } else if (Number(stock.value) === 100) {
            isDown = true;
          } else if (stock.oldValue !== null && stock.oldValue !== undefined) {
            if (stock.value > stock.oldValue) isUp = true;
            else if (stock.value < stock.oldValue) isDown = true;
          }

          if (isUp) {
            priceBox.classList.add('price-up');
            priceBox.style.setProperty('background-color', 'rgba(16, 185, 129, 0.18)', 'important');
            priceBox.style.setProperty('border', '1.5px solid rgba(16, 185, 129, 0.5)', 'important');
            priceBox.style.setProperty('box-shadow', '0 0 14px rgba(16, 185, 129, 0.25)', 'important');
            if (valueText) {
              valueText.style.setProperty('color', '#34d399', 'important');
              valueText.style.setProperty('text-shadow', '0 0 10px rgba(52, 211, 153, 0.5)', 'important');
            }
          } else if (isDown) {
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

    const currentStep = (typeof currentStock.step === 'number' && !isNaN(currentStock.step)) ? currentStock.step : 0;
    const nextStep = currentStep + 1;
    const beta = this.getStockBeta(symbol);
    const curVal = normalizePriceToHundreds(currentStock.value);
    
    // Exponential Beta calculation: slope varies dynamically by Beta (16% base step scaling - doubled)
    const nextValue = calculateExponentialBetaPrice(curVal, beta, 1, 0.16);
    if (isNaN(nextValue) || nextValue < 100) return null;

    const updatedStocks = boardStocksArray.map(s => {
      if (s.name === symbol) {
        const startPrice = master ? normalizePriceToHundreds(master.steps[master.startStep - 1]) : curVal;
        const currentHistory = Array.isArray(s.history) ? s.history : (this.priceHistory[symbol] || [startPrice]);
        const newHistory = [...currentHistory, nextValue];
        this.priceHistory[symbol] = newHistory;

        return {
          ...s,
          step: nextStep,
          value: nextValue,
          oldValue: curVal,
          direction: 'up',
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

    const currentStep = (typeof currentStock.step === 'number' && !isNaN(currentStock.step)) ? currentStock.step : 0;
    let prevStep = currentStep - 1;
    if (prevStep < 0) {
      prevStep = 0; // Clamp to lowest step 0 instead of wrapping
    }

    const beta = this.getStockBeta(symbol);
    const curVal = normalizePriceToHundreds(currentStock.value);

    // Exponential Beta calculation: slope varies dynamically by Beta (16% base step scaling - doubled)
    const nextValue = Math.max(100, calculateExponentialBetaPrice(curVal, beta, -1, 0.16));
    if (isNaN(nextValue) || nextValue < 100) return null;

    const updatedStocks = boardStocksArray.map(s => {
      if (s.name === symbol) {
        const startPrice = master ? normalizePriceToHundreds(master.steps[master.startStep - 1]) : curVal;
        const currentHistory = Array.isArray(s.history) ? s.history : (this.priceHistory[symbol] || [startPrice]);
        const newHistory = (nextValue !== curVal) ? [...currentHistory, nextValue] : currentHistory;
        this.priceHistory[symbol] = newHistory;

        return {
          ...s,
          step: prevStep,
          value: nextValue,
          oldValue: curVal,
          direction: 'down',
          history: newHistory,
          updatedAt: Date.now()
        };
      }
      return s;
    });

    return updatedStocks;
  }

  // Generate updated stocks list for saving to Firebase when upgrading price step for visible/target stocks by +1
  getBatchUpdatedStocksForUp(targetSymbols = null) {
    const boardStocksArray = Object.values(this.boardStocks);
    if (!boardStocksArray.length) return null;

    let hasChanges = false;
    const updatedStocks = boardStocksArray.map(s => {
      const symbol = s.name;
      if (targetSymbols && targetSymbols.size > 0 && !targetSymbols.has(symbol)) {
        return s;
      }
      const master = this.masterStocks[symbol];
      if (!master) return s;

      const currentStep = (typeof s.step === 'number' && !isNaN(s.step)) ? s.step : 0;
      const nextStep = currentStep + 1;
      const beta = this.getStockBeta(symbol);
      const curVal = normalizePriceToHundreds(s.value);
      const nextValue = calculateExponentialBetaPrice(curVal, beta, 1, 0.16);
      if (isNaN(nextValue) || nextValue < 100) return s;

      hasChanges = true;
      const startPrice = master ? normalizePriceToHundreds(master.steps[master.startStep - 1]) : curVal;
      const currentHistory = Array.isArray(s.history) ? s.history : (this.priceHistory[symbol] || [startPrice]);
      const newHistory = [...currentHistory, nextValue];
      this.priceHistory[symbol] = newHistory;

      return {
        ...s,
        step: nextStep,
        value: nextValue,
        oldValue: curVal,
        direction: 'up',
        history: newHistory,
        updatedAt: Date.now()
      };
    });

    return hasChanges ? updatedStocks : null;
  }

  // Generate updated stocks list for saving to Firebase when downgrading price step for visible/target stocks by -1
  getBatchUpdatedStocksForDown(targetSymbols = null) {
    const boardStocksArray = Object.values(this.boardStocks);
    if (!boardStocksArray.length) return null;

    let hasChanges = false;
    const updatedStocks = boardStocksArray.map(s => {
      const symbol = s.name;
      if (targetSymbols && targetSymbols.size > 0 && !targetSymbols.has(symbol)) {
        return s;
      }
      const master = this.masterStocks[symbol];
      if (!master) return s;

      const currentStep = (typeof s.step === 'number' && !isNaN(s.step)) ? s.step : 0;
      let prevStep = currentStep - 1;
      if (prevStep < 0) {
        prevStep = 0;
      }

      const beta = this.getStockBeta(symbol);
      const curVal = normalizePriceToHundreds(s.value);
      if (curVal <= 100) return s;

      const nextValue = Math.max(100, calculateExponentialBetaPrice(curVal, beta, -1, 0.16));
      if (isNaN(nextValue) || nextValue < 100 || nextValue >= curVal) return s;

      hasChanges = true;
      const startPrice = master ? normalizePriceToHundreds(master.steps[master.startStep - 1]) : curVal;
      const currentHistory = Array.isArray(s.history) ? s.history : (this.priceHistory[symbol] || [startPrice]);
      const newHistory = [...currentHistory, nextValue];
      this.priceHistory[symbol] = newHistory;

      return {
        ...s,
        step: prevStep,
        value: nextValue,
        oldValue: curVal,
        direction: 'down',
        history: newHistory,
        updatedAt: Date.now()
      };
    });

    return hasChanges ? updatedStocks : null;
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
        direction: null,
        history: [startPrice],
        updatedAt: Date.now()
      };
    });
  }

  resetFilters() {
    this.sortStates = {
      SECTOR: { enabled: false, dir: 'ASC' },
      PRICE: { enabled: false, dir: 'DESC' }
    };
    this.selectedSectors.clear();
    this.selectedSizes.clear();
  }

  getFilteredAndSortedCards() {
    let filtered = this.originalCards.filter(card => {
      const sector = card.getAttribute('data-sector');
      const size = card.getAttribute('data-size');
      const matchSector = this.selectedSectors.size === 0 || this.selectedSectors.has(sector);
      const matchSize = this.selectedSizes.size === 0 || this.selectedSizes.has(size);
      return matchSector && matchSize;
    });

    const isSectorActive = this.sortStates.SECTOR.enabled;
    const isPriceActive = this.sortStates.PRICE.enabled;

    if (isSectorActive || isPriceActive) {
      filtered.sort((a, b) => {
        if (isSectorActive) {
          const valA = a.getAttribute('data-sector') || '';
          const valB = b.getAttribute('data-sector') || '';
          const comparison = valA.localeCompare(valB);
          if (comparison !== 0) return comparison;
        }

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
      if (memberData.role) {
        this.role = memberData.role;
      }
      if (memberData.displayName) {
        this.playerName = memberData.displayName;
      }
      if (memberData.role === 'game_master') {
        this.portfolio = null;
      } else if (memberData.portfolio) {
        this.portfolio = {
          cash: memberData.portfolio.cash ?? 20000,
          stocks: memberData.portfolio.stocks ?? {},
          debt: memberData.portfolio.debt ?? { fixAccount: 0, bond10Y: 0, bond20Y: 0 }
        };
      }
    } else {
      this.portfolio = {
        cash: 20000,
        stocks: {},
        debt: { fixAccount: 0, bond10Y: 0, bond20Y: 0 }
      };
    }
  }

  getPortfolioStats() {
    if (!this.portfolio) {
      return {
        cash: 0,
        stocksValue: 0,
        debtValue: 0,
        totalAssets: 0,
        totalPnL: 0,
        totalPnLPct: 0
      };
    }

    let totalStocksValue = 0;
    let totalCost = 0;
    
    Object.keys(this.portfolio.stocks || {}).forEach(symbol => {
      const holding = this.portfolio.stocks[symbol];
      if (holding && holding.volume > 0) {
        const currentStock = this.boardStocks[symbol];
        const marketPrice = currentStock ? currentStock.value : holding.avgPrice;
        
        totalStocksValue += holding.volume * marketPrice;
        totalCost += holding.volume * holding.avgPrice;
      }
    });

    const debtData = TradeService.calculateDebtInstrumentsValue(this.portfolio.debt || {});
    const totalDebtValue = debtData.totalValue;
    
    const totalAssets = this.portfolio.cash + totalStocksValue + totalDebtValue;
    const totalPnL = totalStocksValue - totalCost;
    const totalPnLPct = totalCost === 0 ? 0 : (totalPnL / totalCost) * 100;
    
    return {
      cash: this.portfolio.cash,
      stocksValue: totalStocksValue,
      debtValue: totalDebtValue,
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
    this.portfolio = {
      cash: 20000,
      stocks: {},
      debt: { fixAccount: 0, bond10Y: 0, bond20Y: 0 }
    };
    this.pendingOrders = {};
    this.priceHistory = {};
    this.undoStack = [];
    this.redoStack = [];
  }
}
