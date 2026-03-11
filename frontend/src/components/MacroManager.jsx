import React, { useState, useEffect } from 'react';
import { Play, Square, Trash2, Circle, ListOrdered, Monitor } from 'lucide-react';
import toast from 'react-hot-toast';

import { LOCAL_API as API } from '../config.js';

const MacroManager = () => {
    const [macros, setMacros] = useState([]);
    const [recording, setRecording] = useState(false);
    const [macroName, setMacroName] = useState('');
    const [deviceRequired, setDeviceRequired] = useState(false);

    const fetchMacros = async () => {
        try {
            const res = await fetch(`${API}/macros`);
            const data = await res.json();
            if (data.device_required) {
                setDeviceRequired(true);
                setMacros([]);
            } else {
                setDeviceRequired(false);
                setMacros(data.macros || []);
            }
        } catch (err) {
            console.error("Failed to fetch macros", err);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchMacros();
    }, []);

    const startRecording = async () => {
        try {
            const res = await fetch(`${API}/macros/record/start`, { method: 'POST' });
            const data = await res.json();
            if (data.device_required) {
                toast.error('Connect NLS device to record macros');
                return;
            }
            setRecording(true);
            toast.success('Macro recording started');
        } catch {
            toast.error('Failed to start recording');
        }
    };

    const stopRecording = async () => {
        const name = macroName.trim() || `macro_${Date.now()}`;
        try {
            const res = await fetch(`${API}/macros/record/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await res.json();
            setRecording(false);
            setMacroName('');
            toast.success(`Macro "${name}" saved (${data.action_count} actions)`);
            fetchMacros();
        } catch {
            toast.error('Failed to stop recording');
        }
    };

    const playMacro = async (name) => {
        toast.loading(`Playing macro: ${name}...`, { id: 'macro-play' });
        try {
            const res = await fetch(`${API}/macros/${name}/play`, { method: 'POST' });
            const data = await res.json();
            toast.dismiss('macro-play');
            if (data.device_required) {
                toast.error('Connect NLS device to play macros');
            } else if (data.status === 'completed') {
                toast.success(`Macro completed (${data.actions_executed} actions)`);
            } else {
                toast.error(`Macro failed: ${data.message}`);
            }
        } catch {
            toast.dismiss('macro-play');
            toast.error('Macro playback failed');
        }
    };

    const deleteMacro = async (name) => {
        try {
            await fetch(`${API}/macros/${name}`, { method: 'DELETE' });
            toast.success('Macro deleted');
            fetchMacros();
        } catch {
            toast.error('Failed to delete macro');
        }
    };

    return (
        <div className="macro-manager">
            <h3><ListOrdered size={16} /> Macros</h3>

            {deviceRequired ? (
                <div className="macro-cloud-notice">
                    <Monitor size={20} style={{ opacity: 0.5 }} />
                    <p>Macros require a local NLS device connection to record and play mouse/keyboard actions.</p>
                </div>
            ) : (
                <>
                    {/* Record Controls */}
                    <div className="macro-record-controls">
                        {!recording ? (
                            <button className="btn btn-analyze btn-sm" onClick={startRecording}>
                                <Circle size={12} style={{ color: '#ff5555' }} /> Record
                            </button>
                        ) : (
                            <>
                                <input
                                    type="text"
                                    placeholder="Macro name..."
                                    value={macroName}
                                    onChange={(e) => setMacroName(e.target.value)}
                                    className="macro-name-input"
                                />
                                <button className="btn btn-danger-ghost btn-sm" onClick={stopRecording}>
                                    <Square size={12} /> Stop
                                </button>
                                <span className="recording-indicator">● REC</span>
                            </>
                        )}
                    </div>

                    {/* Macro List */}
                    <div className="macro-list">
                        {macros.length === 0 ? (
                            <p className="no-data">No macros saved.</p>
                        ) : (
                            macros.map((m, i) => (
                                <div key={i} className="macro-item">
                                    <div className="macro-info">
                                        <strong>{m.name}</strong>
                                        <small>{m.action_count} actions</small>
                                    </div>
                                    <div className="macro-actions">
                                        <button className="btn btn-ghost btn-sm" onClick={() => playMacro(m.name)} title="Play">
                                            <Play size={14} />
                                        </button>
                                        <button className="btn btn-danger-ghost btn-sm" onClick={() => deleteMacro(m.name)} title="Delete">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default MacroManager;
