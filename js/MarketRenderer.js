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

    // Role & Room Controller Elements
    this.roleController = document.getElementById('roleController');
    this.userRoleBadge = document.getElementById('userRoleBadge');
    this.userRoomCodeBadge = document.getElementById('userRoomCodeBadge');
    this.spectatorToggleBtn = document.getElementById('spectatorToggleBtn');

    // Pending Orders UI Elements
    this.gmPendingOrdersSection = document.getElementById('gmPendingOrdersSection');
    this.gmPendingOrdersBody = document.getElementById('gmPendingOrdersBody');
    this.gmPlayerSalarySection = document.getElementById('gmPlayerSalarySection');
    this.gmPlayerSalaryBody = document.getElementById('gmPlayerSalaryBody');
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

  updateRoomCodeDisplay(roomCode) {
    if (this.userRoomCodeBadge) {
      this.userRoomCodeBadge.textContent = roomCode ? roomCode.toUpperCase() : '-';
    }
  }

  updateControlsVisibility(role, playerName) {
    const isMaster = (role === 'game_master');
    
    if (this.userRoleBadge) {
      this.userRoleBadge.textContent = isMaster ? 'GM' : (playerName || 'Player_1');
      if (isMaster) {
        this.userRoleBadge.className = 'text-[10px] md:text-xs font-black tracking-widest uppercase text-red-400';
      } else {
        this.userRoleBadge.className = 'text-[10px] md:text-xs font-black tracking-widest uppercase text-emerald-400';
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
      if (mainNavTabs) mainNavTabs.style.setProperty('display', 'none', 'important');
    } else {
      if (mainNavTabs) mainNavTabs.style.setProperty('display', 'flex', 'important');
    }
  }

  updateSpectatorButtonUI(isSpectating) {
    if (this.userRoleBadge) {
      if (isSpectating) {
        this.userRoleBadge.textContent = 'GM (Spectating)';
        this.userRoleBadge.className = 'text-[10px] md:text-xs font-black tracking-widest uppercase text-orange-400';
      } else {
        this.userRoleBadge.textContent = 'Game Master';
        this.userRoleBadge.className = 'text-[10px] md:text-xs font-black tracking-widest uppercase text-red-400';
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
      tabMarketBtn.className = "w-1/2 flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-active transition-all uppercase tracking-wider";
      tabPortBtn.className = "w-1/2 flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-inactive transition-all uppercase tracking-wider";
      marketTabContent.style.display = 'block';
      portTabContent.style.display = 'none';
      if (onTabChange) onTabChange('market');
    });
    
    tabPortBtn.addEventListener('click', () => {
      tabPortBtn.className = "w-1/2 flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-active transition-all uppercase tracking-wider";
      tabMarketBtn.className = "w-1/2 flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-inactive transition-all uppercase tracking-wider";
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
  updateGMPlayerSalaryUI(members, onPaySalary) { this.portfolioRenderer.updateGMPlayerSalaryUI(this.gmPlayerSalaryBody, members, onPaySalary); }
  updatePlayerPendingOrdersUI(orders, uid) { this.portfolioRenderer.updatePlayerPendingOrdersUI(orders, uid); }
}
