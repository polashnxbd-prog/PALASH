import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { voiceEngineManager } from './server/adapters/voiceEngine.ts';
import { type AuthRequest, requireAdmin, requireAuth } from './server/middleware/auth.ts';
import { jobQueue, scheduleTempCleanup } from './server/queue/jobQueue.ts';
import { inspectAudioSample } from './server/utils/audioValidation.ts';

dotenv.config();

const PORT = 3000;
const STORAGE_ROOT = path.resolve(process.cwd(), 'storage');
const SAMPLES_DIR = path.resolve(STORAGE_ROOT, 'samples');
const TEMP_DIR = path.resolve(STORAGE_ROOT, 'temp');
const GENERATED_DIR = path.resolve(STORAGE_ROOT, 'generated');

for (const dir of [STORAGE_ROOT, SAMPLES_DIR, TEMP_DIR, GENERATED_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const retentionHours = Number(process.env.TEMP_FILE_RETENTION_HOURS || '24');
scheduleTempCleanup(TEMP_DIR, Number.isFinite(retentionHours) ? retentionHours : 24);

const maxUploadMb = Number(process.env.MAX_AUDIO_UPLOAD_MB || '25');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (Number.isFinite(maxUploadMb) ? maxUploadMb : 25) * 1024 * 1024,
  },
});

// In-memory index mapping sampleId -> { ownerId, filePath, mimeType, fileName }
// Plus disk persistence manifest so server restarts preserve ownership cleanly
interface SampleAssetRecord {
  sampleId: string;
  ownerId: string;
  filePath: string;
  mimeType: string;
  fileName: string;
  createdAt: string;
}

const MANIFEST_PATH = path.resolve(STORAGE_ROOT, 'samples_manifest.json');
const sampleRegistry = new Map<string, SampleAssetRecord>();

function loadSampleManifest() {
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as SampleAssetRecord[];
      for (const item of raw) {
        sampleRegistry.set(item.sampleId, item);
      }
    }
  } catch {
    // Ignore malformed manifest on cold start
  }
}

function saveSampleManifest() {
  try {
    const data = Array.from(sampleRegistry.values());
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(data, null, 2));
  } catch {
    // Non-fatal persistence error
  }
}

loadSampleManifest();

function isValidSafeId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

