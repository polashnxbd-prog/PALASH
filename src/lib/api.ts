import type { AudioInspectionResult, BackgroundJob, EngineAdapterStatus } from '../types/voicelab';

const WARMUP_RETRY_DELAYS_MS = [1500, 2500, 3500];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isTransientHtmlProxyResponse(res: Response): Promise<boolean> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    return true;
  }
  if (res.status === 502 || res.status === 504) {
    return true;
  }
  try {
    const cloned = res.clone();
    const preview = (await cloned.text()).trimStart();
    return preview.startsWith('<');
  } catch {
    return false;
  }
}

async function fetchWithWarmupRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= WARMUP_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(input, init);
      const transientHtml = await isTransientHtmlProxyResponse(res);
      if (!transientHtml || attempt === WARMUP_RETRY_DELAYS_MS.length) {
        return res;
      }
    } catch (err) {
      lastError = err;
      if (attempt === WARMUP_RETRY_DELAYS_MS.length) {
        throw err;
      }
    }
    await delay(WARMUP_RETRY_DELAYS_MS[attempt]);
  }
  throw lastError instanceof Error ? lastError : new Error('Voice server is temporarily unreachable.');
}

async function parseJsonSafe<T>(res: Response, fallbackError: string): Promise<T> {
  const raw = await res.text();
  const trimmed = raw.trim();
  if (!trimmed) {
    if (!res.ok) {
      throw new Error(fallbackError);
    }
    return {} as T;
  }

  if (trimmed.startsWith('<')) {
    throw new Error(
      'The voice server was restarting and did not finish booting in time (HTTP ' +
        res.status +
        '). Please wait a few seconds and try again.'
    );
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(fallbackError);
  }
}

export async function fetchEnginesStatus(): Promise<{
  anyConnected: boolean;
  adapters: EngineAdapterStatus[];
  queue: {
    totalJobs: number;
    activeWorkers: number;
    maxConcurrency: number;
    queued: number;
    awaitingEngine: number;
    completed: number;
    failed: number;
  };
}> {
  const res = await fetchWithWarmupRetry('/api/v1/engines/status');
  const data = await parseJsonSafe<{
    anyConnected: boolean;
    adapters: EngineAdapterStatus[];
    queue: {
      totalJobs: number;
      activeWorkers: number;
      maxConcurrency: number;
      queued: number;
      awaitingEngine: number;
      completed: number;
      failed: number;
    };
    error?: string;
  }>(res, 'Unable to fetch AI engine adapter status.');
  if (!res.ok) {
    throw new Error(data.error || 'Unable to fetch AI engine adapter status.');
  }
  return data;
}

