const token = sessionStorage.getItem('vt_token');
const role = sessionStorage.getItem('vt_role');

console.log(`[Dashboard] Initializing index view. Role: ${role || 'None'}`);

if (!token) {
    console.warn(`[Dashboard] No token found, redirecting to login.`);
    window.location.href = 'login.html';
}

// Bind UI based on Session Storage role
if (role === 'admin') {
    document.getElementById('adminLink').style.display = 'inline-block';
    document.getElementById('userEmail').textContent = 'Admin User';
    document.getElementById('greeting').textContent = 'Welcome back, Admin!';
} else {
    document.getElementById('userEmail').textContent = 'Standard User';
}

// Constants
const viewTitles = {
    viewOverview: 'Overview',
    viewDataExplorer: 'Data Explorer',
    viewHistory: 'Query History'
};

const chartDefinitions = [
    { key: 'cash_bank', title: 'Cash & Bank', subtitle: 'Receipts vs payments', chip: 'Live' },
    { key: 'profit_loss', title: 'Profit & Loss', subtitle: 'Sales vs purchases', chip: 'Monthly' },
    { key: 'purchase_sales', title: 'Revenue Trend', subtitle: 'Time series movement', chip: 'Trend' },
    { key: 'stock_value', title: 'Stock Value', subtitle: 'Top stock groups', chip: 'Inventory' },
    { key: 'capital_assets', title: 'Capital & Assets', subtitle: 'Ledger composition', chip: 'Balance' },
    { key: 'top_5_reports', title: 'Top 5 Receivables', subtitle: 'Highest customer volume', chip: 'Customers' },
    { key: 'slow_items', title: 'Slow Moving Items', subtitle: 'Inventory risk signal', chip: 'Alerts' },
    { key: 'overdue_bills', title: 'Bills Aging', subtitle: 'Overdue buckets', chip: 'Aging' }
];

const navItems = document.querySelectorAll('.nav-item[data-view]');
const viewSections = document.querySelectorAll('.view-section');
const viewTitle = document.getElementById('viewTitle');
const sidebarToggle = document.getElementById('sidebarToggle');

function setView(targetView) {
    navItems.forEach(n => n.classList.remove('active'));
    const activeItem = document.querySelector(`.nav-item[data-view="${targetView}"]`);
    if (activeItem) activeItem.classList.add('active');

    viewSections.forEach(v => v.classList.remove('active'));
    const targetEl = document.getElementById(targetView);
    if (targetEl) targetEl.classList.add('active');

    if (viewTitle) viewTitle.textContent = viewTitles[targetView] || 'Dashboard';
}

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const targetView = item.getAttribute('data-view');
        setView(targetView);
    });
});

if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.classList.toggle('collapsed');
        document.body.classList.toggle('sidebar-collapsed');
    });
}

function fetchHistory() {
    console.log(`[Dashboard] Fetching user history...`);
    fetch('http://127.0.0.1:3000/api/user/history', {
        headers: { 'Authorization': `Bearer ${token}` }
    }).then(res => res.json().then(data => ({res, data})))
    .then(({res, data}) => {
        if (!res.ok) {
            console.warn(`[Dashboard] Failed to fetch history: ${data.error}`);
            if (res.status === 401 || res.status === 403) logout(); // Token expired or invalid
            document.getElementById('historyList').innerHTML = `<tr><td colspan="3" style="color:var(--danger)">${data.error || 'Failed to load history.'}</td></tr>`;
            return;
        }

        console.log(`[Dashboard] History fetched successfully.`, data);

        if (data.history && data.history.length > 0) {
            let html = '';
            data.history.forEach(log => {
                const isWarning = (log.status || '').toLowerCase() === 'blocked' || (log.status || '').toLowerCase() === 'error';
                const statusClass = isWarning ? 'badge-warning' : 'badge-success';
                html += `<tr>
                    <td><span class="muted" style="font-size:13px;">${new Date(log.time).toLocaleString()}</span></td>
                    <td>${escapeHtml(log.action)}</td>
                    <td><span class="badge ${statusClass}">${escapeHtml(log.status)}</span></td>
                </tr>`;
            });
            document.getElementById('historyList').innerHTML = html;
        } else {
            document.getElementById('historyList').innerHTML = '<tr><td colspan="3" class="muted">No recent history found.</td></tr>';
        }
    })
    .catch(err => {
        console.error(`[Dashboard] Error fetching history:`, err);
        document.getElementById('historyList').innerHTML = `<tr><td colspan="3" style="color:var(--danger)">Backend connection error.</td></tr>`;
    });
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

fetchHistory();

function logout() {
    console.log(`[Dashboard] Logging out...`);
    sessionStorage.clear();
    window.location.href = 'login.html';
}
window.logout = logout;

// ============================================================
// DATA EXPLORER (Tally Vector Search)
// ============================================================
const tallySearchBtn = document.getElementById('tallySearchBtn');
const generatePdfBtn = document.getElementById('generatePdfBtn');
const explorerStatus = document.getElementById('explorerStatus');
const explorerResults = document.getElementById('explorerResults');
const dataTableBody = document.getElementById('dataTableBody');
const summaryBar = document.getElementById('summaryBar');

let lastTallyData = null;

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

function getIntelligenceApiUrl() {
    return new Promise(resolve => {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get(['intelligenceApiUrl'], (res) => {
                resolve(res.intelligenceApiUrl || 'http://127.0.0.1:8001');
            });
        } else {
            resolve('http://127.0.0.1:8001');
        }
    });
}

