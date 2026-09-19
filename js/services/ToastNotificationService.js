/**
 * ToastNotificationService - Dedicated notification service for Apple-style Dynamic Island toasts.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class ToastNotificationService {
  /**
   * Displays an Apple-style Dynamic Island Toast with icon, glow, and auto-dismissal.
   * Enforces a maximum of 3 concurrent active toasts.
   * @param {string} title - Toast heading
   * @param {string} message - Toast detail text
   * @param {'success'|'error'|'rejected'|'warning'|'gm'|'info'} [type='success'] - Visual theme
   * @param {number} [duration=3800] - Duration in ms before auto-dismissal
   */
  static showTopToast(title, message, type = 'success', duration = 3800) {
    if (typeof document === 'undefined') return;

    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.style.cssText = 'position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 999999; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; width: 100%; max-width: 380px; padding: 0 16px;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');

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

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        toast.style.transform = 'translateY(0) scale(1)';
        toast.style.opacity = '1';
      });
    } else {
      toast.style.transform = 'translateY(0) scale(1)';
      toast.style.opacity = '1';
    }

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
}
