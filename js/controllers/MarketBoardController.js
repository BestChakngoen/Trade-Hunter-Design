import { DragScrollService } from '../services/DragScrollService.js';
import { PriceControlHandler } from './board/PriceControlHandler.js';
import { DangerZoneHandler } from './board/DangerZoneHandler.js';

/**
 * MarketBoardController - Facade Controller managing Sector Filtering, Sorting,
 * Inline Card Charts, Spectator Events, and coordinating Price/History and Danger Zone handlers.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class MarketBoardController {
  constructor(state, renderer, firebaseService, marketController = null, playerSessionService = null) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
    this.marketController = marketController;
    this.playerSessionService = playerSessionService;

    // Specialized Handlers (Extracted in Phase A)
    this.priceControlHandler = new PriceControlHandler(this.state, this.renderer, this.firebaseService);
    this.dangerZoneHandler = new DangerZoneHandler({
      state: this.state,
      renderer: this.renderer,
      firebaseService: this.firebaseService,
      marketController: this.marketController,
      playerSessionService: this.playerSessionService,
      onPriceReset: () => this.updateViewGrid()
    });
  }

  // --- Drag Scroll Proxies (Backward Compatibility) ---
  initOneTimeScrollbars(configs = null) {
    DragScrollService.initScrollbars(configs);
  }

  enableDragToScroll(el) {
    DragScrollService.enableDragToScroll(el);
  }

  // --- Price Controls & History Proxies (Backward Compatibility) ---
  bindPriceControls() {
    this.priceControlHandler.bindPriceControls();
  }

  bindBatchPriceControls() {
    this.priceControlHandler.bindBatchPriceControls();
  }

  bindHistoryButtons() {
    this.priceControlHandler.bindHistoryButtons();
  }

  // --- Danger Zone Proxies (Backward Compatibility) ---
  bindDangerZone() {
    this.dangerZoneHandler.bindDangerZone();
  }

  // --- Market Board Filtering & Visual Operations ---
  bindSectorFilter() {
    if (!this.renderer.sectorPills) return;
    this.initOneTimeScrollbars();

    this.renderer.sectorPills.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      
      const value = pill.getAttribute('data-value');
      const selected = this.state.selectedSectors;
      
      // Single Group Filter: Clear Size filter and Sort states
      this.state.selectedSizes.clear();
      Object.keys(this.state.sortStates).forEach(key => {
        this.state.sortStates[key].enabled = false;
      });

      const isAlreadyActive = selected.has(value);
      selected.clear();

      if (!isAlreadyActive) {
        selected.add(value);
      }
      
      this.renderer.updateSectorPillsUI(selected);
      this.renderer.updateSizePillsUI(this.state.selectedSizes);
      this.renderer.updateSortButtonsUI(this.state.sortStates);
      if (typeof pill.blur === 'function') {
        pill.blur();
      }
      this.updateViewGrid();
    });
  }

  bindSizeFilter() {
    if (!this.renderer.sizePills) return;

    this.renderer.sizePills.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      
      const value = pill.getAttribute('data-value');
      const selected = this.state.selectedSizes;
      
      // Single Group Filter: Clear Sector filter and Sort states
      this.state.selectedSectors.clear();
      Object.keys(this.state.sortStates).forEach(key => {
        this.state.sortStates[key].enabled = false;
      });

      const isAlreadyActive = selected.has(value);
      selected.clear();

      if (!isAlreadyActive) {
        selected.add(value);
      }
      
      this.renderer.updateSectorPillsUI(this.state.selectedSectors);
      this.renderer.updateSizePillsUI(selected);
      this.renderer.updateSortButtonsUI(this.state.sortStates);
      if (typeof pill.blur === 'function') {
        pill.blur();
      }
      this.updateViewGrid();
    });
  }

  bindSortButtons() {
    const handleSortClick = (type, e) => {
      const sortStates = this.state.sortStates;
      const isAlreadyEnabled = sortStates[type] ? sortStates[type].enabled : false;

      // Single Group Filter: Clear Sector and Size filters when using Sort By
      this.state.selectedSectors.clear();
      this.state.selectedSizes.clear();

      // Single-Criteria Sorting: Disable all other sort criteria when selecting a new one
      Object.keys(sortStates).forEach(key => {
        if (key !== type) {
          sortStates[key].enabled = false;
        }
      });

      if (type === 'SECTOR') {
        sortStates.SECTOR.enabled = !isAlreadyEnabled;
      } else {
        const sort = sortStates[type];
        if (!sort) return;
        
        // 3-Stage Toggle: OFF -> DESC (มากไปน้อย) -> ASC (น้อยไปมาก) -> OFF (ปิด)
        if (!isAlreadyEnabled) {
          sort.enabled = true;
          sort.dir = 'DESC';
        } else if (sort.dir === 'DESC') {
          sort.dir = 'ASC';
        } else {
          sort.enabled = false;
        }
      }

      this.renderer.updateSectorPillsUI(this.state.selectedSectors);
      this.renderer.updateSizePillsUI(this.state.selectedSizes);
      this.renderer.updateSortButtonsUI(sortStates);
      this.updateViewGrid();
    };

    if (this.renderer.sortPriceBtn) this.renderer.sortPriceBtn.addEventListener('click', (e) => handleSortClick('PRICE', e));
    if (this.renderer.sortSectorBtn) this.renderer.sortSectorBtn.addEventListener('click', (e) => handleSortClick('SECTOR', e));
  }

  bindResetBtn() {
    if (!this.renderer.resetBtn) return;
    this.renderer.resetBtn.addEventListener('click', () => {
      // Trigger smooth 360-degree spin animation on reset icon
      const icon = this.renderer.resetBtn.querySelector('.reset-icon');
      if (icon) {
        icon.classList.remove('spin-once');
        void icon.offsetWidth; // Reflow to restart keyframe animation
        icon.classList.add('spin-once');
        setTimeout(() => icon.classList.remove('spin-once'), 500);
      }

      this.state.resetFilters();
      this.renderer.updateSortButtonsUI(this.state.sortStates);
      this.renderer.updateSectorPillsUI(this.state.selectedSectors);
      this.renderer.updateSizePillsUI(this.state.selectedSizes);
      this.renderer.clearAllCardAnimations(this.state.originalCards);
      this.updateViewGrid();
    });
  }

  bindStockModals() {
    if (!this.renderer.priceGrid) return;

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
