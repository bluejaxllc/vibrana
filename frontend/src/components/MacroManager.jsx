import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Trash2, Circle, ListOrdered, Monitor, Keyboard, Mouse, Plus, Move, Clock, ArrowDown, Edit3, Save, X, Search, Eye, Zap, Camera, AlertCircle, CheckCircle, XCircle, StopCircle, Brain, ScanSearch, RefreshCw, Crosshair } from 'lucide-react';
import toast from 'react-hot-toast';

import { API, LOCAL_API } from '../config.js';

// ─── Constants ───
const EVENT_ICONS = {
    click: <Mouse size={12} />, key: <Keyboard size={12} />, scroll: <ArrowDown size={12} />,
    wait: <Clock size={12} />, move: <Move size={12} />, type: <Keyboard size={12} />,
    verify_text: <Search size={12} />, verify_result: <Eye size={12} />, verify_button: <Zap size={12} />,
    wait_for_text: <Clock size={12} />, screenshot: <Camera size={12} />, ai_verify: <Brain size={12} />,
};

const EVENT_COLORS = {
    key: '#50fa7b', click: '#ff79c6', move: '#8be9fd', scroll: '#f1fa8c', wait: '#ffb86c', type: '#50fa7b',
    verify_text: '#8b5cf6', verify_result: '#06b6d4', verify_button: '#f59e0b',
    wait_for_text: '#a78bfa', screenshot: '#94a3b8', ai_verify: '#ec4899',
};

const STEP_LABELS = {
    click: '🖱️ Clic', key: '⌨️ Tecla', scroll: '📜 Scroll', wait: '⏱️ Espera', move: '↗️ Mover', type: '⌨️ Escribir',
    verify_text: '🔍 Verificar Texto', verify_result: '📊 Verificar Resultado', verify_button: '🎯 Verificar Botón',
    wait_for_text: '⏳ Esperar Texto', screenshot: '📸 Captura', ai_verify: '🤖 Verificar IA',
};

const formatEvent = (ev) => {
    if (!ev || !ev.params) return '(unknown)';
    const p = ev.params;
    switch (ev.type) {
        case 'click': {
            const label = p.verify_label ? ` "${p.verify_label}"` : '';
            return `Clic${label} → ${p.x}, ${p.y}`;
        }
        case 'key': return `Tecla: ${p.key}`;
        case 'type': return `Escribir: "${(p.text || '').substring(0, 30)}"`;
        case 'scroll': return `Scroll (${p.dy || 0}) en ${p.x}, ${p.y}`;
        case 'wait': return `Espera ${p.seconds}s`;
        case 'move': return `Mover → ${p.x}, ${p.y}`;
        case 'verify_text': return `Verificar "${p.expected}" en región`;
        case 'verify_result': return `Patrón: "${p.pattern}" en región`;
        case 'verify_button': return `Botón: "${p.template_name}"`;
        case 'wait_for_text': return `Esperar: "${p.text}" (${p.timeout || 60}s)`;
        case 'screenshot': return `Captura: ${p.label || 'screenshot'}`;
        case 'ai_verify': return `IA: "${(p.question || '').substring(0, 40)}"`;
        default: return JSON.stringify(p).substring(0, 60);
    }
};

