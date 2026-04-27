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
    const imgRef = useRef(null); // Ref to the actual rendered image element

    const [imgBounds, setImgBounds] = useState({ left: 0, top: 0, width: '100%', height: '100%' });

    // Calculate exact rendered image bounds on resize or stream change
    useEffect(() => {
        const calcBounds = () => {
            if (!imgContainerRef.current || !imgRef.current) return;

            const containerRect = imgContainerRef.current.getBoundingClientRect();
            const imgRect = imgRef.current.getBoundingClientRect();

            // The image might be smaller than the container if it's letterboxed
            const offsetX = imgRect.left - containerRect.left;
            const offsetY = imgRect.top - containerRect.top;

            setImgBounds({
                left: offsetX,
                top: offsetY,
                width: imgRect.width,
                height: imgRect.height
            });
        };

        calcBounds();
        window.addEventListener('resize', calcBounds);
        return () => window.removeEventListener('resize', calcBounds);
    }, [setupData?.screen]);

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

    // Cleanup backend long-running tasks on window close or refresh
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (isAutoExploring) {
                fetch(`${API}/api/setup/auto_explore_stop`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` },
                    keepalive: true
                }).catch(() => { });
            }
            if (isRunning) {
                fetch(`${API}/api/run/stop`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` },
                    keepalive: true
                }).catch(() => { });
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isAutoExploring, isRunning]);

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
        if (!setupData || setupLoading || sequenceMode || isRunning || isAutoExploring) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = imgContainerRef.current?.getBoundingClientRect();
        if (!rect) return;

        // Calculate coordinate exactly relative to the visible rendered image pixels
        let localX = e.clientX - rect.left - imgBounds.left;
        let localY = e.clientY - rect.top - imgBounds.top;

        let x = (localX / imgBounds.width) * 100;
        let y = (localY / imgBounds.height) * 100;

        // Clamp to 0-100% so drawing stays within image bounds
        x = Math.max(0, Math.min(100, x));
        y = Math.max(0, Math.min(100, y));

        setIsDrawing(true);
        setDrawStart({ x, y });
        setDrawCurrent({ x, y });
        setRoi(null);
    };

    const handleMouseMove = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const rect = imgContainerRef.current?.getBoundingClientRect();
        if (!rect) return;

        let localX = e.clientX - rect.left - imgBounds.left;
        let localY = e.clientY - rect.top - imgBounds.top;

        let x = (localX / imgBounds.width) * 100;
        let y = (localY / imgBounds.height) * 100;

        x = Math.max(0, Math.min(100, x));
        y = Math.max(0, Math.min(100, y));

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

    /* ── Overflow menu state ── */
    const [showOverflow, setShowOverflow] = useState(false);

    return (
        <div
            className="live-monitor"
            ref={containerRef}
        >
            <div className="monitor-header">
                <h2>
                    <span className={`monitor-live-dot${isSharing || remoteStatus === 'online' || setupActive ? '' : ' offline'}`} />
                    {isRunning ? 'Recolección en Curso' : setupActive ? 'Mapeo de UI' : 'Monitor'}
                </h2>
                <div className="monitor-meta" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>

                    {/* ══════════ STATE: RUNNING ══════════ */}
                    {isRunning && (
                        <button
                            className="btn-xs border border-red-500 bg-red-500/20 text-red-400 px-3 h-6 rounded-md transition-all shadow-[0_0_10px_rgba(239,68,68,0.4)] flex items-center gap-1.5"
                            onClick={stopRun}
                        >
                            <span className="inline-block w-2 h-2 bg-red-400 rounded-sm" />
                            Detener · {runProgress?.pct || 0}%
                        </button>
                    )}

                    {/* ══════════ STATE: MAPPING (setup active) ══════════ */}
                    {setupActive && !isRunning && (
                        <>
                            {/* Window selector */}
                            <select
                                className="btn-xs border border-white/10 bg-[#0a0f18] text-white/90 px-2 h-6 rounded-md transition-all focus:border-purple-500/50 outline-none"
                                style={{ minWidth: '120px', maxWidth: '180px' }}
                                value={selectedWindow}
                                onChange={handleWindowChange}
                                disabled={setupLoading || isAutoExploring}
                            >
                                <option value="">Pantalla Completa</option>
                                {windows.map((w, i) => (
                                    <option key={i} value={w}>{w}</option>
                                ))}
                            </select>

                            {/* Auto-explore or Stop */}
                            {isAutoExploring ? (
                                <button
                                    className="btn-xs border border-red-500 bg-red-500/20 text-red-400 px-3 h-6 rounded-md transition-all shadow-[0_0_10px_rgba(239,68,68,0.4)] flex items-center gap-1.5"
                                    onClick={stopAutoExplore}
                                >
                                    <span className="animate-spin inline-block w-3 h-3 border border-red-400 border-t-transparent rounded-full" />
                                    Detener
                                </button>
                            ) : (
                                <button
                                    className={`mapping-toolbar-btn btn-explore text-[11px] px-4 h-7 flex items-center gap-1.5 ${!selectedWindow ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    onClick={handleAutoExplore}
                                    disabled={setupLoading || !selectedWindow}
                                    title={selectedWindow ? 'Explorar la UI automáticamente' : 'Selecciona una ventana primero'}
                                >
                                    ⚡ Explorar
                                </button>
                            )}

                            {/* Run button — only after tree has nodes */}
                            {!isAutoExploring && (setupData?.tree?.nodes?.length || 0) > 0 && (
                                <button
                                    className="mapping-toolbar-btn btn-done text-[11px] px-4 h-7 flex items-center gap-1.5"
                                    onClick={startRun}
                                >
                                    ▶ Ejecutar
                                </button>
                            )}

                            {/* Overflow menu ⋯ */}
                            <div style={{ position: 'relative' }}>
                                <button
                                    className="btn-xs border border-white/10 hover:border-white/30 px-1.5 h-6 rounded-md transition-all text-white/40 hover:text-white/70"
                                    onClick={() => setShowOverflow(!showOverflow)}
                                    title="Más opciones"
                                >
                                    ⋯
                                </button>
                                {showOverflow && (
                                    <div
                                        className="absolute right-0 top-full mt-1 bg-[#0f1628] border border-white/10 rounded-lg shadow-2xl py-1 z-50"
                                        style={{ minWidth: '180px' }}
                                        onMouseLeave={() => setShowOverflow(false)}
                                    >
                                        <button
                                            className="w-full text-left px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/5 hover:text-white transition-colors flex items-center gap-2"
                                            onClick={() => { setSequenceMode(!sequenceMode); setSequence([]); setShowOverflow(false); }}
                                        >
                                            <span>{sequenceMode ? '✕' : '🔢'}</span>
                                            {sequenceMode ? 'Salir de Secuencia' : 'Modo Secuencia'}
                                        </button>
                                        <button
                                            className="w-full text-left px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/5 hover:text-white transition-colors flex items-center gap-2"
                                            onClick={() => { resetMemory(); setShowOverflow(false); }}
                                        >
                                            <span>🔄</span> Reiniciar Memoria
                                        </button>
                                        <button
                                            className="w-full text-left px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/5 hover:text-white transition-colors flex items-center gap-2"
                                            onClick={() => { toggleFullscreen(); setShowOverflow(false); }}
                                        >
                                            <span>⬜</span> Pantalla Completa
                                        </button>
                                        <div className="border-t border-white/5 my-1" />
                                        <button
                                            className="w-full text-left px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/5 hover:text-white transition-colors flex items-center gap-2"
                                            onClick={() => { toggleAutoDetect(); setShowOverflow(false); }}
                                        >
                                            <span>{remoteMode ? '📡' : '📡'}</span>
                                            {remoteMode ? 'Desactivar Auto-Detección' : 'Activar Auto-Detección'}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Sequence execute button (only shows when sequence has items) */}
                            {sequenceMode && sequence.length > 0 && (
                                <button
                                    className="btn-xs border border-cyan-400 bg-cyan-500/20 text-cyan-300 px-3 h-6 rounded-md transition-all hover:bg-cyan-500/30 flex items-center gap-1"
                                    onClick={executeSequence}
                                    disabled={isExecuting}
                                >
                                    {isExecuting ? '...' : `▶ ${sequence.length} pasos`}
                                </button>
                            )}

                            {/* Done button */}
                            <button
                                className="btn-xs border border-white/20 bg-white/5 text-white/60 px-3 h-6 rounded-md transition-all hover:bg-white/10 hover:text-white/80"
                                onClick={toggleSetupSession}
                                disabled={setupLoading || isAutoExploring}
                            >
                                {setupLoading ? '...' : '✓ Listo'}
                            </button>
                        </>
                    )}

                    {/* ══════════ STATE: IDLE ══════════ */}
                    {!setupActive && !isRunning && (
                        <button
                            className="btn-xs border border-purple-400/60 bg-purple-500/15 text-purple-300 px-3 h-6 rounded-md transition-all hover:bg-purple-500/25 hover:border-purple-400 flex items-center gap-1.5"
                            onClick={toggleSetupSession}
                            disabled={setupLoading}
                        >
                            {setupLoading ? (
                                <span className="animate-spin inline-block w-3 h-3 border border-purple-300 border-t-transparent rounded-full" />
                            ) : (
                                <span>📡</span>
                            )}
                            {setupLoading ? 'Conectando...' : 'Mapear UI'}
                        </button>
                    )}
                </div>
            </div>

            <div className={`monitor-screen${setupActive ? ' mapping-mode' : ''}`}>
                {setupActive && setupData ? (
                    <>
                        {/* LEFT: Screen Capture with OCR Overlay + ROI Drawing */}
                        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', overflow: 'hidden', padding: '8px' }}>
                            <div
                                ref={imgContainerRef}
                                style={{
                                    position: 'relative', width: '100%', height: '100%',
                                    cursor: sequenceMode ? 'pointer' : (roi ? 'default' : 'crosshair'),
                                    WebkitUserSelect: 'none', userSelect: 'none', WebkitUserDrag: 'none'
                                }}
                                onDragStart={(e) => e.preventDefault()}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={() => { if (isDrawing) handleMouseUp(); }}
                            >
                                <img
                                    ref={imgRef}
                                    src={`data:image/jpeg;base64,${setupData.screen}`}
                                    onLoad={() => {
                                        if (imgContainerRef.current && imgRef.current) {
                                            const containerRect = imgContainerRef.current.getBoundingClientRect();
                                            const imgRect = imgRef.current.getBoundingClientRect();
                                            setImgBounds({
                                                left: imgRect.left - containerRect.left,
                                                top: imgRect.top - containerRect.top,
                                                width: imgRect.width,
                                                height: imgRect.height
                                            });
                                        }
                                    }}
                                    style={{
                                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                        width: '100%', height: '100%', display: 'block',
                                        objectFit: 'contain', opacity: 0.8, pointerEvents: 'none',
                                        userSelect: 'none', WebkitUserSelect: 'none'
                                    }}
                                    alt="Screen State"
                                    draggable={false}
                                />

                                {/* Exact Physical Overlay Mapping */}
                                <div style={{
                                    position: 'absolute', pointerEvents: 'none', overflow: 'hidden',
                                    left: imgBounds.left, top: imgBounds.top, width: imgBounds.width, height: imgBounds.height
                                }}>

                                    {/* ROI drawing preview (while dragging) — NEON GREEN */}
                                    {isDrawing && drawStart && drawCurrent && (
                                        <div style={{
                                            position: 'absolute', zIndex: 30, pointerEvents: 'none',
                                            left: `${Math.min(drawStart.x, drawCurrent.x)}%`,
                                            top: `${Math.min(drawStart.y, drawCurrent.y)}%`,
                                            width: `${Math.abs(drawCurrent.x - drawStart.x)}%`,
                                            height: `${Math.abs(drawCurrent.y - drawStart.y)}%`,
                                            border: '3px dashed #00FF66',
                                            backgroundColor: 'rgba(0, 255, 102, 0.15)',
                                            boxShadow: '0 0 15px rgba(0, 255, 102, 0.5), inset 0 0 15px rgba(0, 255, 102, 0.1)'
                                        }} />
                                    )}

                                    {/* ROI rectangle (after set) — HIGH CONTRAST */}
                                    {roi && !isDrawing && (
                                        <>
                                            {/* Dimming overlay outside ROI — darker */}
                                            <div style={{
                                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, pointerEvents: 'none',
                                                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                                clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% ${roi.y}%, ${roi.x}% ${roi.y}%, ${roi.x}% ${roi.y + roi.h}%, ${roi.x + roi.w}% ${roi.y + roi.h}%, ${roi.x + roi.w}% ${roi.y}%, 0% ${roi.y}%)`
                                            }} />
                                            <div style={{
                                                position: 'absolute', zIndex: 20, pointerEvents: 'none',
                                                left: `${roi.x}%`, top: `${roi.y}%`, width: `${roi.w}%`, height: `${roi.h}%`,
                                                border: '3px solid #00FF66',
                                                boxShadow: '0 0 20px rgba(0, 255, 102, 0.6), 0 0 40px rgba(0, 255, 102, 0.2)',
                                                borderRadius: '4px'
                                            }}>
                                                <span style={{
                                                    position: 'absolute', top: '-24px', left: '4px', fontSize: '11px',
                                                    fontWeight: 'bold', padding: '2px 8px', borderRadius: '4px',
                                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                                    backgroundColor: '#00FF66', color: '#000'
                                                }}>
                                                    📐 ZONA ACTIVA
                                                </span>
                                            </div>
                                        </>
                                    )}

                                    {/* 'Borrar Zona' button */}
                                    {roi && (
                                        <button
                                            style={{
                                                position: 'absolute', top: '8px', right: '8px', zIndex: 30, backgroundColor: 'rgba(239, 68, 68, 0.9)',
                                                color: '#fff', fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: 'none',
                                                cursor: 'pointer', pointerEvents: 'auto', transition: 'all 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                                            }}
                                            onClick={(e) => { e.stopPropagation(); clearRoi(); }}
                                            onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(239, 68, 68, 1)'}
                                            onMouseOut={(e) => e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.9)'}
                                        >
                                            ✕ Borrar Zona
                                        </button>
                                    )}

                                    {/* HUD overlay */}
                                    {!roi && !isDrawing && (
                                        <div style={{
                                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <span style={{
                                                backgroundColor: 'rgba(0,0,0,0.8)', color: '#fff', padding: '8px 16px',
                                                borderRadius: '4px', fontSize: '14px', marginBottom: '8px', border: '1px solid rgba(168,85,247,0.5)'
                                            }}>
                                                {sequenceMode ? '🔢 Modo Secuencia: Clic en botones en orden' : 'Arrastra para seleccionar zona de botones'}
                                            </span>
                                            <span style={{
                                                backgroundColor: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.7)',
                                                padding: '4px 12px', borderRadius: '4px', fontSize: '12px'
                                            }}>
                                                {sequenceMode ? 'Los botones se ejecutarán en el orden que los selecciones' : 'Solo botones dentro de la zona serán detectados'}
                                            </span>
                                        </div>
                                    )}

                                    {/* Bounding boxes */}
                                    {setupData.buttons.map(b => {
                                        const isVisited = b.visited || clickedButtons.has(b.text);
                                        const seqIdx = sequence.findIndex(s => s.btnId === b.id);
                                        const isInSequence = seqIdx >= 0;

                                        // Dynamic mapping for color based on state
                                        let boxStyle = {
                                            position: 'absolute', cursor: 'pointer', pointerEvents: 'auto',
                                            transition: 'all 0.2s ease', zIndex: 20,
                                            left: `${(b.x / (setupData.screen_width || 1920)) * 100}%`,
                                            top: `${(b.y / (setupData.screen_height || 1080)) * 100}%`,
                                            width: `${(b.w / (setupData.screen_width || 1920)) * 100}%`,
                                            height: `${(b.h / (setupData.screen_height || 1080)) * 100}%`
                                        };

                                        if (isInSequence) {
                                            boxStyle.border = '2px solid #22d3ee';
                                            boxStyle.backgroundColor = 'rgba(34,211,238,0.2)';
                                            boxStyle.boxShadow = '0 0 10px rgba(34,211,238,0.5)';
                                        } else if (isVisited) {
                                            boxStyle.border = '2px solid rgba(74,222,128,0.7)';
                                            boxStyle.backgroundColor = 'rgba(74,222,128,0.15)';
                                        } else {
                                            boxStyle.border = '1px solid rgba(168,85,247,0.5)';
                                            boxStyle.backgroundColor = 'rgba(168,85,247,0.1)';
                                        }

                                        return (
                                            <div key={b.id}
                                                style={boxStyle}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (sequenceMode) handleSequenceClick(b);
                                                    else handleSetupClick(b);
                                                }}
                                                onMouseOver={(e) => {
                                                    e.currentTarget.style.zIndex = '30';
                                                    if (!isInSequence && !isVisited) {
                                                        e.currentTarget.style.backgroundColor = 'rgba(168,85,247,0.4)';
                                                        e.currentTarget.style.borderColor = 'rgba(168,85,247,1)';
                                                        e.currentTarget.style.boxShadow = '0 0 10px rgba(168,85,247,0.5)';
                                                    } else if (isVisited) {
                                                        e.currentTarget.style.backgroundColor = 'rgba(74,222,128,0.3)';
                                                        e.currentTarget.style.borderColor = 'rgba(74,222,128,1)';
                                                        e.currentTarget.style.boxShadow = '0 0 10px rgba(74,222,128,0.5)';
                                                    }
                                                }}
                                                onMouseOut={(e) => {
                                                    e.currentTarget.style.zIndex = '20';
                                                    if (!isInSequence && !isVisited) {
                                                        e.currentTarget.style.backgroundColor = 'rgba(168,85,247,0.1)';
                                                        e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)';
                                                        e.currentTarget.style.boxShadow = 'none';
                                                    } else if (isVisited) {
                                                        e.currentTarget.style.backgroundColor = 'rgba(74,222,128,0.15)';
                                                        e.currentTarget.style.borderColor = 'rgba(74,222,128,0.7)';
                                                        e.currentTarget.style.boxShadow = 'none';
                                                    }
                                                }}
                                            >
                                                {/* Sequence number badge */}
                                                {isInSequence && (
                                                    <span style={{
                                                        position: 'absolute', top: '-12px', left: '-4px',
                                                        backgroundColor: '#06b6d4', color: '#fff', fontSize: '10px',
                                                        fontWeight: 'bold', width: '16px', height: '16px',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        borderRadius: '50%', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', zIndex: 30
                                                    }}>
                                                        {seqIdx + 1}
                                                    </span>
                                                )}
                                                <span style={{
                                                    position: 'absolute', top: '-20px', left: '50%', transform: 'translateX(-50%)',
                                                    fontSize: '9px', backgroundColor: 'rgba(0,0,0,0.8)', color: '#fff',
                                                    padding: '2px 4px', borderRadius: '4px', whiteSpace: 'nowrap', pointerEvents: 'none'
                                                }}>
                                                    {isVisited ? '✓ ' : ''}{b.text} ({Math.round(b.conf)}%)
                                                </span>
                                            </div>
                                        );
                                    })}
                                    {(setupLoading || isAutoExploring) && (
                                        <div style={{
                                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 20
                                        }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                                <div className="animate-spin" style={{ height: '24px', width: '24px', border: '2px solid #a855f7', borderTopColor: 'transparent', borderRadius: '50%' }} />
                                                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px' }}>
                                                    {isAutoExploring ? "Exploración automática en curso..." : "Navegando y escaneando..."}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
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
                            <div className="flex-1 overflow-y-auto pr-1 pb-4 custom-scrollbar" style={{ position: 'relative' }}>
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
                                            <div key={nodeId} style={{ marginLeft: depth * 16, position: 'relative' }} className="mb-2 logic-tree-node">
                                                {/* Vertical connector line for children (only if it has children) */}
                                                {children.length > 0 && <div className="logic-tree-connector" />}
                                                
                                                {/* The Node Pill */}
                                                <div className={`logic-tree-pill flex items-center gap-2 px-3 py-2 ${isCurrentNode ? 'border-purple-500/50 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.15)]' : ''}`}>
                                                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isCurrentNode ? 'bg-purple-400 shadow-[0_0_8px_#a855f7] animate-pulse' : 'bg-white/10'}`} />
                                                    <span className={`text-[11px] font-medium tracking-wide truncate flex-1 ${isCurrentNode ? 'text-purple-200' : 'text-white/70'}`}>
                                                        {node.id === 'root' ? 'Inicio General' : `Vista: ${node.id.substring(0, 8)}`}
                                                    </span>
                                                    {btnCount > 0 && (
                                                        <span className="bg-purple-500/20 text-purple-300 font-bold text-[9px] px-1.5 py-0.5 rounded-full border border-purple-500/30">
                                                            {btnCount} elements
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                {/* The Children (Edge branches) */}
                                                <div className="mt-1">
                                                    {children.map((edge, ci) => {
                                                        const isVisited = clickedButtons.has(edge.text);
                                                        return (
                                                            <div key={ci} style={{ position: 'relative' }} className="mt-1">
                                                                <div className="logic-tree-branch" />
                                                                <div style={{ marginLeft: 22 }} className="flex items-center gap-1.5 py-1">
                                                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md shadow-sm transition-all ${
                                                                        isVisited 
                                                                        ? 'bg-green-500/20 text-green-300 border border-green-500/40' 
                                                                        : 'bg-[#1a1f2b] text-white/50 border border-white/10'
                                                                    }`}>
                                                                        {isVisited ? '✓' : '✧'} {edge.text ? `"${edge.text}"` : '[Área Interactiva]'}
                                                                    </span>
                                                                </div>
                                                                {renderTreeNode(edge.to, depth + 1, visited)}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    };                                    return rootIds.map(id => renderTreeNode(id, 0, new Set()));
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