// ============================================================
// THEME TOGGLE
// ============================================================
const themeToggleBtn = document.getElementById('themeToggleBtn');
let currentTheme = localStorage.getItem('vt_theme') || 'light';

function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark-mode');
        if (themeToggleBtn) themeToggleBtn.textContent = '☀️';
    } else {
        document.documentElement.classList.remove('dark-mode');
        if (themeToggleBtn) themeToggleBtn.textContent = '🌙';
    }
    currentTheme = theme;
    localStorage.setItem('vt_theme', theme);
    // Refresh charts when theme changes
    if (typeof fetchDashboardVisuals === 'function') {
        fetchDashboardVisuals();
    }
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        applyTheme(currentTheme === 'light' ? 'dark' : 'light');
    });
}

// Initial theme setup (but do not fetch charts immediately here, it's called at the end of the file)
if (currentTheme === 'dark') {
    document.documentElement.classList.add('dark-mode');
    if (themeToggleBtn) themeToggleBtn.textContent = '☀️';
}

// ============================================================
// DASHBOARD VISUALS (Pandas + Matplotlib Base64 Graphs)
// ============================================================

function renderChartSkeletons() {
    const chartsContainer = document.getElementById('chartsContainer');
    if (!chartsContainer) return;
    chartsContainer.innerHTML = chartDefinitions.map(def => `
        <div class="chart-card" data-chart-key="${def.key}">
            <div class="chart-card-header">
                <div>
                    <div class="chart-title">${escapeHtml(def.title)}</div>
                    <div class="chart-subtitle">${escapeHtml(def.subtitle)}</div>
                </div>
                <span class="chip">${escapeHtml(def.chip)}</span>
            </div>
            <div class="chart-body">
                <div class="chart-skeleton"></div>
            </div>
        </div>
    `).join('');
}

function renderCharts(charts) {
    const chartsContainer = document.getElementById('chartsContainer');
    if (!chartsContainer) return;
    chartsContainer.innerHTML = chartDefinitions.map(def => {
        const img = charts?.[def.key];
        const body = img
            ? `<div class="chart-body"><img src="${img}" alt="${escapeHtml(def.title)} chart" loading="lazy" /></div>`
            : `<div class="chart-body"><div class="empty-state">Data unavailable for this chart.</div></div>`;

        return `
            <div class="chart-card" data-chart-key="${def.key}">
                <div class="chart-card-header">
                    <div>
                        <div class="chart-title">${escapeHtml(def.title)}</div>
                        <div class="chart-subtitle">${escapeHtml(def.subtitle)}</div>
                    </div>
                    <span class="chip">${escapeHtml(def.chip)}</span>
                </div>
                ${body}
            </div>
        `;
    }).join('');
}

