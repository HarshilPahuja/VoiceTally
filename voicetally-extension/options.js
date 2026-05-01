document.addEventListener('DOMContentLoaded', () => {

    // --- UI NAVIGATION ---
    const navDataExplorer = document.getElementById('navDataExplorer');
    const navSettings = document.getElementById('navSettings');
    const viewDataExplorer = document.getElementById('viewDataExplorer');
    const viewSettings = document.getElementById('viewSettings');

    navDataExplorer.addEventListener('click', () => {
        navDataExplorer.classList.add('active');
        navSettings.classList.remove('active');
        viewDataExplorer.style.display = 'block';
        viewSettings.style.display = 'none';
    });

    navSettings.addEventListener('click', () => {
        navSettings.classList.add('active');
        navDataExplorer.classList.remove('active');
        viewSettings.style.display = 'block';
        viewDataExplorer.style.display = 'none';
    });


    // --- SETTINGS LOGIC ---
    const connectorUrlInput = document.getElementById('connectorUrl');
    const intelligenceApiUrlInput = document.getElementById('intelligenceApiUrl');
    const sidePanelToggle = document.getElementById('sidePanelToggle');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const settingsStatus = document.getElementById('settingsStatus');

    // Load existing settings
    chrome.storage.local.get(['connectorUrl', 'intelligenceApiUrl', 'sidePanelEnabled'], (res) => {
        connectorUrlInput.value = res.connectorUrl || 'http://127.0.0.1:3000';
        intelligenceApiUrlInput.value = res.intelligenceApiUrl || 'http://127.0.0.1:8001';
        sidePanelToggle.checked = res.sidePanelEnabled === true;
    });

    saveSettingsBtn.addEventListener('click', () => {
        let url = connectorUrlInput.value.trim();
        if (!url.startsWith('http')) url = 'http://' + url;
        if (url.endsWith('/')) url = url.slice(0, -1);

        let intellUrl = intelligenceApiUrlInput.value.trim();
        if (!intellUrl.startsWith('http') && intellUrl !== '') intellUrl = 'http://' + intellUrl;
        if (intellUrl.endsWith('/')) intellUrl = intellUrl.slice(0, -1);

        const isSidePanelEnabled = sidePanelToggle.checked;

        chrome.storage.local.set({ 
            connectorUrl: url,
            intelligenceApiUrl: intellUrl || 'http://127.0.0.1:8001',
            sidePanelEnabled: isSidePanelEnabled
        }, () => {
            // Notify background script to apply the behavior immediately
            try {
                chrome.runtime.sendMessage({ action: 'update_side_panel', enabled: isSidePanelEnabled });
            } catch (e) {
                console.warn("Could not notify background script:", e);
            }

            settingsStatus.textContent = 'Settings saved successfully.';
            settingsStatus.className = 'status-msg status-success';
            setTimeout(() => settingsStatus.textContent = '', 3000);
        });
    });


    // --- DATA EXPLORER LOGIC ---
    const fetchDataBtn = document.getElementById('fetchDataBtn');
    const explorerStatus = document.getElementById('explorerStatus');
    const explorerResults = document.getElementById('explorerResults');
    const dataTableBody = document.getElementById('dataTableBody');
    const summaryBar = document.getElementById('summaryBar');

    fetchDataBtn.addEventListener('click', async () => {
        explorerStatus.textContent = 'Fetching data...';
        explorerStatus.className = 'status-msg';
        explorerResults.style.display = 'none';
        dataTableBody.innerHTML = '';

        chrome.storage.local.get(['connectorUrl'], async (res) => {
            const baseUrl = res.connectorUrl || 'http://127.0.0.1:3000';
            const period = document.getElementById('filterPeriod').value;
            const statusFilter = document.getElementById('filterStatus').value;
            const customer = document.getElementById('filterCustomer').value.trim();

            const params = new URLSearchParams();
            if (period) params.append('period', period);
            if (statusFilter) params.append('status', statusFilter);
            if (customer) params.append('customer', customer);

            const endpoint = `/sales?${params.toString()}`;

            try {
                const response = await fetch(`${baseUrl}${endpoint}`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}`);
                }

                const data = await response.json();

                // Render UI
                explorerStatus.textContent = '';
                explorerResults.style.display = 'block';

                summaryBar.innerHTML = `
          <div><strong>Gross Total:</strong> ₹${data.total || 0}</div>
          <div><strong>Transactions:</strong> ${data.transaction_count || 0}</div>
          <div><strong>Average:</strong> ₹${data.average_value || 0}</div>
        `;

                if (data.detailed_records && data.detailed_records.length > 0) {
                    data.detailed_records.forEach(rec => {
                        const tr = document.createElement('tr');
                        const dateStr = rec.date ? rec.date.split('T')[0] : 'N/A';
                        const statusClass = rec.status.toLowerCase() === 'paid' ? 'badge-paid' : (rec.status.toLowerCase() === 'pending' ? 'badge-pending' : '');

                        tr.innerHTML = `
              <td>${dateStr}</td>
              <td>${rec.customer}</td>
              <td>₹${rec.amount}</td>
              <td><span class="badge ${statusClass}">${rec.status}</span></td>
            `;
                        dataTableBody.appendChild(tr);
                    });
                } else {
                    dataTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No records match your criteria.</td></tr>`;
                }

            } catch (err) {
                explorerStatus.textContent = `Error: ${err.message}. Is your backend running?`;
                explorerStatus.className = 'status-msg status-error';
                console.error(err);
            }
        });
    });

});
