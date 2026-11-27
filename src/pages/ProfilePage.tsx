import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Shield, Trash2, User } from 'lucide-react';
import React, { useState } from 'react';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { deleteSampleAsset } from '../lib/api';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';

export function ProfilePage() {
  const { firebaseUser, profile, voiceProfiles, generations, getIdToken, signOut, updatePreferredLanguage } =
    useAuth();
  const { notify } = useToast();

  const [displayName, setDisplayName] = useState(profile?.name || '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState('');

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !displayName.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        name: displayName.trim(),
        updatedAt: serverTimestamp(),
      });
      notify('Profile updated', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${firebaseUser.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccountData = async () => {
    if (!firebaseUser || confirmDelete !== 'DELETE') return;
    try {
      const token = await getIdToken();
      for (const vp of voiceProfiles) {
        if (token && vp.sampleId) {
          await deleteSampleAsset(token, vp.sampleId).catch(() => {});
        }
        await deleteDoc(doc(db, 'voiceProfiles', vp.id));
        await deleteDoc(doc(db, 'consentRecords', `cns_${vp.id}`)).catch(() => {});
      }
      for (const gen of generations) {
        await deleteDoc(doc(db, 'audioGenerations', gen.id)).catch(() => {});
      }
      await deleteDoc(doc(db, 'users', firebaseUser.uid));
      notify('All user voice data and profile records deleted', 'success');
      await signOut();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${firebaseUser.uid}`);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Profile, Privacy &amp; Voice Data Policy
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Manage your identity, preferred language, and permanent data deletion controls
        </p>
      </div>

      {/* Account Settings */}
      <form
        onSubmit={handleUpdateProfile}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          {profile?.photoURL ? (
            <img
              src={profile.photoURL}
              alt={profile.name}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-indigo-600/15 flex items-center justify-center">
              <User className="w-6 h-6 text-indigo-500" />
            </div>
          )}
          <div>
            <div className="text-sm font-semibold">{profile?.name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {profile?.email} · UID: <span className="font-mono">{profile?.uid}</span>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Preferred Studio Language</label>
            <select
              value={profile?.preferredLanguage || 'bn-BD'}
              onChange={(e) => void updatePreferredLanguage(e.target.value as 'bn-BD' | 'en-US')}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-sm"
            >
              <option value="bn-BD">Bengali (Bangladesh)</option>
              <option value="en-US">English</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
        >
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>

      {/* Voice Data & Privacy Policy */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11151E] p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-500" />
          <h2 className="text-sm font-semibold">Voice Data &amp; Responsible Cloning Policy</h2>
        </div>
        <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 leading-relaxed">
          <li>• Uploaded and microphone-recorded voice samples are stored strictly privately under your verified user ID and are never publicly listed.</li>
          <li>• Cloning requires explicit speaker ownership or permission confirmation, logged immutably in <code className="font-mono">consentRecords</code>.</li>
          <li>• Deleting a cloned voice immediately deletes its Firestore profile and purges the underlying audio file from server storage.</li>
          <li>• Unauthorized impersonation, fraud, or harassment violates platform terms and results in account suspension.</li>
        </ul>
      </div>

      {/* Delete Account & Data */}
      <div className="rounded-xl border border-rose-500/30 bg-white dark:bg-[#11151E] p-6 space-y-3">
        <div className="flex items-center gap-2 text-rose-500">
          <Trash2 className="w-4 h-4" />
          <h2 className="text-sm font-semibold">Delete Account &amp; Voice Samples</h2>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Type <span className="font-mono font-semibold">DELETE</span> to permanently remove your voice profiles, uploaded samples, generation history, and profile record.
        </p>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={confirmDelete}
            onChange={(e) => setConfirmDelete(e.target.value)}
            placeholder="Type DELETE to confirm"
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090B10] text-xs font-mono"
          />
          <button
            type="button"
            disabled={confirmDelete !== 'DELETE'}
            onClick={() => void handleDeleteAccountData()}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-medium"
          >
            Permanently Delete My Data
          </button>
        </div>
      </div>
    </div>
  );
}
