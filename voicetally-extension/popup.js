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

  // --- LOCAL STT SETUP (MediaRecorder + Backend Whisper) ---

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    micBtn.style.display = 'none';
    showOutput("Error: Audio API not supported", "error");
  } else {
    setupLocalVoice();
  }

  function setupLocalVoice() {
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;

    micBtn.addEventListener('click', async () => {
      if (isRecording) {
        stopRecording();
      } else {
        await startRecording();
      }
    });

    async function startRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
          audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
          isRecording = false;
          micBtn.classList.remove('listening');
          updateStatus("Processing...");

          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          await sendAudioToBackend(audioBlob);

          // Stop all tracks to release mic
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        isRecording = true;
        micBtn.classList.add('listening');
        updateStatus("Listening...");

        // Auto-stop after 10s
        setTimeout(() => {
          if (isRecording) stopRecording();
        }, 10000);

      } catch (err) {
        console.error(err);
        if (err.name === 'NotAllowedError') { // Permission denied
          updateStatus("Permission needed.");
          // Open onboarding if denied
          chrome.tabs.create({ url: 'welcome.html' });
        } else {
          updateStatus("Mic Error: Try again.");
        }
      }
    }

    function stopRecording() {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    }

    async function sendAudioToBackend(blob) {
      // Get URL from storage
      const connectorUrl = await new Promise(resolve => {
        chrome.storage.local.get(['connectorUrl'], result => {
          resolve(result.connectorUrl || 'http://127.0.0.1:3000');
        });
      });

      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');

      try {
        const response = await fetch(`${connectorUrl}/transcribe`, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) throw new Error('Transcription failed');

        const result = await response.json();
        if (result.success) {
          input.value = result.text;
          updateStatus("");
          handleQuery(); // Auto-submit
        } else {
          updateStatus("STT Error");
        }
      } catch (err) {
        updateStatus("Backend Error");
        console.error(err);
      }
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
    chrome.runtime.sendMessage({ type: 'QUERY_TALLY', payload: query }, (response) => {
      if (chrome.runtime.lastError) {
        showOutput("System Error: " + chrome.runtime.lastError.message, "error");
        return;
      }
      if (response && response.success) {
        // Format sales data if present
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