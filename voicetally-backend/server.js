require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const logger = require('./logger');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_super_secret_dev_key_only_123';

const app = express();

// --- REQUEST LOGGING MIDDLEWARE ---
app.use((req, res, next) => {
  logger.info(`Incoming request: ${req.method} ${req.originalUrl} from ${req.ip}`);
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      logger.warn(`Request failed: ${req.method} ${req.originalUrl} - Status: ${res.statusCode}`);
    } else {
      logger.info(`Request succeeded: ${req.method} ${req.originalUrl} - Status: ${res.statusCode}`);
    }
  });
  next();
});

app.use(express.json()); // Allow JSON body parsing for auth routes
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1'; // STRICT: Localhost only

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
    logger.info("[STT] Loading Whisper model (Xenova/whisper-tiny.en)...");
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
    logger.info("[STT] Model loaded successfully.");
  } catch (err) {
    logger.error(`[STT] Failed to load model: ${err.message}`, err);
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

// --- MOCK DATABASE ---
const mockUsers = [
  { id: 1, email: 'admin@example.com', password: 'password', role: 'admin' },
  { id: 2, email: 'user@example.com', password: 'password', role: 'user' }
];

let globalRateLimitConfig = { max: 100, windowMin: 1 };
const auditLogs = [];

function addAuditLog(userId, action, status) {
  auditLogs.unshift({
    time: new Date().toISOString(),
    user: userId,
    action,
    status
  });
  if (auditLogs.length > 1000) auditLogs.pop(); // Keep array bounded
}

// --- AUTHENTICATION MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Access denied. Token missing." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token." });
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: "Access denied. Admins only." });
  }
  next();
};

// --- ROUTES ---

// 0. Authentication Route
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required." });

  const user = mockUsers.find(u => u.email === email && u.password === password);
  if (!user) {
    addAuditLog('Anonymous', `Failed Login Attempt: ${email}`, 'Blocked');
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  addAuditLog(user.email, 'Logged In', 'Success');
  res.json({ success: true, token, role: user.role });
});

// 1. Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), env: { PORT, HOST } });
});

// 2. Sales Data Endpoint
const { getSales } = require('./file_ingestion');

// 2. Sales Data Endpoint
app.get('/sales', async (req, res) => {
  let userId = 'ExtensionUser'; // Default tracking for proxy users
  try {
    const { period, customer, status, from, to } = req.query;
    // Strict Parameter Validation for PERIOD only if it exists
    if (period && !VALID_PERIODS.includes(period)) {
      addAuditLog(userId, 'Sales Query Failed - Invalid Period', 'Blocked');
      return res.status(400).json({
        error: "Invalid Parameter",
        message: `Period must be one of: ${VALID_PERIODS.join(', ')}`
      });
    }
    // Check for unexpected parameters (Whitelisting approach)
    const allowedKeys = ['period', 'customer', 'status', 'from', 'to'];
    const queryKeys = Object.keys(req.query);
    const invalidKeys = queryKeys.filter(key => !allowedKeys.includes(key));
    if (invalidKeys.length > 0) {
      addAuditLog(userId, `Sales Query Failed - Unknown Params: ${invalidKeys.join(',')}`, 'Blocked');
      return res.status(400).json({
        error: "Bad Request",
        message: `Unknown parameters: ${invalidKeys.join(', ')}`
      });
    }
    // Sanitize input
    const safe = str => typeof str === 'string' ? str.replace(/[^\w\s\-@.]/g, '') : str;
    const cleanParams = {
      period: safe(period),
      customer: safe(customer),
      status: safe(status),
      from: safe(from),
      to: safe(to)
    };

    addAuditLog(userId, `Requested Sales Data: ${JSON.stringify(cleanParams)}`, 'Success');
    const data = await getSales(cleanParams);
    res.json(data);
  } catch (err) {
    logger.error(`[ERROR] /sales Data Fetch Error: ${err.message}`, err);
    addAuditLog(userId, `Sales Query Error`, 'Error');
    res.status(500).json({ error: "Failed to load data.", details: err.message });
  }
});

