export type EngineCapability =
  | 'tts'
  | 'voice_cloning'
  | 'voice_design'
  | 'voice_conversion'
  | 'dubbing'
  | 'sound_effects'
  | 'speech_enhancement';

export interface EngineAdapterDescriptor {
  id: string;
  name: string;
  providerType: 'self_hosted_fastapi' | 'xtts_v2' | 'fish_speech' | 'f5_tts' | 'cosyvoice' | 'external_rest';
  status: 'connected' | 'not_configured' | 'unreachable' | 'disabled';
  capabilities: EngineCapability[];
  supportsBangla: boolean;
  supportsBangladeshiAccent: boolean;
  supportsCloning: boolean;
  supportsEmotion: boolean;
  supportsControls: {
    stability: boolean;
    similarity: boolean;
    speed: boolean;
    pitch: boolean;
    styleIntensity: boolean;
    emotion: boolean;
  };
  notes: string;
  lastCheckedAt: string;
}

export interface EngineSynthesisRequest {
  text: string;
  language: string;
  voiceId: string;
  voiceType: 'cloned' | 'library' | 'designed';
  sampleFilePath?: string;
  controls: {
    stability?: number;
    similarity?: number;
    speed?: number;
    pitch?: number;
    styleIntensity?: number;
    emotion?: string;
  };
}

export interface EngineCloneRequest {
  voiceId: string;
  voiceName: string;
  language: string;
  sampleFilePath: string;
  mimeType: string;
}

export interface EngineResult {
  connected: boolean;
  status: 'completed' | 'awaiting_engine' | 'engine_not_connected' | 'failed';
  adapterId: string;
  message: string;
  audioBuffer?: Buffer;
  outputMimeType?: string;
  durationSec?: number;
}

function isSafeEndpointUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    // Block cloud link-local metadata endpoints
    if (parsed.hostname === '169.254.169.254' || parsed.hostname.startsWith('169.254.')) return false;
    return true;
  } catch {
    return false;
  }
}

