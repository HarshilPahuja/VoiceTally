/**
 * test_transcribe.js — end-to-end test for /transcribe endpoint
 * Generates a real sine-wave WAV, POSTs it as a multipart file, prints result.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { WaveFile } = require('wavefile');

const BACKEND = 'http://127.0.0.1:3000';
const WAV_PATH = path.join(__dirname, '_test_tone.wav');

// 1. Generate a 1-second 440Hz tone at 16kHz mono
function generateTestWav() {
  const sampleRate = 16000;
  const seconds = 1;
  const samples = new Float32Array(sampleRate * seconds);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.3;
  }
  const wav = new WaveFile();
  wav.fromScratch(1, sampleRate, '32f', samples);
  fs.writeFileSync(WAV_PATH, wav.toBuffer());
  console.log(`[TEST] WAV generated: ${WAV_PATH} (${fs.statSync(WAV_PATH).size} bytes)`);
}

// 2. POST the WAV to /transcribe using multipart/form-data (plain http — no fetch needed)
function postAudio(filePath) {
  return new Promise((resolve, reject) => {
    const boundary = '----TestBoundary' + Date.now();
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    // Build multipart body
    const pre = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${fileName}"\r\nContent-Type: audio/wav\r\n\r\n`
    );
    const post = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([pre, fileData, post]);

    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path: '/transcribe',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[TEST] Status: ${res.statusCode}`);
        try {
          const json = JSON.parse(data);
          console.log('[TEST] Response:', JSON.stringify(json, null, 2));
          resolve({ status: res.statusCode, body: json });
        } catch (_) {
          console.log('[TEST] Raw response:', data);
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[TEST] Request failed:', err.message);
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

(async () => {
  try {
    generateTestWav();
    console.log('[TEST] Sending WAV to /transcribe ...');
    const result = await postAudio(WAV_PATH);
    if (result.status === 200 && result.body.success) {
      console.log(`\n[TEST] PASS — Transcribed text: "${result.body.text}"`);
    } else {
      console.log('\n[TEST] FAIL — Server error:', result.body.error || result.body.detail || result.body);
    }
  } catch (err) {
    console.error('[TEST] Fatal:', err.message);
  } finally {
    if (fs.existsSync(WAV_PATH)) fs.unlinkSync(WAV_PATH);
  }
})();
