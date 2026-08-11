/**
 * MarketBoardController - Manages Sector Filtering, Sorting, Card Controls, Inline Charts, and Danger Zone Operations.
 */
export class MarketBoardController {
  constructor(state, renderer, firebaseService) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
  }

  bindSectorFilter() {
    if (!this.renderer.sectorPills) return;
    this.initOneTimeScrollbars();

    this.renderer.sectorPills.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      
      const value = pill.getAttribute('data-value');
      const selected = this.state.selectedSectors;
      
      // Single-select logic: Only one sector active at a time
      const isAlreadyActive = selected.has(value) && value !== 'ALL';
      selected.clear();

      if (value === 'ALL' || isAlreadyActive) {
        selected.add('ALL');
      } else {
        selected.add(value);
      }
      
      this.renderer.updateSectorPillsUI(selected);
      this.updateViewGrid();
    });
  }

  initOneTimeScrollbars() {
    const scrollConfigs = [
      { id: 'sectorPills', key: 'scrolled_sectorPills' },
      { id: 'sortToggles', key: 'scrolled_sortToggles' },
      { id: 'holdingsTableContainer', key: 'scrolled_holdingsTable' },
      { id: 'pendingOrdersTableContainer', key: 'scrolled_pendingOrdersTable' },
      { id: 'gmPendingOrdersTableContainer', key: 'scrolled_gmPendingOrdersTable' }
    ];

    scrollConfigs.forEach(cfg => {
      const el = document.getElementById(cfg.id);
      if (!el || el.dataset.scrollInitialized === 'true') return;
      el.dataset.scrollInitialized = 'true';

      // If user previously scrolled in this session, start hidden while idle
      const isScrolled = sessionStorage.getItem(cfg.key) === 'true';
      if (isScrolled) {
        el.classList.add('scrolled-hidden');
      }

      let scrollDebounceTimer = null;

      const onScroll = () => {
        // Show scrollbar while scrolling
        el.classList.remove('scrolled-hidden');

        if (scrollDebounceTimer) {
          clearTimeout(scrollDebounceTimer);
        }

        // Wait 800ms after scrolling stops before smoothly hiding
        scrollDebounceTimer = setTimeout(() => {
          sessionStorage.setItem(cfg.key, 'true');
          el.classList.add('scrolled-hidden');
        }, 800);
      };

      el.addEventListener('scroll', onScroll, { passive: true });
    });
  }

  bindSortButtons() {
    const handleSortClick = (type, e) => {
      const sortStates = this.state.sortStates;
      const isAlreadyEnabled = sortStates[type].enabled;

      // Single-select: Disable all other sort options first
      Object.keys(sortStates).forEach(key => {
        if (key !== type) {
          sortStates[key].enabled = false;
        }
      });

      if (type === 'SECTOR') {
        sortStates.SECTOR.enabled = !isAlreadyEnabled;
      } else {
        const sort = sortStates[type];
        if (!isAlreadyEnabled) {
          sort.enabled = true;
          sort.dir = 'DESC';
        } else {
          sort.dir = sort.dir === 'DESC' ? 'ASC' : 'DESC';
        }
      }

      this.renderer.updateSortButtonsUI(sortStates);
      this.updateViewGrid();
    };

    this.renderer.sortPriceBtn.addEventListener('click', (e) => handleSortClick('PRICE', e));
    this.renderer.sortBetaBtn.addEventListener('click', (e) => handleSortClick('BETA', e));
    this.renderer.sortSectorBtn.addEventListener('click', (e) => handleSortClick('SECTOR', e));
  }

  bindResetBtn() {
    this.renderer.resetBtn.addEventListener('click', () => {
      this.state.resetFilters();
      this.renderer.updateSortButtonsUI(this.state.sortStates);
      this.renderer.updateSectorPillsUI(this.state.selectedSectors);
      this.renderer.clearAllCardAnimations(this.state.originalCards);
      this.updateViewGrid();
    });
  }

  bindPriceControls() {
    this.renderer.priceGrid.addEventListener('click', async (e) => {
      // Controls only permitted for GM role and when not spectating
      if (this.state.role !== 'game_master' || this.state.isSpectating) return;

      const btn = e.target.closest('.control-btn');
      if (!btn) return;
      
      const card = btn.closest('.price-card');
      if (!card) return;
      
      const symbol = card.querySelector('.card-icon').textContent.trim();
      const isUp = btn.classList.contains('up');
      
      // Save full room + board snapshot before changing stock price step
      const [boardSnap, roomSnap] = await Promise.all([
        this.firebaseService.getBoardSnapshot(this.state.roomCode),
        this.firebaseService.getRoomStateSnapshot(this.state.roomCode)
      ]);
      const boardData = boardSnap ? boardSnap.val() : null;
      const roomData = roomSnap ? roomSnap.val() : null;

      if (boardData || roomData) {
        this.state.pushUndoSnapshot({
          stocks: boardData ? boardData.stocks : this.state.boardStocks,
          members: roomData ? roomData.members : null,
          pendingOrders: roomData ? roomData.pendingOrders : null
        });
        const isGM = (this.state.role === 'game_master');
        this.renderer.updateHistoryControlsUI(isGM, this.state.canUndo(), this.state.canRedo());
      }

      const updatedStocks = isUp 
        ? this.state.getUpdatedStocksForUp(symbol)
        : this.state.getUpdatedStocksForDown(symbol);

      if (updatedStocks) {
        try {
          await this.firebaseService.updateStocksBoard(this.state.roomCode, updatedStocks);
        } catch (error) {
          console.error("Failed to update stock step in database:", error);
        }
      }
    });
  }

  bindHistoryButtons() {
    const undoBtn = document.getElementById('undoActionBtn');
    const redoBtn = document.getElementById('redoActionBtn');

    if (undoBtn) {
      undoBtn.addEventListener('click', async () => {
        if (!this.state.canUndo()) return;

        try {
          // Fetch current state to save into Redo stack before applying Undo
          const [curBoardSnap, curRoomSnap] = await Promise.all([
            this.firebaseService.getBoardSnapshot(this.state.roomCode),
            this.firebaseService.getRoomStateSnapshot(this.state.roomCode)
          ]);
          const curBoardData = curBoardSnap ? curBoardSnap.val() : null;
          const curRoomData = curRoomSnap ? curRoomSnap.val() : null;

          this.state.pushRedoSnapshot({
            stocks: curBoardData ? curBoardData.stocks : this.state.boardStocks,
            members: curRoomData ? curRoomData.members : null,
            pendingOrders: curRoomData ? curRoomData.pendingOrders : null
          });

          const previousState = this.state.popUndoSnapshot();
          if (previousState) {
            if (previousState.stocks) {
              await this.firebaseService.setStocksBoard(this.state.roomCode, previousState.stocks);
            }
            if (previousState.members) {
              await this.firebaseService.setRoomMembers(this.state.roomCode, previousState.members);
            }
            if (previousState.pendingOrders !== undefined) {
              await this.firebaseService.setPendingOrders(this.state.roomCode, previousState.pendingOrders);
            }

            const isGM = (this.state.role === 'game_master');
            this.renderer.updateHistoryControlsUI(isGM, this.state.canUndo(), this.state.canRedo());
          }
        } catch (error) {
          console.error("Failed to undo room action:", error);
        }
      });
    }

    if (redoBtn) {
      redoBtn.addEventListener('click', async () => {
        if (!this.state.canRedo()) return;

        try {
          // Fetch current state to save into Undo stack before applying Redo
          const [curBoardSnap, curRoomSnap] = await Promise.all([
            this.firebaseService.getBoardSnapshot(this.state.roomCode),
            this.firebaseService.getRoomStateSnapshot(this.state.roomCode)
          ]);
          const curBoardData = curBoardSnap ? curBoardSnap.val() : null;
          const curRoomData = curRoomSnap ? curRoomSnap.val() : null;

          this.state.undoStack.push({
            stocks: curBoardData ? curBoardData.stocks : this.state.boardStocks,
            members: curRoomData ? curRoomData.members : null,
            pendingOrders: curRoomData ? curRoomData.pendingOrders : null
          });

          const nextState = this.state.popRedoSnapshot();
          if (nextState) {
            if (nextState.stocks) {
              await this.firebaseService.setStocksBoard(this.state.roomCode, nextState.stocks);
            }
            if (nextState.members) {
              await this.firebaseService.setRoomMembers(this.state.roomCode, nextState.members);
            }
            if (nextState.pendingOrders !== undefined) {
              await this.firebaseService.setPendingOrders(this.state.roomCode, nextState.pendingOrders);
            }

            const isGM = (this.state.role === 'game_master');
            this.renderer.updateHistoryControlsUI(isGM, this.state.canUndo(), this.state.canRedo());
          }
        } catch (error) {
          console.error("Failed to redo room action:", error);
        }
      });
    }
  }

  bindStockModals() {
    this.renderer.priceGrid.addEventListener('click', (e) => {
      const graphTrigger = e.target.closest('.view-graph-btn') || e.target.closest('.price-card > div > div:first-child');
      if (!graphTrigger) return;
      
      const card = graphTrigger.closest('.price-card');
      if (!card) return;
      
      const icon = card.querySelector('.card-icon');
      if (!icon) return;
      
      const symbol = icon.textContent.trim();
      const currentPrice = this.state.boardStocks[symbol] 
        ? this.state.boardStocks[symbol].value
        : parseFloat(card.getAttribute('data-price'));

      const beta = parseFloat(card.getAttribute('data-beta'));
      
      const master = this.state.masterStocks[symbol];
      const history = this.state.priceHistory[symbol] || [currentPrice];
      const startPrice = master ? master.steps[master.startStep - 1] : currentPrice;
      
      // Toggle card-level inline chart
      this.renderer.toggleCardChart(card, history, startPrice, beta);
    });
  }

  bindDangerZone() {
    this.renderer.resetMarketBtn.addEventListener('click', () => {
      if (this.state.role !== 'game_master') return;
      this.renderer.openConfirmModal();
    });

    const closeConfirm = () => this.renderer.closeConfirmModal();
    
    const closeConfirmBtn = document.getElementById('closeConfirmModalBtn');
    const cancelResetBtn = document.getElementById('cancelResetBtn');
    
    if (closeConfirmBtn) closeConfirmBtn.addEventListener('click', closeConfirm);
    if (cancelResetBtn) cancelResetBtn.addEventListener('click', closeConfirm);
    
    this.renderer.confirmModal.addEventListener('click', (e) => {
      if (e.target === this.renderer.confirmModal) closeConfirm();
    });

    const confirmResetBtn = document.getElementById('confirmResetBtn');
    if (confirmResetBtn) {
      confirmResetBtn.addEventListener('click', async () => {
        if (this.state.role !== 'game_master' || this.state.isSpectating) return;

        const resetStocks = this.state.getResetStocks();
        try {
          await this.firebaseService.updateStocksBoard(this.state.roomCode, resetStocks);
          
          this.state.resetFilters();
          this.renderer.updateSortButtonsUI(this.state.sortStates);
          this.renderer.updateSectorPillsUI(this.state.selectedSectors);
          this.renderer.clearAllCardAnimations(this.state.originalCards);
          
          this.updateViewGrid();
          closeConfirm();
        } catch (error) {
          console.error("Failed to reset board in database:", error);
        }
      });
    }
  }

  bindSpectatorEvents() {
    if (this.renderer.spectatorToggleBtn) {
      this.renderer.spectatorToggleBtn.addEventListener('click', () => {
        this.state.isSpectating = !this.state.isSpectating;
        const effectiveRole = this.state.isSpectating ? 'player' : 'game_master';
        
        this.renderer.updateControlsVisibility(effectiveRole);
        this.renderer.updateSpectatorButtonUI(this.state.isSpectating);
      });
    }
  }

  hideAllOpenCharts() {
    const cards = this.state.originalCards || [];
    cards.forEach(card => {
      const chartContainer = card.querySelector('.chart-container');
      const viewGraphBtn = card.querySelector('.view-graph-btn');
      if (chartContainer && (chartContainer.style.display === 'flex' || chartContainer.style.display === 'block')) {
        chartContainer.classList.remove('expanded');
        if (viewGraphBtn) {
          viewGraphBtn.classList.remove('active');
          viewGraphBtn.textContent = 'View Graph';
        }
        chartContainer.style.display = 'none';
      }
    });
  }

  updateViewGrid() {
    this.hideAllOpenCharts();
    const sortedFiltered = this.state.getFilteredAndSortedCards();
    this.renderer.renderGrid(sortedFiltered);
    this.renderer.applyBetaColors(sortedFiltered);
    this.renderer.applyPriceColors(sortedFiltered, this.state.boardStocks, this.state.masterStocks, this.state.initialPrices);
  }
}