async function fetchDashboardVisuals() {
    const chartsContainer = document.getElementById('chartsContainer');
    if (!chartsContainer) return;

    const intellUrl = await getIntelligenceApiUrl();
    const theme = document.documentElement.classList.contains('dark-mode') ? 'dark' : 'light';
    console.info(`[Dashboard] Fetching graphical insights from ${intellUrl}/dashboard/visuals?theme=${theme}`);

    renderChartSkeletons();

    try {
        const res = await fetch(`${intellUrl}/dashboard/visuals?theme=${theme}`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        
        const data = await res.json();
        
        if (data.status === 'success' && data.charts) {
            renderCharts(data.charts);
        }
    } catch (err) {
        console.error(`[Dashboard] Failed to fetch visuals:`, err);
        chartsContainer.innerHTML = `
            <div class="chart-card" style="grid-column: 1 / -1;">
                <div class="chart-card-header">
                    <div>
                        <div class="chart-title">Dashboard load failed</div>
                        <div class="chart-subtitle">The Intelligence API could not be reached.</div>
                    </div>
                    <span class="chip">Error</span>
                </div>
                <div class="chart-body">
                    <div class="empty-state">
                        Failed to load financial insights from Intelligence API.
                        <div style="margin-top:8px;" class="mini-note">${escapeHtml(intellUrl)}</div>
                    </div>
                </div>
            </div>
        `;
    }
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
    console.info(`[Dashboard Explorer] POST ${tallyUrl}/search`, body);

    try {
        const response = await fetch(`${tallyUrl}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) throw new Error(`Tally API returned ${response.status}`);

        const data = await response.json();
        console.log(`[Dashboard Explorer] Results:`, data);
        lastTallyData = data;

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
        console.error(`[Dashboard Explorer] Error:`, err);
    }
});

generatePdfBtn.addEventListener('click', async () => {
    if (!lastTallyData || !lastTallyData.results || lastTallyData.results.length === 0) {
        alert("Please perform a successful search first to generate a report.");
        return;
    }

    const intellUrl = await getIntelligenceApiUrl();
    const points = lastTallyData.results.map(r => r.summary).filter(Boolean).slice(0, 15);

    const body = {
        title: "VoiceTally Data Explorer Report",
        summary: `Search Query: "${lastTallyData.query || 'N/A'}"\nTotal Results Found: ${lastTallyData.result_count || 0}`,
        data: {
            points: points
        }
    };

    generatePdfBtn.textContent = "⏳ Generating...";
    generatePdfBtn.disabled = true;

    try {
        console.info(`[Dashboard] Requesting PDF generation...`);
        const response = await fetch(`${intellUrl}/reports/generate-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) throw new Error(`Report generation failed (${response.status})`);

        const data = await response.json();
        if (data.pdf_path) {
            // pdf_path is something like 'reports/voicetally_data_explorer_report_2026-03-14.pdf'
            // We use the static mount configured in app/main.py
            let cleanPath = data.pdf_path.replace(/\\/g, '/');
            if (cleanPath.startsWith('reports/')) {
                cleanPath = cleanPath.replace('reports/', 'downloads/');
            }
            const pdfUrl = `${intellUrl}/${cleanPath}`;
            console.log(`[Dashboard] Opening PDF at: ${pdfUrl}`);
            window.open(pdfUrl, '_blank');
        }
    } catch (err) {
        console.error("[Dashboard] Error generating PDF:", err);
        alert("Failed to generate PDF. Make sure the Intelligence API is running at " + intellUrl);
    } finally {
        generatePdfBtn.textContent = "📄 Generate PDF Report";
        generatePdfBtn.disabled = false;
    }
});
``
// ============================================================
// LIVE UPDATES VIA WEBSOCKET
// ============================================================
async function connectWebSocket() {
    const tallyUrl = await getTallyUrl();
    // Convert http(s):// to ws(s)://
    const wsUrl = tallyUrl.replace(/^http/, 'ws') + '/ws';
    
    console.info(`[Dashboard] Connecting to WebSocket at ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log(`[Dashboard] WebSocket connected for live Tally updates.`);
    };

    ws.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.type === "data_updated") {
                console.info(`🔄 [Dashboard] Tally data changed! Automatically refreshing results...`);
                // Auto-refresh the charts
                fetchDashboardVisuals();
                // Only refresh table if there's already a query in the box
                if (document.getElementById('tallySearchQuery').value.trim()) {
                    tallySearchBtn.click();
                }
            }
        } catch (err) {
            console.error('[Dashboard] Error parsing WS message:', err);
        }
    };

    ws.onclose = () => {
        console.warn(`[Dashboard] WebSocket disconnected. Retrying in 5 seconds...`);
        setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = (err) => {
        console.error(`[Dashboard] WebSocket error. Is Tally API running?`);
        ws.close();
    };
}

// Start WebSocket connection
connectWebSocket();
// Fetch Initial Graph Visualizations
fetchDashboardVisuals();
