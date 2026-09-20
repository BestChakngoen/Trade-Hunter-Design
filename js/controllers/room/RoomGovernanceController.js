import { GMHandoverService } from '../../services/GMHandoverService.js';
import { PlayerKickService } from '../../services/PlayerKickService.js';

/**
 * RoomGovernanceController - Dedicated controller responsible for room membership lifecycle,
 * Leave Room processing, GM role handover, player kick operations, and player display name updates.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class RoomGovernanceController {
  constructor({ state, renderer, firebaseService, playerSessionService = null, marketController = null }) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
    this.playerSessionService = playerSessionService;
    this.marketController = marketController;
    this._playerNameModalCleanup = null;
  }

  /**
   * Binds all governance and membership events.
   */
  bindAll() {
    this.bindLeaveRoomButton();
    this.bindGMHandoverButton();
    this.bindKickPlayerButton();
    this.bindPlayerNameEdit();
  }

  /**
   * Binds Leave Room button and confirmation dialogue.
   */
  bindLeaveRoomButton() {
    const leaveBtn = document.getElementById('leaveRoomBtn');
    if (!leaveBtn) return;

    leaveBtn.addEventListener('click', async () => {
      const isGM = (this.state.role === 'game_master');
      const title = "Leave Room";
      const message = isGM 
        ? "คุณแน่ใจหรือไม่ว่าต้องการออกจากห้อง? ในฐานะ GM การออกจากห้องอาจส่งมอบสิทธิ์ให้ผู้เล่นคนอื่น หรือปิดเซสชันห้องเกมสำหรับทุกคน"
        : "คุณแน่ใจหรือไม่ว่าต้องการออกจากห้อง? คุณจะออกจากห้องนี้ และสามารถเลือกบทบาทใหม่ได้เมื่อเข้าห้องอีกครั้ง";

      const result = await this.renderer.showConfirmAlert(title, message, "YES", "NO");
      if (!result || !result.isConfirmed) return;

      const roomCode = this.state.roomCode;
      const currentUser = this.firebaseService.getCurrentUser();
      const currentUid = currentUser ? currentUser.uid : null;

      if (this.marketController) {
        this.marketController.unsubscribeAll();
      }
      await this.removeMemberAndTransferIfNeeded(roomCode, currentUid, isGM);

      this.state.reset();
      this.renderer.showLobby();
    });
  }

  /**
   * Binds GM Handover modal trigger and transfer confirmation.
   */
  bindGMHandoverButton() {
    if (!this.renderer.openTransferGmModalBtn) return;

    this.renderer.openTransferGmModalBtn.addEventListener('click', async () => {
      const code = this.state.roomCode;
      if (!code) return;

      const roomSnap = await this.firebaseService.getRoomStateSnapshot(code);
      if (!roomSnap || !roomSnap.exists()) return;
      const roomData = roomSnap.val();
      const members = roomData.members || {};
      const currentUser = this.firebaseService.getCurrentUser();
      const currentUid = currentUser ? currentUser.uid : null;

      const eligiblePlayers = GMHandoverService.getEligiblePlayers(members, currentUid);

      this.renderer.showDirectTransferModal(eligiblePlayers, async (targetUid, targetPlayer) => {
        const hasBackup = Boolean(members[currentUid]?.backupPlayerProfile);
        const confirmResult = await this.renderer.showConfirmAlert(
          "ยืนยันการส่งมอบตำแหน่ง GM",
          `คุณต้องการส่งมอบสิทธิ์ GM ให้กับ "${targetPlayer.displayName}" หรือไม่? ${hasBackup ? '(ข้อมูลพอร์ตเดิมของคุณจะถูกโหลดกลับมา)' : ''}`,
          "ยืนยัน",
          "ยกเลิก"
        );

        if (!confirmResult || !confirmResult.isConfirmed) return;

        try {
          const res = await this.firebaseService.transferGMRoleDirectly(code, currentUid, targetUid);
          if (res && res.success) {
            let restoredName = res.formerGmRestoredProfile?.displayName;
            if (!restoredName || restoredName === 'GM') {
              try {
                if (typeof localStorage !== 'undefined') {
                  restoredName = localStorage.getItem('traderHunter_playerName') || '';
                }
              } catch (e) {}
            }
            if (!restoredName || restoredName === 'GM') {
              restoredName = (this.state.playerName && this.state.playerName !== 'GM') ? this.state.playerName : 'Player_1';
            }

            this.state.setRole('player');
            this.state.setPlayerName(restoredName);
            this.state.isSpectating = false;
            this.renderer.hideKickPlayerModal();
            if (this.renderer.spectatorToggleBtn) this.renderer.spectatorToggleBtn.style.display = 'none';
            this.renderer.updateSpectatorButtonUI(false);
            this.firebaseService.configureDisconnectCleanup(code, currentUid, false);
            this.renderer.updateControlsVisibility('player', restoredName, this.state.gameMode);

            this.renderer.showTopToast(
              "GM HANDOVER SUCCESS",
              `ส่งมอบตำแหน่ง GM ให้กับ "${targetPlayer.displayName}" สำเร็จแล้ว!`,
              "success"
            );
            if (res.formerGmRestoredProfile) {
              this.renderer.showTopToast(
                "DATA RESTORED",
                `โหลดข้อมูลเดิมของ ${restoredName} เรียบร้อยแล้ว`,
                "approved"
              );
            }

            // Automatically prompt the former GM to set their player name (forced: no close button)
            setTimeout(() => {
              this.openPlayerNameModal({
                title: "แก้ไขชื่อผู้เล่น",
                subtitle: "คุณได้เปลี่ยนบทบาทเป็นผู้เล่นแล้ว โปรดระบุชื่อที่ต้องการใช้แสดงในห้องเกม (1 - 20 ตัวอักษร)",
                confirmText: "บันทึกชื่อ",
                initialValue: restoredName,
                allowClose: false
              });
            }, 300);
          } else {
            this.renderer.showErrorAlert("Transfer Failed", "ไม่สามารถส่งมอบตำแหน่งได้ กรุณาลองใหม่อีกครั้ง");
          }
        } catch (err) {
          console.error("[RoomGovernanceController] Error transferring GM role:", err);
          this.renderer.showErrorAlert("Error", "เกิดข้อผิดพลาดในการส่งมอบตำแหน่ง GM");
        }
      });
    });
  }

  /**
   * Binds Kick Player modal trigger and purge confirmation.
   */
  bindKickPlayerButton() {
    if (!this.renderer.openKickPlayerModalBtn) return;

    this.renderer.openKickPlayerModalBtn.addEventListener('click', async () => {
      const code = this.state.roomCode;
      if (!code) return;

      const members = this.marketController?.latestRoomMembers || (await this.firebaseService.getRoomStateSnapshot(code))?.val()?.members || {};
      const currentUser = this.firebaseService.getCurrentUser();
      const currentUid = currentUser ? currentUser.uid : null;

      const eligiblePlayers = PlayerKickService.getEligiblePlayers(members, currentUid);

      this.renderer.showKickPlayerModal(eligiblePlayers, async (targetUid, targetPlayer) => {
        if (!targetPlayer) return;
        const confirmResult = await this.renderer.showConfirmAlert(
          "ยืนยันการบังคับออกจากห้อง",
          `คุณแน่ใจหรือไม่ว่าต้องการเตะ "${targetPlayer.displayName}" ออกจากห้องเกม? ข้อมูลพอร์ตและคำสั่งซื้อขายทั้งหมดจะถูกล้างถาวร`,
          "ยืนยัน",
          "ยกเลิก"
        );

        if (!confirmResult || !confirmResult.isConfirmed) return;

        try {
          const res = await this.firebaseService.kickPlayerAndPurgeData(code, targetUid);
          if (res && res.success) {
            this.renderer.showTopToast(
              "PLAYER KICKED",
              `นำ "${targetPlayer.displayName}" ออกจากห้องและล้างข้อมูลเรียบร้อยแล้ว`,
              "approved"
            );
          } else {
            this.renderer.showErrorAlert("Kick Failed", "ไม่สามารถเตะผู้เล่นได้ กรุณาลองใหม่อีกครั้ง");
          }
        } catch (err) {
          console.error("[RoomGovernanceController] Error kicking player:", err);
          this.renderer.showErrorAlert("Error", "เกิดข้อผิดพลาดในการเตะผู้เล่นออกจากห้อง");
        }
      });
    });
  }

  /**
   * Opens player display name modal and saves updates to Firebase and State.
   */
  openPlayerNameModal({
    title = "แก้ไขชื่อผู้เล่น",
    subtitle = "โปรดระบุชื่อใหม่ที่ต้องการใช้แสดงในห้องเกม (1 - 20 ตัวอักษร)",
    confirmText = "บันทึกชื่อ",
    initialValue = null,
    allowClose = true
  } = {}) {
    if (this.state.role !== 'player' && allowClose) return;

    const code = this.state.roomCode;
    if (!code) return;

    const modal = this.renderer.playerNameModal;
    const input = this.renderer.playerNameInput;
    const btnConfirm = this.renderer.playerNameConfirmBtn;
    const btnClose = this.renderer.playerNameCloseBtn;

    if (!modal || !input || !btnConfirm) return;

    if (this._playerNameModalCleanup) {
      this._playerNameModalCleanup();
      this._playerNameModalCleanup = null;
    }

    const defaultVal = (initialValue !== null) 
      ? initialValue 
      : ((this.state.playerName && this.state.playerName !== 'GM') ? this.state.playerName : '');

    // 1. Open modal immediately for instant Apple-style responsiveness (0ms latency)
    this.renderer.showPlayerNameModal({
      title,
      subtitle,
      confirmText,
      initialValue: defaultVal,
      allowClose
    });

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === 'Escape') {
        if (allowClose) {
          handleClose();
        }
      }
    };

    const handleOverlayClick = (e) => {
      if (e.target === modal && allowClose) {
        handleClose();
      }
    };

    const cleanup = () => {
      document.removeEventListener('keydown', handleKeyDown);
      btnConfirm.removeEventListener('click', handleConfirm);
      if (btnClose) btnClose.removeEventListener('click', handleClose);
      modal.removeEventListener('click', handleOverlayClick);
      this._playerNameModalCleanup = null;
    };

    this._playerNameModalCleanup = cleanup;

    const handleClose = () => {
      cleanup();
      this.renderer.hidePlayerNameModal();
    };

    const handleConfirm = async () => {
      const raw = (input.value || '').trim();
      if (!raw) {
        this.renderer.showPlayerNameError("กรุณากรอกชื่อผู้เล่น");
        return;
      }
      if (raw.length < 1 || raw.length > 20) {
        this.renderer.showPlayerNameError("ความยาวชื่อต้องอยู่ระหว่าง 1 - 20 ตัวอักษร");
        return;
      }
      const upper = raw.toUpperCase();
      if (upper === 'GM' || upper === 'GAME MASTER' || upper === 'GAME_MASTER') {
        this.renderer.showPlayerNameError("สงวนสิทธิ์ห้ามใช้ชื่อ GM หรือ Game Master");
        return;
      btnConfirm.disabled = true;
      btnConfirm.style.opacity = '0.6';

      try {
        // Check for duplicate names against current room members in Realtime DB
        const roomSnap = await this.firebaseService.getRoomStateSnapshot(code);
        if (roomSnap && roomSnap.exists()) {
          const roomData = roomSnap.val();
          const members = roomData.members || {};
          const currentUid = this.firebaseService.getCurrentUser()?.uid;
          const existingNames = new Set(
            Object.entries(members)
              .filter(([uid, m]) => uid !== currentUid && m && m.role === 'player' && m.displayName)
              .map(([uid, m]) => m.displayName)
          );
          if (existingNames.has(raw)) {
            btnConfirm.disabled = false;
            btnConfirm.style.opacity = '1';
            this.renderer.showPlayerNameError(`ชื่อ "${raw}" มีผู้เล่นอื่นในห้องใช้อยู่แล้ว โปรดตั้งชื่ออื่น`);
            return;
          }
        }

        const user = this.firebaseService.getCurrentUser();
        const currentUid = user ? user.uid : null;
        if (currentUid && code) {
          const updates = {
            [`members/${currentUid}/displayName`]: raw
          };
          const sessionToken = this.playerSessionService ? this.playerSessionService.getOrCreateSessionToken(code) : null;
          if (sessionToken) {
            updates[`savedMembers/${sessionToken}/displayName`] = raw;
          }

          // Also update username in any existing pending orders from this user
          if (roomSnap && roomSnap.exists()) {
            const pendingOrders = roomSnap.val().pendingOrders || {};
            Object.entries(pendingOrders).forEach(([orderId, ord]) => {
              if (ord && ord.uid === currentUid) {
                updates[`pendingOrders/${orderId}/username`] = raw;
              }
            });
          }

          await this.firebaseService.updateRoom(code, updates);
        }

        this.state.setPlayerName(raw);
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('traderHunter_playerName', raw);
          }
        } catch (e) {}

        this.renderer.updateControlsVisibility(this.state.role, raw, this.state.gameMode);
        handleClose();
        this.renderer.showTopToast("NAME UPDATED", `เปลี่ยนชื่อผู้เล่นเป็น "${raw}" เรียบร้อยแล้ว`, "success");
      } catch (err) {
        console.error("Failed to update player name:", err);
        btnConfirm.disabled = false;
        btnConfirm.style.opacity = '1';
        this.renderer.showErrorAlert("Error", "ไม่สามารถอัปเดตชื่อผู้เล่นได้ โปรดลองใหม่อีกครั้ง");
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    btnConfirm.addEventListener('click', handleConfirm);
    if (btnClose && allowClose) btnClose.addEventListener('click', handleClose);
    if (allowClose) modal.addEventListener('click', handleOverlayClick);
  }

  /**
   * Binds player name edit triggers from button and badge.
   */
  bindPlayerNameEdit() {
    if (this.renderer.editPlayerNameBtn) {
      this.renderer.editPlayerNameBtn.addEventListener('click', () => {
        this.openPlayerNameModal();
      });
    }
    if (this.renderer.userRoleBadge) {
      this.renderer.userRoleBadge.addEventListener('click', () => {
        this.openPlayerNameModal();
      });
    }
  }

  /**
   * Helper to remove member node and handle GM succession or room cleanup.
   */
  async removeMemberAndTransferIfNeeded(roomCode, currentUid, isGM) {
    if (!roomCode || !currentUid) return;

    if (isGM) {
      try {
        const roomSnap = await this.firebaseService.getRoomStateSnapshot(roomCode);
        const roomData = roomSnap ? roomSnap.val() : null;
        const members = roomData ? (roomData.members || {}) : {};
        const otherMembers = Object.keys(members).filter(uid => uid !== currentUid);

        await this.firebaseService.removeMemberFromRoom(roomCode, currentUid);

        if (otherMembers.length > 0) {
          await this.firebaseService.triggerGMTransfer(roomCode);
        } else {
          await this.firebaseService.deleteRoomData(roomCode);
        }
      } catch (e) {
        console.error("[RoomGovernanceController] Failed to handle GM leave:", e);
      }
    } else {
      try {
        await this.firebaseService.removeMemberFromRoom(roomCode, currentUid);
        const roomSnap = await this.firebaseService.getRoomStateSnapshot(roomCode);
        const roomData = roomSnap ? roomSnap.val() : null;
        const members = roomData ? (roomData.members || {}) : {};
        if (Object.keys(members).length === 0) {
          await this.firebaseService.deleteRoomData(roomCode);
        }
      } catch (e) {
        console.error("[RoomGovernanceController] Failed to remove player on leave:", e);
      }
    }

    // Always clear local room session and Firebase savedMember session token on explicit Leave Room
    if (this.playerSessionService && roomCode) {
      const sessionToken = this.playerSessionService.getOrCreateSessionToken(roomCode);
      if (sessionToken) {
        try {
          await this.firebaseService.updateRoom(roomCode, {
            [`savedMembers/${sessionToken}`]: null
          });
        } catch (e) {}
      }
      this.playerSessionService.clearRoomSession(roomCode);
    }
  }
}
