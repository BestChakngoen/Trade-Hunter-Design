import { TradeService } from '../services/TradeService.js';
import { NumberAnimationService } from '../services/NumberAnimationService.js';
import { ManagementTablesRenderer } from './ManagementTablesRenderer.js';

/**
 * PortfolioRenderer - Manages Player Portfolio Assets Table, PnL Summaries,
 * Debt Instruments Table, and coordinates GM Management Tables and Animation services.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class PortfolioRenderer {
  constructor() {
    this.managementTablesRenderer = new ManagementTablesRenderer();
  }

  // --- Animation Engine Proxies (Backward Compatibility) ---
  resetAnimationState() {
    NumberAnimationService.resetAnimationState();
  }

  animateSummaryNumber(el, targetValue, idleClass = 'text-white', duration = 500) {
    NumberAnimationService.animateSummaryNumber(el, targetValue, idleClass, duration);
  }

  animatePnL(el, targetPnL, targetPnLPct, duration = 500) {
    NumberAnimationService.animatePnL(el, targetPnL, targetPnLPct, duration);
  }

  // --- GM Management Tables Proxies (Backward Compatibility) ---
  updateGMPendingOrdersUI(gmPendingOrdersBody, orders = {}, onApprove = null, onReject = null, members = {}) {
    this.managementTablesRenderer.updateGMPendingOrdersUI(gmPendingOrdersBody, orders, onApprove, onReject, members);
  }

  updateGMPlayerSalaryUI(gmPlayerSalaryBody, members, onPaySalary) {
    this.managementTablesRenderer.updateGMPlayerSalaryUI(gmPlayerSalaryBody, members, onPaySalary);
  }

  updateGMPlayerDividendUI(gmPlayerDividendBody, members, boardStocks = {}, masterStocks = {}, originalCards = [], onPayDividend = null) {
    this.managementTablesRenderer.updateGMPlayerDividendUI(gmPlayerDividendBody, members, boardStocks, masterStocks, originalCards, onPayDividend);
  }

  updateGMPlayerDebtInterestUI(gmPlayerDebtInterestBody, members, onPayDebtInterest = null) {
    this.managementTablesRenderer.updateGMPlayerDebtInterestUI(gmPlayerDebtInterestBody, members, onPayDebtInterest);
  }

  // --- Player Portfolio & Holdings Rendering ---
  updatePortfolioUI(stats, portfolio, boardStocks, pendingOrders = {}, userUid = null) {
    const portCash = document.getElementById('portCash');
    const buyingPowerValue = document.getElementById('buyingPowerValue');
    const portTotalAssets = document.getElementById('portTotalAssets');
    const portTotalPnL = document.getElementById('portTotalPnL');
    const holdingsTableBody = document.getElementById('holdingsTableBody');
    
    // Calculate pending BUY & INVEST amount reserved by this player
    const availableCashObj = TradeService.calculateAvailableCash(stats.cash, pendingOrders, userUid);
    const effectiveCash = availableCashObj.effectiveAvailableCash;

    // CASH is real cash (only deducted when GM approves)
    if (portCash) {
      this.animateSummaryNumber(portCash, stats.cash, 'text-white');
    }
    // BUYING POWER is effective cash (reserved immediately on pending order)
    if (buyingPowerValue) buyingPowerValue.textContent = effectiveCash.toLocaleString('en-US');

    // TOTAL ASSETS VALUE
    if (portTotalAssets) {
      this.animateSummaryNumber(portTotalAssets, stats.totalAssets, 'text-white');
    }
    
    // TOTAL UNREALIZED P&L
    if (portTotalPnL) {
      this.animatePnL(portTotalPnL, stats.totalPnL, stats.totalPnLPct);
    }
    
    if (holdingsTableBody) {
      const stocksObj = (portfolio && portfolio.stocks) ? portfolio.stocks : {};
      const symbols = Object.keys(stocksObj).filter(symbol => stocksObj[symbol] && stocksObj[symbol].volume > 0);
      
      if (symbols.length === 0) {
        holdingsTableBody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-6 text-gray-500 font-medium">No assets in portfolio</td>
          </tr>
        `;
        return;
      }
      
      const stockDetails = {
        KTF: { icon: 'Assets/Sector_icons/Fincial_KTFFSF.png', sector: 'FINCIAL' },
        ABF: { icon: 'Assets/Sector_icons/ABFSUFDPF.png', sector: 'AGRO' },
        ZIF: { icon: 'Assets/Sector_icons/Indus_ZIFDTF.png', sector: 'INDUS' },
        FSF: { icon: 'Assets/Sector_icons/Fincial_KTFFSF.png', sector: 'FINCIAL' },
        SICF: { icon: 'Assets/Sector_icons/Tech_SICFVCOFDTSF.png', sector: 'TECH' },
        SUF: { icon: 'Assets/Sector_icons/ABFSUFDPF.png', sector: 'AGRO' },
        SAAF: { icon: 'Assets/Sector_icons/Resource_SAAFPTF.png', sector: 'RESOURCE' },
        VCOF: { icon: 'Assets/Sector_icons/Tech_SICFVCOFDTSF.png', sector: 'TECH' },
        ARROF: { icon: 'Assets/Sector_icons/Propcon_ARROF.png', sector: 'PROPCON' },
        KISF: { icon: 'Assets/Sector_icons/KISFCUF.png', sector: 'CONSUMP' },
        TNF: { icon: 'Assets/Sector_icons/Service_TNF.png', sector: 'SERVICE' },
        DTSF: { icon: 'Assets/Sector_icons/Tech_SICFVCOFDTSF.png', sector: 'TECH' },
        DPF: { icon: 'Assets/Sector_icons/ABFSUFDPF.png', sector: 'AGRO' },
        DTF: { icon: 'Assets/Sector_icons/Indus_ZIFDTF.png', sector: 'INDUS' },
        PTF: { icon: 'Assets/Sector_icons/Resource_SAAFPTF.png', sector: 'RESOURCE' },
        CUF: { icon: 'Assets/Sector_icons/KISFCUF.png', sector: 'CONSUMP' }
      };

      let html = '';
      symbols.forEach(symbol => {
        const holding = portfolio.stocks[symbol];
        const currentStock = boardStocks[symbol];
        const marketPrice = currentStock ? currentStock.value : holding.avgPrice;
        const amount = holding.volume * marketPrice;
        const cost = holding.volume * holding.avgPrice;
        const pnl = amount - cost;
        const pnlPct = cost === 0 ? 0 : (pnl / cost) * 100;
        
        const pnlColorClass = pnl > 0 ? 'text-positive' : pnl < 0 ? 'text-negative' : 'text-white';
        const sign = pnl >= 0 ? '+' : '';
        const details = stockDetails[symbol] || { icon: '', sector: '' };
        
        html += `
          <tr class="hover:bg-gray-900 transition-colors">
            <td class="p-3 text-left table-col-left">
              <div class="flex items-center gap-2">
                <img src="${details.icon}" class="w-5 h-5 object-contain flex-shrink-0" alt="${symbol}">
                <div class="font-bold text-white text-sm sm:text-base">${symbol}</div>
              </div>
            </td>
            <td class="font-extrabold text-blue-400 font-mono text-sm sm:text-base text-center table-col-center">${holding.volume.toLocaleString('en-US')}</td>
            <td class="text-center table-col-center font-mono">${holding.avgPrice.toLocaleString('en-US')}</td>
            <td class="text-center table-col-center font-mono">${marketPrice.toLocaleString('en-US')}</td>
            <td class="font-semibold text-white text-center table-col-center font-mono">${amount.toLocaleString('en-US')}</td>
            <td class="font-bold ${pnlColorClass} text-center table-col-center font-mono">${sign}${pnl.toLocaleString('en-US')} (${sign}${pnlPct.toFixed(2)}%)</td>
          </tr>
        `;
      });
      holdingsTableBody.innerHTML = html;
    }
  }

  // --- Player Pending Orders Table ---
  updatePlayerPendingOrdersUI(orders, uid) {
    const playerPendingOrdersBody = document.getElementById('playerPendingOrdersBody');
    if (!playerPendingOrdersBody) return;
    
    const targetUidStr = String(uid || '').trim().toLowerCase();
    const myOrders = Object.values(orders || {}).filter(order => order && order.uid && String(order.uid).trim().toLowerCase() === targetUidStr);
    if (myOrders.length === 0) {
      playerPendingOrdersBody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center py-4 text-gray-500 font-medium">No pending orders</td>
        </tr>
      `;
      return;
    }
    
    let html = '';
    myOrders.forEach(order => {
      const orderPrice = order.price || order.unitPrice || 0;
      const typeUpper = String(order.type || '').toUpperCase();
      let actionColor = 'text-gray-300 font-bold';
      if (typeUpper === 'BUY') {
        actionColor = 'text-positive font-bold';
      } else if (typeUpper === 'SELL') {
        actionColor = 'text-negative font-bold';
      } else if (typeUpper === 'INVEST') {
        actionColor = 'text-invest font-bold';
      } else if (typeUpper === 'REDEEM') {
        actionColor = 'text-redeem font-bold';
      }
      
      html += `
        <tr class="hover:bg-gray-900 transition-colors">
          <td class="${actionColor} align-middle text-left table-col-left">${order.type}</td>
          <td class="font-bold text-white align-middle text-left table-col-left">${order.symbol}</td>
          <td class="align-middle text-right table-col-right font-mono">${orderPrice.toLocaleString('en-US')}</td>
          <td class="align-middle text-center table-col-center">
            <span class="text-yellow-400 font-bold text-[11px] uppercase tracking-wider">
              PENDING
            </span>
          </td>
        </tr>
      `;
    });
    playerPendingOrdersBody.innerHTML = html;
  }

  // --- Debt Instruments Table ---
  updateDebtInstrumentsUI(debtTableBody, debtData, onInvestDebt = null, onRedeemDebt = null) {
    if (!debtTableBody) return;

    let html = '';
    (debtData.items || []).forEach(item => {
      const formattedUnitPrice = item.unitPrice.toLocaleString('en-US');
      const formattedTotalVal = item.value.toLocaleString('en-US');
      const formattedInterest = item.interestRate.toLocaleString('en-US');
      const canRedeem = item.volume > 0;

      html += `
        <tr class="border-b border-gray-800 hover:bg-gray-850">
          <td class="p-3 text-center align-middle table-col-center"><div class="flex items-center justify-center gap-3 h-full"><button type="button" class="debt-invest-btn" data-key="${item.key}">Invest</button><button type="button" class="debt-redeem-btn ${canRedeem ? '' : 'opacity-40'}" data-key="${item.key}">Redeem</button></div></td>
          <td class="p-3 font-semibold text-white align-middle text-left table-col-left">${item.name}</td>
          <td class="p-3 text-gray-300 font-mono align-middle text-center table-col-center">${formattedUnitPrice}</td>
          <td class="p-3 font-bold ${item.volume > 0 ? 'text-indigo-400' : 'text-gray-500'} align-middle text-center table-col-center font-mono">${item.volume}</td>
          <td class="p-3 font-semibold text-white align-middle text-center table-col-center font-mono">${formattedTotalVal}</td>
          <td class="p-3 text-white font-semibold align-middle text-center table-col-center font-mono">+${formattedInterest} / unit</td>
        </tr>
      `;
    });

    debtTableBody.innerHTML = html;

    const investBtns = debtTableBody.querySelectorAll('.debt-invest-btn');
    investBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const key = btn.getAttribute('data-key');
        if (onInvestDebt && key) onInvestDebt(key);
      });
    });

    const redeemBtns = debtTableBody.querySelectorAll('.debt-redeem-btn');
    redeemBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const key = btn.getAttribute('data-key');
        if (onRedeemDebt && key) onRedeemDebt(key);
      });
    });
  }
}