/* ─── Add Step Form (enhanced with all step types) ─── */
const AddStepForm = ({ onAdd, onCancel }) => {
    const [type, setType] = useState('click');
    const [params, setParams] = useState({
        x: 0, y: 0, button: 'left', key: '', seconds: 1, dx: 0, dy: -3,
        text: '', expected: '', pattern: '', template_name: '', question: '', label: '',
        timeout: 10,
        region: { x: 0, y: 0, w: 400, h: 100 },
        verify_label: '',
    });

    const inputStyle = { width: '60px', background: '#1a1a2e', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '4px', padding: '4px', fontSize: '0.8rem' };
    const wideInput = { ...inputStyle, width: '140px' };
    const selectStyle = { ...inputStyle, width: 'auto' };

    const setP = (key, val) => setParams(p => ({ ...p, [key]: val }));
    const setR = (key, val) => setParams(p => ({ ...p, region: { ...p.region, [key]: parseInt(val) || 0 } }));

    const submit = () => {
        const p = {};
        if (['click', 'move', 'scroll'].includes(type)) { p.x = parseInt(params.x) || 0; p.y = parseInt(params.y) || 0; }
        if (type === 'click') {
            p.button = params.button || 'left';
            if (params.verify_label) {
                p.verify_label = params.verify_label;
                p.verify_region = { ...params.region };
            }
        }
        if (type === 'key') p.key = params.key || 'enter';
        if (type === 'type') p.text = params.text || '';
        if (type === 'wait') p.seconds = parseFloat(params.seconds) || 1;
        if (type === 'scroll') { p.dx = parseInt(params.dx) || 0; p.dy = parseInt(params.dy) || -3; }
        if (['verify_text', 'verify_result', 'wait_for_text', 'ai_verify'].includes(type)) {
            p.region = { ...params.region };
            p.timeout = parseInt(params.timeout) || 10;
        }
        if (type === 'verify_text') p.expected = params.expected || '';
        if (type === 'verify_result') p.pattern = params.pattern || '.*';
        if (type === 'wait_for_text') p.text = params.text || '';
        if (type === 'verify_button') { p.template_name = params.template_name || ''; p.threshold = 0.8; p.timeout = parseInt(params.timeout) || 10; }
        if (type === 'screenshot') p.label = params.label || 'screenshot';
        if (type === 'ai_verify') p.question = params.question || '';
        onAdd({ type, params: p });
    };

    const categories = [
        { label: 'Acciones', types: ['click', 'key', 'type', 'wait', 'move', 'scroll'] },
        { label: 'Verificación', types: ['verify_text', 'verify_result', 'verify_button', 'wait_for_text', 'screenshot', 'ai_verify'] },
    ];

    return (
        <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '8px', padding: '12px', marginTop: '6px' }}>
            {/* Step type selector as palette */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                {categories.map(cat => (
                    <div key={cat.label}>
                        <small style={{ color: '#64748b', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{cat.label}</small>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '3px' }}>
                            {cat.types.map(t => (
                                <button key={t} onClick={() => setType(t)}
                                    style={{
                                        background: type === t ? EVENT_COLORS[t] + '33' : 'rgba(0,0,0,0.3)',
                                        border: `1px solid ${type === t ? EVENT_COLORS[t] : '#334155'}`,
                                        color: type === t ? EVENT_COLORS[t] : '#94a3b8',
                                        borderRadius: '4px', padding: '3px 8px', fontSize: '0.7rem',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {EVENT_ICONS[t]} {STEP_LABELS[t]}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Parameters */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
                {['click', 'move', 'scroll'].includes(type) && (
                    <>
                        <label style={{ color: '#94a3b8', fontSize: '0.7rem' }}>X:</label>
                        <input type="number" value={params.x} onChange={e => setP('x', e.target.value)} style={inputStyle} />
                        <label style={{ color: '#94a3b8', fontSize: '0.7rem' }}>Y:</label>
                        <input type="number" value={params.y} onChange={e => setP('y', e.target.value)} style={inputStyle} />
                    </>
                )}
                {type === 'click' && (
                    <>
                        <select value={params.button} onChange={e => setP('button', e.target.value)} style={selectStyle}>
                            <option value="left">Izq</option><option value="right">Der</option><option value="middle">Med</option>
                        </select>
                        <input type="text" placeholder="Verificar label (opc)" value={params.verify_label} onChange={e => setP('verify_label', e.target.value)} style={wideInput} title="Si se llena, OCR verificará que este texto esté visible antes de hacer clic" />
                    </>
                )}
                {type === 'key' && <input type="text" placeholder="Tecla (ej: enter)" value={params.key} onChange={e => setP('key', e.target.value)} style={wideInput} />}
                {type === 'type' && <input type="text" placeholder="Texto a escribir" value={params.text} onChange={e => setP('text', e.target.value)} style={{ ...wideInput, width: '200px' }} />}
                {type === 'wait' && <input type="number" step="0.5" placeholder="Segundos" value={params.seconds} onChange={e => setP('seconds', e.target.value)} style={inputStyle} />}
                {type === 'scroll' && <input type="number" placeholder="dY" value={params.dy} onChange={e => setP('dy', e.target.value)} style={inputStyle} />}

                {/* Verification params */}
                {type === 'verify_text' && <input type="text" placeholder="Texto esperado" value={params.expected} onChange={e => setP('expected', e.target.value)} style={{ ...wideInput, width: '180px' }} />}
                {type === 'verify_result' && <input type="text" placeholder="Regex (ej: Nivel.*[4-6])" value={params.pattern} onChange={e => setP('pattern', e.target.value)} style={{ ...wideInput, width: '180px' }} />}
                {type === 'verify_button' && <input type="text" placeholder="Nombre template" value={params.template_name} onChange={e => setP('template_name', e.target.value)} style={wideInput} />}
                {type === 'wait_for_text' && <input type="text" placeholder="Texto a esperar" value={params.text} onChange={e => setP('text', e.target.value)} style={{ ...wideInput, width: '180px' }} />}
                {type === 'screenshot' && <input type="text" placeholder="Etiqueta" value={params.label} onChange={e => setP('label', e.target.value)} style={wideInput} />}
                {type === 'ai_verify' && <input type="text" placeholder="Pregunta IA (ej: ¿Es el hígado?)" value={params.question} onChange={e => setP('question', e.target.value)} style={{ ...wideInput, width: '220px' }} />}
            </div>

            {/* Region selector for verification types */}
            {['verify_text', 'verify_result', 'wait_for_text', 'ai_verify', 'click'].includes(type) && (type !== 'click' || params.verify_label) && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px', padding: '6px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', border: '1px solid #334155' }}>
                    <small style={{ color: '#64748b', fontSize: '0.65rem', minWidth: '40px' }}>Región:</small>
                    <label style={{ color: '#94a3b8', fontSize: '0.65rem' }}>X</label>
                    <input type="number" value={params.region.x} onChange={e => setR('x', e.target.value)} style={{ ...inputStyle, width: '50px' }} />
                    <label style={{ color: '#94a3b8', fontSize: '0.65rem' }}>Y</label>
                    <input type="number" value={params.region.y} onChange={e => setR('y', e.target.value)} style={{ ...inputStyle, width: '50px' }} />
                    <label style={{ color: '#94a3b8', fontSize: '0.65rem' }}>W</label>
                    <input type="number" value={params.region.w} onChange={e => setR('w', e.target.value)} style={{ ...inputStyle, width: '50px' }} />
                    <label style={{ color: '#94a3b8', fontSize: '0.65rem' }}>H</label>
                    <input type="number" value={params.region.h} onChange={e => setR('h', e.target.value)} style={{ ...inputStyle, width: '50px' }} />
                    {['verify_text', 'verify_result', 'wait_for_text', 'ai_verify'].includes(type) && (
                        <>
                            <label style={{ color: '#94a3b8', fontSize: '0.65rem' }}>Timeout</label>
                            <input type="number" value={params.timeout} onChange={e => setP('timeout', e.target.value)} style={{ ...inputStyle, width: '45px' }} />
                        </>
                    )}
                </div>
            )}

            <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn btn-analyze btn-sm" onClick={submit} style={{ fontSize: '0.75rem' }}><Plus size={10} /> Agregar Paso</button>
                <button className="btn btn-ghost btn-sm" onClick={onCancel} style={{ fontSize: '0.75rem' }}>Cancelar</button>
            </div>
        </div>
    );
};

/* ─── Step Row (visual timeline card) ─── */
const StepRow = ({ ev, idx, onDelete, verification }) => {
    const color = EVENT_COLORS[ev.type] || '#94a3b8';
    const isVerification = ['verify_text', 'verify_result', 'verify_button', 'wait_for_text', 'ai_verify'].includes(ev.type);

    return (
        <div style={{
            display: 'flex', alignItems: 'stretch', gap: '8px', padding: '6px 8px',
            borderLeft: `3px solid ${color}`, marginBottom: '2px',
            background: isVerification ? 'rgba(139,92,246,0.06)' : 'transparent',
            borderRadius: '0 4px 4px 0', transition: 'background 0.15s',
        }}
            onMouseEnter={e => e.currentTarget.style.background = color + '15'}
            onMouseLeave={e => e.currentTarget.style.background = isVerification ? 'rgba(139,92,246,0.06)' : 'transparent'}
        >
            <span style={{ color: '#475569', minWidth: '22px', fontSize: '0.65rem', paddingTop: '2px' }}>#{idx + 1}</span>
            <span style={{ color, display: 'flex', alignItems: 'center', paddingTop: '1px' }}>
                {EVENT_ICONS[ev.type] || null}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color, fontSize: '0.7rem', fontWeight: 600 }}>{STEP_LABELS[ev.type] || ev.type}</span>
                    {verification && (
                        verification.success
                            ? <CheckCircle size={11} style={{ color: '#50fa7b' }} />
                            : <XCircle size={11} style={{ color: '#ff5555' }} />
                    )}
                </div>
                <span style={{ color: '#94a3b8', fontSize: '0.72rem', fontFamily: 'monospace' }}>{formatEvent(ev)}</span>
            </div>
            {onDelete && (
                <button onClick={() => onDelete(idx)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px', opacity: 0.4, display: 'flex', alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1}
                    onMouseLeave={e => e.currentTarget.style.opacity = 0.4}
                ><Trash2 size={11} /></button>
            )}
        </div>
    );
};

/* ─── Steps Panel (timeline view) ─── */
const StepsPanel = ({ title, events, onDelete, onAdd, emptyMsg, verifications = [] }) => {
    const [showAdd, setShowAdd] = useState(false);
    const endRef = useRef(null);

    useEffect(() => {
        if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [events]);

    const getVerification = (stepIdx) => verifications.find(v => v.step === stepIdx + 1);

    return (
        <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '6px', border: '1px solid rgba(139,92,246,0.3)', marginBottom: '12px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.08)' }}>
                <strong style={{ color: '#a78bfa', fontSize: '0.8rem' }}>{title} ({events.length} pasos)</strong>
                {onAdd && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(!showAdd)} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                        <Plus size={10} /> Agregar Paso
                    </button>
                )}
            </div>
            {showAdd && <AddStepForm onAdd={(ev) => { onAdd(ev); setShowAdd(false); }} onCancel={() => setShowAdd(false)} />}
            <div style={{ maxHeight: '350px', overflowY: 'auto', padding: '6px' }}>
                {events.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: '0.75rem', textAlign: 'center', padding: '16px' }}>{emptyMsg}</p>
                ) : events.map((ev, idx) => (
                    <StepRow key={`${idx}-${ev.type}`} ev={ev} idx={idx} onDelete={onDelete} verification={getVerification(idx)} />
                ))}
                <div ref={endRef} />
            </div>
        </div>
    );
};

