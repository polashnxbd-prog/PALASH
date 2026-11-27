import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  AlertTriangle,
  CheckCircle2,
  FileAudio,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { AudioPlayer } from '../components/AudioPlayer';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { submitVoiceCloneSample } from '../lib/api';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { AppSection, AudioInspectionResult } from '../types/voicelab';

interface VoiceCloningPageProps {
  onNavigate: (section: AppSection) => void;
}

const CHARACTERISTIC_OPTIONS = [
  'Deep',
  'Soft',
  'Warm',
  'Emotional',
  'Storytelling',
  'News',
  'Calm',
  'Motivational',
];

export function VoiceCloningPage({ onNavigate }: VoiceCloningPageProps) {
  const { firebaseUser, getIdToken } = useAuth();
  const { notify } = useToast();

  const [inputMethod, setInputMethod] = useState<'upload' | 'record'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [measuredDuration, setMeasuredDuration] = useState<number>(0);

  // Microphone recorder state
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused' | 'stopped'>('idle');
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Profile metadata & consent
  const [voiceName, setVoiceName] = useState('');
  const [language, setLanguage] = useState<'bn-BD' | 'en-US' | 'multilingual'>('bn-BD');
  const [description, setDescription] = useState('');
  const [characteristics, setCharacteristics] = useState<string[]>(['Warm']);
  const [speakerOwnership, setSpeakerOwnership] = useState<'self' | 'authorized'>('self');
  const [consentChecked, setConsentChecked] = useState(false);

  // Cloning job status
  const [jobStage, setJobStage] = useState<
    'idle' | 'uploading' | 'validating' | 'processing' | 'creating' | 'completed' | 'awaiting_engine' | 'failed'
  >('idle');
  const [inspectionResult, setInspectionResult] = useState<AudioInspectionResult | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [createdVoiceId, setCreatedVoiceId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void audioCtxRef.current?.close();
    };
  }, []);

  const measureBlobDuration = async (blob: Blob): Promise<number> => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const arr = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arr);
      await ctx.close();
      return Number(decoded.duration.toFixed(2));
    } catch {
      return 0;
    }
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setSelectedFile(file);
    setRecordedBlob(null);
    setJobStage('idle');
    setInspectionResult(null);
    const dur = await measureBlobDuration(file);
    setMeasuredDuration(dur);
    if (!voiceName) {
      setVoiceName(file.name.replace(/\.[^/.]+$/, '').slice(0, 60));
    }
  };

  const startLiveVisualizer = (stream: MediaStream) => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const c2d = canvas.getContext('2d');
        if (!c2d) return;
        analyser.getByteFrequencyData(data);
        c2d.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = canvas.width / data.length;
        for (let i = 0; i < data.length; i++) {
          const val = data[i] / 255;
          const h = Math.max(4, val * canvas.height);
          c2d.fillStyle = '#6366F1';
          c2d.fillRect(i * barWidth, (canvas.height - h) / 2, Math.max(2, barWidth - 2), h);
        }
        animFrameRef.current = requestAnimationFrame(draw);
      };
      draw();
    } catch {
      // Visualizer optional if AudioContext blocked
    }
  };

  const startRecording = async () => {
    setMicError(null);
    setRecordedBlob(null);
    setSelectedFile(null);
    setJobStage('idle');
    setInspectionResult(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setRecordedBlob(blob);
        const dur = await measureBlobDuration(blob);
        setMeasuredDuration(dur || recordSeconds);
        stream.getTracks().forEach((t) => t.stop());
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        void audioCtxRef.current?.close();
      };

      recorder.start(250);
      setRecordSeconds(0);
      setRecordingState('recording');
      startLiveVisualizer(stream);

      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setMicError('Microphone permission denied or no audio input device was found.');
    }
  };

  const pauseOrResumeRecording = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      rec.pause();
      setRecordingState('paused');
      if (timerRef.current) window.clearInterval(timerRef.current);
    } else if (rec.state === 'paused') {
      rec.resume();
      setRecordingState('recording');
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecordingState('stopped');
  };

  const toggleCharacteristic = (tag: string) => {
    setCharacteristics((prev) =>
      prev.includes(tag)
        ? prev.filter((c) => c !== tag)
        : prev.length < 6
        ? [...prev, tag]
        : prev
    );
  };

  const activeAudioBlob = inputMethod === 'upload' ? selectedFile : recordedBlob;
  const activeFileName =
    inputMethod === 'upload'
      ? selectedFile?.name || 'sample.wav'
      : `mic_recording_${Date.now()}.webm`;

  const handleSubmitClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    if (!activeAudioBlob) {
      notify('Please upload or record a voice sample first.', 'error');
      return;
    }
    if (!voiceName.trim()) {
      notify('Please enter a voice profile name.', 'error');
      return;
    }
    if (!consentChecked) {
      notify('Please confirm voice ownership or speaker permission before cloning.', 'error');
      return;
    }

    try {
      setJobStage('uploading');
      setResultMessage(null);
      const token = await getIdToken();
      if (!token) throw new Error('Authentication session expired. Please sign in again.');

      setJobStage('validating');
      const response = await submitVoiceCloneSample({
        token,
        file: activeAudioBlob,
        fileName: activeFileName,
        voiceName: voiceName.trim(),
        language,
        durationSec: measuredDuration || recordSeconds || undefined,
        consentConfirmed: true,
      });

      setInspectionResult(response.inspection);
      setJobStage('creating');

      // Persist Voice Profile & Immutable Consent Record to Firestore (ZERO credit deduction!)
      const voiceProfilePath = `voiceProfiles/${response.voiceId}`;
      const consentId = `cns_${response.voiceId}`;
      const finalStatus = response.engineResult.connected ? 'completed' : 'awaiting_engine';

      try {
        await setDoc(doc(db, 'voiceProfiles', response.voiceId), {
          ownerId: firebaseUser.uid,
          name: voiceName.trim(),
          description: description.trim(),
          language,
          characteristics,
          avatarUrl: '/src/assets/images/voice_avatar_mic_capsule_1795753413407.jpg',
          sampleId: response.sampleId,
          sampleFileName: activeFileName,
          sampleDurationSec: response.inspection.durationSec || measuredDuration || 0,
          sampleSizeBytes: response.inspection.sizeBytes || activeAudioBlob.size,
          sampleMimeType: response.inspection.mimeType || activeAudioBlob.type || 'audio/wav',
          engineAdapterId: response.engineResult.adapterId,
          status: finalStatus,
          consentConfirmed: true,
          isFavorite: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await setDoc(doc(db, 'consentRecords', consentId), {
          ownerId: firebaseUser.uid,
          voiceId: response.voiceId,
          speakerOwnership,
          consentTextVersion: 'v1.0-responsible-cloning',
          confirmedAt: serverTimestamp(),
        });
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.CREATE, voiceProfilePath);
      }

      setCreatedVoiceId(response.voiceId);
      setJobStage(finalStatus);
      setResultMessage(response.engineResult.message);
      notify(
        'Voice Profile Saved (0 Credits)',
        'success',
        'Added to My Voices with your validated audio sample.'
      );
    } catch (err) {
      setJobStage('failed');
      const msg = err instanceof Error ? err.message : 'Unable to process voice clone.';
      setResultMessage(msg);
      notify('Voice cloning failed', 'error', msg);
    }
  };

  return (
    <div className="space-y-8">
      {/* Core Policy Header — ZERO credit cost displayed */}
      <section className="rounded-2xl border border-indigo-500/30 bg-indigo-50/70 dark:bg-[#111728] p-6 space-y-2">
        <div className="text-xs font-semibold tracking-wider text-indigo-600 dark:text-indigo-400">
          UNLIMITED FREE VOICE CLONING
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white [text-wrap:balance]">
          Clone Your Voice in Seconds
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          100% Free · No Credits Required · No Monthly Limit · Create Unlimited Voice Profiles
        </p>
      </section>

      <form onSubmit={handleSubmitClone} className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Audio Capture + Form */}
        <div className="lg:col-span-8 space-y-6">
          {/* Step 1: Choose Input Method */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                01. Voice Sample Input
              </h2>

              <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setInputMethod('upload')}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    inputMethod === 'upload'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Audio</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputMethod('record')}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    inputMethod === 'record'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Record Mic</span>
                </button>
              </div>
            </div>

            {inputMethod === 'upload' ? (
              <div className="space-y-4">
                {!selectedFile ? (
                  <label className="block rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 p-8 text-center cursor-pointer transition-colors">
                    <input
                      type="file"
                      accept=".wav,.mp3,.m4a,.ogg,.webm,.aac,audio/*"
                      className="sr-only"
                      onChange={(e) => void handleFileChange(e.target.files?.[0])}
                    />
                    <Upload className="w-8 h-8 text-indigo-500 mx-auto mb-3" />
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                      Click to upload voice sample from device
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Supports WAV, MP3, M4A, OGG, WebM · Recommended 10–60s clean speech
                    </p>
                  </label>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileAudio className="w-5 h-5 text-indigo-500 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {selectedFile.name}
                          </div>
                          <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB ·{' '}
                            {measuredDuration > 0 ? `${measuredDuration}s` : 'Detecting duration'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFile(null);
                          setMeasuredDuration(0);
                        }}
                        aria-label="Remove uploaded file"
                        className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <AudioPlayer localBlob={selectedFile} fileName={selectedFile.name} compact />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {micError && (
                  <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-500">
                    {micError}
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D1017] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      {recordingState === 'recording'
                        ? 'Recording from microphone'
                        : recordingState === 'paused'
                        ? 'Recording paused'
                        : recordingState === 'stopped'
                        ? 'Recording captured'
                        : 'Ready to record'}
                    </span>
                    <span className="text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                      {Math.floor(recordSeconds / 60)}:
                      {(recordSeconds % 60).toString().padStart(2, '0')}
                    </span>
                  </div>

                  <canvas
                    ref={canvasRef}
                    width={520}
                    height={56}
                    className="w-full h-14 rounded-lg bg-slate-200/60 dark:bg-slate-900/80"
                  />

                  <div className="flex flex-wrap items-center gap-2.5">
                    {recordingState === 'idle' || recordingState === 'stopped' ? (
                      <button
                        type="button"
                        onClick={startRecording}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
                      >
                        <Mic className="w-4 h-4" />
                        <span>{recordingState === 'stopped' ? 'Re-record' : 'Start Recording'}</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={pauseOrResumeRecording}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-200/50 dark:hover:bg-slate-800"
                        >
                          {recordingState === 'recording' ? (
                            <>
                              <Pause className="w-4 h-4" />
                              <span>Pause</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4" />
                              <span>Resume</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition-colors"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>Stop</span>
                        </button>
                      </>
                    )}

                    {recordedBlob && (
                      <button
                        type="button"
                        onClick={() => {
                          setRecordedBlob(null);
                          setRecordingState('idle');
                          setRecordSeconds(0);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Discard</span>
                      </button>
                    )}
                  </div>
                </div>

                {recordedBlob && (
                  <AudioPlayer
                    localBlob={recordedBlob}
                    title="Recorded Microphone Sample"
                    fileName="mic_voice_sample.webm"
                    compact
                  />
                )}
              </div>
            )}
          </div>

          {/* Step 2: Voice Profile Metadata */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              02. Voice Profile Configuration
            </h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Voice Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="e.g. Polash — Bangla Narrator"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Primary Language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'bn-BD' | 'en-US' | 'multilingual')}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="bn-BD">Bengali (Bangladesh)</option>
                  <option value="en-US">English</option>
                  <option value="multilingual">Multilingual (Bengali &amp; English)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Description (Optional)
              </label>
              <textarea
                rows={2}
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe speaking tone, storytelling style, or ideal use case..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Voice Characteristics (Select up to 6)
              </span>
              <div className="flex flex-wrap gap-2">
                {CHARACTERISTIC_OPTIONS.map((tag) => {
                  const selected = characteristics.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleCharacteristic(tag)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        selected
                          ? 'border-indigo-500 bg-indigo-600/15 text-indigo-600 dark:text-indigo-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Step 3: Responsible Voice Cloning Consent */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                03. Speaker Ownership &amp; Consent
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSpeakerOwnership('self')}
                className={`p-3 rounded-lg border text-left text-xs transition-colors ${
                  speakerOwnership === 'self'
                    ? 'border-indigo-500 bg-indigo-600/10 text-slate-900 dark:text-white'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div className="font-semibold">This is my own voice</div>
                <div className="mt-0.5 opacity-80">Self-recorded or personal audio</div>
              </button>
              <button
                type="button"
                onClick={() => setSpeakerOwnership('authorized')}
                className={`p-3 rounded-lg border text-left text-xs transition-colors ${
                  speakerOwnership === 'authorized'
                    ? 'border-indigo-500 bg-indigo-600/10 text-slate-900 dark:text-white'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div className="font-semibold">I have explicit speaker permission</div>
                <div className="mt-0.5 opacity-80">Written/recorded authorization</div>
              </button>
            </div>

            <label className="flex items-start gap-3 cursor-pointer text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                I confirm that I own this voice or have explicit permission from the speaker, and I will not use this clone for impersonation, fraud, harassment, or deceptive misuse. Voice samples remain private to my account and can be permanently deleted anytime.
              </span>
            </label>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Free Forever · No Credits Deducted
              </span>
              <button
                type="submit"
                disabled={jobStage === 'uploading' || jobStage === 'validating' || jobStage === 'creating'}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium transition-colors"
              >
                {(jobStage === 'uploading' || jobStage === 'validating' || jobStage === 'creating') && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                <span>Create Free Voice Clone</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Sample Guidance & Real Signal Inspection */}
        <div className="lg:col-span-4 space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Best Results Checklist
            </h3>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li>• Use a clear recording in a quiet room.</li>
              <li>• Avoid background music, echo, or multiple speakers.</li>
              <li>• Speak naturally at a steady microphone distance.</li>
              <li>• Aim for 10–45 seconds of continuous speech.</li>
            </ul>
          </div>

          {jobStage !== 'idle' && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Cloning Job Status
                </h3>
                <span className="text-xs font-mono text-indigo-500 uppercase">
                  {jobStage.replace('_', ' ')}
                </span>
              </div>

              {resultMessage && (
                <div
                  className={`rounded-lg p-3 text-xs flex items-start gap-2.5 ${
                    jobStage === 'failed'
                      ? 'bg-rose-500/10 text-rose-500 border border-rose-500/30'
                      : jobStage === 'completed'
                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                  }`}
                >
                  {jobStage === 'completed' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{resultMessage}</span>
                </div>
              )}

              {inspectionResult && (
                <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3 text-xs">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    Validated Audio Metrics
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    <div>Format: {inspectionResult.format.toUpperCase()}</div>
                    <div>Duration: {inspectionResult.durationSec}s</div>
                    {inspectionResult.sampleRate && (
                      <div>Rate: {inspectionResult.sampleRate} Hz</div>
                    )}
                    {typeof inspectionResult.rmsDb === 'number' && (
                      <div>RMS: {inspectionResult.rmsDb} dBFS</div>
                    )}
                  </div>
                  {inspectionResult.recommendations.map((rec, i) => (
                    <p key={i} className="text-slate-500 dark:text-slate-400">
                      • {rec}
                    </p>
                  ))}
                </div>
              )}

              {createdVoiceId && (
                <button
                  type="button"
                  onClick={() => onNavigate('my-voices')}
                  className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
                >
                  View in My Voices
                </button>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
