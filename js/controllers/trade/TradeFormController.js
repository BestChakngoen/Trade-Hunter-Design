/**
 * TradeFormController - Handles Trade Form UI, Custom Dropdown, and BUY/SELL Tab Switching.
 */
export class TradeFormController {
  constructor(state, renderer) {
    this.state = state;
    this.renderer = renderer;
    this.updateTradeFormPrice = null;
    this.refreshDropdownOptions = null;
  }

  getFormElements() {
    return {
      tradeStockSelect: document.getElementById('tradeStockSelect'),
      tradePrice: document.getElementById('tradePrice'),
      tradeTabBuy: document.getElementById('tradeTabBuy'),
      tradeTabSell: document.getElementById('tradeTabSell'),
      submitOrderBtn: document.getElementById('submitOrderBtn'),
      tradeForm: document.getElementById('tradeForm'),
      dropdownSelected: document.getElementById('dropdownSelected'),
      dropdownSelectedContent: document.getElementById('dropdownSelectedContent'),
      dropdownOptions: document.getElementById('dropdownOptions')
    };
  }

  setDropdownSelectedDisplay(dropdownSelectedContent, item) {
    if (!dropdownSelectedContent) return;
    if (!item) {
      dropdownSelectedContent.innerHTML = `<span class="text-gray-500">Select Stock</span>`;
      return;
    }
    const clone = item.cloneNode(true);
    const priceBadge = clone.querySelector('.dropdown-price-badge');
    if (priceBadge) priceBadge.remove();
    dropdownSelectedContent.innerHTML = clone.innerHTML;
  }

  bindTradeFormEvents(orderTypeCallback, submitCallback) {
    const elements = this.getFormElements();
    if (!elements.tradeStockSelect || !elements.tradePrice || !elements.tradeForm) return;

    let orderType = 'BUY';

    const updateEstimatedCost = () => {
      const symbol = elements.tradeStockSelect.value;
      const stock = this.state.boardStocks[symbol];
      elements.tradePrice.value = stock ? stock.value.toLocaleString('en-US') : '';

      if (elements.dropdownOptions) {
        const allItems = Array.from(elements.dropdownOptions.querySelectorAll('.dropdown-item:not(.empty-state-item)'));
        allItems.forEach(item => {
          const val = item.getAttribute('data-value');
          const itemStock = this.state.boardStocks[val];
          const itemPrice = itemStock ? itemStock.value : 0;

          let priceBadge = item.querySelector('.dropdown-price-badge');
          if (!priceBadge) {
            priceBadge = document.createElement('span');
            priceBadge.className = 'dropdown-price-badge text-emerald-400 font-mono font-bold text-xs ml-auto shrink-0 pl-2';
            item.appendChild(priceBadge);
          }
          priceBadge.textContent = `${itemPrice.toLocaleString('en-US')}`;
        });

        const currentItem = allItems.find(i => i.getAttribute('data-value') === symbol);
        this.setDropdownSelectedDisplay(elements.dropdownSelectedContent, currentItem);
      }
    };
    this.updateTradeFormPrice = updateEstimatedCost;

    const updateDropdownOptions = () => this.updateDropdownItemsUI(elements, orderType, updateEstimatedCost);
    this.refreshDropdownOptions = updateDropdownOptions;

    this.bindCustomDropdownEvents(elements, updateDropdownOptions, updateEstimatedCost);
    this.bindTabSwitchEvents(elements, (newType) => {
      orderType = newType;
      if (typeof orderTypeCallback === 'function') {
        orderTypeCallback(newType);
      }
      updateDropdownOptions();
    });
    this.bindFormSubmission(elements, () => orderType, updateEstimatedCost, submitCallback);
  }

