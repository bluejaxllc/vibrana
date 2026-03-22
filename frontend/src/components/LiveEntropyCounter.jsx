import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Volume2, VolumeX, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

import { API } from '../config.js';

const LiveEntropyCounter = ({ patientId }) => {
    const [liveData, setLiveData] = useState(null);
    const [isRunning, setIsRunning] = useState(false);
    const [audioEnabled, setAudioEnabled] = useState(false);
    const [history, setHistory] = useState([]);

    const playAlertSound = useCallback((level) => {
        if (!audioEnabled) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            // Higher frequency for higher entropy
            oscillator.frequency.value = 200 + (level * 150);
            oscillator.type = level >= 5 ? 'sawtooth' : 'sine';
            gainNode.gain.value = 0.1;

            oscillator.start();
            oscillator.stop(ctx.currentTime + 0.15);
        } catch { /* audio not available */ }
    }, [audioEnabled]);

    const fetchLiveAnalysis = useCallback(async () => {
        try {
            const body = { patient_id: patientId || null };
            const res = await fetch(`${API}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.summary) {
                setLiveData(data.summary);
                setHistory(prev => [...prev.slice(-30), {
                    time: new Date().toLocaleTimeString(),
                    total: data.summary.total_points || 0,
                    status: data.summary.status || 'Unknown'
                }]);

                // Alert on high entropy
                const counts = data.summary.counts || {};
                const lvl6 = parseInt(counts['6']) || 0;
                const lvl5 = parseInt(counts['5']) || 0;
                if (lvl6 > 3) {
                    playAlertSound(6);
                    toast('⚠️ ¡Entropía L6 alta detectada!', {
                        icon: '🔴',
                        style: { background: '#2a0f0f', border: '1px solid #ff5555', color: '#ff5555' }
                    });
                } else if (lvl5 > 5) {
                    playAlertSound(5);
                }
            }
        } catch (err) {
            console.error("Live analysis error:", err);
        }
    }, [patientId, playAlertSound]);

    const startLiveMonitoring = () => {
        setIsRunning(true);
        toast.success('Monitoreo en vivo iniciado');
    };

    const stopLiveMonitoring = () => {
        setIsRunning(false);
        toast.success('Monitoreo en vivo detenido');
    };

    useEffect(() => {
        let id;
        if (isRunning) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            fetchLiveAnalysis(); // Initial call
            id = setInterval(fetchLiveAnalysis, 3000);
        }
        return () => {
            if (id) clearInterval(id);
        };
    }, [isRunning, fetchLiveAnalysis]);

    const getBarWidth = (count, total) => {
        if (!total || total === 0) return 0;
        return Math.min((count / total) * 100, 100);
    };

    const levelColors = ['#50fa7b', '#b8e986', '#f1fa8c', '#ffb86c', '#ff7979', '#ff5555'];

    return (
        <div className="live-entropy">
            <div className="live-entropy-header">
                <h3><Zap size={14} className={isRunning ? 'pulse-icon' : ''} /> Entropía en Vivo</h3>
                <div className="live-controls">
                    <button
                        className={`btn btn-sm ${audioEnabled ? 'btn-analyze' : 'btn-ghost'}`}
                        onClick={() => setAudioEnabled(!audioEnabled)}
                        title={audioEnabled ? 'Silenciar alertas' : 'Activar alertas de audio'}
                    >
                        {audioEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                    </button>
                    {!isRunning ? (
                        <button className="btn btn-analyze btn-sm" onClick={startLiveMonitoring}>
                            <Activity size={12} /> Iniciar
                        </button>
                    ) : (
                        <button className="btn btn-danger-ghost btn-sm" onClick={stopLiveMonitoring}>
                            Detener
                        </button>
                    )}
                </div>
            </div>

            {isRunning && (
                <div className="live-indicator">
                    <span className="live-dot" /> EN VIVO
                </div>
            )}

            {liveData && (
                <div className="live-bars">
                    {[1, 2, 3, 4, 5, 6].map(level => {
                        const count = parseInt(liveData.counts?.[String(level)]) || 0;
                        const total = liveData.total_points || 1;
                        return (
                            <div key={level} className="live-bar-row">
                                <span className="bar-label" style={{ color: levelColors[level - 1] }}>L{level}</span>
                                <div className="bar-track">
                                    <div
                                        className="bar-fill"
                                        style={{
                                            width: `${getBarWidth(count, total)}%`,
                                            background: levelColors[level - 1],
                                            transition: 'width 0.5s ease'
                                        }}
                                    />
                                </div>
                                <span className="bar-count">{count}</span>
                            </div>
                        );
                    })}
                    <div className="live-total">
                        <span>Total: {liveData.total_points}</span>
                        <span className="live-status">{liveData.status}</span>
                    </div>
                </div>
            )}

            {history.length > 0 && (
                <div className="live-history">
                    <small style={{ color: 'var(--text-muted)' }}>{history.length} muestras</small>
                    <div className="mini-sparkline">
                        {history.map((h, i) => (
                            <div
                                key={i}
                                className="spark-bar"
                                style={{
                                    height: `${Math.min(h.total * 2, 100)}%`,
                                    background: h.total > 15 ? '#ff5555' : h.total > 8 ? '#ffb86c' : '#50fa7b'
                                }}
                                title={`${h.time}: ${h.total} pts`}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LiveEntropyCounter;
