import fs from 'fs';
import path from 'path';

export type JobStatus = 'uploading' | 'validating' | 'queued' | 'processing' | 'awaiting_engine' | 'completed' | 'failed';
export type JobType = 'voice_clone' | 'tts' | 'voice_design' | 'voice_changer' | 'dubbing' | 'podcast' | 'sound_fx' | 'speech_enhance';

export interface BackgroundJob {
  id: string;
  ownerId: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  idempotencyKey?: string;
  title: string;
  engineAdapterId?: string;
  message: string;
  createdAt: string;
  updatedAt: string;
  retries: number;
}

class InMemoryJobQueue {
  private jobs = new Map<string, BackgroundJob>();
  private idempotencyIndex = new Map<string, string>();
  private userRateWindow = new Map<string, number[]>();
  private maxConcurrent = 2;
  private activeCount = 0;

  checkFairUseRateLimit(userId: string, maxPerMinute = 15): { allowed: boolean; retryAfterSec?: number } {
    const now = Date.now();
    const windowStart = now - 60_000;
    const timestamps = (this.userRateWindow.get(userId) || []).filter((t) => t > windowStart);
    if (timestamps.length >= maxPerMinute) {
      const oldest = timestamps[0];
      return { allowed: false, retryAfterSec: Math.ceil((oldest + 60_000 - now) / 1000) };
    }
    timestamps.push(now);
    this.userRateWindow.set(userId, timestamps);
    return { allowed: true };
  }

  findByIdempotency(ownerId: string, key?: string): BackgroundJob | undefined {
    if (!key) return undefined;
    const jobId = this.idempotencyIndex.get(`${ownerId}:${key}`);
    return jobId ? this.jobs.get(jobId) : undefined;
  }

  createJob(params: {
    id: string;
    ownerId: string;
    type: JobType;
    title: string;
    status: JobStatus;
    message: string;
    idempotencyKey?: string;
    engineAdapterId?: string;
  }): BackgroundJob {
    const now = new Date().toISOString();
    const job: BackgroundJob = {
      id: params.id,
      ownerId: params.ownerId,
      type: params.type,
      status: params.status,
      progress: params.status === 'completed' ? 100 : params.status === 'awaiting_engine' ? 50 : 15,
      idempotencyKey: params.idempotencyKey,
      title: params.title,
      engineAdapterId: params.engineAdapterId,
      message: params.message,
      createdAt: now,
      updatedAt: now,
      retries: 0,
    };
    this.jobs.set(job.id, job);
    if (params.idempotencyKey) {
      this.idempotencyIndex.set(`${params.ownerId}:${params.idempotencyKey}`, job.id);
    }
    return job;
  }

  updateJob(jobId: string, patch: Partial<Pick<BackgroundJob, 'status' | 'progress' | 'message' | 'engineAdapterId' | 'retries'>>) {
    const existing = this.jobs.get(jobId);
    if (!existing) return;
    const updated: BackgroundJob = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, updated);
    return updated;
  }

  getJob(jobId: string): BackgroundJob | undefined {
    return this.jobs.get(jobId);
  }

  listUserJobs(ownerId: string): BackgroundJob[] {
    return Array.from(this.jobs.values())
      .filter((j) => j.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50);
  }

  getQueueMetrics() {
    const all = Array.from(this.jobs.values());
    return {
      totalJobs: all.length,
      activeWorkers: this.activeCount,
      maxConcurrency: this.maxConcurrent,
      queued: all.filter((j) => j.status === 'queued' || j.status === 'processing').length,
      awaitingEngine: all.filter((j) => j.status === 'awaiting_engine').length,
      completed: all.filter((j) => j.status === 'completed').length,
      failed: all.filter((j) => j.status === 'failed').length,
    };
  }
}

export const jobQueue = new InMemoryJobQueue();

export function scheduleTempCleanup(tempDir: string, retentionHours: number) {
  const maxAgeMs = Math.max(1, retentionHours) * 3600 * 1000;
  const runCleanup = () => {
    try {
      if (!fs.existsSync(tempDir)) return;
      const entries = fs.readdirSync(tempDir, { withFileTypes: true });
      const now = Date.now();
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const fullPath = path.resolve(tempDir, entry.name);
        if (!fullPath.startsWith(tempDir + path.sep)) continue;
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fullPath);
        }
      }
    } catch {
      // Non-fatal cleanup error
    }
  };
  setInterval(runCleanup, 30 * 60 * 1000).unref();
}
