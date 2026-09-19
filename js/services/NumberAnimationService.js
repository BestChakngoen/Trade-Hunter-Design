/**
 * NumberAnimationService - Provides smooth number counting animations,
 * cubic-bezier easing, and directional color transitions for portfolio summary metrics.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class NumberAnimationService {
  /**
   * Reset animation memory for portfolio summary cards (e.g. on lobby return).
   */
  static resetAnimationState() {
    if (typeof document === 'undefined') return;

    ['portCash', 'portTotalAssets', 'portTotalPnL'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (el._rafId && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(el._rafId);
        }
        el._rafId = null;
        delete el._currentValue;
        delete el._currentPnL;
        delete el._currentPct;
      }
    });
  }

  /**
   * Smoothly animates a numeric value with number counting and directional color feedback.
   * While increasing: green + scale + glow (.port-counting-up)
   * While decreasing: red + scale + glow (.port-counting-down)
   * When finished: returns to idleClass (e.g. 'text-white')
   */
  static animateSummaryNumber(el, targetValue, idleClass = 'text-white', duration = 600) {
    if (!el) return;
    const target = Math.round(Number(targetValue) || 0);

    // Initial load: no animation, set directly
    if (el._currentValue === undefined) {
      el._currentValue = target;
      el.textContent = target.toLocaleString('en-US');
      el.className = `summary-value ${idleClass}`;
      return;
    }

    const start = el._currentValue;
    if (start === target) {
      el.textContent = target.toLocaleString('en-US');
      if (!el._rafId) {
        el.className = `summary-value ${idleClass}`;
      }
      return;
    }

    if (el._rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(el._rafId);
    }

    const isUp = target > start;
    const animClass = isUp ? 'port-counting-up' : 'port-counting-down';
    el.className = `summary-value ${animClass}`;

    if (typeof document !== 'undefined' && document.hidden) {
      el._currentValue = target;
      el.textContent = target.toLocaleString('en-US');
      el.className = `summary-value ${idleClass}`;
      return;
    }

    if (typeof requestAnimationFrame !== 'function') {
      el._currentValue = target;
      el.textContent = target.toLocaleString('en-US');
      el.className = `summary-value ${idleClass}`;
      return;
    }

    const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);

      const current = Math.round(start + (target - start) * eased);
      el.textContent = current.toLocaleString('en-US');
      el._currentValue = current;

      if (progress < 1) {
        el._rafId = requestAnimationFrame(step);
      } else {
        el._rafId = null;
        el._currentValue = target;
        el.textContent = target.toLocaleString('en-US');
        el.className = `summary-value ${idleClass}`;
      }
    };

    el._rafId = requestAnimationFrame(step);
  }

  /**
   * Smoothly animates PnL value and percentage with directional color feedback.
   * While increasing: green (.port-counting-up)
   * While decreasing: red (.port-counting-down)
   * When finished: keeps green (text-positive) if > 0, red (text-negative) if < 0, or white (text-white) if 0.
   */
  static animatePnL(el, targetPnL, targetPnLPct, duration = 600) {
    if (!el) return;
    const pnl = Math.round(Number(targetPnL) || 0);
    const pct = Number(targetPnLPct) || 0;

    const getFinalClass = (val) => {
      return val > 0 ? 'text-positive' : (val < 0 ? 'text-negative' : 'text-white');
    };

    const formatPnL = (v, p) => {
      const sign = v >= 0 ? '+' : '';
      const pctSign = p >= 0 ? '+' : '';
      return `${sign}${v.toLocaleString('en-US')} (${pctSign}${p.toFixed(2)}%)`;
    };

    // Initial load: no animation, set directly
    if (el._currentPnL === undefined) {
      el._currentPnL = pnl;
      el._currentPct = pct;
      el.textContent = formatPnL(pnl, pct);
      el.className = `summary-value ${getFinalClass(pnl)}`;
      return;
    }

    const startPnL = el._currentPnL;
    const startPct = el._currentPct !== undefined ? el._currentPct : pct;

    if (startPnL === pnl && Math.abs(startPct - pct) < 0.001) {
      el.textContent = formatPnL(pnl, pct);
      if (!el._rafId) {
        el.className = `summary-value ${getFinalClass(pnl)}`;
      }
      return;
    }

    if (el._rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(el._rafId);
    }

    const isUp = pnl > startPnL || (pnl === startPnL && pct > startPct);
    const animClass = isUp ? 'port-counting-up' : 'port-counting-down';
    el.className = `summary-value ${animClass}`;

    if (typeof document !== 'undefined' && document.hidden) {
      el._currentPnL = pnl;
      el._currentPct = pct;
      el.textContent = formatPnL(pnl, pct);
      el.className = `summary-value ${getFinalClass(pnl)}`;
      return;
    }

    if (typeof requestAnimationFrame !== 'function') {
      el._currentPnL = pnl;
      el._currentPct = pct;
      el.textContent = formatPnL(pnl, pct);
      el.className = `summary-value ${getFinalClass(pnl)}`;
      return;
    }

    const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);

      const currentPnL = Math.round(startPnL + (pnl - startPnL) * eased);
      const currentPct = startPct + (pct - startPct) * eased;
      el.textContent = formatPnL(currentPnL, currentPct);
      el._currentPnL = currentPnL;
      el._currentPct = currentPct;

      if (progress < 1) {
        el._rafId = requestAnimationFrame(step);
      } else {
        el._rafId = null;
        el._currentPnL = pnl;
        el._currentPct = pct;
        el.textContent = formatPnL(pnl, pct);
        el.className = `summary-value ${getFinalClass(pnl)}`;
      }
    };

    el._rafId = requestAnimationFrame(step);
  }
}
