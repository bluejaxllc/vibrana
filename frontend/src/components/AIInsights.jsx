import React, { useState } from 'react';
import { Brain, AlertTriangle, TrendingUp, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

import { API } from '../config.js';

const AIInsights = ({ scanId, patientId }) => {
    const [interpretation, setInterpretation] = useState(null);
    const [anomalies, setAnomalies] = useState(null);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(true);

    const interpretScan = async () => {
        if (!scanId) {
            toast.error('Seleccione un escaneo para interpretar');
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`${API}/ai/interpret`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scan_id: scanId })
            });
            const data = await res.json();
            if (res.ok) {
                setInterpretation(data);
                toast.success('Interpretación de IA completada');
            } else {
                toast.error(data.error || 'Interpretación fallida');
            }
        } catch {
            toast.error('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    const detectAnomalies = async () => {
        if (!patientId) return;
        try {
            const res = await fetch(`${API}/ai/anomalies/${patientId}`);
            const data = await res.json();
            setAnomalies(data);
        } catch { console.error('Failed to detect anomalies'); }
    };

    const getSeverityColor = (severity) => {
        const colors = {
            'Critical': '#ff5555',
            'Warning': '#ffb86c',
            'Attention': '#f1fa8c',
            'Normal': '#50fa7b'
        };
        return colors[severity] || '#8be9fd';
    };

    const getRiskGradient = (score) => {
        if (score >= 75) return 'linear-gradient(90deg, #ff5555 0%, #ff7979 100%)';
        if (score >= 50) return 'linear-gradient(90deg, #ffb86c 0%, #f1fa8c 100%)';
        if (score >= 25) return 'linear-gradient(90deg, #f1fa8c 0%, #b8e986 100%)';
        return 'linear-gradient(90deg, #50fa7b 0%, #b8e986 100%)';
    };

    return (
        <div className="ai-insights">
            <div className="ai-header" onClick={() => setExpanded(!expanded)}>
                <h3><Brain size={16} /> Perspectivas de IA</h3>
                <div className="ai-actions">
                    <button className="btn btn-analyze btn-sm" onClick={(e) => { e.stopPropagation(); interpretScan(); }} disabled={loading}>
                        {loading ? '...' : 'Interpretar'}
                    </button>
                    {patientId && (
                        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); detectAnomalies(); }}>
                            Anomalías
                        </button>
                    )}
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
            </div>

            {expanded && interpretation && (
                <div className="ai-interpretation">
                    {/* Risk Score Bar */}
                    <div className="risk-score-container">
                        <div className="risk-label">
                            <span>Puntuación de Riesgo</span>
                            <span className="risk-value" style={{ color: getSeverityColor(interpretation.severity) }}>
                                {interpretation.risk_score}/100
                            </span>
                        </div>
                        <div className="risk-bar-track">
                            <div
                                className="risk-bar-fill"
                                style={{
                                    width: `${interpretation.risk_score}%`,
                                    background: getRiskGradient(interpretation.risk_score)
                                }}
                            />
                        </div>
                        <span className="severity-badge" style={{
                            background: `${getSeverityColor(interpretation.severity)}22`,
                            color: getSeverityColor(interpretation.severity),
                            border: `1px solid ${getSeverityColor(interpretation.severity)}44`
                        }}>
                            {interpretation.severity}
                        </span>
                    </div>

                    {/* Interpretation */}
                    <div className="ai-text">
                        <p>{interpretation.interpretation}</p>
                    </div>

                    {/* Patterns */}
                    {interpretation.patterns?.length > 0 && (
                        <div className="ai-patterns">
                            <h4><TrendingUp size={12} /> Patrones</h4>
                            {interpretation.patterns.map((p, i) => (
                                <div key={i} className="pattern-item">{p}</div>
                            ))}
                        </div>
                    )}

                    {/* Recommendations */}
                    <div className="ai-recommendations">
                        <h4><Activity size={12} /> Recomendaciones</h4>
                        {interpretation.recommendations?.map((r, i) => (
                            <div key={i} className="recommendation-item">• {r}</div>
                        ))}
                    </div>
                </div>
            )}

            {expanded && anomalies && (
                <div className="ai-anomalies">
                    <h4><AlertTriangle size={12} /> Detección de Anomalías</h4>
                    <div className="anomaly-summary">
                        <span>Escaneos analizados: {anomalies.total_scans}</span>
                        <span className={`trend-badge ${anomalies.risk_trend}`}>
                            Tendencia: {anomalies.risk_trend}
                        </span>
                    </div>
                    {anomalies.anomalies?.length === 0 ? (
                        <p className="no-data">Sin anomalías detectadas ✓</p>
                    ) : (
                        anomalies.anomalies?.map((a, i) => (
                            <div key={i} className={`anomaly-item ${a.severity}`}>
                                <span className="anomaly-type">{a.type}</span>
                                <span className="anomaly-msg">{a.message}</span>
                                <small>{a.organ}</small>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default AIInsights;
