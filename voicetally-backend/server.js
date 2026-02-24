require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT;
const HOST = process.env.HOST; // STRICT: Localhost only

const multer = require('multer');
const { pipeline } = require('@xenova/transformers');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// Configure ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

// Initialize STT Pipeline (Lazy Load or Global)
let transcriber = null;
(async () => {
  try {
    console.log("[STT] Loading Whisper model (Xenova/whisper-tiny.en)...");
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
    console.log("[STT] Model loaded successfully.");
  } catch (err) {
    console.error("[STT] Failed to load model:", err);
  }
})();

// --- SECURITY MIDDLEWARE ---

// 1. Helmet: Sets various HTTP headers to secure the app
app.use(helmet());

// 2. CORS: Restrict access to specific origins
const corsOptions = {
  origin: process.env.EXTENSION_ID
    ? `chrome-extension://${process.env.EXTENSION_ID}`
    : '*', // Fallback for dev/testing if ID not set
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// 3. Rate Limiter: Prevent brute force/DoS
const limiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW_MIN || 1) * 60 * 1000, // 1 minute
  max: process.env.RATE_LIMIT_MAX_REQ || 100, // Limit each IP to 100 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: "Too many requests, please try again later." }
});

// Apply rate limiting to all requests
app.use(limiter);

// --- VALIDATION HELPER ---
const VALID_PERIODS = ['week', 'month', 'year'];

// --- ROUTES ---

// 1. Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// 2. Sales Data Endpoint
const { getSales } = require('./file_ingestion');

// 2. Sales Data Endpoint
app.get('/sales', async (req, res) => {
  // Input Validation
  const { period, customer, status, from, to } = req.query;

  // Strict Parameter Validation for PERIOD only if it exists
  if (period && !VALID_PERIODS.includes(period)) {
    return res.status(400).json({
      error: "Invalid Parameter",
      message: `Period must be one of: ${VALID_PERIODS.join(', ')}`
    });
  }

  // Check for unexpected parameters (Whitelisting approach)
  // Expanded whitelist for robust queries
  const allowedKeys = ['period', 'customer', 'status', 'from', 'to'];
  const queryKeys = Object.keys(req.query);
  const invalidKeys = queryKeys.filter(key => !allowedKeys.includes(key));

  if (invalidKeys.length > 0) {
    return res.status(400).json({
      error: "Bad Request",
      message: `Unknown parameters: ${invalidKeys.join(', ')}`
    });
  }

  try {
    // Pass all checks
    const data = await getSales({ period, customer, status, from, to });
    res.json(data);
  } catch (err) {
    console.error("Data Fetch Error:", err);
    res.status(500).json({ error: "Failed to load data." });
  }
});

// --- GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

// --- START SERVER ---
app.listen(PORT, HOST, () => {
  console.log(`[VoiceTally-Backend] Securely running at http://${HOST}:${PORT}`);
  console.log(`[Security] Rate Limit: ${process.env.RATE_LIMIT_MAX_REQ} reqs / ${process.env.RATE_LIMIT_WINDOW_MIN} min`);
});

// --- STT ENDPOINT (Local Whisper) ---
const upload = multer({ dest: require('os').tmpdir() });

app.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!transcriber) return res.status(503).json({ error: "Model is loading, please try again." });
  if (!req.file) return res.status(400).json({ error: "No audio file provided." });

  const inputPath = req.file.path;
  const outputPath = inputPath + '.wav';

  try {
    // Convert WebM (Opus) -> WAV (PCM 16kHz Mono for best results)
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat('wav')
        .audioFrequency(16000)
        .audioChannels(1)
        .on('end', resolve)
        .on('error', reject)
        .save(outputPath);
    });

    // Read and decode WAV file to Float32Array for Transformers.js
    const buffer = fs.readFileSync(outputPath);
    const { WaveFile } = require('wavefile');
    const wav = new WaveFile();
    wav.fromBuffer(buffer);

    wav.toBitDepth('32f'); // Convert to 32-bit float
    wav.toBitDepth('32f'); // Convert to 32-bit float
    let audioData = wav.getSamples();

    // Handle potential multi-channel output from wavefile (though we forced mono)
    if (Array.isArray(audioData)) {
      audioData = audioData[0];
    }

    // Run Transcription on Audio Data
    const output = await transcriber(audioData, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: 'english',
      task: 'transcribe',
    });

    const text = output.text.trim().replace(/\[.*?\]/g, '');
    console.log(`[STT] Transcribed: "${text}"`);

    // Cleanup
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    res.json({ success: true, text: text });

  } catch (err) {
    console.error("[STT] Error:", err);
    // Cleanup on error
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    res.status(500).json({ error: "Transcription failed." });
  }
});

