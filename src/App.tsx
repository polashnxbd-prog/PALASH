import { Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { AppShell } from './components/AppShell';
import { AuthGate } from './components/AuthGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminPage } from './pages/AdminPage';
import { AdvancedToolsPage } from './pages/AdvancedToolsPage';
import { AudioStudioPage } from './pages/AudioStudioPage';
import { BillingAndApiPage } from './pages/BillingAndApiPage';
import { DashboardPage } from './pages/DashboardPage';
import { HistoryPage } from './pages/HistoryPage';
import { MyVoicesPage } from './pages/MyVoicesPage';
import { ProfilePage } from './pages/ProfilePage';
import { TextToSpeechPage } from './pages/TextToSpeechPage';
import { VoiceCloningPage } from './pages/VoiceCloningPage';
import { VoiceLibraryPage } from './pages/VoiceLibraryPage';
import type { AppSection } from './types/voicelab';

function StudioRouter() {
  const { firebaseUser, loading } = useAuth();
  const [activeSection, setActiveSection] = useState<AppSection>('dashboard');
  const [preselectVoiceId, setPreselectVoiceId] = useState<string | undefined>(undefined);
  const [toolTab, setToolTab] = useState<string | undefined>(undefined);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#090B10]">
        <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
          <span>Loading VoiceLab AI Studio...</span>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <AuthGate />;
  }

  const navigate = (
    section: AppSection,
    options?: { preselectVoiceId?: string; toolTab?: string }
  ) => {
    setPreselectVoiceId(options?.preselectVoiceId);
    setToolTab(options?.toolTab);
    setActiveSection(section);
  };

  return (
    <AppShell activeSection={activeSection} onNavigate={(s) => navigate(s)}>
      {activeSection === 'dashboard' && <DashboardPage onNavigate={navigate} />}
      {activeSection === 'clone' && <VoiceCloningPage onNavigate={(s) => navigate(s)} />}
      {activeSection === 'my-voices' && <MyVoicesPage onNavigate={navigate} />}
      {activeSection === 'tts' && <TextToSpeechPage preselectedVoiceId={preselectVoiceId} />}
      {activeSection === 'library' && <VoiceLibraryPage onNavigate={navigate} />}
      {activeSection === 'studio' && <AudioStudioPage />}
      {activeSection === 'tools' && <AdvancedToolsPage initialTab={toolTab} />}
      {activeSection === 'history' && <HistoryPage />}
      {activeSection === 'billing' && <BillingAndApiPage />}
      {activeSection === 'profile' && <ProfilePage />}
      {activeSection === 'admin' && <AdminPage />}
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <StudioRouter />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
