(() => {
    const token = sessionStorage.getItem('vt_token');
    const role = sessionStorage.getItem('vt_role');

    const DEFAULT_NODE_URL = 'http://127.0.0.1:3000';
    const DEFAULT_TALLY_URL = 'http://localhost:8000';
    const DEFAULT_INTELLIGENCE_URL = 'http://127.0.0.1:8001';

    if (!token || role !== 'admin') {
        window.location.href = 'login.html';
        return;
    }

    const $ = (id) => document.getElementById(id);

    const navItems = document.querySelectorAll('.nav-item[data-view]');
    const viewSections = document.querySelectorAll('.view-section');
    const viewTitle = $('viewTitle');

    const auditTableBody = $('auditTableBody');
    const rateLimitMaxInput = $('rateLimitMax');
    const rateLimitWindowInput = $('rateLimitWindow');
    const configStatus = $('configStatus');
    const applyConfigBtn = $('applyConfigBtn');

    const tallySearchBtn = $('tallySearchBtn');
    const generatePdfBtn = $('generatePdfBtn');
    const explorerStatus = $('explorerStatus');
    const explorerResults = $('explorerResults');
    const dataTableBody = $('dataTableBody');
    const summaryBar = $('summaryBar');
    const chartRangeButtons = document.querySelectorAll('[data-chart-range]');
    const chartsUpdatedAt = $('chartsUpdatedAt');
    const chartsContainerAdmin = $('chartsContainerAdmin');
    const metricCardsContainer = $('metricCardsContainer');
    const refreshDashboardBtn = $('refreshDashboardBtn');

    const connectorUrlInput = $('connectorUrl');
    const tallyApiUrlInput = $('tallyApiUrl');
    const intelligenceApiUrlInput = $('intelligenceApiUrl');
    const saveConnectorBtn = $('saveConnectorBtn');
    const connectorStatus = $('connectorStatus');

    const themeToggleBtn = $('themeToggleBtn');
    const exportCsvBtn = $('exportCsvBtn');
    const sidebarToggle = $('sidebarToggle');

    const viewTitles = {
        viewAuditLogs: 'Audit Logs',
        viewRateLimiting: 'Rate Limit Tuning',
        viewDataExplorer: 'Data Explorer',
        viewConnectors: 'Connectors'
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

    const metricDefaults = [
        { label: 'Monthly Revenue', value: 0, format: 'currency', subtitle: 'Sales booked this period', icon: '₹', trend: 'up' },
        { label: 'Burn Rate', value: 0, format: 'currency', subtitle: 'Payments outflow', icon: '↘', trend: 'down' },
        { label: 'Runway', value: 0, format: 'number', subtitle: 'Estimated months', icon: '⏱', suffix: ' months', trend: 'up' },
        { label: 'Gross Margin', value: 0, format: 'percent', subtitle: 'Current margin', icon: '◎', trend: 'up' },
        { label: 'Cash Position', value: 0, format: 'currency', subtitle: 'Receipts minus payments', icon: '◉', trend: 'up' },
        { label: 'Receivables', value: 0, format: 'currency', subtitle: 'Top 5 customers', icon: '↗', trend: 'up' },
        { label: 'Stock Groups', value: 0, format: 'number', subtitle: 'Distinct inventory groups', icon: '▦' },
        { label: 'Ledgers', value: 0, format: 'number', subtitle: 'Ledger groups found', icon: '≡' }
    ];

    let latestAuditLogs = [];
    let lastTallyData = null;
    let currentTheme = localStorage.getItem('vt_theme') || 'light';
    let currentChartRange = localStorage.getItem('vt_chart_range') || '7d';
    let ws = null;
    let reconnectDelay = 3000;
    let reconnectTimer = null;

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeUrl(value, fallback) {
        const raw = String(value ?? '').trim();
        if (!raw) return fallback;
        let url = raw;
        if (!/^https?:\/\//i.test(url)) {
            url = `http://${url}`;
        }
        return url.replace(/\/+$/, '');
    }

    function formatIndianCurrency(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '₹0';
        const abs = Math.abs(n);
        const sign = n < 0 ? '-' : '';
        const fmt1 = (x) => Number.isInteger(x) ? String(x) : x.toFixed(1);

        if (abs >= 10000000) return `${sign}₹${fmt1(abs / 10000000)}Cr`;
        if (abs >= 100000) return `${sign}₹${fmt1(abs / 100000)}L`;
        return `${sign}₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(abs)}`;
    }

    function formatValue(metric) {
        const raw = metric?.value ?? 0;
        if (metric?.format === 'currency') return formatIndianCurrency(raw);
        if (metric?.format === 'percent') {
            const n = Number(raw);
            return `${Number.isFinite(n) ? n.toFixed(1) : '0.0'}%`;
        }
        if (metric?.format === 'duration') {
            const n = Number(raw);
            return `${Number.isFinite(n) ? n.toFixed(1) : '0.0'}${metric.suffix || ''}`;
        }
        const n = Number(raw);
        const formatted = Number.isFinite(n)
            ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
            : String(raw ?? '—');
        return `${formatted}${metric?.suffix || ''}`;
    }

    function setStatus(el, message, type = '') {
        if (!el) return;
        el.textContent = message || '';
        el.className = `status-msg${type ? ` status-${type}` : ''}`;
    }

    function setView(targetView) {
        navItems.forEach(n => n.classList.remove('active'));
        const activeItem = document.querySelector(`.nav-item[data-view="${targetView}"]`);
        if (activeItem) activeItem.classList.add('active');

        viewSections.forEach(v => v.classList.remove('active'));
        const targetEl = document.getElementById(targetView);
        if (targetEl) targetEl.classList.add('active');

        if (viewTitle) viewTitle.textContent = viewTitles[targetView] || 'Admin Panel';
    }

    function applyTheme(theme) {
        const root = document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark-mode');
            if (themeToggleBtn) themeToggleBtn.textContent = '☀️';
        } else {
            root.classList.remove('dark-mode');
            if (themeToggleBtn) themeToggleBtn.textContent = '🌙';
        }
        currentTheme = theme;
        localStorage.setItem('vt_theme', theme);
    }

    function updateRangeButtons() {
        chartRangeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.chartRange === currentChartRange);
        });
        localStorage.setItem('vt_chart_range', currentChartRange);
    }

    async function getStorage(keys) {
        const fallback = {};
        keys.forEach((key) => {
            fallback[key] = localStorage.getItem(key) || '';
        });

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            return new Promise(resolve => {
                chrome.storage.local.get(keys, (res) => {
                    resolve({ ...fallback, ...(res || {}) });
                });
            });
        }

        return fallback;
    }

    async function setStorage(data) {
        Object.entries(data).forEach(([key, value]) => {
            localStorage.setItem(key, value);
        });

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            return new Promise(resolve => {
                chrome.storage.local.set(data, () => resolve());
            });
        }
    }

    async function getTallyUrl() {
        const stored = await getStorage(['tallyApiUrl']);
        return normalizeUrl(stored.tallyApiUrl, DEFAULT_TALLY_URL);
    }

    async function getIntelligenceApiUrl() {
        const stored = await getStorage(['intelligenceApiUrl']);
        return normalizeUrl(stored.intelligenceApiUrl, DEFAULT_INTELLIGENCE_URL);
    }

    async function getNodeUrl() {
        const stored = await getStorage(['connectorUrl']);
        return normalizeUrl(stored.connectorUrl, DEFAULT_NODE_URL);
    }

    function renderChartSkeletons() {
        chartsContainerAdmin.innerHTML = chartDefinitions.map(def => `
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

        metricCardsContainer.innerHTML = metricDefaults.map(() => `
            <div class="metric-card">
                <div class="chart-skeleton" style="min-height: 118px;"></div>
            </div>
        `).join('');
    }

    function renderMetricCards(metrics) {
        const source = Array.isArray(metrics) && metrics.length ? metrics : metricDefaults;

        metricCardsContainer.innerHTML = source.map((metric, idx) => {
            const icon = escapeHtml(metric.icon || metricDefaults[idx]?.icon || '◉');
            const label = escapeHtml(metric.label || metricDefaults[idx]?.label || 'Metric');
            const value = escapeHtml(formatValue(metric));
            const subtitle = escapeHtml(metric.subtitle || metricDefaults[idx]?.subtitle || '');
            const foot = metric.delta ? `
                <div class="metric-foot ${metric.trend === 'down' ? 'trend-down' : 'trend-up'}">
                    ${escapeHtml(metric.delta)}
                </div>` : '';
            return `
                <div class="metric-card">
                    <div class="metric-icon">${icon}</div>
                    <div>
                        <div class="metric-value">${value}</div>
                        <div class="metric-label">${label}</div>
                        <div class="metric-subtitle">${subtitle}</div>
                        ${foot}
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderCharts(charts) {
        chartsContainerAdmin.innerHTML = chartDefinitions.map(def => {
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
        if (!chartsContainerAdmin) return;

        const intellUrl = await getIntelligenceApiUrl();
        const theme = document.documentElement.classList.contains('dark-mode') ? 'dark' : 'light';

        renderChartSkeletons();

        try {
            const url = new URL(`${intellUrl}/dashboard/visuals`);
            url.searchParams.set('theme', theme);
            url.searchParams.set('range', currentChartRange);

            const res = await fetch(url.toString(), { method: 'GET' });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
            }

            if (data.status !== 'success') {
                throw new Error(data?.error || 'Failed to load dashboard visuals');
            }

            renderMetricCards(data.metrics || metricDefaults);
            renderCharts(data.charts || {});
            if (chartsUpdatedAt) {
                const stamp = data.updated_at ? new Date(data.updated_at).toLocaleString() : new Date().toLocaleString();
                chartsUpdatedAt.textContent = `Last updated: ${stamp}`;
            }
        } catch (err) {
            console.error('[Admin] Failed to fetch visuals:', err);
            chartsContainerAdmin.innerHTML = `
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
            renderMetricCards(metricDefaults);
            if (chartsUpdatedAt) chartsUpdatedAt.textContent = 'Last updated: —';
        }
    }

    async function fetchAuditLogs() {
        try {
            if (!auditTableBody) return;
            auditTableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; color: var(--text-muted); padding: 26px;">
                        Loading audit logs...
                    </td>
                </tr>
            `;

            const baseUrl = await getNodeUrl();
            const res = await fetch(`${baseUrl}/api/admin/audit-logs`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    logout();
                    return;
                }
                throw new Error(data?.error || 'Failed to load logs');
            }

            latestAuditLogs = Array.isArray(data.logs) ? data.logs : [];

            if (!latestAuditLogs.length) {
                auditTableBody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align:center; color: var(--text-muted); padding: 26px;">
                            No recent audit logs found.
                        </td>
                    </tr>
                `;
                return;
            }

            auditTableBody.innerHTML = latestAuditLogs.map((log, index) => {
                const isBlocked = String(log.status || '').toLowerCase();
                const isWarning = isBlocked === 'blocked' || isBlocked === 'error';
                const statusClass = isWarning ? 'badge-warning' : 'badge-success';
                const when = log.time ? new Date(log.time).toLocaleString() : '—';

                return `
                    <tr data-index="${index}">
                        <td><span class="muted" style="font-size:13px;">${escapeHtml(when)}</span></td>
                        <td style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">${escapeHtml(log.user ?? '—')}</td>
                        <td>${escapeHtml(log.action ?? '—')}</td>
                        <td><span class="badge ${statusClass}">${escapeHtml(log.status ?? '—')}</span></td>
                        <td>
                            <button class="btn audit-action-btn" type="button" data-action="inspect">Inspect</button>
                            ${isWarning ? '<button class="btn btn-danger audit-action-btn" type="button" data-action="ban">Ban IP</button>' : ''}
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error('[Admin] Error fetching audit logs:', err);
            auditTableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; color: var(--danger); padding: 26px;">
                        Backend connection error.
                    </td>
                </tr>
            `;
        }
    }

    function exportAuditCsv() {
        if (!latestAuditLogs.length) {
            alert('No audit logs to export.');
            return;
        }

        const headers = ['timestamp', 'user_id', 'action', 'status'];
        const rows = latestAuditLogs.map(log => [
            log.time ? new Date(log.time).toISOString() : '',
            log.user ?? '',
            log.action ?? '',
            log.status ?? ''
        ]);

        const csv = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function applyRateLimitConfig() {
        const max = Number.parseInt(rateLimitMaxInput.value, 10);
        const windowMin = Number.parseInt(rateLimitWindowInput.value, 10);

        if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(windowMin) || windowMin <= 0) {
            setStatus(configStatus, 'Please enter valid positive numbers.', 'error');
            return;
        }

        applyConfigBtn.disabled = true;
        setStatus(configStatus, 'Saving...', '');

        try {
            const baseUrl = await getNodeUrl();
            const res = await fetch(`${baseUrl}/api/admin/config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ max, windowMin })
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data?.error || 'Failed to update configuration');
            }

            setStatus(configStatus, 'Rate limit configuration updated.', 'success');
            fetchAuditLogs();
        } catch (err) {
            console.error('[Admin] Config update error:', err);
            setStatus(configStatus, err.message || 'Backend connection error.', 'error');
        } finally {
            applyConfigBtn.disabled = false;
        }
    }

    async function performTallySearch() {
        const query = $('tallySearchQuery').value.trim();
        const collection = $('tallyCollection').value;
        const customer = $('tallyCustomer').value.trim();

        if (!query) {
            setStatus(explorerStatus, 'Please enter a search query.', 'error');
            return;
        }

        explorerResults.style.display = 'none';
        dataTableBody.innerHTML = '';
        setStatus(explorerStatus, 'Searching Tally...', '');

        const body = { query, top_k: 20 };
        if (collection) body.collection = collection;
        if (customer) body.customer = customer;

        try {
            const tallyUrl = await getTallyUrl();
            const res = await fetch(`${tallyUrl}/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || `Tally API returned ${res.status}`);
            }

            lastTallyData = data;
            setStatus(explorerStatus, '', '');
            explorerResults.style.display = 'block';

            summaryBar.innerHTML = `
                <div><strong>Query:</strong> ${escapeHtml(data.query || '')}</div>
                <div><strong>Results:</strong> ${escapeHtml(String(data.result_count || 0))}</div>
            `;

            const results = Array.isArray(data.results) ? data.results : [];
            if (!results.length) {
                dataTableBody.innerHTML = `
                    <tr>
                        <td colspan="3" style="text-align:center; color: var(--text-muted);">
                            No matching records found.
                        </td>
                    </tr>
                `;
                return;
            }

            dataTableBody.innerHTML = results.map(r => {
                const pct = Math.max(0, Math.min(100, Math.round((Number(r.relevance) || 0) * 100)));
                const badgeClass = pct >= 70 ? 'badge-paid' : pct >= 40 ? 'badge-processing' : 'badge-unpaid';

                return `
                    <tr>
                        <td><span class="badge badge-pending">${escapeHtml(r.collection || '')}</span></td>
                        <td title="${escapeHtml(r.summary || '')}">${escapeHtml(r.summary || '')}</td>
                        <td><span class="badge ${badgeClass}">${pct}%</span></td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            console.error('[Admin Explorer] Error:', err);
            setStatus(explorerStatus, `Error: ${err.message}. Is the Tally API running?`, 'error');
        }
    }

    async function generatePdfReport() {
        if (!lastTallyData || !Array.isArray(lastTallyData.results) || !lastTallyData.results.length) {
            alert('Please perform a successful search first to generate a report.');
            return;
        }

        const intellUrl = await getIntelligenceApiUrl();
        const points = lastTallyData.results.map(r => r.summary).filter(Boolean).slice(0, 15);

        const payload = {
            title: 'VoiceTally Admin Report',
            summary: `Search Query: "${lastTallyData.query || 'N/A'}"\nTotal Results Found: ${lastTallyData.result_count || 0}`,
            data: { points }
        };

        generatePdfBtn.disabled = true;
        const originalText = generatePdfBtn.textContent;
        generatePdfBtn.textContent = '⏳ Generating...';

        try {
            const response = await fetch(`${intellUrl}/reports/generate-pdf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data?.error || `Report generation failed (${response.status})`);
            }

            if (data.pdf_path) {
                let cleanPath = String(data.pdf_path).replace(/\\/g, '/');
                if (cleanPath.startsWith('reports/')) cleanPath = cleanPath.replace('reports/', 'downloads/');
                const pdfUrl = `${intellUrl}/${cleanPath}`;
                window.open(pdfUrl, '_blank', 'noopener,noreferrer');
            } else {
                throw new Error('PDF path not returned by API');
            }
        } catch (err) {
            console.error('[Admin] Error generating PDF:', err);
            alert(`Failed to generate PDF. Make sure the Intelligence API is running at ${intellUrl}`);
        } finally {
            generatePdfBtn.textContent = originalText;
            generatePdfBtn.disabled = false;
        }
    }

    async function hydrateConnectorInputs() {
        const stored = await getStorage(['connectorUrl', 'tallyApiUrl', 'intelligenceApiUrl']);
        if (connectorUrlInput) connectorUrlInput.value = stored.connectorUrl || DEFAULT_NODE_URL;
        if (tallyApiUrlInput) tallyApiUrlInput.value = stored.tallyApiUrl || DEFAULT_TALLY_URL;
        if (intelligenceApiUrlInput) intelligenceApiUrlInput.value = stored.intelligenceApiUrl || DEFAULT_INTELLIGENCE_URL;
    }

    async function saveConnectorSettings() {
        const connectorUrl = normalizeUrl(connectorUrlInput.value, DEFAULT_NODE_URL);
        const tallyApiUrl = normalizeUrl(tallyApiUrlInput.value, DEFAULT_TALLY_URL);
        const intelligenceApiUrl = normalizeUrl(intelligenceApiUrlInput.value, DEFAULT_INTELLIGENCE_URL);

        await setStorage({ connectorUrl, tallyApiUrl, intelligenceApiUrl });

        setStatus(connectorStatus, 'Connection URLs saved successfully.', 'success');
        setTimeout(() => setStatus(connectorStatus, '', ''), 3000);
    }

    function logout() {
        sessionStorage.clear();
        window.location.href = 'login.html';
    }

    window.logout = logout;

    async function connectWebSocket() {
        if (ws) {
            try { ws.close(); } catch (_) {}
            ws = null;
        }

        const tallyUrl = await getTallyUrl();
        const wsUrl = `${tallyUrl.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:')}/ws`;

        try {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                reconnectDelay = 3000;
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'data_updated') {
                        fetchDashboardVisuals();
                        const q = $('tallySearchQuery')?.value?.trim();
                        if (q) performTallySearch();
                    }
                } catch (err) {
                    console.error('[Admin Explorer] Error parsing WS message:', err);
                }
            };

            ws.onclose = () => {
                if (reconnectTimer) clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(connectWebSocket, reconnectDelay);
                reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
            };

            ws.onerror = () => {
                try { ws.close(); } catch (_) {}
            };
        } catch (err) {
            console.error('[Admin] WebSocket connect error:', err);
        }
    }

    function initEvents() {
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetView = item.getAttribute('data-view');
                setView(targetView);
            });
        });

        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', async () => {
                applyTheme(currentTheme === 'light' ? 'dark' : 'light');
                await fetchDashboardVisuals();
            });
        }

        if (applyConfigBtn) applyConfigBtn.addEventListener('click', applyRateLimitConfig);
        if (tallySearchBtn) tallySearchBtn.addEventListener('click', performTallySearch);
        if (generatePdfBtn) generatePdfBtn.addEventListener('click', generatePdfReport);
        if (saveConnectorBtn) saveConnectorBtn.addEventListener('click', saveConnectorSettings);
        if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportAuditCsv);
        if (refreshDashboardBtn) refreshDashboardBtn.addEventListener('click', fetchDashboardVisuals);

        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                const sidebar = document.querySelector('.sidebar');
                if (sidebar) sidebar.classList.toggle('collapsed');
                document.body.classList.toggle('sidebar-collapsed');
            });
        }

        chartRangeButtons.forEach(btn => {
            btn.addEventListener('click', async () => {
                currentChartRange = btn.dataset.chartRange || '7d';
                updateRangeButtons();
                await fetchDashboardVisuals();
            });
        });

        auditTableBody?.addEventListener('click', (event) => {
            const btn = event.target.closest('button[data-action]');
            if (!btn) return;

            const row = btn.closest('tr');
            const index = Number(row?.dataset?.index);
            const log = latestAuditLogs[index];

            if (!log) return;

            if (btn.dataset.action === 'inspect') {
                alert(JSON.stringify(log, null, 2));
            } else if (btn.dataset.action === 'ban') {
                const confirmBan = confirm('Ban this IP action is not wired to a backend endpoint yet. Continue with a local notice?');
                if (confirmBan) {
                    alert('Ban IP endpoint is not configured on this page.');
                }
            }
        });

        $('tallySearchQuery')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') performTallySearch();
        });
    }

    async function init() {
        applyTheme(currentTheme);
        updateRangeButtons();
        initEvents();
        await hydrateConnectorInputs();
        renderChartSkeletons();
        await fetchAuditLogs();
        await fetchDashboardVisuals();
        connectWebSocket();
    }

    init();
})();