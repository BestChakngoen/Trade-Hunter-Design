import { ToastNotificationService } from '../services/ToastNotificationService.js';
import { AlertModalService } from '../services/AlertModalService.js';
import { GovernanceModalsRenderer } from './GovernanceModalsRenderer.js';

/**
 * ModalsRenderer - Facade renderer responsible for coordinating modals, dialogs,
 * confirmation prompts, and toast notifications across Trade Hunter.
 * Adheres strictly to Single Responsibility Principle (SRP) and SOLID principles.
 */
export class ModalsRenderer {
  constructor() {
    // Sub-renderer for GM Succession and Kick Player management
    this.governanceModals = new GovernanceModalsRenderer();

    // Room Reset Confirmation Modal
    this.confirmResetRoomModal = document.getElementById('confirmResetRoomModal');

    // Role Selection Modal
    this.roleSelectionModal = document.getElementById('roleSelectionModal');
    this.roleOptGMBtn = document.getElementById('roleOptGMBtn');
    this.roleOptPlayerBtn = document.getElementById('roleOptPlayerBtn');
    this.roleOptCloseBtn = document.getElementById('roleOptCloseBtn');

    // Player Name Modal
    this.playerNameModal = document.getElementById('playerNameModal');
    this.playerNameInput = document.getElementById('playerNameInput');
    this.playerNameErrorText = document.getElementById('playerNameErrorText');
    this.playerNameConfirmBtn = document.getElementById('playerNameConfirmBtn');
    this.playerNameCloseBtn = document.getElementById('playerNameCloseBtn');
    this.playerNameModalTitle = document.getElementById('playerNameModalTitle');
    this.playerNameModalSubtitle = document.getElementById('playerNameModalSubtitle');
    this.editPlayerNameBtn = document.getElementById('editPlayerNameBtn');

    // Game Mode Selection Modal (GM) & Waiting Modal (Player)
    this.gameModeSelectionModal = document.getElementById('gameModeSelectionModal');
    this.gameModeBasicBtn = document.getElementById('gameModeBasicBtn');
    this.gameModeAdvanceBtn = document.getElementById('gameModeAdvanceBtn');
    this.gameModeCloseBtn = document.getElementById('gameModeCloseBtn');
    this.waitingForGMModal = document.getElementById('waitingForGMModal');
    this.waitingCloseBtn = document.getElementById('waitingCloseBtn');
    this.waitingResetRoomBtn = document.getElementById('waitingResetRoomBtn');
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
  }

  // --- Proxied Governance Elements (100% Backward Compatibility) ---
  get gmTransferModal() { return this.governanceModals.gmTransferModal; }
  set gmTransferModal(val) { this.governanceModals.gmTransferModal = val; }
  get gmTransferClaimBtn() { return this.governanceModals.gmTransferClaimBtn; }
  set gmTransferClaimBtn(val) { this.governanceModals.gmTransferClaimBtn = val; }
  get gmTransferDeclineBtn() { return this.governanceModals.gmTransferDeclineBtn; }
  set gmTransferDeclineBtn(val) { this.governanceModals.gmTransferDeclineBtn = val; }
  get openTransferGmModalBtn() { return this.governanceModals.openTransferGmModalBtn; }
  set openTransferGmModalBtn(val) { this.governanceModals.openTransferGmModalBtn = val; }
  get gmDirectTransferModal() { return this.governanceModals.gmDirectTransferModal; }
  set gmDirectTransferModal(val) { this.governanceModals.gmDirectTransferModal = val; }
  get gmTransferPlayerList() { return this.governanceModals.gmTransferPlayerList; }
  set gmTransferPlayerList(val) { this.governanceModals.gmTransferPlayerList = val; }
  get confirmDirectTransferBtn() { return this.governanceModals.confirmDirectTransferBtn; }
  set confirmDirectTransferBtn(val) { this.governanceModals.confirmDirectTransferBtn = val; }
  get cancelDirectTransferBtn() { return this.governanceModals.cancelDirectTransferBtn; }
  set cancelDirectTransferBtn(val) { this.governanceModals.cancelDirectTransferBtn = val; }
  get closeDirectTransferModalBtn() { return this.governanceModals.closeDirectTransferModalBtn; }
  set closeDirectTransferModalBtn(val) { this.governanceModals.closeDirectTransferModalBtn = val; }
  get openKickPlayerModalBtn() { return this.governanceModals.openKickPlayerModalBtn; }
  set openKickPlayerModalBtn(val) { this.governanceModals.openKickPlayerModalBtn = val; }
  get kickPlayerModal() { return this.governanceModals.kickPlayerModal; }
  set kickPlayerModal(val) { this.governanceModals.kickPlayerModal = val; }
  get kickPlayerList() { return this.governanceModals.kickPlayerList; }
  set kickPlayerList(val) { this.governanceModals.kickPlayerList = val; }
  get confirmKickPlayerBtn() { return this.governanceModals.confirmKickPlayerBtn; }
  set confirmKickPlayerBtn(val) { this.governanceModals.confirmKickPlayerBtn = val; }
  get cancelKickPlayerBtn() { return this.governanceModals.cancelKickPlayerBtn; }
  set cancelKickPlayerBtn(val) { this.governanceModals.cancelKickPlayerBtn = val; }
  get closeKickPlayerModalBtn() { return this.governanceModals.closeKickPlayerModalBtn; }
  set closeKickPlayerModalBtn(val) { this.governanceModals.closeKickPlayerModalBtn = val; }
  get selectedKickPlayerUid() { return this.governanceModals.selectedKickPlayerUid; }
  set selectedKickPlayerUid(val) { this.governanceModals.selectedKickPlayerUid = val; }
  get currentKickEligiblePlayers() { return this.governanceModals.currentKickEligiblePlayers; }
  set currentKickEligiblePlayers(val) { this.governanceModals.currentKickEligiblePlayers = val; }
  get onKickPlayerConfirmCallback() { return this.governanceModals.onKickPlayerConfirmCallback; }
  set onKickPlayerConfirmCallback(val) { this.governanceModals.onKickPlayerConfirmCallback = val; }
  get _kickPlayerModalCleanup() { return this.governanceModals._kickPlayerModalCleanup; }
  set _kickPlayerModalCleanup(val) { this.governanceModals._kickPlayerModalCleanup = val; }

