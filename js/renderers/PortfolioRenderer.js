/**
 * PortfolioRenderer - Manages Portfolio Assets Table, PnL Summaries, and Orders Approval Queue Tables.
 */
export class PortfolioRenderer {
  updatePortfolioUI(stats, portfolio, boardStocks) {
    const portCash = document.getElementById('portCash');
    const portTotalAssets = document.getElementById('portTotalAssets');
    const portTotalPnL = document.getElementById('portTotalPnL');
    const holdingsTableBody = document.getElementById('holdingsTableBody');
    
    if (portCash) portCash.textContent = stats.cash.toLocaleString('en-US') + ' THB';
    if (portTotalAssets) portTotalAssets.textContent = stats.totalAssets.toLocaleString('en-US') + ' THB';
    
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
            <td colspan="6" class="text-center py-6 text-gray-500 font-medium">No assets in portfolio</td>
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
                <img src="${details.icon}" class="w-8 h-8 rounded-full border border-gray-800 bg-gray-950 p-1" alt="${symbol}">
                <div>
                  <div class="font-bold text-white text-sm sm:text-base">${symbol}</div>
                  <div class="text-[9px] text-gray-500 font-bold uppercase tracking-wider">${details.sector}</div>
                </div>
              </div>
            </td>
            <td>${holding.volume.toLocaleString('en-US')}</td>
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
            <button class="gm-approve-btn bg-green-700 hover:bg-green-600 text-white font-bold px-3 py-1 rounded text-xs transition-colors">✔️ Approve</button>
            <button class="gm-reject-btn bg-red-700 hover:bg-red-600 text-white font-bold px-3 py-1 rounded text-xs transition-colors">❌ Reject</button>
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
    
    const myOrders = Object.values(orders).filter(order => order.uid === uid);
    if (myOrders.length === 0) {
      playerPendingOrdersBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-gray-500 font-medium">No pending orders</td>
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
          <td>${order.volume.toLocaleString('en-US')}</td>
          <td>${order.price.toLocaleString('en-US')}</td>
          <td class="font-semibold text-white">${totalAmount.toLocaleString('en-US')}</td>
          <td>
            <span class="px-2 py-0.5 text-[10px] font-bold rounded bg-yellow-950 text-yellow-400 border border-yellow-800">
              PENDING GM APPROVAL
            </span>
          </td>
        </tr>
      `;
    });
    playerPendingOrdersBody.innerHTML = html;
  }
}
