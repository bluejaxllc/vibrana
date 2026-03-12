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
                toast.error('Conecte dispositivo NLS para grabar macros');
                return;
            }
            setRecording(true);
            toast.success('Grabación de macro iniciada');
        } catch {
            toast.error('Error al iniciar grabación');
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
            toast.success(`Macro "${name}" guardado (${data.action_count} acciones)`);
            fetchMacros();
        } catch {
            toast.error('Error al detener grabación');
        }
    };

    const playMacro = async (name) => {
        toast.loading(`Reproduciendo macro: ${name}...`, { id: 'macro-play' });
        try {
            const res = await fetch(`${API}/macros/${name}/play`, { method: 'POST' });
            const data = await res.json();
            toast.dismiss('macro-play');
            if (data.device_required) {
                toast.error('Conecte dispositivo NLS para reproducir macros');
            } else if (data.status === 'completed') {
                toast.success(`Macro completado (${data.actions_executed} acciones)`);
            } else {
                toast.error(`Macro fallido: ${data.message}`);
            }
        } catch {
            toast.dismiss('macro-play');
            toast.error('Reproducción de macro fallida');
        }
    };

    const deleteMacro = async (name) => {
        try {
            await fetch(`${API}/macros/${name}`, { method: 'DELETE' });
            toast.success('Macro eliminado');
            fetchMacros();
        } catch {
            toast.error('Error al eliminar macro');
        }
    };

    return (
        <div className="macro-manager">
            <h3><ListOrdered size={16} /> Macros</h3>

            {deviceRequired ? (
                <div className="macro-cloud-notice">
                    <Monitor size={20} style={{ opacity: 0.5 }} />
                    <p>Los macros requieren una conexión local al dispositivo NLS para grabar y reproducir acciones de mouse/teclado.</p>
                </div>
            ) : (
                <>
                    {/* Record Controls */}
                    <div className="macro-record-controls">
                        {!recording ? (
                            <button className="btn btn-analyze btn-sm" onClick={startRecording}>
                                <Circle size={12} style={{ color: '#ff5555' }} /> Grabar
                            </button>
                        ) : (
                            <>
                                <input
                                    type="text"
                                    placeholder="Nombre del macro..."
                                    value={macroName}
                                    onChange={(e) => setMacroName(e.target.value)}
                                    className="macro-name-input"
                                />
                                <button className="btn btn-danger-ghost btn-sm" onClick={stopRecording}>
                                    <Square size={12} /> Detener
                                </button>
                                <span className="recording-indicator">● GRAB</span>
                            </>
                        )}
                    </div>

                    {/* Macro List */}
                    <div className="macro-list">
                        {macros.length === 0 ? (
                            <p className="no-data">Sin macros guardados.</p>
                        ) : (
                            macros.map((m, i) => (
                                <div key={i} className="macro-item">
                                    <div className="macro-info">
                                        <strong>{m.name}</strong>
                                        <small>{m.action_count} acciones</small>
                                    </div>
                                    <div className="macro-actions">
                                        <button className="btn btn-ghost btn-sm" onClick={() => playMacro(m.name)} title="Reproducir">
                                            <Play size={14} />
                                        </button>
                                        <button className="btn btn-danger-ghost btn-sm" onClick={() => deleteMacro(m.name)} title="Eliminar">
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
