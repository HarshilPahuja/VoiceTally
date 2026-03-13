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
// DATA EXPLORER (Tally Vector Search)
// ============================================================
const tallySearchBtn = document.getElementById('tallySearchBtn');
const explorerStatus = document.getElementById('explorerStatus');
const explorerResults = document.getElementById('explorerResults');
const dataTableBody = document.getElementById('dataTableBody');
const summaryBar = document.getElementById('summaryBar');

function getTallyUrl() {
    return new Promise(resolve => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get(['tallyApiUrl'], (res) => {
                resolve(res.tallyApiUrl || 'http://localhost:8000');
            });
        } else {
            resolve('http://localhost:8000');
        }
    });
}

tallySearchBtn.addEventListener('click', async () => {
    const query = document.getElementById('tallySearchQuery').value.trim();
    if (!query) {
        explorerStatus.textContent = 'Please enter a search query.';
        explorerStatus.className = 'status-msg status-error';
        return;
    }

    explorerStatus.textContent = 'Searching Tally...';
    explorerStatus.className = 'status-msg';
    explorerResults.style.display = 'none';
    dataTableBody.innerHTML = '';

    const collection = document.getElementById('tallyCollection').value;
    const customer = document.getElementById('tallyCustomer').value.trim();

    const body = { query, top_k: 20 };
    if (collection) body.collection = collection;
    if (customer) body.customer = customer;

    const tallyUrl = await getTallyUrl();
    console.info(`[Admin Explorer] POST ${tallyUrl}/search`, body);

    try {
        const response = await fetch(`${tallyUrl}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) throw new Error(`Tally API returned ${response.status}`);

        const data = await response.json();
        console.log(`[Admin Explorer] Results:`, data);

        explorerStatus.textContent = '';
        explorerResults.style.display = 'block';

        summaryBar.innerHTML = `
            <div><strong>Query:</strong> ${data.query || ''}</div>
            <div><strong>Results:</strong> ${data.result_count || 0}</div>
        `;

        if (data.results && data.results.length > 0) {
            data.results.forEach(r => {
                const tr = document.createElement('tr');
                const pct = Math.round((r.relevance || 0) * 100);
                const badge = pct >= 70 ? 'badge-paid' : pct >= 40 ? 'badge-processing' : 'badge-unpaid';
                tr.innerHTML = `
                    <td><span class="badge badge-pending">${r.collection || ''}</span></td>
                    <td title="${(r.summary || '').replace(/"/g, '&quot;')}">${r.summary || ''}</td>
                    <td><span class="badge ${badge}">${pct}%</span></td>
                `;
                dataTableBody.appendChild(tr);
            });
        } else {
            dataTableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">No matching records found.</td></tr>`;
        }
    } catch (err) {
        explorerStatus.textContent = `Error: ${err.message}. Is the Tally API running?`;
        explorerStatus.className = 'status-msg status-error';
        console.error(`[Admin Explorer] Error:`, err);
    }
});


// ============================================================
// CONNECTORS (Backend URL Settings)
// ============================================================
const connectorUrlInput = document.getElementById('connectorUrl');
const tallyApiUrlInput = document.getElementById('tallyApiUrl');
const saveConnectorBtn = document.getElementById('saveConnectorBtn');
const connectorStatus = document.getElementById('connectorStatus');

// Load existing settings
if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['connectorUrl', 'tallyApiUrl'], (res) => {
        connectorUrlInput.value = res.connectorUrl || 'http://127.0.0.1:3000';
        tallyApiUrlInput.value = res.tallyApiUrl || 'http://localhost:8000';
    });
} else {
    connectorUrlInput.value = 'http://127.0.0.1:3000';
    tallyApiUrlInput.value = 'http://localhost:8000';
}

saveConnectorBtn.addEventListener('click', () => {
    let nodeUrl = connectorUrlInput.value.trim();
    if (!nodeUrl.startsWith('http')) nodeUrl = 'http://' + nodeUrl;
    if (nodeUrl.endsWith('/')) nodeUrl = nodeUrl.slice(0, -1);

    let tallyUrl = tallyApiUrlInput.value.trim();
    if (!tallyUrl.startsWith('http')) tallyUrl = 'http://' + tallyUrl;
    if (tallyUrl.endsWith('/')) tallyUrl = tallyUrl.slice(0, -1);

    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ connectorUrl: nodeUrl, tallyApiUrl: tallyUrl }, () => {
            connectorStatus.textContent = 'Both connections saved successfully.';
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

// ============================================================
// LIVE UPDATES VIA WEBSOCKET
// ============================================================
async function connectWebSocket() {
    const tallyUrl = await getTallyUrl();
    // Convert http(s):// to ws(s)://
    const wsUrl = tallyUrl.replace(/^http/, 'ws') + '/ws';
    
    console.info(`[Admin Explorer] Connecting to WebSocket at ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log(`[Admin Explorer] WebSocket connected for live Tally updates.`);
    };

    ws.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.type === "data_updated") {
                console.info(`🔄 [Admin Explorer] Tally data changed! Automatically refreshing results...`);
                // Only refresh if the admin actually has a query typed in
                if (document.getElementById('tallySearchQuery').value.trim()) {
                    tallySearchBtn.click();
                }
            }
        } catch (err) {
            console.error('[Admin Explorer] Error parsing WS message:', err);
        }
    };

    ws.onclose = () => {
        console.warn(`[Admin Explorer] WebSocket disconnected. Retrying in 5 seconds...`);
        setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = (err) => {
        console.error(`[Admin Explorer] WebSocket error. Is Tally API running?`);
        ws.close();
    };
}

// Start WebSocket connection
connectWebSocket();