// 3. User History (Mocked for dashboard example)
app.get('/api/user/history', authenticateToken, (req, res) => {
  // Fetch logs specifically for this verified user's email
  const userLogs = auditLogs.filter(log => log.user === req.user.email).slice(0, 10);
  res.json({ success: true, history: userLogs });
});

// 4. Admin Audit Logs
app.get('/api/admin/audit-logs', authenticateToken, requireAdmin, (req, res) => {
  res.json({ success: true, logs: auditLogs });
});

// 5. Admin Config Tweak (Example endpoint)
app.post('/api/admin/config', authenticateToken, requireAdmin, (req, res) => {
  const { max, windowMin } = req.body;
  if (!max || !windowMin) return res.status(400).json({ error: "Missing config parameters." });

  globalRateLimitConfig.max = parseInt(max, 10);
  globalRateLimitConfig.windowMin = parseInt(windowMin, 10);

  addAuditLog(req.user.email, `Updated Global Rate Limit: ${max} req/${windowMin}m`, 'Success');
  res.json({ success: true, config: globalRateLimitConfig });
});

// --- GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
  logger.error(`[FATAL ERROR] ${err.message}`, err);
  res.status(500).json({ error: "Internal Server Error", details: err.message });
});

// --- START SERVER ---
app.listen(PORT, HOST, () => {
  logger.info(`[VoiceTally-Backend] Securely running at http://${HOST}:${PORT}`);
  logger.info(`[Security] Rate Limit: ${process.env.RATE_LIMIT_MAX_REQ || 100} reqs / ${process.env.RATE_LIMIT_WINDOW_MIN || 1} min`);
});

// --- STT ENDPOINT (Local Whisper) ---
const upload = multer({ dest: require('os').tmpdir() });

app.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!transcriber) return res.status(503).json({ error: "Model is loading, please try again." });
  if (!req.file) return res.status(400).json({ error: "No audio file provided." });

  const inputPath = req.file.path;
  const outputPath = inputPath + '.wav';

  try {
    // Convert WebM (Opus) -> WAV (PCM 16kHz Mono, normalized volume)
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat('wav')
        .audioFrequency(16000)
        .audioChannels(1)
        .audioFilters('volume=4.0') // boost gain 4x to handle quiet microphones
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
    // getSamples: for mono returns Float32Array directly; for multi-channel returns array of Float32Arrays
    let audioData = wav.getSamples(false, Float32Array);
    if (Array.isArray(audioData)) {
      audioData = audioData[0]; // take channel 0
    }
    // If still not Float32Array (e.g. returned as number[]), convert
    if (!(audioData instanceof Float32Array)) {
      audioData = Float32Array.from(audioData);
    }

    if (!audioData || audioData.length === 0) {
      throw new Error('Audio data is empty after decoding');
    }

    // Run Transcription on Audio Data
    logger.info(`[STT] Audio samples: ${audioData.length}, duration: ~${(audioData.length / 16000).toFixed(1)}s`);

    // Normalize audio to [-1, 1] so Whisper can hear quiet mic input
    let maxAmp = 0;
    for (let i = 0; i < audioData.length; i++) {
      if (Math.abs(audioData[i]) > maxAmp) maxAmp = Math.abs(audioData[i]);
    }
    logger.info(`[STT] Peak amplitude: ${maxAmp.toFixed(4)}`);
    if (maxAmp > 0 && maxAmp < 0.1) {
      // Audio is very quiet — boost it
      const boost = 0.9 / maxAmp;
      for (let i = 0; i < audioData.length; i++) audioData[i] *= boost;
      logger.info(`[STT] Boosted audio by ${boost.toFixed(1)}x`);
    }

    const output = await transcriber(audioData, {
      language: 'english',
      task: 'transcribe',
    });

    logger.debug(`[STT] Raw output: ${JSON.stringify(output)}`);
    const text = (output.text || '').trim().replace(/\[.*?\]/g, '').trim();
    logger.info(`[STT] Transcribed: "${text}"`);

    // Cleanup
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    res.json({ success: true, text: text });

  } catch (err) {
    logger.error(`[STT] Error: ${err.message}`, err);
    // Cleanup on error
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch (_) { }
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (_) { }

    res.status(500).json({ error: "Transcription failed.", detail: err.message });
  }
});

