/**
 * AlertModalService - Dedicated service for SweetAlert2 popups and native alert fallbacks.
 * Preserves scroll state during modal displays to avoid layout shifts.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class AlertModalService {
  /**
   * Captures scroll position of page shell and window before opening modal.
   * @returns {Object}
   */
  static captureScrollState() {
    const pageShell = typeof document !== 'undefined' ? document.querySelector('.page-shell') : null;
    const isShellVisible = pageShell && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
      ? window.getComputedStyle(pageShell).display !== 'none'
      : Boolean(pageShell);
    return {
      pageShell,
      isShellVisible,
      shellScroll: pageShell ? pageShell.scrollTop : 0,
      winScroll: (typeof window !== 'undefined' && (window.scrollY || (document && document.documentElement && document.documentElement.scrollTop))) || 0
    };
  }

  /**
   * Restores captured scroll positions after modal transitions.
   * @param {Object} state 
   */
  static restoreScrollState(state) {
    if (!state || !state.isShellVisible) return;
    if (state.pageShell && typeof state.pageShell.scrollTop === 'number') {
      state.pageShell.scrollTop = state.shellScroll;
    }
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo(0, state.winScroll);
    }
  }

  /**
   * Shows error dialog.
   * @param {string} title 
   * @param {string} text 
   */
  static showErrorAlert(title, text) {
    const scrollState = this.captureScrollState();
    if (typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    if (typeof window !== 'undefined' && window.Swal) {
      window.Swal.fire({
        icon: 'error',
        title: title,
        text: text,
        background: '#0b0f19',
        color: '#f8fafc',
        iconColor: '#ef4444',
        confirmButtonText: 'OK',
        heightAuto: false,
        scrollbarPadding: false,
        returnFocus: false,
        showClass: {
          popup: 'swal2-noanimation',
          backdrop: 'swal2-noanimation',
          icon: 'swal2-noanimation'
        },
        hideClass: {
          popup: '',
          backdrop: ''
        },
        didOpen: () => {
          this.restoreScrollState(scrollState);
        },
        willClose: () => {
          this.restoreScrollState(scrollState);
        },
        didClose: () => {
          this.restoreScrollState(scrollState);
        },
        customClass: {
          popup: 'trade-alert-popup',
          title: 'trade-alert-title',
          htmlContainer: 'trade-alert-text',
          confirmButton: 'trade-alert-error-btn'
        },
        buttonsStyling: false
      });
    } else if (typeof alert === 'function') {
      alert(`${title}\n${text}`);
    }
  }

  /**
   * Shows success dialog.
   * @param {string} title 
   * @param {string} text 
   */
  static showSuccessAlert(title, text) {
    const scrollState = this.captureScrollState();
    if (typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    if (typeof window !== 'undefined' && window.Swal) {
      window.Swal.fire({
        icon: 'success',
        title: title,
        text: text,
        background: '#0b0f19',
        color: '#f8fafc',
        iconColor: '#10b981',
        confirmButtonText: 'OK',
        heightAuto: false,
        scrollbarPadding: false,
        returnFocus: false,
        showClass: {
          popup: 'swal2-noanimation',
          backdrop: 'swal2-noanimation',
          icon: 'swal2-noanimation'
        },
        hideClass: {
          popup: '',
          backdrop: ''
        },
        didOpen: () => {
          this.restoreScrollState(scrollState);
        },
        willClose: () => {
          this.restoreScrollState(scrollState);
        },
        didClose: () => {
          this.restoreScrollState(scrollState);
        },
        customClass: {
          popup: 'trade-alert-popup',
          title: 'trade-alert-title',
          htmlContainer: 'trade-alert-text',
          confirmButton: 'trade-alert-ok-btn'
        },
        buttonsStyling: false
      });
    } else if (typeof alert === 'function') {
      alert(`${title}\n${text}`);
    }
  }

  /**
   * Shows confirm dialog with confirm and cancel buttons.
   * @param {string} title 
   * @param {string} text 
   * @param {string} [confirmText='Confirm'] 
   * @param {string} [cancelText='Cancel'] 
   * @returns {Promise<{isConfirmed: boolean}>}
   */
  static showConfirmAlert(title, text, confirmText = 'Confirm', cancelText = 'Cancel') {
    const scrollState = this.captureScrollState();
    if (typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    if (typeof window !== 'undefined' && window.Swal) {
      return window.Swal.fire({
        icon: 'question',
        title: title,
        text: text,
        background: '#0b0f19',
        color: '#f8fafc',
        iconColor: '#10b981',
        showCancelButton: true,
        confirmButtonText: confirmText,
        cancelButtonText: cancelText,
        heightAuto: false,
        scrollbarPadding: false,
        returnFocus: false,
        showClass: {
          popup: 'swal2-noanimation',
          backdrop: 'swal2-noanimation',
          icon: 'swal2-noanimation'
        },
        hideClass: {
          popup: '',
          backdrop: ''
        },
        didOpen: () => {
          this.restoreScrollState(scrollState);
        },
        willClose: () => {
          this.restoreScrollState(scrollState);
        },
        didClose: () => {
          this.restoreScrollState(scrollState);
        },
        customClass: {
          popup: 'trade-alert-popup',
          title: 'trade-alert-title',
          htmlContainer: 'trade-alert-text',
          confirmButton: 'trade-alert-ok-btn',
          cancelButton: 'trade-alert-cancel-btn',
          actions: 'trade-alert-actions'
        },
        buttonsStyling: false
      });
    } else if (typeof confirm === 'function') {
      const confirmed = confirm(`${title}\n${text}`);
      return Promise.resolve({ isConfirmed: confirmed });
    }
    return Promise.resolve({ isConfirmed: true });
  }

  /**
   * Shows an auto-dismiss modal with timer bar.
   * @param {string} title 
   * @param {string} text 
   * @param {number} [duration=3500] 
   */
  static showAutoDismissModal(title, text, duration = 3500) {
    const scrollState = this.captureScrollState();
    if (typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    if (typeof window !== 'undefined' && window.Swal) {
      return window.Swal.fire({
        icon: 'warning',
        title: title,
        text: text,
        background: '#0b0f19',
        color: '#f8fafc',
        iconColor: '#f59e0b',
        showConfirmButton: false,
        timer: duration,
        timerProgressBar: true,
        heightAuto: false,
        scrollbarPadding: false,
        returnFocus: false,
        showClass: {
          popup: 'swal2-noanimation',
          backdrop: 'swal2-noanimation',
          icon: 'swal2-noanimation'
        },
        hideClass: {
          popup: '',
          backdrop: ''
        },
        didOpen: () => {
          this.restoreScrollState(scrollState);
        },
        willClose: () => {
          this.restoreScrollState(scrollState);
        },
        didClose: () => {
          this.restoreScrollState(scrollState);
        },
        customClass: {
          popup: 'trade-alert-popup',
          title: 'trade-alert-title',
          htmlContainer: 'trade-alert-text'
        }
      });
    } else if (typeof alert === 'function') {
      alert(`${title}\n${text}`);
    }
  }
}
