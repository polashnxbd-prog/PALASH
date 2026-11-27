import {
  type User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  auth,
  db,
  googleAuthProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import type {
  AppSettings,
  AudioGeneration,
  LibraryVoice,
  UserProfile,
  VoiceProfile,
} from '../types/voicelab';

export const CREDIT_REFILL_CAP = 10000;
export const CREDIT_REFILL_INTERVAL_MS = 30 * 60 * 1000;

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  voiceProfiles: VoiceProfile[];
  generations: AudioGeneration[];
  libraryVoices: LibraryVoice[];
  favoriteIds: Set<string>;
  appSettings: AppSettings;
  secondsUntilRefill: number;
  refillingCredits: boolean;
  getIdToken: () => Promise<string | null>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updatePreferredLanguage: (lang: 'bn-BD' | 'en-US') => Promise<void>;
}

const DEFAULT_SETTINGS: AppSettings = {
  appName: 'VoiceLab AI Studio',
  tagline: 'Your Voice. Your Creativity. Your AI.',
  maintenanceMode: false,
  cloningCostCredits: 0,
  ttsCostPer1kChars: 15,
  voiceDesignCost: 25,
  voiceChangerCost: 20,
  dubbingCost: 40,
  soundFxCost: 15,
  podcastCost: 35,
  speechEnhanceCost: 10,
};

const SEED_LIBRARY_VOICES: Array<Omit<LibraryVoice, 'id' | 'createdAt' | 'updatedAt'> & { id: string }> = [
  {
    id: 'lib_dhaka_narrator_male',
    name: 'Arif — Dhaka Documentary',
    description: 'Deep, poised Bangladeshi Bengali & English male narrator suited for documentaries, audiobooks, and cinematic storytelling.',
    language: 'Bengali (Bangladesh)',
    category: 'Bangladeshi Bengali',
    gender: 'Male',
    style: 'Cinematic',
    avatarUrl: '/src/assets/images/voice_avatar_bangla_male_1795753412957.jpg',
    engineId: 'self_hosted_fastapi_worker',
    isPublic: true,
  },
  {
    id: 'lib_dhaka_story_female',
    name: 'Nadia — Warm Bangla Storyteller',
    description: 'Natural, expressive Bangladeshi female voice crafted for emotional fiction, podcasts, and conversational narration.',
    language: 'Bengali (Bangladesh)',
    category: 'Storytelling',
    gender: 'Female',
    style: 'Emotional',
    avatarUrl: '/src/assets/images/voice_avatar_bangla_female_1795753413638.jpg',
    engineId: 'fish_speech_bangla_adapter',
    isPublic: true,
  },
  {
    id: 'lib_bangla_news_anchor',
    name: 'Tariq — Broadcast News Desk',
    description: 'Crisp, authoritative Bangladeshi Bengali news presenter cadence with clear punctuation pacing.',
    language: 'Bengali (Bangladesh)',
    category: 'News',
    gender: 'Male',
    style: 'Professional',
    avatarUrl: '/src/assets/images/voice_avatar_bangla_male_1795753412957.jpg',
    engineId: 'self_hosted_fastapi_worker',
    isPublic: true,
  },
  {
    id: 'lib_english_studio_host',
    name: 'Elena — Studio Podcast Host',
    description: 'Warm, articulate English conversational host ideal for tech podcasts, product walkthroughs, and explainers.',
    language: 'English',
    category: 'Podcast',
    gender: 'Female',
    style: 'Calm',
    avatarUrl: '/src/assets/images/voice_avatar_bangla_female_1795753413638.jpg',
    engineId: 'xtts_v2_adapter',
    isPublic: true,
  },
  {
    id: 'lib_deep_trailer_voice',
    name: 'Rafi — Deep Motivational',
    description: 'Resonant low-register bilingual voice tailored for trailers, poetry recitations, and motivational scripts.',
    language: 'Bengali & English',
    category: 'Deep',
    gender: 'Male',
    style: 'Energetic',
    avatarUrl: '/src/assets/images/voice_avatar_mic_capsule_1795753413407.jpg',
    engineId: 'fish_speech_bangla_adapter',
    isPublic: true,
  },
];

