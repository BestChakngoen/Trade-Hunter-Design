/**
 * GovernanceModalsRenderer - Dedicated renderer for GM transfer, Direct GM Handover, and Kick Player modals.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class GovernanceModalsRenderer {
  constructor() {
    // GM Succession / Claim Modal
    this.gmTransferModal = document.getElementById('gmTransferModal');
    this.gmTransferClaimBtn = document.getElementById('gmTransferClaimBtn');
    this.gmTransferDeclineBtn = document.getElementById('gmTransferDeclineBtn');

    // Direct GM Handover Modal (Danger Zone)
    this.openTransferGmModalBtn = document.getElementById('openTransferGmModalBtn');
    this.gmDirectTransferModal = document.getElementById('gmDirectTransferModal');
    this.gmTransferPlayerList = document.getElementById('gmTransferPlayerList');
    this.confirmDirectTransferBtn = document.getElementById('confirmDirectTransferBtn');
    this.cancelDirectTransferBtn = document.getElementById('cancelDirectTransferBtn');
    this.closeDirectTransferModalBtn = document.getElementById('closeDirectTransferModalBtn');

    // Kick Player Modal (Danger Zone)
    this.openKickPlayerModalBtn = document.getElementById('openKickPlayerModalBtn');
    this.kickPlayerModal = document.getElementById('kickPlayerModal');
    this.kickPlayerList = document.getElementById('kickPlayerList');
    this.confirmKickPlayerBtn = document.getElementById('confirmKickPlayerBtn');
    this.cancelKickPlayerBtn = document.getElementById('cancelKickPlayerBtn');
    this.closeKickPlayerModalBtn = document.getElementById('closeKickPlayerModalBtn');

    this.selectedKickPlayerUid = null;
    this.currentKickEligiblePlayers = [];
    this.onKickPlayerConfirmCallback = null;
    this._kickPlayerModalCleanup = null;
  }

  // --- GM Succession Modal ---
  showGMTransferModal(onClaim, onDecline) {
    const modal = this.gmTransferModal;
    const claimBtn = this.gmTransferClaimBtn;
    const declineBtn = this.gmTransferDeclineBtn;
    if (!modal) return;

    modal.style.display = 'flex';

    const handleClaim = (e) => {
      e.preventDefault();
      if (onClaim) onClaim();
    };

    const handleDecline = (e) => {
      e.preventDefault();
      modal.style.display = 'none';
      if (onDecline) onDecline();
    };

    if (claimBtn) {
      claimBtn.onclick = handleClaim;
    }
    if (declineBtn) {
      declineBtn.onclick = handleDecline;
    }
  }

  hideGMTransferModal() {
    if (this.gmTransferModal) {
      this.gmTransferModal.style.display = 'none';
    }
  }

  // --- Direct GM Handover Modal ---
  showDirectTransferModal(players = [], onConfirm = null) {
    const modal = this.gmDirectTransferModal;
    const listContainer = this.gmTransferPlayerList;
    const confirmBtn = this.confirmDirectTransferBtn;
    const cancelBtn = this.cancelDirectTransferBtn;
    const closeBtn = this.closeDirectTransferModalBtn;
    if (!modal || !listContainer) return;

    let selectedUid = null;
    listContainer.innerHTML = '';
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';
      confirmBtn.style.cursor = 'not-allowed';
    }

    if (players.length === 0) {
      listContainer.innerHTML = `<div class="gm-transfer-empty">ไม่มีผู้เล่นอื่นในห้องขณะนี้ (ต้องการผู้เล่นอย่างน้อย 1 คนเพื่อส่งมอบตำแหน่ง)</div>`;
    } else {
      players.forEach(player => {
        const item = document.createElement('div');
        item.className = 'gm-transfer-player-item';
        item.dataset.uid = player.uid;

        const cashFormatted = (player.cash || 0).toLocaleString('en-US');
        const initial = (player.displayName || 'P').charAt(0).toUpperCase();

        item.innerHTML = `
          <div class="gm-transfer-player-info">
            <div class="gm-transfer-avatar">${initial}</div>
            <div>
              <div class="gm-transfer-player-name">${player.displayName || 'Player'}</div>
              <div class="gm-transfer-player-stats">Cash: ${cashFormatted} ฿</div>
            </div>
          </div>
          <div class="gm-transfer-radio-indicator"></div>
        `;

        item.addEventListener('click', () => {
          listContainer.querySelectorAll('.gm-transfer-player-item').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          selectedUid = player.uid;
          if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
            confirmBtn.style.cursor = 'pointer';
          }
        });

        listContainer.appendChild(item);
      });
    }

    modal.style.display = 'flex';

    const handleConfirm = () => {
      if (!selectedUid) return;
      cleanup();
      modal.style.display = 'none';
      if (typeof onConfirm === 'function') {
        const selectedPlayer = players.find(p => p.uid === selectedUid);
        onConfirm(selectedUid, selectedPlayer);
      }
    };

    const handleClose = () => {
      cleanup();
      modal.style.display = 'none';
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    const handleOverlayClick = (e) => {
      if (e.target === modal) {
        handleClose();
      }
    };

    const cleanup = () => {
      if (confirmBtn) confirmBtn.removeEventListener('click', handleConfirm);
      if (cancelBtn) cancelBtn.removeEventListener('click', handleClose);
      if (closeBtn) closeBtn.removeEventListener('click', handleClose);
      document.removeEventListener('keydown', handleKeyDown);
      modal.removeEventListener('click', handleOverlayClick);
    };

    if (confirmBtn) confirmBtn.addEventListener('click', handleConfirm);
    if (cancelBtn) cancelBtn.addEventListener('click', handleClose);
    if (closeBtn) closeBtn.addEventListener('click', handleClose);
    document.addEventListener('keydown', handleKeyDown);
    modal.addEventListener('click', handleOverlayClick);
  }

  hideDirectTransferModal() {
    if (this.gmDirectTransferModal) {
      this.gmDirectTransferModal.style.display = 'none';
    }
  }

  // --- Kick Player Modal ---
  isKickPlayerModalOpen() {
    return Boolean(this.kickPlayerModal && this.kickPlayerModal.style.display === 'flex');
  }

  updateKickPlayerList(players = []) {
    const listContainer = this.kickPlayerList;
    const confirmBtn = this.confirmKickPlayerBtn;
    if (!listContainer) return;

    this.currentKickEligiblePlayers = Array.isArray(players) ? players : [];
    listContainer.innerHTML = '';

    const stillSelected = this.selectedKickPlayerUid 
      ? this.currentKickEligiblePlayers.find(p => p.uid === this.selectedKickPlayerUid)
      : null;

    if (!stillSelected) {
      this.selectedKickPlayerUid = null;
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.5';
        confirmBtn.style.cursor = 'not-allowed';
      }
    } else {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        confirmBtn.style.cursor = 'pointer';
      }
    }

    if (this.currentKickEligiblePlayers.length === 0) {
      listContainer.innerHTML = `<div class="kick-player-empty">ไม่มีผู้เล่นอื่นในห้องขณะนี้ (ไม่พบผู้เล่นที่สามารถบังคับออกได้)</div>`;
      return;
    }

    this.currentKickEligiblePlayers.forEach(player => {
      const item = document.createElement('div');
      item.className = 'kick-player-item';
      if (player.uid === this.selectedKickPlayerUid) {
        item.classList.add('selected');
      }
      item.dataset.uid = player.uid;

      const cashFormatted = (player.cash || 0).toLocaleString('en-US');
      const initial = (player.displayName || 'P').charAt(0).toUpperCase();
      const isOnline = player.online !== false;
      const statusBadge = isOnline 
        ? `<span class="kick-status-badge online"><span class="kick-status-dot online"></span> ออนไลน์</span>`
        : `<span class="kick-status-badge offline"><span class="kick-status-dot offline"></span> ออฟไลน์</span>`;

      item.innerHTML = `
        <div class="kick-player-info">
          <div class="kick-player-avatar">${initial}</div>
          <div>
            <div class="kick-player-name">${player.displayName || 'Player'} ${statusBadge}</div>
            <div class="kick-player-stats">Cash: ${cashFormatted} ฿</div>
          </div>
        </div>
        <div class="kick-player-radio-indicator"></div>
      `;

      item.addEventListener('click', () => {
        listContainer.querySelectorAll('.kick-player-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        this.selectedKickPlayerUid = player.uid;
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.style.opacity = '1';
          confirmBtn.style.cursor = 'pointer';
        }
      });

      listContainer.appendChild(item);
    });
  }

  showKickPlayerModal(players = [], onConfirm = null) {
    const modal = this.kickPlayerModal;
    const confirmBtn = this.confirmKickPlayerBtn;
    const cancelBtn = this.cancelKickPlayerBtn;
    const closeBtn = this.closeKickPlayerModalBtn;
    if (!modal) return;

    if (this._kickPlayerModalCleanup) {
      this._kickPlayerModalCleanup();
      this._kickPlayerModalCleanup = null;
    }

    this.selectedKickPlayerUid = null;
    this.onKickPlayerConfirmCallback = onConfirm;
    this.updateKickPlayerList(players);

    modal.style.display = 'flex';

    const handleConfirm = () => {
      if (!this.selectedKickPlayerUid) return;
      const targetUid = this.selectedKickPlayerUid;
      const targetPlayer = this.currentKickEligiblePlayers.find(p => p.uid === targetUid) || { uid: targetUid, displayName: 'ผู้เล่น' };
      const callback = this.onKickPlayerConfirmCallback;
      this.hideKickPlayerModal();
      if (typeof callback === 'function') {
        callback(targetUid, targetPlayer);
      }
    };

    const handleClose = () => {
      this.hideKickPlayerModal();
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    const handleOverlayClick = (e) => {
      if (e.target === modal) {
        handleClose();
      }
    };

    const cleanup = () => {
      if (confirmBtn) confirmBtn.removeEventListener('click', handleConfirm);
      if (cancelBtn) cancelBtn.removeEventListener('click', handleClose);
      if (closeBtn) closeBtn.removeEventListener('click', handleClose);
      document.removeEventListener('keydown', handleKeyDown);
      modal.removeEventListener('click', handleOverlayClick);
      this._kickPlayerModalCleanup = null;
    };

    this._kickPlayerModalCleanup = cleanup;

    if (confirmBtn) confirmBtn.addEventListener('click', handleConfirm);
    if (cancelBtn) cancelBtn.addEventListener('click', handleClose);
    if (closeBtn) closeBtn.addEventListener('click', handleClose);
    document.addEventListener('keydown', handleKeyDown);
    modal.addEventListener('click', handleOverlayClick);
  }

  hideKickPlayerModal() {
    if (this._kickPlayerModalCleanup) {
      this._kickPlayerModalCleanup();
      this._kickPlayerModalCleanup = null;
    }
    this.selectedKickPlayerUid = null;
    this.onKickPlayerConfirmCallback = null;
    if (this.kickPlayerModal) {
      this.kickPlayerModal.style.display = 'none';
    }
  }
}
