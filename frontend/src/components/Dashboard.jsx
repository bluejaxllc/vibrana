import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronRight, Wrench, Activity } from 'lucide-react';
import ControlPanel from './ControlPanel';
import LiveMonitor from './LiveMonitor';
import PatientManager from './PatientManager';
import StatsWidgets from './StatsWidgets';
import CVTools from './CVTools';
import MacroManager from './MacroManager';
import LiveEntropyCounter from './LiveEntropyCounter';
import ScreenWatcherPanel from './ScreenWatcherPanel';
import OrganMap from './OrganMap';
import NLSAnalyzerPanel from './NLSAnalyzerPanel';
import '../App.css';

import { LOCAL_API as API } from '../config.js';

/* ── Ambient VFX Canvas ─────────────────────────── */
const AmbientVFX = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let animId;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        // Floating orbs
        const orbs = Array.from({ length: 5 }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 120 + 60,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            hue: Math.random() * 60 + 240, // purple-blue range
            alpha: Math.random() * 0.04 + 0.02,
        }));

        // Micro particles
        const particles = Array.from({ length: 40 }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.2,
            vy: -Math.random() * 0.3 - 0.1,
            r: Math.random() * 1.5 + 0.3,
            alpha: Math.random() * 0.4 + 0.1,
            life: Math.random() * 200 + 100,
            maxLife: 300,
        }));

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw orbs
            orbs.forEach(o => {
                o.x += o.vx;
                o.y += o.vy;
                if (o.x < -o.r) o.x = canvas.width + o.r;
                if (o.x > canvas.width + o.r) o.x = -o.r;
                if (o.y < -o.r) o.y = canvas.height + o.r;
                if (o.y > canvas.height + o.r) o.y = -o.r;

                const gradient = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
                gradient.addColorStop(0, `hsla(${o.hue}, 70%, 60%, ${o.alpha})`);
                gradient.addColorStop(1, `hsla(${o.hue}, 70%, 60%, 0)`);
                ctx.beginPath();
                ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();
            });

            // Draw particles
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.life--;

                if (p.life <= 0) {
                    p.x = Math.random() * canvas.width;
                    p.y = canvas.height + 10;
                    p.life = p.maxLife;
                    p.alpha = Math.random() * 0.4 + 0.1;
                }

                const fade = p.life / p.maxLife;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(189, 147, 249, ${p.alpha * fade})`;
                ctx.fill();
            });

            animId = requestAnimationFrame(draw);
        };
        draw();

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', resize);
        };
    }, []);

    return <canvas ref={canvasRef} className="dashboard-vfx-canvas" />;
};

/* ── Collapsible Section ─────────────────────────── */
const CollapsibleSection = ({ title, icon, children, defaultOpen = false }) => {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className={`collapsible-section ${open ? 'open' : ''}`}>
            <button className="collapsible-header" onClick={() => setOpen(!open)}>
                <span className="collapsible-title">
                    {icon}
                    {title}
                </span>
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {open && (
                <div className="collapsible-body vfx-slide-in">
                    {children}
                </div>
            )}
        </div>
    );
};

/* ── Dashboard ─────────────────────────── */
const Dashboard = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState('Idle');
    const [scanData, setScanData] = useState([]);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [patientScans, setPatientScans] = useState([]);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [teams, setTeams] = useState([]);
    const [currentTeam, setCurrentTeam] = useState(null);
    const [aiReportData, setAiReportData] = useState(null);

    // Fetch Teams and handle selection
    useEffect(() => {
        const fetchTeamsData = async () => {
            try {
                const res = await fetch(`${API}/teams`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
                });
                const data = await res.json();
                setTeams(data);
                if (data.length > 0) {
                    const defaultTeam = data[0];
                    setCurrentTeam(defaultTeam);
                    localStorage.setItem('vibrana_active_team', defaultTeam.team_id);
                }
            } catch (err) {
                console.error("Failed to fetch teams:", err);
            }
        };
        fetchTeamsData();
    }, []);

    const handleTeamChange = (teamId) => {
        const team = teams.find(t => t.team_id === teamId);
        if (team) {
            setCurrentTeam(team);
            localStorage.setItem('vibrana_active_team', team.team_id);
            setSelectedPatient(null);
            toast.success(`Switched to: ${team.team_name}`);
        }
    };

    // Fetch patient scans when selection changes
    useEffect(() => {
        if (selectedPatient) {
            fetch(`${API}/patients/${selectedPatient.id}/scans`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
            })
                .then(res => res.json())
                .then(data => setPatientScans(data))
                .catch(err => console.error("Failed to fetch scans:", err));
        } else {
            setPatientScans([]);
        }
    }, [selectedPatient]);

    const handleStartScan = async () => {
        if (!selectedPatient) {
            toast.error("Seleccione un paciente primero");
            return;
        }
        try {
            setStatus('Solicitando Escaneo...');
            const response = await fetch(`${API}/scan/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patientId: selectedPatient.id })
            });
            const data = await response.json();
            if (data.device_required) {
                setStatus('Inactivo');
                toast.error(data.message || 'Dispositivo NLS requerido para escanear');
                return;
            }
            setStatus(data.message);
            setScanData(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${data.message}`]);
            toast.success('Escaneo iniciado');
        } catch (error) {
            console.error("Error starting scan:", error);
            setStatus('Error: Backend Desconectado');
            setScanData(prev => [...prev, `[${new Date().toLocaleTimeString()}] Error: Backend Desconectado`]);
            toast.error('Backend Desconectado');
        }
    };

    const handleAnalyze = async () => {
        if (!selectedPatient) {
            toast.error("Seleccione un paciente primero");
            return;
        }
        try {
            setStatus('Analizando...');
            const response = await fetch(`${API}/scan/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patientId: selectedPatient.id })
            });
            const data = await response.json();
            if (data.device_required) {
                setStatus('Inactivo');
                toast.error(data.message || 'Dispositivo NLS requerido para análisis');
                return;
            }
            setStatus('Análisis Completo');
            setAnalysisResult(data.analysis);
            setScanData(prev => [...prev, `[${new Date().toLocaleTimeString()}] Análisis: ${data.analysis.status}`]);
            toast.success(`Análisis completo: ${data.analysis.status}`);
        } catch (error) {
            console.error("Analysis error:", error);
            setStatus('Error: Análisis Fallido');
            toast.error('Análisis fallido');
        }
    };

    const handleStopScan = async () => {
        setStatus('Inactivo');
        setScanData(prev => [...prev, `[${new Date().toLocaleTimeString()}] Scan Stopped`]);
        toast('Scan stopped', { icon: '⏹' });
    };

    const handleSelectPatient = (patient) => {
        setSelectedPatient(patient);
        toast.success(`Selected: ${patient.name}`);
    };

    const handleViewProfile = (patientId) => {
        navigate(`/patients/${patientId}`);
    };

    const getStatusClass = () => {
        const s = status.toLowerCase();
        if (s.includes('error')) return 'error';
        if (s.includes('scan') || s.includes('running')) return 'scanning';
        if (s.includes('analyz')) return 'analyzing';
        if (s.includes('analysis') || s.includes('complete')) return 'analysis';
        return 'idle';
    };

    return (
        <div className="dashboard-container">
            {/* Ambient VFX Background */}
            <AmbientVFX />

            {/* Subtle scanline overlay */}
            <div className="dashboard-scanline-overlay" />

            <header className="dashboard-header vfx-fade-in">
                <div>
                    <h1>Vibrana Overseer</h1>
                    {selectedPatient && <div className="patient-badge">● Paciente: {selectedPatient.name}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {teams.length > 0 && (
                        <div className="team-switcher glass px-2 py-1 rounded flex items-center gap-2 border border-accent/20">
                            <span className="text-[10px] opacity-40 uppercase font-bold">Equipo</span>
                            <select
                                value={currentTeam?.team_id || ''}
                                onChange={(e) => handleTeamChange(e.target.value)}
                                className="bg-transparent border-none text-xs font-medium focus:ring-0 cursor-pointer text-accent"
                            >
                                {teams.map(t => <option key={t.team_id} value={t.team_id} className="bg-bg-panel">{t.team_name}</option>)}
                            </select>
                        </div>
                    )}
                    <a href="/analytics" className="btn btn-ghost btn-sm">📊 Estadísticas</a>
                    <a href="/diagnostic-logs" className="btn btn-ghost btn-sm">📋 Registros</a>
                    <a href="/teams" className="btn btn-ghost btn-sm">👥 Equipo</a>
                    <a href="/settings" className="btn btn-ghost btn-sm">⚙️</a>
                    <span className={`status-badge ${getStatusClass()}`}>{status}</span>
                </div>
            </header>

            <StatsWidgets />

            <main className="dashboard-content three-column-grid">
                {/* COLUMN 1: Visuals & Map */}
                <div className="column-left">
                    <div className="dashboard-panel vfx-card-enter" style={{ animationDelay: '0.1s' }}>
                        <OrganMap
                            patientId={selectedPatient?.id}
                            scanResults={patientScans}
                            aiReportData={aiReportData}
                            onOrganSelect={(organ) => toast.success(`Target acquired: ${organ.name}`)}
                        />
                    </div>
                    <div className="dashboard-panel vfx-card-enter" style={{ animationDelay: '0.15s', flex: 1, minHeight: '350px' }}>
                        <LiveMonitor activeTeam={currentTeam} />
                    </div>
                </div>

                {/* COLUMN 2: Patient Flow & Controls */}
                <div className="column-center">
                    <div className="vfx-card-enter" style={{ animationDelay: '0.2s' }}>
                        <PatientManager
                            onSelectPatient={handleSelectPatient}
                            onViewProfile={handleViewProfile}
                            selectedPatientId={selectedPatient?.id}
                            teamId={currentTeam?.team_id}
                        />
                    </div>
                    <div className="vfx-card-enter" style={{ animationDelay: '0.25s' }}>
                        <ControlPanel
                            onStart={handleStartScan}
                            onStop={handleStopScan}
                            onAnalyze={handleAnalyze}
                            status={status}
                        />
                    </div>

                    {analysisResult && (
                        <div className="analysis-card vfx-card-enter" key={analysisResult.id || 'analysis-card-singleton'}>
                            <h4>{analysisResult.organ_name}</h4>
                            <p className="status-text">{analysisResult.status} • {analysisResult.total_points} points</p>
                            <div className="entropy-grid">
                                {Object.entries(analysisResult.counts).map(([lvl, count]) => (
                                    <div key={lvl} className={`entropy-item lvl-${lvl}`}>
                                        <span>Lvl {lvl}</span>
                                        <strong>{count}</strong>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Collapsible: Live Analysis */}
                    <div className="vfx-card-enter" style={{ animationDelay: '0.3s' }}>
                        <CollapsibleSection title="Análisis en Vivo" icon={<Activity size={14} />} defaultOpen={false}>
                            <LiveEntropyCounter patientId={selectedPatient?.id} />
                            <ScreenWatcherPanel patientId={selectedPatient?.id} />
                        </CollapsibleSection>
                    </div>
                </div>

                {/* COLUMN 3: Tools & Logs */}
                <div className="column-right">
                    {/* Collapsible: Advanced Tools */}
                    <div className="vfx-card-enter" style={{ animationDelay: '0.35s' }}>
                        <CollapsibleSection title="Herramientas Avanzadas" icon={<Wrench size={14} />} defaultOpen={false}>
                            <CVTools />
                            <MacroManager />
                        </CollapsibleSection>
                    </div>

                    {/* NLS Analyzer Panel */}
                    <div className="vfx-card-enter" style={{ animationDelay: '0.40s' }}>
                        <NLSAnalyzerPanel onAnalyzeComplete={(data) => {
                            setAiReportData(data);
                            toast.success("AI Data synced with Body Map");
                        }} />
                    </div>

                    {/* Scan Log */}
                    <div className="data-log vfx-card-enter" style={{ animationDelay: '0.45s', flex: 1 }}>
                        <h3>Registro de Escaneo</h3>
                        <ul>
                            {scanData.map((log, idx) => <li key={idx}>{log}</li>)}
                            {scanData.length === 0 && <li className="log-empty">Sin datos aún...</li>}
                        </ul>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
