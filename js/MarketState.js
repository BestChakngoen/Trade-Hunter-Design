class MarketState {
  constructor(cardElements) {
    this.originalCards = cardElements;
    this.selectedSectors = new Set(['ALL']);
    this.activeSort = { type: 'NONE', dir: 'NONE' };
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
    this.activeSort = { type: 'NONE', dir: 'NONE' };
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

    if (this.activeSort.type !== 'NONE' && this.activeSort.dir !== 'NONE') {
      filtered.sort((a, b) => {
        let valA, valB;
        if (this.activeSort.type === 'PRICE') {
          valA = parseFloat(a.getAttribute('data-price'));
          valB = parseFloat(b.getAttribute('data-price'));
        } else if (this.activeSort.type === 'BETA') {
          valA = parseFloat(a.getAttribute('data-beta'));
          valB = parseFloat(b.getAttribute('data-beta'));
        }
        return this.activeSort.dir === 'DESC' ? valB - valA : valA - valB;
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
