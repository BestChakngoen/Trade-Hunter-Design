/**
 * CardGridRenderer - Manages Stock Card Grid Rendering, Value Flashing Animations, Beta Colors, and Filter/Sort Button UIs.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class CardGridRenderer {
  constructor(priceGrid, sectorPills, sortPriceBtn, sortBetaBtn = null, sortSizeBtn = null, sortSectorBtn = null, confirmModal = null) {
    this.priceGrid = priceGrid;
    this.sectorPills = sectorPills;
    this.sortPriceBtn = sortPriceBtn;
    this.sortSectorBtn = sortSectorBtn;
    this.confirmModal = confirmModal;
  }

  renderGrid(cards) {
    if (!this.priceGrid) return;
    this.priceGrid.innerHTML = '';
    cards.forEach(card => {
      this.priceGrid.appendChild(card);
    });
  }

  setPriceBoxStyle(priceBox, valueEl, currentPrice, prevPrice, direction = null) {
    if (!priceBox) return;

    let isUp = false;
    let isDown = false;

    if (direction === 'neutral') {
      // Explicit neutral/white on reset or baseline
      isUp = false;
      isDown = false;
    } else if (direction === 'up') {
      isUp = true;
    } else if (direction === 'down') {
      isDown = true;
    } else if (Number(currentPrice) === 100) {
      // Minimum price floor remains red
      isDown = true;
    } else if (prevPrice !== undefined && prevPrice !== null && !isNaN(prevPrice)) {
      const cur = Number(currentPrice);
      const prev = Number(prevPrice);
      if (cur > prev) {
        isUp = true;
      } else if (cur < prev) {
        isDown = true;
      }
    }

    priceBox.classList.remove('price-up', 'price-down', 'price-neutral');

    if (isUp) {
      priceBox.classList.add('price-up');
      priceBox.style.setProperty('background-color', 'rgba(16, 185, 129, 0.18)', 'important');
      priceBox.style.setProperty('border', '1.5px solid rgba(16, 185, 129, 0.5)', 'important');
      priceBox.style.setProperty('box-shadow', '0 0 14px rgba(16, 185, 129, 0.25)', 'important');
      if (valueEl) {
        valueEl.style.setProperty('color', '#34d399', 'important');
        valueEl.style.setProperty('text-shadow', '0 0 10px rgba(52, 211, 153, 0.5)', 'important');
      }
    } else if (isDown) {
      priceBox.classList.add('price-down');
      priceBox.style.setProperty('background-color', 'rgba(239, 68, 68, 0.18)', 'important');
      priceBox.style.setProperty('border', '1.5px solid rgba(239, 68, 68, 0.5)', 'important');
      priceBox.style.setProperty('box-shadow', '0 0 14px rgba(239, 68, 68, 0.25)', 'important');
      if (valueEl) {
        valueEl.style.setProperty('color', '#f87171', 'important');
        valueEl.style.setProperty('text-shadow', '0 0 10px rgba(248, 113, 113, 0.5)', 'important');
      }
    } else {
      priceBox.classList.add('price-neutral');
      priceBox.style.setProperty('background-color', '#e5e7eb', 'important');
      priceBox.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.1)', 'important');
      priceBox.style.setProperty('box-shadow', 'none', 'important');
      if (valueEl) {
        valueEl.style.setProperty('color', '#111827', 'important');
        valueEl.style.setProperty('text-shadow', 'none', 'important');
      }
    }
  }

  updateCardValue(card, price, direction, prevPrice, shouldAnimate = true) {
    const valueEl = card.querySelector('.card-value');
    const priceBox = card.querySelector('.price-box');
    if (!valueEl) return;
    
    valueEl.textContent = price.toLocaleString('en-US');
    this.setPriceBoxStyle(priceBox, valueEl, price, prevPrice, direction);

    if (shouldAnimate && direction) {
      valueEl.classList.remove('flash-up', 'flash-down');
      void valueEl.offsetWidth; // Reflow to restart keyframe animation
      if (direction === 'up') {
        valueEl.classList.add('flash-up');
      } else if (direction === 'down') {
        valueEl.classList.add('flash-down');
      }

      setTimeout(() => {
        valueEl.classList.remove('flash-up', 'flash-down');
      }, 300);
    }
  }

  clearAllCardAnimations(cards) {
    cards.forEach(card => {
      const valueEl = card.querySelector('.card-value');
      if (valueEl) valueEl.classList.remove('flash-up', 'flash-down');
    });
  }

  applyPriceColors(cards, boardStocks, masterStocks, initialPrices) {
    if (!cards || !Array.isArray(cards)) return;

    cards.forEach(card => {
      const iconEl = card.querySelector('.card-icon');
      if (!iconEl) return;
      const symbol = iconEl.textContent.trim();
      const valueEl = card.querySelector('.card-value');
      const priceBox = card.querySelector('.price-box');
      if (!valueEl || !priceBox) return;

      const stock = boardStocks ? boardStocks[symbol] : null;
      const currentPrice = stock ? stock.value : parseFloat(card.getAttribute('data-price') || 0);

      let direction = null;
      let prevPrice = null;

      if (stock) {
        if (stock.direction) {
          direction = stock.direction;
        } else if (stock.oldValue !== null && stock.oldValue !== undefined) {
          prevPrice = stock.oldValue;
          if (stock.value > stock.oldValue) direction = 'up';
          else if (stock.value < stock.oldValue) direction = 'down';
          else if (stock.value === 100) direction = 'down';
        } else if (stock.value === 100) {
          direction = 'down';
        } else {
          // Reset or initial baseline: white
          direction = 'neutral';
        }
      }

      this.setPriceBoxStyle(priceBox, valueEl, currentPrice, prevPrice, direction);
    });
  }

  applyBetaColors(cards) {
    cards.forEach(card => {
      const betaEl = card.querySelector('.card-beta');
      if (betaEl) {
        const beta = parseFloat(card.getAttribute('data-beta'));
        const style = card.className.includes('price-card') ? this.calculateBetaColor(beta) : { color: '#fff', shadow: 'none' };
        betaEl.style.color = style.color;
        betaEl.style.textShadow = style.shadow;
      }
    });
  }

  calculateBetaColor(beta) {
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

  updateSortButtonsUI(sortStates) {
    const buttons = [
      { btn: this.sortPriceBtn, type: 'PRICE', label: 'Price' }
    ];

    buttons.forEach(({ btn, type, label }) => {
      if (!btn) return;
      const state = sortStates[type];
      if (state.enabled) {
        btn.classList.add('active');
        const icon = state.dir === 'DESC' ? '▼' : '▲';
        btn.innerHTML = `<span class="sort-label">${label}</span><span class="sort-icon">${icon}</span>`;
      } else {
        btn.classList.remove('active');
        btn.innerHTML = `<span class="sort-label">${label}</span><span class="sort-icon">↕</span>`;
      }
    });

    if (this.sortSectorBtn) {
      if (sortStates.SECTOR.enabled) {
        this.sortSectorBtn.classList.add('active');
      } else {
        this.sortSectorBtn.classList.remove('active');
      }
      this.sortSectorBtn.innerHTML = `<span class="sort-label" style="justify-content: center; width: 100%;">Sector</span>`;
    }
  }

  updateSectorPillsUI(selectedSectors) {
    if (!this.sectorPills) return;
    this.sectorPills.querySelectorAll('.pill').forEach(pill => {
      const value = pill.getAttribute('data-value');
      if (selectedSectors.has(value)) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  updateSizePillsUI(selectedSizes) {
    const sizePills = document.getElementById('sizePills');
    if (!sizePills) return;
    sizePills.querySelectorAll('.pill').forEach(pill => {
      const value = pill.getAttribute('data-value');
      if (selectedSizes.has(value)) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  ensureViewGraphButtons() {
    if (!this.priceGrid) return;
    const cards = Array.from(this.priceGrid.querySelectorAll('.price-card'));
    cards.forEach(card => {
      let viewGraphBtn = card.querySelector('.view-graph-btn');
      const symbolIcon = card.querySelector('.card-icon');
      const symbolGroup = symbolIcon ? symbolIcon.closest('.flex') : null;
      if (!viewGraphBtn && symbolGroup && symbolGroup.parentElement) {
        viewGraphBtn = document.createElement('span');
        viewGraphBtn.className = 'view-graph-btn ml-1 sm:ml-2';
        viewGraphBtn.textContent = 'View Graph';
        symbolGroup.parentElement.appendChild(viewGraphBtn);
      }
    });
  }
}
