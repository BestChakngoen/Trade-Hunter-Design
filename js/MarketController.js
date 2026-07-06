class MarketController {
  constructor(state, renderer) {
    this.state = state;
    this.renderer = renderer;
  }

  init() {
    this.renderer.applyBetaColors(this.state.originalCards);
    this.bindSectorFilter();
    this.bindSortButtons();
    this.bindResetBtn();
    this.bindPriceControls();
    this.bindStockModals();
    this.bindDangerZone();
  }

  bindSectorFilter() {
    this.renderer.sectorPills.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      
      const value = pill.getAttribute('data-value');
      const selected = this.state.selectedSectors;
      
      if (value === 'ALL') {
        selected.clear();
        selected.add('ALL');
        this.renderer.sectorPills.querySelectorAll('.pill').forEach(p => {
          if (p.getAttribute('data-value') === 'ALL') {
            p.classList.add('active');
          } else {
            p.classList.remove('active');
          }
        });
      } else {
        if (selected.has('ALL')) {
          selected.delete('ALL');
          const allPill = this.renderer.sectorPills.querySelector('[data-value="ALL"]');
          if (allPill) allPill.classList.remove('active');
        }
        
        if (selected.has(value)) {
          selected.delete(value);
          pill.classList.remove('active');
        } else {
          selected.add(value);
          pill.classList.add('active');
        }
        
        if (selected.size === 0) {
          selected.add('ALL');
          const allPill = this.renderer.sectorPills.querySelector('[data-value="ALL"]');
          if (allPill) allPill.classList.add('active');
        }
      }
      
      this.updateViewGrid();
    });
  }

  bindSortButtons() {
    const handleSort = (type) => {
      const sort = this.state.activeSort;
      if (sort.type === type) {
        sort.dir = sort.dir === 'DESC' ? 'ASC' : 'DESC';
      } else {
        sort.type = type;
        sort.dir = 'DESC';
      }
      
      this.renderer.updateSortButtonsUI(sort);
      this.updateViewGrid();
    };

    this.renderer.sortPriceBtn.addEventListener('click', () => handleSort('PRICE'));
    this.renderer.sortBetaBtn.addEventListener('click', () => handleSort('BETA'));
  }

  bindResetBtn() {
    this.renderer.resetBtn.addEventListener('click', () => {
      this.state.resetFilters();
      this.renderer.updateSortButtonsUI(this.state.activeSort);
      this.renderer.updateSectorPillsUI(this.state.selectedSectors);
      this.renderer.clearAllCardAnimations(this.state.originalCards);
      this.updateViewGrid();
    });
  }

  bindPriceControls() {
    this.renderer.priceGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.control-btn');
      if (!btn) return;
      
      const card = btn.closest('.price-card');
      if (!card) return;
      
      const symbol = card.querySelector('.card-icon').textContent.trim();
      const delta = btn.classList.contains('up') ? 100 : -100;
      
      const newPrice = this.state.adjustPrice(symbol, delta);
      if (newPrice !== null) {
        const direction = btn.classList.contains('up') ? 'up' : 'down';
        this.renderer.updateCardValue(card, newPrice, direction);
      }
    });
  }

  bindStockModals() {
    this.renderer.priceGrid.addEventListener('click', (e) => {
      const icon = e.target.closest('.card-icon');
      if (!icon) return;
      
      const card = icon.closest('.price-card');
      if (!card) return;
      
      const symbol = icon.textContent.trim();
      const sector = card.getAttribute('data-sector');
      const price = parseFloat(card.getAttribute('data-price'));
      const beta = parseFloat(card.getAttribute('data-beta'));
      
      let sectorClass = '';
      icon.classList.forEach(cls => {
        if (cls.startsWith('icon-')) sectorClass = cls;
      });
      
      const metrics = this.state.getChartMetrics(symbol, price);
      this.renderer.openChartModal(symbol, sector, price, beta, sectorClass, metrics);
    });

    this.renderer.closeModalBtn.addEventListener('click', () => this.renderer.closeChartModal());
    this.renderer.chartModal.addEventListener('click', (e) => {
      if (e.target === this.renderer.chartModal) this.renderer.closeChartModal();
    });
  }

  bindDangerZone() {
    this.renderer.resetMarketBtn.addEventListener('click', () => {
      this.renderer.openConfirmModal();
    });

    const closeConfirm = () => this.renderer.closeConfirmModal();
    
    document.getElementById('closeConfirmModalBtn').addEventListener('click', closeConfirm);
    document.getElementById('cancelResetBtn').addEventListener('click', closeConfirm);
    this.renderer.confirmModal.addEventListener('click', (e) => {
      if (e.target === this.renderer.confirmModal) closeConfirm();
    });

    document.getElementById('confirmResetBtn').addEventListener('click', () => {
      this.state.resetMarket();
      
      this.renderer.updateSortButtonsUI(this.state.activeSort);
      this.renderer.updateSectorPillsUI(this.state.selectedSectors);
      this.renderer.clearAllCardAnimations(this.state.originalCards);
      
      this.state.originalCards.forEach(card => {
        const symbol = card.querySelector('.card-icon').textContent.trim();
        const startPrice = this.state.initialPrices[symbol];
        card.querySelector('.card-value').textContent = startPrice.toLocaleString('en-US');
      });

      this.updateViewGrid();
      closeConfirm();
    });
  }

  updateViewGrid() {
    const sortedFiltered = this.state.getFilteredAndSortedCards();
    this.renderer.renderGrid(sortedFiltered);
  }
}
