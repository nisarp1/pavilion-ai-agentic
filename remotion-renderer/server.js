/**
 * Pavilion Remotion Render Server
 * All compositions rendered via Remotion/Chromium for pixel-perfect preview match.
 * Speed tuning: full CPU concurrency + JPEG frame capture.
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

// ── Internal static server for the pre-bundled Remotion app ──────────────────
const staticApp = express();
staticApp.use(express.static(BUNDLE_DIR));
http.createServer(staticApp).listen(BUNDLE_INTERNAL_PORT, '127.0.0.1', () => {
  console.log(`Bundle served at ${BUNDLE_URL}`);
});

// ── Render API ────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/',       (_req, res) => res.json({ service: 'Pavilion Remotion Renderer', version: '2.1.0', status: 'ok' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', bundle: BUNDLE_URL, chrome: CHROME_EXEC, cpus: os.cpus().length }));

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
  const tmpOutput = path.join(os.tmpdir(), `render_${label}.mp4`);
  const blobPath  = outputGcsPath || `videos/render_${label}.mp4`;
  const cpuCount  = os.cpus().length;

  try {
    console.log(`[${label}] Selecting composition: ${compositionId} (concurrency=${cpuCount})`);
    const composition = await selectComposition({
      serveUrl:        BUNDLE_URL,
      id:              compositionId,
      inputProps:      props,
      browserExecutable: CHROME_EXEC,
    });

    console.log(`[${label}] Rendering ${composition.durationInFrames} frames @ ${composition.fps}fps ...`);
    await renderMedia({
      composition,
      serveUrl:          BUNDLE_URL,
      codec:             'h264',
      outputLocation:    tmpOutput,
      inputProps:        props,
      browserExecutable: CHROME_EXEC,
      chromiumOptions:   { disableWebSecurity: true },
      // Use all available CPUs for parallel frame rendering
      concurrency:       cpuCount,
      // JPEG is ~2-3× faster to capture than PNG with minimal visual difference
      imageFormat:       'jpeg',
      jpegQuality:       90,
    });

    console.log(`[${label}] Uploading to gs://${gcsBucket}/${blobPath}`);
    const storage = new Storage();
    await storage.bucket(gcsBucket).upload(tmpOutput, {
      destination: blobPath,
      metadata:    { contentType: 'video/mp4' },
    });

    // Generate signed URL (works with uniform bucket-level access)
    const gcsFile = storage.bucket(gcsBucket).file(blobPath);
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

    console.log(`[${label}] Done → ${videoUrl}`);
    return res.json({ success: true, videoUrl, jobId });

  } catch (err) {
    console.error(`[${label}] Render failed:`, err.message);
    return res.status(500).json({ error: err.message, jobId });
  } finally {
    try { if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput); } catch {}
  }
});

app.listen(API_PORT, '0.0.0.0', () => {
  console.log(`Remotion render API listening on :${API_PORT}`);
});
