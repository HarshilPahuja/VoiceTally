const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const xml2js = require('xml2js');
const { parse, isValid, parseISO } = require('date-fns');

// Store data in memory
let cachedSales = [];
let lastLoadTime = 0;

const DATA_FILE_PATH = process.env.DATA_FILE_PATH || path.join(__dirname, 'data', 'sales.csv');

/**
 * Normalizes a record into a standard format
 * @param {Object} record - Raw record from CSV/XML
 * @returns {Object} Normalized record
 */

function normalizeRecord(record) {
    // CSV columns might be: Date, Customer, Amount, Status
    // XML might be nested. handling simple case first.

    // Auto-detect keys (simple heuristic)
    const amountKey = Object.keys(record).find(k => k.toLowerCase().includes('amount')) || 'amount';
    const dateKey = Object.keys(record).find(k => k.toLowerCase().includes('date')) || 'date';
    const customerKey = Object.keys(record).find(k => k.toLowerCase().includes('customer') || k.toLowerCase().includes('party')) || 'customer';
    const statusKey = Object.keys(record).find(k => k.toLowerCase().includes('status') || k.toLowerCase().includes('state')) || 'status';

    const amount = parseFloat(record[amountKey]);
    let date;
    const dateStr = record[dateKey];

    // Robust Date Parsing
    // 1. Try generic ISO/JS parse first
    date = new Date(dateStr);

    // 2. If invalid, try explicit formats common in Tally (DD-MM-YYYY or DD/MM/YYYY)
    if (isNaN(date.getTime())) {
        const formats = ['dd-MM-yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'];
        for (const fmt of formats) {
            const parsed = parse(dateStr, fmt, new Date());
            if (isValid(parsed)) {
                date = parsed;
                break;
            }
        }
    }

    // Validation
    if (isNaN(amount)) return null;
    if (!date || isNaN(date.getTime())) return null;

    return {
        date: date.toISOString(),
        customer: record[customerKey] || 'Unknown',
        amount: amount,
        status: (record[statusKey] || 'Paid').toLowerCase() // Default
    };
}

/**
 * Loads and parses the data file
 */
async function loadData() {
    // Simple caching: Reload if file changed? For MVP, reload on request or interval.
    // Let's reload every request for "live" feel, or use FS watch.
    // For safety, just load.

    if (!fs.existsSync(DATA_FILE_PATH)) {
        console.warn(`[Data] File not found: ${DATA_FILE_PATH}`);
        return [];
    }

    const ext = path.extname(DATA_FILE_PATH).toLowerCase();
    const results = [];

    if (ext === '.csv') {
        return new Promise((resolve, reject) => {
            fs.createReadStream(DATA_FILE_PATH)
                .pipe(csv())
                .on('data', (data) => {
                    const normalized = normalizeRecord(data);
                    if (normalized) results.push(normalized);
                })
                .on('end', () => {
                    cachedSales = results;
                    resolve(results);
                })
                .on('error', reject);
        });
    } else if (ext === '.xml') {
        const parser = new xml2js.Parser({ explicitArray: false });
        const xml = fs.readFileSync(DATA_FILE_PATH, 'utf-8');
        const result = await parser.parseStringPromise(xml);
        // Assuming Tally XML export structure (Voucher/Ledger) - Simplified for MVP
        // Need to traverse `result` to find rows.
        // Mocking structure traversal...
        // For MVP, if XML is unsupported structure, return empty.
        console.log("XML parsing implemented but structure dependent.");
        return [];
    }

    return results;
}

/**
 * Filters sales data
 * @param {Object} filters - { period: 'week'|'month', from, to }
 */
async function getSales(filters = {}) {
    await loadData(); // Reload data

    let filtered = cachedSales;
    const now = new Date();

    // Apply Date Range Filter
    if (filters.from || filters.to) {
        const fromDate = filters.from ? new Date(filters.from) : new Date(0); // Epoch if no from
        const toDate = filters.to ? new Date(filters.to) : new Date(); // Now if no to
        // Adjust to include the end date fully (end of day) if provided
        if (filters.to) toDate.setHours(23, 59, 59, 999);

        filtered = filtered.filter(r => {
            const rd = new Date(r.date);
            return rd >= fromDate && rd <= toDate;
        });
    }
    // Fallback to "period" if no explicit range
    else if (filters.period === 'week') {
        const lastWeek = new Date();
        lastWeek.setDate(now.getDate() - 7);
        filtered = filtered.filter(r => new Date(r.date) >= lastWeek);
    } else if (filters.period === 'month') {
        const lastMonth = new Date();
        lastMonth.setMonth(now.getMonth() - 1);
        filtered = filtered.filter(r => new Date(r.date) >= lastMonth);
    } else if (filters.period === 'year') {
        const lastYear = new Date();
        lastYear.setFullYear(now.getFullYear() - 1);
        filtered = filtered.filter(r => new Date(r.date) >= lastYear);
    }

    // Customer Filter (Partial Case-Insensitive Match)
    if (filters.customer) {
        const qCustomer = filters.customer.toLowerCase().trim();
        filtered = filtered.filter(r => r.customer.toLowerCase().includes(qCustomer));
    }

    // Status Filter (Exact Match)
    if (filters.status) {
        const qStatus = filters.status.toLowerCase().trim();
        filtered = filtered.filter(r => r.status === qStatus);
    }

    // Compute aggregations
    const total = filtered.reduce((sum, r) => sum + r.amount, 0);
    const count = filtered.length;
    const average = count > 0 ? (total / count) : 0;

    // Related Data: Status Breakdown (useful for "overview")
    const statusBreakdown = filtered.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
    }, {});

    return {
        filter_context: filters,
        total: total,
        transaction_count: count,
        average_value: parseFloat(average.toFixed(2)),
        currency: "INR",
        breakdown: statusBreakdown,
        detailed_records: filtered.slice(0, 10) // Limit rows for security
    };
}

module.exports = { getSales, loadData };
