const http = require('http');

function makeRequest(path, label) {
    const options = {
        hostname: '127.0.0.1',
        port: 3000,
        path: path,
        method: 'GET',
    };

    const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            console.log(`\n--- ${label} (${res.statusCode}) ---`);
            console.log(body);
        });
    });

    req.on('error', (e) => console.error(`[${label}] Error: ${e.message}`));
    req.end();
}

// 1. Basic Sales (Last Week)
makeRequest('/sales?period=week', 'Basic Sales (Week)');

// 2. Filter by Customer (Pending)
makeRequest('/sales?customer=Trader', 'Customer Search (Trader)');

// 3. Filter by Status (Pending)
makeRequest('/sales?status=pending', 'Status Search (Pending)');

// 4. Combined Filter
makeRequest('/sales?status=paid&from=2026-01-01', 'Combined (Paid Since Jan 1)');
