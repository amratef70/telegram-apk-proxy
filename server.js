require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch'); // v2
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const AbortController = require('abort-controller');

const app = express();

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('Missing BOT_TOKEN in environment. Exiting.');
  process.exit(1);
}
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const TELEGRAM_FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const API_KEY = process.env.API_KEY || '';

app.use(helmet());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '60'),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (req, res) => res.send('OK'));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function requireApiKey(req, res, next) {
  if (!API_KEY) return next();
  const key = (req.headers['x-api-key'] || req.query.apikey || '').toString();
  if (key !== API_KEY) return res.status(401).send('Unauthorized: missing or invalid API key');
  next();
}

app.get('/download', requireApiKey, async (req, res) => {
  try {
    const file_id = req.query.file_id;
    if (!file_id) return res.status(400).send('Missing file_id');
    if (typeof file_id !== 'string' || file_id.length < 10) return res.status(400).send('Invalid file_id');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const r1 = await fetch(`${TELEGRAM_API}/getFile?file_id=${encodeURIComponent(file_id)}`, { signal: controller.signal });
    clearTimeout(timeout);
    const j1 = await r1.json();
    if (!j1.ok) {
      console.error('Telegram getFile response:', j1);
      return res.status(502).send('Telegram getFile failed');
    }
    const file_path = j1.result && j1.result.file_path;
    if (!file_path) return res.status(502).send('No file_path returned by Telegram');

    const fileUrl = `${TELEGRAM_FILE_API}/${file_path}`;
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 30000);
    const upstream = await fetch(fileUrl, { signal: controller2.signal });
    clearTimeout(timeout2);
    if (!upstream.ok) {
      console.error('Failed to fetch file from Telegram CDN, status:', upstream.status);
      return res.status(502).send('Failed to fetch file from Telegram CDN.');
    }

    const filename = req.query.name || file_path.split('/').pop() || 'download.apk';
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/vnd.android.package-archive');
    res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);

    upstream.body.pipe(res);
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('Request timed out', err);
      return res.status(504).send('Upstream request timed out');
    }
    console.error('Error in /download:', err);
    res.status(500).send('Server error: ' + err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
