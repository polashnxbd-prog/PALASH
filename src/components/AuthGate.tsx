import { ArrowRight, Mic, ShieldCheck, Sliders, Volume2 } from 'lucide-react';
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function AuthGate() {
  const { signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete Google sign-in.');
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090B10] text-slate-900 dark:text-slate-100 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-[#090B10]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            VoiceLab AI Studio
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#cloning" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Free Cloning
            </a>
            <a href="#bangla-tts" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Bangla TTS
            </a>
            <a href="#studio" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Audio Studio
            </a>
            <a href="#architecture" className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Engine Architecture
            </a>
          </nav>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={signingIn}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
          >
            {signingIn ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Split Section */}
        <section className="max-w-7xl mx-auto px-6 py-12 lg:py-20 grid lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
            <div className="text-xs font-medium text-indigo-600 dark:text-indigo-400 tracking-wide">
              Bangladeshi Bengali &amp; English · Modular AI Voice Platform
            </div>

            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.12] [text-wrap:balance]">
              Your Voice. Your Creativity. Your AI.
            </h1>

            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
              VoiceLab AI Studio brings Text-to-Speech, Audio Studio mastering, and{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                Unlimited Free Voice Cloning
              </span>{' '}
              into one self-hostable commercial studio built for Bangladeshi creators, storytellers, and teams.
            </p>

            {/* Unlimited Free Cloning Policy Summary */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-2">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Unlimited Free Voice Cloning — Every Account
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                100% Free · No Credits Required · No Monthly Limit · Create Unlimited Voice Profiles
              </p>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={signingIn}
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-medium text-sm transition-colors whitespace-nowrap"
              >
                <span>{signingIn ? 'Connecting with Google...' : 'Continue with Google'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Includes 1,000 starter TTS credits · Voice cloning is always 0 credits
              </span>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="relative h-full min-h-[280px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900">
              <img
                src="/src/assets/images/studio_hero_wave_1795753413520.jpg"
                alt="VoiceLab AI Studio acoustic recording room"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 space-y-1">
                <p className="text-xs font-medium text-slate-300">
                  Self-Hosted &amp; Modular Engine Ready
                </p>
                <p className="text-sm font-semibold text-white">
                  Record from phone or upload WAV/MP3 samples with real signal validation.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 4-Column Feature Strip */}
        <section id="cloning" className="max-w-7xl mx-auto px-6 pb-16">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-2.5">
              <Mic className="w-5 h-5 text-indigo-500" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Unlimited Free Cloning
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Record or upload voice samples, validate clarity, confirm speaker consent, and manage unlimited profiles at 0 credits.
              </p>
            </div>

            <div id="bangla-tts" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-2.5">
              <Volume2 className="w-5 h-5 text-cyan-500" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Bangladeshi Bengali First
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Built for natural Bangladeshi Bengali pronunciation, storytelling rhythm, emotion presets, and bilingual English scripts.
              </p>
            </div>

            <div id="studio" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-2.5">
              <Sliders className="w-5 h-5 text-indigo-500" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Real Audio Studio DSP
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Trim, fade in/out, adjust speed, normalize loudness, and export clean WAV audio directly in your browser.
              </p>
            </div>

            <div id="architecture" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Replaceable AI Engine
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Connect FastAPI GPU workers (Fish-Speech, CosyVoice, XTTS-v2) or external APIs with zero fake audio stubs.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800/80 py-6 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>VoiceLab AI Studio · Commercial AI Voice &amp; Cloning Platform</span>
          <span>Unlimited Free Voice Cloning · Responsible Consent &amp; Data Isolation</span>
        </div>
      </footer>
    </div>
  );
}
