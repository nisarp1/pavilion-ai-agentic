/**
 * Pavilion Remotion Render Server
 * PNG frame capture + CRF 18 H264 for pixel-perfect production quality.
 */

const express = require('express');
const path    = require('path');
const http    = require('http');
const os      = require('os');
const fs      = require('fs');

const BUNDLE_DIR           = path.join(__dirname, 'build');
const BUNDLE_INTERNAL_PORT = 9000;
const API_PORT             = parseInt(process.env.PORT || '8080', 10);
const BUNDLE_URL           = `http://127.0.0.1:${BUNDLE_INTERNAL_PORT}`;
const CHROME_EXEC          = process.env.REMOTION_CHROME_EXECUTABLE
                          || process.env.PUPPETEER_EXECUTABLE_PATH
                          || '/usr/bin/chromium';

// Maximum render time: 30 minutes. Covers even the longest videos with PNG capture.
const SERVER_TIMEOUT_MS = 30 * 60 * 1000;

// ── In-flight render deduplication ───────────────────────────────────────────
// Maps jobId → Promise<result>. If a second request for the same jobId arrives
// while a render is already running, it piggybacks on the existing promise
// instead of starting a duplicate render that would fight over CPUs.
const activeRenders = new Map();

// ── Internal static server for the pre-bundled Remotion app ──────────────────
const staticApp = express();
staticApp.use(express.static(BUNDLE_DIR));
http.createServer(staticApp).listen(BUNDLE_INTERNAL_PORT, '127.0.0.1', () => {
  console.log(`Bundle served at ${BUNDLE_URL}`);
});

// ── Render API ────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/',       (_req, res) => res.json({ service: 'Pavilion Remotion Renderer', version: '2.3.0', status: 'ok' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', bundle: BUNDLE_URL, chrome: CHROME_EXEC, cpus: os.cpus().length, activeRenders: activeRenders.size }));

app.post('/render', async (req, res) => {
  const { renderMedia, selectComposition } = await import('@remotion/renderer');
  const { Storage } = await import('@google-cloud/storage');

  const {
    compositionId = 'PavilionReel',
    props,
    jobId,
    outputGcsPath,
    bucketName,
  } = req.body;

  if (!props) return res.status(400).json({ error: 'props is required' });

  const gcsBucket = bucketName || process.env.GCS_BUCKET_NAME;
  if (!gcsBucket) return res.status(400).json({ error: 'bucketName or GCS_BUCKET_NAME env var is required' });

  const label     = jobId || Date.now();
  const blobPath  = outputGcsPath || `videos/render_${label}.mp4`;
  const cpuCount  = os.cpus().length;

  // ── Deduplication: if this jobId is already being rendered, wait for it ──
  if (jobId && activeRenders.has(jobId)) {
    console.log(`[${label}] Duplicate request — waiting for in-flight render`);
    try {
      const result = await activeRenders.get(jobId);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message, jobId });
    }
  }

  const renderPromise = (async () => {
    const tmpOutput = path.join(os.tmpdir(), `render_${label}.mp4`);
    const startTime = Date.now();
    const elapsedS  = () => ((Date.now() - startTime) / 1000).toFixed(1);

    try {
      console.log(`[${label}] Selecting composition: ${compositionId} (concurrency=${cpuCount})`);
      const composition = await selectComposition({
        serveUrl:          BUNDLE_URL,
        id:                compositionId,
        inputProps:        props,
        browserExecutable: CHROME_EXEC,
      });

      const { durationInFrames, fps } = composition;
      console.log(`[${label}] Rendering ${durationInFrames} frames @ ${fps}fps ...`);

      await renderMedia({
        composition,
        serveUrl:          BUNDLE_URL,
        codec:             'h264',
        outputLocation:    tmpOutput,
        inputProps:        props,
        browserExecutable: CHROME_EXEC,
        chromiumOptions:   { disableWebSecurity: true },
        // PNG: lossless frame capture — no intermediate compression artifacts on
        // fine text strokes (WebkitTextStroke) or sharp UI edges.
        imageFormat:       'png',
        // CRF 18 = visually lossless H264 (FFmpeg default is 28 which is noticeably lower).
        crf:               18,
        // Cap concurrency at 4 — reduces memory pressure on the Chrome instances.
        // High concurrency (=num CPUs) causes rendering artifacts when multiple
        // tabs compete for image decode memory.
        concurrency:       Math.min(cpuCount, 4),
        // 60s per delayRender() call — external images on slow CDNs can take >30s.
        // Default is 30s which causes glitched frames when network is slow.
        timeoutInMilliseconds: 60_000,
        onProgress: ({ renderedFrames, encodedFrames }) => {
          if (renderedFrames % 60 === 0) {
            console.log(`[${label}] rendered=${renderedFrames}/${durationInFrames} encoded=${encodedFrames} (${elapsedS()}s)`);
          }
        },
      });

      const sizeMb = (fs.statSync(tmpOutput).size / 1024 / 1024).toFixed(1);
      console.log(`[${label}] Render done in ${elapsedS()}s · ${sizeMb}MB · uploading to gs://${gcsBucket}/${blobPath}`);

      // Stream MP4 to GCS. resumable:false = single-request upload (no extra IAM needed).
      const storage = new Storage();
      const gcsFile = storage.bucket(gcsBucket).file(blobPath);
      await new Promise((resolve, reject) => {
        fs.createReadStream(tmpOutput)
          .pipe(gcsFile.createWriteStream({ resumable: false, contentType: 'video/mp4' }))
          .on('error', reject)
          .on('finish', resolve);
      });

      let videoUrl;
      try {
        const [signedUrl] = await gcsFile.getSignedUrl({
          action:  'read',
          expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });
        videoUrl = signedUrl;
      } catch (signErr) {
        console.warn(`[${label}] Signed URL failed (${signErr.message}), using public URL`);
        videoUrl = `https://storage.googleapis.com/${gcsBucket}/${blobPath}`;
      }

      console.log(`[${label}] Done in ${elapsedS()}s → ${videoUrl}`);
      return { success: true, videoUrl, jobId };

    } finally {
      try { if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput); } catch {}
      activeRenders.delete(jobId);
    }
  })();

  if (jobId) activeRenders.set(jobId, renderPromise);

  try {
    const result = await renderPromise;
    return res.json(result);
  } catch (err) {
    console.error(`[${label}] Render failed:`, err.message);
    return res.status(500).json({ error: err.message, jobId });
  }
});

// ── HTTP server with long timeout so connections survive 15-min renders ───────
const server = http.createServer(app);
server.setTimeout(SERVER_TIMEOUT_MS);
server.keepAliveTimeout = SERVER_TIMEOUT_MS;
server.headersTimeout   = SERVER_TIMEOUT_MS + 1000;

server.listen(API_PORT, '0.0.0.0', () => {
  console.log(`Remotion render API listening on :${API_PORT} (timeout=${SERVER_TIMEOUT_MS / 60000}min)`);
});