export async function submitVoiceCloneSample(params: {
  token: string;
  file: File | Blob;
  fileName: string;
  voiceName: string;
  language: string;
  durationSec?: number;
  consentConfirmed: boolean;
}): Promise<{
  voiceId: string;
  sampleId: string;
  creditsDeducted: number;
  inspection: AudioInspectionResult;
  job: BackgroundJob;
  engineResult: {
    connected: boolean;
    status: string;
    adapterId: string;
    message: string;
  };
}> {
  const buildForm = () => {
    const form = new FormData();
    form.append('audio', params.file, params.fileName);
    form.append('voiceName', params.voiceName);
    form.append('language', params.language);
    form.append('consentConfirmed', String(params.consentConfirmed));
    if (typeof params.durationSec === 'number' && Number.isFinite(params.durationSec)) {
      form.append('durationSec', String(params.durationSec));
    }
    return form;
  };

  let res: Response | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt <= WARMUP_RETRY_DELAYS_MS.length; attempt++) {
    try {
      res = await fetch('/api/v1/voice-clone', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.token}`,
        },
        body: buildForm(),
      });
      const transient = await isTransientHtmlProxyResponse(res);
      if (!transient || attempt === WARMUP_RETRY_DELAYS_MS.length) {
        break;
      }
    } catch (err) {
      lastError = err;
      if (attempt === WARMUP_RETRY_DELAYS_MS.length) {
        throw err;
      }
    }
    await delay(WARMUP_RETRY_DELAYS_MS[attempt]);
  }
  if (!res) {
    throw lastError instanceof Error ? lastError : new Error('Voice cloning upload failed.');
  }

  const data = await parseJsonSafe<{
    voiceId: string;
    sampleId: string;
    creditsDeducted: number;
    inspection: AudioInspectionResult;
    job: BackgroundJob;
    engineResult: {
      connected: boolean;
      status: string;
      adapterId: string;
      message: string;
    };
    error?: string;
  }>(res!, 'Voice cloning upload failed.');
  if (!res!.ok) {
    throw new Error(data.error || 'Voice cloning upload failed.');
  }
  return data;
}

export async function deleteSampleAsset(token: string, sampleId: string): Promise<void> {
  const res = await fetchWithWarmupRetry(`/api/v1/samples/${encodeURIComponent(sampleId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const data = await parseJsonSafe<{ error?: string }>(
      res,
      'Failed to delete sample file from server storage.'
    ).catch(() => ({ error: undefined }));
    throw new Error(data.error || 'Failed to delete sample file from server storage.');
  }
}

export async function fetchAuthorizedAudioBlobUrl(token: string, url: string): Promise<string> {
  const res = await fetchWithWarmupRetry(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error('Audio sample is unavailable or access was denied.');
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html') || contentType.includes('application/json')) {
    throw new Error('Audio file is unavailable or server returned an unexpected response.');
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function submitTtsGeneration(params: {
  token: string;
  text: string;
  language: string;
  voiceId: string;
  voiceName?: string;
  voiceType: 'cloned' | 'library' | 'designed';
  controls: {
    stability: number;
    similarity: number;
    speed: number;
    pitch: number;
    styleIntensity: number;
    emotion: string;
    pauseControl?: string;
    pronunciationNote?: string;
  };
  idempotencyKey: string;
}): Promise<{
  connected: boolean;
  status: string;
  audioId?: string;
  audioUrl?: string;
  error?: string;
  job?: BackgroundJob;
}> {
  const res = await fetchWithWarmupRetry('/api/v1/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify({
      text: params.text,
      language: params.language,
      voiceId: params.voiceId,
      voiceName: params.voiceName,
      voiceType: params.voiceType,
      controls: params.controls,
      idempotencyKey: params.idempotencyKey,
    }),
  });
  const data = await parseJsonSafe<{
    connected?: boolean;
    status?: string;
    audioId?: string;
    audioUrl?: string;
    error?: string;
    job?: BackgroundJob;
  }>(res, 'Speech synthesis request failed.');
  if (!res.ok && res.status !== 503 && res.status !== 502) {
    throw new Error(data.error || `Speech synthesis failed (HTTP ${res.status}).`);
  }
  return {
    connected: res.ok && Boolean(data.connected),
    status: data.status || (res.ok ? 'completed' : 'engine_not_connected'),
    audioId: data.audioId,
    audioUrl: data.audioUrl,
    error: data.error,
    job: data.job,
  };
}

export async function fetchUserJobs(token: string): Promise<BackgroundJob[]> {
  const res = await fetchWithWarmupRetry('/api/v1/jobs', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await parseJsonSafe<{ jobs?: BackgroundJob[] }>(res, 'Unable to load jobs.').catch(
    () => ({ jobs: [] })
  );
  return data.jobs || [];
}

export interface AdminMetricsResponse {
  queue: {
    totalJobs: number;
    queued: number;
    awaitingEngine: number;
    completed: number;
    failed: number;
  };
  storage: {
    storedSamplesCount: number;
    totalSampleMb: number;
  };
  adapters: EngineAdapterStatus[];
}

export async function fetchAdminMetrics(token: string): Promise<AdminMetricsResponse> {
  const res = await fetchWithWarmupRetry('/api/v1/admin/metrics', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseJsonSafe<AdminMetricsResponse & { error?: string }>(
    res,
    'Unable to load admin infrastructure metrics.'
  );
  if (!res.ok) {
    throw new Error(data.error || 'Unable to load admin infrastructure metrics.');
  }
  return data;
}
