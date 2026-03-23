import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Radio, ChevronDown, ChevronRight, FileText, BarChart3, Tag, Clipboard, Type, Activity, Gauge } from 'lucide-react';
import toast from 'react-hot-toast';

import { LOCAL_API as API } from '../config.js';

const ScreenWatcherPanel = ({ patientId }) => {
    const [watching, setWatching] = useState(false);
    const [events, setEvents] = useState([]);
    const [lastEventId, setLastEventId] = useState(0);
    const [totalChanges, setTotalChanges] = useState(0);
    const [expandedEvent, setExpandedEvent] = useState(null);
    const [backendOnline, setBackendOnline] = useState(true);
    const [capturing, setCapturing] = useState(false);
    const pollRef = useRef(null);

    // Poll for new events while watching
    useEffect(() => {
        if (watching) {
            pollRef.current = setInterval(async () => {
                try {
                    const res = await fetch(`${API}/watcher/events?since_id=${lastEventId}&limit=20`);
                    const data = await res.json();
                    if (data.events && data.events.length > 0) {
                        setEvents(prev => [...data.events, ...prev].slice(0, 100));
                        const maxId = Math.max(...data.events.map(e => e.id));
                        setLastEventId(maxId);
                        setTotalChanges(data.total_changes);
                        data.events.forEach(evt => {
                            const organ = evt.organ_detected || 'Cambio de pantalla';
                            const rows = evt.nls_readings?.row_count || 0;
                            toast(`🔍 ${organ}${rows > 0 ? ` — ${rows} lecturas` : ''}`, {
                                icon: '📡', duration: 3000
                            });
                        });
                    }
                } catch (e) {
                    console.error('Watcher poll error:', e);
                }
            }, 2000);
        }
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [watching, lastEventId]);

    // Check watcher status on mount
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${API}/watcher/status`);
                const data = await res.json();
                setWatching(data.running);
                setTotalChanges(data.total_changes || 0);
                setBackendOnline(true);
            } catch {
                setBackendOnline(false);
            }
        })();
    }, []);

    const handleManualCapture = async () => {
        setCapturing(true);
        try {
            const res = await fetch(`${API}/watcher/capture`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patient_id: patientId })
            });
            if (res.ok) {
                const data = await res.json();
                toast.success(`📸 Captura manual: ${data.organ_detected || 'pantalla capturada'}`);
                if (data.event) {
                    setEvents(prev => [data.event, ...prev].slice(0, 100));
                }
            } else {
                toast.error('Error en captura manual');
            }
        } catch {
            toast.error('Backend local no disponible');
            setBackendOnline(false);
        } finally {
            setCapturing(false);
        }
    };

    const handleToggle = async () => {
        try {
            if (watching) {
                const res = await fetch(`${API}/watcher/stop`, { method: 'POST' });
                const data = await res.json();
                setWatching(false);
                toast.success(`Observador detenido — ${data.total_changes} cambios capturados`);
            } else {
                const res = await fetch(`${API}/watcher/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ patient_id: patientId })
                });
                await res.json();
                setWatching(true);
                setLastEventId(0);
                toast.success('Auto-observador iniciado — monitoreando cambios en pantalla NLS');
            }
        } catch {
            toast.error('Error al cambiar observador');
        }
    };

    const toggleExpand = (id) => {
        setExpandedEvent(expandedEvent === id ? null : id);
    };

    return (
        <div className={`watcher-panel ${watching ? 'watching-active' : ''}`}>
            <div className="watcher-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h3><Eye size={14} className={watching ? 'pulse-icon' : ''} /> Auto Observador</h3>
                    {watching && (
                        <span className="watcher-live-badge">
                            <Radio size={10} className="pulse-icon" /> LIVE
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {totalChanges > 0 && (
                        <span className="watcher-count">
                            <Activity size={10} /> {totalChanges} cambios
                        </span>
                    )}
                    <button
                        className="btn btn-sm btn-outline"
                        onClick={handleManualCapture}
                        disabled={capturing || !backendOnline}
                        style={{ fontSize: '0.75rem' }}
                    >
                        {capturing ? '📸 Capturando...' : '📸 Capturar Ahora'}
                    </button>
                    <button
                        className={`btn btn-sm ${watching ? 'btn-danger' : 'btn-primary'}`}
                        onClick={handleToggle}
                        disabled={!backendOnline}
                    >
                        {watching ? <><EyeOff size={12} /> Detener</> : <><Eye size={12} /> Iniciar Observador</>}
                    </button>
                </div>
            </div>

            {events.length > 0 ? (
                <div className="watcher-events">
                    {events.map(evt => (
                        <div
                            key={evt.id}
                            className={`watcher-event ${expandedEvent === evt.id ? 'expanded' : ''}`}
                            onClick={() => toggleExpand(evt.id)}
                        >
                            <div className="watcher-event-header">
                                <span className="watcher-event-time">
                                    {new Date(evt.timestamp).toLocaleTimeString()}
                                </span>
                                <span className="watcher-event-organ">
                                    {evt.organ_detected || 'Cambio de Pantalla'}
                                </span>
                                <span className="watcher-event-change">
                                    {evt.change_pct}%
                                </span>
                                {evt.nls_readings?.row_count > 0 && (
                                    <span className="watcher-event-rows">
                                        {evt.nls_readings.row_count} filas
                                    </span>
                                )}
                                <span className={`watcher-event-status status-${evt.analysis?.status?.includes('Normal') ? 'normal' : 'alert'}`}>
                                    {evt.analysis?.total_points || 0} pts
                                </span>
                                {expandedEvent === evt.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </div>

                            {/* Summary line */}
                            {evt.summary && (
                                <div className="watcher-event-summary">{evt.summary}</div>
                            )}

                            {expandedEvent === evt.id && (
                                <div className="watcher-event-details">
                                    {/* NLS Readings Table */}
                                    {evt.nls_readings?.rows?.length > 0 && (
                                        <div className="watcher-detail-section">
                                            <h5><Clipboard size={12} /> Lecturas de Órganos NLS</h5>
                                            <div className="nls-readings-table">
                                                {evt.nls_readings.rows.map((row, i) => (
                                                    <div key={i} className="nls-reading-row">
                                                        <span className="nls-code">{row.code}</span>
                                                        <span className="nls-desc">{row.description}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Reserve % */}
                                    {evt.nls_readings?.reserve_pct != null && (
                                        <div className="watcher-detail-section">
                                            <h5><Gauge size={12} /> Reserva Compensatoria</h5>
                                            <div className="reserve-bar-container">
                                                <div className="reserve-bar" style={{ width: `${evt.nls_readings.reserve_pct}%` }}></div>
                                                <span className="reserve-label">{evt.nls_readings.reserve_pct}%</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* NLS Keywords */}
                                    {evt.nls_readings?.keywords?.length > 0 && (
                                        <div className="watcher-detail-section">
                                            <h5><Tag size={12} /> Palabras Clave Detectadas</h5>
                                            <div className="keyword-tags">
                                                {evt.nls_readings.keywords.slice(0, 10).map((kw, i) => (
                                                    <span key={i} className="keyword-tag">{kw}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Entropy Analysis */}
                                    <div className="watcher-detail-section">
                                        <h5><BarChart3 size={12} /> Análisis de Entropía</h5>
                                        <p><strong>Estado:</strong> {evt.analysis?.status}</p>
                                        <p><strong>Puntos Totales:</strong> {evt.analysis?.total_points}</p>
                                        {evt.analysis?.counts && (
                                            <div className="entropy-grid mini">
                                                {Object.entries(evt.analysis.counts).map(([lvl, count]) => (
                                                    <div key={lvl} className={`entropy-item lvl-${lvl}`}>
                                                        <span>L{lvl}</span>
                                                        <strong>{count}</strong>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Status bar text */}
                                    {evt.status_bar && (
                                        <div className="watcher-detail-section">
                                            <h5><FileText size={12} /> Barra de Estado</h5>
                                            <p className="status-bar-text">{evt.status_bar}</p>
                                        </div>
                                    )}

                                    {/* Raw OCR (collapsed by default) */}
                                    {evt.ocr_text && (
                                        <details className="watcher-detail-section">
                                            <summary className="ocr-toggle"><Type size={12} /> Texto OCR Sin Procesar</summary>
                                            <pre className="watcher-ocr-text">{evt.ocr_text}</pre>
                                        </details>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="watcher-empty">
                    {!backendOnline ? (
                        <><EyeOff size={16} /> Backend local no disponible. Inicie el servidor NLS para activar el observador.</>
                    ) : watching ? (
                        <><Eye size={16} className="pulse-icon" /> Observando cambios en pantalla NLS...</>
                    ) : (
                        'Inicie el observador para auto-detectar cambios de órganos y capturar datos NLS'
                    )}
                </div>
            )}
        </div>
    );
};

export default ScreenWatcherPanel;
