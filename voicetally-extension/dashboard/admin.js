const token = sessionStorage.getItem('vt_token');
const role = sessionStorage.getItem('vt_role');
const BASE_URL = 'http://127.0.0.1:3000';

console.log(`[Admin] Initializing. Role: ${role}`);

if (!token || role !== 'admin') {
    console.warn(`[Admin] Unauthorized. Redirecting to login.`);
    window.location.href = 'login.html';
}

// ============================================================
// SIDEBAR NAVIGATION
// ============================================================
const navItems = document.querySelectorAll('.nav-item[data-view]');
const viewSections = document.querySelectorAll('.view-section');
const viewTitle = document.getElementById('viewTitle');

const viewTitles = {
    viewAuditLogs: 'Audit Logs',
    viewRateLimiting: 'Rate Limit Tuning',
    viewDataExplorer: 'Data Explorer',
    viewConnectors: 'Connectors'
};

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const targetView = item.getAttribute('data-view');
        console.info(`[Admin Nav] Switching to view: ${targetView}`);

        // Update nav active state
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        // Show/hide views
        viewSections.forEach(v => v.classList.remove('active'));
        document.getElementById(targetView).classList.add('active');

        // Update topbar title
        viewTitle.textContent = viewTitles[targetView] || 'Admin Panel';
    });
});


// ============================================================
// AUDIT LOGS
// ============================================================
const tbody = document.getElementById('auditTableBody');

async function fetchAuditLogs() {
    console.log(`[Admin] Fetching audit logs...`);
    try {
        const res = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (!res.ok) {
            console.warn(`[Admin] Fetch audit failed: ${data.error}`);
            if (res.status === 401 || res.status === 403) logout();
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--danger);">${data.error || 'Failed to load logs'}</td></tr>`;
            return;
        }

        console.log(`[Admin] Audit logs fetched.`, data);
        tbody.innerHTML = '';
        if (data.logs && data.logs.length > 0) {
            data.logs.forEach(log => {
                const isBlocked = log.status === 'Blocked' || log.status === 'Error';
                const row = `
                <tr>
                <td><span style="color: var(--text-muted); font-size: 13px;">${new Date(log.time).toLocaleString()}</span></td>
                <td style="font-family: monospace;">${log.user}</td>
                <td>${log.action}</td>
                <td><span class="badge ${isBlocked ? 'badge-warning' : 'badge-success'}">${log.status}</span></td>
                <td>
                    <button class="btn" style="padding: 4px 8px; font-size: 11px;">Inspect</button>
                    ${isBlocked ? '<button class="btn btn-danger" style="padding: 4px 8px; font-size: 11px; margin-left: 4px;">Ban IP</button>' : ''}
                </td>
                </tr>
            `;
                tbody.innerHTML += row;
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No recent audit logs found.</td></tr>`;
        }
    } catch (err) {
        console.error(`[Admin] Error fetching audit logs:`, err);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--danger);">Backend connection error.</td></tr>`;
    }
}

// Initialize audit logs on load
fetchAuditLogs();


// ============================================================
// RATE LIMIT TUNING
// ============================================================
document.getElementById('applyConfigBtn').addEventListener('click', async () => {
    const max = document.getElementById('rateLimitMax').value;
    const windowMin = document.getElementById('rateLimitWindow').value;
    const statusDiv = document.getElementById('configStatus');
    const btn = document.getElementById('applyConfigBtn');

    console.log(`[Admin] Updating rate limit: Max=${max}, Window=${windowMin}`);

    btn.disabled = true;
    statusDiv.textContent = 'Saving...';
    statusDiv.className = 'status-msg';

    try {
        const res = await fetch(`${BASE_URL}/api/admin/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ max, windowMin })
        });
        const data = await res.json();

        if (res.ok) {
            console.log(`[Admin] Config updated successfully.`);
            statusDiv.textContent = 'Rate limit configuration updated.';
            statusDiv.className = 'status-msg status-success';
            fetchAuditLogs();
        } else {
            console.warn(`[Admin] Config update failed: ${data.error}`);
            statusDiv.textContent = data.error || 'Failed to update.';
            statusDiv.className = 'status-msg status-error';
        }
    } catch (err) {
        console.error(`[Admin] Config update error:`, err);
        statusDiv.textContent = 'Backend connection error.';
        statusDiv.className = 'status-msg status-error';
    } finally {
        btn.disabled = false;
    }
});


// ============================================================
// DATA EXPLORER
// ============================================================
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

    const period = document.getElementById('filterPeriod').value;
    const statusFilter = document.getElementById('filterStatus').value;
    const customer = document.getElementById('filterCustomer').value.trim();

    const params = new URLSearchParams();
    if (period) params.append('period', period);
    if (statusFilter) params.append('status', statusFilter);
    if (customer) params.append('customer', customer);

    const endpoint = `/sales?${params.toString()}`;
    console.info(`[Admin Explorer] Fetching: ${BASE_URL}${endpoint}`);

    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error(`Server returned ${response.status}`);

        const data = await response.json();
        console.log(`[Admin Explorer] Data received:`, data);

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
                const st = rec.status.toLowerCase();
                let statusClass = '';
                if (st === 'paid') statusClass = 'badge-paid';
                else if (st === 'unpaid') statusClass = 'badge-unpaid';
                else if (st === 'processing') statusClass = 'badge-processing';
                else if (st === 'pending') statusClass = 'badge-pending';

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
        console.error(`[Admin Explorer] Error:`, err);
    }
});


// ============================================================
// CONNECTORS (Backend URL Settings)
// ============================================================
const connectorUrlInput = document.getElementById('connectorUrl');
const saveConnectorBtn = document.getElementById('saveConnectorBtn');
const connectorStatus = document.getElementById('connectorStatus');

// Load existing setting
if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['connectorUrl'], (res) => {
        connectorUrlInput.value = res.connectorUrl || 'http://127.0.0.1:3000';
    });
} else {
    connectorUrlInput.value = 'http://127.0.0.1:3000';
}

saveConnectorBtn.addEventListener('click', () => {
    let url = connectorUrlInput.value.trim();
    if (!url.startsWith('http')) url = 'http://' + url;
    if (url.endsWith('/')) url = url.slice(0, -1);

    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ connectorUrl: url }, () => {
            connectorStatus.textContent = 'Connection saved successfully.';
            connectorStatus.className = 'status-msg status-success';
            setTimeout(() => connectorStatus.textContent = '', 3000);
        });
    } else {
        connectorStatus.textContent = 'Chrome storage unavailable (standalone mode).';
        connectorStatus.className = 'status-msg status-error';
    }
});


// ============================================================
// GLOBAL: LOGOUT
// ============================================================
function logout() {
    console.log(`[Admin] Logging out...`);
    sessionStorage.clear();
    window.location.href = 'login.html';
}
window.logout = logout;
