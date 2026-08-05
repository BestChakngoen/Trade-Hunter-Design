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
    
    // Calculate pending BUY amount reserved by this player
    let pendingBuyTotal = 0;
    if (userUid && pendingOrders) {
      const targetUidStr = String(userUid).trim().toLowerCase();
      const allOrders = Object.values(pendingOrders);
      const userBuyOrders = allOrders.filter(o => o && o.uid && String(o.uid).trim().toLowerCase() === targetUidStr && o.type === 'BUY');
      
      pendingBuyTotal = userBuyOrders.reduce((sum, o) => sum + (Number(o.volume || 1) * Number(o.price || 0)), 0);
      
      console.log('🔍 [DEBUG PortfolioRenderer]', {
        userUid,
        targetUidStr,
        allPendingOrdersCount: allOrders.length,
        userBuyOrdersCount: userBuyOrders.length,
        userBuyOrders,
        cash: stats.cash,
        pendingBuyTotal,
        effectiveCash: Math.max(0, stats.cash - pendingBuyTotal)
      });
    } else {
      console.log('⚠️ [DEBUG PortfolioRenderer] Missing userUid or pendingOrders', { userUid, pendingOrders });
    }
    const effectiveCash = Math.max(0, stats.cash - pendingBuyTotal);

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
      const symbols = Object.keys(portfolio.stocks).filter(symbol => portfolio.stocks[symbol].volume > 0);
      
      if (symbols.length === 0) {
        holdingsTableBody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center py-6 text-gray-500 font-medium">No assets in portfolio</td>
          </tr>
        `;
        return;
      }
      
      const stockDetails = {
        KTF: { icon: 'Assets/Fincial_KTFFSF.png', sector: 'FINCIAL' },
        ABF: { icon: 'Assets/ABFSUFDPF.png', sector: 'AGRO' },
        ZIF: { icon: 'Assets/Indus_ZIFDTF.png', sector: 'INDUS' },
        FSF: { icon: 'Assets/Fincial_KTFFSF.png', sector: 'FINCIAL' },
        SICF: { icon: 'Assets/Tech_SICFVCOFDTSF.png', sector: 'TECH' },
        SUF: { icon: 'Assets/ABFSUFDPF.png', sector: 'AGRO' },
        SAAF: { icon: 'Assets/Resource_SAAFPTF.png', sector: 'RESOURCE' },
        VCOF: { icon: 'Assets/Tech_SICFVCOFDTSF.png', sector: 'TECH' },
        ARROF: { icon: 'Assets/Propcon_ARROF.png', sector: 'PROPCON' },
        KISF: { icon: 'Assets/KISFCUF.png', sector: 'CONSUMP' },
        TNF: { icon: 'Assets/Service_TNF.png', sector: 'SERVICE' },
        DTSF: { icon: 'Assets/Tech_SICFVCOFDTSF.png', sector: 'TECH' },
        DPF: { icon: 'Assets/ABFSUFDPF.png', sector: 'AGRO' },
        DTF: { icon: 'Assets/Indus_ZIFDTF.png', sector: 'INDUS' },
        PTF: { icon: 'Assets/Resource_SAAFPTF.png', sector: 'RESOURCE' },
        CUF: { icon: 'Assets/KISFCUF.png', sector: 'CONSUMP' }
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
            <td class="p-3">
              <div class="flex items-center gap-2">
                <img src="${details.icon}" class="w-5 h-5 object-contain flex-shrink-0" alt="${symbol}">
                <div class="font-bold text-white text-sm sm:text-base">${symbol}</div>
              </div>
            </td>
            <td>${holding.avgPrice.toLocaleString('en-US')}</td>
            <td>${marketPrice.toLocaleString('en-US')}</td>
            <td class="font-semibold text-white">${amount.toLocaleString('en-US')}</td>
            <td class="font-bold ${pnlColorClass}">${sign}${pnl.toLocaleString('en-US')} (${sign}${pnlPct.toFixed(2)}%)</td>
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
    
    if (badgeEl) {
      if (orderList.length > 0) {
        badgeEl.style.setProperty('display', 'inline-block', 'important');
      } else {
        badgeEl.style.setProperty('display', 'none', 'important');
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
      const formattedProposedPrice = order.price.toLocaleString('en-US');
      const actionColor = order.type === 'BUY' ? 'text-positive font-bold' : 'text-negative font-bold';
      
      html += `
        <tr class="border-b border-gray-800 hover:bg-gray-850" data-order-id="${order.id}">
          <td class="p-3 font-semibold text-white">${order.username}</td>
          <td class="p-3 ${actionColor}">${order.type}</td>
          <td class="p-3 font-bold text-yellow-500">${order.symbol}</td>
          <td class="p-3">${order.volume.toLocaleString('en-US')}</td>
          <td class="p-3 text-gray-400">${formattedProposedPrice}</td>
          <td class="p-3 text-center flex justify-center gap-2">
            <button class="gm-approve-btn">✔️ Approve</button>
            <button class="gm-reject-btn">❌ Reject</button>
          </td>
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
          <td colspan="5" class="text-center py-4 text-gray-500 font-medium">No pending orders</td>
        </tr>
      `;
      return;
    }
    
    let html = '';
    myOrders.forEach(order => {
      const totalAmount = order.volume * order.price;
      const actionColor = order.type === 'BUY' ? 'text-positive font-bold' : 'text-negative font-bold';
      
      html += `
        <tr class="hover:bg-gray-900 transition-colors">
          <td class="${actionColor}">${order.type}</td>
          <td class="font-bold text-white">${order.symbol}</td>
          <td>${order.price.toLocaleString('en-US')}</td>
          <td class="font-semibold text-white">${totalAmount.toLocaleString('en-US')}</td>
          <td>
            <span class="text-yellow-400 font-bold text-[11px] uppercase tracking-wider">
              PENDING GM APPROVAL
            </span>
          </td>
        </tr>
      `;
    });
    playerPendingOrdersBody.innerHTML = html;
  }

  updateGMPlayerSalaryUI(gmPlayerSalaryBody, members, onPaySalary) {
    if (!gmPlayerSalaryBody) return;

    // Filter out GM members (check both role and displayName)
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
          <td class="p-3 font-semibold text-white">${member.displayName || 'Player'}</td>
          <td class="p-3 text-emerald-400 font-semibold">${formattedCash}</td>
          <td class="p-3 text-center flex justify-center">
            <button type="button" class="gm-salary-btn" data-uid="${uid}">pay 10,000</button>
          </td>
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
}
