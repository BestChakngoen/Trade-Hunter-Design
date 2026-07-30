import { ChartRenderer } from './renderers/ChartRenderer.js';
import { PortfolioRenderer } from './renderers/PortfolioRenderer.js';
import { CardGridRenderer } from './renderers/CardGridRenderer.js';

/**
 * MarketRenderer - Main Facade Renderer coordinating Canvas Charts, Portfolio UI, and Stock Card Grid modules.
 */
export class MarketRenderer {
  constructor() {
    this.pageShell = document.querySelector('.page-shell');
    this.priceGrid = document.getElementById('priceGrid');
    this.sectorPills = document.getElementById('sectorPills');
    this.sortPriceBtn = document.getElementById('sortPriceBtn');
    this.sortBetaBtn = document.getElementById('sortBetaBtn');
    this.sortSectorBtn = document.getElementById('sortSectorBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.resetMarketBtn = document.getElementById('resetMarketBtn');
    this.stockChartCanvas = document.getElementById('stockChart');
    
    // Lobby Screen Elements
    this.lobbyScreen = document.getElementById('lobbyScreen');
    this.lobbyForm = document.getElementById('lobbyForm');
    this.roomCodeInput = document.getElementById('roomCodeInput');
    
    // Confirm Dialog Modal components
    this.confirmModal = document.getElementById('confirmModal');

    // Role Controller Elements
    this.roleController = document.getElementById('roleController');
    this.userRoleBadge = document.getElementById('userRoleBadge');
    this.spectatorToggleBtn = document.getElementById('spectatorToggleBtn');

    // Pending Orders UI Elements
    this.gmPendingOrdersSection = document.getElementById('gmPendingOrdersSection');
    this.gmPendingOrdersBody = document.getElementById('gmPendingOrdersBody');
    this.playerPendingOrdersBody = document.getElementById('playerPendingOrdersBody');

    // Sub-renderers following Single Responsibility Principle
    this.chartRenderer = new ChartRenderer(this);
    this.portfolioRenderer = new PortfolioRenderer();
    this.cardGridRenderer = new CardGridRenderer(
      this.priceGrid,
      this.sectorPills,
      this.sortPriceBtn,
      this.sortBetaBtn,
      this.sortSectorBtn,
      this.confirmModal
    );
  }

  showLobby() {
    if (this.lobbyScreen) this.lobbyScreen.style.display = 'flex';
    if (this.pageShell) this.pageShell.style.display = 'none';
  }

  showDashboard() {
    if (this.lobbyScreen) this.lobbyScreen.style.display = 'none';
    if (this.pageShell) this.pageShell.style.display = 'block';
  }

  updateControlsVisibility(role) {
    const isMaster = (role === 'game_master');
    
    if (this.userRoleBadge) {
      this.userRoleBadge.textContent = isMaster ? 'Game Master' : 'Player';
      if (isMaster) {
        this.userRoleBadge.className = 'px-3 py-1 rounded-full text-[10px] md:text-xs font-black tracking-widest uppercase bg-red-950 text-red-400 border border-red-800 shadow-md';
      } else {
        this.userRoleBadge.className = 'px-3 py-1 rounded-full text-[10px] md:text-xs font-black tracking-widest uppercase bg-green-950 text-green-400 border border-green-800 shadow-md';
      }
    }

    const cards = Array.from(this.priceGrid.querySelectorAll('.price-card'));
    cards.forEach(card => {
      const controls = card.querySelector('.card-controls');
      if (controls) {
        controls.style.display = isMaster ? 'flex' : 'none';
      }
    });

    const dangerZone = document.querySelector('.danger-zone-section');
    if (dangerZone) {
      dangerZone.style.display = isMaster ? 'block' : 'none';
    }

    const mainNavTabs = document.getElementById('mainNavTabs');
    const marketTabContent = document.getElementById('marketTabContent');
    const portTabContent = document.getElementById('portTabContent');
    
    if (role === 'game_master') {
      if (mainNavTabs) mainNavTabs.style.display = 'none';
      if (marketTabContent) marketTabContent.style.display = 'block';
      if (portTabContent) portTabContent.style.display = 'none';
    } else {
      if (mainNavTabs) mainNavTabs.style.display = 'flex';
      
      const tabMarketBtn = document.getElementById('tabMarketBtn');
      const tabPortBtn = document.getElementById('tabPortBtn');
      if (tabMarketBtn && tabPortBtn) {
        tabMarketBtn.className = "flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-active transition-all uppercase tracking-wider";
        tabPortBtn.className = "flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-inactive transition-all uppercase tracking-wider";
      }
      if (marketTabContent) marketTabContent.style.display = 'block';
      if (portTabContent) portTabContent.style.display = 'none';
    }
  }

  updateSpectatorButtonUI(isSpectating) {
    if (!this.spectatorToggleBtn) return;
    if (isSpectating) {
      this.spectatorToggleBtn.textContent = '🛠️ Exit Spectator';
      this.spectatorToggleBtn.className = 'px-2.5 py-1 rounded-lg text-[9px] md:text-xs font-bold uppercase tracking-wider bg-orange-950 text-orange-400 border border-orange-850 hover:bg-orange-900 transition-all shadow-md';
      
      if (this.userRoleBadge) {
        this.userRoleBadge.textContent = 'GM (Spectating)';
        this.userRoleBadge.className = 'px-3 py-1 rounded-full text-[10px] md:text-xs font-black tracking-widest uppercase bg-orange-950/40 text-orange-300 border border-orange-900/60 shadow-md';
      }
    } else {
      this.spectatorToggleBtn.textContent = '👁️ View as Player';
      this.spectatorToggleBtn.className = 'px-2.5 py-1 rounded-lg text-[9px] md:text-xs font-bold uppercase tracking-wider bg-blue-950 text-blue-400 border border-blue-800 hover:bg-blue-900 transition-all shadow-md';
      
      if (this.userRoleBadge) {
        this.userRoleBadge.textContent = 'Game Master';
        this.userRoleBadge.className = 'px-3 py-1 rounded-full text-[10px] md:text-xs font-black tracking-widest uppercase bg-red-950 text-red-400 border border-red-800 shadow-md';
      }
    }
  }

  bindTabEvents(onTabChange) {
    const tabMarketBtn = document.getElementById('tabMarketBtn');
    const tabPortBtn = document.getElementById('tabPortBtn');
    const marketTabContent = document.getElementById('marketTabContent');
    const portTabContent = document.getElementById('portTabContent');
    
    if (!tabMarketBtn || !tabPortBtn) return;
    
    tabMarketBtn.addEventListener('click', () => {
      tabMarketBtn.className = "flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-active transition-all uppercase tracking-wider";
      tabPortBtn.className = "flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-inactive transition-all uppercase tracking-wider";
      marketTabContent.style.display = 'block';
      portTabContent.style.display = 'none';
      if (onTabChange) onTabChange('market');
    });
    
    tabPortBtn.addEventListener('click', () => {
      tabPortBtn.className = "flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-active transition-all uppercase tracking-wider";
      tabMarketBtn.className = "flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-inactive transition-all uppercase tracking-wider";
      marketTabContent.style.display = 'none';
      portTabContent.style.display = 'block';
      if (onTabChange) onTabChange('portfolio');
    });
  }

  // Card Grid Delegations
  renderGrid(cards) { this.cardGridRenderer.renderGrid(cards); }
  updateCardValue(card, price, direction) { this.cardGridRenderer.updateCardValue(card, price, direction); }
  clearAllCardAnimations(cards) { this.cardGridRenderer.clearAllCardAnimations(cards); }
  applyBetaColors(cards) { this.cardGridRenderer.applyBetaColors(cards); }
  calculateBetaColor(beta) { return this.cardGridRenderer.calculateBetaColor(beta); }
  updateSortButtonsUI(sortStates) { this.cardGridRenderer.updateSortButtonsUI(sortStates); }
  updateSectorPillsUI(selectedSectors) { this.cardGridRenderer.updateSectorPillsUI(selectedSectors); }
  ensureViewGraphButtons() { this.cardGridRenderer.ensureViewGraphButtons(); }
  openConfirmModal() { this.cardGridRenderer.openConfirmModal(); }
  closeConfirmModal() { this.cardGridRenderer.closeConfirmModal(); }
  showErrorAlert(title, text) { this.cardGridRenderer.showErrorAlert(title, text); }
  showSuccessAlert(title, text) { this.cardGridRenderer.showSuccessAlert(title, text); }

  // Chart Rendering Delegations
  drawCardChart(canvas, history, activeIndex = -1) { this.chartRenderer.drawCardChart(canvas, history, activeIndex); }
  bindTimelineEvents(canvas, chartContainer, startPrice, beta) { this.chartRenderer.bindTimelineEvents(canvas, chartContainer, startPrice, beta); }
  toggleCardChart(card, history, startPrice, beta) { this.chartRenderer.toggleCardChart(card, history, startPrice, beta); }

  // Portfolio & Orders Delegations
  updatePortfolioUI(stats, portfolio, boardStocks) { this.portfolioRenderer.updatePortfolioUI(stats, portfolio, boardStocks); }
  updateGMPendingOrdersUI(orders, onApprove, onReject) { this.portfolioRenderer.updateGMPendingOrdersUI(this.gmPendingOrdersBody, orders, onApprove, onReject); }
  updatePlayerPendingOrdersUI(orders, uid) { this.portfolioRenderer.updatePlayerPendingOrdersUI(orders, uid); }
}
