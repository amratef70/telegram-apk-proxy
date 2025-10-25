require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch'); // v2
const app = express();

const BOT_TOKEN = process.env.BOT_TOKEN;
if(!BOT_TOKEN){ console.error('Missing BOT_TOKEN in .env'); process.exit(1); }

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const TELEGRAM_FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`;
const ALLOW_ORIGIN = '*'; // يمكنك تغييره لاحقًا

app.get('/', (req,res) => {
  res.send('TG APK proxy is running');
});

// endpoint تحميل APK
app.get('/download', async (req, res) => {
  try {
    const file_id = req.query.file_id;
    if(!file_id) return res.status(400).send('Missing file_id');

    // استدعاء getFile
    const r1 = await fetch(`${TELEGRAM_API}/getFile?file_id=${encodeURIComponent(file_id)}`);
    const j1 = await r1.json();
    if(!j1.ok) return res.status(502).send('Telegram getFile failed');

    const file_path = j1.result.file_path;
    const fileUrl = `${TELEGRAM_FILE_API}/${file_path}`;

    const upstream = await fetch(fileUrl);
    if(!upstream.ok) return res.status(502).send('Failed to fetch file from Telegram CDN.');

    const filename = req.query.name || file_path.split('/').pop() || 'download.apk';
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/vnd.android.package-archive');
    res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);

    upstream.body.pipe(res);

  } catch(err){
    console.error(err);
    res.status(500).send('Server error: ' + err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`Server listening on port ${PORT}`));
