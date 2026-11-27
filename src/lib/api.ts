import type { AudioInspectionResult, BackgroundJob, EngineAdapterStatus } from '../types/voicelab';

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
  const res = await fetch('/api/v1/engines/status');
  if (!res.ok) {
    throw new Error('Unable to fetch AI engine adapter status.');
  }
  return res.json();
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
  const form = new FormData();
  form.append('audio', params.file, params.fileName);
  form.append('voiceName', params.voiceName);
  form.append('language', params.language);
  form.append('consentConfirmed', String(params.consentConfirmed));
  if (typeof params.durationSec === 'number' && Number.isFinite(params.durationSec)) {
    form.append('durationSec', String(params.durationSec));
  }

  const res = await fetch('/api/v1/voice-clone', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.token}`,
    },
    body: form,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Voice cloning upload failed.');
  }
  return data;
}

export async function deleteSampleAsset(token: string, sampleId: string): Promise<void> {
  const res = await fetch(`/api/v1/samples/${encodeURIComponent(sampleId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete sample file from server storage.');
  }
}

export async function fetchAuthorizedAudioBlobUrl(token: string, url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error('Audio sample is unavailable or access was denied.');
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function submitTtsGeneration(params: {
  token: string;
  text: string;
  language: string;
  voiceId: string;
  voiceType: 'cloned' | 'library' | 'designed';
  controls: {
    stability: number;
    similarity: number;
    speed: number;
    pitch: number;
    styleIntensity: number;
    emotion: string;
  };
  idempotencyKey: string;
}): Promise<{
  connected: boolean;
  status: string;
  audioId?: string;
  audioUrl?: string;
  error?: string;
  job: BackgroundJob;
}> {
  const res = await fetch('/api/v1/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  return { ...data, connected: res.ok && Boolean(data.connected) };
}

export async function fetchUserJobs(token: string): Promise<BackgroundJob[]> {
  const res = await fetch('/api/v1/jobs', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.jobs || [];
}

export async function fetchAdminMetrics(token: string) {
  const res = await fetch('/api/v1/admin/metrics', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error('Unable to load admin infrastructure metrics.');
  }
  return res.json();
}
