const token = sessionStorage.getItem('vt_token');
const role = sessionStorage.getItem('vt_role');

console.log(`[Admin Dashboard] Initializing. Role: ${role}`);

if (!token || role !== 'admin') {
    console.warn(`[Admin Dashboard] Unauthorized access attempt or missing token. Redirecting.`);
    window.location.href = 'login.html';
}

const tbody = document.getElementById('auditTableBody');

async function fetchAuditLogs() {
    console.log(`[Admin Dashboard] Fetching audit logs...`);
    try {
        const res = await fetch('http://127.0.0.1:3000/api/admin/audit-logs', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (!res.ok) {
            console.warn(`[Admin Dashboard] Fetch audit failed: ${data.error}`);
            if (res.status === 401 || res.status === 403) logout();
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--danger);">${data.error || 'Failed to load logs'}</td></tr>`;
            return;
        }

        console.log(`[Admin Dashboard] Audit logs fetched successfully.`, data);
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
        console.error(`[Admin Dashboard] Error fetching audit logs:`, err);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--danger);">Backend connection error.</td></tr>`;
    }
}

document.getElementById('applyConfigBtn').addEventListener('click', async () => {
    const max = document.getElementById('rateLimitMax').value;
    const windowMin = document.getElementById('rateLimitWindow').value;
    const statusDiv = document.getElementById('configStatus');
    const btn = document.getElementById('applyConfigBtn');

    console.log(`[Admin Dashboard] Updating rate limit config: Max=${max}, Window=${windowMin}`);

    btn.disabled = true;
    statusDiv.textContent = 'Saving...';
    statusDiv.style.color = 'var(--text-muted)';

    try {
        const res = await fetch('http://127.0.0.1:3000/api/admin/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ max, windowMin })
        });
        const data = await res.json();

        if (res.ok) {
            console.log(`[Admin Dashboard] Config updated successfully.`);
            statusDiv.textContent = 'Rate limit configuration updated securely.';
            statusDiv.style.color = 'var(--primary)';
            fetchAuditLogs(); // Refresh logs to see the config update
        } else {
            console.warn(`[Admin Dashboard] Config update failed: ${data.error}`);
            statusDiv.textContent = data.error || 'Failed to update configuration.';
            statusDiv.style.color = 'var(--danger)';
        }
    } catch (err) {
        console.error(`[Admin Dashboard] Error updating config:`, err);
        statusDiv.textContent = 'Backend connection error.';
        statusDiv.style.color = 'var(--danger)';
    } finally {
        btn.disabled = false;
    }
});

// Initialize view
fetchAuditLogs();

function logout() {
    console.log(`[Admin Dashboard] Logging out...`);
    sessionStorage.clear();
    window.location.href = 'login.html';
}
window.logout = logout; // Expose to global scope
