import { addDoc, collection, doc, increment, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  AlertCircle,
  Eraser,
  FileText,
  Loader2,
  Sliders,
  Volume2,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { AudioPlayer } from '../components/AudioPlayer';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { fetchEnginesStatus, submitTtsGeneration } from '../lib/api';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { EngineAdapterStatus } from '../types/voicelab';

interface TextToSpeechPageProps {
  preselectedVoiceId?: string;
}

const EMOTION_PRESETS = [
  'Neutral',
  'Happy',
  'Sad',
  'Emotional',
  'Heartbroken',
  'Angry',
  'Calm',
  'Whisper',
  'Romantic',
  'Motivational',
  'Excited',
  'Fearful',
  'Storytelling',
  'Professional',
  'News Presenter',
  'Cinematic Narration',
];

const SAMPLE_BANGLA_SCRIPT =
  'আসসালামু আলাইকুম। ভয়েসল্যাব এআই স্টুডিওতে আপনাকে স্বাগতম। আজকের গল্পটি শুরু হচ্ছে ঢাকার এক শান্ত বর্ষার সন্ধ্যায়—যেখানে প্রতিটি শব্দের ভেতরে লুকিয়ে থাকে মানুষের অনুভূতি।';

const SAMPLE_ENGLISH_SCRIPT =
  'Welcome to VoiceLab AI Studio. With modular self-hosted AI models and unlimited free voice cloning, creators can craft expressive narration in both Bangladeshi Bengali and English.';

export function TextToSpeechPage({ preselectedVoiceId }: TextToSpeechPageProps) {
  const { firebaseUser, profile, voiceProfiles, libraryVoices, appSettings, getIdToken } = useAuth();
  const { notify } = useToast();

  const [text, setText] = useState('');
  const [language, setLanguage] = useState<'bn-BD' | 'en-US' | 'multilingual'>('bn-BD');
  const [selectedVoiceKey, setSelectedVoiceKey] = useState<string>('');
  const [emotion, setEmotion] = useState('Storytelling');
  const [stability, setStability] = useState(0.65);
  const [similarity, setSimilarity] = useState(0.8);
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [styleIntensity, setStyleIntensity] = useState(0.55);
  const [pauseControl, setPauseControl] = useState('natural');
  const [pronunciationNote, setPronunciationNote] = useState('');

  const [adapters, setAdapters] = useState<EngineAdapterStatus[]>([]);
  const [anyConnected, setAnyConnected] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [engineAlert, setEngineAlert] = useState<string | null>(null);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);

  const combinedVoices = useMemo(() => {
    const cloned = voiceProfiles.map((vp) => ({
      key: `cloned:${vp.id}`,
      id: vp.sampleId,
      docId: vp.id,
      type: 'cloned' as const,
      name: `${vp.name} (My Clone)`,
      language: vp.language,
    }));
    const lib = libraryVoices.map((lv) => ({
      key: `library:${lv.id}`,
      id: lv.id,
      docId: lv.id,
      type: 'library' as const,
      name: `${lv.name} (${lv.category})`,
      language: lv.language,
    }));
    return [...cloned, ...lib];
  }, [voiceProfiles, libraryVoices]);

  useEffect(() => {
    if (preselectedVoiceId) {
      const match = combinedVoices.find((v) => v.docId === preselectedVoiceId);
      if (match) setSelectedVoiceKey(match.key);
    } else if (!selectedVoiceKey && combinedVoices.length > 0) {
      setSelectedVoiceKey(combinedVoices[0].key);
    }
  }, [preselectedVoiceId, combinedVoices, selectedVoiceKey]);

  useEffect(() => {
    fetchEnginesStatus()
      .then((res) => {
        setAdapters(res.adapters);
        setAnyConnected(res.anyConnected);
      })
      .catch(() => {});
  }, []);

  const activeAdapter = adapters.find((a) => a.status === 'connected') || adapters[0];
  const supportedControls = activeAdapter?.supportsControls || {
    stability: true,
    similarity: true,
    speed: true,
    pitch: true,
    styleIntensity: true,
    emotion: true,
  };

  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const estimatedCredits = Math.max(
    1,
    Math.ceil((Math.max(1, charCount) / 1000) * (appSettings.ttsCostPer1kChars || 15))
  );

  const selectedVoice = combinedVoices.find((v) => v.key === selectedVoiceKey) || combinedVoices[0];

  const handleGenerate = async () => {
    if (!firebaseUser || !profile) return;
    if (!text.trim()) {
      notify('Please enter Bengali or English text to synthesize.', 'error');
      return;
    }
    if (profile.credits < estimatedCredits) {
      notify(
        'Insufficient credits',
        'error',
        `This script requires ${estimatedCredits} credits, and you have ${profile.credits}.`
      );
      return;
    }

    setGenerating(true);
    setEngineAlert(null);
    setGeneratedAudioUrl(null);

    try {
      const token = await getIdToken();
      if (!token) throw new Error('Session expired. Please sign in again.');

      const idempotencyKey = `tts_${firebaseUser.uid}_${Date.now()}`;
      const res = await submitTtsGeneration({
        token,
        text: text.trim(),
        language,
        voiceId: selectedVoice?.id || 'default',
        voiceType: selectedVoice?.type || 'library',
        controls: {
          stability,
          similarity,
          speed,
          pitch,
          styleIntensity,
          emotion,
        },
        idempotencyKey,
      });

      if (!res.connected || !res.audioUrl) {
        setEngineAlert(
          res.error ||
            'AI Text-to-Speech engine is not connected yet. Configure VOICE_ENGINE_URL (FastAPI GPU worker) to synthesize real audio. Zero credits were deducted.'
        );
        notify('AI TTS Engine Not Connected', 'info', 'Zero credits deducted.');
        return;
      }

      setGeneratedAudioUrl(res.audioUrl);

      // Persist generation record & debit credits transactionally only after genuine synthesis
      try {
        await addDoc(collection(db, 'audioGenerations'), {
          ownerId: firebaseUser.uid,
          title: text.trim().slice(0, 60),
          tool: 'tts',
          voiceId: selectedVoice?.docId || '',
          voiceName: selectedVoice?.name || 'Default Voice',
          language,
          textPreview: text.trim().slice(0, 200),
          durationSec: 0,
          creditsCost: estimatedCredits,
          status: 'completed',
          audioUrl: res.audioUrl,
          isFavorite: false,
          createdAt: serverTimestamp(),
        });

        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          credits: Math.max(0, profile.credits - estimatedCredits),
          totalGenerations: increment(1),
          updatedAt: serverTimestamp(),
        });

        await addDoc(collection(db, 'creditTransactions'), {
          ownerId: firebaseUser.uid,
          type: 'generation_debit',
          amount: -estimatedCredits,
          description: `TTS synthesis (${charCount} chars)`,
          referenceId: res.audioId || '',
          createdAt: serverTimestamp(),
        });
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.WRITE, 'audioGenerations');
      }

      notify('Speech generated successfully', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'TTS request failed.';
      setEngineAlert(msg);
      notify('Generation error', 'error', msg);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Text to Speech Studio
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Bangladeshi Bengali, English &amp; multilingual speech synthesis with emotion control
          </p>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          Engine:{' '}
          <span
            className={
              anyConnected ? 'text-emerald-500 font-semibold' : 'text-amber-500 font-semibold'
            }
          >
            {anyConnected ? 'Connected' : 'Not Connected'}
          </span>
        </div>
      </div>

      {!anyConnected && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Honest Engine Status:</span> No self-hosted AI TTS worker (<code className="font-mono">VOICE_ENGINE_URL</code>) or external TTS API is connected yet. You can prepare scripts, select cloned or library voices, and configure controls—clicking Generate checks the backend honestly without simulating fake audio or deducting credits.
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Script Editor */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLanguage('bn-BD');
                    setText(SAMPLE_BANGLA_SCRIPT);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Load Bangla Script</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLanguage('en-US');
                    setText(SAMPLE_ENGLISH_SCRIPT);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Load English Script</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setText('')}
                disabled={!text}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-rose-500 disabled:opacity-40"
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>

            <textarea
              rows={10}
              maxLength={10000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write or paste Bangladeshi Bengali (বাংলা) or English script here..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] p-4 text-sm sm:text-base leading-relaxed text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <div className="font-mono tabular-nums">
                {charCount.toLocaleString()} / 10,000 chars · {wordCount.toLocaleString()} words
              </div>
              <div className="font-mono tabular-nums">
                Estimated Cost: <span className="font-semibold text-slate-900 dark:text-white">{estimatedCredits} credits</span>
              </div>
            </div>

            {engineAlert && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-300">
                {engineAlert}
              </div>
            )}

            <div className="flex items-center justify-end pt-1">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || !text.trim()}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
                <span>{generating ? 'Synthesizing...' : 'Generate Speech'}</span>
              </button>
            </div>
          </div>

          {generatedAudioUrl && (
            <AudioPlayer
              src={generatedAudioUrl}
              requiresAuth
              title={`Synthesized Speech · ${selectedVoice?.name || 'Voice'}`}
              fileName={`voicelab_tts_${Date.now()}.wav`}
            />
          )}
        </div>

        {/* Right Column: Voice & Model-Supported Controls */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Voice &amp; Expression Controls
            </h2>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Selected Voice
            </label>
            <select
              value={selectedVoiceKey}
              onChange={(e) => setSelectedVoiceKey(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs text-slate-900 dark:text-white"
            >
              {combinedVoices.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Script Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'bn-BD' | 'en-US' | 'multilingual')}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs text-slate-900 dark:text-white"
            >
              <option value="bn-BD">Bangladeshi Bengali (bn-BD)</option>
              <option value="en-US">English (en-US)</option>
              <option value="multilingual">Multilingual</option>
            </select>
          </div>

          {supportedControls.emotion && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Emotion &amp; Style Preset
              </label>
              <select
                value={emotion}
                onChange={(e) => setEmotion(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs text-slate-900 dark:text-white"
              >
                {EMOTION_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
            </div>
          )}

          {supportedControls.stability && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400">Stability</span>
                <span className="font-mono tabular-nums">{Math.round(stability * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={stability}
                onChange={(e) => setStability(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
          )}

          {supportedControls.similarity && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400">Speaker Similarity</span>
                <span className="font-mono tabular-nums">{Math.round(similarity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={similarity}
                onChange={(e) => setSimilarity(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
          )}

          {supportedControls.speed && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400">Speaking Speed</span>
                <span className="font-mono tabular-nums">{speed.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.7}
                max={1.4}
                step={0.05}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
          )}

          {supportedControls.pitch && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400">Pitch Shift</span>
                <span className="font-mono tabular-nums">
                  {pitch > 0 ? `+${pitch}` : pitch} st
                </span>
              </div>
              <input
                type="range"
                min={-6}
                max={6}
                step={1}
                value={pitch}
                onChange={(e) => setPitch(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
          )}

          {supportedControls.styleIntensity && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400">Style Exaggeration</span>
                <span className="font-mono tabular-nums">{Math.round(styleIntensity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={styleIntensity}
                onChange={(e) => setStyleIntensity(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
          )}

          <div className="space-y-1.5 pt-1 border-t border-slate-200 dark:border-slate-800">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Pause &amp; Punctuation Cadence
            </label>
            <select
              value={pauseControl}
              onChange={(e) => setPauseControl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs"
            >
              <option value="natural">Natural Punctuation Pauses</option>
              <option value="cinematic">Extended Cinematic Pauses</option>
              <option value="compact">Crisp Broadcast Pacing</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Bangla Pronunciation / Phonetic Hint
            </label>
            <input
              type="text"
              value={pronunciationNote}
              onChange={(e) => setPronunciationNote(e.target.value)}
              placeholder="e.g. র=r, ড়=rh, Standard Dhaka accent"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
