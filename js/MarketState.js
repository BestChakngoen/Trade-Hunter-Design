class MarketState {
  constructor(cardElements) {
    this.originalCards = cardElements;
    this.selectedSectors = new Set(['ALL']);
    this.sortStates = {
      SECTOR: { enabled: false, dir: 'ASC' },
      BETA: { enabled: false, dir: 'DESC' },
      PRICE: { enabled: false, dir: 'DESC' }
    };
    this.initialPrices = {};
    this.priceHistory = {};
    
    // Parse metadata and record starting values
    this.originalCards.forEach(card => {
      const symbol = card.querySelector('.card-icon').textContent.trim();
      const price = parseFloat(card.getAttribute('data-price'));
      this.initialPrices[symbol] = price;
      this.priceHistory[symbol] = [price];
    });
  }

  adjustPrice(symbol, delta) {
    const card = this.originalCards.find(c => c.querySelector('.card-icon').textContent.trim() === symbol);
    if (!card) return null;

    let price = parseFloat(card.getAttribute('data-price'));
    price = Math.max(0, price + delta);
    
    card.setAttribute('data-price', price);
    if (this.priceHistory[symbol]) {
      this.priceHistory[symbol].push(price);
    }
    return price;
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

  resetMarket() {
    this.resetFilters();
    this.originalCards.forEach(card => {
      const symbol = card.querySelector('.card-icon').textContent.trim();
      const startPrice = this.initialPrices[symbol];
      card.setAttribute('data-price', startPrice);
      this.priceHistory[symbol] = [startPrice];
    });
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
}
