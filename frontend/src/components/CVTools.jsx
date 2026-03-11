import React, { useState, useEffect } from 'react';
import { Monitor, Crosshair, Flame, Camera, Palette, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';

import { LOCAL_API as API } from '../config.js';

const CVTools = () => {
    const [activeTab, setActiveTab] = useState('heatmap');
    const [heatmapSrc, setHeatmapSrc] = useState(null);
    const [monitors, setMonitors] = useState([]);
    const [roi, setRoi] = useState(null);
    const [roiInput, setRoiInput] = useState({ x: 0, y: 0, w: 640, h: 480 });
    const [colors, setColors] = useState({});
    const [snapshots, setSnapshots] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (activeTab === 'monitors') fetchMonitors();
        if (activeTab === 'roi') fetchROI();
        if (activeTab === 'colors') fetchColors();
        if (activeTab === 'snapshots') fetchSnapshots();
    }, [activeTab]);

    // ── Heatmap ──
    const generateHeatmap = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/cv/heatmap`);
            const data = await res.json();
            if (data.heatmap) {
                setHeatmapSrc(`data:image/jpeg;base64,${data.heatmap}`);
                toast.success('Heatmap generated');
            }
        } catch { toast.error('Failed to generate heatmap'); }
        finally { setLoading(false); }
    };

    // ── Monitors ──
    const fetchMonitors = async () => {
        try {
            const res = await fetch(`${API}/cv/monitors`);
            const data = await res.json();
            setMonitors(data.monitors || []);
        } catch { console.error("Failed to fetch monitors"); }
    };

    const switchMonitor = async (idx) => {
        try {
            await fetch(`${API}/cv/monitors/${idx}`, { method: 'POST' });
            toast.success(`Switched to monitor ${idx}`);
            fetchMonitors();
        } catch { toast.error('Failed to switch monitor'); }
    };

    // ── ROI ──
    const fetchROI = async () => {
        try {
            const res = await fetch(`${API}/cv/roi`);
            const data = await res.json();
            setRoi(data.roi);
            if (data.roi) setRoiInput(data.roi);
        } catch { console.error("Failed to fetch ROI"); }
    };

    const saveROI = async () => {
        try {
            await fetch(`${API}/cv/roi`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(roiInput)
            });
            setRoi(roiInput);
            toast.success('ROI saved');
        } catch { toast.error('Failed to save ROI'); }
    };

    const clearROI = async () => {
        try {
            await fetch(`${API}/cv/roi`, { method: 'DELETE' });
            setRoi(null);
            toast.success('ROI cleared');
        } catch { toast.error('Failed to clear ROI'); }
    };

    // ── Colors ──
    const fetchColors = async () => {
        try {
            const res = await fetch(`${API}/cv/colors`);
            const data = await res.json();
            setColors(data.colors || {});
        } catch { console.error("Failed to fetch colors"); }
    };

    // ── Snapshots ──
    const fetchSnapshots = async () => {
        try {
            const res = await fetch(`${API}/cv/snapshots`);
            const data = await res.json();
            setSnapshots(data.snapshots || []);
        } catch { console.error("Failed to fetch snapshots"); }
    };

    const takeSnapshot = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/cv/snapshots`, { method: 'POST' });
            const data = await res.json();
            if (data.status === 'success') {
                toast.success('Snapshot saved');
                fetchSnapshots();
            }
        } catch { toast.error('Snapshot failed'); }
        finally { setLoading(false); }
    };

    const tabs = [
        { key: 'heatmap', icon: <Flame size={14} />, label: 'Heatmap' },
        { key: 'roi', icon: <Crosshair size={14} />, label: 'ROI' },
        { key: 'monitors', icon: <Monitor size={14} />, label: 'Monitors' },
        { key: 'colors', icon: <Palette size={14} />, label: 'Colors' },
        { key: 'snapshots', icon: <Camera size={14} />, label: 'Snapshots' },
    ];

    return (
        <div className="cv-tools">
            <h3>CV Tools</h3>
            <div className="cv-tabs">
                {tabs.map(t => (
                    <button
                        key={t.key}
                        className={`cv-tab ${activeTab === t.key ? 'active' : ''}`}
                        onClick={() => setActiveTab(t.key)}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            <div className="cv-content">
                {/* Heatmap */}
                {activeTab === 'heatmap' && (
                    <div className="cv-panel">
                        <p className="cv-desc">Generate entropy heatmap overlay from live screen.</p>
                        <button className="btn btn-analyze btn-sm" onClick={generateHeatmap} disabled={loading}>
                            {loading ? 'Generating...' : 'Generate Heatmap'}
                        </button>
                        {heatmapSrc && (
                            <div className="heatmap-preview" style={{ marginTop: 12 }}>
                                <img src={heatmapSrc} alt="Heatmap" style={{ width: '100%', borderRadius: 8 }} />
                            </div>
                        )}
                    </div>
                )}

                {/* ROI */}
                {activeTab === 'roi' && (
                    <div className="cv-panel">
                        <p className="cv-desc">Define the scan region of interest.</p>
                        {roi && <p style={{ color: '#50fa7b', fontSize: '0.8rem' }}>
                            Active: {roi.w}×{roi.h} at ({roi.x}, {roi.y})</p>}
                        <div className="roi-inputs">
                            {['x', 'y', 'w', 'h'].map(key => (
                                <div key={key} className="roi-input-group">
                                    <label>{key.toUpperCase()}</label>
                                    <input
                                        type="number"
                                        value={roiInput[key]}
                                        onChange={e => setRoiInput({ ...roiInput, [key]: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button className="btn btn-analyze btn-sm" onClick={saveROI}>
                                <Check size={12} /> Set ROI
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={clearROI}>
                                <X size={12} /> Clear
                            </button>
                        </div>
                    </div>
                )}

                {/* Monitors */}
                {activeTab === 'monitors' && (
                    <div className="cv-panel">
                        <p className="cv-desc">Select which monitor to capture.</p>
                        {monitors.length === 0 ? (
                            <p className="no-data">No monitors detected.</p>
                        ) : (
                            <div className="monitor-list">
                                {monitors.map(m => (
                                    <div
                                        key={m.index}
                                        className={`monitor-item ${m.active ? 'active' : ''}`}
                                        onClick={() => switchMonitor(m.index)}
                                    >
                                        <Monitor size={16} />
                                        <span>Monitor {m.index}</span>
                                        <small>{m.width}×{m.height}</small>
                                        {m.active && <span className="active-badge">Active</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Colors */}
                {activeTab === 'colors' && (
                    <div className="cv-panel">
                        <p className="cv-desc">HSV color ranges for each entropy level.</p>
                        <div className="color-ranges">
                            {Object.entries(colors).map(([level, range]) => (
                                <div key={level} className={`color-range-item lvl-${level}`}>
                                    <span className="level-badge">Lvl {level}</span>
                                    <small>H:{range[0][0]}-{range[1][0]} S:{range[0][1]}-{range[1][1]} V:{range[0][2]}-{range[1][2]}</small>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Snapshots */}
                {activeTab === 'snapshots' && (
                    <div className="cv-panel">
                        <button className="btn btn-analyze btn-sm" onClick={takeSnapshot} disabled={loading}>
                            <Camera size={12} /> {loading ? 'Capturing...' : 'Take Snapshot'}
                        </button>
                        <div className="snapshot-list" style={{ marginTop: 12 }}>
                            {snapshots.length === 0 ? (
                                <p className="no-data">No snapshots yet.</p>
                            ) : (
                                snapshots.slice(0, 10).map((s, i) => (
                                    <div key={i} className="snapshot-item">
                                        <Camera size={12} />
                                        <span>{s.filename}</span>
                                        <small>{new Date(s.created).toLocaleString()}</small>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CVTools;
