/**
 * CardGridRenderer - Manages Stock Card Grid Rendering, Value Flashing Animations, Beta Colors, Filter UIs, and Dialog Modals.
 */
export class CardGridRenderer {
  constructor(priceGrid, sectorPills, sortPriceBtn, sortBetaBtn, sortSectorBtn, confirmModal) {
    this.priceGrid = priceGrid;
    this.sectorPills = sectorPills;
    this.sortPriceBtn = sortPriceBtn;
    this.sortBetaBtn = sortBetaBtn;
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

  updateCardValue(card, price, direction, startPrice) {
    const valueEl = card.querySelector('.card-value');
    const priceBox = card.querySelector('.price-box');
    if (!valueEl) return;
    
    valueEl.textContent = price.toLocaleString('en-US');
    
    if (priceBox) {
      priceBox.classList.remove('price-up', 'price-down', 'price-neutral');
      const basePrice = (startPrice !== undefined && startPrice !== null) ? startPrice : price;
      
      if (price > basePrice) {
        priceBox.classList.add('price-up');
        priceBox.style.setProperty('background-color', 'rgba(16, 185, 129, 0.18)', 'important');
        priceBox.style.setProperty('border', '1.5px solid rgba(16, 185, 129, 0.5)', 'important');
        priceBox.style.setProperty('box-shadow', '0 0 14px rgba(16, 185, 129, 0.25)', 'important');
        valueEl.style.setProperty('color', '#34d399', 'important');
        valueEl.style.setProperty('text-shadow', '0 0 10px rgba(52, 211, 153, 0.5)', 'important');
      } else if (price < basePrice) {
        priceBox.classList.add('price-down');
        priceBox.style.setProperty('background-color', 'rgba(239, 68, 68, 0.18)', 'important');
        priceBox.style.setProperty('border', '1.5px solid rgba(239, 68, 68, 0.5)', 'important');
        priceBox.style.setProperty('box-shadow', '0 0 14px rgba(239, 68, 68, 0.25)', 'important');
        valueEl.style.setProperty('color', '#f87171', 'important');
        valueEl.style.setProperty('text-shadow', '0 0 10px rgba(248, 113, 113, 0.5)', 'important');
      } else {
        priceBox.classList.add('price-neutral');
        priceBox.style.setProperty('background-color', '#e5e7eb', 'important');
        priceBox.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.1)', 'important');
        priceBox.style.setProperty('box-shadow', 'none', 'important');
        valueEl.style.setProperty('color', '#111827', 'important');
        valueEl.style.setProperty('text-shadow', 'none', 'important');
      }
    }

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

      // Resolve baseline starting price
      let startPrice = initialPrices ? initialPrices[symbol] : undefined;
      if (startPrice === undefined && stock) {
        startPrice = stock.startValue !== undefined ? stock.startValue : (stock.history ? stock.history[0] : undefined);
      }
      if (startPrice === undefined && masterStocks && masterStocks[symbol]) {
        const master = masterStocks[symbol];
        if (Array.isArray(master.steps) && master.startStep > 0) {
          startPrice = master.steps[master.startStep - 1];
        }
      }
      if (startPrice === undefined) {
        startPrice = currentPrice;
      }

      const prevPrice = stock ? (stock.oldValue !== null && stock.oldValue !== undefined ? stock.oldValue : startPrice) : startPrice;

      priceBox.classList.remove('price-up', 'price-down', 'price-neutral');

      if (currentPrice > startPrice || (currentPrice === startPrice && currentPrice > prevPrice)) {
        priceBox.classList.add('price-up');
        priceBox.style.setProperty('background-color', 'rgba(16, 185, 129, 0.18)', 'important');
        priceBox.style.setProperty('border', '1.5px solid rgba(16, 185, 129, 0.5)', 'important');
        priceBox.style.setProperty('box-shadow', '0 0 14px rgba(16, 185, 129, 0.25)', 'important');
        valueEl.style.setProperty('color', '#34d399', 'important');
        valueEl.style.setProperty('text-shadow', '0 0 10px rgba(52, 211, 153, 0.5)', 'important');
      } else if (currentPrice < startPrice || (currentPrice === startPrice && currentPrice < prevPrice)) {
        priceBox.classList.add('price-down');
        priceBox.style.setProperty('background-color', 'rgba(239, 68, 68, 0.18)', 'important');
        priceBox.style.setProperty('border', '1.5px solid rgba(239, 68, 68, 0.5)', 'important');
        priceBox.style.setProperty('box-shadow', '0 0 14px rgba(239, 68, 68, 0.25)', 'important');
        valueEl.style.setProperty('color', '#f87171', 'important');
        valueEl.style.setProperty('text-shadow', '0 0 10px rgba(248, 113, 113, 0.5)', 'important');
      } else {
        priceBox.classList.add('price-neutral');
        priceBox.style.setProperty('background-color', '#e5e7eb', 'important');
        priceBox.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.1)', 'important');
        priceBox.style.setProperty('box-shadow', 'none', 'important');
        valueEl.style.setProperty('color', '#111827', 'important');
        valueEl.style.setProperty('text-shadow', 'none', 'important');
      }
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
      { btn: this.sortPriceBtn, type: 'PRICE', label: 'Price' },
      { btn: this.sortBetaBtn, type: 'BETA', label: 'Beta' }
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

