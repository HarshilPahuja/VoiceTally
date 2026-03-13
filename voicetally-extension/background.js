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

  // --- ROBUST INTENT PARSER ---
  if (normalizedQuery.includes('sales') || normalizedQuery.includes('sells') || normalizedQuery.includes('revenue')) {
    endpoint = '/sales?';
    const params = new URLSearchParams();

    // Date
    if (normalizedQuery.includes('last week')) params.append('period', 'week');
    else if (normalizedQuery.includes('last month')) params.append('period', 'month');
    else if (normalizedQuery.includes('last year')) params.append('period', 'year');

    // Status
    if (normalizedQuery.includes('unpaid')) params.append('status', 'unpaid');
    else if (normalizedQuery.includes('processing')) params.append('status', 'processing');
    else if (normalizedQuery.includes('pending')) params.append('status', 'pending');
    else if (normalizedQuery.includes('paid')) params.append('status', 'paid');

    // Customer Target
    const customerMatch = normalizedQuery.match(/for\s+(?:customer\s+|client\s+)?([a-z0-9\s]+)/i);
    if (customerMatch && customerMatch[1]) {
      let custName = customerMatch[1].trim();
      const stopWords = [' last', ' today', ' yesterday', ' from'];
      stopWords.forEach(sw => {
        if (custName.includes(sw)) custName = custName.split(sw)[0];
      });
      params.append('customer', custName);
    }

    endpoint += params.toString();
  } else if (normalizedQuery.includes('health') || normalizedQuery.includes('status')) {
    endpoint = '/health';
  } else {
    throw new Error("I can only answer about Sales and System Health for now. Try 'sales last month' or 'pending sales'.");
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