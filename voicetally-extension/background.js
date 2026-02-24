const DEFAULT_CONNECTOR_URL = 'http://127.0.0.1:3000';
const REQUEST_TIMEOUT_MS = 3000; // 3 seconds max wait time

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

chrome.commands.onCommand.addListener((command) => {
  if (command === "_execute_action") {
    console.log("Action triggered by hotkey");
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // 1. Validate Message Structure
  if (message.type !== 'QUERY_TALLY' || !message.payload || typeof message.payload !== 'string') {
    console.warn("Invalid message received:", message);
    sendResponse({ success: false, error: "Invalid request format." });
    return false;
  }

  // 2. Process Request asynchronously
  handleConnectorRequest(message.payload)
    .then(data => sendResponse({ success: true, data: data }))
    .catch(err => {
      // Map technical errors to user-friendly codes
      let userMsg = "System Error";
      if (err.message.includes("Failed to fetch")) userMsg = "Local Connector is offline.";
      else if (err.name === 'AbortError') userMsg = "Request timed out.";
      else userMsg = err.message;

      sendResponse({ success: false, error: userMsg });
    });

  return true; // Keep channel open for async response
});

/**
 * Orchestrates the fetch to the local service with timeout and validation.
 */
async function handleConnectorRequest(query) {
  const normalizedQuery = query.toLowerCase().trim();
  let endpoint = '';

  // --- ROBUST INTENT PARSER ---
  // Intent: SALES
  if (normalizedQuery.includes('sales') || normalizedQuery.includes('sells') || normalizedQuery.includes('revenue')) {
    endpoint = '/sales?';
    const params = new URLSearchParams();

    // 1. Date Extraction (Simple Heuristics)
    if (normalizedQuery.includes('last week')) params.append('period', 'week');
    else if (normalizedQuery.includes('last month')) params.append('period', 'month');
    else if (normalizedQuery.includes('last year')) params.append('period', 'year');

    // 2. Status Extraction
    if (normalizedQuery.includes('pending') || normalizedQuery.includes('unpaid')) params.append('status', 'pending');
    else if (normalizedQuery.includes('paid')) params.append('status', 'paid');

    // 3. Customer Extraction (Regex: "for customer [name]" or "for [name]")
    // Matches "for client X", "for customer X", "for X"
    const customerMatch = normalizedQuery.match(/for\s+(?:customer\s+|client\s+)?([a-z0-9\s]+)/i);
    if (customerMatch && customerMatch[1]) {
      // Stop capturing at common stopwords if query continues
      let custName = customerMatch[1].trim();
      const stopWords = [' last', ' today', ' yesterday', ' from'];
      stopWords.forEach(sw => {
        if (custName.includes(sw)) custName = custName.split(sw)[0];
      });
      params.append('customer', custName);
    }

    endpoint += params.toString();
  }
  // Intent: HEALTH
  else if (normalizedQuery.includes('health') || normalizedQuery.includes('status')) {
    endpoint = '/health';
  } else {
    throw new Error("I can only answer about Sales and System Health for now. Try 'sales for last month' or 'pending sales'.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const baseUrl = await getConnectorUrl();

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Handle HTTP Errors explicitly
    if (!response.ok) {
      if (response.status === 429) throw new Error("Too many requests. Please wait.");
      if (response.status === 400) throw new Error("Invalid request parameters.");
      throw new Error(`Server Error (${response.status})`);
    }

    // Return strictly JSON
    return await response.json();

  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}