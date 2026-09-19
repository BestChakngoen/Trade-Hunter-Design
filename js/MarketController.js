import { LobbyController } from './controllers/LobbyController.js';
import { TradeController } from './controllers/TradeController.js';
import { MarketBoardController } from './controllers/MarketBoardController.js';
import { TradeService } from './services/TradeService.js';
import { SessionLockService } from './services/SessionLockService.js';
import { SoundService } from './services/SoundService.js';
import { PlayerSessionService } from './services/PlayerSessionService.js';
import { GMHandoverService } from './services/GMHandoverService.js';
import { PlayerKickService } from './services/PlayerKickService.js';
import { BoardSyncHandler } from './controllers/sync/BoardSyncHandler.js';
import { RoomSyncHandler } from './controllers/sync/RoomSyncHandler.js';
import { AppLifecycleService } from './services/AppLifecycleService.js';
import { RoomGovernanceController } from './controllers/room/RoomGovernanceController.js';

/**
 * MarketController - Main Facade Controller coordinating Lobby, Trading,
 * Market Board, Real-time Sync Handlers, Governance, and App Lifecycle modules.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class MarketController {
  constructor(state, renderer, firebaseService) {
    this.state = state;
    this.renderer = renderer;
    this.renderer.state = state;
    this.firebaseService = firebaseService;

    // Audio & Sound FX Service
    this.soundService = new SoundService();

    // Multi-tab / Machine exclusivity service
    this.sessionLockService = new SessionLockService();

    // Player Persistent Session Service
    this.playerSessionService = new PlayerSessionService();

    // Sub-controllers following Single Responsibility Principle
    this.lobbyController = new LobbyController(state, renderer, firebaseService, this.sessionLockService, this.playerSessionService);
    this.tradeController = new TradeController(state, renderer, firebaseService);
    this.marketBoardController = new MarketBoardController(state, renderer, firebaseService, this, this.playerSessionService);

    // Room Governance Controller (Extracted in Phase C)
    this.roomGovernanceController = new RoomGovernanceController({
      state: this.state,
      renderer: this.renderer,
      firebaseService: this.firebaseService,
      playerSessionService: this.playerSessionService,
      marketController: this
    });

    // Sync Handlers (Extracted in Phase 3)
    this.boardSyncHandler = new BoardSyncHandler({
      state: this.state,
      renderer: this.renderer,
      firebaseService: this.firebaseService,
      soundService: this.soundService,
      tradeController: this.tradeController
    });

    this.roomSyncHandler = new RoomSyncHandler({
      state: this.state,
      renderer: this.renderer,
      firebaseService: this.firebaseService,
      soundService: this.soundService,
      tradeController: this.tradeController,
      playerSessionService: this.playerSessionService,
      marketController: this
    });

    // App Lifecycle & Window Protection Service (Extracted in Phase 3)
    this.appLifecycleService = new AppLifecycleService({
      state: this.state,
      renderer: this.renderer,
      firebaseService: this.firebaseService,
      playerSessionService: this.playerSessionService,
      onEvicted: (info) => this.handleEviction(info),
      onRoomExpired: () => this.handleRoomExpired()
    });

    this.isBeingKicked = false;
  }

  get _playerNameModalCleanup() {
    return this.roomGovernanceController ? this.roomGovernanceController._playerNameModalCleanup : null;
  }

  // --- Backward Compatibility Getters & Setters ---
  get updateTradeFormPrice() {
    return this.tradeController.updateTradeFormPrice;
  }

  get boardListenerUnsubscribe() {
    return this.boardSyncHandler.boardListenerUnsubscribe;
  }
  set boardListenerUnsubscribe(fn) {
    this.boardSyncHandler.boardListenerUnsubscribe = fn;
  }

  get roomListenerUnsubscribe() {
    return this.roomSyncHandler.roomListenerUnsubscribe;
  }
  set roomListenerUnsubscribe(fn) {
    this.roomSyncHandler.roomListenerUnsubscribe = fn;
  }

  get hasReceivedInitialBoard() {
    return this.boardSyncHandler.hasReceivedInitialBoard;
  }
  set hasReceivedInitialBoard(val) {
    this.boardSyncHandler.hasReceivedInitialBoard = val;
  }

  get latestRoomMembers() {
    return this.roomSyncHandler.latestRoomMembers;
  }
  set latestRoomMembers(val) {
    this.roomSyncHandler.latestRoomMembers = val;
  }

  get roomExpiresAt() {
    return this.roomSyncHandler.roomExpiresAt;
  }
  set roomExpiresAt(val) {
    this.roomSyncHandler.roomExpiresAt = val;
  }

  get isHandlingExpiry() {
    return this.roomSyncHandler.isHandlingExpiry;
  }
  set isHandlingExpiry(val) {
    this.roomSyncHandler.isHandlingExpiry = val;
  }

  init() {
    this.renderer.ensureViewGraphButtons();
    this.renderer.applyBetaColors(this.state.originalCards);
    this.renderer.showLobby();

    // Initialize machine & multi-tab session exclusivity listener
    if (this.sessionLockService) {
      this.sessionLockService.init((reason, newUserId) => this.handleKickedSession(reason, newUserId));
    }

    // 1. Bind Lobby Flow
    this.lobbyController.bindLobbyEntrance((code) => {
      this.activateBoardRealtimeListener();
    });

    // 2. Bind Market Board Operations
    this.marketBoardController.bindSectorFilter();
    this.marketBoardController.bindSizeFilter();
    this.marketBoardController.bindSortButtons();
    this.marketBoardController.bindResetBtn();
    this.marketBoardController.bindPriceControls();
    this.marketBoardController.bindHistoryButtons();
    this.marketBoardController.bindStockModals();
    this.marketBoardController.bindDangerZone();
    this.marketBoardController.bindSpectatorEvents();

    if (this.renderer.payAllDividendBtn) {
      this.renderer.payAllDividendBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await this.tradeController.payAllPlayersDividend();
      });
    }

    // 3. Tab Navigation & Trade Form Events
    this.renderer.bindTabEvents(async (tab) => {
      if (tab === 'portfolio') {
        const stats = this.state.getPortfolioStats();
        const user = this.firebaseService.getCurrentUser();
        const uid = user ? user.uid : null;
        this.renderer.updatePortfolioUI(stats, this.state.portfolio, this.state.boardStocks, this.state.pendingOrders, uid);
        const debtData = TradeService.calculateDebtInstrumentsValue(this.state.portfolio?.debt);
        this.renderer.updateDebtInstrumentsUI(
          debtData,
          async (key) => { await this.tradeController.submitDebtOrder('INVEST', key); },
          async (key) => { await this.tradeController.submitDebtOrder('REDEEM', key); }
        );
        if (this.tradeController.refreshDropdownOptions) {
          this.tradeController.refreshDropdownOptions();
        }
      } else if (tab === 'management') {
        await this.refreshManagementView();
      }
    });

    this.tradeController.bindTradeFormEvents();
    this.roomGovernanceController.bindAll();
    this.appLifecycleService.bindGlobalProtectionEvents();
    this.appLifecycleService.bindLifecycleReverificationEvents();
  }

  // --- Room Governance Proxies (Backward Compatibility) ---
  bindLeaveRoomButton() { this.roomGovernanceController.bindLeaveRoomButton(); }
  bindGMHandoverButton() { this.roomGovernanceController.bindGMHandoverButton(); }
  bindKickPlayerButton() { this.roomGovernanceController.bindKickPlayerButton(); }
  openPlayerNameModal(options = {}) { this.roomGovernanceController.openPlayerNameModal(options); }
  bindPlayerNameEdit() { this.roomGovernanceController.bindPlayerNameEdit(); }

  // --- Real-time Synchronization Orchestrator ---
  activateBoardRealtimeListener() {
    const code = this.state.roomCode;
    if (!code) return;

    this.boardSyncHandler.activate(code);
    this.roomSyncHandler.activate(code);
  }

  startRoomCountdownTimer(expiresAt) {
    this.roomSyncHandler.startRoomCountdownTimer(expiresAt);
  }

  async handleRoomExpired(customTitle = null, customMessage = null) {
    return this.roomSyncHandler.handleRoomExpired(customTitle, customMessage);
  }

  unsubscribeAll() {
    if (this.sessionLockService) {
      this.sessionLockService.cleanup();
    }
    this.boardSyncHandler.unsubscribe();
    this.roomSyncHandler.unsubscribe();
  }

  handleEviction({ isReset, isKicked, kickReason, isNotInMembers, code, currentUid }) {
    this.renderer.hideGMTransferModal();
    this.renderer.hideKickPlayerModal();
    this.renderer.hidePlayerNameModal();
    this.unsubscribeAll();
    if (this.playerSessionService && code) {
      this.playerSessionService.clearRoomSession(code);
    }
    if (isKicked && currentUid) {
      this.firebaseService.clearKickedMember(code, currentUid).catch(() => {});
    }
    this.state.reset();
    this.renderer.showLobby();
    if (kickReason === 'ROOM_RESET' || isReset || isNotInMembers) {
      this.renderer.showErrorAlert(
        "ห้องเกมได้รับการรีเซ็ต",
        "ห้องเกมนี้ถูกรีเซ็ตข้อมูลทั้งหมดโดย GM ระบบได้นำคุณกลับสู่หน้าล็อบบี้แล้ว"
      );
    } else {
      this.renderer.showErrorAlert(
        "ถูกให้ออกจากห้อง",
        "คุณถูกผู้ดูแลห้อง (GM) บังคับให้ออกจากห้องเกม และข้อมูลการเล่นทั้งหมดของคุณถูกรีเซ็ตเรียบร้อยแล้ว"
      );
    }
  }

  /**
   * Helper to remove member node and handle GM succession or room cleanup.
   */
  async removeMemberAndTransferIfNeeded(roomCode, currentUid, isGM) {
    return this.roomGovernanceController.removeMemberAndTransferIfNeeded(roomCode, currentUid, isGM);
  }

  /**
   * Handles automatic eviction when a newer tab/session is activated for the same user account.
   */
  async handleKickedSession(reason, newUserId = null) {
    if (this.isBeingKicked) return;
    this.isBeingKicked = true;

    try {
      this.unsubscribeAll();
      this.state.reset();
      this.renderer.showLobby();
      await this.renderer.showErrorAlert(
        "SESSION DISCONNECTED",
        reason || "เซสชันของคุณถูกตัดการเชื่อมต่อเนื่องจากมีการเข้าเล่นจากแท็บใหม่ด้วยบัญชีนี้"
      );
    } catch (e) {
      console.error("[MarketController] Error handling kicked session:", e);
    } finally {
      this.isBeingKicked = false;
    }
  }

  async refreshManagementView(roomData = null) {
    if (this.state.role !== 'game_master' || this.state.isSpectating) return;

    if (!roomData) {
      if (!this.state.roomCode) return;
      try {
        const snap = await this.firebaseService.getRoomStateSnapshot(this.state.roomCode);
        roomData = snap && snap.exists() ? snap.val() : null;
      } catch (err) {
        console.warn("Could not fetch room snapshot for management view:", err);
      }
    }
    if (!roomData) return;

    const orders = roomData.pendingOrders || {};

    if (this.renderer.gmPendingOrdersSection) {
      this.renderer.gmPendingOrdersSection.style.display = 'block';
    }
    if (this.renderer.gmPlayerSalarySection) {
      this.renderer.gmPlayerSalarySection.style.display = 'block';
    }
    if (this.renderer.gmPlayerDividendSection) {
      this.renderer.gmPlayerDividendSection.style.display = 'block';
    }
    if (this.renderer.gmPlayerDebtInterestSection) {
      this.renderer.gmPlayerDebtInterestSection.style.display = 'block';
    }

    this.renderer.updateGMPendingOrdersUI(
      orders,
      async (orderId) => {
        await this.tradeController.approvePlayerOrder(orderId);
      },
      async (orderId) => {
        await this.tradeController.rejectPlayerOrder(orderId);
      },
      roomData.members
    );
    this.renderer.updateGMPlayerSalaryUI(
      roomData.members,
      async (playerUid) => {
        await this.tradeController.payPlayerSalary(playerUid);
      }
    );
    this.renderer.updateGMPlayerDividendUI(
      roomData.members,
      this.state.boardStocks,
      this.state.masterStocks,
      this.state.originalCards,
      async (playerUid) => {
        await this.tradeController.payPlayerDividend(playerUid);
      }
    );
    this.renderer.updateGMPlayerDebtInterestUI(
      roomData.members,
      async (playerUid) => {
        await this.tradeController.payPlayerDebtInterest(playerUid);
      }
    );
  }
}
