import {
  AudioWaveform,
  BookOpen,
  CreditCard,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic,
  Moon,
  ShieldAlert,
  Sliders,
  Sparkles,
  Sun,
  User,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { AppSection } from '../types/voicelab';

interface AppShellProps {
  activeSection: AppSection;
  onNavigate: (section: AppSection) => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: AppSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'clone', label: 'Clone Voice (Free)', icon: Mic },
  { id: 'my-voices', label: 'My Voices', icon: Users },
  { id: 'tts', label: 'Text to Speech', icon: Volume2 },
  { id: 'library', label: 'Voice Library', icon: BookOpen },
  { id: 'studio', label: 'Audio Studio', icon: Sliders },
  { id: 'tools', label: 'AI Tools', icon: Sparkles },
  { id: 'history', label: 'History', icon: History },
  { id: 'billing', label: 'Plans & API', icon: CreditCard },
  { id: 'profile', label: 'Profile & Safety', icon: User },
  { id: 'admin', label: 'Admin Console', icon: ShieldAlert, adminOnly: true },
];

export function AppShell({ activeSection, onNavigate, children }: AppShellProps) {
  const { profile, isAdmin, secondsUntilRefill, refillingCredits, signOut } = useAuth();
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const formatCountdown = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
  };

  const visibleNav = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const activeItem = visibleNav.find((n) => n.id === activeSection) || visibleNav[0];

  const handleNav = (id: AppSection) => {
    onNavigate(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090B10] text-slate-900 dark:text-slate-100 flex flex-col md:flex-row">
      {/* Desktop Sidebar (256px) */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0D1017] z-30">
        <div className="h-14 px-5 flex items-center gap-2.5 border-b border-slate-200 dark:border-slate-800/80">
          <AudioWaveform className="w-5 h-5 text-indigo-500 shrink-0" />
          <span className="font-display font-bold text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            VoiceLab AI Studio
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-indigo-600/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom Sidebar Summary */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Voice Cloning</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">0 Credits · Free</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>TTS Credits</span>
              <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                {(profile?.credits ?? 0).toLocaleString()} / 10,000
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Auto-Refill (30m)</span>
              <span className="font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                {refillingCredits
                  ? 'Refilling...'
                  : (profile?.credits ?? 0) >= 10000
                  ? 'Full (10,000)'
                  : `In ${formatCountdown(secondsUntilRefill)}`}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen pb-16 md:pb-0">
        {/* Top Bar (Contextual Breadcrumb + 1-2 clean actions) */}
        <header className="h-14 sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-[#090B10]/90 backdrop-blur-md px-4 md:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="md:hidden p-2 -ml-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline whitespace-nowrap">
                VoiceLab
              </span>
              <span className="text-slate-400 dark:text-slate-600 hidden sm:inline">/</span>
              <span className="font-semibold text-slate-900 dark:text-white truncate">
                {activeItem.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
              {(profile?.credits ?? 0).toLocaleString()} credits · {profile?.plan?.toUpperCase() || 'FREE'}
            </span>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle light or dark mode"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => handleNav('clone')}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              Clone Free
            </button>
          </div>
        </header>

        {/* Active Page Viewport */}
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation (Android-ready, <= 15% mobile height) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 h-14 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0D1017]/95 backdrop-blur-md grid grid-cols-5">
        {(
          [
            { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
            { id: 'clone', label: 'Clone', icon: Mic },
            { id: 'my-voices', label: 'Voices', icon: Users },
            { id: 'tts', label: 'TTS', icon: Volume2 },
            { id: 'studio', label: 'Studio', icon: Sliders },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleNav(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                active
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Drawer Menu for remaining sections */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[82vw] bg-white dark:bg-[#0D1017] h-full flex flex-col border-r border-slate-200 dark:border-slate-800 z-10">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <span className="font-display font-bold text-base">VoiceLab AI Studio</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNav(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium ${
                      active
                        ? 'bg-indigo-600/10 text-indigo-600 dark:text-indigo-300'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={signOut}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-rose-500 hover:bg-rose-500/10"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
