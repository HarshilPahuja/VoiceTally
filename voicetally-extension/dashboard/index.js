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
window.logout = logout; // Expose to global scope for onclick attributes
