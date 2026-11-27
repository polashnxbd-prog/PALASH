import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  Flag,
  Mic,
  MoreVertical,
  Pencil,
  Search,
  Star,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { AudioPlayer } from '../components/AudioPlayer';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { deleteSampleAsset } from '../lib/api';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { AppSection, VoiceProfile } from '../types/voicelab';

interface MyVoicesPageProps {
  onNavigate: (section: AppSection, options?: { preselectVoiceId?: string }) => void;
}

export function MyVoicesPage({ onNavigate }: MyVoicesPageProps) {
  const { firebaseUser, voiceProfiles, getIdToken } = useAuth();
  const { notify } = useToast();

  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [previewVoiceId, setPreviewVoiceId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Edit modal
  const [editingVoice, setEditingVoice] = useState<VoiceProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLanguage, setEditLanguage] = useState<'bn-BD' | 'en-US' | 'multilingual'>('bn-BD');

  // Report modal
  const [reportingVoice, setReportingVoice] = useState<VoiceProfile | null>(null);
  const [reportReason, setReportReason] = useState('Unauthorized impersonation');
  const [reportDetails, setReportDetails] = useState('');

  const filteredVoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = voiceProfiles.filter(
      (vp) =>
        vp.name.toLowerCase().includes(q) ||
        (vp.description || '').toLowerCase().includes(q) ||
        vp.language.toLowerCase().includes(q)
    );
    return list.sort((a, b) => {
      if (sortOrder === 'name') return a.name.localeCompare(b.name);
      const tA = a.createdAt?.toMillis?.() || 0;
      const tB = b.createdAt?.toMillis?.() || 0;
      return sortOrder === 'newest' ? tB - tA : tA - tB;
    });
  }, [voiceProfiles, search, sortOrder]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVoice) return;
    try {
      await updateDoc(doc(db, 'voiceProfiles', editingVoice.id), {
        name: editName.trim(),
        description: editDescription.trim(),
        language: editLanguage,
        updatedAt: serverTimestamp(),
      });
      notify('Voice profile updated', 'success');
      setEditingVoice(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `voiceProfiles/${editingVoice.id}`);
    }
  };

  const handleDeleteVoice = async (vp: VoiceProfile) => {
    try {
      const token = await getIdToken();
      if (token && vp.sampleId) {
        await deleteSampleAsset(token, vp.sampleId).catch(() => {});
      }
      await deleteDoc(doc(db, 'voiceProfiles', vp.id));
      await deleteDoc(doc(db, 'consentRecords', `cns_${vp.id}`)).catch(() => {});
      notify('Voice profile and sample audio permanently deleted', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `voiceProfiles/${vp.id}`);
    }
  };

  const handleToggleFavorite = async (vp: VoiceProfile) => {
    try {
      await updateDoc(doc(db, 'voiceProfiles', vp.id), {
        isFavorite: !vp.isFavorite,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `voiceProfiles/${vp.id}`);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !reportingVoice) return;
    try {
      await addDoc(collection(db, 'abuseReports'), {
        reporterId: firebaseUser.uid,
        targetVoiceId: reportingVoice.id,
        reason: reportReason,
        details: reportDetails.trim(),
        status: 'open',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      notify('Safety report submitted for admin review', 'info');
      setReportingVoice(null);
      setReportDetails('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'abuseReports');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            My Voices
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Unlimited saved voice profiles · {voiceProfiles.length} active profiles · Private to your account
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('clone')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors whitespace-nowrap self-start"
        >
          <Mic className="w-4 h-4" />
          <span>New Free Voice Clone</span>
        </button>
      </div>

      {/* Search & Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cloned voices by name, language, or description..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest' | 'name')}
          className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] text-sm text-slate-900 dark:text-white"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="name">Name (A–Z)</option>
        </select>
      </div>

      {/* Profiles Grid */}
      {filteredVoices.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-12 text-center space-y-3">
          <Mic className="w-8 h-8 text-indigo-500 mx-auto" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {voiceProfiles.length === 0 ? 'No cloned voices yet' : 'No voices match your search'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Create unlimited free voice profiles by uploading an audio file or recording straight from your phone or desktop microphone.
          </p>
          {voiceProfiles.length === 0 && (
            <button
              type="button"
              onClick={() => onNavigate('clone')}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              Clone My Voice — Free
            </button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredVoices.map((vp) => {
            const isPreviewing = previewVoiceId === vp.id;
            return (
              <div
                key={vp.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 flex flex-col justify-between gap-4 relative"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={vp.avatarUrl || '/src/assets/images/voice_avatar_mic_capsule_1795753413407.jpg'}
                        alt={vp.name}
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                          {vp.name}
                        </h3>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {vp.language === 'bn-BD' ? 'Bengali (BD)' : vp.language} ·{' '}
                          {vp.sampleDurationSec}s
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleToggleFavorite(vp)}
                        aria-label="Toggle favorite"
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            vp.isFavorite
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-400'
                          }`}
                        />
                      </button>

                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenMenuId(openMenuId === vp.id ? null : vp.id)}
                          aria-label="More voice options"
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {openMenuId === vp.id && (
                          <div className="absolute right-0 mt-1 w-44 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B26] shadow-lg py-1 z-20 text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingVoice(vp);
                                setEditName(vp.name);
                                setEditDescription(vp.description || '');
                                setEditLanguage(vp.language);
                                setOpenMenuId(null);
                              }}
                              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Rename / Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReportingVoice(vp);
                                setOpenMenuId(null);
                              }}
                              className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Flag className="w-3.5 h-3.5" />
                              <span>Report Issue</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                void handleDeleteVoice(vp);
                              }}
                              className="w-full px-3 py-2 text-left flex items-center gap-2 text-rose-500 hover:bg-rose-500/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Permanently</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {vp.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                      {vp.description}
                    </p>
                  )}

                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {(vp.characteristics || []).join(' · ') || 'Custom Voice'} · Status:{' '}
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {vp.status === 'awaiting_engine'
                        ? 'Sample Stored (Awaiting GPU Worker)'
                        : vp.status}
                    </span>
                  </div>
                </div>

                {isPreviewing && (
                  <AudioPlayer
                    src={`/api/v1/samples/${vp.sampleId}/audio`}
                    requiresAuth
                    fileName={vp.sampleFileName}
                    compact
                  />
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPreviewVoiceId(isPreviewing ? null : vp.id)}
                    className="flex-1 py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {isPreviewing ? 'Hide Sample' : 'Preview Sample'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('tts', { preselectVoiceId: vp.id })}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
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

      {/* Rename / Edit Modal */}
      {editingVoice && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Edit Voice Profile</h3>
              <button type="button" onClick={() => setEditingVoice(null)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Voice Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Language</label>
                <select
                  value={editLanguage}
                  onChange={(e) => setEditLanguage(e.target.value as 'bn-BD' | 'en-US' | 'multilingual')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-sm"
                >
                  <option value="bn-BD">Bengali (Bangladesh)</option>
                  <option value="en-US">English</option>
                  <option value="multilingual">Multilingual</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingVoice(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Safety Report Modal */}
      {reportingVoice && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitReport}
            className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Report Voice Profile</h3>
              <button type="button" onClick={() => setReportingVoice(null)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Reason</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-sm"
                >
                  <option value="Unauthorized impersonation">Unauthorized impersonation</option>
                  <option value="Audio corruption or upload error">Audio corruption or upload error</option>
                  <option value="Fraudulent or abusive content">Fraudulent or abusive content</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Details</label>
                <textarea
                  rows={3}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Provide context for moderation review..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportingVoice(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium"
              >
                Submit Report
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
