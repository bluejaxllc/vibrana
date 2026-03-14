import React, { useState, useEffect } from 'react';
import { Play, Square, Trash2, Circle, ListOrdered, Monitor, Keyboard, Mouse } from 'lucide-react';
import toast from 'react-hot-toast';

import { API, LOCAL_API } from '../config.js';

const MacroManager = () => {
    const [macros, setMacros] = useState([]);
    const [recording, setRecording] = useState(false);
    const [macroName, setMacroName] = useState('');
    const [isLocal, setIsLocal] = useState(false);

    // Check if local backend is available (for record/play functionality)
    useEffect(() => {
        const checkLocal = async () => {
            try {
                const res = await fetch(`${LOCAL_API}/status`, { signal: AbortSignal.timeout(2000) });
                if (res.ok) setIsLocal(true);
            } catch {
                setIsLocal(false);
            }
        };
        checkLocal();
    }, []);

    const fetchMacros = async () => {
        try {
            const res = await fetch(`${API}/api/macros`);
            const data = await res.json();
            setMacros(data.macros || []);
        } catch (err) {
            console.error("Failed to fetch macros", err);
        }
    };

    useEffect(() => {
        fetchMacros();
    }, []);

    const startRecording = async () => {
        if (!isLocal) {
            toast.error('Conecte el backend local para grabar macros');
            return;
        }
        try {
            const res = await fetch(`${LOCAL_API}/api/macros/record/start`, { method: 'POST' });
            const data = await res.json();
            if (data.device_required) {
                toast.error('Se requiere un equipo local con teclado/mouse');
                return;
            }
            if (data.status === 'error') {
                toast.error(data.message || 'Error al iniciar grabación');
                return;
            }
            setRecording(true);
            toast.success('Grabación de macro iniciada — usa tu teclado y mouse');
        } catch {
            toast.error('Error al iniciar grabación — backend local no disponible');
        }
    };

    const stopRecording = async () => {
        const name = macroName.trim() || `macro_${Date.now()}`;
        try {
            const res = await fetch(`${LOCAL_API}/api/macros/record/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await res.json();
            setRecording(false);
            setMacroName('');
            if (data.status === 'saved') {
                toast.success(`Macro "${name}" guardado (${data.action_count} acciones, ${data.duration}s)`);
            } else {
                toast.error(data.message || 'Error al detener grabación');
            }
            fetchMacros();
        } catch {
            toast.error('Error al detener grabación');
        }
    };

    const playMacro = async (name) => {
        if (!isLocal) {
            toast.error('Conecte el backend local para reproducir macros');
            return;
        }
        toast.loading(`Reproduciendo macro: ${name}...`, { id: 'macro-play' });
        try {
            const res = await fetch(`${LOCAL_API}/api/macros/${name}/play`, { method: 'POST' });
            const data = await res.json();
            toast.dismiss('macro-play');
            if (data.device_required) {
                toast.error('Se requiere un equipo local con teclado/mouse');
            } else if (data.status === 'completed') {
                toast.success(`Macro completado (${data.actions_executed} acciones)`);
            } else {
                toast.error(`Macro fallido: ${data.message}`);
            }
        } catch {
            toast.dismiss('macro-play');
            toast.error('Reproducción de macro fallida — backend local no disponible');
        }
    };

    const deleteMacro = async (name) => {
        try {
            await fetch(`${API}/api/macros/${name}`, { method: 'DELETE' });
            toast.success('Macro eliminado');
            fetchMacros();
        } catch {
            toast.error('Error al eliminar macro');
        }
    };

    return (
        <div className="macro-manager">
            <h3><ListOrdered size={16} /> Macros</h3>

            {/* Record controls — show always but indicate local requirement */}
            <div className="macro-record-controls">
                {!recording ? (
                    <>
                        <button
                            className={`btn btn-analyze btn-sm ${!isLocal ? 'btn-disabled' : ''}`}
                            onClick={startRecording}
                            disabled={!isLocal}
                            title={isLocal ? 'Iniciar grabación' : 'Requiere backend local'}
                        >
                            <Circle size={12} style={{ color: '#ff5555' }} /> Grabar
                        </button>
                        {!isLocal && (
                            <span className="macro-local-badge" title="Grabación y reproducción requieren el backend local">
                                <Monitor size={12} /> Solo local
                            </span>
                        )}
                    </>
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

            {/* Macro list — always visible */}
            <div className="macro-list">
                {macros.length === 0 ? (
                    <p className="no-data">Sin macros guardados.</p>
                ) : (
                    macros.map((m, i) => (
                        <div key={i} className="macro-item">
                            <div className="macro-info">
                                <strong>{m.name}</strong>
                                <small>
                                    {m.action_count} acciones
                                    {m.duration ? ` · ${m.duration}s` : ''}
                                </small>
                            </div>
                            <div className="macro-actions">
                                <button
                                    className={`btn btn-ghost btn-sm ${!isLocal ? 'btn-disabled' : ''}`}
                                    onClick={() => playMacro(m.name)}
                                    title={isLocal ? 'Reproducir' : 'Requiere backend local'}
                                    disabled={!isLocal}
                                >
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
        </div>
    );
};

export default MacroManager;