  openConfirmModal() {
    if (!this.confirmModal) return;
    this.confirmModal.style.display = 'flex';
    setTimeout(() => {
      this.confirmModal.classList.add('show');
    }, 10);
  }

  closeConfirmModal() {
    if (!this.confirmModal) return;
    this.confirmModal.classList.remove('show');
    setTimeout(() => {
      this.confirmModal.style.display = 'none';
    }, 300);
  }

  showErrorAlert(title, text) {
    if (window.Swal) {
      window.Swal.fire({
        icon: 'error',
        title: title,
        text: text,
        background: '#0b0f19',
        color: '#f8fafc',
        iconColor: '#ef4444',
        confirmButtonText: 'OK',
        customClass: {
          popup: 'trade-alert-popup',
          title: 'trade-alert-title',
          htmlContainer: 'trade-alert-text',
          confirmButton: 'trade-alert-error-btn'
        },
        buttonsStyling: false
      });
    } else {
      alert(`${title}\n${text}`);
    }
  }

  showSuccessAlert(title, text) {
    if (window.Swal) {
      window.Swal.fire({
        icon: 'success',
        title: title,
        text: text,
        background: '#0b0f19',
        color: '#f8fafc',
        iconColor: '#2563eb',
        confirmButtonText: 'OK',
        customClass: {
          popup: 'trade-alert-popup',
          title: 'trade-alert-title',
          htmlContainer: 'trade-alert-text',
          confirmButton: 'trade-alert-ok-btn'
        },
        buttonsStyling: false
      });
    } else {
      alert(`${title}\n${text}`);
    }
  }

  showConfirmAlert(title, text, confirmText = 'YES', cancelText = 'NO') {
    if (window.Swal) {
      return window.Swal.fire({
        icon: 'question',
        title: title,
        text: text,
        background: '#0b0f19',
        color: '#f8fafc',
        iconColor: '#10b981',
        showCancelButton: true,
        confirmButtonText: confirmText,
        cancelButtonText: cancelText,
        customClass: {
          popup: 'trade-alert-popup',
          title: 'trade-alert-title',
          htmlContainer: 'trade-alert-text',
          confirmButton: 'trade-alert-ok-btn',
          cancelButton: 'trade-alert-cancel-btn',
          actions: 'trade-alert-actions'
        },
        buttonsStyling: false
      });
    } else {
      const confirmed = confirm(`${title}\n${text}`);
      return Promise.resolve({ isConfirmed: confirmed });
    }
  }
}
