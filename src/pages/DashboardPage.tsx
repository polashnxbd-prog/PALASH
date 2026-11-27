import {
  AudioWaveform,
  BookOpen,
  Globe2,
  Mic,
  RefreshCw,
  Sliders,
  Sparkles,
  Volume2,
  Wand2,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchEnginesStatus } from '../lib/api';
import type { AppSection, EngineAdapterStatus } from '../types/voicelab';

interface DashboardPageProps {
  onNavigate: (section: AppSection, options?: { preselectVoiceId?: string; toolTab?: string }) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { profile, voiceProfiles, generations } = useAuth();
  const [adapters, setAdapters] = useState<EngineAdapterStatus[]>([]);
  const [anyEngineConnected, setAnyEngineConnected] = useState(false);
  const [loadingEngine, setLoadingEngine] = useState(true);

  useEffect(() => {
    let active = true;
    fetchEnginesStatus()
      .then((res) => {
        if (!active) return;
        setAdapters(res.adapters);
        setAnyEngineConnected(res.anyConnected);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingEngine(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const quickActions: Array<{
    title: string;
    subtitle: string;
    section: AppSection;
    toolTab?: string;
    icon: React.ComponentType<{ className?: string }>;
    highlight?: boolean;
  }> = [
    {
      title: 'Text to Speech',
      subtitle: 'Bangladeshi Bengali & English synthesis',
      section: 'tts',
      icon: Volume2,
    },
    {
      title: 'Clone My Voice — FREE',
      subtitle: '0 credits · Unlimited voice profiles',
      section: 'clone',
      icon: Mic,
      highlight: true,
    },
    {
      title: 'Voice Library',
      subtitle: 'Curated Bengali & English voices',
      section: 'library',
      icon: BookOpen,
    },
    {
      title: 'Voice Design',
      subtitle: 'Describe tone, pace, and emotion',
      section: 'tools',
      toolTab: 'design',
      icon: Wand2,
    },
    {
      title: 'Voice Changer',
      subtitle: 'Speech-to-speech voice conversion',
      section: 'tools',
      toolTab: 'changer',
      icon: RefreshCw,
    },
    {
      title: 'AI Dubbing',
      subtitle: 'Transcribe, translate & sync audio',
      section: 'tools',
      toolTab: 'dubbing',
      icon: Globe2,
    },
    {
      title: 'Audio Studio',
      subtitle: 'Trim, normalize, fade & export WAV',
      section: 'studio',
      icon: Sliders,
    },
    {
      title: 'Sound Effects',
      subtitle: 'Text-to-ambience & foley generation',
      section: 'tools',
      toolTab: 'sfx',
      icon: Sparkles,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome & Account Summary */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 md:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Account Status: {profile?.suspended ? 'Suspended' : 'Active'} · Plan:{' '}
            {(profile?.plan || 'free').toUpperCase()} · Unlimited Free Voice Cloning Enabled
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white [text-wrap:balance]">
            Welcome back, {profile?.name || 'Creator'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Create unlimited free voice clones from uploads or your microphone, edit audio in the DSP studio, or connect a self-hosted Bangla/English GPU worker.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('clone')}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors whitespace-nowrap"
          >
            Clone Voice (Free)
          </button>
          <button
            type="button"
            onClick={() => onNavigate('tts')}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-medium transition-colors whitespace-nowrap"
          >
            Open TTS Studio
          </button>
        </div>
      </section>

      {/* Statistics Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Available Credits</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {(profile?.credits ?? 0).toLocaleString()}
          </div>
          <div className="text-xs text-emerald-600 dark:text-emerald-400">Cloning: 0 credits</div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Voice Profiles</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {voiceProfiles.length}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">No profile cap</div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Generated Audio</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {generations.length}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {profile?.totalDownloads ?? 0} downloads
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">AI Voice Engine</div>
          <div className="text-lg font-semibold text-slate-900 dark:text-white">
            {loadingEngine
              ? 'Checking...'
              : anyEngineConnected
              ? 'Connected'
              : 'Not Connected'}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {adapters.length} modular adapters ready
          </div>
        </div>
      </section>

      {/* 8 Quick Action Cards */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Studio Modules</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Select a workspace to begin
          </span>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.title}
                type="button"
                onClick={() => onNavigate(card.section, { toolTab: card.toolTab })}
                className={`text-left rounded-xl border p-5 transition-colors space-y-2.5 ${
                  card.highlight
                    ? 'border-indigo-500/40 bg-indigo-50/70 dark:bg-indigo-950/25 hover:border-indigo-500'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${
                    card.highlight
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                />
                <div className="font-semibold text-sm text-slate-900 dark:text-white">
                  {card.title}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {card.subtitle}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Recent Voice Clones & Recent Audio Generations */}
      <section className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Recent Voice Clones
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('my-voices')}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              View All
            </button>
          </div>

          {voiceProfiles.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <AudioWaveform className="w-7 h-7 text-slate-400 mx-auto" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No cloned voice profiles yet. Create your first voice profile for free.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('clone')}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
              >
                Create First Voice Clone
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {voiceProfiles.slice(0, 4).map((vp) => (
                <div key={vp.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {vp.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {vp.language} · {vp.sampleDurationSec}s sample · {vp.status.replace('_', ' ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('tts', { preselectVoiceId: vp.id })}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                  >
                    Use Voice
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Recent Audio Activity
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Full History
            </button>
          </div>

          {generations.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <Volume2 className="w-7 h-7 text-slate-400 mx-auto" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No audio generations or studio exports recorded yet.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('studio')}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Open Audio Studio
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {generations.slice(0, 4).map((gen) => (
                <div key={gen.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {gen.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {gen.tool.toUpperCase()} · {gen.voiceName} · {gen.durationSec}s · {gen.status}
                    </div>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                    {gen.creditsCost} cr
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
