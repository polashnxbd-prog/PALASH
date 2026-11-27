import { addDoc, collection, increment, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { Download, Loader2, Sliders, Upload } from 'lucide-react';
import React, { useState } from 'react';
import { AudioPlayer } from '../components/AudioPlayer';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { fetchAuthorizedAudioBlobUrl } from '../lib/api';
import { db } from '../lib/firebase';

function encodeWavFromAudioBuffer(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2;
  const out = new ArrayBuffer(44 + length);
  const view = new DataView(out);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, length, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}

export function AudioStudioPage() {
  const { firebaseUser, voiceProfiles, getIdToken } = useAuth();
  const { notify } = useToast();

  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [sourceDuration, setSourceDuration] = useState(0);

  // Real DSP Controls
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [fadeInSec, setFadeInSec] = useState(0.2);
  const [fadeOutSec, setFadeOutSec] = useState(0.3);
  const [gainDb, setGainDb] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [normalizePeak, setNormalizePeak] = useState(true);

  const [processing, setProcessing] = useState(false);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);

  const loadAudioBlob = async (blob: Blob, name: string) => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const arr = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arr);
      await ctx.close();

      setSourceBlob(blob);
      setSourceName(name);
      setSourceDuration(Number(decoded.duration.toFixed(2)));
      setTrimStart(0);
      setTrimEnd(Number(decoded.duration.toFixed(2)));
      setProcessedBlob(null);
      notify(`Loaded "${name}" into Audio Studio`, 'success');
    } catch {
      notify('Unable to decode audio file in browser Web Audio engine.', 'error');
    }
  };

  const loadFromClonedVoice = async (sampleId: string, name: string) => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const url = await fetchAuthorizedAudioBlobUrl(token, `/api/v1/samples/${sampleId}/audio`);
      const res = await fetch(url);
      const blob = await res.blob();
      URL.revokeObjectURL(url);
      await loadAudioBlob(blob, `${name}.wav`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load sample.', 'error');
    }
  };

  const renderProcessedAudio = async () => {
    if (!sourceBlob) return;
    setProcessing(true);
    try {
      const decodeCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const arr = await sourceBlob.arrayBuffer();
      const original = await decodeCtx.decodeAudioData(arr);
      await decodeCtx.close();

      const start = Math.max(0, Math.min(trimStart, original.duration - 0.1));
      const end = Math.max(start + 0.1, Math.min(trimEnd || original.duration, original.duration));
      const trimmedDur = end - start;
      const outputDur = Math.max(0.1, trimmedDur / speed);

      const offline = new OfflineAudioContext(
        original.numberOfChannels,
        Math.ceil(outputDur * original.sampleRate),
        original.sampleRate
      );

      const source = offline.createBufferSource();
      source.buffer = original;
      source.playbackRate.value = speed;

      const gainNode = offline.createGain();
      let linearGain = Math.pow(10, gainDb / 20);

      if (normalizePeak) {
        let maxPeak = 0;
        const startFrame = Math.floor(start * original.sampleRate);
        const endFrame = Math.min(original.length, Math.floor(end * original.sampleRate));
        for (let ch = 0; ch < original.numberOfChannels; ch++) {
          const data = original.getChannelData(ch);
          for (let i = startFrame; i < endFrame; i++) {
            const abs = Math.abs(data[i]);
            if (abs > maxPeak) maxPeak = abs;
          }
        }
        if (maxPeak > 0.001) {
          linearGain *= 0.891 / maxPeak; // Normalize peak to -1.0 dBFS
        }
      }

      gainNode.gain.setValueAtTime(fadeInSec > 0 ? 0.0001 : linearGain, 0);
      if (fadeInSec > 0) {
        gainNode.gain.linearRampToValueAtTime(linearGain, Math.min(outputDur * 0.45, fadeInSec));
      }
      if (fadeOutSec > 0) {
        const fadeOutStart = Math.max(0.05, outputDur - Math.min(outputDur * 0.45, fadeOutSec));
        gainNode.gain.setValueAtTime(linearGain, fadeOutStart);
        gainNode.gain.linearRampToValueAtTime(0.0001, outputDur);
      }

      source.connect(gainNode);
      gainNode.connect(offline.destination);
      source.start(0, start, trimmedDur);

      const rendered = await offline.startRendering();
      const wavBlob = encodeWavFromAudioBuffer(rendered);
      setProcessedBlob(wavBlob);

      if (firebaseUser) {
        await addDoc(collection(db, 'audioGenerations'), {
          ownerId: firebaseUser.uid,
          title: `Studio Mix: ${sourceName}`,
          tool: 'audio_studio',
          voiceName: sourceName,
          language: 'DSP Export',
          durationSec: Number(outputDur.toFixed(2)),
          creditsCost: 0,
          status: 'completed',
          isFavorite: false,
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }

      notify('Audio rendered to 16-bit WAV', 'success');
    } catch {
      notify('Failed to render audio adjustments.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const trackDownload = async () => {
    if (!firebaseUser) return;
    await updateDoc(doc(db, 'users', firebaseUser.uid), {
      totalDownloads: increment(1),
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Audio Studio (Web Audio DSP)
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Real browser-based trimming, fade in/out, loudness normalization, speed adjustment, and WAV export
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Source & Playback */}
        <div className="lg:col-span-8 space-y-5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>Load Audio File</span>
                <input
                  type="file"
                  accept="audio/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void loadAudioBlob(f, f.name);
                  }}
                />
              </label>

              {voiceProfiles.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const vp = voiceProfiles.find((v) => v.id === e.target.value);
                    if (vp) void loadFromClonedVoice(vp.sampleId, vp.name);
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs"
                >
                  <option value="" disabled>
                    Import from My Voices...
                  </option>
                  {voiceProfiles.map((vp) => (
                    <option key={vp.id} value={vp.id}>
                      {vp.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {sourceBlob ? (
              <AudioPlayer
                localBlob={sourceBlob}
                title={`Source: ${sourceName} (${sourceDuration}s)`}
                fileName={sourceName}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                Upload an audio track or import one of your cloned voice samples to begin mastering.
              </div>
            )}
          </div>

          {processedBlob && (
            <div className="rounded-xl border border-emerald-500/30 bg-white dark:bg-[#11151E] p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Mastered Export Ready (16-bit PCM WAV)
                </h3>
                <span className="text-xs font-mono text-emerald-500">
                  {(processedBlob.size / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>
              <AudioPlayer
                localBlob={processedBlob}
                title={`Mastered_${sourceName.replace(/\.[^/.]+$/, '')}.wav`}
                fileName={`Mastered_${sourceName.replace(/\.[^/.]+$/, '')}.wav`}
                onDownload={() => void trackDownload()}
              />
            </div>
          )}
        </div>

        {/* DSP Controls Panel */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              DSP Mastering Controls
            </h2>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Trim Start</span>
                <span className="font-mono tabular-nums">{trimStart.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0.5, sourceDuration - 0.2)}
                step={0.1}
                disabled={!sourceBlob}
                value={trimStart}
                onChange={(e) => setTrimStart(Math.min(Number(e.target.value), trimEnd - 0.2))}
                className="w-full accent-indigo-600"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Trim End</span>
                <span className="font-mono tabular-nums">{trimEnd.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={Math.max(0.5, sourceDuration)}
                step={0.1}
                disabled={!sourceBlob}
                value={trimEnd}
                onChange={(e) => setTrimEnd(Math.max(Number(e.target.value), trimStart + 0.2))}
                className="w-full accent-indigo-600"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Fade In</span>
                <span className="font-mono tabular-nums">{fadeInSec.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min={0}
                max={3}
                step={0.1}
                disabled={!sourceBlob}
                value={fadeInSec}
                onChange={(e) => setFadeInSec(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Fade Out</span>
                <span className="font-mono tabular-nums">{fadeOutSec.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min={0}
                max={3}
                step={0.1}
                disabled={!sourceBlob}
                value={fadeOutSec}
                onChange={(e) => setFadeOutSec(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Gain Adjustment</span>
                <span className="font-mono tabular-nums">
                  {gainDb > 0 ? `+${gainDb}` : gainDb} dB
                </span>
              </div>
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                disabled={!sourceBlob}
                value={gainDb}
                onChange={(e) => setGainDb(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Speed</span>
                <span className="font-mono tabular-nums">{speed.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.6}
                max={1.8}
                step={0.05}
                disabled={!sourceBlob}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 pt-1">
              <input
                type="checkbox"
                checked={normalizePeak}
                onChange={(e) => setNormalizePeak(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600"
              />
              <span>Normalize Peak Loudness (-1.0 dBFS)</span>
            </label>
          </div>

          <button
            type="button"
            onClick={renderProcessedAudio}
            disabled={!sourceBlob || processing}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
          >
            {processing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{processing ? 'Rendering WAV...' : 'Render & Preview WAV'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
