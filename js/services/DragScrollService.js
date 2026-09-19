/**
 * DragScrollService - Handles desktop mouse drag-to-scroll sliding and
 * dynamic scrollbar idle auto-hide debouncing.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class DragScrollService {
  /**
   * Initializes one-time horizontal scrollbars with auto-hide idle behavior and drag sliding.
   * @param {Array<{ id: string, key: string }>} configs 
   */
  static initScrollbars(configs = null) {
    const scrollConfigs = configs || [
      { id: 'sectorPills', key: 'scrolled_sectorPills' },
      { id: 'sizePills', key: 'scrolled_sizePills' },
      { id: 'sortToggles', key: 'scrolled_sortToggles' },
      { id: 'holdingsTableContainer', key: 'scrolled_holdingsTable' },
      { id: 'pendingOrdersTableContainer', key: 'scrolled_pendingOrdersTable' },
      { id: 'gmPendingOrdersTableContainer', key: 'scrolled_gmPendingOrdersTable' },
      { id: 'gmPlayerSalaryTableContainer', key: 'scrolled_gmPlayerSalaryTable' }
    ];

    if (typeof document === 'undefined') return;

    scrollConfigs.forEach(cfg => {
      const el = document.getElementById(cfg.id);
      if (!el) return;

      // Enable desktop mouse click-and-drag sliding
      this.enableDragToScroll(el);

      if (el.dataset.scrollInitialized === 'true') return;
      el.dataset.scrollInitialized = 'true';

      // If user previously scrolled in this session, start hidden while idle
      const isScrolled = (typeof sessionStorage !== 'undefined') && sessionStorage.getItem(cfg.key) === 'true';
      if (isScrolled) {
        el.classList.add('scrolled-hidden');
      }

      let scrollDebounceTimer = null;

      const onScroll = () => {
        // Show scrollbar while scrolling
        el.classList.remove('scrolled-hidden');

        if (scrollDebounceTimer) {
          clearTimeout(scrollDebounceTimer);
        }

        // Wait 800ms after scrolling stops before smoothly hiding
        scrollDebounceTimer = setTimeout(() => {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(cfg.key, 'true');
          }
          el.classList.add('scrolled-hidden');
        }, 800);
      };

      el.addEventListener('scroll', onScroll, { passive: true });
    });
  }

  /**
   * Enables mouse drag-to-scroll on any overflow element.
   * @param {HTMLElement} el 
   */
  static enableDragToScroll(el) {
    if (!el || el.dataset.dragScrollInitialized === 'true') return;
    el.dataset.dragScrollInitialized = 'true';

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let dragDistance = 0;

    const updateCursor = () => {
      if (el.scrollWidth > el.clientWidth) {
        el.style.cursor = 'grab';
      } else {
        el.style.cursor = '';
      }
    };

    updateCursor();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateCursor, { passive: true });
    }

    el.addEventListener('mousedown', (e) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (e.button !== 0) return;

      isDown = true;
      dragDistance = 0;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none';
    });

    el.addEventListener('mouseleave', () => {
      if (!isDown) return;
      isDown = false;
      updateCursor();
      el.style.removeProperty('user-select');
    });

    el.addEventListener('mouseup', () => {
      if (!isDown) return;
      isDown = false;
      updateCursor();
      el.style.removeProperty('user-select');
    });

    el.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.5;
      dragDistance = Math.abs(x - startX);
      if (dragDistance > 3) {
        e.preventDefault();
        el.scrollLeft = scrollLeft - walk;
      }
    });

    // Suppress child button clicks if the user was performing a drag movement
    el.addEventListener('click', (e) => {
      if (dragDistance > 5) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }
}
