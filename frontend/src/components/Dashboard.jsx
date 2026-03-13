import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronRight, Wrench, Activity, Settings2, GripVertical, Eye, EyeOff, RotateCcw, X, BarChart3, ClipboardList, Users, Settings } from 'lucide-react';
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
import { useLicense } from '../hooks/useLicense';
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
            hue: Math.random() * 60 + 240,
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

/* ── Widget Registry ─────────────────────────── */
const WIDGET_REGISTRY = [
    { id: 'organ-map',       label: 'Mapa Corporal',           icon: '🧬', column: 'left',   defaultVisible: true },
    { id: 'live-monitor',    label: 'Transmisión en Vivo',     icon: '📡', column: 'left',   defaultVisible: true },
    { id: 'patient-manager', label: 'Gestión de Pacientes',    icon: '👤', column: 'center', defaultVisible: true },
    { id: 'controls',        label: 'Controles',               icon: '🎛️', column: 'center', defaultVisible: true },
    { id: 'live-analysis',   label: 'Análisis en Vivo',        icon: '📊', column: 'center', defaultVisible: false },
    { id: 'advanced-tools',  label: 'Herramientas Avanzadas',  icon: '🔧', column: 'right',  defaultVisible: false },
    { id: 'nls-analyzer',    label: 'Sistema NLS',             icon: '🔬', column: 'right',  defaultVisible: true },
    { id: 'scan-log',        label: 'Registro de Escaneo',     icon: '📋', column: 'right',  defaultVisible: true },
];

const STORAGE_KEY = 'vibrana_dashboard_config';

const getDefaultConfig = () => ({
    columnOrder: {
        left:   ['organ-map', 'live-monitor'],
        center: ['patient-manager', 'controls', 'live-analysis'],
        right:  ['advanced-tools', 'nls-analyzer', 'scan-log'],
    },
    hidden: ['live-analysis', 'advanced-tools'],
});

const loadConfig = () => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Validate structure
            if (parsed.columnOrder && parsed.hidden) {
                // Add any new widgets that might have been added since last save
                const allIds = WIDGET_REGISTRY.map(w => w.id);
                const savedIds = [...parsed.columnOrder.left, ...parsed.columnOrder.center, ...parsed.columnOrder.right];
                const missing = allIds.filter(id => !savedIds.includes(id));
                missing.forEach(id => {
                    const w = WIDGET_REGISTRY.find(r => r.id === id);
                    if (w) parsed.columnOrder[w.column].push(id);
                });
                return parsed;
            }
        }
    } catch (e) { /* ignore corrupt data */ }
    return getDefaultConfig();
};

/* ── Draggable Widget Wrapper ─────────────────────────── */
const WidgetWrapper = ({ id, children, isEditing, onDragStart, onDragOver, onDrop, isDragOver }) => {
    if (!isEditing) return <>{children}</>;

    return (
        <div
            className={`widget-wrapper ${isDragOver ? 'widget-drop-target' : ''}`}
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', id);
                e.currentTarget.classList.add('widget-dragging');
                onDragStart(id);
            }}
            onDragEnd={(e) => {
                e.currentTarget.classList.remove('widget-dragging');
            }}
            onDragOver={(e) => {
                e.preventDefault();
                onDragOver(id);
            }}
            onDrop={(e) => {
                e.preventDefault();
                onDrop(id);
            }}
        >
            <div className="widget-drag-handle">
                <GripVertical size={14} />
            </div>
            {children}
        </div>
    );
};

