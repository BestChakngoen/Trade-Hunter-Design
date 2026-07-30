/**
 * ChartRenderer - Handles HTML5 Canvas 2D Trendline Drawing, Grid Rendering, Baseline Tracing, and Interactive Timeline Events.
 */
export class ChartRenderer {
  constructor(rendererRef) {
    this.rendererRef = rendererRef;
  }

  drawCardChart(canvas, history, activeIndex = -1) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = 145 * dpr;
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = 145;
    ctx.clearRect(0, 0, width, height);
    
    if (!history || history.length === 0) return;
    const data = history.length === 1 ? [history[0], history[0]] : history;
    const displayData = data.slice(-15);
    
    const initialVal = displayData[0];
    const currentVal = displayData[displayData.length - 1];
    const isPositive = currentVal >= initialVal;
    
    const strokeColor = isPositive ? '#2dcc86' : '#ef4566';
    const shadowColor = isPositive ? 'rgba(45, 204, 134, 0.12)' : 'rgba(239, 69, 102, 0.12)';
    
    const minVal = Math.min(...displayData) * 0.98;
    const maxVal = Math.max(...displayData) * 1.02;
    const range = maxVal - minVal === 0 ? 100 : maxVal - minVal;
    
    const paddingLeft = 38;
    const paddingRight = 15;
    const paddingTop = 15;
    const paddingBottom = 25;
    
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    
    // 1. Draw horizontal grid lines (Y-axis Grid)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 2; i++) {
      const y = paddingTop + (chartHeight / 2) * i;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.stroke();
      
