import { TradeService } from './services/TradeService.js';
import { 
  normalizePriceToHundreds, 
  calculateExponentialBetaPrice,
  calculateStockStepUp,
  calculateStockStepDown,
  calculateResetStocks
} from './services/MarketMathService.js';
import { HistoryStateManager } from './services/HistoryStateManager.js';

// Re-export for full backward compatibility across the codebase
export { 
  normalizePriceToHundreds, 
  calculateExponentialBetaPrice,
  calculateStockStepUp,
  calculateStockStepDown,
  calculateResetStocks
};

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
    
    // History Snapshot Manager (Extracted in Phase B)
    this.historyManager = new HistoryStateManager(50);
  }

  get undoStack() {
    return this.historyManager.undoStack;
  }
  set undoStack(val) {
    this.historyManager.undoStack = val;
  }

  get redoStack() {
    return this.historyManager.redoStack;
  }
  set redoStack(val) {
    this.historyManager.redoStack = val;
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

  // Push room state snapshot to Undo stack (delegated to HistoryStateManager)
  pushUndoSnapshot(roomData) {
    this.historyManager.pushUndo(roomData);
  }

  popUndoSnapshot() {
    return this.historyManager.popUndo();
  }

  pushRedoSnapshot(roomData) {
    this.historyManager.pushRedo(roomData);
  }

  popRedoSnapshot() {
    return this.historyManager.popRedo();
  }

  canUndo() {
    return this.historyManager.canUndo();
  }

  canRedo() {
    return this.historyManager.canRedo();
  }

  removeMemberFromHistory(playerUid) {
    this.historyManager.removeMemberFromHistory(playerUid);
  }

  purgeUserData(playerUid) {
    this.removeMemberFromHistory(playerUid);
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
    const currentStock = boardStocksArray.find(s => s.name === symbol);
    if (!currentStock) return null;

    const master = this.masterStocks[symbol];
    if (!master) return null;

    const updated = calculateStockStepUp(
      currentStock,
      master,
      this.getStockBeta(symbol),
      this.priceHistory[symbol]
    );
    if (!updated) return null;

    this.priceHistory[symbol] = updated.history;

    return boardStocksArray.map(s => (s.name === symbol ? updated : { ...s, direction: null }));
  }

  // Generate updated stocks list for saving to Firebase when downgrading price step (Exponential Beta Model)
  getUpdatedStocksForDown(symbol) {
    const boardStocksArray = Object.values(this.boardStocks);
    const currentStock = boardStocksArray.find(s => s.name === symbol);
    if (!currentStock) return null;

    const master = this.masterStocks[symbol];
    if (!master) return null;

    const updated = calculateStockStepDown(
      currentStock,
      master,
      this.getStockBeta(symbol),
      this.priceHistory[symbol]
    );
    if (!updated) return null;

    this.priceHistory[symbol] = updated.history;

    return boardStocksArray.map(s => (s.name === symbol ? updated : { ...s, direction: null }));
  }

  // Generate updated stocks list for saving to Firebase when upgrading price step for visible/target stocks by +1
  getBatchUpdatedStocksForUp(targetSymbols = null) {
    const boardStocksArray = Object.values(this.boardStocks);
    if (!boardStocksArray.length) return null;

    let hasChanges = false;
    const updatedStocks = boardStocksArray.map(s => {
      const symbol = s.name;
      if (targetSymbols && targetSymbols.size > 0 && !targetSymbols.has(symbol)) {
        return { ...s, direction: null };
      }
      const master = this.masterStocks[symbol];
      if (!master) return s;

      const updated = calculateStockStepUp(
        s,
        master,
        this.getStockBeta(symbol),
        this.priceHistory[symbol]
      );
      if (!updated) return s;

      hasChanges = true;
      this.priceHistory[symbol] = updated.history;
      return updated;
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
        return { ...s, direction: null };
      }
      const master = this.masterStocks[symbol];
      if (!master) return s;

      const curVal = normalizePriceToHundreds(s.value);
      if (curVal <= 100) return s;

      const updated = calculateStockStepDown(
        s,
        master,
        this.getStockBeta(symbol),
        this.priceHistory[symbol]
      );
      if (!updated || updated.value >= curVal) return s;

      hasChanges = true;
      this.priceHistory[symbol] = updated.history;
      return updated;
    });

    return hasChanges ? updatedStocks : null;
  }

  // Reset entire market state back to initial steps
  getResetStocks() {
    const resetStocks = calculateResetStocks(Object.values(this.boardStocks), this.masterStocks);
    resetStocks.forEach(s => {
      if (s.history) {
        this.priceHistory[s.name] = [...s.history];
      }
    });
    return resetStocks;
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
    if (this.historyManager) {
      this.historyManager.clear();
    }
  }
}
