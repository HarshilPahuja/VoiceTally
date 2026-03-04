/**
 * test_webm_transcribe.js — tests the exact pipeline the browser uses:
 * generates a WebM audio file via ffmpeg, POSTs it to /transcribe, prints result.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);

const BACKEND = 'http://127.0.0.1:3000';
const WAV_PATH = path.join(os.tmpdir(), '_test_src.wav');
const WEBM_PATH = path.join(os.tmpdir(), '_test_recording.webm');

// Step 1: create a WAV with a short sine tone, then convert to WebM (Opus) — same as browser
const { WaveFile } = require('wavefile');

function generateWav() {
  const sampleRate = 16000;
  const samples = new Float32Array(sampleRate * 2); // 2 seconds
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.3;
  }
  const wav = new WaveFile();
  wav.fromScratch(1, sampleRate, '32f', samples);
  fs.writeFileSync(WAV_PATH, wav.toBuffer());
  console.log(`[TEST] Source WAV: ${WAV_PATH}`);
}

function convertToWebm() {
  return new Promise((resolve, reject) => {
    ffmpeg(WAV_PATH)
      .toFormat('webm')
      .audioCodec('libopus')
      .on('end', () => {
        console.log(`[TEST] WebM generated: ${WEBM_PATH} (${fs.statSync(WEBM_PATH).size} bytes)`);
        resolve();
      })
      .on('error', (err) => {
        console.error('[TEST] ffmpeg error generating WebM:', err.message);
        // If libopus not available, just use the WAV renamed as webm for a simpler test
        fs.copyFileSync(WAV_PATH, WEBM_PATH);
        console.log('[TEST] Fallback: using WAV bytes with .webm extension');
        resolve();
      })
      .save(WEBM_PATH);
  });
}

function postAudio(filePath, mimeType) {
  return new Promise((resolve, reject) => {
    const boundary = '----TestBoundary' + Date.now();
    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const pre = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
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
    generateWav();
    await convertToWebm();
    console.log('[TEST] Sending WebM to /transcribe ...');
    const result = await postAudio(WEBM_PATH, 'audio/webm');
    if (result.status === 200 && result.body.success) {
      console.log(`\n[TEST] PASS — Transcribed text: "${result.body.text}"`);
    } else {
      console.log('\n[TEST] FAIL — Error:', result.body.error || result.body.detail || result.body);
    }
  } catch (err) {
    console.error('[TEST] Fatal:', err.message);
  } finally {
    [WAV_PATH, WEBM_PATH].forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} });
  }
})();
