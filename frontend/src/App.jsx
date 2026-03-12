import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import Dashboard from './components/Dashboard';
import PatientProfile from './components/PatientProfile';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import LoginPage from './components/LoginPage';
import LandingPage from './components/LandingPage';
import SettingsPanel from './components/SettingsPanel';
import PluginPanel from './components/PluginPanel';
import APIDocsViewer from './components/APIDocsViewer';
import TeamSettings from './components/TeamSettings';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import DiagnosticLog from './components/DiagnosticLog';
import UpgradeModal from './components/UpgradeModal';
import { LicenseProvider, useLicense } from './hooks/useLicense';
import './App.css';

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('vibrana_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('vibrana_token') || null);
  const [showLogin, setShowLogin] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('vibrana_theme') || 'dark');

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vibrana_theme', theme);
  }, [theme]);

  const handleLogin = (userData, tokenStr) => {
    setUser(userData);
    setToken(tokenStr);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('vibrana_token');
    localStorage.removeItem('vibrana_user');
  };

  const toggleTheme = () => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
    toast.success(`Switched to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  };

  const handleShortcutAction = (action) => {
    if (action === 'theme') toggleTheme();
    else if (action === 'scan') toast('Ctrl+S: Trigger scan from Dashboard', { icon: '⌨️' });
    else if (action === 'search') {
      const input = document.querySelector('.search-input, input[type="text"]');
      if (input) input.focus();
    }
  };

  // Show landing or login if not authenticated
  if (!user) {
    return (
      <>
        <Toaster position="top-right" toastOptions={{
          duration: 3000,
          style: { background: '#1f2b47', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', fontSize: '0.85rem' },
          success: { iconTheme: { primary: '#50fa7b', secondary: '#0f0f1a' } },
          error: { iconTheme: { primary: '#ff5555', secondary: '#0f0f1a' } },
        }} />
        {showLogin ? (
          <div style={{ position: 'relative' }}>
            <button
              className="btn-back-to-landing"
              onClick={() => setShowLogin(false)}
            >
              ← Back
            </button>
            <LoginPage onLogin={handleLogin} />
          </div>
        ) : (
          <LandingPage onGetStarted={() => setShowLogin(true)} />
        )}
      </>
    );
  }

const RequireLicense = ({ children }) => {
  const { paywall_enabled, tier, loading } = useLicense();

  if (loading) {
    return (
      <div className="dashboard-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="vfx-pulse">Verificando suscripción...</div>
      </div>
    );
  }

  // If paywall is ON and tier is free, block access
  if (paywall_enabled && tier === 'free') {
    return (
      <div className="dashboard-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div className="glass p-8 rounded-xl max-w-md w-full border border-accent/30 vfx-fade-in">
          <h2 className="text-2xl font-bold mb-4" style={{ color: '#bd93f9' }}>Suscripción Requerida</h2>
          <p className="text-sm opacity-80 mb-6">
            Para acceder a Vibrana, necesita una suscripción activa vinculada a su cuenta de correo electrónico.
          </p>
          <div className="flex flex-col gap-4">
            <a href="https://vibrana.com/pricing" target="_blank" rel="noreferrer" className="btn btn-primary w-full">
              Ver Planes y Suscribirse
            </a>
            <button className="btn btn-ghost w-full" onClick={() => {
              localStorage.removeItem('vibrana_token');
              localStorage.removeItem('vibrana_user');
              window.location.reload();
            }}>
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
};

// ... inside App component return:
  return (
    <LicenseProvider>
      <RequireLicense>
        <Router>
          <KeyboardShortcuts onAction={handleShortcutAction} />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              className: 'toast-custom',
              style: {
                background: '#1f2b47',
                color: '#e2e8f0',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '8px',
                fontSize: '0.85rem',
              },
              success: { iconTheme: { primary: '#50fa7b', secondary: '#0f0f1a' } },
              error: { iconTheme: { primary: '#ff5555', secondary: '#0f0f1a' } },
            }}
          />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/patients/:id" element={<PatientProfile />} />
            <Route path="/analytics" element={
              <PageWrapper theme={theme} toggleTheme={toggleTheme}><AnalyticsDashboard /></PageWrapper>
            } />
            <Route path="/settings" element={
              <PageWrapper theme={theme} toggleTheme={toggleTheme}><SettingsPanel user={user} token={token} onLogout={handleLogout} /></PageWrapper>
            } />
            <Route path="/api-docs" element={
              <PageWrapper title="API Documentation" theme={theme} toggleTheme={toggleTheme}><APIDocsViewer /></PageWrapper>
            } />
            <Route path="/plugins" element={
              <PageWrapper title="Plugin Manager" theme={theme} toggleTheme={toggleTheme}><PluginPanel token={token} /></PageWrapper>
            } />
            <Route path="/diagnostic-logs" element={
              <PageWrapper title="Diagnostic Log" theme={theme} toggleTheme={toggleTheme}><DiagnosticLog /></PageWrapper>
            } />
            <Route path="/teams" element={
              <PageWrapper title="Team Collaboration" theme={theme} toggleTheme={toggleTheme}><TeamSettings user={user} /></PageWrapper>
            } />
          </Routes>
        </Router>
      </RequireLicense>
    </LicenseProvider>
  );
}

const PageWrapper = ({ children, title, theme, toggleTheme }) => (
  <div className="dashboard-container">
    <header className="dashboard-header">
      <h1>{title || 'Vibrana Overseer'}</h1>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <a href="/" className="btn btn-ghost btn-sm">Dashboard</a>
        <a href="/teams" className="btn btn-ghost btn-sm">Teams</a>
        <button className="btn btn-ghost btn-sm" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? 'ΓÿÇ∩╕Å' : '≡ƒîÖ'}
        </button>
      </div>
    </header>
    {children}
  </div>
);

export default App;
