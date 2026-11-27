import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { BookOpen, Heart, Info, Search, Volume2, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { AudioPlayer } from '../components/AudioPlayer';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { AppSection, LibraryVoice } from '../types/voicelab';

interface VoiceLibraryPageProps {
  onNavigate: (section: AppSection, options?: { preselectVoiceId?: string }) => void;
}

const CATEGORIES = [
  'All',
  'Bangladeshi Bengali',
  'English',
  'Male',
  'Female',
  'Storytelling',
  'Cinematic',
  'News',
  'Podcast',
  'Favorites',
];

export function VoiceLibraryPage({ onNavigate }: VoiceLibraryPageProps) {
  const { firebaseUser, libraryVoices, favoriteIds } = useAuth();
  const { notify } = useToast();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [detailVoice, setDetailVoice] = useState<LibraryVoice | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return libraryVoices.filter((v) => {
      const matchesSearch =
        v.name.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.language.toLowerCase().includes(q) ||
        v.style.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (selectedCategory === 'All') return true;
      if (selectedCategory === 'Favorites') return favoriteIds.has(v.id);
      return (
        v.category.toLowerCase().includes(selectedCategory.toLowerCase()) ||
        v.language.toLowerCase().includes(selectedCategory.toLowerCase()) ||
        v.gender.toLowerCase() === selectedCategory.toLowerCase() ||
        v.style.toLowerCase() === selectedCategory.toLowerCase()
      );
    });
  }, [libraryVoices, search, selectedCategory, favoriteIds]);

  const toggleFavorite = async (voiceId: string) => {
    if (!firebaseUser) return;
    const favId = `${firebaseUser.uid}_${voiceId}`;
    const ref = doc(db, 'favorites', favId);
    try {
      if (favoriteIds.has(voiceId)) {
        await deleteDoc(ref);
      } else {
        await setDoc(ref, {
          ownerId: firebaseUser.uid,
          libraryVoiceId: voiceId,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `favorites/${favId}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Voice Library
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Admin-curated licensed voices for Bangladeshi Bengali and English synthesis
        </p>
      </div>

      {/* Search & Filter Segmented Bar */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search library voices by accent, tone, language, or style..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-[#11151E] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-12 text-center space-y-2">
          <BookOpen className="w-7 h-7 text-slate-400 mx-auto" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No library voices match the active filter.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((voice) => {
            const isFav = favoriteIds.has(voice.id);
            return (
              <div
                key={voice.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={voice.avatarUrl || '/src/assets/images/voice_avatar_bangla_male_1795753412957.jpg'}
                        alt={voice.name}
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {voice.name}
                        </h3>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {voice.language} · {voice.gender} · {voice.style}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void toggleFavorite(voice.id)}
                      aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          isFav ? 'fill-rose-500 text-rose-500' : 'text-slate-400'
                        }`}
                      />
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {voice.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setDetailVoice(voice)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span>Details</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      notify(`Selected ${voice.name} for TTS`, 'info');
                      onNavigate('tts', { preselectVoiceId: voice.id });
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Use Voice</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Voice Details Drawer Modal */}
      {detailVoice && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="max-w-lg w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <img
                  src={detailVoice.avatarUrl || '/src/assets/images/voice_avatar_bangla_male_1795753412957.jpg'}
                  alt={detailVoice.name}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-xl object-cover"
                />
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    {detailVoice.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {detailVoice.language} · {detailVoice.category} · {detailVoice.style}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setDetailVoice(null)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {detailVoice.description}
            </p>

            {detailVoice.sampleUrl ? (
              <AudioPlayer src={detailVoice.sampleUrl} title="Licensed Voice Sample" compact />
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] p-3 text-xs text-slate-500 dark:text-slate-400">
                Sample audio preview will play here once the admin uploads a licensed reference clip or connects the target AI engine adapter (<span className="font-mono">{detailVoice.engineId || 'self_hosted_fastapi_worker'}</span>).
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDetailVoice(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = detailVoice.id;
                  setDetailVoice(null);
                  onNavigate('tts', { preselectVoiceId: id });
                }}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
              >
                Use in TTS Studio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
