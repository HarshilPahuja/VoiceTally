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
    console.info(`[Dashboard Explorer] Fetching: http://127.0.0.1:3000${endpoint}`);

    try {
        const response = await fetch(`http://127.0.0.1:3000${endpoint}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error(`Server returned ${response.status}`);

        const data = await response.json();
        console.log(`[Dashboard Explorer] Data received:`, data);

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
        console.error(`[Dashboard Explorer] Error:`, err);
    }
});