/* ─── Smart Playback Progress Panel ─── */
const PlaybackPanel = ({ status, onAbort }) => {
    if (!status || !status.active) return null;
    const pct = status.total_steps ? Math.round((status.current_step / status.total_steps) * 100) : 0;
    const hasErrors = status.errors?.length > 0;
    const verifications = status.verifications || [];
    const passed = verifications.filter(v => v.success).length;
    const failed = verifications.filter(v => !v.success).length;

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.1))',
            border: '1px solid rgba(139,92,246,0.4)', borderRadius: '8px', padding: '12px', marginBottom: '12px',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ color: '#a78bfa', fontSize: '0.85rem' }}>
                    ▶️ Reproduciendo: {status.name}
                </strong>
                <button className="btn btn-danger-ghost btn-sm" onClick={onAbort} style={{ fontSize: '0.7rem' }}>
                    <StopCircle size={12} /> Detener
                </button>
            </div>

            {/* Progress bar */}
            <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '4px', height: '8px', marginBottom: '8px', overflow: 'hidden' }}>
                <div style={{
                    width: `${pct}%`, height: '100%', borderRadius: '4px',
                    background: hasErrors ? 'linear-gradient(90deg, #8b5cf6, #ef4444)' : 'linear-gradient(90deg, #8b5cf6, #50fa7b)',
                    transition: 'width 0.3s ease',
                }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8' }}>
                <span>Paso {status.current_step}/{status.total_steps} ({pct}%)</span>
                <span style={{ display: 'flex', gap: '8px' }}>
                    {passed > 0 && <span style={{ color: '#50fa7b' }}>✓ {passed}</span>}
                    {failed > 0 && <span style={{ color: '#ff5555' }}>✗ {failed}</span>}
                </span>
            </div>

            <div style={{ color: '#cbd5e1', fontSize: '0.72rem', marginTop: '4px', fontFamily: 'monospace', opacity: 0.8 }}>
                {status.current_action}
            </div>

            {/* Errors */}
            {hasErrors && (
                <div style={{ marginTop: '8px' }}>
                    {status.errors.slice(-3).map((err, i) => (
                        <div key={i} style={{ color: '#ff5555', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <AlertCircle size={10} /> {err}
                        </div>
                    ))}
                </div>
            )}

            {/* Verification results scroll */}
            {verifications.length > 0 && (
                <div style={{ marginTop: '8px', maxHeight: '100px', overflowY: 'auto' }}>
                    {verifications.map((v, i) => (
                        <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem',
                            color: v.success ? '#50fa7b' : '#ff5555', padding: '1px 0',
                        }}>
                            {v.success ? <CheckCircle size={10} /> : <XCircle size={10} />}
                            <span style={{ color: '#94a3b8' }}>#{v.step}</span>
                            <span>{v.type}: {v.expected || v.pattern || v.target || v.template || v.question?.substring(0, 30) || ''}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

/* ─── Main Component ─── */
const MacroManager = () => {
    const [macros, setMacros] = useState([]);
    const [recording, setRecording] = useState(false);
    const [macroName, setMacroName] = useState('');
    const [isLocal, setIsLocal] = useState(false);
    const [allEvents, setAllEvents] = useState([]);
    // Editing saved macro
    const [editingName, setEditingName] = useState(null);
    const [editEvents, setEditEvents] = useState([]);
    // Smart playback
    const [playbackStatus, setPlaybackStatus] = useState(null);
    // Screen scanner
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [detectedElements, setDetectedElements] = useState([]);
    const [scanScreenshot, setScanScreenshot] = useState('');
    const [selectedElem, setSelectedElem] = useState(null);
    // Monitor selection
    const [monitors, setMonitors] = useState([]);
    const [selectedMonitor, setSelectedMonitor] = useState(1);

    useEffect(() => {
        const checkLocal = async () => {
            try {
                const res = await fetch(`${LOCAL_API}/status`, { signal: AbortSignal.timeout(2000) });
                if (res.ok) setIsLocal(true);
            } catch { setIsLocal(false); }
        };
        checkLocal();
    }, []);

    const fetchMacros = async () => {
        try {
            const res = await fetch(`${LOCAL_API}/api/macros`);
            const data = await res.json();
            setMacros(data.macros || []);
        } catch (err) { console.error("Failed to fetch macros", err); }
    };

    useEffect(() => { fetchMacros(); }, []);

    // Fetch available monitors
    useEffect(() => {
        const loadMonitors = async () => {
            try {
                const res = await fetch(`${LOCAL_API}/api/macros/monitors`);
                const data = await res.json();
                if (data.monitors) {
                    setMonitors(data.monitors);
                    // Default to monitor 2 if available (primary is often the laptop screen)
                    if (data.monitors.length > 2) setSelectedMonitor(2);
                }
            } catch { /* ignore */ }
        };
        if (isLocal) loadMonitors();
    }, [isLocal]);

    // Poll live events during recording
    useEffect(() => {
        let interval;
        if (recording) {
            interval = setInterval(async () => {
                try {
                    const res = await fetch(`${LOCAL_API}/api/macros/record/events`);
                    const data = await res.json();
                    if (data.events) setAllEvents([...data.events]);
                } catch { /* ignore error during interval */ }
            }, 400);
        }
        return () => clearInterval(interval);
    }, [recording]);

    // Poll smart playback status
    useEffect(() => {
        let interval;
        if (playbackStatus?.active) {
            interval = setInterval(async () => {
                try {
                    const res = await fetch(`${LOCAL_API}/api/macros/playback/status`);
                    const data = await res.json();
                    setPlaybackStatus(data);
                    if (!data.active) {
                        clearInterval(interval);
                        if (data.errors?.length) toast.error(`Macro terminó con ${data.errors.length} error(es)`);
                        else toast.success('Macro completado exitosamente');
                    }
                } catch { /* ignore error during status check */ }
            }, 500);
        }
        return () => clearInterval(interval);
    }, [playbackStatus?.active]);

    const startRecording = async () => {
        if (!isLocal) { toast.error('Conecte el backend local para grabar macros'); return; }
        if (!macroName.trim()) { toast.error('Ingresa un nombre para el macro'); return; }
        try {
            const res = await fetch(`${LOCAL_API}/api/macros/record/start`, { method: 'POST' });
            const data = await res.json();
            if (data.device_required) { toast.error('Se requiere un equipo local'); return; }
            if (data.status === 'error') { toast.error(data.message || 'Error al iniciar'); return; }
            setRecording(true);
            setAllEvents([]);
            toast.success('Grabación iniciada — capturando mouse y teclado');
        } catch { toast.error('Error al iniciar grabación'); }
    };

    const stopRecording = async () => {
        const name = macroName.trim() || `macro_${Date.now()}`;
        try {
            const res = await fetch(`${LOCAL_API}/api/macros/record/stop`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await res.json();
            setRecording(false);
            if (data.status === 'saved') toast.success(`Macro "${name}" guardado (${data.action_count} acciones)`);
            else toast.error(data.message || 'Error al detener');
            setMacroName('');
            setAllEvents([]);
            fetchMacros();
        } catch { toast.error('Error al detener grabación'); }
    };

    // Live recording event management
    const deleteLiveEvent = async (index) => {
        try { await fetch(`${LOCAL_API}/api/macros/record/events/${index}`, { method: 'DELETE' }); }
        catch { toast.error('Error al eliminar evento'); }
    };

    const addLiveEvent = async (ev) => {
        try {
            await fetch(`${LOCAL_API}/api/macros/record/events`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ev)
            });
            toast.success('Paso agregado');
        } catch { toast.error('Error al agregar'); }
    };

    // Saved macro editing
    const startEditing = async (name) => {
        try {
            const res = await fetch(`${LOCAL_API}/api/macros/${name}`);
            const data = await res.json();
            setEditingName(name);
            setEditEvents(data.actions || []);
        } catch { toast.error('Error al cargar macro'); }
    };

    const cancelEditing = () => { setEditingName(null); setEditEvents([]); };
    const deleteEditEvent = (index) => setEditEvents(prev => prev.filter((_, i) => i !== index));
    const addEditEvent = (ev) => setEditEvents(prev => [...prev, { type: ev.type, params: ev.params, timestamp: Date.now() / 1000 }]);

    const saveEditedMacro = async () => {
        try {
            const res = await fetch(`${LOCAL_API}/api/macros/${editingName}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ actions: editEvents })
            });
            const data = await res.json();
            if (data.status === 'saved') {
                toast.success(`Macro "${editingName}" actualizado (${data.action_count} pasos)`);
                setEditingName(null); setEditEvents([]); fetchMacros();
            } else toast.error('Error al guardar');
        } catch { toast.error('Error al guardar macro'); }
    };

    // Play macro — normal (blind) or smart (with verification)
    const playMacro = async (name, smart = false) => {
        if (!isLocal) { toast.error('Conecte el backend local'); return; }
        if (smart) {
            try {
                const res = await fetch(`${LOCAL_API}/api/macros/${name}/play-smart`, { method: 'POST' });
                const data = await res.json();
                if (data.status === 'playing') {
                    setPlaybackStatus({ active: true, name, current_step: 0, total_steps: data.total_steps, current_action: 'Iniciando...', verifications: [], errors: [] });
                    toast.success(`Smart playback: ${name}`);
                } else toast.error(data.message || 'Error');
            } catch { toast.error('Error al iniciar smart playback'); }
        } else {
            toast.loading(`Reproduciendo: ${name}...`, { id: 'macro-play' });
            try {
                const res = await fetch(`${LOCAL_API}/api/macros/${name}/play`, { method: 'POST' });
                const data = await res.json();
                toast.dismiss('macro-play');
                if (data.status === 'completed') toast.success(`Completado (${data.actions_executed} acciones)`);
                else toast.error(`Fallido: ${data.message}`);
            } catch { toast.dismiss('macro-play'); toast.error('Error al reproducir'); }
        }
    };

    const abortPlayback = async () => {
        try {
            await fetch(`${LOCAL_API}/api/macros/playback/abort`, { method: 'POST' });
            toast.success('Deteniendo...');
        } catch { toast.error('Error al detener'); }
    };

    const deleteMacro = async (name) => {
        try {
            await fetch(`${LOCAL_API}/api/macros/${name}`, { method: 'DELETE' });
            toast.success('Macro eliminado');
            if (editingName === name) cancelEditing();
            fetchMacros();
        } catch { toast.error('Error al eliminar'); }
    };

    // ─── Screen Scanner ───
    const detectElements = async () => {
        if (!isLocal) { toast.error('Requiere backend local'); return; }
        setScanning(true);
        setDetectedElements([]);
        setScanScreenshot('');
        setSelectedElem(null);
        try {
            const res = await fetch(`${LOCAL_API}/api/macros/detect-elements?monitor=${selectedMonitor}`);
            const data = await res.json();
            if (data.error) { toast.error(data.error); return; }
            setDetectedElements(data.elements || []);
            setScanScreenshot(data.screenshot || '');

            setScannerOpen(true);
            toast.success(`${data.count || 0} elementos detectados (Pantalla ${selectedMonitor})`);
        } catch { toast.error('Error al escanear'); }
        finally { setScanning(false); }
    };

    const addElementAsStep = (elem, stepType = 'click') => {
        const step = { type: stepType, params: {} };
        if (stepType === 'click') {
            step.params = {
                x: elem.center.x, y: elem.center.y, button: 'left',
                verify_label: elem.label || '',
                verify_region: elem.region,
            };
        } else if (stepType === 'verify_text') {
            step.params = {
                region: elem.region,
                expected: elem.label || '',
                timeout: 10,
            };
        } else if (stepType === 'wait_for_text') {
            step.params = {
                text: elem.label || '',
                region: elem.region,
                timeout: 60,
            };
        }
        // Add to editing or live recording
        if (editingName) {
            addEditEvent(step);
        } else if (recording) {
            addLiveEvent(step);
        } else {
            toast.error('Inicia una grabación o edita un macro primero');
            return;
        }
        setSelectedElem(null);
        toast.success(`Paso "${STEP_LABELS[stepType]}" agregado: ${elem.label || elem.type}`);
    };

    const saveAsTemplate = async (elem) => {
        try {
            const name = (elem.label || elem.type).replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30) || 'template';
            const res = await fetch(`${LOCAL_API}/api/macros/save-template`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ region: elem.region, name })
            });
            const data = await res.json();
            if (data.status === 'saved') toast.success(`Template "${name}" guardado`);
            else toast.error(data.error || 'Error');
        } catch { toast.error('Error al guardar template'); }
    };

    return (
        <div className="macro-manager">
            <h3><ListOrdered size={16} /> Macros</h3>

            {/* Smart playback progress */}
            <PlaybackPanel status={playbackStatus} onAbort={abortPlayback} />

            {/* Detect elements button + monitor selector */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
                {monitors.length > 1 && (
                    <select
                        value={selectedMonitor}
                        onChange={e => setSelectedMonitor(parseInt(e.target.value))}
                        style={{
                            background: '#1a1a2e', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)',
                            borderRadius: '4px', padding: '4px 6px', fontSize: '0.7rem', cursor: 'pointer',
                        }}
                        title="Seleccionar pantalla para escanear"
                    >
                        {monitors.map(m => (
                            <option key={m.index} value={m.index}>{m.label}</option>
                        ))}
                    </select>
                )}
                <button className={`btn btn-ghost btn-sm ${!isLocal ? 'btn-disabled' : ''}`}
                    onClick={detectElements} disabled={!isLocal || scanning}
                    style={{ color: '#a78bfa', fontSize: '0.75rem', flex: 1 }}
                >
                    {scanning ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <ScanSearch size={12} />}
                    {scanning ? ' Escaneando...' : ' 🔍 Detectar Elementos en Pantalla'}
                </button>
                {scannerOpen && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setScannerOpen(false)} style={{ fontSize: '0.7rem' }}>
                        <X size={10} /> Cerrar
                    </button>
                )}
            </div>

            {/* Screen Scanner Panel */}
            {scannerOpen && scanScreenshot && (
                <div style={{
                    background: 'rgba(0,0,0,0.4)', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.4)',
                    marginBottom: '12px', overflow: 'hidden',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.08)' }}>
                        <strong style={{ color: '#a78bfa', fontSize: '0.8rem' }}>
                            <Crosshair size={12} /> Elementos Detectados ({detectedElements.length})
                        </strong>
                        <button className="btn btn-ghost btn-sm" onClick={detectElements} disabled={scanning} style={{ fontSize: '0.7rem' }}>
                            <RefreshCw size={10} /> Refrescar
                        </button>
                    </div>

                    {/* Annotated screenshot */}
                    <div style={{ position: 'relative', maxHeight: '300px', overflow: 'auto', cursor: 'crosshair' }}>
                        <img
                            src={`data:image/jpeg;base64,${scanScreenshot}`}
                            alt="Screen scan"
                            style={{ width: '100%', display: 'block' }}
                        />
                    </div>

                    {/* Element list */}
                    <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '6px' }}>
                        {detectedElements.length === 0 ? (
                            <p style={{ color: '#64748b', fontSize: '0.75rem', textAlign: 'center', padding: '12px' }}>No se detectaron elementos interactivos.</p>
                        ) : detectedElements.map((elem) => {
                            const typeColors = {
                                button: '#a78bfa', close: '#ff5555', arrow: '#f59e0b',
                                input: '#3b82f6', checkbox: '#50fa7b', icon: '#94a3b8', unknown: '#64748b',
                            };
                            const typeEmojis = {
                                button: '🟣', close: '🔴', arrow: '🟡',
                                input: '🔵', checkbox: '🟢', icon: '⬜', unknown: '⚪',
                            };
                            const isSelected = selectedElem?.id === elem.id;
                            return (
                                <div key={elem.id}
                                    onClick={() => setSelectedElem(isSelected ? null : elem)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px',
                                        borderLeft: `3px solid ${typeColors[elem.type] || '#64748b'}`,
                                        background: isSelected ? 'rgba(139,92,246,0.2)' : 'transparent',
                                        borderRadius: '0 4px 4px 0', marginBottom: '2px', cursor: 'pointer',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(139,92,246,0.1)'; }}
                                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <span style={{ fontSize: '0.8rem' }}>{typeEmojis[elem.type] || '⚪'}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ color: typeColors[elem.type], fontSize: '0.7rem', fontWeight: 600 }}>{elem.type}</div>
                                        <div style={{ color: '#cbd5e1', fontSize: '0.72rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {elem.label || `(${elem.region.x}, ${elem.region.y})`}
                                        </div>
                                    </div>
                                    <small style={{ color: '#475569', fontSize: '0.6rem' }}>{elem.center.x},{elem.center.y}</small>
                                </div>
                            );
                        })}
                    </div>

                    {/* Selected element actions */}
                    {selectedElem && (
                        <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.12)' }}>
                            <div style={{ color: '#e2e8f0', fontSize: '0.75rem', marginBottom: '6px' }}>
                                <strong>{selectedElem.type}:</strong> {selectedElem.label || 'sin etiqueta'}
                                <span style={{ color: '#64748b', marginLeft: '8px' }}>({selectedElem.center.x}, {selectedElem.center.y})</span>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                <button className="btn btn-analyze btn-sm" onClick={() => addElementAsStep(selectedElem, 'click')} style={{ fontSize: '0.68rem' }}>🖱️ Clic</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => addElementAsStep(selectedElem, 'verify_text')} style={{ fontSize: '0.68rem', color: '#8b5cf6' }}>🔍 Verificar</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => addElementAsStep(selectedElem, 'wait_for_text')} style={{ fontSize: '0.68rem', color: '#a78bfa' }}>⏳ Esperar</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => saveAsTemplate(selectedElem)} style={{ fontSize: '0.68rem', color: '#f59e0b' }}>💾 Template</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Record controls */}
            <div className="macro-record-controls">
                {!recording ? (
                    <>
                        <input type="text" placeholder="Nombre del macro"
                            value={macroName} onChange={(e) => setMacroName(e.target.value)}
                            className="macro-name-input" style={{ width: '160px', marginRight: '8px' }}
                        />
                        <button className={`btn btn-analyze btn-sm ${!isLocal || !macroName.trim() ? 'btn-disabled' : ''}`}
                            onClick={startRecording} disabled={!isLocal || !macroName.trim()}
                            title={!isLocal ? 'Requiere backend local' : !macroName.trim() ? 'Ingresa nombre' : 'Grabar'}
                        ><Circle size={12} style={{ color: '#ff5555' }} /> Grabar</button>
                        {!isLocal && <span className="macro-local-badge"><Monitor size={12} /> Solo local</span>}
                    </>
                ) : (
                    <>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#fff', marginRight: '8px' }}>
                            Grabando: {macroName}
                        </span>
                        <button className="btn btn-danger-ghost btn-sm" onClick={stopRecording}>
                            <Square size={12} /> Detener
                        </button>
                        <span className="recording-indicator">● GRABANDO</span>
                    </>
                )}
            </div>

            {/* Live event timeline during recording */}
            {recording && (
                <StepsPanel
                    title="Historial de Pasos"
                    events={allEvents}
                    onDelete={deleteLiveEvent}
                    onAdd={addLiveEvent}
                    emptyMsg="Esperando pasos... Usa tu teclado y mouse."
                />
            )}

            {/* Editing saved macro */}
            {editingName && !recording && (
                <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <Edit3 size={14} style={{ color: '#a78bfa' }} />
                        <strong style={{ color: '#e2e8f0', fontSize: '0.85rem' }}>Editando: {editingName}</strong>
                        <button className="btn btn-analyze btn-sm" onClick={saveEditedMacro} style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>
                            <Save size={10} /> Guardar
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={cancelEditing} style={{ fontSize: '0.7rem' }}>
                            <X size={10} /> Cancelar
                        </button>
                    </div>
                    <StepsPanel
                        title="Pasos del Macro"
                        events={editEvents}
                        onDelete={deleteEditEvent}
                        onAdd={addEditEvent}
                        emptyMsg="Sin pasos. Agrega pasos manualmente."
                    />
                </div>
            )}

            {/* Macro list */}
            <div className="macro-list">
                {macros.length === 0 ? (
                    <p className="no-data">Sin macros guardados.</p>
                ) : macros.map((m, i) => (
                    <div key={i} className="macro-item">
                        <div className="macro-info">
                            <strong>{m.name}</strong>
                            <small>{m.action_count} pasos{m.duration ? ` · ${Math.round(m.duration)}s` : ''}</small>
                        </div>
                        <div className="macro-actions" style={{ display: 'flex', gap: '2px' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => startEditing(m.name)} title="Editar">
                                <Edit3 size={14} />
                            </button>
                            <button className={`btn btn-ghost btn-sm ${!isLocal ? 'btn-disabled' : ''}`}
                                onClick={() => playMacro(m.name, false)} disabled={!isLocal} title="Reproducir (normal)"
                            ><Play size={14} /></button>
                            <button className={`btn btn-ghost btn-sm ${!isLocal ? 'btn-disabled' : ''}`}
                                onClick={() => playMacro(m.name, true)} disabled={!isLocal} title="Smart Playback (con verificación)"
                                style={{ color: '#a78bfa' }}
                            ><Brain size={14} /></button>
                            <button className="btn btn-danger-ghost btn-sm" onClick={() => deleteMacro(m.name)} title="Eliminar">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MacroManager;
