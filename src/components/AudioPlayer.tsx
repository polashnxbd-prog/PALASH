import { Download, Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchAuthorizedAudioBlobUrl } from '../lib/api';

interface AudioPlayerProps {
  src?: string;
  localBlob?: Blob | null;
  title?: string;
  fileName?: string;
  requiresAuth?: boolean;
  compact?: boolean;
  onDownload?: () => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioPlayer({
  src,
  localBlob,
  title,
  fileName = 'voicelab_audio.wav',
  requiresAuth = false,
  compact = false,
  onDownload,
}: AudioPlayerProps) {
  const { getIdToken } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    let active = true;
    let objectUrl = '';

    async function resolveSource() {
      setError(null);
      setPlaying(false);
      setCurrentTime(0);

      if (localBlob) {
        objectUrl = URL.createObjectURL(localBlob);
        if (active) {
          setResolvedUrl(objectUrl);
          void computeWaveform(localBlob);
        }
        return;
      }

      if (!src) {
        setResolvedUrl('');
        setPeaks([]);
        return;
      }

      if (!requiresAuth) {
        setResolvedUrl(src);
        return;
      }

      setLoadingAudio(true);
      try {
        const token = await getIdToken();
        if (!token) throw new Error('Sign in required to stream private audio.');
        objectUrl = await fetchAuthorizedAudioBlobUrl(token, src);
        if (active) {
          setResolvedUrl(objectUrl);
          const res = await fetch(objectUrl);
          const blob = await res.blob();
          void computeWaveform(blob);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Unable to load audio.');
        }
      } finally {
        if (active) setLoadingAudio(false);
      }
    }

    async function computeWaveform(blob: Blob) {
      try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const arr = await blob.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arr);
        const channel = decoded.getChannelData(0);
        const bars = 48;
        const blockSize = Math.max(1, Math.floor(channel.length / bars));
        const nextPeaks: number[] = [];
        for (let i = 0; i < bars; i++) {
          let max = 0;
          const start = i * blockSize;
          for (let j = 0; j < blockSize && start + j < channel.length; j += Math.max(1, Math.floor(blockSize / 64))) {
            const v = Math.abs(channel[start + j]);
            if (v > max) max = v;
          }
          nextPeaks.push(Math.max(0.12, Math.min(1, max)));
        }
        if (active) {
          setPeaks(nextPeaks);
          if (decoded.duration > 0) setDuration(decoded.duration);
        }
        await ctx.close();
      } catch {
        // Fallback neutral bars if codec decode isn't supported in browser AudioContext
        if (active) setPeaks(Array.from({ length: 48 }, (_, i) => 0.25 + ((i * 7) % 5) * 0.12));
      }
    }

    void resolveSource();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, localBlob, requiresAuth, getIdToken]);

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el || !resolvedUrl) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      try {
        await el.play();
        setPlaying(true);
      } catch {
        setError('Playback blocked or unsupported format.');
      }
    }
  };

  const handleSeek = (ratio: number) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    el.currentTime = ratio * duration;
    setCurrentTime(el.currentTime);
  };

  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 0.75];
    const next = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const handleDownload = () => {
    if (!resolvedUrl) return;
    const a = document.createElement('a');
    a.href = resolvedUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onDownload?.();
  };

  if (error) {
    return (
      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
        {error}
      </div>
    );
  }

  const progressRatio = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const displayBars = peaks.length > 0 ? peaks : Array.from({ length: 48 }, () => 0.2);

  return (
    <div
      className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] ${
        compact ? 'p-3' : 'p-4'
      } space-y-3`}
    >
      {resolvedUrl && (
        <audio
          ref={audioRef}
          src={resolvedUrl}
          muted={muted}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setDuration(d);
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onEnded={() => setPlaying(false)}
        />
      )}

      {title && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{title}</span>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!resolvedUrl || loadingAudio}
          aria-label={playing ? 'Pause audio' : 'Play audio'}
          className="w-10 h-10 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition-colors"
        >
          {loadingAudio ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : playing ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </button>

        {/* Interactive Waveform Scrubber */}
        <div
          role="slider"
          aria-label="Audio playback progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressRatio * 100)}
          tabIndex={0}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            handleSeek(ratio);
          }}
          className="flex-1 h-10 flex items-center gap-[3px] cursor-pointer select-none px-1"
        >
          {displayBars.map((amp, idx) => {
            const barRatio = idx / displayBars.length;
            const activeBar = barRatio <= progressRatio;
            return (
              <div
                key={idx}
                className={`flex-1 rounded-sm transition-colors ${
                  activeBar
                    ? 'bg-indigo-500 dark:bg-indigo-400'
                    : 'bg-slate-300 dark:bg-slate-700/80 hover:bg-slate-400 dark:hover:bg-slate-600'
                }`}
                style={{ height: `${Math.round(amp * 100)}%` }}
              />
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={cycleSpeed}
            className="px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            {playbackRate}x
          </button>

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="p-2 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={!resolvedUrl}
            aria-label="Download audio"
            className="p-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!title && (
        <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      )}
    </div>
  );
}