async function pingEndpoint(baseUrl: string, apiKey?: string): Promise<'connected' | 'unreachable'> {
  if (!isSafeEndpointUrl(baseUrl)) return 'unreachable';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanBase}/health`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: controller.signal,
    });
    return res.ok ? 'connected' : 'unreachable';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timeout);
  }
}

export class VoiceEngineManager {
  async getAdaptersStatus(): Promise<EngineAdapterDescriptor[]> {
    const now = new Date().toISOString();
    const selfHostedUrl = process.env.VOICE_ENGINE_URL?.trim() || '';
    const selfHostedKey = process.env.VOICE_ENGINE_API_KEY?.trim() || '';
    const externalUrl = process.env.EXTERNAL_TTS_ENDPOINT?.trim() || '';
    const externalKey = process.env.EXTERNAL_TTS_API_KEY?.trim() || '';

    const selfHostedStatus = selfHostedUrl ? await pingEndpoint(selfHostedUrl, selfHostedKey) : 'not_configured';
    const externalStatus = externalUrl ? await pingEndpoint(externalUrl, externalKey) : 'not_configured';

    return [
      {
        id: 'self_hosted_fastapi_worker',
        name: 'Self-Hosted FastAPI GPU Worker (Custom AI Voice Engine)',
        providerType: 'self_hosted_fastapi',
        status: selfHostedStatus,
        capabilities: ['tts', 'voice_cloning', 'voice_conversion', 'speech_enhancement'],
        supportsBangla: true,
        supportsBangladeshiAccent: true,
        supportsCloning: true,
        supportsEmotion: true,
        supportsControls: {
          stability: true,
          similarity: true,
          speed: true,
          pitch: true,
          styleIntensity: true,
          emotion: true,
        },
        notes: selfHostedUrl
          ? 'Configured via VOICE_ENGINE_URL environment variable.'
          : 'Set VOICE_ENGINE_URL in server secrets to connect your Python FastAPI GPU inference worker.',
        lastCheckedAt: now,
      },
      {
        id: 'fish_speech_bangla_adapter',
        name: 'Fish-Speech / CosyVoice Multilingual & Bangla Adapter',
        providerType: 'fish_speech',
        status: selfHostedStatus === 'connected' ? 'connected' : 'not_configured',
        capabilities: ['tts', 'voice_cloning', 'voice_design'],
        supportsBangla: true,
        supportsBangladeshiAccent: true,
        supportsCloning: true,
        supportsEmotion: true,
        supportsControls: {
          stability: true,
          similarity: true,
          speed: true,
          pitch: false,
          styleIntensity: true,
          emotion: true,
        },
        notes: 'Recommended open-weights adapter for Bangladeshi Bengali & English zero-shot cloning after fine-tuning.',
        lastCheckedAt: now,
      },
      {
        id: 'xtts_v2_adapter',
        name: 'Coqui XTTS-v2 Cloning Adapter',
        providerType: 'xtts_v2',
        status: 'not_configured',
        capabilities: ['tts', 'voice_cloning'],
        supportsBangla: false,
        supportsBangladeshiAccent: false,
        supportsCloning: true,
        supportsEmotion: true,
        supportsControls: {
          stability: true,
          similarity: true,
          speed: true,
          pitch: false,
          styleIntensity: false,
          emotion: true,
        },
        notes: 'English & 16-language baseline cloning. Requires custom Bangla tokenizer fine-tuning for Bengali.',
        lastCheckedAt: now,
      },
      {
        id: 'external_rest_adapter',
        name: 'External Commercial / Custom REST Adapter',
        providerType: 'external_rest',
        status: externalStatus,
        capabilities: ['tts', 'sound_effects', 'dubbing'],
        supportsBangla: true,
        supportsBangladeshiAccent: false,
        supportsCloning: false,
        supportsEmotion: true,
        supportsControls: {
          stability: true,
          similarity: false,
          speed: true,
          pitch: false,
          styleIntensity: false,
          emotion: true,
        },
        notes: externalUrl
          ? 'Configured via EXTERNAL_TTS_ENDPOINT environment variable.'
          : 'Optional fallback REST provider configured via EXTERNAL_TTS_ENDPOINT.',
        lastCheckedAt: now,
      },
    ];
  }

  async submitCloneJob(req: EngineCloneRequest): Promise<EngineResult> {
    const selfHostedUrl = process.env.VOICE_ENGINE_URL?.trim() || '';
    const selfHostedKey = process.env.VOICE_ENGINE_API_KEY?.trim() || '';

    if (!selfHostedUrl || !isSafeEndpointUrl(selfHostedUrl)) {
      return {
        connected: false,
        status: 'awaiting_engine',
        adapterId: 'self_hosted_fastapi_worker',
        message:
          'Voice sample validated and stored securely in your private vault. No self-hosted AI Voice Cloning worker (VOICE_ENGINE_URL) is connected yet, so neural speaker embedding awaits GPU worker connection.',
      };
    }

    try {
      const cleanBase = selfHostedUrl.replace(/\/+$/, '');
      const res = await fetch(`${cleanBase}/v1/voice-clone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(selfHostedKey ? { Authorization: `Bearer ${selfHostedKey}` } : {}),
        },
        body: JSON.stringify({
          voice_id: req.voiceId,
          voice_name: req.voiceName,
          language: req.language,
          sample_path: req.sampleFilePath,
          mime_type: req.mimeType,
        }),
      });

      if (!res.ok) {
        return {
          connected: true,
          status: 'failed',
          adapterId: 'self_hosted_fastapi_worker',
          message: `Voice cloning worker returned HTTP ${res.status}. Please check worker logs.`,
        };
      }

      return {
        connected: true,
        status: 'completed',
        adapterId: 'self_hosted_fastapi_worker',
        message: 'Voice profile cloned and speaker embedding indexed by GPU worker.',
      };
    } catch {
      return {
        connected: false,
        status: 'awaiting_engine',
        adapterId: 'self_hosted_fastapi_worker',
        message:
          'Configured GPU worker is currently unreachable. Sample is saved in My Voices and ready for retry when the worker comes online.',
      };
    }
  }

  async synthesizeSpeech(req: EngineSynthesisRequest): Promise<EngineResult> {
    const selfHostedUrl = process.env.VOICE_ENGINE_URL?.trim() || '';
    const selfHostedKey = process.env.VOICE_ENGINE_API_KEY?.trim() || '';
    const externalUrl = process.env.EXTERNAL_TTS_ENDPOINT?.trim() || '';
    const externalKey = process.env.EXTERNAL_TTS_API_KEY?.trim() || '';

    const activeUrl = selfHostedUrl && isSafeEndpointUrl(selfHostedUrl)
      ? selfHostedUrl
      : externalUrl && isSafeEndpointUrl(externalUrl)
      ? externalUrl
      : '';
    const activeKey = activeUrl === selfHostedUrl ? selfHostedKey : externalKey;
    const adapterId = activeUrl === selfHostedUrl ? 'self_hosted_fastapi_worker' : 'external_rest_adapter';

    if (!activeUrl) {
      return {
        connected: false,
        status: 'engine_not_connected',
        adapterId: 'none',
        message:
          'AI Text-to-Speech engine is not connected yet. Configure VOICE_ENGINE_URL (FastAPI GPU Worker) or EXTERNAL_TTS_ENDPOINT in server environment variables. No credits were deducted.',
      };
    }

    try {
      const cleanBase = activeUrl.replace(/\/+$/, '');
      const res = await fetch(`${cleanBase}/v1/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeKey ? { Authorization: `Bearer ${activeKey}` } : {}),
        },
        body: JSON.stringify(req),
      });

      if (!res.ok) {
        return {
          connected: true,
          status: 'failed',
          adapterId,
          message: `AI TTS engine returned HTTP ${res.status}. No credits were deducted.`,
        };
      }

      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);
      return {
        connected: true,
        status: 'completed',
        adapterId,
        message: 'Speech synthesized successfully.',
        audioBuffer,
        outputMimeType: res.headers.get('content-type') || 'audio/wav',
      };
    } catch {
      return {
        connected: false,
        status: 'engine_not_connected',
        adapterId,
        message: 'Unable to reach configured AI TTS engine. Verify GPU worker health. No credits were deducted.',
      };
    }
  }
}

export const voiceEngineManager = new VoiceEngineManager();
