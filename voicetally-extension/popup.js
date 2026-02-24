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

    // Clear status
    output.classList.remove('error');
    output.style.borderColor = "#ddd";

    // 1. Validation (Applies to both Voice and Type)
    if (!query) return; // Ignore empty inputs

    if (query.length > 200) {
      showOutput("Error: Query too long (max 200 chars).", "error");
      return;
    }

    // 2. Processing
    statusBar.textContent = "";
    showOutput("Asking Tally...", "neutral");

    chrome.runtime.sendMessage({ type: 'QUERY_TALLY', payload: query }, (response) => {
      if (chrome.runtime.lastError) {
        showOutput("System Error: " + chrome.runtime.lastError.message, "error");
        return;
      }

      if (response && response.success) {
        // Pretty print JSON response
        output.textContent = JSON.stringify(response.data, null, 2);
        output.style.borderColor = "#28a745";
        output.style.color = "#333";
      } else {
        showOutput(response ? response.error : "Unknown error.", "error");
      }
    });
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