  bindCustomDropdownEvents(elements, updateDropdownOptions, updateEstimatedCost) {
    const { dropdownSelected, dropdownSelectedContent, dropdownOptions, tradeStockSelect } = elements;
    if (!dropdownSelected || !dropdownOptions) return;

    const dropdownContainer = document.getElementById('tradeStockDropdown');

    const closeDropdown = () => {
      if (dropdownContainer) dropdownContainer.classList.remove('open');
    };

    dropdownSelected.addEventListener('click', (e) => {
      e.stopPropagation();
      updateDropdownOptions();
      if (dropdownContainer) {
        dropdownContainer.classList.toggle('open');
      }
    });

    const items = dropdownOptions.querySelectorAll('.dropdown-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const val = item.getAttribute('data-value');
        tradeStockSelect.value = val;
        this.setDropdownSelectedDisplay(dropdownSelectedContent, item);
        closeDropdown();
        updateEstimatedCost();
      });
    });

    document.addEventListener('click', () => {
      closeDropdown();
    });
  }

  updateDropdownItemsUI(elements, orderType, updateEstimatedCost) {
    const { dropdownOptions } = elements;
    if (!dropdownOptions) return;

    const allItems = Array.from(dropdownOptions.querySelectorAll('.dropdown-item:not(.empty-state-item)'));
    allItems.forEach(item => {
      const qtyBadge = item.querySelector('.dropdown-owned-badge');
      if (qtyBadge) qtyBadge.remove();

      const val = item.getAttribute('data-value');
      const itemStock = this.state.boardStocks[val];
      const itemPrice = itemStock ? itemStock.value : 0;

      let priceBadge = item.querySelector('.dropdown-price-badge');
      if (!priceBadge) {
        priceBadge = document.createElement('span');
        priceBadge.className = 'dropdown-price-badge text-emerald-400 font-mono font-bold text-xs ml-auto shrink-0 pl-2';
        item.appendChild(priceBadge);
      }
      priceBadge.textContent = `${itemPrice.toLocaleString('en-US')}`;
    });

    if (orderType === 'BUY') {
      this.renderBuyDropdownUI(elements, allItems);
    } else {
      this.renderSellDropdownUI(elements, allItems);
    }

    updateEstimatedCost();
  }

  renderBuyDropdownUI(elements, allItems) {
    const { dropdownOptions, tradeStockSelect, dropdownSelectedContent } = elements;
    const emptyState = dropdownOptions.querySelector('.empty-state-item');
    if (emptyState) emptyState.remove();

    allItems.forEach(item => item.style.setProperty('display', 'flex', 'important'));

    const currentVal = tradeStockSelect.value;
    const currentItem = allItems.find(i => i.getAttribute('data-value') === currentVal);
    if (!currentVal || !currentItem) {
      tradeStockSelect.value = '';
      this.setDropdownSelectedDisplay(dropdownSelectedContent, null);
    } else {
      this.setDropdownSelectedDisplay(dropdownSelectedContent, currentItem);
    }
  }

  renderSellDropdownUI(elements, allItems) {
    const { dropdownOptions, tradeStockSelect, dropdownSelectedContent } = elements;
    const userPortfolio = this.state.portfolio ? (this.state.portfolio.stocks || {}) : {};
    const ownedSymbols = Object.keys(userPortfolio).filter(sym => userPortfolio[sym] && (Number(userPortfolio[sym].volume) > 0));

    let ownedCount = 0;
    let firstOwnedItem = null;

    allItems.forEach(item => {
      const val = item.getAttribute('data-value');
      if (ownedSymbols.includes(val)) {
        item.style.setProperty('display', 'flex', 'important');
        ownedCount++;
        if (!firstOwnedItem) firstOwnedItem = item;
      } else {
        item.style.setProperty('display', 'none', 'important');
      }
    });

    if (ownedCount === 0) {
      let emptyState = dropdownOptions.querySelector('.empty-state-item');
      if (!emptyState) {
        emptyState = document.createElement('div');
        emptyState.className = 'empty-state-item p-3 text-center text-xs text-gray-400 italic cursor-not-allowed';
        emptyState.textContent = 'No stocks owned';
        dropdownOptions.appendChild(emptyState);
      }
      tradeStockSelect.value = '';
      dropdownSelectedContent.innerHTML = `<span class="text-gray-400 italic">No stocks owned</span>`;
    } else {
      const emptyState = dropdownOptions.querySelector('.empty-state-item');
      if (emptyState) emptyState.remove();

      const currentVal = tradeStockSelect.value;
      if (ownedSymbols.includes(currentVal)) {
        const currentItem = allItems.find(i => i.getAttribute('data-value') === currentVal);
        this.setDropdownSelectedDisplay(dropdownSelectedContent, currentItem);
      } else {
        tradeStockSelect.value = '';
        this.setDropdownSelectedDisplay(dropdownSelectedContent, null);
      }
    }
  }

  bindTabSwitchEvents(elements, onOrderTypeChange) {
    const { tradeTabBuy, tradeTabSell, submitOrderBtn } = elements;

    tradeTabBuy.addEventListener('click', (e) => {
      e.preventDefault();
      tradeTabBuy.classList.add('active');
      tradeTabSell.classList.remove('active');
      submitOrderBtn.className = "submit-order-btn buy-theme mt-4";
      submitOrderBtn.textContent = "SUBMIT BUY ORDER";
      onOrderTypeChange('BUY');
    });

    tradeTabSell.addEventListener('click', (e) => {
      e.preventDefault();
      tradeTabSell.classList.add('active');
      tradeTabBuy.classList.remove('active');
      submitOrderBtn.className = "submit-order-btn sell-theme mt-4";
      submitOrderBtn.textContent = "SUBMIT SELL ORDER";
      onOrderTypeChange('SELL');
    });
  }

  bindFormSubmission(elements, getOrderType, updateEstimatedCost, submitCallback) {
    const { tradeForm } = elements;

    tradeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const orderType = getOrderType();
      const symbol = elements.tradeStockSelect.value;
      if (typeof submitCallback === 'function') {
        await submitCallback(orderType, symbol, elements, updateEstimatedCost);
      }
    });
  }
}
