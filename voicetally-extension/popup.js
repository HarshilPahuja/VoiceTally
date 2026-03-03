document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('queryInput');
  const submitBtn = document.getElementById('submitBtn');
  const micBtn = document.getElementById('micBtn');
  const output = document.getElementById('output');
  const statusBar = document.getElementById('statusBar');

  // --- STANDARD EVENT LISTENERS ---
  submitBtn.addEventListener('click', handleQuery);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleQuery();
  });

  // --- SPEECH RECOGNITION SETUP ---
  // Use Chrome's native Web Speech API (webkitSpeechRecognition) — most accurate for live mic
  // Falls back to MediaRecorder + Whisper backend if Web Speech API unavailable

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    setupWebSpeech();
  } else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    setupWhisperFallback();
  } else {
    micBtn.style.display = 'none';
    updateStatus("Voice input not supported in this browser.", true);
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
      updateStatus("Listening... speak now");
    };

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript.trim();
      console.log('[STT] Web Speech result:', text, '(confidence:', event.results[0][0].confidence.toFixed(2) + ')');
      input.value = text;
      updateStatus('Heard: "' + text + '"');
      handleQuery();
    };

    recognition.onerror = (event) => {
      isRecording = false;
      micBtn.classList.remove('listening');
      console.error('[STT] Web Speech error:', event.error);
      if (event.error === 'not-allowed') {
        updateStatus("Microphone permission denied. Click the mic icon in the address bar.", true);
      } else if (event.error === 'no-speech') {
        updateStatus("No speech detected. Try again.", true);
      } else if (event.error === 'network') {
        updateStatus("Network error — switching to offline mode.", true);
        setupWhisperFallback(); // fallback to Whisper
      } else {
        updateStatus("Voice error: " + event.error, true);
      }
    };

    recognition.onend = () => {
      isRecording = false;
      micBtn.classList.remove('listening');
      if (statusBar.textContent === 'Listening... speak now') {
        updateStatus('');
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
            if (audioChunks.length === 0) { updateStatus("No audio captured.", true); return; }
            updateStatus("Processing...");
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            await sendAudioToBackend(blob);
          };

          mediaRecorder.start(250);
          isRecording = true;
          micBtn.classList.add('listening');
          updateStatus("Listening...");
          setTimeout(() => { if (isRecording && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); }, 10000);
        } catch (err) {
          if (err.name === 'NotAllowedError') updateStatus("Microphone permission denied.", true);
          else updateStatus("Mic error: " + err.message, true);
        }
      }
    });
  }

  async function sendAudioToBackend(blob) {
      // Get URL from storage if available, else fallback
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
        // fallback to default
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
          let detail = '';
          try {
            const errBody = await response.json();
            detail = errBody.detail || errBody.error || '';
          } catch (_) {}
          const msg = detail ? `STT Error: ${detail}` : `STT Error (${response.status})`;
          updateStatus(msg, true);
          console.error('[STT]', msg);
          return;
        }

        const result = await response.json();
        console.log('[STT] Raw result:', result);
        if (result.success) {
          const text = (result.text || '').trim();
          if (!text) {
            updateStatus("Couldn't understand audio. Speak clearly and try again.", true);
            return;
          }
          input.value = text;
          updateStatus("Heard: \"" + text + "\"");
          handleQuery(); // Auto-submit
        } else {
          updateStatus("STT Error: " + (result.error || 'Unknown'), true);
        }
      } catch (err) {
        updateStatus("Backend unreachable. Is the server running?", true);
        console.error(err);
      }
  }

  function updateStatus(msg, isError = false) {
    statusBar.textContent = msg;
    statusBar.style.color = isError ? "#d9534f" : "#666";
  }

  // --- CORE QUERY PIPELINE (Reused) ---

  function handleQuery() {
    const query = input.value.trim();
    output.classList.remove('error');
    output.style.borderColor = "#ddd";
    // Input validation
    if (!query) {
      showOutput("Please enter a query.", "error");
      return;
    }
    if (query.length > 200) {
      showOutput("Error: Query too long (max 200 chars).", "error");
      return;
    }
    statusBar.textContent = "";
    showOutput("Asking Tally...", "neutral");

    // If running as extension, use chrome.runtime.sendMessage only if chrome.runtime.id exists
    if (
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === 'function' &&
      chrome.runtime.id
    ) {
      chrome.runtime.sendMessage({ type: 'QUERY_TALLY', payload: query }, (response) => {
        if (chrome.runtime.lastError) {
          showOutput("System Error: " + chrome.runtime.lastError.message, "error");
          return;
        }
        if (response && response.success) {
          if (response.data && response.data.detailed_records) {
            output.innerHTML = renderSalesTable(response.data);
            output.style.borderColor = "#28a745";
            output.style.color = "#333";
          } else {
            output.textContent = JSON.stringify(response.data, null, 2);
            output.style.borderColor = "#28a745";
            output.style.color = "#333";
          }
        } else {
          showOutput(response ? response.error : "Unknown error.", "error");
        }
      });
    } else {
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

  function renderSalesTable(data) {
    let html = `<div><b>Total: ₹${data.total || 0}</b> | <b>Transactions:</b> ${data.transaction_count || 0}</div>`;
    if (data.breakdown) {
      html += `<div style='margin-bottom:8px;'>`;
      for (const [status, count] of Object.entries(data.breakdown)) {
        html += `<span style='margin-right:10px;'><b>${status}:</b> ${count}</span>`;
      }
      html += `</div>`;
    }
    if (data.detailed_records && data.detailed_records.length) {
      html += `<table style='width:100%;border-collapse:collapse;font-size:12px;'>`;
      html += `<tr><th>Date</th><th>Customer</th><th>Amount</th><th>Status</th></tr>`;
      for (const rec of data.detailed_records.slice(0, 10)) {
        html += `<tr><td>${rec.date ? rec.date.split('T')[0] : ''}</td><td>${rec.customer}</td><td>₹${rec.amount}</td><td>${rec.status}</td></tr>`;
      }
      html += `</table>`;
      if (data.detailed_records.length > 10) {
        html += `<div style='font-size:11px;color:#888;'>Showing first 10 of ${data.detailed_records.length} records.</div>`;
      }
    }
    return html;
  }

  function showOutput(msg, type) {
    output.textContent = msg;
    if (type === 'error') {
      output.style.borderColor = "#d9534f";
      output.style.color = "#d9534f";
    } else {
      output.style.color = "#666";
    }
  }
});