class MarketRenderer {
  constructor() {
    this.priceGrid = document.getElementById('priceGrid');
    this.sectorPills = document.getElementById('sectorPills');
    this.sortPriceBtn = document.getElementById('sortPriceBtn');
    this.sortBetaBtn = document.getElementById('sortBetaBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.resetMarketBtn = document.getElementById('resetMarketBtn');
    this.stockChartCanvas = document.getElementById('stockChart');
    
    // Modal components
    this.chartModal = document.getElementById('chartModal');
    this.closeModalBtn = document.getElementById('closeModalBtn');
    this.modalStockIcon = document.getElementById('modalStockIcon');
    this.modalStockSymbol = document.getElementById('modalStockSymbol');
    this.modalStockSector = document.getElementById('modalStockSector');
    this.statStartPrice = document.getElementById('statStartPrice');
    this.statPrice = document.getElementById('statPrice');
    this.statBeta = document.getElementById('statBeta');
    this.statChange = document.getElementById('statChange');

    // Confirm Dialog Modal components
    this.confirmModal = document.getElementById('confirmModal');
  }

  renderGrid(cards) {
    this.priceGrid.innerHTML = '';
    cards.forEach(card => {
      this.priceGrid.appendChild(card);
    });
  }

  updateCardValue(card, price, direction) {
    const valueEl = card.querySelector('.card-value');
    valueEl.textContent = price.toLocaleString('en-US');
    
    valueEl.classList.remove('flash-up', 'flash-down');
    void valueEl.offsetWidth; // Reflow to restart keyframes
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

  applyBetaColors(cards) {
    cards.forEach(card => {
      const betaEl = card.querySelector('.card-beta');
      if (betaEl) {
        const beta = parseFloat(card.getAttribute('data-beta'));
        const style = MarketState.calculateBetaColor(beta);
        betaEl.style.color = style.color;
        betaEl.style.textShadow = style.shadow;
      }
    });
  }

  updateSortButtonsUI(activeSort) {
    const priceIcon = this.sortPriceBtn.querySelector('.sort-icon');
    const betaIcon = this.sortBetaBtn.querySelector('.sort-icon');
    
    if (activeSort.type === 'PRICE') {
      this.sortPriceBtn.classList.add('active');
      priceIcon.textContent = activeSort.dir === 'DESC' ? '▼' : '▲';
      
      this.sortBetaBtn.classList.remove('active');
      betaIcon.textContent = '↕';
    } else if (activeSort.type === 'BETA') {
      this.sortBetaBtn.classList.add('active');
      betaIcon.textContent = activeSort.dir === 'DESC' ? '▼' : '▲';
      
      this.sortPriceBtn.classList.remove('active');
      priceIcon.textContent = '↕';
    } else {
      this.sortPriceBtn.classList.remove('active');
      priceIcon.textContent = '↕';
      
      this.sortBetaBtn.classList.remove('active');
      betaIcon.textContent = '↕';
    }
  }

  updateSectorPillsUI(selectedSectors) {
    this.sectorPills.querySelectorAll('.pill').forEach(pill => {
      const value = pill.getAttribute('data-value');
      if (selectedSectors.has(value)) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  openChartModal(symbol, sector, price, beta, sectorClass, metrics) {
    this.modalStockSymbol.textContent = symbol;
    this.modalStockSector.textContent = sector;
    this.statPrice.textContent = price.toLocaleString('en-US');
    
    this.statBeta.textContent = beta.toFixed(2);
    const betaStyle = MarketState.calculateBetaColor(beta);
    this.statBeta.style.color = betaStyle.color;
    this.statBeta.style.textShadow = betaStyle.shadow;
    
    const sectorIcons = {
      'FINCIAL': '🏦',
      'CONSUMP': '🛍️',
      'RESOURCE': '⚡',
      'INDUS': '⚙️',
      'TECH': '💻',
      'PROPCON': '🏗️',
      'AGRO': '🌱',
      'SERVICE': '🛎️'
    };
    this.modalStockIcon.textContent = sectorIcons[sector] || '📈';
    this.modalStockIcon.className = `modal-stock-icon ${sectorClass}`;
    
    this.statStartPrice.textContent = metrics.initialPrice.toLocaleString('en-US');
    
    if (price > metrics.initialPrice) {
      this.statPrice.className = 'stat-value positive';
      this.statChange.textContent = `+${metrics.changePct.toFixed(1)}%`;
      this.statChange.className = 'stat-value positive';
    } else if (price < metrics.initialPrice) {
      this.statPrice.className = 'stat-value negative';
      this.statChange.textContent = `${metrics.changePct.toFixed(1)}%`;
      this.statChange.className = 'stat-value negative';
    } else {
      this.statPrice.className = 'stat-value';
      this.statChange.textContent = '0.0%';
      this.statChange.className = 'stat-value';
    }
    
    this.chartModal.style.display = 'flex';
    setTimeout(() => {
      this.chartModal.classList.add('show');
      this.drawChart(metrics.history);
    }, 10);
  }

  closeChartModal() {
    this.chartModal.classList.remove('show');
    setTimeout(() => {
      this.chartModal.style.display = 'none';
    }, 300);
  }

  openConfirmModal() {
    this.confirmModal.style.display = 'flex';
    setTimeout(() => {
      this.confirmModal.classList.add('show');
    }, 10);
  }

  closeConfirmModal() {
    this.confirmModal.classList.remove('show');
    setTimeout(() => {
      this.confirmModal.style.display = 'none';
    }, 300);
  }

  drawChart(history) {
    const canvas = this.stockChartCanvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = 250 * dpr;
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = 250;
    ctx.clearRect(0, 0, width, height);
    
    const data = history.length === 1 ? [history[0], history[0]] : history;
    const displayData = data.slice(-20);
    
    const initialVal = displayData[0];
    const currentVal = displayData[displayData.length - 1];
    const isPositive = currentVal >= initialVal;
    
    const strokeColor = isPositive ? '#2dcc86' : '#ef4566';
    const shadowColor = isPositive ? 'rgba(45, 204, 134, 0.2)' : 'rgba(239, 69, 102, 0.2)';
    
    const minVal = Math.min(...displayData) * 0.98;
    const maxVal = Math.max(...displayData) * 1.02;
    const range = maxVal - minVal === 0 ? 100 : maxVal - minVal;
    
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
      
      ctx.fillStyle = '#b3b6c1';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      const labelVal = maxVal - (range / 4) * i;
      ctx.fillText(Math.round(labelVal).toLocaleString('en-US'), padding - 10, y + 3);
    }
    
    const startPrice = history[0];
    const startY = padding + chartHeight - ((startPrice - minVal) / range) * chartHeight;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padding, startY);
    ctx.lineTo(width - padding, startY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Start: ${startPrice.toLocaleString('en-US')}`, padding + 8, startY - 6);
    
    ctx.textAlign = 'center';
    ctx.fillStyle = '#b3b6c1';
    ctx.font = '10px Inter, sans-serif';
    
    const numPoints = displayData.length;
    const xStep = chartWidth / (numPoints - 1);
    
    for (let i = 0; i < numPoints; i++) {
      const x = padding + xStep * i;
      let label = '';
      if (numPoints <= 8 || i === 0 || i === numPoints - 1 || i === Math.floor(numPoints / 2)) {
        if (i === 0 && history.length === displayData.length) {
          label = 'Start';
        } else {
          const actualIndex = history.length - displayData.length + i;
          label = `#${actualIndex}`;
        }
      }
      if (label) {
        ctx.fillText(label, x, height - padding + 18);
      }
    }
    
    const coords = displayData.map((p, i) => {
      return {
        x: padding + xStep * i,
        y: padding + chartHeight - ((p - minVal) / range) * chartHeight
      };
    });
    
    ctx.beginPath();
    ctx.moveTo(coords[0].x, coords[0].y);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i].x, coords[i].y);
    }
    
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    ctx.beginPath();
    ctx.moveTo(coords[0].x, height - padding);
    ctx.lineTo(coords[0].x, coords[0].y);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i].x, coords[i].y);
    }
    ctx.lineTo(coords[coords.length - 1].x, height - padding);
    ctx.closePath();
    
    const fillGradient = ctx.createLinearGradient(0, padding, 0, height - padding);
    fillGradient.addColorStop(0, shadowColor);
    fillGradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fillGradient;
    ctx.fill();
    
    coords.forEach((coord, i) => {
      ctx.beginPath();
      ctx.arc(coord.x, coord.y, i === coords.length - 1 ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = i === coords.length - 1 ? strokeColor : '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
    });
  }
}
