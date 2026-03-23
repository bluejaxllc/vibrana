import { useState, useEffect, useCallback } from 'react';

import { API } from '../config.js';

const SEVERITY_CONFIG = {
    critical: { color: '#ff5555', bg: 'rgba(255,85,85,0.1)', icon: '🔴', label: 'Critical' },
    warning: { color: '#ffb86c', bg: 'rgba(255,184,108,0.1)', icon: '🟠', label: 'Warning' },
    attention: { color: '#f1fa8c', bg: 'rgba(241,250,140,0.1)', icon: '🟡', label: 'Attention' },
    normal: { color: '#50fa7b', bg: 'rgba(80,250,123,0.1)', icon: '🟢', label: 'Normal' },
};

export default function DiagnosticLog() {
    const [logs, setLogs] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [selectedLog, setSelectedLog] = useState(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    // Filters
    const [severityFilter, setSeverityFilter] = useState('');
    const [organFilter, setOrganFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const fetchLogs = useCallback(async () => {
        try {
            const teamId = localStorage.getItem('vibrana_active_team');
            const params = new URLSearchParams({ page, per_page: 30 });
            if (severityFilter) params.set('severity', severityFilter);
            if (organFilter) params.set('organ', organFilter);
            if (searchQuery) params.set('search', searchQuery);
            if (teamId) params.set('team_id', teamId);

            const res = await fetch(`${API}/diagnostic-logs?${params}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
            });
            const data = await res.json();
            setLogs(data.logs || []);
            setTotal(data.total || 0);
            setTotalPages(data.total_pages || 1);
        } catch (err) {
            console.error('Failed to fetch logs:', err);
        }
        setLoading(false);
    }, [page, severityFilter, organFilter, searchQuery]);

    const fetchStats = useCallback(async () => {
        try {
            const teamId = localStorage.getItem('vibrana_active_team');
            const url = teamId ? `${API}/diagnostic-logs/stats?team_id=${teamId}` : `${API}/diagnostic-logs/stats`;
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
            });
            const data = await res.json();
            setStats(data);
        } catch (err) {
            console.error('Failed to fetch stats:', err);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchLogs();
        fetchStats();
    }, [fetchLogs, fetchStats]);

    // Auto-refresh every 5 seconds
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(() => {
            fetchLogs();
            fetchStats();
        }, 5000);
        return () => clearInterval(interval);
    }, [autoRefresh, fetchLogs, fetchStats]);

    const handleExport = async () => {
        try {
            const res = await fetch(`${API}/diagnostic-logs/export`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
            });
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `diagnostic_logs_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to export logs:', err);
        }
    };

    const handleClear = async () => {
        if (!confirm('¿Limpiar todos los registros de diagnóstico? Esta acción no se puede deshacer.')) return;
        try {
            await fetch(`${API}/diagnostic-logs/clear`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }, body: JSON.stringify({}) });
            fetchLogs();
            fetchStats();
        } catch (err) {
            console.error('Failed to clear logs:', err);
        }
    };

    const formatTime = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const formatDate = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });
    };

    const sevCfg = (sev) => SEVERITY_CONFIG[sev] || SEVERITY_CONFIG.normal;

    return (
        <div className="diagnostic-log-page">
            {/* Header */}
            <div className="diag-header">
                <div className="diag-header-left">
                    <a href="/" className="btn btn-ghost btn-sm">← Panel Principal</a>
                    <h1>📋 Registro de Diagnóstico</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="diag-subtitle">Cambios auto-detectados catalogados para diagnósticos</span>
                        <span style={{ fontSize: '0.7rem', background: 'rgba(189, 147, 249, 0.1)', color: '#bd93f9', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(189, 147, 249, 0.3)' }}>
                            ✨ Mejorado con IA
                        </span>
                    </div>
                </div>
                <div className="diag-header-right">
                    <button
                        className={`btn btn-sm ${autoRefresh ? 'btn-accent' : 'btn-ghost'}`}
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        title={autoRefresh ? 'Auto-actualizar ACTIVADO (5s)' : 'Auto-actualizar DESACTIVADO'}
                    >
                        {autoRefresh ? '🔄 En Vivo' : '⏸ Pausado'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={handleExport}>📥 Exportar CSV</button>
                    <button className="btn btn-ghost btn-sm btn-danger" onClick={handleClear}>🗑 Limpiar</button>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="diag-stats-row">
                    <div className="diag-stat-card">
                        <div className="diag-stat-value">{stats.total_logs}</div>
                        <div className="diag-stat-label">Registros Totales</div>
                    </div>
                    <div className="diag-stat-card">
                        <div className="diag-stat-value">{stats.recent_24h}</div>
                        <div className="diag-stat-label">Últimas 24h</div>
                    </div>
                    <div className="diag-stat-card critical">
                        <div className="diag-stat-value">{stats.by_severity?.critical || 0}</div>
                        <div className="diag-stat-label">Crítico</div>
                    </div>
                    <div className="diag-stat-card warning">
                        <div className="diag-stat-value">{stats.by_severity?.warning || 0}</div>
                        <div className="diag-stat-label">Advertencia</div>
                    </div>
                    <div className="diag-stat-card attention">
                        <div className="diag-stat-value">{stats.by_severity?.attention || 0}</div>
                        <div className="diag-stat-label">Atención</div>
                    </div>
                    <div className="diag-stat-card normal">
                        <div className="diag-stat-value">{stats.by_severity?.normal || 0}</div>
                        <div className="diag-stat-label">Normal</div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="diag-filters">
                <input
                    type="text"
                    placeholder="🔍 Buscar órgano, texto OCR..."
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                    className="diag-search"
                />
                <select
                    value={severityFilter}
                    onChange={e => { setSeverityFilter(e.target.value); setPage(1); }}
                    className="diag-select"
                >
                    <option value="">Todas las Severidades</option>
                    <option value="critical">🔴 Crítico</option>
                    <option value="warning">🟠 Advertencia</option>
                    <option value="attention">🟡 Atención</option>
                    <option value="normal">🟢 Normal</option>
                </select>
                <input
                    type="text"
                    placeholder="Filtrar por órgano..."
                    value={organFilter}
                    onChange={e => { setOrganFilter(e.target.value); setPage(1); }}
                    className="diag-organ-filter"
                />
                <span className="diag-count">{total} registros</span>
            </div>

            {/* Log Table */}
            <div className="diag-table-wrap">
                {loading ? (
                    <div className="diag-loading">Cargando registros de diagnóstico...</div>
                ) : logs.length === 0 ? (
                    <div className="diag-empty">
                        <span style={{ fontSize: '2rem' }}>📋</span>
                        <p>Sin registros de diagnóstico aún.</p>
                        <p className="text-muted">Inicie el observador para detectar y registrar automáticamente los cambios de pantalla.</p>
                    </div>
                ) : (
                    <table className="diag-table">
                        <thead>
                            <tr>
                                <th>Severidad</th>
                                <th>Hora</th>
                                <th>Órgano</th>
                                <th>Cambio</th>
                                <th>Puntos</th>
                                <th>Estado</th>
                                <th>NLS</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map(log => {
                                const sc = sevCfg(log.severity);
                                const analysis = log.entropy_analysis || {};
                                return (
                                    <tr key={log.id} className={`diag-row severity-${log.severity}`}>
                                        <td>
                                            <span
                                                className="severity-badge"
                                                style={{ background: sc.bg, color: sc.color, borderColor: sc.color }}
                                            >
                                                {sc.icon} {sc.label}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="diag-time">{formatTime(log.timestamp)}</div>
                                            <div className="diag-date">{formatDate(log.timestamp)}</div>
                                        </td>
                                        <td className="diag-organ">{log.organ_detected || 'Desconocido'}</td>
                                        <td className="diag-snapshot">
                                            {log.snapshot_url ? (
                                                <img
                                                    src={`${API}${log.snapshot_url}`}
                                                    alt="Vista Previa"
                                                    className="diag-thumbnail"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedLog(log);
                                                    }}
                                                />
                                            ) : (
                                                <div className="diag-no-thumb">Sin Vista Previa</div>
                                            )}
                                        </td>
                                        <td className="diag-change">{log.change_pct?.toFixed(1)}%</td>
                                        <td className="diag-points">{analysis.total_points || 0}</td>
                                        <td className="diag-status">{analysis.status || '—'}</td>
                                        <td>{log.nls_window_found ? '✅' : '—'}</td>
                                        <td>
                                            <button
                                                className="btn btn-ghost btn-xs"
                                                onClick={() => setSelectedLog(log)}
                                                title="Ver detalles"
                                            >
                                                🔍
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="diag-pagination">
                    <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                        ← Anterior
                    </button>
                    <span className="diag-page-info">Página {page} de {totalPages}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                        Siguiente →
                    </button>
                </div>
            )}

            {/* Detail Modal */}
            {selectedLog && (
                <div className="diag-modal-overlay" onClick={() => setSelectedLog(null)}>
                    <div className="diag-modal" onClick={e => e.stopPropagation()}>
                        <div className="diag-modal-header">
                            <h2>📋 Detalle del Registro</h2>
                            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedLog(null)}>✕</button>
                        </div>
                        <div className="diag-modal-body">
                            <div className="diag-detail-grid">
                                <div className="diag-detail-item">
                                    <label>Fecha y Hora</label>
                                    <span>{new Date(selectedLog.timestamp).toLocaleString('es-MX')}</span>
                                </div>
                                <div className="diag-detail-item">
                                    <label>Órgano</label>
                                    <span>{selectedLog.organ_detected}</span>
                                </div>
                                <div className="diag-detail-item">
                                    <label>Severidad</label>
                                    <span className="severity-badge" style={{
                                        background: sevCfg(selectedLog.severity).bg,
                                        color: sevCfg(selectedLog.severity).color,
                                        borderColor: sevCfg(selectedLog.severity).color
                                    }}>
                                        {sevCfg(selectedLog.severity).icon} {sevCfg(selectedLog.severity).label}
                                    </span>
                                </div>
                                <div className="diag-detail-item">
                                    <label>Cambio %</label>
                                    <span>{selectedLog.change_pct?.toFixed(2)}%</span>
                                </div>
                                <div className="diag-detail-item">
                                    <label>Ventana NLS</label>
                                    <span>{selectedLog.nls_window_found ? '✅ Detectada' : '❌ No Encontrada'}</span>
                                </div>
                                <div className="diag-detail-item">
                                    <label>Tipo de Evento</label>
                                    <span>{selectedLog.event_type}</span>
                                </div>
                            </div>

                            {/* Snapshot Preview (Phase 11) */}
                            {selectedLog.snapshot_url && (
                                <div className="diag-detail-section">
                                    <h3>Captura de Diagnóstico</h3>
                                    <div className="diag-full-snapshot">
                                        <img src={`${API}${selectedLog.snapshot_url}`} alt="Captura de Escaneo" />
                                    </div>
                                </div>
                            )}

                            {/* Entropy Analysis */}
                            {selectedLog.entropy_analysis && Object.keys(selectedLog.entropy_analysis).length > 0 && (
                                <div className="diag-detail-section">
                                    <h3>Análisis de Entropía</h3>
                                    <div className="diag-entropy-grid">
                                        <div><label>Status</label><span>{selectedLog.entropy_analysis.status}</span></div>
                                        <div><label>Puntos Totales</label><span>{selectedLog.entropy_analysis.total_points}</span></div>
                                        {selectedLog.entropy_analysis.counts && Object.entries(selectedLog.entropy_analysis.counts).map(([level, count]) => (
                                            <div key={level}><label>Level {level}</label><span>{count}</span></div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* NLS Readings */}
                            {selectedLog.nls_readings?.rows?.length > 0 && (
                                <div className="diag-detail-section">
                                    <h3>Lecturas NLS ({selectedLog.nls_readings.row_count} filas)</h3>
                                    <div className="diag-nls-table-wrap">
                                        <table className="diag-nls-table">
                                            <thead>
                                                <tr>
                                                    {Object.keys(selectedLog.nls_readings.rows[0] || {}).map(key => (
                                                        <th key={key}>{key}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedLog.nls_readings.rows.map((row, i) => (
                                                    <tr key={i}>
                                                        {Object.values(row).map((val, j) => (
                                                            <td key={j}>{String(val)}</td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* OCR Text */}
                            {selectedLog.ocr_text && (
                                <div className="diag-detail-section">
                                    <h3>Texto OCR Sin Procesar</h3>
                                    <pre className="diag-ocr-text">{selectedLog.ocr_text}</pre>
                                </div>
                            )}

                            {/* Header / Status */}
                            {(selectedLog.header_text || selectedLog.status_bar) && (
                                <div className="diag-detail-section">
                                    <h3>Metadatos</h3>
                                    {selectedLog.header_text && <p><strong>Encabezado:</strong> {selectedLog.header_text}</p>}
                                    {selectedLog.status_bar && <p><strong>Barra de Estado:</strong> {selectedLog.status_bar}</p>}
                                    {selectedLog.summary_text && <p><strong>Resumen:</strong> {selectedLog.summary_text}</p>}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
