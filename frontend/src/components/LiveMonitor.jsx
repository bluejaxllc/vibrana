import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Maximize, MonitorUp } from 'lucide-react';


const LiveMonitor = ({ onMappingChange }) => {
    const [isSharing, setIsSharing] = useState(false);
    const [uptime, setUptime] = useState(0);
    const [resolution, setResolution] = useState('—');
    const [remoteMode, setRemoteMode] = useState(false); // Repurposed as "Auto-Detect" mode
    const [remoteStatus, setRemoteStatus] = useState('offline');
    const [latestEvent, setLatestEvent] = useState(null);
    const [lastEventId, setLastEventId] = useState(0);
    const [shareError, setShareError] = useState(null);

    // Setup Session States
    const [setupActive, setSetupActive] = useState(false);
    const [setupData, setSetupData] = useState(null);
    const [setupLoading, setSetupLoading] = useState(false);
    const [isAutoExploring, setIsAutoExploring] = useState(false);
    const [ignoredTexts, setIgnoredTexts] = useState(['Cancel', 'Exit', 'Close']);
    const [ignoreInput, setIgnoreInput] = useState('');
    const [windows, setWindows] = useState([]);
    const [selectedWindow, setSelectedWindow] = useState('');
    const [clickedButtons, setClickedButtons] = useState(new Set());
    const [showHelp, setShowHelp] = useState(false);

    // ROI (Region of Interest) state
    const [roi, setRoi] = useState(null); // {x, y, w, h} as percentages
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStart, setDrawStart] = useState(null);
    const [drawCurrent, setDrawCurrent] = useState(null);

    // Sequence builder state
    const [sequenceMode, setSequenceMode] = useState(false);
    const [sequence, setSequence] = useState([]); // [{x, y, text, btnId}]
    const [isExecuting, setIsExecuting] = useState(false);

    // Run Engine state
    const [isRunning, setIsRunning] = useState(false);
    const [runProgress, setRunProgress] = useState(null); // {current_screen, total_screens, pct, current_node}
    const [runResults, setRunResults] = useState(null);

    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const containerRef = useRef(null);
    const imgContainerRef = useRef(null);

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
            } catch {
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

    const toggleSetupSession = async () => {
        if (setupActive) {
            setSetupLoading(true);
            try {
                await fetch(`${API}/api/setup/stop`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` },
                    body: JSON.stringify({ save: true })
                });
            } catch (e) {
                console.error(e);
            }
            setSetupActive(false);
            setSetupData(null);
            setSetupLoading(false);
            onMappingChange?.(false);
        } else {
            // Immediately switch to setup mode with placeholder
            setSetupActive(true);
            setSetupLoading(true);
            onMappingChange?.(true);
            if (isSharing) stopScreenShare();
            if (remoteMode) toggleAutoDetect();
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 30000);
                const res = await fetch(`${API}/api/setup/start`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` },
                    signal: controller.signal
                });
                clearTimeout(timeout);
                const data = await res.json();
                if (data.initial_state) {
                    setSetupData(data.initial_state);
                    if (data.initial_state.target_window) {
                        setSelectedWindow(data.initial_state.target_window);
                    }
                }
            } catch (e) {
                console.error('Setup start error:', e);
                if (e.name === 'AbortError') {
                    console.warn('Setup timed out — use Refresh or select a window');
                }
            }
            setSetupLoading(false);
        }
    };

    useEffect(() => {
        const fetchWindows = async () => {
            try {
                const res = await fetch(`${API}/api/system/windows`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
                });
                const data = await res.json();
                if (data.windows) setWindows(data.windows);
            } catch (e) {
                console.error(e);
            }
        };

        if (setupActive) fetchWindows();
    }, [setupActive]);

    const handleWindowChange = async (e) => {
        const val = e.target.value;
        setSelectedWindow(val);
        try {
            await fetch(`${API}/api/setup/target_window`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` },
                body: JSON.stringify({ target_window: val || null })
            });

            setSetupLoading(true);
            let url = `${API}/api/setup/refresh`;
            if (roi) url += `?roi_x=${roi.x}&roi_y=${roi.y}&roi_w=${roi.w}&roi_h=${roi.h}`;
            const refreshRes = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
            });
            const refreshData = await refreshRes.json();
            if (refreshData.new_state && !refreshData.new_state.error) {
                setSetupData(refreshData.new_state);
                if (refreshData.new_state.target_window) setSelectedWindow(refreshData.new_state.target_window);
            }
            setSetupLoading(false);
        } catch (e) {
            console.error(e);
            setSetupLoading(false);
        }
    };

    const handleSetupClick = async (btn) => {
        if (!setupData || setupLoading) return;
        setSetupLoading(true);
        try {
            const res = await fetch(`${API}/api/setup/click`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` },
                body: JSON.stringify({
                    x: Math.floor(btn.x + (btn.w / 2)),
                    y: Math.floor(btn.y + (btn.h * 0.45)),
                    text: btn.text,
                    node_id: setupData.node_id
                })
            });
            const data = await res.json();
            if (data.new_state && !data.error) {
                setSetupData(data.new_state);
                if (data.new_state.target_window) setSelectedWindow(data.new_state.target_window);
                // Update local click memory from backend
                if (data.new_state.explored_texts) {
                    setClickedButtons(new Set(data.new_state.explored_texts));
                } else {
                    setClickedButtons(prev => new Set([...prev, btn.text]));
                }
            }
        } catch (e) {
            console.error(e);
        }
        setSetupLoading(false);
    };

    const handleAutoExplore = async () => {
        if (!setupActive || setupLoading || isAutoExploring) return;
        setIsAutoExploring(true);
        try {
            // Start auto-explore in background thread on the backend
            await fetch(`${API}/api/setup/auto_explore`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` },
                body: JSON.stringify({ max_steps: 10, ignored_texts: ignoredTexts, roi: roi || undefined })
            });

            // Poll for results every 2 seconds
            const poll = async () => {
                try {
                    const res = await fetch(`${API}/api/setup/auto_explore_poll`, {
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
                    });
                    const data = await res.json();
                    if (data.status === 'running') {
                        // Still running — poll again
                        setTimeout(poll, 2000);
                        return;
                    }
                    // Finished — apply results
                    console.log('[AutoExplore] Response:', data.status, 'steps:', data.steps_taken);
                    if (data.new_state) {
                        setSetupData(data.new_state);
                        if (data.new_state.explored_texts) {
                            setClickedButtons(new Set(data.new_state.explored_texts));
                        }
                    } else if (data.tree && setupData) {
                        setSetupData(prev => ({ ...prev, tree: data.tree }));
                    }
                    setIsAutoExploring(false);
                } catch (e) {
                    console.error('Poll error:', e);
                    setIsAutoExploring(false);
                }
            };
            // Start polling after a brief delay
            setTimeout(poll, 1500);
        } catch (e) {
            console.error('Auto-explore start error:', e);
            setIsAutoExploring(false);
        }
    };

    const stopAutoExplore = async () => {
        try {
            await fetch(`${API}/api/setup/auto_explore_stop`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
            });
        } catch (e) {
            console.error(e);
        }
        // Immediately update UI — backend loop will break on next iteration
        setIsAutoExploring(false);
    };

    // ── Run Engine ──
    const startRun = async () => {
        if (isRunning) return;
        setIsRunning(true);
        setRunResults(null);
        setRunProgress({ current_screen: 0, total_screens: 0, pct: 0, current_node: '' });
        try {
            await fetch(`${API}/api/run/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` },
                body: JSON.stringify({ patient_id: null })
            });
            // Poll for progress
            const pollRun = async () => {
                try {
                    const res = await fetch(`${API}/api/run/poll`, {
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
                    });
                    const data = await res.json();
                    setRunProgress(data.progress);
                    if (data.running) {
                        setTimeout(pollRun, 2000);
                    } else {
                        // Run finished — fetch results
                        const resResults = await fetch(`${API}/api/run/results`, {
                            headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
                        });
                        const results = await resResults.json();
                        setRunResults(results);
                        setIsRunning(false);
                    }
                } catch (e) {
                    console.error('Run poll error:', e);
                    setIsRunning(false);
                }
            };
            setTimeout(pollRun, 1500);
        } catch (e) {
            console.error('Run start error:', e);
            setIsRunning(false);
        }
    };

    const stopRun = async () => {
        try {
            await fetch(`${API}/api/run/stop`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
            });
        } catch (e) {
            console.error(e);
        }
        setIsRunning(false);
    };

    const resetMemory = async () => {
        try {
            await fetch(`${API}/api/setup/reset_memory`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
            });
            setClickedButtons(new Set());
        } catch (e) {
            console.error(e);
        }
    };

    // --- ROI Drawing Handlers ---
    const handleMouseDown = (e) => {
        if (!setupData || setupLoading || sequenceMode || isRunning) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = imgContainerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        setIsDrawing(true);
        setDrawStart({ x, y });
        setDrawCurrent({ x, y });
    };

    const handleMouseMove = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const rect = imgContainerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
        setDrawCurrent({ x, y });
    };

    const handleMouseUp = async (e) => {
        if (!isDrawing || !drawStart || !drawCurrent) { setIsDrawing(false); return; }
        if (e) e.preventDefault();
        setIsDrawing(false);
        const x = Math.min(drawStart.x, drawCurrent.x);
        const y = Math.min(drawStart.y, drawCurrent.y);
        const w = Math.abs(drawCurrent.x - drawStart.x);
        const h = Math.abs(drawCurrent.y - drawStart.y);
        if (w < 3 || h < 3) return; // Too small, ignore
        const newRoi = { x, y, w, h };
        setRoi(newRoi);
        // Re-detect buttons with ROI
        setSetupLoading(true);
        try {
            const res = await fetch(`${API}/api/setup/refresh?roi_x=${newRoi.x}&roi_y=${newRoi.y}&roi_w=${newRoi.w}&roi_h=${newRoi.h}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
            });
            const data = await res.json();
            if (data.new_state && !data.new_state.error) {
                setSetupData(data.new_state);
            }
        } catch (e) {
            console.error(e);
        }
        setSetupLoading(false);
    };

    const clearRoi = async () => {
        setRoi(null);
        setSequence([]);
        setSetupLoading(true);
        try {
            const res = await fetch(`${API}/api/setup/refresh`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
            });
            const data = await res.json();
            if (data.new_state && !data.new_state.error) {
                setSetupData(data.new_state);
                if (data.new_state.target_window) {
                    setSelectedWindow(data.new_state.target_window);
                }
            }
        } catch (e) {
            console.error(e);
        }
        setSetupLoading(false);
    };

    // --- Sequence Builder ---
    const handleSequenceClick = (btn) => {
        if (!sequenceMode) return;
        // Toggle: if already in sequence, remove it
        const idx = sequence.findIndex(s => s.btnId === btn.id);
        if (idx >= 0) {
            setSequence(sequence.filter((_, i) => i !== idx));
        } else {
            setSequence([...sequence, {
                btnId: btn.id,
                x: Math.floor(btn.x + btn.w / 2),
                y: Math.floor(btn.y + btn.h * 0.45),
                text: btn.text
            }]);
        }
    };

    const executeSequence = async () => {
        if (!sequence.length || isExecuting) return;
        setIsExecuting(true);
        try {
            const res = await fetch(`${API}/api/setup/execute_sequence`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` },
                body: JSON.stringify({ steps: sequence })
            });
            const data = await res.json();
            if (data.new_state) {
                setSetupData(data.new_state);
                if (data.new_state.explored_texts) setClickedButtons(new Set(data.new_state.explored_texts));
            }
        } catch (e) {
            console.error(e);
        }
        setIsExecuting(false);
    };

    const formatUptime = (s) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
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
        >
            <div className="monitor-header">
                <h2>
                    <span className={`monitor-live-dot${isSharing || remoteStatus === 'online' || setupActive ? '' : ' offline'}`} />
                    {setupActive ? 'Mapeo de UI (OCR)' : remoteMode ? 'Monitor Auto-Detectado' : 'Transmisión Local en Vivo'}
                </h2>
                <div className="monitor-meta flex items-center gap-2">
                    {setupActive && (
                        <select
                            className="btn-xs border border-white/10 bg-[#0a0f18] text-white px-2 h-5 rounded transition-all focus:border-purple-500/50 outline-none w-32 truncate"
                            value={selectedWindow}
                            onChange={handleWindowChange}
                            title="Seleccionar ventana específica para restringir el OCR"
                            disabled={setupLoading || isAutoExploring}
                        >
                            <option value="">Pantalla Completa</option>
                            {windows.map((w, i) => (
                                <option key={i} value={w}>{w}</option>
                            ))}
                        </select>
                    )}
                    {setupActive && !isAutoExploring && (
                        <button
                            className={`btn-xs border px-2 h-5 rounded transition-all ${selectedWindow
                                ? 'border-blue-400 bg-blue-500/20 text-blue-300 opacity-80 hover:opacity-100 cursor-pointer'
                                : 'border-white/10 bg-white/5 text-white/30 cursor-not-allowed'
                                }`}
                            onClick={handleAutoExplore}
                            disabled={setupLoading || !selectedWindow}
                            title={selectedWindow ? 'Explorar automáticamente los botones' : 'Selecciona una ventana primero'}
                        >
                            ⚡ Auto
                        </button>
                    )}
                    {setupActive && !isAutoExploring && (
                        <button
                            className={`btn-xs border px-2 h-5 rounded transition-all opacity-80 hover:opacity-100 ${sequenceMode ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300' : 'border-white/10 hover:border-cyan-400/50 text-white/50'
                                }`}
                            onClick={() => { setSequenceMode(!sequenceMode); setSequence([]); }}
                            title="Modo secuencia: clic en botones en orden para macro"
                        >
                            {sequenceMode ? '✕ Sec.' : '🔢 Sec.'}
                        </button>
                    )}
                    {setupActive && sequenceMode && sequence.length > 0 && (
                        <button
                            className="btn-xs border border-green-400 bg-green-500/20 text-green-300 px-2 h-5 rounded transition-all opacity-80 hover:opacity-100 shadow-[0_0_8px_rgba(74,222,128,0.3)]"
                            onClick={executeSequence}
                            disabled={isExecuting}
                        >
                            {isExecuting ? '...' : `▶ ${sequence.length}`}
                        </button>
                    )}
                    {setupActive && isAutoExploring && (
                        <button
                            className="btn-xs border border-red-500 bg-red-500/20 text-red-400 px-2 h-5 rounded transition-all shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                            onClick={stopAutoExplore}
                            title="Detener la exploración automática"
                        >
                            Detener
                        </button>
                    )}
                    {setupActive && !isAutoExploring && !isRunning && (setupData?.tree?.nodes?.length || 0) > 0 && (
                        <button
                            className="btn-xs border border-emerald-400 bg-emerald-500/20 text-emerald-300 px-2 h-5 rounded transition-all opacity-80 hover:opacity-100 shadow-[0_0_8px_rgba(52,211,153,0.3)] animate-pulse"
                            onClick={startRun}
                            title="Ejecutar recolección de datos automática"
                        >
                            ▶ Run
                        </button>
                    )}
                    {isRunning && (
                        <button
                            className="btn-xs border border-red-500 bg-red-500/20 text-red-400 px-2 h-5 rounded transition-all shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                            onClick={stopRun}
                            title="Detener la recolección de datos"
                        >
                            ⏹ {runProgress?.pct || 0}%
                        </button>
                    )}
                    <button
                        className={`btn-xs border px-2 h-5 rounded transition-all opacity-80 hover:opacity-100 ${setupActive ? 'border-purple-400 bg-purple-500/20 text-purple-300' : 'border-white/10 hover:border-purple-400/50'}`}
                        onClick={toggleSetupSession}
                        disabled={setupLoading || isAutoExploring}
                    >
                        {setupLoading ? 'Cargando...' : setupActive ? 'Terminar Mapeo' : 'Mapear UI'}
                    </button>
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
                    {(isSharing || remoteMode) && <span className="monitor-uptime">{formatUptime(uptime)}</span>}
                    <span className="monitor-res">{resolution}</span>
                </div>
            </div>

            <div className={`monitor-screen${setupActive ? ' mapping-mode' : ''}`}>
                {setupActive && setupData ? (
                    <>
                        {/* LEFT: Screen Capture with OCR Overlay + ROI Drawing */}
                        <div
                            className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden group"
                        >
                            <div
                                ref={imgContainerRef}
                                className="absolute inset-0 select-none"
                                style={{
                                    cursor: sequenceMode ? 'pointer' : (roi ? 'default' : 'crosshair'),
                                    WebkitUserSelect: 'none',
                                    userSelect: 'none',
                                    WebkitUserDrag: 'none'
                                }}
                                onDragStart={(e) => e.preventDefault()}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={() => { if (isDrawing) handleMouseUp(); }}
                            >
                                <img
                                    src={`data:image/jpeg;base64,${setupData.screen}`}
                                    className="w-full h-full object-contain opacity-80 transition-opacity group-hover:opacity-50 select-none pointer-events-none"
                                    alt="Screen State"
                                    draggable={false}
                                />

                                {/* ROI drawing preview (while dragging) — NEON GREEN */}
                                {isDrawing && drawStart && drawCurrent && (
                                    <div className="absolute z-30 pointer-events-none" style={{
                                        left: `${Math.min(drawStart.x, drawCurrent.x)}%`,
                                        top: `${Math.min(drawStart.y, drawCurrent.y)}%`,
                                        width: `${Math.abs(drawCurrent.x - drawStart.x)}%`,
                                        height: `${Math.abs(drawCurrent.y - drawStart.y)}%`,
                                        border: '3px dashed #00FF66',
                                        backgroundColor: 'rgba(0, 255, 102, 0.15)',
                                        boxShadow: '0 0 15px rgba(0, 255, 102, 0.5), inset 0 0 15px rgba(0, 255, 102, 0.1)',
                                    }} />
                                )}

                                {/* ROI rectangle (after set) — HIGH CONTRAST */}
                                {roi && !isDrawing && (
                                    <>
                                        {/* Dimming overlay outside ROI — darker */}
                                        <div className="absolute inset-0 z-10 pointer-events-none" style={{
                                            backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                            clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% ${roi.y}%, ${roi.x}% ${roi.y}%, ${roi.x}% ${roi.y + roi.h}%, ${roi.x + roi.w}% ${roi.y + roi.h}%, ${roi.x + roi.w}% ${roi.y}%, 0% ${roi.y}%)`
                                        }} />
                                        <div className="absolute z-20 pointer-events-none animate-pulse" style={{
                                            left: `${roi.x}%`, top: `${roi.y}%`, width: `${roi.w}%`, height: `${roi.h}%`,
                                            border: '3px solid #00FF66',
                                            boxShadow: '0 0 20px rgba(0, 255, 102, 0.6), 0 0 40px rgba(0, 255, 102, 0.2)',
                                            borderRadius: '4px',
                                        }}>
                                            <span className="absolute -top-6 left-1 text-[11px] font-bold px-2 py-0.5 rounded shadow-lg" style={{
                                                backgroundColor: '#00FF66',
                                                color: '#000',
                                            }}>
                                                📐 ZONA ACTIVA
                                            </span>
                                        </div>
                                    </>
                                )}

                                {/* Clear ROI button */}
                                {roi && (
                                    <button
                                        className="absolute top-1 right-1 z-30 bg-red-500/80 hover:bg-red-500 text-white text-[10px] px-2 py-0.5 rounded transition-colors"
                                        onClick={(e) => { e.stopPropagation(); clearRoi(); }}
                                    >
                                        ✕ Borrar Zona
                                    </button>
                                )}

                                {/* HUD overlay */}
                                {!roi && !isDrawing && (
                                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="bg-black/80 text-white px-4 py-2 rounded text-sm mb-2 border border-purple-500/50">
                                            {sequenceMode ? '🔢 Modo Secuencia: Clic en botones en orden' : 'Arrastra para seleccionar zona de botones'}
                                        </span>
                                        <span className="bg-black/60 text-white/70 px-3 py-1 rounded text-xs">
                                            {sequenceMode ? 'Los botones se ejecutarán en el orden que los selecciones' : 'Solo botones dentro de la zona serán detectados'}
                                        </span>
                                    </div>
                                )}

                                {/* Bounding boxes */}
                                {setupData.buttons.map(b => {
                                    const isVisited = b.visited || clickedButtons.has(b.text);
                                    const seqIdx = sequence.findIndex(s => s.btnId === b.id);
                                    const isInSequence = seqIdx >= 0;
                                    return (
                                        <div key={b.id}
                                            className={`absolute cursor-pointer transition-all hover:z-10 z-20 ${isInSequence
                                                ? 'border-2 border-cyan-400 bg-cyan-500/20 hover:bg-cyan-500/30 shadow-[0_0_10px_rgba(34,211,238,0.5)]'
                                                : isVisited
                                                    ? 'border-2 border-green-400/70 bg-green-500/15 hover:bg-green-500/30 hover:border-green-300 hover:shadow-[0_0_10px_rgba(74,222,128,0.5)]'
                                                    : 'border border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/40 hover:border-purple-400 hover:shadow-[0_0_10px_rgba(168,85,247,0.5)]'
                                                }`}
                                            style={{
                                                left: `${(b.x / setupData.screen_width) * 100}%`,
                                                top: `${(b.y / setupData.screen_height) * 100}%`,
                                                width: `${(b.w / setupData.screen_width) * 100}%`,
                                                height: `${(b.h / setupData.screen_height) * 100}%`
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (sequenceMode) handleSequenceClick(b);
                                                else handleSetupClick(b);
                                            }}
                                        >
                                            {/* Sequence number badge */}
                                            {isInSequence && (
                                                <span className="absolute -top-3 -left-1 bg-cyan-500 text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full shadow-lg z-30">
                                                    {seqIdx + 1}
                                                </span>
                                            )}
                                            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] bg-black/80 text-white px-1 py-0.5 rounded opacity-0 hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">
                                                {isVisited ? '✓ ' : ''}{b.text} ({b.conf}%)
                                            </span>
                                        </div>
                                    );
                                })}
                                {(setupLoading || isAutoExploring) && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="animate-spin h-6 w-6 border-2 border-purple-500 border-t-transparent rounded-full" />
                                            <span className="text-white/80 text-sm">{isAutoExploring ? "Exploración automática en curso..." : "Navegando y escaneando..."}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* RIGHT: Logic Tree + Workflow Wizard */}
                        <div className="border-l border-white/10 bg-[#0a0f18] p-3 flex flex-col h-full overflow-hidden">

                            {/* ── Step-by-Step Workflow Wizard ── */}
                            <div className="mb-3 bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-lg p-2.5 border border-purple-500/20">
                                <div className="text-[10px] uppercase text-purple-300 font-bold mb-2 tracking-wider">📍 Flujo de Trabajo</div>
                                <div className="flex flex-col gap-1.5">
                                    {[
                                        { step: 1, label: 'Seleccionar Ventana', icon: '🖥️', done: !!selectedWindow, active: !selectedWindow && setupActive, hint: 'Usa el selector arriba para elegir la app' },
                                        { step: 2, label: 'Dibujar Zona (ROI)', icon: '✏️', done: !!roi, active: !!selectedWindow && !roi, hint: 'Arrastra sobre la pantalla para marcar el área' },
                                        { step: 3, label: 'Explorar Botones', icon: '⚡', done: (setupData?.tree?.edges?.length || 0) > 0, active: (!!selectedWindow || !!roi) && !(setupData?.tree?.edges?.length > 0), hint: 'Clic en ⚡ Auto o clic manual en botones detectados' },
                                        { step: 4, label: 'Armar Secuencia', icon: '🔢', done: sequence.length > 0, active: (setupData?.tree?.edges?.length || 0) > 0 && sequence.length === 0, hint: 'Activa 🔢 Sec. y clic en botones en orden' },
                                        { step: 5, label: 'Ejecutar Run', icon: '▶️', done: !!runResults, active: (setupData?.tree?.nodes?.length || 0) > 0 && !isRunning && !runResults, hint: 'Inicia recolección de datos automática' },
                                    ].map(({ step, label, icon, done, active, hint }) => (
                                        <div key={step} className={`flex items-start gap-2 rounded-md px-2 py-1 transition-all ${active ? 'bg-white/5 border border-purple-500/30' : done ? 'opacity-60' : 'opacity-30'}`}>
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${done ? 'bg-green-500/30 text-green-300 border border-green-500/40' : active ? 'bg-purple-500/30 text-purple-300 border border-purple-400/50 animate-pulse' : 'bg-white/5 text-white/30 border border-white/10'}`}>
                                                {done ? '✓' : step}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className={`text-[10px] font-semibold ${done ? 'text-green-300' : active ? 'text-white' : 'text-white/40'}`}>
                                                    {icon} {label}
                                                </div>
                                                {active && <div className="text-[9px] text-white/50 mt-0.5">{hint}</div>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* ── Ignore List (collapsible) ── */}
                            <div className="mb-2">
                                <button
                                    className="w-full text-left text-[10px] text-red-400/80 hover:text-red-300 font-bold uppercase flex items-center gap-1 transition-colors"
                                    onClick={() => setShowHelp(prev => !prev)}
                                >
                                    {ignoredTexts.length > 0 ? `🚫 Ignorar (${ignoredTexts.length})` : '🚫 Ignorar Botones'}
                                    <span className="text-white/30 ml-auto">{showHelp ? '▼' : '▶'}</span>
                                </button>
                                {showHelp && (
                                    <div className="mt-1.5 bg-black/40 rounded-lg p-2 border border-red-500/10">
                                        <div className="flex gap-1.5 mb-1.5">
                                            <input
                                                type="text"
                                                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-red-500/50 transition-colors"
                                                placeholder="Texto a ignorar..."
                                                value={ignoreInput}
                                                onChange={e => setIgnoreInput(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && ignoreInput.trim()) {
                                                        setIgnoredTexts([...ignoredTexts, ignoreInput.trim()]);
                                                        setIgnoreInput('');
                                                    }
                                                }}
                                            />
                                            <button
                                                className="bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 text-[10px] px-2 rounded transition-colors"
                                                onClick={() => {
                                                    if (ignoreInput.trim()) {
                                                        setIgnoredTexts([...ignoredTexts, ignoreInput.trim()]);
                                                        setIgnoreInput('');
                                                    }
                                                }}
                                            >+</button>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {ignoredTexts.length === 0 && <span className="text-[9px] text-white/30 italic">Sin filtros</span>}
                                            {ignoredTexts.map((txt, i) => (
                                                <span key={i} className="bg-red-500/20 border border-red-500/30 text-red-300 text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                                    {txt}
                                                    <button onClick={() => setIgnoredTexts(ignoredTexts.filter((_, idx) => idx !== i))} className="hover:text-white transition-colors">×</button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── Hierarchical Logic Tree ── */}
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-[10px] uppercase text-white/40 font-bold tracking-wider">🌳 Árbol Lógico</div>
                                <button
                                    className="bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-300 text-[9px] px-1.5 py-0.5 rounded transition-colors"
                                    onClick={resetMemory}
                                    title="Borrar memoria de exploraciones"
                                >🔄</button>
                            </div>
                            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
                                {setupData.tree && setupData.tree.nodes && setupData.tree.nodes.length > 0 ? (() => {
                                    const nodes = setupData.tree.nodes;
                                    const edges = setupData.tree.edges || [];
                                    const nodeMap = {};
                                    nodes.forEach(n => { nodeMap[n.id] = n; });
                                    const childrenOf = {};
                                    edges.forEach(e => {
                                        if (!childrenOf[e.from]) childrenOf[e.from] = [];
                                        childrenOf[e.from].push(e);
                                    });
                                    const targetIds = new Set(edges.map(e => e.to));
                                    const rootIds = nodes.map(n => n.id).filter(id => !targetIds.has(id));
                                    if (rootIds.length === 0 && nodes.length > 0) rootIds.push(nodes[0].id);

                                    const renderTreeNode = (nodeId, depth = 0, visited = new Set()) => {
                                        if (visited.has(nodeId)) return null;
                                        visited.add(nodeId);
                                        const node = nodeMap[nodeId];
                                        if (!node) return null;
                                        const children = childrenOf[nodeId] || [];
                                        const isCurrentNode = nodeId === setupData.node_id;
                                        const btnCount = node.buttons?.length || 0;

                                        return (
                                            <div key={nodeId} style={{ marginLeft: depth * 14 }} className="mb-1">
                                                <div className={`flex items-center gap-1.5 rounded-md px-2 py-1 transition-all ${isCurrentNode ? 'bg-purple-500/15 border border-purple-500/30' : 'hover:bg-white/3'}`}>
                                                    <span className={`text-[10px] ${children.length > 0 ? 'text-purple-400' : 'text-white/20'}`}>
                                                        {children.length > 0 ? '▾' : '·'}
                                                    </span>
                                                    <div className={`w-2 h-2 rounded-full shrink-0 ${isCurrentNode ? 'bg-purple-400 shadow-[0_0_6px_#a855f7] animate-pulse' : 'bg-white/20'}`} />
                                                    <span className={`text-[10px] font-mono truncate flex-1 ${isCurrentNode ? 'text-purple-300 font-bold' : 'text-white/60'}`}>
                                                        {node.id === 'root' ? '🏠 Inicio' : `📄 ${node.id.substring(0, 8)}`}
                                                    </span>
                                                    {btnCount > 0 && <span className="bg-blue-500/20 text-blue-300 text-[8px] px-1 rounded">{btnCount}</span>}
                                                </div>
                                                {children.map((edge, ci) => {
                                                    const isVisited = clickedButtons.has(edge.text);
                                                    return (
                                                        <div key={ci} className="mt-0.5">
                                                            <div style={{ marginLeft: 12 }} className="flex items-center gap-1 py-0.5">
                                                                <span className="text-white/15 text-[10px]">└</span>
                                                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${isVisited ? 'bg-green-500/15 text-green-300 border border-green-500/20' : 'bg-white/5 text-white/50 border border-white/10'}`}>
                                                                    {isVisited ? '✓' : '→'} "{edge.text || '?'}"
                                                                </span>
                                                            </div>
                                                            {renderTreeNode(edge.to, depth + 1, visited)}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    };

                                    return rootIds.map(id => renderTreeNode(id, 0, new Set()));
                                })() : (
                                    <div className="h-full flex flex-col items-center justify-center opacity-50 p-4 text-center">
                                        <div className="w-10 h-10 rounded-full border border-dashed border-white/20 flex items-center justify-center mb-2">
                                            <span className="text-purple-400 text-lg">🌱</span>
                                        </div>
                                        <p className="text-[11px] text-white/60">Árbol vacío. Sigue los pasos arriba.</p>
                                    </div>
                                )}
                            </div>

                            {/* ── Run Progress / Results ── */}
                            {isRunning && runProgress && (
                                <div className="mt-2 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 rounded-lg p-2.5 border border-emerald-500/20">
                                    <div className="text-[10px] uppercase text-emerald-300 font-bold mb-1.5 tracking-wider flex items-center gap-1">
                                        <span className="animate-spin text-[8px]">⚙</span> Recolectando Datos...
                                    </div>
                                    <div className="w-full bg-white/10 rounded-full h-1.5 mb-1">
                                        <div className="bg-emerald-400 h-1.5 rounded-full transition-all duration-500" style={{ width: `${runProgress.pct || 0}%` }} />
                                    </div>
                                    <div className="flex justify-between text-[9px] text-white/50">
                                        <span>Pantalla {runProgress.current_screen}/{runProgress.total_screens}</span>
                                        <span>{runProgress.pct}%</span>
                                    </div>
                                    {runProgress.status_text && (
                                        <div className="text-[9px] text-emerald-300/70 mt-0.5 truncate">{runProgress.status_text}</div>
                                    )}
                                    {runProgress.current_node && (
                                        <div className="text-[9px] text-white/40 mt-0.5 font-mono">📄 {runProgress.current_node}</div>
                                    )}
                                </div>
                            )}

                            {runResults && !isRunning && (
                                <div className="mt-2 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg p-2.5 border border-blue-500/20">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-[10px] uppercase text-blue-300 font-bold tracking-wider">📊 Resultados</span>
                                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full uppercase font-bold ${runResults.summary?.overall_status === 'critical' ? 'bg-red-500/20 text-red-300' :
                                            runResults.summary?.overall_status === 'warning' ? 'bg-yellow-500/20 text-yellow-300' :
                                                runResults.summary?.overall_status === 'normal' ? 'bg-green-500/20 text-green-300' :
                                                    'bg-white/10 text-white/40'
                                            }`}>{runResults.summary?.overall_status || 'N/A'}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 text-[9px]">
                                        <div className="bg-white/5 rounded px-1.5 py-1">
                                            <div className="text-white/40">Pantallas</div>
                                            <div className="text-white font-bold">{runResults.summary?.total_screens || 0}</div>
                                        </div>
                                        <div className="bg-white/5 rounded px-1.5 py-1">
                                            <div className="text-white/40">Puntos Entropía</div>
                                            <div className="text-white font-bold">{runResults.summary?.total_entropy_points || 0}</div>
                                        </div>
                                        <div className="bg-white/5 rounded px-1.5 py-1">
                                            <div className="text-white/40">Con OCR</div>
                                            <div className="text-white font-bold">{runResults.summary?.screens_with_ocr || 0}</div>
                                        </div>
                                        <div className="bg-white/5 rounded px-1.5 py-1">
                                            <div className="text-white/40">Duración</div>
                                            <div className="text-white font-bold">{runResults.summary?.duration_seconds || 0}s</div>
                                        </div>
                                    </div>
                                    {runResults.summary?.level_counts && Object.keys(runResults.summary.level_counts).length > 0 && (
                                        <div className="mt-1.5 flex gap-1 flex-wrap">
                                            {Object.entries(runResults.summary.level_counts).sort().map(([level, count]) => (
                                                <span key={level} className={`text-[8px] px-1 py-0.5 rounded ${parseInt(level) >= 5 ? 'bg-red-500/20 text-red-300' :
                                                    parseInt(level) >= 3 ? 'bg-yellow-500/20 text-yellow-300' :
                                                        'bg-green-500/20 text-green-300'
                                                    }`}>
                                                    L{level}: {count}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <button
                                        className="mt-1.5 w-full text-[9px] text-white/40 hover:text-white/70 transition-colors"
                                        onClick={() => setRunResults(null)}
                                    >Limpiar resultados</button>
                                </div>
                            )}

                            {/* Stats + Legend */}
                            <div className="mt-2 pt-2 border-t border-white/10 flex justify-between items-center text-[9px] text-white/30">
                                <span>
                                    <span className="text-green-400">●</span> Visitado &nbsp;
                                    <span className="text-purple-400">●</span> Actual &nbsp;
                                    <span className="text-white/30">●</span> Pendiente
                                </span>
                                <span>{setupData.tree?.nodes?.length || 0} pantallas · {setupData.tree?.edges?.length || 0} acciones</span>
                            </div>
                        </div>
                    </>
                ) : (!isSharing && !remoteMode) ? (
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
