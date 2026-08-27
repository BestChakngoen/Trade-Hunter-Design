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
    this.sortSizeBtn = document.getElementById('sortSizeBtn');
    this.sortSectorBtn = document.getElementById('sortSectorBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.resetMarketBtn = document.getElementById('resetMarketBtn');
    this.stockChartCanvas = document.getElementById('stockChart');
    
    // Lobby Screen Elements
    this.lobbyScreen = document.getElementById('lobbyScreen');
    this.lobbyForm = document.getElementById('lobbyForm');
    this.roomCodeInput = document.getElementById('roomCodeInput');
    this.joinRoomBtn = document.getElementById('joinRoomBtn');
    
    // Role Selection Modal
    this.roleSelectionModal = document.getElementById('roleSelectionModal');
    this.roleOptGMBtn = document.getElementById('roleOptGMBtn');
    this.roleOptPlayerBtn = document.getElementById('roleOptPlayerBtn');
    this.roleOptCloseBtn = document.getElementById('roleOptCloseBtn');

    // Game Mode Selection Modal (GM) & Waiting Modal (Player)
    this.gameModeSelectionModal = document.getElementById('gameModeSelectionModal');
    this.gameModeBasicBtn = document.getElementById('gameModeBasicBtn');
    this.gameModeAdvanceBtn = document.getElementById('gameModeAdvanceBtn');
    this.waitingForGMModal = document.getElementById('waitingForGMModal');
    this.waitingRoomCodeBadge = document.getElementById('waitingRoomCodeBadge');
    
    // Room Full Alert Modal
    this.roomFullModal = document.getElementById('roomFullModal');
    this.roomFullOkBtn = document.getElementById('roomFullOkBtn');
    
    // Invalid Room Code Modal
    this.invalidRoomModal = document.getElementById('invalidRoomModal');
    this.invalidRoomCodeText = document.getElementById('invalidRoomCodeText');
    this.invalidRoomOkBtn = document.getElementById('invalidRoomOkBtn');
    
    // Confirm Dialog Modal components
    this.confirmModal = document.getElementById('confirmModal');

    // Role & Room Controller Elements
    this.roleController = document.getElementById('roleController');
    this.userRoleBadge = document.getElementById('userRoleBadge');
    this.userRoomCodeBadge = document.getElementById('userRoomCodeBadge');
    this.roomMembersBadge = document.getElementById('roomMembersBadge');
    this.spectatorToggleBtn = document.getElementById('spectatorToggleBtn');

    // Pending Orders UI Elements
    this.gmPendingOrdersSection = document.getElementById('gmPendingOrdersSection');
    this.gmPendingOrdersBody = document.getElementById('gmPendingOrdersBody');
    this.gmPlayerSalarySection = document.getElementById('gmPlayerSalarySection');
    this.gmPlayerSalaryBody = document.getElementById('gmPlayerSalaryBody');
    this.gmPlayerDividendSection = document.getElementById('gmPlayerDividendSection');
    this.gmPlayerDividendBody = document.getElementById('gmPlayerDividendBody');
    this.gmPlayerDebtInterestSection = document.getElementById('gmPlayerDebtInterestSection');
    this.gmPlayerDebtInterestBody = document.getElementById('gmPlayerDebtInterestBody');
    this.payAllDividendBtn = document.getElementById('payAllDividendBtn');
    this.debtTableBody = document.getElementById('debtTableBody');
    this.playerPendingOrdersBody = document.getElementById('playerPendingOrdersBody');

    // Sub-renderers following Single Responsibility Principle
    this.chartRenderer = new ChartRenderer(this);
    this.portfolioRenderer = new PortfolioRenderer();
    this.cardGridRenderer = new CardGridRenderer(
      this.priceGrid,
      this.sectorPills,
      this.sortPriceBtn,
      this.sortBetaBtn,
      this.sortSizeBtn,
      this.sortSectorBtn,
      this.confirmModal
    );
  }

  showLobby() {
    if (this.lobbyScreen) {
      this.lobbyScreen.style.display = 'flex';
      this.lobbyScreen.removeAttribute('aria-hidden');
    }
    if (this.pageShell) {
      this.pageShell.style.display = 'none';
      this.pageShell.setAttribute('aria-hidden', 'true');
    }
  }

  showDashboard() {
    if (this.lobbyScreen) {
      this.lobbyScreen.style.display = 'none';
      this.lobbyScreen.setAttribute('aria-hidden', 'true');
    }
    if (this.pageShell) {
      this.pageShell.style.display = 'block';
      this.pageShell.removeAttribute('aria-hidden');
    }
  }

  updateRoomCodeDisplay(roomCode) {
    if (this.userRoomCodeBadge) {
      this.userRoomCodeBadge.textContent = roomCode ? roomCode.toUpperCase() : '-';
    }
    if (this.waitingRoomCodeBadge) {
      this.waitingRoomCodeBadge.textContent = roomCode ? roomCode.toUpperCase() : '-';
    }
  }

  updateRoomMembersDisplay(memberCount, maxPlayers = 5) {
    if (!this.roomMembersBadge) return;
    if (memberCount >= maxPlayers) {
      this.roomMembersBadge.textContent = `${memberCount}/${maxPlayers} (FULL)`;
      this.roomMembersBadge.className = 'text-[10px] md:text-xs font-black tracking-widest uppercase text-red-400';
    } else {
      this.roomMembersBadge.textContent = `${memberCount}/${maxPlayers}`;
      this.roomMembersBadge.className = 'text-[10px] md:text-xs font-black tracking-widest uppercase text-purple-400';
    }
  }

  updateRoomMembersUI(members = {}, roomSettings = {}) {
    const memberCount = Object.keys(members || {}).length;
    const maxPlayers = (roomSettings && roomSettings.maxPlayers) ? roomSettings.maxPlayers : 5;
    this.updateRoomMembersDisplay(memberCount, maxPlayers);
  }

  updateControlsVisibility(role, playerName, gameMode = 'advance') {
    const isMaster = (role === 'game_master');
    const isBasicMode = (gameMode === 'basic');
    
    if (this.userRoleBadge) {
      const modeLabel = isBasicMode ? ' [BASIC]' : '';
      this.userRoleBadge.textContent = (isMaster ? 'Game Master' : (playerName || 'Player_1')) + modeLabel;
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

    this.updateHistoryControlsUI(isMaster);

    const mainNavTabs = document.getElementById('mainNavTabs');
    const tabPortBtn = document.getElementById('tabPortBtn');
    const tabMgmtBtn = document.getElementById('tabMgmtBtn');
    const tradeWidget = document.querySelector('.trade-widget-section');
    const marketTabContent = document.getElementById('marketTabContent');
    const portfolioTabContent = document.getElementById('portfolioTabContent');
    const mgmtTabContent = document.getElementById('mgmtTabContent');

    if (isBasicMode) {
      // Basic Mode: Hide ALL navigation tabs completely!
      if (mainNavTabs) mainNavTabs.style.setProperty('display', 'none', 'important');
      if (tradeWidget) tradeWidget.style.display = 'none';
      if (portfolioTabContent) portfolioTabContent.style.display = 'none';
      if (mgmtTabContent) mgmtTabContent.style.display = 'none';
      if (marketTabContent) marketTabContent.style.display = 'block';
    } else {
      // Advance Mode: Show standard navigation tabs
      if (mainNavTabs) mainNavTabs.style.setProperty('display', 'flex', 'important');
      if (tradeWidget) tradeWidget.style.display = 'block';
      if (role === 'game_master') {
        if (tabPortBtn) tabPortBtn.style.display = 'none';
        if (tabMgmtBtn) tabMgmtBtn.style.display = 'block';
      } else {
        if (tabPortBtn) tabPortBtn.style.display = 'block';
        if (tabMgmtBtn) tabMgmtBtn.style.display = 'none';
      }
    }
  }

  updateSpectatorButtonUI(isSpectating) {
    if (this.userRoleBadge) {
      if (isSpectating) {
        this.userRoleBadge.textContent = 'Game Master (Spectating)';
        this.userRoleBadge.className = 'text-[10px] md:text-xs font-black tracking-widest uppercase text-orange-400';
      } else {
        this.userRoleBadge.textContent = 'Game Master';
        this.userRoleBadge.className = 'text-[10px] md:text-xs font-black tracking-widest uppercase text-red-400';
      }
    }
  }

  updateHistoryControlsUI(isMaster, canUndo = null, canRedo = null) {
    const historyControls = document.getElementById('historyControls');
    const undoBtn = document.getElementById('undoActionBtn');
    const redoBtn = document.getElementById('redoActionBtn');

    const showUndo = (canUndo !== null) ? canUndo : (this.state ? this.state.canUndo() : false);
    const showRedo = (canRedo !== null) ? canRedo : (this.state ? this.state.canRedo() : false);

    if (historyControls) {
      historyControls.style.display = (isMaster && (showUndo || showRedo)) ? 'flex' : 'none';
    }
    if (undoBtn) {
      undoBtn.style.display = (isMaster && showUndo) ? 'inline-flex' : 'none';
    }
    if (redoBtn) {
      redoBtn.style.display = (isMaster && showRedo) ? 'inline-flex' : 'none';
    }
  }

  bindTabEvents(onTabChange) {
    const tabMarketBtn = document.getElementById('tabMarketBtn');
    const tabPortBtn = document.getElementById('tabPortBtn');
    const tabMgmtBtn = document.getElementById('tabMgmtBtn');
    const marketTabContent = document.getElementById('marketTabContent');
    const portTabContent = document.getElementById('portTabContent');
    const mgmtTabContent = document.getElementById('mgmtTabContent');
    
    if (tabMarketBtn) {
      tabMarketBtn.addEventListener('click', () => {
        tabMarketBtn.className = "w-1/2 flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-active transition-all uppercase tracking-wider";
        if (tabPortBtn) tabPortBtn.className = "w-1/2 flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-inactive transition-all uppercase tracking-wider";
        if (tabMgmtBtn) tabMgmtBtn.className = "w-1/2 flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-inactive transition-all uppercase tracking-wider relative";
        
        if (marketTabContent) marketTabContent.style.display = 'block';
        if (portTabContent) portTabContent.style.display = 'none';
        if (mgmtTabContent) mgmtTabContent.style.display = 'none';
        if (onTabChange) onTabChange('market');
      });
    }

    if (tabPortBtn) {
      tabPortBtn.addEventListener('click', () => {
        tabPortBtn.className = "w-1/2 flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-active transition-all uppercase tracking-wider";
        if (tabMarketBtn) tabMarketBtn.className = "w-1/2 flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-inactive transition-all uppercase tracking-wider";
        if (tabMgmtBtn) tabMgmtBtn.className = "w-1/2 flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-inactive transition-all uppercase tracking-wider relative";
        
        if (marketTabContent) marketTabContent.style.display = 'none';
        if (portTabContent) portTabContent.style.display = 'block';
        if (mgmtTabContent) mgmtTabContent.style.display = 'none';
        if (onTabChange) onTabChange('portfolio');
      });
    }

    if (tabMgmtBtn) {
      tabMgmtBtn.addEventListener('click', () => {
        tabMgmtBtn.className = "w-1/2 flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-active transition-all uppercase tracking-wider relative";
        if (tabMarketBtn) tabMarketBtn.className = "w-1/2 flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-inactive transition-all uppercase tracking-wider";
        if (tabPortBtn) tabPortBtn.className = "w-1/2 flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-inactive transition-all uppercase tracking-wider";
        
        if (marketTabContent) marketTabContent.style.display = 'none';
        if (portTabContent) portTabContent.style.display = 'none';
        if (mgmtTabContent) mgmtTabContent.style.display = 'block';
        if (onTabChange) onTabChange('management');
      });
    }
  }

  showTopToast(title, message, type = 'success', duration = 3800) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.style.cssText = 'position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 999999; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; width: 100%; max-width: 380px; padding: 0 16px;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    
    // Apple Dynamic Island Minimal SVG Badges & Colors
    let glowColor = '#30d158'; // Apple Green
    let iconSvg = `<svg style="width: 14px; height: 14px; color: ${glowColor};" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>`;
    let titleColor = '#30d158';
    
    if (type === 'rejected' || type === 'error') {
      glowColor = '#ff453a'; // Apple Red
      iconSvg = `<svg style="width: 14px; height: 14px; color: ${glowColor};" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`;
      titleColor = '#ff453a';
    } else if (type === 'warning' || type === 'gm') {
      glowColor = '#ffd60a'; // Apple Gold
      iconSvg = `<svg style="width: 14px; height: 14px; color: ${glowColor};" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>`;
      titleColor = '#ffd60a';
    } else if (type === 'success' || type === 'info') {
      glowColor = '#0a84ff'; // Apple Blue
      iconSvg = `<svg style="width: 14px; height: 14px; color: ${glowColor};" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>`;
      titleColor = '#64d2ff';
    }

    const appleContainerStyle = `
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      border-radius: 9999px;
      background: rgba(18, 18, 20, 0.88);
      border: 1px solid rgba(255, 255, 255, 0.12);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      box-shadow: 0 16px 36px -8px rgba(0, 0, 0, 0.7), 0 0 12px -2px ${glowColor}40;
      width: 100%;
      transition: transform 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.35s ease;
      transform: translateY(-24px) scale(0.92);
      opacity: 0;
    `;

    toast.style.cssText = appleContainerStyle;
    toast.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: ${glowColor}18; border: 1px solid ${glowColor}40; flex-shrink: 0;">
        ${iconSvg}
      </div>
      <div style="display: flex; flex-direction: column; min-width: 0; flex: 1;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: ${titleColor}; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;">${title}</span>
        </div>
        <span style="font-size: 11px; font-weight: 500; color: rgba(235, 235, 245, 0.85); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;">${message}</span>
      </div>
      <button class="toast-close-btn" style="background: rgba(255, 255, 255, 0.08); border: none; color: rgba(235, 235, 245, 0.6); font-size: 14px; font-weight: bold; cursor: pointer; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; line-height: 1; flex-shrink: 0; transition: background 0.2s;">&times;</button>
    `;

    // Enforce max 3 active toasts (dismiss oldest if > 3)
    const activeToasts = Array.from(container.children).filter(el => !el.classList.contains('dismissing'));
    if (activeToasts.length >= 3) {
      const oldestToast = activeToasts[0];
      if (oldestToast && typeof oldestToast._dismiss === 'function') {
        oldestToast._dismiss();
      } else if (oldestToast && oldestToast.parentNode) {
        oldestToast.parentNode.removeChild(oldestToast);
      }
    }

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.transform = 'translateY(0) scale(1)';
      toast.style.opacity = '1';
    });

    const closeBtn = toast.querySelector('.toast-close-btn');
    const dismiss = () => {
      toast.classList.add('dismissing');
      toast.style.transform = 'translateY(-24px) scale(0.92)';
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 350);
    };
    toast._dismiss = dismiss;

    if (closeBtn) closeBtn.addEventListener('click', dismiss);
    setTimeout(dismiss, duration);
  }

  // Card Grid Delegations
  renderGrid(cards) { this.cardGridRenderer.renderGrid(cards); }
  updateCardValue(card, price, direction, startPrice) { this.cardGridRenderer.updateCardValue(card, price, direction, startPrice); }
  clearAllCardAnimations(cards) { this.cardGridRenderer.clearAllCardAnimations(cards); }
  applyBetaColors(cards) { this.cardGridRenderer.applyBetaColors(cards); }
  applyPriceColors(cards, boardStocks, masterStocks, initialPrices) { this.cardGridRenderer.applyPriceColors(cards, boardStocks, masterStocks, initialPrices); }
  calculateBetaColor(beta) { return this.cardGridRenderer.calculateBetaColor(beta); }
  updateSortButtonsUI(sortStates) { this.cardGridRenderer.updateSortButtonsUI(sortStates); }
  updateSectorPillsUI(selectedSectors) { this.cardGridRenderer.updateSectorPillsUI(selectedSectors); }
  ensureViewGraphButtons() { this.cardGridRenderer.ensureViewGraphButtons(); }
  openConfirmModal() { this.cardGridRenderer.openConfirmModal(); }
  closeConfirmModal() { this.cardGridRenderer.closeConfirmModal(); }
  showErrorAlert(title, text) { this.cardGridRenderer.showErrorAlert(title, text); }
  showSuccessAlert(title, text) { this.cardGridRenderer.showSuccessAlert(title, text); }
  showConfirmAlert(title, text, confirmText, cancelText) { return this.cardGridRenderer.showConfirmAlert(title, text, confirmText, cancelText); }
  showAutoDismissModal(title, text, duration) { return this.cardGridRenderer.showAutoDismissModal(title, text, duration); }

  // Chart Rendering Delegations
  drawCardChart(canvas, history, activeIndex = -1) { this.chartRenderer.drawCardChart(canvas, history, activeIndex); }
  bindTimelineEvents(canvas, chartContainer, startPrice, beta) { this.chartRenderer.bindTimelineEvents(canvas, chartContainer, startPrice, beta); }
  toggleCardChart(card, history, startPrice, beta) { this.chartRenderer.toggleCardChart(card, history, startPrice, beta); }

  triggerShakeCodeBox() {
    // 1. เคลียร์ข้อความในช่องกรอกให้อัตโนมัติและโฟกัสช่องพิมพ์
    if (this.roomCodeInput) {
      this.roomCodeInput.value = '';
      this.roomCodeInput.focus();
    }

    // 2. แอนิเมชันสั่นสะเทือนเรืองแสงแดง JS Web Animations API 100% การันตีผล
    const codeBox = document.querySelector('.lobby-code-box');
    if (codeBox) {
      const currentY = getComputedStyle(codeBox).getPropertyValue('--lobby-code-box-y').trim() || '-150px';
      codeBox.animate([
        { left: '0px', transform: `translateY(${currentY})`, filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.5))' },
        { left: '-35px', transform: `translateY(${currentY})`, filter: 'drop-shadow(0 0 35px #ef4444)' },
        { left: '35px', transform: `translateY(${currentY})`, filter: 'drop-shadow(0 0 40px #f87171)' },
        { left: '-25px', transform: `translateY(${currentY})`, filter: 'drop-shadow(0 0 30px #ef4444)' },
        { left: '25px', transform: `translateY(${currentY})`, filter: 'drop-shadow(0 0 25px #f87171)' },
        { left: '-12px', transform: `translateY(${currentY})`, filter: 'drop-shadow(0 0 20px #ef4444)' },
        { left: '12px', transform: `translateY(${currentY})`, filter: 'drop-shadow(0 0 15px #ef4444)' },
        { left: '0px', transform: `translateY(${currentY})`, filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.5))' }
      ], {
        duration: 500,
        easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)'
      });
    }
  }

  showInvalidRoomModal(code) {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    if (this.invalidRoomCodeText) {
      this.invalidRoomCodeText.textContent = code ? code.toUpperCase() : '-';
    }
    const modal = this.invalidRoomModal;
    const okBtn = this.invalidRoomOkBtn;
    if (!modal || !okBtn) {
      this.showErrorAlert("Invalid Room Code", `Room code "${code}" was not found in the system. Please check your room code or contact system administrator.`);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      modal.style.display = 'flex';
      const handleOk = () => {
        okBtn.removeEventListener('click', handleOk);
        modal.style.display = 'none';
        if (this.roomCodeInput) {
          this.roomCodeInput.focus();
        }
        resolve();
      };
      okBtn.addEventListener('click', handleOk);
    });
  }

  showRoomFullModal() {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    const modal = this.roomFullModal;
    const okBtn = this.roomFullOkBtn;
    if (!modal || !okBtn) {
      alert("Room Full\nThis game room has reached its maximum player limit.");
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      modal.style.display = 'flex';
      const handleOk = () => {
        okBtn.removeEventListener('click', handleOk);
        modal.style.display = 'none';
        resolve();
      };
      okBtn.addEventListener('click', handleOk);
    });
  }

  // Portfolio & Orders Delegations
  updatePortfolioUI(stats, portfolio, boardStocks, pendingOrders = {}, userUid = null) { 
    this.portfolioRenderer.updatePortfolioUI(stats, portfolio, boardStocks, pendingOrders, userUid); 
  }
  updateGMPendingOrdersUI(orders, onApprove, onReject) { this.portfolioRenderer.updateGMPendingOrdersUI(this.gmPendingOrdersBody, orders, onApprove, onReject); }
  updateGMPlayerSalaryUI(members, onPaySalary) { 
    this.portfolioRenderer.updateGMPlayerSalaryUI(this.gmPlayerSalaryBody, members, onPaySalary); 
  }
  updateGMPlayerDividendUI(members, boardStocks = {}, masterStocks = {}, originalCards = [], onPayDividend = null) { 
    this.portfolioRenderer.updateGMPlayerDividendUI(this.gmPlayerDividendBody, members, boardStocks, masterStocks, originalCards, onPayDividend); 
  }
  updatePlayerPendingOrdersUI(orders, uid) { this.portfolioRenderer.updatePlayerPendingOrdersUI(orders, uid); }
  updateDebtInstrumentsUI(debtData, onInvestDebt = null, onRedeemDebt = null) {
    this.portfolioRenderer.updateDebtInstrumentsUI(this.debtTableBody, debtData, onInvestDebt, onRedeemDebt);
  }
  updateGMPlayerDebtInterestUI(members, onPayDebtInterest = null) {
    this.portfolioRenderer.updateGMPlayerDebtInterestUI(this.gmPlayerDebtInterestBody, members, onPayDebtInterest);
  }
}
