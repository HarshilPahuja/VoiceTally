document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('queryInput');
  const submitBtn = document.getElementById('submitBtn');
  const micBtn = document.getElementById('micBtn');
  const output = document.getElementById('output');
  const statusBar = document.getElementById('statusBar');
  const settingsBtn = document.getElementById('settingsBtn');
  const dashboardBtn = document.getElementById('dashboardBtn');

  // --- STANDARD EVENT LISTENERS ---
  submitBtn.addEventListener('click', handleQuery);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleQuery();
  });

  // Focus input on load
  input.focus();

  // --- HEADER ACTIONS ---
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      if (chrome.runtime && chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open('options.html', '_blank');
      }
    });
  }

  if (dashboardBtn) {
    dashboardBtn.addEventListener('click', () => {
      const url = chrome.runtime.getURL('dashboard/login.html');
      chrome.tabs.create({ url });
    });
  }

  // --- UI HELPERS ---
  function updateStatus(msg, statusType = 'neutral') {
    statusBar.textContent = msg;
    if (statusType === 'error') {
      statusBar.style.color = 'var(--error)';
    } else if (statusType === 'success') {
      statusBar.style.color = 'var(--success)';
    } else {
      statusBar.style.color = 'var(--text-muted)';
    }
  }

  function renderSalesTable(data) {
    let html = `<div class="result-summary"><b>Total:</b> ₹${data.total || 0} | <b>Transactions:</b> ${data.transaction_count || 0}</div>`;

    if (data.breakdown) {
      html += `<div class="result-breakdown">`;
      for (const [status, count] of Object.entries(data.breakdown)) {
        html += `<span class="breakdown-pill"><b>${status.charAt(0).toUpperCase() + status.slice(1)}:</b> ${count}</span>`;
      }
      html += `</div>`;
    }

    if (data.detailed_records && data.detailed_records.length) {
      html += `<table>`;
      html += `<tr><th>Date</th><th>Customer</th><th>Amount</th><th>Status</th></tr>`;
      for (const rec of data.detailed_records.slice(0, 10)) {
        html += `<tr>
          <td>${rec.date ? rec.date.split('T')[0] : ''}</td>
          <td>${rec.customer}</td>
          <td>₹${rec.amount}</td>
          <td>${rec.status}</td>
        </tr>`;
      }
      html += `</table>`;

      if (data.detailed_records.length > 10) {
        html += `<div class="table-footer">Showing first 10 of ${data.detailed_records.length} records.</div>`;
      }
    }
    return html;
  }

  function showOutput(content, type, isHtml = false) {
    output.classList.remove('error-state', 'success-state');

    if (type === 'error') {
      output.classList.add('error-state');
    } else if (type === 'success') {
      output.classList.add('success-state');
    }

    if (isHtml) {
      output.innerHTML = content;
    } else {
      output.textContent = content; // strict sanitization for raw text
    }
  }

  // --- SPEECH RECOGNITION SETUP ---
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    setupWebSpeech();
  } else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    setupWhisperFallback();
  } else {
    micBtn.style.display = 'none';
    updateStatus("Voice input not supported in this browser.", 'error');
  }

  function setupWebSpeech() {
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    let isRecording = false;

    micBtn.addEventListener('click', () => {
      if (isRecording) {
        recognition.stop();
      } else {
        recognition.start();
      }
    });

    recognition.onstart = () => {
      isRecording = true;
      micBtn.classList.add('listening');
      updateStatus("Listening... speak now", 'neutral');
    };

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript.trim();
      console.log('[STT] Web Speech result:', text, '(confidence:', event.results[0][0].confidence.toFixed(2) + ')');
      input.value = text;
      updateStatus('Heard: "' + text + '"', 'success');
      handleQuery();
    };

    recognition.onerror = (event) => {
      isRecording = false;
      micBtn.classList.remove('listening');
      console.error('[STT] Web Speech error:', event.error);
      if (event.error === 'not-allowed') {
        updateStatus("Microphone permission denied. Click the mic icon in the address bar.", 'error');
      } else if (event.error === 'no-speech') {
        updateStatus("No speech detected. Try again.", 'error');
      } else if (event.error === 'network') {
        updateStatus("Network error — switching to offline mode.", 'error');
        setupWhisperFallback(); // fallback to Whisper
      } else {
        updateStatus("Voice error: " + event.error, 'error');
      }
    };

    recognition.onend = () => {
      isRecording = false;
      micBtn.classList.remove('listening');
      if (statusBar.textContent === 'Listening... speak now') {
        updateStatus('Ready for queries...', 'neutral');
      }
    };
  }

  function setupWhisperFallback() {
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;

    micBtn.addEventListener('click', async () => {
      if (isRecording) {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      } else {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaRecorder = new MediaRecorder(stream);
          audioChunks = [];

          mediaRecorder.ondataavailable = event => { audioChunks.push(event.data); };

          mediaRecorder.onstop = async () => {
            isRecording = false;
            micBtn.classList.remove('listening');
            stream.getTracks().forEach(t => t.stop());
            if (audioChunks.length === 0) { updateStatus("No audio captured.", 'error'); return; }
            updateStatus("Processing audio...", 'neutral');
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            await sendAudioToBackend(blob);
          };

          mediaRecorder.start(250);
          isRecording = true;
          micBtn.classList.add('listening');
          updateStatus("Listening...", 'neutral');
          setTimeout(() => { if (isRecording && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); }, 10000);
        } catch (err) {
          if (err.name === 'NotAllowedError') updateStatus("Microphone permission denied.", 'error');
          else updateStatus("Mic error: " + err.message, 'error');
        }
      }
    });
  }

  async function sendAudioToBackend(blob) {
    let connectorUrl = 'http://127.0.0.1:3000';
    try {
      if (
        typeof chrome !== 'undefined' &&
        chrome.storage &&
        typeof chrome.storage.local !== 'undefined' &&
        typeof chrome.storage.local.get === 'function'
      ) {
        connectorUrl = await new Promise(resolve => {
          chrome.storage.local.get(['connectorUrl'], result => {
            resolve(result && result.connectorUrl ? result.connectorUrl : 'http://127.0.0.1:3000');
          });
        });
      }
    } catch (e) {
      connectorUrl = 'http://127.0.0.1:3000';
    }

    const formData = new FormData();
    formData.append('audio', blob, 'recording.webm');

    try {
      const response = await fetch(`${connectorUrl}/transcribe`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const msg = `STT Error (${response.status})`;
        updateStatus(msg, 'error');
        console.error('[STT]', msg);
        return;
      }

      const result = await response.json();
      if (result.success) {
        const text = (result.text || '').trim();
        if (!text) {
          updateStatus("Couldn't understand audio. Speak clearly and try again.", 'error');
          return;
        }
        input.value = text;
        updateStatus('Heard: "' + text + '"', 'success');
        handleQuery();
      } else {
        updateStatus("STT Error: " + (result.error || 'Unknown'), 'error');
      }
    } catch (err) {
      updateStatus("Backend unreachable for STT.", 'error');
      console.error(err);
    }
  }

  // --- CORE TEXT/DATA QUERY PIPELINE ---
  function handleQuery() {
    const query = input.value.trim();

    // 1. Client-Side Input Validation
    if (!query) {
      showOutput("Please enter a query.", "error");
      return;
    }
    if (query.length > 200) {
      showOutput("Error: Query too long (max 200 chars).", "error");
      return;
    }

    updateStatus("Asking Tally...", "neutral");
    showOutput("Processing your request...", "neutral");

    // 2. Extention Runtime Execution (Strictly rely on Background Service Worker)
    if (
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === 'function' &&
      chrome.runtime.id
    ) {
      // Send validated schema msg via background
      chrome.runtime.sendMessage({ type: 'QUERY_TALLY', payload: query }, (response) => {
        if (chrome.runtime.lastError) {
          updateStatus("Connection Error", "error");
          showOutput("System Error: " + chrome.runtime.lastError.message, "error");
          return;
        }

        if (response && response.success) {
          updateStatus("Result received", "success");
          if (response.data && response.data.detailed_records) {
            showOutput(renderSalesTable(response.data), "success", true);
          } else {
            showOutput(JSON.stringify(response.data, null, 2), "success");
          }
        } else {
          updateStatus("Request Failed", "error");
          showOutput(response ? response.error : "Unknown error occurred.", "error");
        }
      });
    } else {
      // Security enforcement: block unauthorized web fetch.
      updateStatus("Not running in extension context.", "error");
      showOutput("Security Error: VoiceTally must be run as a Chrome Extension. Standalone execution is disabled.", "error");
      // Standalone mode: direct fetch to backend
      // Only supports sales queries for demo
      let endpoint = '';
      const normalizedQuery = query.toLowerCase().trim();
      if (normalizedQuery.includes('sales') || normalizedQuery.includes('sells') || normalizedQuery.includes('revenue')) {
        endpoint = '/sales?';
        const params = new URLSearchParams();
        if (normalizedQuery.includes('last week')) params.append('period', 'week');
        else if (normalizedQuery.includes('last month')) params.append('period', 'month');
        else if (normalizedQuery.includes('last year')) params.append('period', 'year');
        if (normalizedQuery.includes('pending') || normalizedQuery.includes('unpaid')) params.append('status', 'pending');
        else if (normalizedQuery.includes('paid')) params.append('status', 'paid');
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
      } else {
        showOutput("Only sales queries are supported in local mode.", "error");
        return;
      }
      fetch(`http://127.0.0.1:3000${endpoint}`)
        .then(r => r.json())
        .then(data => {
          if (data && data.detailed_records) {
            output.innerHTML = renderSalesTable(data);
            output.style.borderColor = "#28a745";
            output.style.color = "#333";
          } else {
            output.textContent = JSON.stringify(data, null, 2);
            output.style.borderColor = "#28a745";
            output.style.color = "#333";
          }
        })
        .catch(err => {
          showOutput("Backend Error: " + err, "error");
        });
    }
  }
});