const DEFAULT_CONNECTOR_URL = 'http://127.0.0.1:3000';
const DEFAULT_TALLY_API_URL = 'http://localhost:8000';
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

async function getTallyApiUrl() {
  return new Promise(resolve => {
    chrome.storage.local.get(['tallyApiUrl'], (result) => {
      resolve(result.tallyApiUrl || DEFAULT_TALLY_API_URL);
    });
  });
}

async function getIntelligenceApiUrl() {
  return new Promise(resolve => {
    chrome.storage.local.get(['intelligenceApiUrl'], (result) => {
      resolve(result.intelligenceApiUrl || 'http://127.0.0.1:8001');
    });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log("VoiceTally Background Service Online");
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'welcome.html' });
  }
});

// Initialize Side Panel behavior
chrome.storage.local.get(['sidePanelEnabled'], (res) => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: !!res.sidePanelEnabled })
      .catch((err) => console.error("Error setting side panel behavior:", err));
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.info(`[Background] Received message from sender:`, sender, message);

  // Handle settings update for side panel
  if (message.action === 'update_side_panel') {
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: !!message.enabled })
        .catch((err) => console.error("Error updating side panel:", err));
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: "Side Panel API not available" });
    }
    return false; // synchronous response
  }

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
 * Detects if text contains Devanagari (Hindi) characters
 */
function containsHindi(text) {
  return /[\u0900-\u097F]/.test(text);
}

/**
 * Translates Hindi text to English using MyMemory API (free, no key)
 * Falls back to original text on failure
 */
async function translateToEnglish(text) {
  try {
    const encoded = encodeURIComponent(text);
    const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=hi|en`;
    console.info(`[Translate] Calling MyMemory API for: "${text}"`);

    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      console.warn(`[Translate] API returned HTTP ${response.status}. Falling back.`);
      return text;
    }

    const data = await response.json();
    const translated = data?.responseData?.translatedText;

    if (translated && translated.trim().length > 0) {
      console.info(`[Translate] Result: "${text}" → "${translated}"`);
      return translated;
    }

    console.warn(`[Translate] Empty translation. Falling back.`);
    return text;
  } catch (err) {
    console.error(`[Translate] API error:`, err);
    return text; // Graceful fallback
  }
}

/**
 * Orchestrates ALL data queries — everything goes through Tally/ChromaDB
 */
async function handleConnectorRequest(query) {
  let processedQuery = query;

  // Auto-translate Hindi to English before intent parsing
  if (containsHindi(query)) {
    console.info(`[Background] Hindi detected in query. Translating...`);
    processedQuery = await translateToEnglish(query);
  }

  const normalizedQuery = processedQuery.toLowerCase().trim();

  // Health/Status check → Tally health endpoint
  const healthKeywords = ['health', 'status', 'स्थिति', 'हेल्थ', 'स्टेटस'];
  const isHealthQuery = healthKeywords.some(kw => normalizedQuery.includes(kw));

  if (isHealthQuery) {
    const tallyUrl = await getTallyApiUrl();
    console.info(`[Background] Health check → ${tallyUrl}/`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${tallyUrl}/`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`Tally API Error (${response.status})`);
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // ALL other queries → Tally vector search
  console.info(`[Background] Routing query to Tally vector search.`);
  return await handleTallySearch(processedQuery, normalizedQuery);
}


// ============================================================
// TALLY VECTOR SEARCH HANDLER
// ============================================================

