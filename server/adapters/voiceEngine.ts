import { GoogleGenAI } from '@google/genai';

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
  voiceName?: string;
  voiceType: 'cloned' | 'library' | 'designed';
  sampleFilePath?: string;
  controls: {
    stability?: number;
    similarity?: number;
    speed?: number;
    pitch?: number;
    styleIntensity?: number;
    emotion?: string;
    pauseControl?: string;
    pronunciationNote?: string;
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

function getConfiguredGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim() || '';
  if (!key || key === 'MY_GEMINI_API_KEY') return '';
  return key;
}

function resolvePrebuiltVoice(voiceId: string): string {
  switch (voiceId) {
    case 'lib_dhaka_narrator_male':
      return 'Charon';
    case 'lib_dhaka_story_female':
      return 'Kore';
    case 'lib_bangla_news_anchor':
      return 'Fenrir';
    case 'lib_english_studio_host':
      return 'Zephyr';
    case 'lib_deep_trailer_voice':
      return 'Puck';
    default:
      return 'Kore';
  }
}

function getConfiguredEndpointUrl(raw?: string): string {
  const val = raw?.trim() || '';
  if (!val || val.startsWith('MY_') || val.includes('your-') || !isSafeEndpointUrl(val)) {
    return '';
  }
  return val;
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
    const selfHostedUrl = getConfiguredEndpointUrl(process.env.VOICE_ENGINE_URL);
    const selfHostedKey = process.env.VOICE_ENGINE_API_KEY?.trim() || '';
    const externalUrl = getConfiguredEndpointUrl(process.env.EXTERNAL_TTS_ENDPOINT);
    const externalKey = process.env.EXTERNAL_TTS_API_KEY?.trim() || '';
    const hasGemini = Boolean(getConfiguredGeminiKey());

    const selfHostedStatus = selfHostedUrl ? await pingEndpoint(selfHostedUrl, selfHostedKey) : 'not_configured';
    const externalStatus = externalUrl ? await pingEndpoint(externalUrl, externalKey) : 'not_configured';

    return [
      {
        id: 'gemini_tts_adapter',
        name: 'Built-In Cloud TTS Adapter (Library & Voice Design)',
        providerType: 'external_rest',
        status: hasGemini ? 'connected' : 'not_configured',
        capabilities: ['tts', 'voice_design'],
        supportsBangla: true,
        supportsBangladeshiAccent: true,
        supportsCloning: false,
        supportsEmotion: true,
        supportsControls: {
          stability: false,
          similarity: false,
          speed: true,
          pitch: false,
          styleIntensity: true,
          emotion: true,
        },
        notes: hasGemini
          ? 'Active via server-side GEMINI_API_KEY for Library and Voice Design synthesis. Custom cloned voices still require VOICE_ENGINE_URL.'
          : 'Optional server-side GEMINI_API_KEY unlocks built-in Library & Voice Design TTS.',
        lastCheckedAt: now,
      },
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
    const selfHostedUrl = getConfiguredEndpointUrl(process.env.VOICE_ENGINE_URL);
    const selfHostedKey = process.env.VOICE_ENGINE_API_KEY?.trim() || '';

    if (!selfHostedUrl) {
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
    const selfHostedUrl = getConfiguredEndpointUrl(process.env.VOICE_ENGINE_URL);
    const selfHostedKey = process.env.VOICE_ENGINE_API_KEY?.trim() || '';
    const externalUrl = getConfiguredEndpointUrl(process.env.EXTERNAL_TTS_ENDPOINT);
    const externalKey = process.env.EXTERNAL_TTS_API_KEY?.trim() || '';
    const geminiKey = getConfiguredGeminiKey();

    // Cloned voices must strictly route to the user's self-hosted GPU worker — never fake voice cloning
    if (req.voiceType === 'cloned' && !selfHostedUrl) {
      return {
        connected: false,
        status: 'engine_not_connected',
        adapterId: 'self_hosted_fastapi_worker',
        message:
          'Custom cloned-voice synthesis requires a connected self-hosted GPU worker (VOICE_ENGINE_URL). Select a Library voice or connect your GPU worker. Zero credits were deducted.',
      };
    }

    const activeUrl = selfHostedUrl || externalUrl || '';
    const activeKey = activeUrl === selfHostedUrl ? selfHostedKey : externalKey;
    const adapterId = activeUrl === selfHostedUrl ? 'self_hosted_fastapi_worker' : 'external_rest_adapter';

    if (activeUrl) {
      const reachable = await pingEndpoint(activeUrl, activeKey);
      if (reachable === 'connected') {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
          const cleanBase = activeUrl.replace(/\/+$/, '');
          const res = await fetch(`${cleanBase}/v1/tts`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(activeKey ? { Authorization: `Bearer ${activeKey}` } : {}),
            },
            body: JSON.stringify(req),
            signal: controller.signal,
          });

          if (res.ok) {
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
          }

          if (req.voiceType === 'cloned' || !geminiKey) {
            return {
              connected: true,
              status: 'failed',
              adapterId,
              message: `AI TTS engine returned HTTP ${res.status}. Zero credits were deducted.`,
            };
          }
        } catch {
          if (req.voiceType === 'cloned' || !geminiKey) {
            return {
              connected: false,
              status: 'engine_not_connected',
              adapterId,
              message: 'Unable to reach configured AI TTS engine. Verify GPU worker health. Zero credits were deducted.',
            };
          }
        } finally {
          clearTimeout(timeout);
        }
      } else if (req.voiceType === 'cloned' || !geminiKey) {
        return {
          connected: false,
          status: 'engine_not_connected',
          adapterId,
          message:
            req.voiceType === 'cloned'
              ? 'Custom cloned-voice synthesis requires an online self-hosted GPU worker (VOICE_ENGINE_URL). Select a Library voice to synthesize now, or start your GPU worker. Zero credits were deducted.'
              : 'Configured external AI TTS endpoint is currently unreachable. Zero credits were deducted.',
        };
      }
    }

    // Built-in Cloud TTS Adapter for Library & Voice Design voices when GEMINI_API_KEY is configured
    if (geminiKey) {
      const wrapRawPcmAsWav = (pcmBuffer: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer => {
        const byteRate = (sampleRate * channels * bitsPerSample) / 8;
        const blockAlign = (channels * bitsPerSample) / 8;
        const header = Buffer.alloc(44);
        header.write('RIFF', 0);
        header.writeUInt32LE(36 + pcmBuffer.length, 4);
        header.write('WAVE', 8);
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20);
        header.writeUInt16LE(channels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(byteRate, 28);
        header.writeUInt16LE(blockAlign, 32);
        header.writeUInt16LE(bitsPerSample, 34);
        header.write('data', 36);
        header.writeUInt32LE(pcmBuffer.length, 40);
        return Buffer.concat([header, pcmBuffer]);
      };

      const langHint =
        req.language === 'bn-BD'
          ? 'Natural Bangladeshi Bengali (Dhaka) pronunciation and cadence'
          : req.language === 'en-US'
          ? 'Clear natural English pronunciation'
          : 'Natural multilingual pronunciation';
      const emotion = req.controls.emotion || 'Storytelling';
      const speedDesc =
        typeof req.controls.speed === 'number' && req.controls.speed < 0.9
          ? 'slow deliberate pacing'
          : typeof req.controls.speed === 'number' && req.controls.speed > 1.15
          ? 'brisk energetic pacing'
          : 'natural balanced pacing';
      const cadence = req.controls.pauseControl ? `, ${req.controls.pauseControl} pauses` : '';
      const phonetic = req.controls.pronunciationNote ? `. Pronunciation guidance: ${req.controls.pronunciationNote}` : '';
      const stylePrompt = `${emotion}, ${langHint}, ${speedDesc}${cadence}${phonetic}`;

      const callGeminiTts = async (modelName: string, includeMetadata: boolean) => {
        const ai = new GoogleGenAI({
          apiKey: geminiKey,
          apiVersion: 'v1beta',
          httpOptions: {
            timeout: 60000,
            headers: { 'User-Agent': 'aistudio-build' },
          },
        });
        return ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                includeMetadata
                  ? {
                      text: req.text,
                      speechMetadata: {
                        style: stylePrompt,
                      },
                    }
                  : { text: req.text },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: resolvePrebuiltVoice(req.voiceId),
                },
              },
            },
          },
        });
      };

      const synthesizeWithFallback = async (modelName: string) => {
        try {
          return await callGeminiTts(modelName, true);
        } catch (metaErr) {
          const msg = metaErr instanceof Error ? metaErr.message : String(metaErr);
          if (msg.includes('speechMetadata')) {
            return await callGeminiTts(modelName, false);
          }
          throw metaErr;
        }
      };

      try {
        const primaryModel = req.voiceType === 'designed' ? 'gemini-3.8-flash-tts' : 'gemini-3.8-flash-lite-tts';
        let response;
        try {
          response = await synthesizeWithFallback(primaryModel);
        } catch (primaryErr) {
          if (primaryModel !== 'gemini-3.8-flash-lite-tts') {
            response = await synthesizeWithFallback('gemini-3.8-flash-lite-tts');
          } else {
            throw primaryErr;
          }
        }

        const audioPart = response.candidates?.[0]?.content?.parts?.find((part) => Boolean(part.inlineData?.data));
        const base64Audio = audioPart?.inlineData?.data;
        if (!base64Audio) {
          return {
            connected: true,
            status: 'failed',
            adapterId: 'gemini_tts_adapter',
            message: 'Cloud TTS adapter returned no audio payload. Zero credits were deducted.',
          };
        }

        const rawBuffer = Buffer.from(base64Audio, 'base64');
        const hasRiffHeader = rawBuffer.length >= 4 && rawBuffer.subarray(0, 4).toString('ascii') === 'RIFF';
        const wavBuffer = hasRiffHeader ? rawBuffer : wrapRawPcmAsWav(rawBuffer);

        return {
          connected: true,
          status: 'completed',
          adapterId: 'gemini_tts_adapter',
          message: 'Speech synthesized via Cloud TTS adapter.',
          audioBuffer: wavBuffer,
          outputMimeType: 'audio/wav',
        };
      } catch (err) {
        let errMsg = err instanceof Error ? err.message : 'Cloud TTS synthesis error';
        try {
          const parsed = JSON.parse(errMsg) as { error?: { message?: string; status?: string } };
          if (parsed?.error?.message) {
            errMsg = parsed.error.message;
          }
        } catch {
          // Keep plain message
        }
        console.error('Gemini TTS synthesis error:', errMsg);
        return {
          connected: true,
          status: 'failed',
          adapterId: 'gemini_tts_adapter',
          message: `Cloud TTS synthesis failed: ${errMsg}. Zero credits were deducted.`,
        };
      }
    }

    return {
      connected: false,
      status: 'engine_not_connected',
      adapterId: 'none',
      message:
        'AI Text-to-Speech engine is not connected yet. Configure VOICE_ENGINE_URL (FastAPI GPU Worker), EXTERNAL_TTS_ENDPOINT, or GEMINI_API_KEY in server secrets. Zero credits were deducted.',
    };
  }
}

export const voiceEngineManager = new VoiceEngineManager();