  // --- Scroll State Helpers (Delegated to AlertModalService) ---
  _captureScrollState() {
    return AlertModalService.captureScrollState();
  }

  _restoreScrollState(state) {
    AlertModalService.restoreScrollState(state);
  }

  // --- Confirmation Modals (Native/In-page) ---
  openConfirmModal() {
    if (!this.confirmModal) return;
    this.confirmModal.style.display = 'flex';
    this.confirmModal.classList.add('show');
  }

  closeConfirmModal() {
    if (!this.confirmModal) return;
    this.confirmModal.classList.remove('show');
    this.confirmModal.style.display = 'none';
  }

  openConfirmResetRoomModal() {
    if (!this.confirmResetRoomModal) return;
    this.confirmResetRoomModal.style.display = 'flex';
    this.confirmResetRoomModal.classList.add('show');
  }

  closeConfirmResetRoomModal() {
    if (!this.confirmResetRoomModal) return;
    this.confirmResetRoomModal.classList.remove('show');
    this.confirmResetRoomModal.style.display = 'none';
  }

  // --- SweetAlert / Native Fallback Dialogs (Delegated to AlertModalService) ---
  showErrorAlert(title, text) {
    return AlertModalService.showErrorAlert(title, text);
  }

  showSuccessAlert(title, text) {
    return AlertModalService.showSuccessAlert(title, text);
  }

  showConfirmAlert(title, text, confirmText = 'Confirm', cancelText = 'Cancel') {
    return AlertModalService.showConfirmAlert(title, text, confirmText, cancelText);
  }

  showAutoDismissModal(title, text, duration = 3500) {
    return AlertModalService.showAutoDismissModal(title, text, duration);
  }

  // --- Dynamic Island Apple Style Toast (Delegated to ToastNotificationService) ---
  showTopToast(title, message, type = 'success', duration = 3800) {
    return ToastNotificationService.showTopToast(title, message, type, duration);
  }

