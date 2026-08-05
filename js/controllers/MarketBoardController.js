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
      if (!el) return;

      // Check if this specific element was already scrolled and finished previously
      const isScrolled = sessionStorage.getItem(cfg.key) === 'true';
      if (isScrolled) {
        el.classList.add('scrolled-hidden');
        return;
      }

      let scrollDebounceTimer = null;

      const onScroll = () => {
        if (el.scrollLeft > 0) {
          // Keep scrollbar active while user is swiping/scrolling
          if (scrollDebounceTimer) {
            clearTimeout(scrollDebounceTimer);
          }

          // Wait 800ms after scrolling stops before smoothly hiding
          scrollDebounceTimer = setTimeout(() => {
            sessionStorage.setItem(cfg.key, 'true');
            el.classList.add('scrolled-hidden');
            el.removeEventListener('scroll', onScroll);
          }, 800);
        }
      };

      el.addEventListener('scroll', onScroll, { passive: true });
    });
  }

  bindSortButtons() {
    const handleSortClick = (type, e) => {
      const sortStates = this.state.sortStates;
      
      if (type === 'SECTOR') {
        sortStates.SECTOR.enabled = !sortStates.SECTOR.enabled;
      } else {
        const sort = sortStates[type];
        const isIconClick = e.target.closest('.sort-icon') !== null;
        
        if (isIconClick) {
          if (sort.enabled) {
            sort.dir = sort.dir === 'DESC' ? 'ASC' : 'DESC';
          } else {
            sort.enabled = true;
            sort.dir = 'DESC';
          }
        } else {
          sort.enabled = !sort.enabled;
          if (sort.enabled) {
            sort.dir = 'DESC';
          }
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

  updateViewGrid() {
    const sortedFiltered = this.state.getFilteredAndSortedCards();
    this.renderer.renderGrid(sortedFiltered);
    this.renderer.applyBetaColors(sortedFiltered);
  }
}
