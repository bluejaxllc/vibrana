import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Maximize, MonitorUp } from 'lucide-react';


const LiveMonitor = ({ activeTeam }) => {
    const [isSharing, setIsSharing] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [uptime, setUptime] = useState(0);
    const [resolution, setResolution] = useState('—');
    const [remoteMode, setRemoteMode] = useState(false); // Repurposed as "Auto-Detect" mode
    const [remoteFrame, setRemoteFrame] = useState(null);
    const [remoteStatus, setRemoteStatus] = useState('offline');
    const [latestEvent, setLatestEvent] = useState(null);
    const [lastEventId, setLastEventId] = useState(0);
    const [shareError, setShareError] = useState(null);

    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const containerRef = useRef(null);

    const [sendingCmd, setSendingCmd] = useState(false);
    const API = "http://localhost:5001"; // Make sure to point to local backend for ScreenWatcher

    // Polling for ScreenWatcher events
    useEffect(() => {
        if (!remoteMode || isSharing) return;

        const pollEvents = async () => {
            try {
                const res = await fetch(`${API}/watcher/events?since_id=${lastEventId}&limit=1`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.events && data.events.length > 0) {
                        const event = data.events[data.events.length - 1]; // Get the newest
                        setLatestEvent(event);
                        setLastEventId(event.id);
                        setRemoteStatus('online');
                        setResolution(`NLS: ${event.organ_detected}`);
                    }
                }
            } catch (err) {
                // Silent fail for polling
            }
        };

        const interval = setInterval(pollEvents, 1000);
        return () => clearInterval(interval);
    }, [remoteMode, isSharing, lastEventId]);

    // Handle turning Auto-Detect on/off on backend
    const toggleAutoDetect = async () => {
        const newMode = !remoteMode;
        setRemoteMode(newMode);
        try {
            const endpoint = newMode ? `${API}/watcher/start` : `${API}/watcher/stop`;
            await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ patient_id: null }) // Optionally send selected patient ID
            });
            if (!newMode) {
                setRemoteStatus('offline');
                setResolution('—');
            }
        } catch (e) {
            console.error("Failed to toggle watcher:", e);
        }
    };

    const stopRef = useRef(null);

    const startScreenShare = useCallback(async () => {
        setShareError(null);
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                setShareError('Screen sharing is not supported in this browser.');
                return;
            }
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always',
                    displaySurface: 'monitor',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: 30 }
                },
                audio: false
            });

            streamRef.current = stream;
            const videoTrack = stream.getVideoTracks()[0];
            const settings = videoTrack.getSettings();
            setResolution(`${settings.width || '?'}x${settings.height || '?'}`);
            setIsSharing(true);
            setUptime(0);
            videoTrack.onended = () => {
                if (stopRef.current) stopRef.current();
            };
        } catch (err) {
            if (err.name === 'NotAllowedError') {
                setShareError('Permission denied. Click again to retry.');
            } else {
                setShareError(`Error: ${err.message}`);
            }
            console.error('Screen share error:', err);
        }
    }, []);

    useEffect(() => {
        if (isSharing && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(() => { });
        }
    }, [isSharing]);

    const stopScreenShare = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
        setIsSharing(false);
        setResolution('—');
    }, []);

    // Keep the ref in sync so the onended callback always uses fresh fn
    useEffect(() => { stopRef.current = stopScreenShare; }, [stopScreenShare]);

    useEffect(() => {
        if (!isSharing) return;
        const interval = setInterval(() => setUptime(prev => prev + 1), 1000);
        return () => clearInterval(interval);
    }, [isSharing]);

    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const formatUptime = (s) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    const sendControlCommand = async (command, params = {}) => {
        if (!activeTeam || sendingCmd) return;
        setSendingCmd(true);
        try {
            const res = await fetch(`${API}/live/control`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}`
                },
                body: JSON.stringify({
                    team_id: activeTeam.team_id,
                    command,
                    params
                })
            });
            if (!res.ok) {
                const err = await res.json();
                alert(err.error || 'Failed to send command');
            }
        } catch (err) {
            console.error('Remote control error:', err);
        } finally {
            setSendingCmd(false);
        }
    };

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    };

    return (
        <div
            className="live-monitor"
            ref={containerRef}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="monitor-header">
                <h2>
                    <span className={`monitor-live-dot${isSharing || remoteStatus === 'online' ? '' : ' offline'}`} />
                    {remoteMode ? 'Monitor Auto-Detectado' : 'Transmisión Local en Vivo'}
                </h2>
                <div className="monitor-meta flex items-center gap-2">
                    <button
                        className={`btn-xs border px-2 h-5 rounded transition-all opacity-80 hover:opacity-100 ${remoteMode ? 'border-accent bg-accent/20 text-accent' : 'border-white/10 hover:border-accent/50'}`}
                        onClick={toggleAutoDetect}
                    >
                        {remoteMode ? 'Desactivar Auto-Detección' : 'Activar Auto-Detección'}
                    </button>
                    <button
                        className="btn-xs border border-white/10 hover:border-accent/50 px-1.5 h-5 rounded transition-all opacity-60 hover:opacity-100"
                        onClick={toggleFullscreen}
                        title="Fullscreen / Pop Out"
                    >
                        <Maximize size={12} />
                    </button>
                    {(isSharing || (remoteMode && remoteFrame)) && <span className="monitor-uptime">{formatUptime(uptime)}</span>}
                    <span className="monitor-res">{resolution}</span>
                </div>
            </div>

            <div className="monitor-screen">
                {(!isSharing && !remoteMode) ? (
                    <div className="monitor-offline" onClick={startScreenShare}>
                        <div className="monitor-offline-icon">
                            <MonitorUp size={48} strokeWidth={1.5} />
                        </div>
                        <span className="monitor-offline-text">Compartir Pantalla</span>
                        <span className="monitor-offline-hint">Clic para iniciar captura de pantalla</span>
                        {shareError && <span style={{ color: '#ff5555', fontSize: '0.75rem', marginTop: 4 }}>{shareError}</span>}
                    </div>
                ) : remoteMode ? (
                    <div className="monitor-remote-container" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '10px' }}>
                        {latestEvent ? (
                            <div className="event-display flex flex-col h-full bg-black/40 border border-white/10 rounded-lg p-4 overflow-y-auto">
                                <div className="flex justify-between items-start mb-4 border-b border-white/10 pb-2">
                                    <div>
                                        <h3 className="text-accent text-lg font-bold">{latestEvent.organ_detected}</h3>
                                        <span className="text-xs opacity-60">ID: #{latestEvent.id} | {new Date(latestEvent.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <div className="flex bg-white/5 rounded-full px-3 py-1 text-xs">
                                        <span className="text-white/60 mr-2">Cambio:</span>
                                        <span className="text-green-400">{latestEvent.change_pct}%</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 flex-grow">
                                    <div className="bg-black/50 p-3 rounded-lg border border-white/5">
                                        <div className="text-xs uppercase opacity-50 mb-2 font-semibold">Análisis de Entropía</div>
                                        {latestEvent.analysis && latestEvent.analysis.total_points !== undefined ? (
                                            <div>
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-xs">Puntos Totales:</span>
                                                    <span className="text-accent font-mono">{latestEvent.analysis.total_points}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs">Estado:</span>
                                                    <span className={`text-xs px-2 py-0.5 rounded ${latestEvent.analysis.status.includes('Pathology') ? 'bg-red-500/20 text-red-400' :
                                                        latestEvent.analysis.status.includes('Functional') ? 'bg-yellow-500/20 text-yellow-400' :
                                                            'bg-green-500/20 text-green-400'
                                                        }`}>{latestEvent.analysis.status}</span>
                                                </div>
                                                {/* Optional: Show distribution bars like in OrganMap */}
                                            </div>
                                        ) : (
                                            <div className="text-xs opacity-50 italic">Procesando análisis...</div>
                                        )}
                                    </div>

                                    <div className="bg-black/50 p-3 rounded-lg border border-white/5 flex flex-col items-center justify-center">
                                        <div className="text-xs uppercase opacity-50 mb-2 font-semibold w-full text-left">Última Captura</div>
                                        <div className="w-full h-full min-h-[80px] flex items-center justify-center border border-dashed border-white/10 rounded overflow-hidden">
                                            {latestEvent.id ? (
                                                <img
                                                    src={`${API}/snapshots/log_${latestEvent.id}.jpg`}
                                                    alt="Scan snapshot"
                                                    className="w-full h-full object-cover opacity-80"
                                                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                                                />
                                            ) : null}
                                            <span className="text-xs opacity-30 text-center" style={{ display: latestEvent.id ? 'none' : 'block' }}>Imagen no disponible</span>
                                        </div>
                                    </div>
                                </div>

                                {latestEvent.nls_readings?.rows && latestEvent.nls_readings.rows.length > 0 && (
                                    <div className="mt-4 border-t border-white/10 pt-2">
                                        <div className="text-[10px] uppercase opacity-50 mb-1">Etalones Detectados</div>
                                        <div className="max-h-[60px] overflow-y-auto pr-2 custom-scrollbar">
                                            {latestEvent.nls_readings.rows.slice(0, 3).map((r, i) => (
                                                <div key={i} className="flex justify-between text-xs py-0.5">
                                                    <span className="opacity-80 truncate pr-2 max-w-[80%]">{r.name}</span>
                                                    <span className="text-accent/80 font-mono">{r.d_value || r.css}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-xs opacity-50 flex flex-col items-center justify-center h-full gap-3">
                                <div className="monitor-scanline relative h-1" />
                                <div className="flex items-center gap-2">
                                    <div className="animate-pulse h-2 w-2 bg-accent rounded-full" />
                                    Observando pantalla para cambios NLS...
                                </div>
                                <div className="opacity-40 max-w-[200px] text-center mt-2 font-mono" style={{ fontSize: '10px' }}>
                                    Cambios de píxeles &gt; 1% activarán el análisis y registro automáticamente.
                                </div>
                            </div>
                        )}
                        <div className="monitor-scanline" />
                    </div>
                ) : (
                    <>
                        <video
                            ref={videoRef}
                            autoPlay playsInline muted
                            className="monitor-feed-img"
                        />
                        <div className="monitor-scanline" />
                        <div className="monitor-rec"><span className="monitor-rec-dot" />REC LOCAL</div>
                        <button className="monitor-stop-btn" onClick={stopScreenShare}>■ Detener</button>
                    </>
                )}
            </div>
        </div>
    );
};

export default LiveMonitor;
