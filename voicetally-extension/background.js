const DEFAULT_CONNECTOR_URL = 'http://127.0.0.1:3000';
const REQUEST_TIMEOUT_MS = 5000; // 5 seconds max wait time

// Basic In-Memory Rate Limiting (Token Bucket approach for UX)
const MAX_REQUESTS_PER_MINUTE = 30;
let requestTokens = MAX_REQUESTS_PER_MINUTE;
let lastRefillTime = Date.now();

function checkLocalRateLimit() {
  const now = Date.now();
  // Refill tokens
  const timePassed = now - lastRefillTime;
  if (timePassed > 60000) {
    requestTokens = MAX_REQUESTS_PER_MINUTE;
    lastRefillTime = now;
  }

  if (requestTokens > 0) {
    requestTokens--;
    return true;
  }
  return false;
}

// Very basic JSON schema validation
function validatePayloadSchema(message) {
  if (
    message &&
    message.type === 'QUERY_TALLY' &&
    typeof message.payload === 'string' &&
    message.payload.trim().length > 0 &&
    message.payload.length <= 200
  ) {
    return true;
  }
  return false;
}

async function getConnectorUrl() {
  return new Promise(resolve => {
    chrome.storage.local.get(['connectorUrl'], (result) => {
      resolve(result.connectorUrl || DEFAULT_CONNECTOR_URL);
    });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log("VoiceTally Background Service Online");
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.info(`[Background] Received message: ${message.type} from sender:`, sender);

  // 1. Strict Schema Validation
  if (!validatePayloadSchema(message)) {
    console.warn("[Background Security] Invalid message schema rejected:", message);
    sendResponse({ success: false, error: "Invalid request format or payload too large." });
    return false;
  }

  // 2. Local Rate Limiter Check
  if (!checkLocalRateLimit()) {
    console.warn("[Background RateLimit] Local rate limit exceeded.");
    sendResponse({ success: false, error: "Too many quick queries. Please wait a moment." });
    return false;
  }

  console.info(`[Background] Schema and Rate Limit passed. Processing query: "${message.payload}"`);

  // 3. Process Request Contextually
  handleConnectorRequest(message.payload)
    .then(data => {
      console.info(`[Background] Connector request succeeded. Returning payload to sender.`);
      console.debug(`[Background] Parsed data:`, data);
      sendResponse({ success: true, data: data });
    })
    .catch(err => {
      let userMsg = "System Error";
      if (err.message.includes("Failed to fetch")) userMsg = "Local Connector is offline.";
      else if (err.name === 'AbortError') userMsg = "Request timed out.";
      else userMsg = err.message;

      console.error("[Background Error] Connector Fetch Exception:", err);
      sendResponse({ success: false, error: userMsg });
    });

  return true; // Keep channel open for async response
});

/**
 * Orchestrates the secure fetch to the local service or dashboard API
 */
async function handleConnectorRequest(query) {
  const normalizedQuery = query.toLowerCase().trim();
  let endpoint = '';

  // --- ROBUST INTENT PARSER (English + Hindi) ---

  // Sales intent keywords
  const salesKeywords = ['sales', 'sells', 'revenue', 'बिक्री', 'बिक्रि', 'सेल्स', 'राजस्व', 'कमाई', 'आमदनी'];
  const isSalesQuery = salesKeywords.some(kw => normalizedQuery.includes(kw));

  // Health/Status intent keywords
  const healthKeywords = ['health', 'status', 'स्थिति', 'हेल्थ', 'स्टेटस'];
  const isHealthQuery = healthKeywords.some(kw => normalizedQuery.includes(kw));

  if (isSalesQuery) {
    endpoint = '/sales?';
    const params = new URLSearchParams();

    // Date - English + Hindi
    if (normalizedQuery.includes('last week') || normalizedQuery.includes('पिछले हफ्ते') || normalizedQuery.includes('पिछला हफ्ता') || normalizedQuery.includes('गत सप्ताह')) {
      params.append('period', 'week');
    } else if (normalizedQuery.includes('last month') || normalizedQuery.includes('पिछले महीने') || normalizedQuery.includes('पिछला महीना') || normalizedQuery.includes('गत माह')) {
      params.append('period', 'month');
    } else if (normalizedQuery.includes('last year') || normalizedQuery.includes('पिछले साल') || normalizedQuery.includes('पिछला साल') || normalizedQuery.includes('गत वर्ष')) {
      params.append('period', 'year');
    }

    // Status - English + Hindi
    if (normalizedQuery.includes('unpaid') || normalizedQuery.includes('अवैतनिक') || normalizedQuery.includes('बकाया') || normalizedQuery.includes('अनपेड')) {
      params.append('status', 'unpaid');
    } else if (normalizedQuery.includes('processing') || normalizedQuery.includes('प्रोसेसिंग') || normalizedQuery.includes('प्रक्रिया')) {
      params.append('status', 'processing');
    } else if (normalizedQuery.includes('pending') || normalizedQuery.includes('लंबित') || normalizedQuery.includes('पेंडिंग')) {
      params.append('status', 'pending');
    } else if (normalizedQuery.includes('paid') || normalizedQuery.includes('भुगतान') || normalizedQuery.includes('पेड') || normalizedQuery.includes('चुकाया')) {
      params.append('status', 'paid');
    }

    // Customer Target - English + Hindi
    const customerMatch = normalizedQuery.match(/(?:for|के लिए|का|की)\s+(?:customer\s+|client\s+|ग्राहक\s+|कस्टमर\s+)?([a-z0-9\s\u0900-\u097F]+)/i);
    if (customerMatch && customerMatch[1]) {
      let custName = customerMatch[1].trim();
      const stopWords = [' last', ' today', ' yesterday', ' from', ' पिछले', ' आज', ' कल', ' से'];
      stopWords.forEach(sw => {
        if (custName.includes(sw)) custName = custName.split(sw)[0];
      });
      if (custName.trim()) params.append('customer', custName.trim());
    }

    endpoint += params.toString();
  } else if (isHealthQuery) {
    endpoint = '/health';
  } else {
    throw new Error("I can only answer about Sales and System Health for now. Try 'sales last month' / 'बिक्री पिछले महीने' or 'pending sales' / 'लंबित बिक्री'.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const baseUrl = await getConnectorUrl();
  console.info(`[Background Connector] Target URL: ${baseUrl}${endpoint}`);

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    console.debug(`[Background Connector] HTTP Status: ${response.status}`);

    if (!response.ok) {
      if (response.status === 429) throw new Error("Server limit reached. Please wait.");
      if (response.status === 400) throw new Error("Invalid request parameters.");
      if (response.status === 401 || response.status === 403) throw new Error("Unauthorized. Please check connector or login.");
      throw new Error(`Server Error (${response.status})`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[Background Connector] Fetch execution failed:`, error);
    throw error;
  }
}