const ADMIN_EMAIL = 'polashnxbd@gmail.com';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [generations, setGenerations] = useState<AudioGeneration[]>([]);
  const [libraryVoices, setLibraryVoices] = useState<LibraryVoice[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [secondsUntilRefill, setSecondsUntilRefill] = useState<number>(CREDIT_REFILL_INTERVAL_MS / 1000);
  const [refillingCredits, setRefillingCredits] = useState(false);
  const refillAttemptRef = useRef<number>(0);

  const isAdmin = Boolean(
    firebaseUser?.emailVerified && firebaseUser?.email?.toLowerCase() === ADMIN_EMAIL
  );

  const getIdToken = useCallback(async () => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleAuthProvider);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const updatePreferredLanguage = useCallback(
    async (lang: 'bn-BD' | 'en-US') => {
      if (!firebaseUser) return;
      const ref = doc(db, 'users', firebaseUser.uid);
      try {
        await updateDoc(ref, {
          preferredLanguage: lang,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${firebaseUser.uid}`);
      }
    },
    [firebaseUser]
  );

  // Auth listener & initial profile provisioning
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setVoiceProfiles([]);
        setGenerations([]);
        setFavoriteIds(new Set());
        setLoading(false);
        return;
      }

      const userPath = `users/${user.uid}`;
      const userRef = doc(db, 'users', user.uid);
      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          await setDoc(userRef, {
            uid: user.uid,
            name: user.displayName || user.email?.split('@')[0] || 'Creator',
            email: user.email || '',
            photoURL: user.photoURL || '',
            plan: 'free',
            credits: CREDIT_REFILL_CAP,
            preferredLanguage: 'bn-BD',
            totalGenerations: 0,
            totalDownloads: 0,
            suspended: false,
            lastCreditRefillAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.error('User initialization error:', err);
      }

      // Bootstrap admin defaults if primary admin signs in
      if (user.emailVerified && user.email?.toLowerCase() === ADMIN_EMAIL) {
        try {
          const settingsRef = doc(db, 'appSettings', 'global');
          const settingsSnap = await getDoc(settingsRef);
          if (!settingsSnap.exists()) {
            await setDoc(settingsRef, {
              ...DEFAULT_SETTINGS,
              updatedAt: serverTimestamp(),
            });
          }
          for (const seed of SEED_LIBRARY_VOICES) {
            const libRef = doc(db, 'voiceLibrary', seed.id);
            const libSnap = await getDoc(libRef);
            if (!libSnap.exists()) {
              const { id: _id, ...payload } = seed;
              await setDoc(libRef, {
                ...payload,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          }
        } catch (err) {
          console.error('Admin bootstrap note:', err);
        }
      }

      setLoading(false);
      void userPath;
    });
    return () => unsub();
  }, []);

  // Live Firestore subscriptions when authenticated
  useEffect(() => {
    if (!firebaseUser) return;
    const uid = firebaseUser.uid;

    const unsubUser = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
    );

    const unsubVoices = onSnapshot(
      query(collection(db, 'voiceProfiles'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<VoiceProfile, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setVoiceProfiles(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'voiceProfiles')
    );

    const unsubGens = onSnapshot(
      query(collection(db, 'audioGenerations'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AudioGeneration, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setGenerations(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'audioGenerations')
    );

    const unsubLibrary = onSnapshot(
      query(collection(db, 'voiceLibrary'), where('isPublic', '==', true)),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<LibraryVoice, 'id'>),
        }));
        setLibraryVoices(
          list.length > 0
            ? list
            : SEED_LIBRARY_VOICES.map((s) => ({ ...s }))
        );
      },
      () => {
        setLibraryVoices(SEED_LIBRARY_VOICES.map((s) => ({ ...s })));
      }
    );

    const unsubFavs = onSnapshot(
      query(collection(db, 'favorites'), where('ownerId', '==', uid)),
      (snap) => {
        const ids = new Set<string>();
        snap.docs.forEach((d) => {
          const libId = d.data().libraryVoiceId;
          if (typeof libId === 'string') ids.add(libId);
        });
        setFavoriteIds(ids);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'favorites')
    );

    const unsubSettings = onSnapshot(
      doc(db, 'appSettings', 'global'),
      (snap) => {
        if (snap.exists()) {
          setAppSettings({ ...DEFAULT_SETTINGS, ...(snap.data() as Partial<AppSettings>) });
        }
      },
      () => {
        setAppSettings(DEFAULT_SETTINGS);
      }
    );

    return () => {
      unsubUser();
      unsubVoices();
      unsubGens();
      unsubLibrary();
      unsubFavs();
      unsubSettings();
    };
  }, [firebaseUser]);

  // Real-time 30-minute auto-refill countdown & atomic 10,000-credit replacement
  useEffect(() => {
    if (!firebaseUser || !profile) {
      setSecondsUntilRefill(CREDIT_REFILL_INTERVAL_MS / 1000);
      return;
    }

    const uid = firebaseUser.uid;

    const checkAndRefill = async () => {
      const now = Date.now();
      const lastRefillMs = profile.lastCreditRefillAt?.toMillis?.() ?? 0;
      const nextRefillMs = lastRefillMs > 0 ? lastRefillMs + CREDIT_REFILL_INTERVAL_MS : now;
      const remainingSec = Math.max(0, Math.ceil((nextRefillMs - now) / 1000));
      setSecondsUntilRefill(remainingSec);

      // Wait until the 30-minute interval has elapsed (+3s server clock tolerance when lastRefillMs exists)
      const dueWithSkewGuard =
        lastRefillMs === 0 || now >= lastRefillMs + CREDIT_REFILL_INTERVAL_MS + 3000;

      if (
        dueWithSkewGuard &&
        profile.credits < CREDIT_REFILL_CAP &&
        now - refillAttemptRef.current > 8000
      ) {
        refillAttemptRef.current = now;
        setRefillingCredits(true);
        try {
          const refillDelta = Math.max(1, CREDIT_REFILL_CAP - profile.credits);
          const batch = writeBatch(db);
          batch.update(doc(db, 'users', uid), {
            credits: CREDIT_REFILL_CAP,
            lastCreditRefillAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batch.set(doc(collection(db, 'creditTransactions')), {
            ownerId: uid,
            type: 'auto_refill',
            amount: refillDelta,
            description: 'Auto-refill to 10,000 credits (30-min cycle)',
            createdAt: serverTimestamp(),
          });
          await batch.commit();
        } catch (err) {
          console.warn('Credit auto-refill pending server time check:', err);
        } finally {
          setRefillingCredits(false);
        }
      }
    };

    void checkAndRefill();
    const timer = window.setInterval(() => {
      void checkAndRefill();
    }, 1000);

    return () => window.clearInterval(timer);
  }, [firebaseUser, profile]);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        isAdmin,
        voiceProfiles,
        generations,
        libraryVoices,
        favoriteIds,
        appSettings,
        secondsUntilRefill,
        refillingCredits,
        getIdToken,
        signInWithGoogle,
        signOut,
        updatePreferredLanguage,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