function resolveConfinedPath(baseDir: string, ...segments: string[]): string | null {
  const resolved = path.resolve(baseDir, ...segments);
  if (!resolved.startsWith(baseDir + path.sep)) {
    return null;
  }
  return resolved;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));

  // --- Public & Health Routes ---
  app.get('/api/v1/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'VoiceLab AI Studio API',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/v1/engines/status', async (_req, res) => {
    try {
      const adapters = await voiceEngineManager.getAdaptersStatus();
      const anyConnected = adapters.some((a) => a.status === 'connected');
      res.json({
        anyConnected,
        adapters,
        queue: jobQueue.getQueueMetrics(),
      });
    } catch (err) {
      console.error('Engines status error:', err);
      res.status(500).json({ error: 'Unable to inspect voice engine adapters.' });
    }
  });

  // OpenAPI 3.0 Specification for future-ready Developer API
  app.get('/api/v1/openapi.json', (_req, res) => {
    res.json({
      openapi: '3.0.3',
      info: {
        title: 'VoiceLab AI Studio Developer API',
        version: '1.0.0',
        description: 'Modular AI Voice Generation & Unlimited Free Voice Cloning API supporting Bangladeshi Bengali and English.',
      },
      paths: {
        '/api/v1/health': { get: { summary: 'API health check', responses: { '200': { description: 'OK' } } } },
        '/api/v1/engines/status': { get: { summary: 'Get AI voice engine adapter status', responses: { '200': { description: 'Adapter statuses' } } } },
        '/api/v1/voice-clone': {
          post: {
            summary: 'Upload or record a voice sample and create a free voice clone job (0 credits)',
            security: [{ bearerAuth: [] }],
            responses: { '201': { description: 'Voice sample validated and cloning job created' } },
          },
        },
        '/api/v1/tts': {
          post: {
            summary: 'Synthesize speech from text using a configured AI TTS adapter',
            security: [{ bearerAuth: [] }],
            responses: {
              '200': { description: 'Audio generated' },
              '503': { description: 'AI TTS engine not connected yet' },
            },
          },
        },
        '/api/v1/jobs/{jobId}': {
          get: {
            summary: 'Poll background job status',
            security: [{ bearerAuth: [] }],
            responses: { '200': { description: 'Job status' } },
          },
        },
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'Firebase ID Token' },
        },
      },
    });
  });

  // --- Authenticated Routes ---

  // Unlimited Free Voice Cloning: Upload & Validate Audio Sample (0 Credits Always)
  app.post('/api/v1/voice-clone', requireAuth, upload.single('audio'), async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      if (!isValidSafeId(uid)) {
        return res.status(400).json({ error: 'Invalid user identifier.' });
      }

      const fairUse = jobQueue.checkFairUseRateLimit(uid, 20);
      if (!fairUse.allowed) {
        return res.status(429).json({
          error: `Fair-use rate limit reached to protect shared workers. Please wait ${fairUse.retryAfterSec}s.`,
        });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'Please upload or record an audio sample file.' });
      }

      const consentConfirmed = req.body.consentConfirmed === 'true' || req.body.consentConfirmed === true;
      if (!consentConfirmed) {
        return res.status(400).json({
          error: 'Voice ownership or explicit speaker authorization consent is required before cloning.',
        });
      }

      const voiceName = String(req.body.voiceName || '').trim().slice(0, 100);
      const language = String(req.body.language || 'bn-BD').trim();
      const clientDuration = req.body.durationSec ? Number(req.body.durationSec) : undefined;

      if (!voiceName) {
        return res.status(400).json({ error: 'Please provide a name for this voice profile.' });
      }

      const inspection = inspectAudioSample(file.buffer, file.originalname, file.mimetype, clientDuration);
      if (!inspection.valid) {
        return res.status(400).json({ error: inspection.error, inspection });
      }

      const sampleId = `smp_${crypto.randomBytes(10).toString('hex')}`;
      const voiceId = `vc_${crypto.randomBytes(10).toString('hex')}`;
      const ext = inspection.format === 'unknown' ? '.bin' : `.${inspection.format}`;

      const userDir = resolveConfinedPath(SAMPLES_DIR, uid);
      if (!userDir) {
        return res.status(400).json({ error: 'Invalid storage path.' });
      }
      fs.mkdirSync(userDir, { recursive: true });

      const samplePath = resolveConfinedPath(userDir, `${sampleId}${ext}`);
      if (!samplePath) {
        return res.status(400).json({ error: 'Invalid sample path.' });
      }

      fs.writeFileSync(samplePath, file.buffer);

      sampleRegistry.set(sampleId, {
        sampleId,
        ownerId: uid,
        filePath: samplePath,
        mimeType: file.mimetype || `audio/${inspection.format}`,
        fileName: file.originalname || `recording${ext}`,
        createdAt: new Date().toISOString(),
      });
      saveSampleManifest();

      // Forward to modular AI Engine Adapter (no credit deduction!)
      const engineResult = await voiceEngineManager.submitCloneJob({
        voiceId,
        voiceName,
        language,
        sampleFilePath: samplePath,
        mimeType: file.mimetype || `audio/${inspection.format}`,
      });

      const job = jobQueue.createJob({
        id: `job_${crypto.randomBytes(8).toString('hex')}`,
        ownerId: uid,
        type: 'voice_clone',
        title: `Clone Voice: ${voiceName}`,
        status: engineResult.status === 'completed' ? 'completed' : engineResult.status === 'failed' ? 'failed' : 'awaiting_engine',
        engineAdapterId: engineResult.adapterId,
        message: engineResult.message,
      });

      return res.status(201).json({
        voiceId,
        sampleId,
        creditsDeducted: 0,
        inspection,
        job,
        engineResult: {
          connected: engineResult.connected,
          status: engineResult.status,
          adapterId: engineResult.adapterId,
          message: engineResult.message,
        },
      });
    } catch (err) {
      console.error('Voice clone upload error:', err);
      return res.status(500).json({ error: 'Unable to process voice sample upload.' });
    }
  });

  // Private owner-only audio sample streaming
  app.get('/api/v1/samples/:sampleId/audio', requireAuth, (req: AuthRequest, res) => {
    const sampleId = String(req.params.sampleId || '');
    if (!isValidSafeId(sampleId)) {
      return res.status(400).json({ error: 'Invalid sample ID.' });
    }

    const record = sampleRegistry.get(sampleId);
    if (!record) {
      return res.status(404).json({ error: 'Voice sample not found.' });
    }

    if (record.ownerId !== req.user!.uid && !req.user!.isAdmin) {
      return res.status(403).json({ error: 'You do not have permission to access this private voice sample.' });
    }

    const safePath = resolveConfinedPath(SAMPLES_DIR, path.relative(SAMPLES_DIR, record.filePath));
    if (!safePath || !fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'Audio sample file no longer exists on storage.' });
    }

    res.setHeader('Content-Type', record.mimeType || 'audio/wav');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.sendFile(safePath);
  });

  // Delete voice sample file from server storage when user deletes a voice clone
  app.delete('/api/v1/samples/:sampleId', requireAuth, (req: AuthRequest, res) => {
    const sampleId = String(req.params.sampleId || '');
    if (!isValidSafeId(sampleId)) {
      return res.status(400).json({ error: 'Invalid sample ID.' });
    }

    const record = sampleRegistry.get(sampleId);
    if (!record) {
      return res.json({ deleted: true, note: 'Sample already removed from storage.' });
    }

    if (record.ownerId !== req.user!.uid && !req.user!.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized deletion attempt.' });
    }

    const safePath = resolveConfinedPath(SAMPLES_DIR, path.relative(SAMPLES_DIR, record.filePath));
    if (safePath && fs.existsSync(safePath)) {
      fs.unlinkSync(safePath);
    }
    sampleRegistry.delete(sampleId);
    saveSampleManifest();

    return res.json({ deleted: true, sampleId });
  });

  // Text-to-Speech synthesis endpoint (honest engine routing)
  app.post('/api/v1/tts', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      if (!isValidSafeId(uid)) {
        return res.status(400).json({ error: 'Invalid user identifier.' });
      }
      const { text, language, voiceId, voiceName, voiceType, controls, idempotencyKey } = req.body || {};

      if (typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({ error: 'Please enter text to synthesize.' });
      }
      if (text.length > 10000) {
        return res.status(400).json({ error: 'Text exceeds maximum 10,000 characters per job.' });
      }

      const existingJob = jobQueue.findByIdempotency(uid, typeof idempotencyKey === 'string' ? idempotencyKey : undefined);
      if (existingJob && existingJob.audioUrl) {
        return res.status(200).json({
          deduplicated: true,
          connected: true,
          status: existingJob.status,
          audioId: existingJob.audioId,
          audioUrl: existingJob.audioUrl,
          job: existingJob,
        });
      }

      const sampleRecord = typeof voiceId === 'string' ? Array.from(sampleRegistry.values()).find((s) => s.sampleId === voiceId) : undefined;
      const result = await voiceEngineManager.synthesizeSpeech({
        text: text.trim(),
        language: String(language || 'bn-BD'),
        voiceId: String(voiceId || 'default'),
        voiceName: typeof voiceName === 'string' ? voiceName : undefined,
        voiceType: voiceType === 'cloned' || voiceType === 'designed' ? voiceType : 'library',
        sampleFilePath: sampleRecord?.filePath,
        controls: controls && typeof controls === 'object' ? controls : {},
      });

      if (!result.connected || !result.audioBuffer) {
        const job = jobQueue.createJob({
          id: `tts_${crypto.randomBytes(8).toString('hex')}`,
          ownerId: uid,
          type: 'tts',
          title: `TTS (${String(language || 'bn-BD')}): ${text.trim().slice(0, 42)}`,
          status: result.status === 'failed' ? 'failed' : 'awaiting_engine',
          engineAdapterId: result.adapterId,
          idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
          message: result.message,
        });

        return res.status(result.connected ? 502 : 503).json({
          connected: result.connected,
          status: result.status,
          error: result.message,
          creditsDeducted: 0,
          job,
        });
      }

      const audioId = `aud_${crypto.randomBytes(10).toString('hex')}`;
      const userGenDir = resolveConfinedPath(GENERATED_DIR, uid);
      if (!userGenDir) {
        return res.status(400).json({ error: 'Invalid generated audio path.' });
      }
      fs.mkdirSync(userGenDir, { recursive: true });
      const outPath = resolveConfinedPath(userGenDir, `${audioId}.wav`);
      if (!outPath) {
        return res.status(400).json({ error: 'Invalid output file path.' });
      }
      fs.writeFileSync(outPath, result.audioBuffer);

      const audioUrl = `/api/v1/audio/${audioId}`;
      const job = jobQueue.createJob({
        id: `tts_${crypto.randomBytes(8).toString('hex')}`,
        ownerId: uid,
        type: 'tts',
        title: `TTS (${String(language || 'bn-BD')}): ${text.trim().slice(0, 42)}`,
        status: 'completed',
        engineAdapterId: result.adapterId,
        idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
        message: result.message,
        audioId,
        audioUrl,
      });

      return res.status(200).json({
        connected: true,
        status: 'completed',
        audioId,
        audioUrl,
        job,
      });
    } catch (err) {
      console.error('TTS synthesis route error:', err);
      return res.status(500).json({
        connected: false,
        status: 'failed',
        error: 'Unable to process speech synthesis request right now. Zero credits were deducted.',
        creditsDeducted: 0,
      });
    }
  });

  // Serve generated audio strictly to owner
  app.get('/api/v1/audio/:audioId', requireAuth, (req: AuthRequest, res) => {
    const audioId = String(req.params.audioId || '');
    if (!isValidSafeId(audioId)) {
      return res.status(400).json({ error: 'Invalid audio ID.' });
    }
    const audioPath = resolveConfinedPath(GENERATED_DIR, req.user!.uid, `${audioId}.wav`);
    if (!audioPath || !fs.existsSync(audioPath)) {
      return res.status(404).json({ error: 'Generated audio file not found.' });
    }
    res.setHeader('Content-Type', 'audio/wav');
    return res.sendFile(audioPath);
  });

  // Jobs endpoints
  app.get('/api/v1/jobs', requireAuth, (req: AuthRequest, res) => {
    return res.json({ jobs: jobQueue.listUserJobs(req.user!.uid) });
  });

  app.get('/api/v1/jobs/:jobId', requireAuth, (req: AuthRequest, res) => {
    const job = jobQueue.getJob(String(req.params.jobId || ''));
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    if (job.ownerId !== req.user!.uid && !req.user!.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized job access.' });
    }
    return res.json({ job });
  });

  // Admin infrastructure metrics & engine health test
  app.get('/api/v1/admin/metrics', requireAuth, requireAdmin, async (_req, res) => {
    try {
      const adapters = await voiceEngineManager.getAdaptersStatus();
      let totalSampleBytes = 0;
      for (const item of sampleRegistry.values()) {
        try {
          if (fs.existsSync(item.filePath)) {
            totalSampleBytes += fs.statSync(item.filePath).size;
          }
        } catch {
          // Skip unreadable file
        }
      }

      res.json({
        queue: jobQueue.getQueueMetrics(),
        storage: {
          storedSamplesCount: sampleRegistry.size,
          totalSampleMb: Number((totalSampleBytes / (1024 * 1024)).toFixed(2)),
        },
        adapters,
      });
    } catch (err) {
      console.error('Admin metrics error:', err);
      res.status(500).json({ error: 'Failed to collect engine metrics.' });
    }
  });

  // Explicit API 404 JSON boundary so unmatched /api/* never falls through to Vite HTML
  app.use('/api', (_req, res) => {
    return res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Express JSON error boundary (catches malformed JSON bodies, Multer upload errors, etc.)
  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }
    if (req.path.startsWith('/api')) {
      const status =
        typeof (err as { status?: number })?.status === 'number'
          ? (err as { status: number }).status
          : (err as { code?: string })?.code === 'LIMIT_FILE_SIZE'
          ? 413
          : 500;
      const message =
        (err as { code?: string })?.code === 'LIMIT_FILE_SIZE'
          ? `Audio file exceeds maximum ${maxUploadMb} MB limit.`
          : err instanceof Error
          ? err.message
          : 'Internal server error.';
      return res.status(status).json({ error: message });
    }
    return next(err);
  });

  // Vite dev middleware or static production build
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VoiceLab AI Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection in VoiceLab server:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception in VoiceLab server:', err);
});

startServer().catch((err) => {
  console.error('Failed to start VoiceLab AI Studio server:', err);
  process.exit(1);
});
