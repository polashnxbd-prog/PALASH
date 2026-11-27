import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { Cpu, Plus, RefreshCw, ShieldAlert, Trash2, Users } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { fetchAdminMetrics } from '../lib/api';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { AbuseReport, EngineAdapterStatus, UserProfile } from '../types/voicelab';

export function AdminPage() {
  const { isAdmin, libraryVoices, appSettings, getIdToken } = useAuth();
  const { notify } = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<AbuseReport[]>([]);
  const [metrics, setMetrics] = useState<{
    queue: { totalJobs: number; queued: number; awaitingEngine: number; completed: number; failed: number };
    storage: { storedSamplesCount: number; totalSampleMb: number };
    adapters: EngineAdapterStatus[];
  } | null>(null);

  // Billing config state
  const [ttsCost, setTtsCost] = useState(appSettings.ttsCostPer1kChars);
  const [changerCost, setChangerCost] = useState(appSettings.voiceChangerCost ?? 20);
  const [dubbingCost, setDubbingCost] = useState(appSettings.dubbingCost ?? 40);
  const [maintenanceMode, setMaintenanceMode] = useState(appSettings.maintenanceMode);

  // Add library voice state
  const [newVoiceName, setNewVoiceName] = useState('');
  const [newVoiceLang, setNewVoiceLang] = useState('Bengali (Bangladesh)');
  const [newVoiceGender, setNewVoiceGender] = useState('Male');
  const [newVoiceStyle, setNewVoiceStyle] = useState('Storytelling');
  const [newVoiceDesc, setNewVoiceDesc] = useState('');

  const refreshMetrics = async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetchAdminMetrics(token);
      setMetrics(res);
    } catch {
      // Ignore if not admin
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    void refreshMetrics();

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => setUsers(snap.docs.map((d) => d.data() as UserProfile)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    const unsubReports = onSnapshot(
      collection(db, 'abuseReports'),
      (snap) =>
        setReports(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AbuseReport, 'id'>) }))
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'abuseReports')
    );

    return () => {
      unsubUsers();
      unsubReports();
    };
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-500">
        Administrator privileges are required to view this console.
      </div>
    );
  }

  const handleSaveBillingSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'appSettings', 'global'), {
        appName: appSettings.appName,
        tagline: appSettings.tagline || 'Your Voice. Your Creativity. Your AI.',
        maintenanceMode,
        cloningCostCredits: 0, // Strictly locked to 0
        ttsCostPer1kChars: Number(ttsCost),
        voiceDesignCost: appSettings.voiceDesignCost ?? 25,
        voiceChangerCost: Number(changerCost),
        dubbingCost: Number(dubbingCost),
        soundFxCost: appSettings.soundFxCost ?? 15,
        podcastCost: appSettings.podcastCost ?? 35,
        speechEnhanceCost: appSettings.speechEnhanceCost ?? 10,
        updatedAt: serverTimestamp(),
      });
      notify('Platform billing & maintenance settings saved', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'appSettings/global');
    }
  };

  const handleAddLibraryVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVoiceName.trim()) return;
    const id = `lib_${Date.now()}`;
    try {
      await setDoc(doc(db, 'voiceLibrary', id), {
        name: newVoiceName.trim(),
        description: newVoiceDesc.trim() || 'Licensed studio voice.',
        language: newVoiceLang,
        category: newVoiceLang.includes('Bengali') ? 'Bangladeshi Bengali' : 'English',
        gender: newVoiceGender,
        style: newVoiceStyle,
        avatarUrl:
          newVoiceGender === 'Female'
            ? '/src/assets/images/voice_avatar_bangla_female_1795753413638.jpg'
            : '/src/assets/images/voice_avatar_bangla_male_1795753412957.jpg',
        engineId: 'self_hosted_fastapi_worker',
        isPublic: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewVoiceName('');
      setNewVoiceDesc('');
      notify('Library voice published', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `voiceLibrary/${id}`);
    }
  };

  const handleToggleSuspend = async (u: UserProfile) => {
    try {
      await updateDoc(doc(db, 'users', u.uid), {
        suspended: !u.suspended,
        updatedAt: serverTimestamp(),
      });
      notify(u.suspended ? 'User unsuspended' : 'User suspended', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${u.uid}`);
    }
  };

  const handleResolveReport = async (report: AbuseReport) => {
    try {
      await updateDoc(doc(db, 'abuseReports', report.id), {
        status: 'resolved',
        updatedAt: serverTimestamp(),
      });
      notify('Report marked resolved', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `abuseReports/${report.id}`);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Admin Console
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            AI engine adapters, queue infrastructure, voice library, pricing, and safety moderation
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refreshMetrics()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Engine Health</span>
        </button>
      </div>

      {/* Real Infrastructure & Account Metrics */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5">
          <div className="text-xs text-slate-500">Registered Users</div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1">{users.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5">
          <div className="text-xs text-slate-500">Stored Voice Samples</div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1">
            {metrics?.storage.storedSamplesCount ?? 0}
          </div>
          <div className="text-xs font-mono text-slate-500">{metrics?.storage.totalSampleMb ?? 0} MB</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5">
          <div className="text-xs text-slate-500">Queue Jobs</div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1">
            {metrics?.queue.totalJobs ?? 0}
          </div>
          <div className="text-xs text-slate-500">
            {metrics?.queue.awaitingEngine ?? 0} awaiting GPU worker
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5">
          <div className="text-xs text-slate-500">Open Safety Reports</div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1">
            {reports.filter((r) => r.status === 'open').length}
          </div>
        </div>
      </section>

      {/* AI Engine Adapters */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-indigo-500" />
          <h2 className="text-base font-semibold">Modular AI Engine Adapters</h2>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {(metrics?.adapters || []).map((adapter) => (
            <div key={adapter.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-slate-900 dark:text-white">
                  {adapter.name}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Capabilities: {adapter.capabilities.join(', ')} · Bangla:{' '}
                  {adapter.supportsBangla ? 'Supported' : 'Requires fine-tune'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{adapter.notes}</div>
              </div>
              <span
                className={`text-xs font-mono uppercase font-semibold shrink-0 ${
                  adapter.status === 'connected' ? 'text-emerald-500' : 'text-amber-500'
                }`}
              >
                {adapter.status.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing & Credit Configuration */}
      <section className="grid lg:grid-cols-2 gap-6">
        <form
          onSubmit={handleSaveBillingSettings}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-4"
        >
          <h2 className="text-base font-semibold">Pricing &amp; Credit Rules</h2>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-medium mb-1">Voice Cloning Cost (Locked)</label>
              <input
                type="number"
                disabled
                value={0}
                className="w-full px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 font-mono text-emerald-600 dark:text-emerald-400"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">TTS Credits / 1k chars</label>
              <input
                type="number"
                min={0}
                value={ttsCost}
                onChange={(e) => setTtsCost(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] font-mono"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Voice Changer Cost</label>
              <input
                type="number"
                min={0}
                value={changerCost}
                onChange={(e) => setChangerCost(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] font-mono"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">AI Dubbing Cost</label>
              <input
                type="number"
                min={0}
                value={dubbingCost}
                onChange={(e) => setDubbingCost(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] font-mono"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={maintenanceMode}
              onChange={(e) => setMaintenanceMode(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span>Enable Maintenance Mode Notice</span>
          </label>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
          >
            Save Pricing Configuration
          </button>
        </form>

        {/* Add Voice Library Entry */}
        <form
          onSubmit={handleAddLibraryVoice}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Voice Library Manager</h2>
            <span className="text-xs text-slate-500">{libraryVoices.length} public voices</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <input
              type="text"
              required
              placeholder="Voice display name"
              value={newVoiceName}
              onChange={(e) => setNewVoiceName(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10]"
            />
            <select
              value={newVoiceLang}
              onChange={(e) => setNewVoiceLang(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10]"
            >
              <option>Bengali (Bangladesh)</option>
              <option>English</option>
              <option>Bengali &amp; English</option>
            </select>
            <select
              value={newVoiceGender}
              onChange={(e) => setNewVoiceGender(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10]"
            >
              <option>Male</option>
              <option>Female</option>
            </select>
            <input
              type="text"
              placeholder="Style (e.g. Storytelling)"
              value={newVoiceStyle}
              onChange={(e) => setNewVoiceStyle(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10]"
            />
          </div>
          <input
            type="text"
            placeholder="Voice description"
            value={newVoiceDesc}
            onChange={(e) => setNewVoiceDesc(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Library Voice</span>
          </button>
        </form>
      </section>

      {/* User Management & Abuse Reports */}
      <section className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-500" />
            <h2 className="text-base font-semibold">Users</h2>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            {users.map((u) => (
              <div key={u.uid} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{u.name}</div>
                  <div className="text-slate-500 truncate">
                    {u.email} · {u.credits} cr · {u.plan}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleToggleSuspend(u)}
                  className={`px-2.5 py-1 rounded text-xs font-medium shrink-0 ${
                    u.suspended
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : 'bg-rose-500/10 text-rose-500'
                  }`}
                >
                  {u.suspended ? 'Unsuspend' : 'Suspend'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            <h2 className="text-base font-semibold">Cloning Safety Reports</h2>
          </div>
          {reports.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">No abuse reports submitted.</p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {reports.map((r) => (
                <div key={r.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{r.reason}</div>
                    <div className="text-slate-500 truncate">
                      Voice ID: {r.targetVoiceId} · Status: {r.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {r.status !== 'resolved' && (
                      <button
                        type="button"
                        onClick={() => void handleResolveReport(r)}
                        className="px-2.5 py-1 rounded bg-indigo-600 text-white"
                      >
                        Resolve
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void deleteDoc(doc(db, 'abuseReports', r.id))}
                      aria-label="Delete report"
                      className="p-1.5 text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
