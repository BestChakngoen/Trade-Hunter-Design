import { TradeService } from '../services/TradeService.js';

/**
 * ManagementTablesRenderer - Dedicated renderer responsible for GM Management tab tables
 * including GM Pending Orders queue, Player Salary payouts, Player Dividend payouts,
 * and Debt Interest payouts.
 * Adheres to Single Responsibility Principle (SRP).
 */
export class ManagementTablesRenderer {
  /**
   * Renders the GM Pending Orders table with Approve & Reject action buttons.
   */
  updateGMPendingOrdersUI(gmPendingOrdersBody, orders = {}, onApprove = null, onReject = null, members = {}) {
    if (!gmPendingOrdersBody) return;
    
    const orderList = Object.values(orders || {}).filter(order => {
      if (!order) return false;
      if (members && Object.keys(members).length > 0) {
        if (!order.uid || !members[order.uid] || members[order.uid].online === false) {
          return false;
        }
      }
      return true;
    });
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

  /**
   * Renders the GM Player Salary table.
   */
  updateGMPlayerSalaryUI(gmPlayerSalaryBody, members, onPaySalary) {
    if (!gmPlayerSalaryBody) return;

    const memberList = Object.entries(members || {}).filter(([uid, member]) => {
      if (!member) return false;
      const role = (member.role || '').toLowerCase();
      const name = (member.displayName || '').toUpperCase();
      const isOnline = member.online !== false;
      return role !== 'game_master' && name !== 'GM' && isOnline;
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

  /**
   * Renders the GM Player Dividend table.
   */
  updateGMPlayerDividendUI(gmPlayerDividendBody, members, boardStocks = {}, masterStocks = {}, originalCards = [], onPayDividend = null) {
    if (!gmPlayerDividendBody) return;

    const memberList = Object.entries(members || {}).filter(([uid, member]) => {
      if (!member) return false;
      const role = (member.role || '').toLowerCase();
      const name = (member.displayName || '').toUpperCase();
      const isOnline = member.online !== false;
      return role !== 'game_master' && name !== 'GM' && isOnline;
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

  /**
   * Renders the GM Player Debt Interest table.
   */
  updateGMPlayerDebtInterestUI(gmPlayerDebtInterestBody, members, onPayDebtInterest = null) {
    if (!gmPlayerDebtInterestBody) return;

    const memberList = Object.entries(members || {}).filter(([uid, member]) => {
      if (!member) return false;
      const role = (member.role || '').toLowerCase();
      const name = (member.displayName || '').toUpperCase();
      const isOnline = member.online !== false;
      return role !== 'game_master' && name !== 'GM' && isOnline;
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