async function handleTallySearch(originalQuery, normalizedQuery) {
  const tallyUrl = await getTallyApiUrl();
  const intellUrl = await getIntelligenceApiUrl();

  let searchBody = {
    query: originalQuery,
    top_k: 10
  };

  let useFallback = true;
  let nlpData = null;

  // 1. Try Intelligence API (NLP) first
  try {
    const nlpController = new AbortController();
    const nlpTimeout = setTimeout(() => nlpController.abort(), 3000); // Fast timeout for parsing
    
    console.info(`[Background] Attempting NLP parse at ${intellUrl}/nlp/parse-query`);
    const nlpRes = await fetch(`${intellUrl}/nlp/parse-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: originalQuery }),
      signal: nlpController.signal
    });
    
    clearTimeout(nlpTimeout);
    
    if (nlpRes.ok) {
      nlpData = await nlpRes.json();
      if (nlpData.intent) {
        useFallback = false;
        console.info(`[Background] NLP parse successful. Intent: ${nlpData.intent}`);
        
        // Map common intents to Tally collections
        if (nlpData.intent === 'sales_inquiry' || nlpData.intent === 'invoice') {
           searchBody.collection = 'sales';
           searchBody.voucher_type = 'Sales';
        } else if (nlpData.intent === 'ledger_balance' || nlpData.intent === 'debtor' || nlpData.intent === 'creditor') {
           searchBody.collection = 'ledgers';
        } else if (nlpData.intent === 'stock_inquiry') {
           searchBody.collection = 'stock_items';
        }

        if (nlpData.entities) {
          if (nlpData.entities.customer) searchBody.customer = nlpData.entities.customer;
          if (nlpData.entities.party_name) searchBody.customer = nlpData.entities.party_name;
          if (nlpData.entities.date_range && nlpData.entities.date_range.start) searchBody.from_date = nlpData.entities.date_range.start;
          if (nlpData.entities.date_range && nlpData.entities.date_range.end) searchBody.to_date = nlpData.entities.date_range.end;
        }
      } else {
        console.warn(`[Background] NLP returned no intent. Falling back.`);
      }
    } else {
      console.warn(`[Background] NLP returned ${nlpRes.status}. Falling back.`);
    }
  } catch (err) {
    console.warn(`[Background] NLP parse failed, falling back to regex: ${err.message}`);
  }

  // 2. Fallback to Regex / Hardcoded Keywords
  if (useFallback) {
    console.info(`[Background] Using Regex fallback for query parsing.`);
    // Detect specific collection from keywords
    if (normalizedQuery.includes('ledger')) searchBody.collection = 'ledgers';
    else if (normalizedQuery.includes('stock')) searchBody.collection = 'stock_items';
    else if (normalizedQuery.includes('group')) searchBody.collection = 'groups';
    else if (normalizedQuery.includes('day book') || normalizedQuery.includes('daybook')) searchBody.collection = 'day_book';
    else if (normalizedQuery.includes('invoice') || normalizedQuery.includes('voucher') || normalizedQuery.includes('journal') || normalizedQuery.includes('receipt') || normalizedQuery.includes('payment')) searchBody.collection = 'sales';

    // Detect voucher type
    if (normalizedQuery.includes('sales') || normalizedQuery.includes('invoice')) searchBody.voucher_type = 'Sales';
    else if (normalizedQuery.includes('purchase')) searchBody.voucher_type = 'Purchase';
    else if (normalizedQuery.includes('receipt')) searchBody.voucher_type = 'Receipt';
    else if (normalizedQuery.includes('payment')) searchBody.voucher_type = 'Payment';
    else if (normalizedQuery.includes('journal')) searchBody.voucher_type = 'Journal';

    // Customer extraction
    const customerMatch = normalizedQuery.match(/(?:for|of|के लिए|का|की)\s+(?:customer\s+|client\s+|party\s+|ग्राहक\s+)?([a-z0-9\s\u0900-\u097F]+)/i);
    if (customerMatch && customerMatch[1]) {
      let custName = customerMatch[1].trim();
      const stopWords = [' last', ' today', ' from', ' above', ' below', ' पिछले', ' से'];
      stopWords.forEach(sw => {
        if (custName.includes(sw)) custName = custName.split(sw)[0];
      });
      if (custName.trim()) searchBody.customer = custName.trim();
    }

    // Amount extraction
    const aboveMatch = normalizedQuery.match(/(?:above|over|greater than|more than|ऊपर|से ज़्यादा)\s+(\d+)/i);
    if (aboveMatch) searchBody.min_amount = parseFloat(aboveMatch[1]);

    const belowMatch = normalizedQuery.match(/(?:below|under|less than|कम|से कम)\s+(\d+)/i);
    if (belowMatch) searchBody.max_amount = parseFloat(belowMatch[1]);

    // Date period → from_date
    const now = new Date();
    if (normalizedQuery.includes('last week') || normalizedQuery.includes('पिछले हफ्ते')) {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      searchBody.from_date = d.toISOString().split('T')[0];
    } else if (normalizedQuery.includes('last month') || normalizedQuery.includes('पिछले महीने')) {
      const d = new Date(now); d.setMonth(d.getMonth() - 1);
      searchBody.from_date = d.toISOString().split('T')[0];
    } else if (normalizedQuery.includes('last year') || normalizedQuery.includes('पिछले साल')) {
      const d = new Date(now); d.setFullYear(d.getFullYear() - 1);
      searchBody.from_date = d.toISOString().split('T')[0];
    }
  }

  console.info(`[Tally Search] POST ${tallyUrl}/search`, searchBody);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${tallyUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 400) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Invalid Tally search parameters.');
      }
      throw new Error(`Tally API Error (${response.status})`);
    }

    const data = await response.json();
    console.info(`[Tally Search] Got ${data.result_count} results.`);

    // Attach inferred NLP data to help Insights Engine
    if (nlpData) {
      data._nlp_intent = nlpData.intent || 'UNKNOWN';
      data._nlp_entities = nlpData.entities || {};
    } else {
      data._nlp_intent = 'UNKNOWN';
      data._nlp_entities = {};
    }

    // Mark response as Tally type for popup renderer
    data._source = 'tally';
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[Tally Search] Error:`, error);
    throw error;
  }
}