import type { Timestamp } from 'firebase/firestore';

export type AppSection =
  | 'dashboard'
  | 'clone'
  | 'my-voices'
  | 'tts'
  | 'library'
  | 'studio'
  | 'tools'
  | 'history'
  | 'billing'
  | 'profile'
  | 'admin';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  plan: 'free' | 'creator' | 'pro' | 'studio';
  credits: number;
  preferredLanguage: 'bn-BD' | 'en-US';
  totalGenerations: number;
  totalDownloads: number;
  suspended: boolean;
  lastCreditRefillAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface VoiceProfile {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  language: 'bn-BD' | 'en-US' | 'multilingual';
  characteristics?: string[];
  avatarUrl?: string;
  sampleId: string;
  sampleFileName: string;
  sampleDurationSec: number;
  sampleSizeBytes: number;
  sampleMimeType?: string;
  engineAdapterId?: string;
  status: 'validating' | 'queued' | 'awaiting_engine' | 'completed' | 'failed';
  consentConfirmed: boolean;
  isFavorite: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AudioGeneration {
  id: string;
  ownerId: string;
  title: string;
  tool: 'tts' | 'voice_changer' | 'dubbing' | 'podcast' | 'sound_fx' | 'speech_enhance' | 'audio_studio';
  voiceId?: string;
  voiceName: string;
  language: string;
  textPreview?: string;
  durationSec: number;
  creditsCost: number;
  status: 'queued' | 'processing' | 'awaiting_engine' | 'completed' | 'failed';
  audioUrl?: string;
  isFavorite: boolean;
  createdAt?: Timestamp;
}

export interface LibraryVoice {
  id: string;
  name: string;
  description: string;
  language: string;
  category: string;
  gender: string;
  style: string;
  avatarUrl?: string;
  sampleUrl?: string;
  engineId?: string;
  isPublic: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CreditTransaction {
  id: string;
  ownerId: string;
  type: 'signup_bonus' | 'generation_debit' | 'auto_refill' | 'refund' | 'admin_adjustment';
  amount: number;
  description: string;
  referenceId?: string;
  createdAt?: Timestamp;
}

export interface AbuseReport {
  id: string;
  reporterId: string;
  targetVoiceId: string;
  reason: string;
  details?: string;
  status: 'open' | 'reviewed' | 'resolved';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AppSettings {
  appName: string;
  tagline?: string;
  maintenanceMode: boolean;
  cloningCostCredits: number;
  ttsCostPer1kChars: number;
  voiceDesignCost?: number;
  voiceChangerCost?: number;
  dubbingCost?: number;
  soundFxCost?: number;
  podcastCost?: number;
  speechEnhanceCost?: number;
  updatedAt?: Timestamp;
}

export interface EngineAdapterStatus {
  id: string;
  name: string;
  providerType: 'self_hosted_fastapi' | 'xtts_v2' | 'fish_speech' | 'f5_tts' | 'cosyvoice' | 'external_rest';
  status: 'connected' | 'not_configured' | 'unreachable' | 'disabled';
  capabilities: string[];
  supportsBangla: boolean;
  supportsBangladeshiAccent: boolean;
  supportsCloning: boolean;
  supportsEmotion: boolean;
  supportsControls: {
    stability: boolean;
    similarity: boolean;
    speed: boolean;
    pitch: boolean;
    styleIntensity: boolean;
    emotion: boolean;
  };
  notes: string;
  lastCheckedAt: string;
}

export interface BackgroundJob {
  id: string;
  ownerId: string;
  type: string;
  status: 'uploading' | 'validating' | 'queued' | 'processing' | 'awaiting_engine' | 'completed' | 'failed';
  progress: number;
  title: string;
  engineAdapterId?: string;
  message: string;
  createdAt: string;
  updatedAt: string;
}

export interface AudioInspectionResult {
  valid: boolean;
  error?: string;
  format: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  peakDb?: number;
  rmsDb?: number;
  clippingDetected?: boolean;
  silenceRatio?: number;
  suitability: 'optimal' | 'acceptable' | 'too_short' | 'needs_review' | 'unmeasured';
  recommendations: string[];
  deepAnalysisAvailable: boolean;
}
