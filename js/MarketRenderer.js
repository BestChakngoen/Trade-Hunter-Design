import { ChartRenderer } from './renderers/ChartRenderer.js';
import { PortfolioRenderer } from './renderers/PortfolioRenderer.js';
import { CardGridRenderer } from './renderers/CardGridRenderer.js';
import { ModalsRenderer } from './renderers/ModalsRenderer.js';

/**
 * MarketRenderer - Main Facade Renderer coordinating Canvas Charts, Portfolio UI, Stock Card Grid, and Modals modules.
 */
export class MarketRenderer {
  constructor() {
    this.activeTab = 'market';
    this.pageShell = document.querySelector('.page-shell');
    this.priceGrid = document.getElementById('priceGrid');
    this.sectorPills = document.getElementById('sectorPills');
    this.sizePills = document.getElementById('sizePills');
    this.sortPriceBtn = document.getElementById('sortPriceBtn');
    this.sortSectorBtn = document.getElementById('sortSectorBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.resetMarketBtn = document.getElementById('resetMarketBtn');
    this.resetRoomDataBtn = document.getElementById('resetRoomDataBtn');
    this.stockChartCanvas = document.getElementById('stockChart');
    
    // Lobby Screen Elements
    this.lobbyScreen = document.getElementById('lobbyScreen');
    this.lobbyForm = document.getElementById('lobbyForm');
    this.roomCodeInput = document.getElementById('roomCodeInput');
    this.joinRoomBtn = document.getElementById('joinRoomBtn');
    this.lobbyCheckingIndicator = document.getElementById('lobbyCheckingIndicator');

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
    this.modalsRenderer = new ModalsRenderer();
    this.chartRenderer = new ChartRenderer(this);
    this.portfolioRenderer = new PortfolioRenderer();
    this.cardGridRenderer = new CardGridRenderer(
      this.priceGrid,
      this.sectorPills,
      this.sortPriceBtn,
      null,
      null,
      this.sortSectorBtn,
      this.modalsRenderer.confirmModal
    );
  }

  // --- Getters for Modals & Dialog Elements (100% Backward Compatibility) ---
  get confirmResetRoomModal() { return this.modalsRenderer.confirmResetRoomModal; }
  get roleSelectionModal() { return this.modalsRenderer.roleSelectionModal; }
  get roleOptGMBtn() { return this.modalsRenderer.roleOptGMBtn; }
  get roleOptPlayerBtn() { return this.modalsRenderer.roleOptPlayerBtn; }
  get roleOptCloseBtn() { return this.modalsRenderer.roleOptCloseBtn; }
  get playerNameModal() { return this.modalsRenderer.playerNameModal; }
  get playerNameInput() { return this.modalsRenderer.playerNameInput; }
  get playerNameErrorText() { return this.modalsRenderer.playerNameErrorText; }
  get playerNameConfirmBtn() { return this.modalsRenderer.playerNameConfirmBtn; }
  get playerNameCloseBtn() { return this.modalsRenderer.playerNameCloseBtn; }
  get playerNameModalTitle() { return this.modalsRenderer.playerNameModalTitle; }
  get playerNameModalSubtitle() { return this.modalsRenderer.playerNameModalSubtitle; }
  get editPlayerNameBtn() { return this.modalsRenderer.editPlayerNameBtn; }
  get gameModeSelectionModal() { return this.modalsRenderer.gameModeSelectionModal; }
  get gameModeBasicBtn() { return this.modalsRenderer.gameModeBasicBtn; }
  get gameModeAdvanceBtn() { return this.modalsRenderer.gameModeAdvanceBtn; }
  get gameModeCloseBtn() { return this.modalsRenderer.gameModeCloseBtn; }
  get waitingForGMModal() { return this.modalsRenderer.waitingForGMModal; }
  get waitingCloseBtn() { return this.modalsRenderer.waitingCloseBtn; }
  get waitingResetRoomBtn() { return this.modalsRenderer.waitingResetRoomBtn; }
  get waitingRoomCodeBadge() { return this.modalsRenderer.waitingRoomCodeBadge; }
  get roomFullModal() { return this.modalsRenderer.roomFullModal; }
  get roomFullOkBtn() { return this.modalsRenderer.roomFullOkBtn; }
  get invalidRoomModal() { return this.modalsRenderer.invalidRoomModal; }
  get invalidRoomCodeText() { return this.modalsRenderer.invalidRoomCodeText; }
  get invalidRoomOkBtn() { return this.modalsRenderer.invalidRoomOkBtn; }
  get confirmModal() { return this.modalsRenderer.confirmModal; }
  get gmTransferModal() { return this.modalsRenderer.gmTransferModal; }
  get gmTransferClaimBtn() { return this.modalsRenderer.gmTransferClaimBtn; }
  get gmTransferDeclineBtn() { return this.modalsRenderer.gmTransferDeclineBtn; }
  get openTransferGmModalBtn() { return this.modalsRenderer.openTransferGmModalBtn; }
  get gmDirectTransferModal() { return this.modalsRenderer.gmDirectTransferModal; }
  get gmTransferPlayerList() { return this.modalsRenderer.gmTransferPlayerList; }
  get confirmDirectTransferBtn() { return this.modalsRenderer.confirmDirectTransferBtn; }
  get cancelDirectTransferBtn() { return this.modalsRenderer.cancelDirectTransferBtn; }
  get closeDirectTransferModalBtn() { return this.modalsRenderer.closeDirectTransferModalBtn; }
  get openKickPlayerModalBtn() { return this.modalsRenderer.openKickPlayerModalBtn; }
  get kickPlayerModal() { return this.modalsRenderer.kickPlayerModal; }
  get kickPlayerList() { return this.modalsRenderer.kickPlayerList; }
  get confirmKickPlayerBtn() { return this.modalsRenderer.confirmKickPlayerBtn; }
  get cancelKickPlayerBtn() { return this.modalsRenderer.cancelKickPlayerBtn; }
  get closeKickPlayerModalBtn() { return this.modalsRenderer.closeKickPlayerModalBtn; }
  get selectedKickPlayerUid() { return this.modalsRenderer.selectedKickPlayerUid; }
  set selectedKickPlayerUid(val) { this.modalsRenderer.selectedKickPlayerUid = val; }
  get currentKickEligiblePlayers() { return this.modalsRenderer.currentKickEligiblePlayers; }
  set currentKickEligiblePlayers(val) { this.modalsRenderer.currentKickEligiblePlayers = val; }
  get onKickPlayerConfirmCallback() { return this.modalsRenderer.onKickPlayerConfirmCallback; }
  set onKickPlayerConfirmCallback(val) { this.modalsRenderer.onKickPlayerConfirmCallback = val; }

  showLobby() {
    this.hidePlayerNameModal();
    if (this.portfolioRenderer) {
      this.portfolioRenderer.resetAnimationState();
    }
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

  /**
   * Sets lobby form into animated Checking... state, toggling join button and checking indicator.
   * @param {boolean} isChecking
   */
  setLobbyChecking(isChecking) {
    const form = this.lobbyForm;
    const btn = this.joinRoomBtn;
    const indicator = this.lobbyCheckingIndicator || (typeof document !== 'undefined' ? document.getElementById('lobbyCheckingIndicator') : null);

    if (isChecking) {
      if (form) form.classList.add('is-checking');
      if (btn) {
        btn.disabled = true;
        btn.classList.add('is-checking');
        btn.style.setProperty('display', 'none', 'important');
      }
      if (indicator) {
        indicator.style.setProperty('display', 'flex', 'important');
      }
    } else {
      if (form) form.classList.remove('is-checking');
      if (indicator) {
        indicator.style.setProperty('display', 'none', 'important');
      }
      if (btn) {
        btn.classList.remove('is-checking');
        btn.style.removeProperty('display');
        btn.disabled = false;
      }
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

  updateRoomMembersDisplay(memberCount) {
    if (!this.roomMembersBadge) return;
    this.roomMembersBadge.textContent = `${memberCount}`;
    this.roomMembersBadge.className = 'text-[10px] md:text-xs font-black tracking-widest uppercase text-purple-400';
  }

  updateRoomMembersUI(members = {}) {
    const memberCount = Object.values(members || {}).length;
    this.updateRoomMembersDisplay(memberCount);
  }

  updateControlsVisibility(role, playerName, gameMode = 'advance') {
    const isMaster = (role === 'game_master');
    const isBasicMode = (gameMode === 'basic');
    
    if (this.userRoleBadge) {
      const modeLabel = isBasicMode ? ' [BASIC]' : '';
      this.userRoleBadge.textContent = (isMaster ? 'Game Master' : (playerName || 'Player_1')) + modeLabel;
      if (isMaster) {
        this.userRoleBadge.className = 'text-[10px] md:text-xs font-black tracking-widest uppercase text-red-400';
        this.userRoleBadge.style.cursor = 'default';
        this.userRoleBadge.removeAttribute('title');
        if (this.editPlayerNameBtn) {
          this.editPlayerNameBtn.style.display = 'none';
        }
      } else {
        this.userRoleBadge.className = 'text-[10px] md:text-xs font-black tracking-widest uppercase text-emerald-400 hover:underline cursor-pointer';
        this.userRoleBadge.title = 'คลิกเพื่อแก้ไขชื่อผู้เล่น';
        if (this.editPlayerNameBtn) {
          this.editPlayerNameBtn.style.display = 'inline-flex';
        }
      }
    }

    const cards = Array.from(this.priceGrid.querySelectorAll('.price-card'));
    cards.forEach(card => {
      const controls = card.querySelector('.card-controls');
      if (controls) {
        controls.style.display = isMaster ? 'flex' : 'none';
      }
    });

    const gmBatchControls = document.getElementById('gmBatchControls');
    if (gmBatchControls) {
      gmBatchControls.style.display = isMaster ? 'inline-flex' : 'none';
    }

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
    const portTabContent = document.getElementById('portTabContent');
    const mgmtTabContent = document.getElementById('mgmtTabContent');

    if (isBasicMode) {
      // Basic Mode: Hide ALL navigation tabs completely!
      if (mainNavTabs) mainNavTabs.style.setProperty('display', 'none', 'important');
      if (tradeWidget) tradeWidget.style.display = 'none';
      if (portTabContent) portTabContent.style.display = 'none';
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

      const tabMarketBtn = document.getElementById('tabMarketBtn');

      if (role === 'game_master' && this.activeTab === 'portfolio') {
        this.activeTab = 'market';
      } else if (role !== 'game_master' && this.activeTab === 'management') {
        this.activeTab = 'market';
      }

      const activeClass = "w-1/2 flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-active transition-all uppercase tracking-wider";
      const activeMgmtClass = "w-1/2 flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-active transition-all uppercase tracking-wider relative";
      const inactiveClass = "w-1/2 flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-inactive transition-all uppercase tracking-wider";
      const inactiveMgmtClass = "w-1/2 flex-1 py-3 text-center text-xs sm:text-sm font-bold tab-inactive transition-all uppercase tracking-wider relative";

      if (this.activeTab === 'management' && role === 'game_master') {
        if (tabMarketBtn) tabMarketBtn.className = inactiveClass;
        if (tabPortBtn) tabPortBtn.className = inactiveClass;
        if (tabMgmtBtn) tabMgmtBtn.className = activeMgmtClass;
        if (marketTabContent) marketTabContent.style.display = 'none';
        if (portTabContent) portTabContent.style.display = 'none';
        if (mgmtTabContent) mgmtTabContent.style.display = 'block';
      } else if (this.activeTab === 'portfolio' && role !== 'game_master') {
        if (tabMarketBtn) tabMarketBtn.className = inactiveClass;
        if (tabPortBtn) tabPortBtn.className = activeClass;
        if (tabMgmtBtn) tabMgmtBtn.className = inactiveMgmtClass;
        if (marketTabContent) marketTabContent.style.display = 'none';
        if (portTabContent) portTabContent.style.display = 'block';
        if (mgmtTabContent) mgmtTabContent.style.display = 'none';
      } else {
        this.activeTab = 'market';
        if (tabMarketBtn) tabMarketBtn.className = activeClass;
        if (tabPortBtn) tabPortBtn.className = inactiveClass;
        if (tabMgmtBtn) tabMgmtBtn.className = inactiveMgmtClass;
        if (marketTabContent) marketTabContent.style.display = 'block';
        if (portTabContent) portTabContent.style.display = 'none';
        if (mgmtTabContent) mgmtTabContent.style.display = 'none';
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
        this.activeTab = 'market';
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
        this.activeTab = 'portfolio';
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
        this.activeTab = 'management';
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

  // --- Lobby Helpers ---
  clearRoomCodeSlots() {
    if (this.roomCodeInput) {
      this.roomCodeInput.value = '';
    }
    const slotsContainer = document.getElementById('roomCodeSlots');
    if (slotsContainer) {
      slotsContainer.classList.remove('visible-slots');
      slotsContainer.style.cssText = 'display: none !important; opacity: 0 !important;';
      slotsContainer.querySelectorAll('.code-slot').forEach(slot => {
        slot.textContent = '';
        slot.classList.remove('filled', 'active-focus');
      });
    }
  }

  triggerShakeCodeBox() {
    this.clearRoomCodeSlots();
    if (this.roomCodeInput) {
      this.roomCodeInput.focus();
    }

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

  // --- Card Grid Delegations ---
  renderGrid(cards) { this.cardGridRenderer.renderGrid(cards); }
  updateCardValue(card, price, direction, prevPrice, shouldAnimate = true) { this.cardGridRenderer.updateCardValue(card, price, direction, prevPrice, shouldAnimate); }
  clearAllCardAnimations(cards) { this.cardGridRenderer.clearAllCardAnimations(cards); }
  applyBetaColors(cards) { this.cardGridRenderer.applyBetaColors(cards); }
  applyPriceColors(cards, boardStocks, masterStocks, initialPrices) { this.cardGridRenderer.applyPriceColors(cards, boardStocks, masterStocks, initialPrices); }
  calculateBetaColor(beta) { return this.cardGridRenderer.calculateBetaColor(beta); }
  updateSortButtonsUI(sortStates) { this.cardGridRenderer.updateSortButtonsUI(sortStates); }
  updateSectorPillsUI(selectedSectors) { this.cardGridRenderer.updateSectorPillsUI(selectedSectors); }
  updateSizePillsUI(selectedSizes) { this.cardGridRenderer.updateSizePillsUI(selectedSizes); }
  ensureViewGraphButtons() { this.cardGridRenderer.ensureViewGraphButtons(); }

  // --- Modals & Popups Delegations ---
  openConfirmModal() { this.modalsRenderer.openConfirmModal(); }
  closeConfirmModal() { this.modalsRenderer.closeConfirmModal(); }
  openConfirmResetRoomModal() { this.modalsRenderer.openConfirmResetRoomModal(); }
  closeConfirmResetRoomModal() { this.modalsRenderer.closeConfirmResetRoomModal(); }
  showErrorAlert(title, text) { this.modalsRenderer.showErrorAlert(title, text); }
  showSuccessAlert(title, text) { this.modalsRenderer.showSuccessAlert(title, text); }
  showConfirmAlert(title, text, confirmText = 'Confirm', cancelText = 'Cancel') { return this.modalsRenderer.showConfirmAlert(title, text, confirmText, cancelText); }
  showAutoDismissModal(title, text, duration = 3500) { return this.modalsRenderer.showAutoDismissModal(title, text, duration); }
  showTopToast(title, message, type = 'success', duration = 3800) { this.modalsRenderer.showTopToast(title, message, type, duration); }

  showInvalidRoomModal(code) {
    this.clearRoomCodeSlots();
    return this.modalsRenderer.showInvalidRoomModal(code, () => {
      this.clearRoomCodeSlots();
      if (this.roomCodeInput) {
        this.roomCodeInput.focus();
      }
    });
  }

  showRoomFullModal(customMessage = null) { return this.modalsRenderer.showRoomFullModal(customMessage); }
  showGMTransferModal(onClaim, onDecline) { this.modalsRenderer.showGMTransferModal(onClaim, onDecline); }
  hideGMTransferModal() { this.modalsRenderer.hideGMTransferModal(); }
  showDirectTransferModal(players = [], onConfirm = null) { this.modalsRenderer.showDirectTransferModal(players, onConfirm); }
  hideDirectTransferModal() { this.modalsRenderer.hideDirectTransferModal(); }
  isKickPlayerModalOpen() { return this.modalsRenderer.isKickPlayerModalOpen(); }
  updateKickPlayerList(players = []) { this.modalsRenderer.updateKickPlayerList(players); }
  showKickPlayerModal(players = [], onConfirm = null) { this.modalsRenderer.showKickPlayerModal(players, onConfirm); }
  hideKickPlayerModal() { this.modalsRenderer.hideKickPlayerModal(); }
  showPlayerNameModal(options = {}) { this.modalsRenderer.showPlayerNameModal(options); }
  hidePlayerNameModal() { this.modalsRenderer.hidePlayerNameModal(); }
  showPlayerNameError(message) { this.modalsRenderer.showPlayerNameError(message); }

  // --- Chart Rendering Delegations ---
  drawCardChart(canvas, history, activeIndex = -1) { this.chartRenderer.drawCardChart(canvas, history, activeIndex); }
  bindTimelineEvents(canvas, chartContainer, startPrice, beta) { this.chartRenderer.bindTimelineEvents(canvas, chartContainer, startPrice, beta); }
  toggleCardChart(card, history, startPrice, beta) { this.chartRenderer.toggleCardChart(card, history, startPrice, beta); }

  // --- Portfolio & Orders Delegations ---
  updatePortfolioUI(stats, portfolio, boardStocks, pendingOrders = {}, userUid = null) { 
    this.portfolioRenderer.updatePortfolioUI(stats, portfolio, boardStocks, pendingOrders, userUid); 
  }
  updateGMPendingOrdersUI(orders, onApprove, onReject, members = {}) { this.portfolioRenderer.updateGMPendingOrdersUI(this.gmPendingOrdersBody, orders, onApprove, onReject, members); }
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
