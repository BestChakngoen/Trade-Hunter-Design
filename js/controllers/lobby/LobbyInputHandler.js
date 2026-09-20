/**
 * LobbyInputHandler - Manages PIN Code slots UI, input masking/sanitizing,
 * mobile keyboard viewport handling, and shake animations for the Lobby screen.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class LobbyInputHandler {
  constructor(renderer, playerSessionService = null) {
    this.renderer = renderer;
    this.playerSessionService = playerSessionService;
  }

  /**
   * Binds input normalization, focus/blur styling, viewport resize, and click focus.
   */
  bindInputEvents(onTriggerSubmit = null) {
    const input = this.renderer.roomCodeInput;
    if (!input) return;

    // 1. Sanitize input to uppercase alphanumeric
    input.addEventListener('input', (e) => {
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const originalVal = e.target.value;
      const cleanedVal = originalVal.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (originalVal !== cleanedVal) {
        e.target.value = cleanedVal;
        if (start !== null && end !== null) {
          const diff = originalVal.length - cleanedVal.length;
          const newPos = Math.max(0, start - diff);
          e.target.setSelectionRange(newPos, newPos);
        }
      }
      this.updateRoomCodeSlots(e.target.value);
    });

    // 2. Focus events & styling
    input.addEventListener('focus', () => {
      const codeBox = input.closest('.lobby-code-box');
      if (codeBox) codeBox.classList.add('code-box-focused');
      this.updateRoomCodeSlots(input.value, true);
      const lobbyScreen = document.getElementById('lobbyScreen');
      if (lobbyScreen) lobbyScreen.classList.add('lobby-keyboard-active');
    });

    // 3. Blur events & styling
    input.addEventListener('blur', () => {
      const codeBox = input.closest('.lobby-code-box');
      if (codeBox) codeBox.classList.remove('code-box-focused');
      const slotsContainer = document.getElementById('roomCodeSlots');
      if (slotsContainer) {
        slotsContainer.querySelectorAll('.code-slot').forEach(slot => slot.classList.remove('active-focus'));
      }
      this.updateRoomCodeSlots(input.value, false);
      const lobbyScreen = document.getElementById('lobbyScreen');
      if (lobbyScreen) lobbyScreen.classList.remove('lobby-keyboard-active');
    });

    // 4. Click codeBox to focus
    const codeBox = input.closest('.lobby-code-box');
    if (codeBox) {
      codeBox.addEventListener('click', () => {
        if (document.activeElement !== input) {
          input.focus();
        }
      });
    }

    // 5. Mobile visual viewport detection (keyboard presence)
    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        const lobbyScreen = document.getElementById('lobbyScreen');
        if (!lobbyScreen) return;
        const isKeyboardOpen = window.visualViewport.height < window.innerHeight * 0.78;
        if (isKeyboardOpen && document.activeElement === input) {
          lobbyScreen.classList.add('lobby-keyboard-active');
        } else if (!isKeyboardOpen) {
          lobbyScreen.classList.remove('lobby-keyboard-active');
        }
      });
    }

    // 6. Pre-fill last active room code if available with animated checking indicator
    if (this.playerSessionService) {
      this.prefillLastActiveRoomCode();
    }

    // 7. Extra submit buttons
    const keySubmitBtn = document.querySelector('.lobby-key-submit-btn');
    if (keySubmitBtn) {
      keySubmitBtn.addEventListener('click', (e) => {
        if (this.triggerShakeIfEmpty(e)) return;
      });
    }

    if (this.renderer.joinRoomBtn) {
      this.renderer.joinRoomBtn.addEventListener('click', (e) => {
        if (this.triggerShakeIfEmpty(e)) return;
      });
    }
  }

  /**
   * Pre-fills last active room code if available, displaying the animated Checking... indicator
   * so the user visually sees that the system is actively retrieving and populating their prior session.
   */
  async prefillLastActiveRoomCode() {
    if (!this.playerSessionService) return;
    const input = this.renderer.roomCodeInput;
    if (!input || input.value) return;

    const lastCode = this.playerSessionService.getLastActiveRoomCode();
    if (!lastCode) return;

    // Show animated Checking... indicator while retrieving and setting up old room code
    if (typeof this.renderer.setLobbyChecking === 'function') {
      this.renderer.setLobbyChecking(true);
    }

    try {
      // Brief smooth transition to visually signify checking/retrieval is occurring
      await new Promise(resolve => setTimeout(resolve, 450));

      if (!input.value) {
        input.value = lastCode;
        this.updateRoomCodeSlots(lastCode);
      }
    } finally {
      if (typeof this.renderer.setLobbyChecking === 'function') {
        this.renderer.setLobbyChecking(false);
      }
    }
  }

  /**
   * Shakes the room code box if the input is empty.
   */
  triggerShakeIfEmpty(e = null) {
    const input = this.renderer.roomCodeInput;
    const code = input ? input.value.trim().toUpperCase() : '';
    if (!code) {
      if (e) e.preventDefault();
      if (typeof this.renderer.triggerShakeCodeBox === 'function') {
        this.renderer.triggerShakeCodeBox();
      }
      return true;
    }
    return false;
  }

  /**
   * Updates PIN code slots DOM visualization.
   */
  updateRoomCodeSlots(val = '', isFocused = null) {
    if (typeof document === 'undefined') return;

    const slotsContainer = document.getElementById('roomCodeSlots');
    if (!slotsContainer) return;
    const input = this.renderer.roomCodeInput;
    const currentlyFocused = (isFocused !== null) ? isFocused : (input && document.activeElement === input);
    const slots = slotsContainer.querySelectorAll('.code-slot');
    const cleanVal = (val || '').trim().toUpperCase();

    // Show slots if user typed something OR if input is currently focused
    const shouldShowSlots = cleanVal.length > 0 || currentlyFocused;

    if (shouldShowSlots) {
      slotsContainer.classList.add('visible-slots');
      slotsContainer.style.cssText = 'display: flex !important; opacity: 1 !important;';
    } else {
      slotsContainer.classList.remove('visible-slots');
      slotsContainer.style.cssText = 'display: none !important; opacity: 0 !important;';
    }

    slots.forEach((slot, index) => {
      const char = cleanVal[index] || '';
      slot.textContent = char;
      if (char && cleanVal.length > 0) {
        slot.classList.add('filled');
      } else {
        slot.classList.remove('filled');
      }

      // Highlight active slot: if empty, slot 0; if partially filled, the next slot
      if (currentlyFocused && index === cleanVal.length && cleanVal.length < 6) {
        slot.classList.add('active-focus');
      } else {
        slot.classList.remove('active-focus');
      }
    });
  }

  /**
   * Clears the input and resets PIN slot boxes.
   */
  clearLobbyRoomCodeInput() {
    if (this.renderer.roomCodeInput) {
      this.renderer.roomCodeInput.value = '';
    }
    this.updateRoomCodeSlots('');
    if (typeof this.renderer.clearRoomCodeSlots === 'function') {
      this.renderer.clearRoomCodeSlots();
    }
  }
}
