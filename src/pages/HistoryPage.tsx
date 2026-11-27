import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { History, Search, Star, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { AudioPlayer } from '../components/AudioPlayer';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { fetchUserJobs } from '../lib/api';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { BackgroundJob } from '../types/voicelab';

export function HistoryPage() {
  const { generations, getIdToken } = useAuth();
  const { notify } = useToast();

  const [search, setSearch] = useState('');
  const [toolFilter, setToolFilter] = useState('all');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);

  useEffect(() => {
    getIdToken().then((token) => {
      if (token) void fetchUserJobs(token).then(setJobs);
    });
  }, [getIdToken]);

  const filteredGenerations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return generations.filter((g) => {
      if (onlyFavorites && !g.isFavorite) return false;
      if (toolFilter !== 'all' && g.tool !== toolFilter) return false;
      return (
        g.title.toLowerCase().includes(q) ||
        g.voiceName.toLowerCase().includes(q) ||
        g.language.toLowerCase().includes(q)
      );
    });
  }, [generations, search, toolFilter, onlyFavorites]);

  const toggleFavorite = async (id: string, current: boolean) => {
    try {
      await updateDoc(doc(db, 'audioGenerations', id), { isFavorite: !current });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `audioGenerations/${id}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'audioGenerations', id));
      notify('Generation entry deleted', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `audioGenerations/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Generation History &amp; Job Queue
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Review audio exports, background worker jobs, and favorites
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, voice, or language..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] text-sm"
          />
        </div>
        <select
          value={toolFilter}
          onChange={(e) => setToolFilter(e.target.value)}
          className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] text-sm"
        >
          <option value="all">All Tools</option>
          <option value="tts">Text to Speech</option>
          <option value="audio_studio">Audio Studio</option>
          <option value="voice_changer">Voice Changer</option>
          <option value="dubbing">AI Dubbing</option>
          <option value="podcast">Podcast</option>
          <option value="sound_fx">Sound Effects</option>
        </select>
        <button
          type="button"
          onClick={() => setOnlyFavorites((f) => !f)}
          className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-xs font-medium ${
            onlyFavorites
              ? 'border-amber-500 bg-amber-500/10 text-amber-500'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] text-slate-600 dark:text-slate-300'
          }`}
        >
          <Star className="w-3.5 h-3.5" />
          <span>Favorites</span>
        </button>
      </div>

      {/* Audio Generation Records */}
      {filteredGenerations.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-10 text-center space-y-2">
          <History className="w-7 h-7 text-slate-400 mx-auto" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No audio generation history matches your filters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGenerations.map((gen) => (
            <div
              key={gen.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {gen.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {gen.tool.toUpperCase()} · {gen.voiceName} · {gen.language} ·{' '}
                    <span className="font-mono tabular-nums">{gen.durationSec}s</span> ·{' '}
                    {gen.status}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void toggleFavorite(gen.id, gen.isFavorite)}
                    aria-label="Favorite generation"
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        gen.isFavorite ? 'fill-amber-400 text-amber-400' : 'text-slate-400'
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(gen.id)}
                    aria-label="Delete generation"
                    className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {gen.audioUrl && (
                <AudioPlayer
                  src={gen.audioUrl}
                  requiresAuth
                  fileName={`${gen.title.slice(0, 24)}.wav`}
                  compact
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Backend Queue Log */}
      {jobs.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Recent Server Background Jobs
          </h2>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            {jobs.map((job) => (
              <div key={job.id} className="py-2.5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 dark:text-white truncate">
                    {job.title}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 truncate">{job.message}</div>
                </div>
                <span className="font-mono uppercase text-indigo-500 shrink-0">
                  {job.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