      ctx.fillStyle = '#6b7280';
      ctx.font = '8px Inter, sans-serif';
      ctx.textAlign = 'right';
      const labelVal = maxVal - (range / 2) * i;
      ctx.fillText(Math.round(labelVal).toLocaleString('en-US'), paddingLeft - 6, y + 3);
    }
    
    const numPoints = displayData.length;
    const xStep = chartWidth / (numPoints - 1);
    
    const coords = displayData.map((p, i) => {
      return {
        x: paddingLeft + xStep * i,
        y: paddingTop + chartHeight - ((p - minVal) / range) * chartHeight
      };
    });
    
    const startPrice = history[0];
    
    // Save chart coordinates and data properties inside the DOM element for interactivity
    canvas.chartData = {
      coords: coords,
      displayData: displayData,
      history: history,
      startPrice: startPrice,
      strokeColor: strokeColor,
      isPositive: isPositive
    };
    
    // 2. Draw Baseline (Starting Price) Line
    if (startPrice >= minVal && startPrice <= maxVal) {
      const startY = paddingTop + chartHeight - ((startPrice - minVal) / range) * chartHeight;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(paddingLeft, startY);
      ctx.lineTo(width - paddingRight, startY);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '7px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Start: ${startPrice.toLocaleString('en-US')}`, paddingLeft + 6, startY - 4);
    }
    
    // 3. Draw gradient fill area under the curve
    if (coords.length > 1) {
      ctx.beginPath();
      ctx.moveTo(coords[0].x, height - paddingBottom);
      for (let i = 0; i < coords.length; i++) {
        ctx.lineTo(coords[i].x, coords[i].y);
      }
      ctx.lineTo(coords[coords.length - 1].x, height - paddingBottom);
      ctx.closePath();
      
      const fillGradient = ctx.createLinearGradient(0, paddingTop, 0, height - paddingBottom);
      fillGradient.addColorStop(0, shadowColor);
      fillGradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fillGradient;
      ctx.fill();
    }

    // 4. Draw main trend line
    ctx.beginPath();
    ctx.moveTo(coords[0].x, coords[0].y);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i].x, coords[i].y);
    }
    
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    
    // 5. Draw X-axis labels
    ctx.fillStyle = '#6b7280';
    ctx.font = '8px Inter, sans-serif';
    ctx.textAlign = 'center';
    
    const stepInterval = Math.max(1, Math.floor(numPoints / 5));
    for (let i = 0; i < numPoints; i += stepInterval) {
      const coord = coords[i];
      if (coord) {
        const roundNum = history.length - numPoints + i;
        const label = roundNum === 0 ? 'Start' : `R${roundNum}`;
        ctx.fillText(label, coord.x, height - 8);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(coord.x, height - paddingBottom);
        ctx.lineTo(coord.x, height - paddingBottom + 3);
        ctx.stroke();
      }
    }
    if ((numPoints - 1) % stepInterval !== 0) {
      const coord = coords[numPoints - 1];
      const label = `R${history.length - 1}`;
      ctx.fillText(label, coord.x, height - 8);
    }

    // 6. Draw start & end dots
    coords.forEach((coord, i) => {
      if (i === coords.length - 1 || i === 0) {
        ctx.beginPath();
        ctx.arc(coord.x, coord.y, i === coords.length - 1 ? 4 : 3, 0, Math.PI * 2);
        ctx.fillStyle = i === coords.length - 1 ? strokeColor : '#ffffff';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = strokeColor;
        ctx.stroke();
      }
    });

    // 7. Draw timeline vertical tracker line & highlight circle
    if (activeIndex !== -1 && coords[activeIndex]) {
      const activeCoord = coords[activeIndex];
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(activeCoord.x, paddingTop);
      ctx.lineTo(activeCoord.x, height - paddingBottom);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.beginPath();
      ctx.arc(activeCoord.x, activeCoord.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = isPositive ? 'rgba(45, 204, 134, 0.25)' : 'rgba(239, 69, 102, 0.25)';
      ctx.fill();
      
      ctx.beginPath();
      ctx.arc(activeCoord.x, activeCoord.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      
      const priceText = displayData[activeIndex].toLocaleString('en-US');
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px Inter, sans-serif';
      ctx.textAlign = 'center';
      
      let alignX = activeCoord.x;
      if (activeCoord.x < paddingLeft + 30) alignX = paddingLeft + 30;
      if (activeCoord.x > width - paddingRight - 30) alignX = width - paddingRight - 30;
      
      ctx.fillText(priceText, alignX, paddingTop - 4);
    }
  }

  getClosestPointIndex(canvas, clientX) {
    if (!canvas.chartData || !canvas.chartData.coords) return -1;
    const rect = canvas.getBoundingClientRect();
    const xInCanvas = clientX - rect.left;
    
    let minDistance = Infinity;
    let closestIndex = -1;
    
    canvas.chartData.coords.forEach((coord, index) => {
      const dist = Math.abs(coord.x - xInCanvas);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = index;
      }
    });
    
    return closestIndex;
  }

  bindTimelineEvents(canvas, chartContainer, startPrice, beta) {
    const handleMove = (clientX) => {
      if (!canvas.chartData || !canvas.chartData.coords) return;
      const index = this.getClosestPointIndex(canvas, clientX);
      if (index === -1) return;
      
      const data = canvas.chartData.displayData;
      const history = canvas.chartData.history;
      
      const currentPrice = data[index];
      const roundNum = history.length - data.length + index;
      const changePct = startPrice === 0 ? 0 : ((currentPrice - startPrice) / startPrice) * 100;
      
      const currentEl = chartContainer.querySelector('.stat-current-price');
      const changeEl = chartContainer.querySelector('.stat-change-pct');
      
      if (currentEl) {
        currentEl.textContent = currentPrice.toLocaleString('en-US');
        currentEl.className = currentPrice > startPrice ? 'stat-current-price text-xs font-bold text-positive' :
                             currentPrice < startPrice ? 'stat-current-price text-xs font-bold text-negative' :
                             'stat-current-price text-xs font-bold text-neutral';
      }
      if (changeEl) {
        changeEl.textContent = `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}% (R${roundNum})`;
        changeEl.className = changePct > 0 ? 'stat-change-pct text-xs font-bold text-positive' :
                            changePct < 0 ? 'stat-change-pct text-xs font-bold text-negative' :
                            'stat-change-pct text-xs font-bold text-gray-400';
      }
      
      this.drawCardChart(canvas, history, index);
    };
    
    const handleEnd = () => {
      if (!canvas.chartData) return;
      const history = canvas.chartData.history;
      const currentPrice = history[history.length - 1];
      const changePct = startPrice === 0 ? 0 : ((currentPrice - startPrice) / startPrice) * 100;
      
      const currentEl = chartContainer.querySelector('.stat-current-price');
      const changeEl = chartContainer.querySelector('.stat-change-pct');
      
      if (currentEl) {
        currentEl.textContent = currentPrice.toLocaleString('en-US');
        currentEl.className = currentPrice > startPrice ? 'stat-current-price text-xs font-bold text-positive' :
                             currentPrice < startPrice ? 'stat-current-price text-xs font-bold text-negative' :
                             'stat-current-price text-xs font-bold text-neutral';
      }
      if (changeEl) {
        changeEl.textContent = `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%`;
        changeEl.className = changePct > 0 ? 'stat-change-pct text-xs font-bold text-positive' :
                            changePct < 0 ? 'stat-change-pct text-xs font-bold text-negative' :
                            'stat-change-pct text-xs font-bold text-gray-400';
      }
      
      this.drawCardChart(canvas, history);
    };
    
    // Mouse events
    canvas.addEventListener('mousemove', (e) => handleMove(e.clientX));
    canvas.addEventListener('mouseleave', () => handleEnd());
    
    // Touch events for Mobile support
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        e.preventDefault(); 
        handleMove(e.touches[0].clientX);
      }
    }, { passive: false });
    
    canvas.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) {
        e.preventDefault();
        handleMove(e.touches[0].clientX);
      }
    }, { passive: false });
    
    canvas.addEventListener('touchend', () => handleEnd());
  }

  toggleCardChart(card, history, startPrice, beta) {
    const chartContainer = card.querySelector('.chart-container');
    if (!chartContainer) return;
    
    const isShowing = chartContainer.style.display === 'block';
    const viewGraphBtn = card.querySelector('.view-graph-btn');
    
    if (isShowing) {
      chartContainer.style.height = '0';
      setTimeout(() => {
        chartContainer.style.display = 'none';
      }, 300);
      if (viewGraphBtn) {
        viewGraphBtn.classList.remove('active');
        viewGraphBtn.textContent = 'View Graph';
      }
    } else {
      chartContainer.style.display = 'block';
      if (viewGraphBtn) {
        viewGraphBtn.classList.add('active');
        viewGraphBtn.textContent = 'Hide Graph';
      }
      
      const currentPrice = history[history.length - 1] || startPrice;
      const changePct = startPrice === 0 ? 0 : ((currentPrice - startPrice) / startPrice) * 100;
      
      const startEl = chartContainer.querySelector('.stat-start-price');
      const currentEl = chartContainer.querySelector('.stat-current-price');
      const betaEl = chartContainer.querySelector('.stat-beta-price');
      const changeEl = chartContainer.querySelector('.stat-change-pct');
      
      if (startEl) startEl.textContent = startPrice.toLocaleString('en-US');
      if (currentEl) {
        currentEl.textContent = currentPrice.toLocaleString('en-US');
        currentEl.className = currentPrice > startPrice ? 'stat-current-price text-xs font-bold text-positive' :
                             currentPrice < startPrice ? 'stat-current-price text-xs font-bold text-negative' :
                             'stat-current-price text-xs font-bold text-neutral';
      }
      if (betaEl) {
        betaEl.textContent = beta.toFixed(2);
        const betaStyle = this.rendererRef ? this.rendererRef.calculateBetaColor(beta) : { color: '#fff', shadow: 'none' };
        betaEl.style.color = betaStyle.color;
        betaEl.style.textShadow = betaStyle.shadow;
      }
      if (changeEl) {
        changeEl.textContent = `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%`;
        changeEl.className = changePct > 0 ? 'stat-change-pct text-xs font-bold text-positive' :
                            changePct < 0 ? 'stat-change-pct text-xs font-bold text-negative' :
                            'stat-change-pct text-xs font-bold text-gray-400';
      }
      
      setTimeout(() => {
        chartContainer.style.height = 'auto';
        const canvas = chartContainer.querySelector('.stock-chart-canvas');
        if (canvas) {
          this.drawCardChart(canvas, history);
          this.bindTimelineEvents(canvas, chartContainer, startPrice, beta);
        }
      }, 10);
    }
  }
}
