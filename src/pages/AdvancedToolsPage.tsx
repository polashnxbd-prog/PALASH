import {
  AlertCircle,
  Globe2,
  Mic2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  Waves,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { AudioPlayer } from '../components/AudioPlayer';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { fetchEnginesStatus } from '../lib/api';
import type { EngineAdapterStatus } from '../types/voicelab';

export type AdvancedToolTab = 'design' | 'changer' | 'dubbing' | 'podcast' | 'sfx' | 'enhance';

interface AdvancedToolsPageProps {
  initialTab?: string;
}

interface DialogueLine {
  id: string;
  speaker: string;
  voiceKey: string;
  emotion: string;
  text: string;
}

export function AdvancedToolsPage({ initialTab }: AdvancedToolsPageProps) {
  const { voiceProfiles, libraryVoices, appSettings } = useAuth();
  const { notify } = useToast();

  const validTab = (t?: string): AdvancedToolTab =>
    t === 'changer' || t === 'dubbing' || t === 'podcast' || t === 'sfx' || t === 'enhance'
      ? t
      : 'design';

  const [activeTab, setActiveTab] = useState<AdvancedToolTab>(() => validTab(initialTab));
  const [adapters, setAdapters] = useState<EngineAdapterStatus[]>([]);
  const [anyConnected, setAnyConnected] = useState(false);

  // Voice Design state
  const [designGender, setDesignGender] = useState('Male');
  const [designAge, setDesignAge] = useState('Adult (30s)');
  const [designAccent, setDesignAccent] = useState('Bangladeshi Bengali (Dhaka)');
  const [designTone, setDesignTone] = useState('Deep, warm, cinematic storytelling');
  const [designPrompt, setDesignPrompt] = useState(
    'Create a deep, emotional Bangladeshi male voice. Slow speaking pace, natural pronunciation, warm tone, cinematic storytelling, slight sadness, realistic breathing, and meaningful pauses.'
  );

  // Voice Changer & Speech Enhancement input preview
  const [uploadedAudio, setUploadedAudio] = useState<File | null>(null);
  const [preserveEmotion, setPreserveEmotion] = useState(true);
  const [conversionStrength, setConversionStrength] = useState(0.75);

  // AI Dubbing state
  const [dubSourceLang, setDubSourceLang] = useState('English');
  const [dubTargetLang, setDubTargetLang] = useState('Bengali (Bangladesh)');
  const [dubMediaFile, setDubMediaFile] = useState<File | null>(null);

  // Podcast Studio state
  const allVoices = [
    ...voiceProfiles.map((v) => ({ key: `clone:${v.id}`, label: `${v.name} (Clone)` })),
    ...libraryVoices.map((v) => ({ key: `lib:${v.id}`, label: v.name })),
  ];
  const [dialogue, setDialogue] = useState<DialogueLine[]>([
    {
      id: '1',
      speaker: 'Speaker 1',
      voiceKey: allVoices[0]?.key || 'default',
      emotion: 'Conversational',
      text: 'Welcome to today’s VoiceLab AI podcast episode.',
    },
    {
      id: '2',
      speaker: 'Speaker 2',
      voiceKey: allVoices[1]?.key || allVoices[0]?.key || 'default',
      emotion: 'Thoughtful',
      text: 'আজ আমরা আলোচনা করবো বাংলা এআই ভয়েস প্রযুক্তি নিয়ে।',
    },
  ]);
  const [bgMusicFile, setBgMusicFile] = useState<File | null>(null);

  // Sound Effects state
  const [sfxPrompt, setSfxPrompt] = useState('Gentle monsoon rain falling on a tin rooftop in Dhaka');
  const [sfxDuration, setSfxDuration] = useState(6);

  useEffect(() => {
    setActiveTab(validTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    fetchEnginesStatus()
      .then((res) => {
        setAdapters(res.adapters);
        setAnyConnected(res.anyConnected);
      })
      .catch(() => {});
  }, []);

  const handleRequiresEngine = (featureName: string) => {
    notify(
      `${featureName} requires a connected AI worker`,
      'info',
      'No simulated audio is generated. Connect VOICE_ENGINE_URL or an external adapter in Admin Console.'
    );
  };

  const tabs: Array<{
    id: AdvancedToolTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'design', label: 'Voice Design', icon: Wand2 },
    { id: 'changer', label: 'Voice Changer', icon: RefreshCw },
    { id: 'dubbing', label: 'AI Dubbing', icon: Globe2 },
    { id: 'podcast', label: 'Podcast Studio', icon: Mic2 },
    { id: 'sfx', label: 'Sound Effects', icon: Sparkles },
    { id: 'enhance', label: 'Speech Enhance', icon: Waves },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          AI Audio &amp; Production Tools
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Modular workflows routed to your connected self-hosted GPU models or external REST adapters
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#11151E] border border-slate-200 dark:border-slate-800">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {!anyConnected && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Model Engine Status: Not Connected.</span> Your workspace scripts, speaker assignments, and source uploads work right now. Neural inference activates automatically once a compatible worker is connected ({adapters.length} adapters available).
          </div>
        </div>
      )}

      {/* Voice Design */}
      {activeTab === 'design' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">AI Voice Design</h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Configured cost: {appSettings.voiceDesignCost ?? 25} credits
            </span>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Gender Presentation</label>
              <select
                value={designGender}
                onChange={(e) => setDesignGender(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs"
              >
                <option>Male</option>
                <option>Female</option>
                <option>Neutral</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Age Profile</label>
              <select
                value={designAge}
                onChange={(e) => setDesignAge(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs"
              >
                <option>Young Adult (20s)</option>
                <option>Adult (30s)</option>
                <option>Mature (45+)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Accent &amp; Language</label>
              <select
                value={designAccent}
                onChange={(e) => setDesignAccent(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs"
              >
                <option>Bangladeshi Bengali (Dhaka)</option>
                <option>English (Neutral Studio)</option>
                <option>Bilingual Bangladeshi English</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tone &amp; Pace</label>
              <input
                type="text"
                value={designTone}
                onChange={(e) => setDesignTone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5">Voice Description Prompt</label>
            <textarea
              rows={4}
              value={designPrompt}
              onChange={(e) => setDesignPrompt(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-sm"
            />
          </div>

          <button
            type="button"
            onClick={() => handleRequiresEngine('Voice Design')}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
          >
            Generate Designed Voice
          </button>
        </div>
      )}

      {/* Voice Changer */}
      {activeTab === 'changer' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Speech-to-Speech Voice Changer</h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Configured cost: {appSettings.voiceChangerCost ?? 20} credits
            </span>
          </div>

          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">
            <Upload className="w-4 h-4" />
            <span>{uploadedAudio ? uploadedAudio.name : 'Upload Source Speech Audio'}</span>
            <input
              type="file"
              accept="audio/*"
              className="sr-only"
              onChange={(e) => setUploadedAudio(e.target.files?.[0] || null)}
            />
          </label>

          {uploadedAudio && (
            <AudioPlayer localBlob={uploadedAudio} title="Original Source Audio" fileName={uploadedAudio.name} compact />
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Target Voice</label>
              <select className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs">
                {allVoices.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Conversion Strength</span>
                <span className="font-mono">{Math.round(conversionStrength * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={conversionStrength}
                onChange={(e) => setConversionStrength(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={preserveEmotion}
              onChange={(e) => setPreserveEmotion(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span>Preserve original speaker emotion and prosody</span>
          </label>

          <button
            type="button"
            onClick={() => handleRequiresEngine('Voice Changer')}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
          >
            Convert Voice via AI Model
          </button>
        </div>
      )}

      {/* AI Dubbing */}
      {activeTab === 'dubbing' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">AI Dubbing &amp; Subtitle Studio</h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Configured cost: {appSettings.dubbingCost ?? 40} credits
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Original Language</label>
              <select
                value={dubSourceLang}
                onChange={(e) => setDubSourceLang(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs"
              >
                <option>English</option>
                <option>Bengali (Bangladesh)</option>
                <option>Auto-Detect (Whisper)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Target Dubbing Language</label>
              <select
                value={dubTargetLang}
                onChange={(e) => setDubTargetLang(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs"
              >
                <option>Bengali (Bangladesh)</option>
                <option>English</option>
              </select>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">
            <Upload className="w-4 h-4" />
            <span>{dubMediaFile ? dubMediaFile.name : 'Upload Audio or Video File'}</span>
            <input
              type="file"
              accept="audio/*,video/*"
              className="sr-only"
              onChange={(e) => setDubMediaFile(e.target.files?.[0] || null)}
            />
          </label>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Note: Audio-aligned dubbing and SRT subtitles require Whisper ASR + Translation + TTS workers. Lip-sync video synthesis is only enabled when a dedicated lip-sync adapter is attached.
          </p>

          <button
            type="button"
            onClick={() => handleRequiresEngine('AI Dubbing')}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
          >
            Start Dubbing Pipeline
          </button>
        </div>
      )}

      {/* Podcast Studio */}
      {activeTab === 'podcast' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Multi-Speaker Podcast Studio</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Assign cloned or library voices per speaker line and attach background music
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setDialogue((prev) => [
                  ...prev,
                  {
                    id: String(Date.now()),
                    speaker: `Speaker ${(prev.length % 2) + 1}`,
                    voiceKey: allVoices[prev.length % Math.max(1, allVoices.length)]?.key || 'default',
                    emotion: 'Neutral',
                    text: '',
                  },
                ])
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Dialogue Line</span>
            </button>
          </div>

          <div className="space-y-3">
            {dialogue.map((line) => (
              <div
                key={line.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3"
              >
                <div className="grid sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    value={line.speaker}
                    onChange={(e) =>
                      setDialogue((d) =>
                        d.map((item) => (item.id === line.id ? { ...item, speaker: e.target.value } : item))
                      )
                    }
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs font-medium"
                  />
                  <select
                    value={line.voiceKey}
                    onChange={(e) =>
                      setDialogue((d) =>
                        d.map((item) => (item.id === line.id ? { ...item, voiceKey: e.target.value } : item))
                      )
                    }
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs"
                  >
                    {allVoices.map((v) => (
                      <option key={v.key} value={v.key}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <select
                      value={line.emotion}
                      onChange={(e) =>
                        setDialogue((d) =>
                          d.map((item) => (item.id === line.id ? { ...item, emotion: e.target.value } : item))
                        )
                      }
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs"
                    >
                      <option>Conversational</option>
                      <option>Thoughtful</option>
                      <option>Excited</option>
                      <option>Calm</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setDialogue((d) => d.filter((item) => item.id !== line.id))}
                      aria-label="Remove line"
                      className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <textarea
                  rows={2}
                  value={line.text}
                  onChange={(e) =>
                    setDialogue((d) =>
                      d.map((item) => (item.id === line.id ? { ...item, text: e.target.value } : item))
                    )
                  }
                  placeholder="Enter speaker dialogue in Bengali or English..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs sm:text-sm"
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>{bgMusicFile ? `BGM: ${bgMusicFile.name}` : 'Upload Background Music'}</span>
              <input
                type="file"
                accept="audio/*"
                className="sr-only"
                onChange={(e) => setBgMusicFile(e.target.files?.[0] || null)}
              />
            </label>

            <button
              type="button"
              onClick={() => handleRequiresEngine('Podcast Synthesis')}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
            >
              Generate Multi-Speaker Episode
            </button>
          </div>

          {bgMusicFile && (
            <AudioPlayer localBlob={bgMusicFile} title={`Background Music: ${bgMusicFile.name}`} fileName={bgMusicFile.name} compact />
          )}
        </div>
      )}

      {/* Sound Effects */}
      {activeTab === 'sfx' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Sound Effects Generator</h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Configured cost: {appSettings.soundFxCost ?? 15} credits
            </span>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium">Describe the Sound Effect</label>
            <textarea
              rows={3}
              value={sfxPrompt}
              onChange={(e) => setSfxPrompt(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-sm"
            />
          </div>

          <div className="max-w-xs space-y-1">
            <div className="flex justify-between text-xs">
              <span>Target Duration</span>
              <span className="font-mono">{sfxDuration}s</span>
            </div>
            <input
              type="range"
              min={2}
              max={20}
              step={1}
              value={sfxDuration}
              onChange={(e) => setSfxDuration(Number(e.target.value))}
              className="w-full accent-indigo-600"
            />
          </div>

          <button
            type="button"
            onClick={() => handleRequiresEngine('Sound Effects')}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
          >
            Generate Sound Effect
          </button>
        </div>
      )}

      {/* Speech Enhancement */}
      {activeTab === 'enhance' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">AI Speech Enhancement &amp; Denoising</h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Configured cost: {appSettings.speechEnhanceCost ?? 10} credits
            </span>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            Connect DeepFilterNet / RNNoise / VoiceFixer in your FastAPI worker for neural background removal, de-reverb, and speech isolation. For immediate trimming, fading, and loudness normalization, use Audio Studio.
          </p>

          <button
            type="button"
            onClick={() => handleRequiresEngine('Speech Enhancement')}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
          >
            Enhance Speech Recording
          </button>
        </div>
      )}
    </div>
  );
}
