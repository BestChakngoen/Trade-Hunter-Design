import { TradeService } from '../services/TradeService.js';

/**
 * PortfolioRenderer - Manages Portfolio Assets Table, PnL Summaries, and Orders Approval Queue Tables.
 */
export class PortfolioRenderer {
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
    if (portCash) portCash.textContent = stats.cash.toLocaleString('en-US');
    // BUYING POWER is effective cash (reserved immediately on pending order)
    if (buyingPowerValue) buyingPowerValue.textContent = effectiveCash.toLocaleString('en-US');
    if (portTotalAssets) portTotalAssets.textContent = stats.totalAssets.toLocaleString('en-US');
    
    if (portTotalPnL) {
      const sign = stats.totalPnL >= 0 ? '+' : '';
      portTotalPnL.textContent = `${sign}${stats.totalPnL.toLocaleString('en-US')} (${sign}${stats.totalPnLPct.toFixed(2)}%)`;
      portTotalPnL.className = stats.totalPnL > 0 ? 'summary-value text-positive' :
                              stats.totalPnL < 0 ? 'summary-value text-negative' :
                              'summary-value text-white';
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
            <td class="font-bold ${pnlColorClass} text-right table-col-right font-mono">${sign}${pnl.toLocaleString('en-US')} (${sign}${pnlPct.toFixed(2)}%)</td>
          </tr>
        `;
      });
      holdingsTableBody.innerHTML = html;
    }
  }

  updateGMPendingOrdersUI(gmPendingOrdersBody, orders, onApprove, onReject) {
    if (!gmPendingOrdersBody) return;
    
    const orderList = Object.values(orders);
    const badgeEl = document.getElementById('gmPendingBadge');
    const tabMgmtBadge = document.getElementById('tabMgmtBadge');
    
    if (badgeEl) {
      if (orderList.length > 0) {
        badgeEl.style.setProperty('display', 'inline-block', 'important');
      } else {
        badgeEl.style.setProperty('display', 'none', 'important');
      }
    }

    if (tabMgmtBadge) {
      if (orderList.length > 0) {
        tabMgmtBadge.style.setProperty('display', 'inline-block', 'important');
      } else {
        tabMgmtBadge.style.setProperty('display', 'none', 'important');
      }
    }

    if (orderList.length === 0) {
      gmPendingOrdersBody.innerHTML = `
        <tr>
          <td colspan="6" class="p-4 text-center text-gray-500">No pending orders to approve</td>
        </tr>
      `;
      return;
    }
    
    let html = '';
    orderList.forEach(order => {
      const formattedProposedPrice = (order.price || order.unitPrice || 0).toLocaleString('en-US');
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
        <tr class="border-b border-gray-800 hover:bg-gray-850" data-order-id="${order.id}">
          <td class="p-3 text-center align-middle table-col-center"><div class="flex items-center justify-center gap-2 h-full"><button class="gm-approve-btn">Approve</button><button class="gm-reject-btn">Reject</button></div></td>
          <td class="p-3 font-semibold text-white align-middle text-left table-col-left">${order.username}</td>
          <td class="p-3 ${actionColor} align-middle text-left table-col-left">${order.type}</td>
          <td class="p-3 font-bold text-yellow-500 align-middle text-left table-col-left">${order.symbol}</td>
          <td class="p-3 align-middle text-center table-col-center font-mono">${(order.volume || 1).toLocaleString('en-US')}</td>
          <td class="p-3 text-gray-400 align-middle text-center table-col-center font-mono">${formattedProposedPrice}</td>
        </tr>
      `;
    });
    gmPendingOrdersBody.innerHTML = html;

    const rows = gmPendingOrdersBody.querySelectorAll('tr[data-order-id]');
    rows.forEach(row => {
      const orderId = row.getAttribute('data-order-id');
      const approveBtn = row.querySelector('.gm-approve-btn');
      const rejectBtn = row.querySelector('.gm-reject-btn');
      
      if (approveBtn) {
        approveBtn.addEventListener('click', () => {
          if (onApprove) onApprove(orderId);
        });
      }
      
      if (rejectBtn) {
        rejectBtn.addEventListener('click', () => {
          if (onReject) onReject(orderId);
        });
      }
    });
  }

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

  updateGMPlayerSalaryUI(gmPlayerSalaryBody, members, onPaySalary) {
    if (!gmPlayerSalaryBody) return;

    const memberList = Object.entries(members || {}).filter(([uid, member]) => {
      const role = (member.role || '').toLowerCase();
      const name = (member.displayName || '').toUpperCase();
      return role !== 'game_master' && name !== 'GM';
    });

    if (memberList.length === 0) {
      gmPlayerSalaryBody.innerHTML = `
        <tr>
          <td colspan="3" class="p-4 text-center text-gray-500">No players in room</td>
        </tr>
      `;
      return;
    }

    let html = '';
    memberList.forEach(([uid, member]) => {
      const cash = member.portfolio?.cash ?? 20000;
      const formattedCash = cash.toLocaleString('en-US');

      html += `
        <tr class="border-b border-gray-800 hover:bg-gray-850" data-player-uid="${uid}">
          <td class="p-3 text-center align-middle table-col-center"><div class="flex items-center justify-center"><button type="button" class="gm-salary-btn" data-uid="${uid}" title="Pay 10,000 Salary">Salary 10,000</button></div></td>
          <td class="p-3 font-semibold text-white align-middle text-left table-col-left">${member.displayName || 'Player'}</td>
          <td class="p-3 text-emerald-400 font-semibold align-middle text-center table-col-center font-mono">${formattedCash}</td>
        </tr>
      `;
    });

    gmPlayerSalaryBody.innerHTML = html;

    const salaryBtns = gmPlayerSalaryBody.querySelectorAll('.gm-salary-btn');
    salaryBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const playerUid = btn.getAttribute('data-uid');
        if (onPaySalary && playerUid) {
          onPaySalary(playerUid);
        }
      });
    });
  }

  updateGMPlayerDividendUI(gmPlayerDividendBody, members, boardStocks = {}, masterStocks = {}, originalCards = [], onPayDividend = null) {
    if (!gmPlayerDividendBody) return;

    const memberList = Object.entries(members || {}).filter(([uid, member]) => {
      const role = (member.role || '').toLowerCase();
      const name = (member.displayName || '').toUpperCase();
      return role !== 'game_master' && name !== 'GM';
    });

    if (memberList.length === 0) {
      gmPlayerDividendBody.innerHTML = `
        <tr>
          <td colspan="3" class="p-4 text-center text-gray-500">No players in room</td>
        </tr>
      `;
      return;
    }

    let html = '';
    memberList.forEach(([uid, member]) => {
      const stocks = member.portfolio?.stocks || {};

      const dividendData = TradeService.calculatePlayerDividend(stocks, boardStocks, masterStocks, originalCards);
      
      const sizeCounts = { S: 0, M: 0, L: 0 };
      if (dividendData.breakdown && dividendData.breakdown.length > 0) {
        dividendData.breakdown.forEach(item => {
          const sz = String(item.size || 'M').toUpperCase();
          if (sizeCounts[sz] !== undefined) {
            sizeCounts[sz] += Number(item.volume || 0);
          }
        });
      }

      const activeParts = [];
      ['S', 'M', 'L'].forEach(sizeKey => {
        if (sizeCounts[sizeKey] > 0) {
          activeParts.push(`${sizeKey}: ${sizeCounts[sizeKey]}`);
        }
      });

      let holdingsSummaryText = '';
      if (activeParts.length > 0) {
        holdingsSummaryText = `<span class="text-gray-300 font-medium">${activeParts.join(', ')}</span>`;
      } else {
        holdingsSummaryText = `<span class="text-gray-500 italic">No stocks held</span>`;
      }

      const hasDividend = dividendData.totalDividend > 0;
      const dividendBtnState = hasDividend ? '' : 'opacity-40';
      const formattedDividend = dividendData.totalDividend.toLocaleString('en-US');

      html += `
        <tr class="border-b border-gray-800 hover:bg-gray-850" data-player-uid="${uid}">
          <td class="p-3 text-center align-middle table-col-center"><div class="flex items-center justify-center"><button type="button" class="gm-dividend-btn ${dividendBtnState}" data-uid="${uid}" title="Pay ${formattedDividend} Dividend">Dividend ${formattedDividend}</button></div></td>
          <td class="p-3 font-semibold text-white align-middle text-left table-col-left">${member.displayName || 'Player'}</td>
          <td class="p-3 align-middle text-center table-col-center">${holdingsSummaryText}</td>
        </tr>
      `;
    });

    gmPlayerDividendBody.innerHTML = html;

    const dividendBtns = gmPlayerDividendBody.querySelectorAll('.gm-dividend-btn');
    dividendBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const playerUid = btn.getAttribute('data-uid');
        if (onPayDividend && playerUid) {
          onPayDividend(playerUid);
        }
      });
    });
  }

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

  updateGMPlayerDebtInterestUI(gmPlayerDebtInterestBody, members, onPayDebtInterest = null) {
    if (!gmPlayerDebtInterestBody) return;

    const memberList = Object.entries(members || {}).filter(([uid, member]) => {
      const role = (member.role || '').toLowerCase();
      const name = (member.displayName || '').toUpperCase();
      return role !== 'game_master' && name !== 'GM';
    });

    if (memberList.length === 0) {
      gmPlayerDebtInterestBody.innerHTML = `
        <tr>
          <td colspan="3" class="p-4 text-center text-gray-500">No players in room</td>
        </tr>
      `;
      return;
    }

    let html = '';
    memberList.forEach(([uid, member]) => {
      const debt = member.portfolio?.debt || {};
      const debtInterestData = TradeService.calculatePlayerDebtInterest(debt);

      let debtHoldingsText = '';
      if (debtInterestData.breakdown && debtInterestData.breakdown.length > 0) {
        const parts = debtInterestData.breakdown.map(item => `${item.volume}x ${item.name}`);
        debtHoldingsText = `<span class="text-gray-300 font-medium">${parts.join(', ')}</span>`;
      } else {
        debtHoldingsText = `<span class="text-gray-500 italic">No debt held</span>`;
      }

      const hasInterest = debtInterestData.totalInterest > 0;
      const interestBtnState = hasInterest ? '' : 'opacity-40';
      const formattedInterest = debtInterestData.totalInterest.toLocaleString('en-US');

      html += `
        <tr class="border-b border-gray-800 hover:bg-gray-850" data-player-uid="${uid}">
          <td class="p-3 text-center align-middle"><div class="flex items-center justify-center"><button type="button" class="gm-debt-interest-btn ${interestBtnState}" data-uid="${uid}" title="Pay ${formattedInterest} Debt Interest">Debt Interest ${formattedInterest}</button></div></td>
          <td class="p-3 font-semibold text-white align-middle">${member.displayName || 'Player'}</td>
          <td class="p-3 align-middle">${debtHoldingsText}</td>
        </tr>
      `;
    });

    gmPlayerDebtInterestBody.innerHTML = html;

    const btns = gmPlayerDebtInterestBody.querySelectorAll('.gm-debt-interest-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const playerUid = btn.getAttribute('data-uid');
        if (onPayDebtInterest && playerUid) {
          onPayDebtInterest(playerUid);
        }
      });
    });
  }
}
