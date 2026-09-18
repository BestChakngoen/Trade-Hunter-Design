/**
 * MarketBoardController - Manages Sector Filtering, Sorting, Card Controls, Inline Charts, and Danger Zone Operations.
 */
export class MarketBoardController {
  constructor(state, renderer, firebaseService) {
    this.state = state;
    this.renderer = renderer;
    this.firebaseService = firebaseService;
  }

  bindSectorFilter() {
    if (!this.renderer.sectorPills) return;
    this.initOneTimeScrollbars();

    this.renderer.sectorPills.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      
      const value = pill.getAttribute('data-value');
      const selected = this.state.selectedSectors;
      
      // Single Group Filter: Clear Size filter and Sort states
      this.state.selectedSizes.clear();
      Object.keys(this.state.sortStates).forEach(key => {
        this.state.sortStates[key].enabled = false;
      });

      const isAlreadyActive = selected.has(value);
      selected.clear();

      if (!isAlreadyActive) {
        selected.add(value);
      }
      
      this.renderer.updateSectorPillsUI(selected);
      this.renderer.updateSizePillsUI(this.state.selectedSizes);
      this.renderer.updateSortButtonsUI(this.state.sortStates);
      if (typeof pill.blur === 'function') {
        pill.blur();
      }
      this.updateViewGrid();
    });
  }

  bindSizeFilter() {
    if (!this.renderer.sizePills) return;

    this.renderer.sizePills.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill');
      if (!pill) return;
      
      const value = pill.getAttribute('data-value');
      const selected = this.state.selectedSizes;
      
      // Single Group Filter: Clear Sector filter and Sort states
      this.state.selectedSectors.clear();
      Object.keys(this.state.sortStates).forEach(key => {
        this.state.sortStates[key].enabled = false;
      });

      const isAlreadyActive = selected.has(value);
      selected.clear();

      if (!isAlreadyActive) {
        selected.add(value);
      }
      
      this.renderer.updateSectorPillsUI(this.state.selectedSectors);
      this.renderer.updateSizePillsUI(selected);
      this.renderer.updateSortButtonsUI(this.state.sortStates);
      if (typeof pill.blur === 'function') {
        pill.blur();
      }
      this.updateViewGrid();
    });
  }

  initOneTimeScrollbars() {
    const scrollConfigs = [
      { id: 'sectorPills', key: 'scrolled_sectorPills' },
      { id: 'sizePills', key: 'scrolled_sizePills' },
      { id: 'sortToggles', key: 'scrolled_sortToggles' },
      { id: 'holdingsTableContainer', key: 'scrolled_holdingsTable' },
      { id: 'pendingOrdersTableContainer', key: 'scrolled_pendingOrdersTable' },
      { id: 'gmPendingOrdersTableContainer', key: 'scrolled_gmPendingOrdersTable' },
      { id: 'gmPlayerSalaryTableContainer', key: 'scrolled_gmPlayerSalaryTable' }
    ];

    scrollConfigs.forEach(cfg => {
      const el = document.getElementById(cfg.id);
      if (!el) return;

      // Enable desktop mouse click-and-drag sliding
      this.enableDragToScroll(el);

      if (el.dataset.scrollInitialized === 'true') return;
      el.dataset.scrollInitialized = 'true';

      // If user previously scrolled in this session, start hidden while idle
      const isScrolled = sessionStorage.getItem(cfg.key) === 'true';
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
          sessionStorage.setItem(cfg.key, 'true');
          el.classList.add('scrolled-hidden');
        }, 800);
      };

      el.addEventListener('scroll', onScroll, { passive: true });
    });
  }

  enableDragToScroll(el) {
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
    window.addEventListener('resize', updateCursor, { passive: true });

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

  bindSortButtons() {
    const handleSortClick = (type, e) => {
      const sortStates = this.state.sortStates;
      const isAlreadyEnabled = sortStates[type] ? sortStates[type].enabled : false;

      // Single Group Filter: Clear Sector and Size filters when using Sort By
      this.state.selectedSectors.clear();
      this.state.selectedSizes.clear();

      // Single-Criteria Sorting: Disable all other sort criteria when selecting a new one
      Object.keys(sortStates).forEach(key => {
        if (key !== type) {
          sortStates[key].enabled = false;
        }
      });

      if (type === 'SECTOR') {
        sortStates.SECTOR.enabled = !isAlreadyEnabled;
      } else {
        const sort = sortStates[type];
        if (!sort) return;
        
        // 3-Stage Toggle: OFF -> DESC (มากไปน้อย) -> ASC (น้อยไปมาก) -> OFF (ปิด)
        if (!isAlreadyEnabled) {
          sort.enabled = true;
          sort.dir = 'DESC';
        } else if (sort.dir === 'DESC') {
          sort.dir = 'ASC';
        } else {
          sort.enabled = false;
        }
      }

      this.renderer.updateSectorPillsUI(this.state.selectedSectors);
      this.renderer.updateSizePillsUI(this.state.selectedSizes);
      this.renderer.updateSortButtonsUI(sortStates);
      this.updateViewGrid();
    };

    if (this.renderer.sortPriceBtn) this.renderer.sortPriceBtn.addEventListener('click', (e) => handleSortClick('PRICE', e));
    if (this.renderer.sortSectorBtn) this.renderer.sortSectorBtn.addEventListener('click', (e) => handleSortClick('SECTOR', e));
  }

  bindResetBtn() {
    if (!this.renderer.resetBtn) return;
    this.renderer.resetBtn.addEventListener('click', () => {
      // Trigger smooth 360-degree spin animation on reset icon
      const icon = this.renderer.resetBtn.querySelector('.reset-icon');
      if (icon) {
        icon.classList.remove('spin-once');
        void icon.offsetWidth; // Reflow to restart keyframe animation
        icon.classList.add('spin-once');
        setTimeout(() => icon.classList.remove('spin-once'), 500);
      }

      this.state.resetFilters();
      this.renderer.updateSortButtonsUI(this.state.sortStates);
      this.renderer.updateSectorPillsUI(this.state.selectedSectors);
      this.renderer.updateSizePillsUI(this.state.selectedSizes);
      this.renderer.clearAllCardAnimations(this.state.originalCards);
      this.updateViewGrid();
    });
  }

  bindPriceControls() {
    this.renderer.priceGrid.addEventListener('click', async (e) => {
      // Controls only permitted for GM role and when not spectating
      if (this.state.role !== 'game_master' || this.state.isSpectating) return;

      const btn = e.target.closest('.control-btn');
      if (!btn) return;
      
      const card = btn.closest('.price-card');
      if (!card) return;
      
      const symbol = card.querySelector('.card-icon').textContent.trim();
      const isUp = btn.classList.contains('up');
      
      // Save full room + board snapshot before changing stock price step
      const [boardSnap, roomSnap] = await Promise.all([
        this.firebaseService.getBoardSnapshot(this.state.roomCode),
        this.firebaseService.getRoomStateSnapshot(this.state.roomCode)
      ]);
      const boardData = boardSnap ? boardSnap.val() : null;
      const roomData = roomSnap ? roomSnap.val() : null;

      if (boardData || roomData) {
        this.state.pushUndoSnapshot({
          stocks: boardData ? boardData.stocks : this.state.boardStocks,
          members: roomData ? roomData.members : null,
          pendingOrders: roomData ? roomData.pendingOrders : null
        });
        const isGM = (this.state.role === 'game_master');
        this.renderer.updateHistoryControlsUI(isGM, this.state.canUndo(), this.state.canRedo());
      }

      const updatedStocks = isUp 
        ? this.state.getUpdatedStocksForUp(symbol)
        : this.state.getUpdatedStocksForDown(symbol);

      if (updatedStocks) {
        try {
          await this.firebaseService.updateStocksBoard(this.state.roomCode, updatedStocks);
          const updatedStock = updatedStocks.find(s => s.name === symbol);
          const newPrice = updatedStock ? updatedStock.value.toLocaleString() : '';
          this.renderer.showTopToast(
            isUp ? "STOCK PRICE INCREASED" : "STOCK PRICE DECREASED",
            `ปรับราคาหุ้น ${symbol} ${isUp ? 'เพิ่มขึ้นเป็น' : 'ลดลงเหลือ'} ${newPrice} บาท`,
            isUp ? "success" : "warning"
          );
        } catch (error) {
          console.error("Failed to update stock step in database:", error);
        }
      }
    });

    this.bindBatchPriceControls();
  }

  bindBatchPriceControls() {
    const incBtn = document.getElementById('batchIncreasePriceBtn');
    const decBtn = document.getElementById('batchDecreasePriceBtn');

    const handleBatchChange = async (isUp) => {
      if (this.state.role !== 'game_master' || this.state.isSpectating) return;

      const [boardSnap, roomSnap] = await Promise.all([
        this.firebaseService.getBoardSnapshot(this.state.roomCode),
        this.firebaseService.getRoomStateSnapshot(this.state.roomCode)
      ]);
      const boardData = boardSnap ? boardSnap.val() : null;
      const roomData = roomSnap ? roomSnap.val() : null;

      if (boardData || roomData) {
        this.state.pushUndoSnapshot({
          stocks: boardData ? boardData.stocks : this.state.boardStocks,
          members: roomData ? roomData.members : null,
          pendingOrders: roomData ? roomData.pendingOrders : null
        });
        const isGM = (this.state.role === 'game_master');
        this.renderer.updateHistoryControlsUI(isGM, this.state.canUndo(), this.state.canRedo());
      }

      // Collect target stock symbols that are currently filtered & visible on the board
      const visibleCards = this.state.getFilteredAndSortedCards();
      const targetSymbols = new Set();
      visibleCards.forEach(card => {
        const iconEl = card.querySelector('.card-icon');
        if (iconEl && iconEl.textContent) {
          targetSymbols.add(iconEl.textContent.trim());
        }
      });

      const updatedStocks = isUp
        ? this.state.getBatchUpdatedStocksForUp(targetSymbols)
        : this.state.getBatchUpdatedStocksForDown(targetSymbols);

      if (updatedStocks) {
        try {
          await this.firebaseService.updateStocksBoard(this.state.roomCode, updatedStocks);
          this.renderer.showTopToast(
            isUp ? "BATCH PRICE INCREASED" : "BATCH PRICE DECREASED",
            `ปรับราคาหุ้นกลุ่มที่แสดงอยู่ (+1 / -1 ช่อง) จำนวน ${targetSymbols.size} หุ้น`,
            isUp ? "success" : "warning"
          );
        } catch (error) {
          console.error("Failed to update batch stock step in database:", error);
        }
      }
    };

    if (incBtn) incBtn.addEventListener('click', () => handleBatchChange(true));
    if (decBtn) decBtn.addEventListener('click', () => handleBatchChange(false));
  }

  bindHistoryButtons() {
    const undoBtn = document.getElementById('undoActionBtn');
    const redoBtn = document.getElementById('redoActionBtn');

    if (undoBtn) {
      undoBtn.addEventListener('click', async () => {
        if (!this.state.canUndo()) return;

        try {
          // Fetch current state to save into Redo stack before applying Undo
          const [curBoardSnap, curRoomSnap] = await Promise.all([
            this.firebaseService.getBoardSnapshot(this.state.roomCode),
            this.firebaseService.getRoomStateSnapshot(this.state.roomCode)
          ]);
          const curBoardData = curBoardSnap ? curBoardSnap.val() : null;
          const curRoomData = curRoomSnap ? curRoomSnap.val() : null;

          this.state.pushRedoSnapshot({
            stocks: curBoardData ? curBoardData.stocks : this.state.boardStocks,
            members: curRoomData ? curRoomData.members : null,
            pendingOrders: curRoomData ? curRoomData.pendingOrders : null
          });

          const previousState = this.state.popUndoSnapshot();
          if (previousState) {
            if (previousState.stocks) {
              await this.firebaseService.setStocksBoard(this.state.roomCode, previousState.stocks);
            }
            if (previousState.members) {
              await this.firebaseService.restoreRoomMembersSnapshot(this.state.roomCode, previousState.members);
            }
            if (previousState.pendingOrders !== undefined) {
              await this.firebaseService.setPendingOrders(this.state.roomCode, previousState.pendingOrders);
            }

            const isGM = (this.state.role === 'game_master');
            this.renderer.updateHistoryControlsUI(isGM, this.state.canUndo(), this.state.canRedo());
            this.renderer.showTopToast("ACTION UNDONE", "ยกเลิกการกระทำล่าสุดของห้องเกมเรียบร้อยแล้ว", "info");
          }
        } catch (error) {
          console.error("Failed to undo room action:", error);
        }
      });
    }

    if (redoBtn) {
      redoBtn.addEventListener('click', async () => {
        if (!this.state.canRedo()) return;

        try {
          // Fetch current state to save into Undo stack before applying Redo
          const [curBoardSnap, curRoomSnap] = await Promise.all([
            this.firebaseService.getBoardSnapshot(this.state.roomCode),
            this.firebaseService.getRoomStateSnapshot(this.state.roomCode)
          ]);
          const curBoardData = curBoardSnap ? curBoardSnap.val() : null;
          const curRoomData = curRoomSnap ? curRoomSnap.val() : null;

          this.state.undoStack.push({
            stocks: curBoardData ? curBoardData.stocks : this.state.boardStocks,
            members: curRoomData ? curRoomData.members : null,
            pendingOrders: curRoomData ? curRoomData.pendingOrders : null
          });

          const nextState = this.state.popRedoSnapshot();
          if (nextState) {
            if (nextState.stocks) {
              await this.firebaseService.setStocksBoard(this.state.roomCode, nextState.stocks);
            }
            if (nextState.members) {
              await this.firebaseService.restoreRoomMembersSnapshot(this.state.roomCode, nextState.members);
            }
            if (nextState.pendingOrders !== undefined) {
              await this.firebaseService.setPendingOrders(this.state.roomCode, nextState.pendingOrders);
            }

            const isGM = (this.state.role === 'game_master');
            this.renderer.updateHistoryControlsUI(isGM, this.state.canUndo(), this.state.canRedo());
            this.renderer.showTopToast("ACTION REDONE", "ทำซ้ำการกระทำถัดไปของห้องเกมเรียบร้อยแล้ว", "info");
          }
        } catch (error) {
          console.error("Failed to redo room action:", error);
        }
      });
    }
  }

  bindStockModals() {
    this.renderer.priceGrid.addEventListener('click', (e) => {
      const graphTrigger = e.target.closest('.view-graph-btn') || e.target.closest('.price-card > div > div:first-child');
      if (!graphTrigger) return;
      
      const card = graphTrigger.closest('.price-card');
      if (!card) return;
      
      const icon = card.querySelector('.card-icon');
      if (!icon) return;
      
      const symbol = icon.textContent.trim();
      const currentPrice = this.state.boardStocks[symbol] 
        ? this.state.boardStocks[symbol].value
        : parseFloat(card.getAttribute('data-price'));

      const beta = parseFloat(card.getAttribute('data-beta'));
      
      const master = this.state.masterStocks[symbol];
      const history = this.state.priceHistory[symbol] || [currentPrice];
      const startPrice = master ? master.steps[master.startStep - 1] : currentPrice;
      
      // Toggle card-level inline chart
      this.renderer.toggleCardChart(card, history, startPrice, beta);
    });
  }

  bindDangerZone() {
    this.renderer.resetMarketBtn.addEventListener('click', () => {
      if (this.state.role !== 'game_master') return;
      this.renderer.openConfirmModal();
    });

    const closeConfirm = () => this.renderer.closeConfirmModal();
    
    const closeConfirmBtn = document.getElementById('closeConfirmModalBtn');
    const cancelResetBtn = document.getElementById('cancelResetBtn');
    
    if (closeConfirmBtn) closeConfirmBtn.addEventListener('click', closeConfirm);
    if (cancelResetBtn) cancelResetBtn.addEventListener('click', closeConfirm);
    
    this.renderer.confirmModal.addEventListener('click', (e) => {
      if (e.target === this.renderer.confirmModal) closeConfirm();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.renderer.confirmModal && (this.renderer.confirmModal.classList.contains('show') || this.renderer.confirmModal.style.display === 'flex')) {
        closeConfirm();
      }
    });

    const confirmResetBtn = document.getElementById('confirmResetBtn');
    if (confirmResetBtn) {
      confirmResetBtn.addEventListener('click', async () => {
        if (this.state.role !== 'game_master' || this.state.isSpectating) return;

        const resetStocks = this.state.getResetStocks();
        try {
          const roomSnapshot = await this.firebaseService.getRoomStateSnapshot(this.state.roomCode);
          const roomData = roomSnapshot ? roomSnapshot.val() : null;

          const resetMembers = {};
          if (roomData && roomData.members) {
            Object.entries(roomData.members).forEach(([uid, member]) => {
              resetMembers[uid] = {
                ...member,
                portfolio: {
                  cash: 20000,
                  stocks: {},
                  debt: {}
                }
              };
            });
          }

          await this.firebaseService.updateRoom(this.state.roomCode, {
            stocks: resetStocks,
            members: resetMembers,
            pendingOrders: null,
            lastProcessedOrder: null,
            lastSalaryReceived: null,
            lastDividendReceived: null,
            lastDebtInterestReceived: null
          });
          await this.firebaseService.setStocksBoard(this.state.roomCode, resetStocks);

          this.state.undoStack = [];
          this.state.redoStack = [];
          this.state.pendingOrders = {};
          this.renderer.updateHistoryControlsUI(true, false, false);

          this.state.resetFilters();
          this.renderer.updateSortButtonsUI(this.state.sortStates);
          this.renderer.updateSectorPillsUI(this.state.selectedSectors);
          this.renderer.clearAllCardAnimations(this.state.originalCards);

          this.updateViewGrid();
          closeConfirm();
          this.renderer.showTopToast("GAME RESET", "รีเซ็ตเซสชันเกมทั้งหมดกลับสู่ค่าเริ่มต้นเรียบร้อยแล้ว", "warning");
        } catch (error) {
          console.error("Failed to reset game in database:", error);
        }
      });
    }

    // Reset Room Data (Purge room data and return everyone to lobby)
    if (this.renderer.resetRoomDataBtn) {
      this.renderer.resetRoomDataBtn.addEventListener('click', () => {
        if (this.state.role !== 'game_master' || this.state.isSpectating) return;
        this.renderer.openConfirmResetRoomModal();
      });
    }

    const closeResetRoomConfirm = () => this.renderer.closeConfirmResetRoomModal();
    const cancelResetRoomBtn = document.getElementById('cancelResetRoomBtn');
    if (cancelResetRoomBtn) cancelResetRoomBtn.addEventListener('click', closeResetRoomConfirm);

    if (this.renderer.confirmResetRoomModal) {
      this.renderer.confirmResetRoomModal.addEventListener('click', (e) => {
        if (e.target === this.renderer.confirmResetRoomModal) closeResetRoomConfirm();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.renderer.confirmResetRoomModal && (this.renderer.confirmResetRoomModal.classList.contains('show') || this.renderer.confirmResetRoomModal.style.display === 'flex')) {
        closeResetRoomConfirm();
      }
    });

    const confirmResetRoomBtn = document.getElementById('confirmResetRoomBtn');
    if (confirmResetRoomBtn) {
      confirmResetRoomBtn.addEventListener('click', async () => {
        if (this.state.role !== 'game_master' || this.state.isSpectating) return;
        try {
          closeResetRoomConfirm();

          const code = this.state.roomCode;
          if (!code) return;

          const resetStocks = this.state.getResetStocks();
          const roomSnapshot = await this.firebaseService.getRoomStateSnapshot(code);
          const roomData = roomSnapshot ? roomSnapshot.val() : null;

          const currentUser = this.firebaseService.getCurrentUser();
          const currentUid = currentUser ? currentUser.uid : null;

          // Keep ONLY GM in members, kick all other players out
          const resetMembers = {};
          if (roomData && roomData.members) {
            if (currentUid && roomData.members[currentUid]) {
              resetMembers[currentUid] = {
                ...roomData.members[currentUid],
                role: 'game_master',
                displayName: roomData.members[currentUid].displayName || 'GM'
              };
            } else {
              const gmEntry = Object.entries(roomData.members).find(([_, m]) => m && m.role === 'game_master');
              if (gmEntry) {
                resetMembers[gmEntry[0]] = gmEntry[1];
              }
            }
          }

          if (Object.keys(resetMembers).length === 0 && currentUid) {
            resetMembers[currentUid] = {
              displayName: 'GM',
              role: 'game_master',
              timestamp: Date.now()
            };
          }

          // Overwrite members to purge all player nodes cleanly
          await this.firebaseService.setRoomMembers(code, resetMembers);

          // Reset room state: reset stocks, purge saved sessions, orders, and record reset timestamp
          await this.firebaseService.updateRoom(code, {
            stocks: resetStocks,
            savedMembers: null,
            pendingOrders: null,
            lastProcessedOrder: null,
            lastSalaryReceived: null,
            lastDividendReceived: null,
            lastDebtInterestReceived: null,
            resetAt: Date.now()
          });

          // Reset board state
          await this.firebaseService.setStocksBoard(code, resetStocks);

          // Clear GM local action history
          this.state.undoStack = [];
          this.state.redoStack = [];
          this.state.pendingOrders = {};
          this.renderer.updateHistoryControlsUI(true, false, false);

          // Reset filters & view
          this.state.resetFilters();
          this.renderer.updateSortButtonsUI(this.state.sortStates);
          this.renderer.updateSectorPillsUI(this.state.selectedSectors);
          this.renderer.updateSizePillsUI(this.state.selectedSizes);
          this.renderer.clearAllCardAnimations(this.state.originalCards);

          this.updateViewGrid();
          this.renderer.showTopToast("ROOM RESET", "รีเซ็ตห้องและเตะผู้เล่นทุกคนออกจากห้องเรียบร้อยแล้ว", "warning");
        } catch (error) {
          console.error("Failed to reset room data in database:", error);
        }
      });
    }
  }

  bindSpectatorEvents() {
    if (this.renderer.spectatorToggleBtn) {
      this.renderer.spectatorToggleBtn.addEventListener('click', () => {
        this.state.isSpectating = !this.state.isSpectating;
        const effectiveRole = this.state.isSpectating ? 'player' : 'game_master';
        
        this.renderer.updateControlsVisibility(effectiveRole);
        this.renderer.updateSpectatorButtonUI(this.state.isSpectating);
      });
    }
  }

  hideAllOpenCharts() {
    const cards = this.state.originalCards || [];
    cards.forEach(card => {
      const chartContainer = card.querySelector('.chart-container');
      const viewGraphBtn = card.querySelector('.view-graph-btn');
      if (chartContainer && (chartContainer.style.display === 'flex' || chartContainer.style.display === 'block')) {
        chartContainer.classList.remove('expanded');
        if (viewGraphBtn) {
          viewGraphBtn.classList.remove('active');
          viewGraphBtn.textContent = 'View Graph';
        }
        chartContainer.style.display = 'none';
      }
    });
  }

  updateViewGrid() {
    this.hideAllOpenCharts();
    const sortedFiltered = this.state.getFilteredAndSortedCards();
    this.renderer.renderGrid(sortedFiltered);
    this.renderer.applyBetaColors(sortedFiltered);
    this.renderer.applyPriceColors(sortedFiltered, this.state.boardStocks, this.state.masterStocks, this.state.initialPrices);
  }
}
