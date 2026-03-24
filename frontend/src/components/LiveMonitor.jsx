import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Maximize, MonitorUp } from 'lucide-react';


const LiveMonitor = () => {
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
        } else {
            // Immediately switch to setup mode with placeholder
            setSetupActive(true);
            setSetupLoading(true);
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
            const res = await fetch(`${API}/api/setup/auto_explore`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` },
                body: JSON.stringify({ max_steps: 10, ignored_texts: ignoredTexts, roi: roi || undefined })
            });
            const data = await res.json();
            console.log('[AutoExplore] Response:', data.status, 'steps:', data.steps_taken, 'edges:', data.tree?.edges?.length);
            if (data.new_state) {
                setSetupData(data.new_state);
                if (data.new_state.explored_texts) {
                    setClickedButtons(new Set(data.new_state.explored_texts));
                }
            } else if (data.tree && setupData) {
                setSetupData(prev => ({ ...prev, tree: data.tree }));
            }
        } catch (e) {
            console.error('Auto-explore error:', e);
        }
        setIsAutoExploring(false);
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
        if (!setupData || setupLoading || sequenceMode) return;
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
        const rect = imgContainerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
        setDrawCurrent({ x, y });
    };

    const handleMouseUp = async () => {
        if (!isDrawing || !drawStart || !drawCurrent) { setIsDrawing(false); return; }
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
            if (data.new_state && !data.new_state.error) setSetupData(data.new_state);
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
                            title={selectedWindow ? `Explorar automáticamente: ${selectedWindow}` : '🔒 Selecciona una ventana primero para desbloquear'}
                        >
                            Auto-Explorar
                        </button>
                    )}
                    {setupActive && !isAutoExploring && (
                        <button
                            className={`btn-xs border px-2 h-5 rounded transition-all opacity-80 hover:opacity-100 ${sequenceMode ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300' : 'border-white/10 hover:border-cyan-400/50 text-white/50'
                                }`}
                            onClick={() => { setSequenceMode(!sequenceMode); setSequence([]); }}
                            title="Modo secuencia: haz clic en botones en orden para programar la macro"
                        >
                            {sequenceMode ? '✕ Cancelar Sec.' : '🔢 Secuencia'}
                        </button>
                    )}
                    {setupActive && sequenceMode && sequence.length > 0 && (
                        <button
                            className="btn-xs border border-green-400 bg-green-500/20 text-green-300 px-2 h-5 rounded transition-all opacity-80 hover:opacity-100 shadow-[0_0_8px_rgba(74,222,128,0.3)]"
                            onClick={executeSequence}
                            disabled={isExecuting}
                        >
                            {isExecuting ? 'Ejecutando...' : `▶ Ejecutar (${sequence.length})`}
                        </button>
                    )}
                    {setupActive && isAutoExploring && (
                        <button
                            className="btn-xs border border-red-500 bg-red-500/20 text-red-400 px-2 h-5 rounded transition-all shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                            onClick={stopAutoExplore}
                            title="Detener la exploración automática"
                        >
                            Detener Exploración
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
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={() => { if (isDrawing) handleMouseUp(); }}
                            style={{ cursor: isDrawing ? 'crosshair' : sequenceMode ? 'pointer' : 'crosshair' }}
                        >
                            <div ref={imgContainerRef} className="relative" style={{ aspectRatio: `${setupData.screen_width}/${setupData.screen_height}`, maxHeight: '100%', maxWidth: '100%' }}>
                                <img
                                    src={`data:image/jpeg;base64,${setupData.screen}`}
                                    className="w-full h-full object-contain opacity-80 transition-opacity group-hover:opacity-50 select-none pointer-events-none"
                                    alt="Screen State"
                                    draggable={false}
                                />

                                {/* ROI drawing preview (while dragging) */}
                                {isDrawing && drawStart && drawCurrent && (
                                    <div className="absolute border-2 border-cyan-400 bg-cyan-400/10 z-30 pointer-events-none" style={{
                                        left: `${Math.min(drawStart.x, drawCurrent.x)}%`,
                                        top: `${Math.min(drawStart.y, drawCurrent.y)}%`,
                                        width: `${Math.abs(drawCurrent.x - drawStart.x)}%`,
                                        height: `${Math.abs(drawCurrent.y - drawStart.y)}%`
                                    }} />
                                )}

                                {/* ROI rectangle (after set) */}
                                {roi && !isDrawing && (
                                    <>
                                        {/* Dimming overlay outside ROI */}
                                        <div className="absolute inset-0 bg-black/50 z-10 pointer-events-none" style={{
                                            clipPath: `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% ${roi.y}%, ${roi.x}% ${roi.y}%, ${roi.x}% ${roi.y + roi.h}%, ${roi.x + roi.w}% ${roi.y + roi.h}%, ${roi.x + roi.w}% ${roi.y}%, 0% ${roi.y}%)`
                                        }} />
                                        <div className="absolute border-2 border-cyan-400 z-20 pointer-events-none" style={{
                                            left: `${roi.x}%`, top: `${roi.y}%`, width: `${roi.w}%`, height: `${roi.h}%`
                                        }}>
                                            <span className="absolute -top-5 left-0 text-[9px] bg-cyan-500/80 text-white px-1.5 py-0.5 rounded">
                                                📐 Zona Activa
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

                        {/* RIGHT: Logic Tree Tracker (replaces old side panel) */}
                        <div className="border-l border-white/10 bg-[#0a0f18] p-4 flex flex-col h-full overflow-hidden">
                            <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                                <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2">
                                    🌳 Árbol Lógico
                                </h3>
                                <span className="bg-purple-500/20 text-purple-300 text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                    En Vivo
                                </span>
                            </div>

                            {/* Skip Branches (Ignore List) */}
                            <div className="mb-3 bg-black/40 rounded-lg p-2.5 border border-red-500/10">
                                <label className="block text-[10px] uppercase text-red-400/80 font-bold mb-1" title="Textos de botones que Auto-Explorar ignorará automáticamente">
                                    🚫 Ignorar Botones
                                </label>
                                <p className="text-[9px] text-white/40 mb-1.5">Agrega texto de botones que Auto-Explorar debe saltar (ej: cerrar, cancelar)</p>
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
                                        title="Agregar texto a la lista de ignorados"
                                    >+ Agregar</button>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {ignoredTexts.length === 0 && (
                                        <span className="text-[9px] text-white/30 italic">Sin filtros — Auto-Explorar hará clic en todo.</span>
                                    )}
                                    {ignoredTexts.map((txt, i) => (
                                        <span key={i} className="bg-red-500/20 border border-red-500/30 text-red-300 text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                            {txt}
                                            <button onClick={() => setIgnoredTexts(ignoredTexts.filter((_, idx) => idx !== i))} className="hover:text-white transition-colors">×</button>
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Tree Timeline */}
                            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
                                <div className="text-[10px] uppercase text-white/40 font-bold mb-2">Secuencia de Mapeo</div>
                                {setupData.tree && setupData.tree.edges && setupData.tree.edges.length > 0 ? (
                                    setupData.tree.edges.map((edge, i) => {
                                        const isVisited = clickedButtons.has(edge.text);
                                        return (
                                            <div key={i} className="mb-3 relative pl-4 border-l-2 border-purple-500/30 ml-1">
                                                <div className={`absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full ${isVisited ? 'bg-green-400 shadow-[0_0_8px_#4ade80]' : 'bg-purple-500 shadow-[0_0_8px_#a855f7]'}`}></div>
                                                <div className="text-[9px] uppercase tracking-wider text-white/40 mb-0.5">
                                                    Paso {edge.step || i + 1} {isVisited ? '✓' : ''}
                                                </div>
                                                <div className={`bg-white/5 border rounded-lg p-2 shadow-lg ${isVisited ? 'border-green-500/20' : 'border-white/10'}`}>
                                                    <span className="text-[10px] text-white/40 block">Click →</span>
                                                    <span className={`font-semibold text-xs ${isVisited ? 'text-green-300' : 'text-purple-300'}`}>
                                                        "{edge.text || `(${edge.x}, ${edge.y})`}"
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center opacity-50 p-4 text-center">
                                        <div className="w-10 h-10 rounded-full border border-dashed border-white/20 flex items-center justify-center mb-2">
                                            <span className="text-purple-400 font-mono text-lg">/</span>
                                        </div>
                                        <p className="text-[11px] text-white/60">
                                            Árbol vacío. Haz clic en un botón OCR o usa Auto-Explorar.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Stats footer + Reset Memory */}
                            <div className="mt-2 pt-2 border-t border-white/10 flex justify-between items-center text-[9px] text-white/30">
                                <span>Nodos: {setupData.tree?.nodes?.length || 0} | Acciones: {setupData.tree?.edges?.length || 0}</span>
                                <button
                                    className="bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-300 text-[9px] px-2 py-0.5 rounded transition-colors"
                                    onClick={resetMemory}
                                    title="Borrar memoria de clics — Auto-Explorar volverá a hacer clic en todos los botones"
                                >
                                    🔄 Reset Memoria
                                </button>
                            </div>

                            {/* Help Panel */}
                            <div className="mt-2 pt-2 border-t border-white/10">
                                <button
                                    className="w-full text-left text-[10px] text-white/50 hover:text-white/80 transition-colors flex items-center gap-1"
                                    onClick={() => setShowHelp(!showHelp)}
                                >
                                    {showHelp ? '▼' : '▶'} 📋 Guía Rápida
                                </button>
                                {showHelp && (
                                    <div className="mt-2 bg-black/40 rounded-lg p-2.5 border border-blue-500/10 text-[9px] text-white/60 space-y-1.5">
                                        <div><span className="text-blue-300 font-bold">Compartir Pantalla</span> — Comparte tu pantalla vía el navegador para vista local en vivo</div>
                                        <div><span className="text-purple-300 font-bold">Mapear UI</span> — Inicia escaneo OCR: captura pantalla y detecta botones clicables</div>
                                        <div><span className="text-white/80 font-bold">Selector de Ventana</span> — Restringe el OCR a una ventana específica en vez de la pantalla completa</div>
                                        <div><span className="text-blue-300 font-bold">Auto-Explorar</span> — Hace clic automáticamente en botones no visitados, construyendo el árbol lógico</div>
                                        <div><span className="text-red-300 font-bold">Detener Exploración</span> — Detiene Auto-Explorar a mitad de ejecución</div>
                                        <div><span className="text-red-300 font-bold">🚫 Ignorar Botones (+)</span> — Agrega patrones de texto que Auto-Explorar saltará</div>
                                        <div><span className="text-accent font-bold">Auto-Detección</span> — Observa la pantalla por cambios en software NLS y los registra</div>
                                        <div><span className="text-yellow-300 font-bold">🔄 Reset Memoria</span> — Borra el historial de clics para que Auto-Explorar revisita todos los botones</div>
                                        <div className="mt-2 pt-1.5 border-t border-white/10">
                                            <span className="text-green-300">■</span> Verde = Ya visitado &nbsp;
                                            <span className="text-purple-400">■</span> Púrpura = No visitado
                                        </div>
                                    </div>
                                )}
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