/* ── Dashboard Config Panel ─────────────────────────── */
const DashboardConfigPanel = ({ config, onToggle, onReset, onClose }) => {
    return (
        <div className="dashboard-config-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="dashboard-config-panel">
                <div className="config-panel-header">
                    <h3><Settings2 size={18} /> Personalizar Dashboard</h3>
                    <button className="config-close-btn" onClick={onClose}><X size={18} /></button>
                </div>
                <p className="config-panel-desc">Activa o desactiva las secciones del dashboard. Arrastra para reordenar.</p>
                <div className="config-widget-list">
                    {WIDGET_REGISTRY.map(w => {
                        const isVisible = !config.hidden.includes(w.id);
                        return (
                            <div key={w.id} className={`config-widget-item ${isVisible ? 'visible' : 'hidden-widget'}`}>
                                <span className="config-widget-icon">{w.icon}</span>
                                <span className="config-widget-label">{w.label}</span>
                                <button
                                    className={`config-toggle-btn ${isVisible ? 'on' : 'off'}`}
                                    onClick={() => onToggle(w.id)}
                                    title={isVisible ? 'Ocultar' : 'Mostrar'}
                                >
                                    {isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                                </button>
                            </div>
                        );
                    })}
                </div>
                <button className="config-reset-btn" onClick={onReset}>
                    <RotateCcw size={14} /> Restablecer Predeterminado
                </button>
            </div>
        </div>
    );
};

/* ── Dashboard ─────────────────────────── */
const Dashboard = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState('Inactivo');
    const [scanData, setScanData] = useState([]);
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [patientScans, setPatientScans] = useState([]);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [teams, setTeams] = useState([]);
    const [currentTeam, setCurrentTeam] = useState(null);
    const [aiReportData, setAiReportData] = useState(null);

    // Dashboard customization state
    const [dashConfig, setDashConfig] = useState(() => loadConfig());
    const [isEditing, setIsEditing] = useState(false);
    const [showConfigPanel, setShowConfigPanel] = useState(false);
    const [dragOverId, setDragOverId] = useState(null);
    const dragSourceRef = useRef(null);

    // Persist config changes
    const saveConfig = useCallback((newConfig) => {
        setDashConfig(newConfig);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    }, []);

    const toggleWidget = useCallback((widgetId) => {
        setDashConfig(prev => {
            const newHidden = prev.hidden.includes(widgetId)
                ? prev.hidden.filter(id => id !== widgetId)
                : [...prev.hidden, widgetId];
            const newConfig = { ...prev, hidden: newHidden };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
            return newConfig;
        });
    }, []);

    const resetConfig = useCallback(() => {
        const def = getDefaultConfig();
        saveConfig(def);
        toast.success('Dashboard restablecido');
    }, [saveConfig]);

    const handleDragStart = useCallback((id) => {
        dragSourceRef.current = id;
    }, []);

    const handleDragOver = useCallback((targetId) => {
        setDragOverId(targetId);
    }, []);

    const handleDrop = useCallback((targetId) => {
        const sourceId = dragSourceRef.current;
        if (!sourceId || sourceId === targetId) {
            setDragOverId(null);
            return;
        }

        setDashConfig(prev => {
            const newOrder = { ...prev.columnOrder };
            // Find which column the source is in
            let sourceCol = null;
            for (const col of ['left', 'center', 'right']) {
                if (newOrder[col].includes(sourceId)) {
                    sourceCol = col;
                    break;
                }
            }
            // Find which column the target is in
            let targetCol = null;
            for (const col of ['left', 'center', 'right']) {
                if (newOrder[col].includes(targetId)) {
                    targetCol = col;
                    break;
                }
            }

            if (!sourceCol || !targetCol) return prev;

            // Remove source from its column
            newOrder[sourceCol] = newOrder[sourceCol].filter(id => id !== sourceId);
            // Insert source at target position
            const targetIdx = newOrder[targetCol].indexOf(targetId);
            newOrder[targetCol].splice(targetIdx, 0, sourceId);

            const newConfig = { ...prev, columnOrder: newOrder };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
            return newConfig;
        });

        setDragOverId(null);
        dragSourceRef.current = null;
    }, []);

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
            toast.success(`Cambiado a: ${team.team_name}`);
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
        setScanData(prev => [...prev, `[${new Date().toLocaleTimeString()}] Escaneo Detenido`]);
        toast('Escaneo detenido', { icon: '⏹' });
    };

    const handleSelectPatient = (patient) => {
        setSelectedPatient(patient);
        toast.success(`Seleccionado: ${patient.name}`);
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

    // Widget renderer — maps widget IDs to JSX
    const renderWidget = (widgetId) => {
        const isHidden = dashConfig.hidden.includes(widgetId);
        if (isHidden && !isEditing) return null;

        const widgetContent = (() => {
            switch (widgetId) {
                case 'organ-map':
                    return (
                        <div className="dashboard-panel vfx-card-enter" style={{ animationDelay: '0.1s' }}>
                            <OrganMap
                                patientId={selectedPatient?.id}
                                scanResults={patientScans}
                                aiReportData={aiReportData}
                                onOrganSelect={(organ) => toast.success(`Objetivo adquirido: ${organ.name}`)}
                            />
                        </div>
                    );
                case 'live-monitor':
                    return (
                        <div className="dashboard-panel vfx-card-enter" style={{ animationDelay: '0.15s', flex: 1, minHeight: '350px' }}>
                            <LiveMonitor activeTeam={currentTeam} />
                        </div>
                    );
                case 'patient-manager':
                    return (
                        <div className="vfx-card-enter" style={{ animationDelay: '0.2s' }}>
                            <PatientManager
                                onSelectPatient={handleSelectPatient}
                                onViewProfile={handleViewProfile}
                                selectedPatientId={selectedPatient?.id}
                                teamId={currentTeam?.team_id}
                            />
                        </div>
                    );
                case 'controls':
                    return (
                        <div className="vfx-card-enter" style={{ animationDelay: '0.25s' }}>
                            <ControlPanel
                                onStart={handleStartScan}
                                onStop={handleStopScan}
                                onAnalyze={handleAnalyze}
                                status={status}
                            />
                            {analysisResult && (
                                <div className="analysis-card vfx-card-enter" key={analysisResult.id || 'analysis-card-singleton'}>
                                    <h4>{analysisResult.organ_name}</h4>
                                    <p className="status-text">{analysisResult.status} • {analysisResult.total_points} puntos</p>
                                    <div className="entropy-grid">
                                        {Object.entries(analysisResult.counts).map(([lvl, count]) => (
                                            <div key={lvl} className={`entropy-item lvl-${lvl}`}>
                                                <span>Nvl {lvl}</span>
                                                <strong>{count}</strong>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                case 'live-analysis':
                    return (
                        <div className="vfx-card-enter" style={{ animationDelay: '0.3s' }}>
                            <CollapsibleSection title="Análisis en Vivo" icon={<Activity size={14} />} defaultOpen={false}>
                                <LiveEntropyCounter patientId={selectedPatient?.id} />
                                <ScreenWatcherPanel patientId={selectedPatient?.id} />
                            </CollapsibleSection>
                        </div>
                    );
                case 'advanced-tools':
                    return (
                        <div className="vfx-card-enter" style={{ animationDelay: '0.35s' }}>
                            <CollapsibleSection title="Herramientas Avanzadas" icon={<Wrench size={14} />} defaultOpen={false}>
                                <CVTools />
                                <MacroManager />
                            </CollapsibleSection>
                        </div>
                    );
                case 'nls-analyzer':
                    return (
                        <div className="vfx-card-enter" style={{ animationDelay: '0.40s' }}>
                            <NLSAnalyzerPanel
                                patientId={selectedPatient?.id}
                                patientScans={patientScans}
                                onAnalyzeComplete={(data) => {
                                    setAiReportData(data);
                                    toast.success("Datos de IA sincronizados con Mapa Corporal");
                                }}
                            />
                        </div>
                    );
                case 'scan-log':
                    return (
                        <div className="data-log vfx-card-enter" style={{ animationDelay: '0.45s', flex: 1 }}>
                            <h3>Registro de Escaneo</h3>
                            <ul>
                                {scanData.map((log, idx) => <li key={idx}>{log}</li>)}
                                {scanData.length === 0 && <li className="log-empty">Sin datos aún...</li>}
                            </ul>
                        </div>
                    );
                default:
                    return null;
            }
        })();

        if (!widgetContent) return null;

        return (
            <WidgetWrapper
                key={widgetId}
                id={widgetId}
                isEditing={isEditing}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                isDragOver={dragOverId === widgetId}
            >
                <div className={`widget-container ${isHidden ? 'widget-hidden-preview' : ''}`}>
                    {isEditing && isHidden && (
                        <div className="widget-hidden-badge">Oculto</div>
                    )}
                    {widgetContent}
                </div>
            </WidgetWrapper>
        );
    };

    const renderColumn = (colName) => {
        const widgetIds = dashConfig.columnOrder[colName] || [];
        return widgetIds.map(id => renderWidget(id)).filter(Boolean);
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
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(167,139,250,0.2)',
                            borderRadius: 10,
                            padding: '4px 12px',
                        }}>
                            <span style={{ fontSize: 10, opacity: 0.5, textTransform: 'uppercase', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em' }}>Equipo</span>
                            <select
                                value={currentTeam?.team_id || ''}
                                onChange={(e) => handleTeamChange(e.target.value)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#a78bfa',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    outline: 'none',
                                    fontFamily: 'inherit',
                                }}
                            >
                                {teams.map(t => <option key={t.team_id} value={t.team_id} style={{ background: '#13132a', color: '#e2e8f0' }}>{t.team_name}</option>)}
                            </select>
                        </div>
                    )}
                    <a href="/analytics" className="btn btn-ghost btn-sm"><BarChart3 size={14} /> Estadisticas</a>
                    <a href="/diagnostic-logs" className="btn btn-ghost btn-sm"><ClipboardList size={14} /> Registros</a>
                    <a href="/teams" className="btn btn-ghost btn-sm"><Users size={14} /> Equipo</a>
                    <button
                        className={`btn btn-ghost btn-sm ${isEditing ? 'btn-editing-active' : ''}`}
                        onClick={() => setShowConfigPanel(true)}
                        title="Personalizar Dashboard"
                    >
                        <Settings2 size={16} />
                    </button>
                    <button
                        className={`btn btn-ghost btn-sm ${isEditing ? 'btn-editing-active' : ''}`}
                        onClick={() => setIsEditing(!isEditing)}
                        title={isEditing ? 'Terminar edicion' : 'Reorganizar widgets'}
                    >
                        {isEditing ? 'Listo' : <GripVertical size={16} />}
                    </button>
                    <a href="/settings" className="btn btn-ghost btn-sm" title="Configuracion"><Settings size={16} /></a>
                    <span className={`status-badge ${getStatusClass()}`}>● {status}</span>
                </div>
            </header>

            <StatsWidgets />

            {isEditing && (
                <div className="editing-banner">
                    <GripVertical size={14} />
                    Modo de edición — Arrastra los widgets para reordenar
                    <button onClick={() => setIsEditing(false)} className="editing-done-btn">✓ Listo</button>
                </div>
            )}

            <main className="dashboard-content three-column-grid">
                {/* COLUMN 1: Left */}
                <div className="column-left">
                    {renderColumn('left')}
                </div>

                {/* COLUMN 2: Center */}
                <div className="column-center">
                    {renderColumn('center')}
                </div>

                {/* COLUMN 3: Right */}
                <div className="column-right">
                    {renderColumn('right')}
                </div>
            </main>

            {/* Config Panel Modal */}
            {showConfigPanel && (
                <DashboardConfigPanel
                    config={dashConfig}
                    onToggle={toggleWidget}
                    onReset={resetConfig}
                    onClose={() => setShowConfigPanel(false)}
                />
            )}
        </div>
    );
};

export default Dashboard;