  // --- Lobby Room Validation Modals ---
  showInvalidRoomModal(code, onDismiss = null) {
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
        if (typeof onDismiss === 'function') {
          onDismiss();
        }
        resolve();
      };
      okBtn.addEventListener('click', handleOk);
    });
  }

  showRoomFullModal(customMessage = null) {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    const modal = this.roomFullModal;
    const okBtn = this.roomFullOkBtn;
    const resetBtn = document.getElementById('roomFullResetBtn');

    if (!modal) {
      alert(customMessage || "Room Full\nThis game room has reached its maximum player limit (8 players max).");
      return Promise.resolve('close');
    }

    const sub = modal.querySelector('.apple-modal-subtitle');
    const defaultText = "ห้องเกมนี้มีจำนวนผู้เล่นครบตามจำนวนสูงสุดแล้ว (จำกัดสูงสุด 8 คน) คุณสามารถรีเซ็ตห้องเพื่อล้างเซสชันเก่าได้";
    if (sub) {
      sub.textContent = customMessage || defaultText;
    }

    return new Promise((resolve) => {
      modal.style.display = 'flex';
      const cleanup = (action) => {
        if (okBtn) okBtn.removeEventListener('click', handleOk);
        if (resetBtn) resetBtn.removeEventListener('click', handleReset);
        modal.style.display = 'none';
        if (sub) sub.textContent = defaultText;
        resolve(action);
      };
      const handleOk = () => cleanup('close');
      const handleReset = () => cleanup('reset');

      if (okBtn) okBtn.addEventListener('click', handleOk);
      if (resetBtn) resetBtn.addEventListener('click', handleReset);
    });
  }

  // --- GM Succession & Handover Modals (Delegated to GovernanceModalsRenderer) ---
  showGMTransferModal(onClaim, onDecline) {
    return this.governanceModals.showGMTransferModal(onClaim, onDecline);
  }

  hideGMTransferModal() {
    return this.governanceModals.hideGMTransferModal();
  }

  showDirectTransferModal(players = [], onConfirm = null) {
    return this.governanceModals.showDirectTransferModal(players, onConfirm);
  }

  hideDirectTransferModal() {
    return this.governanceModals.hideDirectTransferModal();
  }

  // --- Kick Player Modals (Delegated to GovernanceModalsRenderer) ---
  isKickPlayerModalOpen() {
    return this.governanceModals.isKickPlayerModalOpen();
  }

  updateKickPlayerList(players = []) {
    return this.governanceModals.updateKickPlayerList(players);
  }

  showKickPlayerModal(players = [], onConfirm = null) {
    return this.governanceModals.showKickPlayerModal(players, onConfirm);
  }

  hideKickPlayerModal() {
    return this.governanceModals.hideKickPlayerModal();
  }

  // --- Player Name Modal ---
  showPlayerNameModal({ 
    title = "ตั้งชื่อผู้เล่นของคุณ", 
    subtitle = "โปรดระบุชื่อที่ต้องการใช้แสดงในห้องเกม (1 - 20 ตัวอักษร)", 
    confirmText = "เข้าสู่เกม", 
    initialValue = "",
    allowClose = true 
  } = {}) {
    if (!this.playerNameModal) return;
    if (this.playerNameCloseBtn) {
      if (allowClose) {
        this.playerNameCloseBtn.style.removeProperty('display');
      } else {
        this.playerNameCloseBtn.style.setProperty('display', 'none', 'important');
      }
    }
    if (this.playerNameModalTitle) this.playerNameModalTitle.textContent = title;
    if (this.playerNameModalSubtitle) this.playerNameModalSubtitle.textContent = subtitle;
    if (this.playerNameConfirmBtn) {
      this.playerNameConfirmBtn.textContent = confirmText;
      this.playerNameConfirmBtn.disabled = false;
      this.playerNameConfirmBtn.style.opacity = '1';
      this.playerNameConfirmBtn.style.cursor = 'pointer';
    }
    if (this.playerNameInput) {
      this.playerNameInput.value = initialValue;
    }
    if (this.playerNameErrorText) {
      this.playerNameErrorText.textContent = '';
      this.playerNameErrorText.style.display = 'none';
    }
    this.playerNameModal.style.display = 'flex';
    setTimeout(() => {
      if (this.playerNameInput) {
        if (typeof this.playerNameInput.focus === 'function') this.playerNameInput.focus();
        if (typeof this.playerNameInput.select === 'function') this.playerNameInput.select();
      }
    }, 100);
  }

  hidePlayerNameModal() {
    if (this.playerNameModal) {
      this.playerNameModal.style.display = 'none';
    }
    if (this.playerNameCloseBtn) {
      this.playerNameCloseBtn.style.removeProperty('display');
    }
    if (this.playerNameErrorText) {
      this.playerNameErrorText.textContent = '';
      this.playerNameErrorText.style.display = 'none';
    }
  }

  showPlayerNameError(message) {
    if (this.playerNameErrorText) {
      this.playerNameErrorText.textContent = message;
      this.playerNameErrorText.style.display = 'block';
    }
    if (this.playerNameInput && typeof this.playerNameInput.focus === 'function') {
      this.playerNameInput.focus();
    }
  }
}
