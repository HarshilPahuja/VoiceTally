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

async function fetchHistory() {
    console.log(`[Dashboard] Fetching user history...`);
    try {
        const res = await fetch('http://127.0.0.1:3000/api/user/history', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (!res.ok) {
            console.warn(`[Dashboard] Failed to fetch history: ${data.error}`);
            if (res.status === 401 || res.status === 403) logout(); // Token expired or invalid
            document.getElementById('historyList').innerHTML = `<span style="color:var(--error)">${data.error || 'Failed to load history.'}</span>`;
            return;
        }

        console.log(`[Dashboard] History fetched successfully.`, data);

        if (data.history && data.history.length > 0) {
            let html = '<table style="width:100%; text-align:left; border-collapse:collapse; font-size:14px;">';
            html += '<tr style="border-bottom: 1px solid var(--border);"><th style="padding:8px">Time</th><th style="padding:8px">Action</th><th style="padding:8px">Status</th></tr>';
            data.history.forEach(log => {
                html += `<tr>
                    <td style="padding:8px">${new Date(log.time).toLocaleString()}</td>
                    <td style="padding:8px">${log.action}</td>
                    <td style="padding:8px">${log.status}</td>
                </tr>`;
            });
            html += '</table>';
            document.getElementById('historyList').innerHTML = html;
        } else {
            console.log(`[Dashboard] History is empty.`);
            document.getElementById('historyList').textContent = 'No recent history found.';
        }
    } catch (err) {
        console.error(`[Dashboard] Error fetching history:`, err);
        document.getElementById('historyList').innerHTML = `<span style="color:var(--error)">Backend connection error.</span>`;
    }
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
                // Only refresh if there's already a query in the box
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
