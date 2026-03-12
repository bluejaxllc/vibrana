import React, { useState, useEffect } from 'react';
import { Puzzle, Power, PowerOff, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

import { API } from '../config.js';

const PluginPanel = ({ token }) => {
    const [plugins, setPlugins] = useState([]);
    const [loading, setLoading] = useState(false);

    const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    const fetchPlugins = async () => {
        try {
            const res = await fetch(`${API}/plugins`);
            const data = await res.json();
            setPlugins(data);
        } catch { console.error('Failed to fetch plugins'); }
    };

    useEffect(() => { fetchPlugins(); }, []);

    const loadPlugin = async (name) => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/plugins/${name}/load`, {
                method: 'POST',
                headers: authHeaders
            });
            const data = await res.json();
            if (data.status === 'loaded' || data.status === 'metadata_only') {
                toast.success(`Plugin "${name}" cargado`);
            } else {
                toast.error(data.error || 'Error al cargar');
            }
            fetchPlugins();
        } catch { toast.error('Error al cargar plugin'); }
        finally { setLoading(false); }
    };

    const unloadPlugin = async (name) => {
        try {
            const res = await fetch(`${API}/plugins/${name}/unload`, {
                method: 'POST',
                headers: authHeaders
            });
            const data = await res.json();
            if (data.status === 'unloaded') {
                toast.success(`Plugin "${name}" descargado`);
            } else {
                toast.error(data.error || 'Error al descargar');
            }
            fetchPlugins();
        } catch { toast.error('Error al descargar plugin'); }
    };

    const getStatusColor = (status) => {
        const colors = { active: '#50fa7b', inactive: '#6272a4', metadata_only: '#f1fa8c' };
        return colors[status] || '#8be9fd';
    };

    return (
        <div className="plugin-panel">
            <div className="plugin-header">
                <h3><Puzzle size={16} /> Plugins</h3>
                <button className="btn btn-ghost btn-sm" onClick={fetchPlugins}>
                    <RefreshCw size={12} /> Actualizar
                </button>
            </div>

            {plugins.length === 0 ? (
                <p className="no-data">Sin plugins descubiertos. Agregue plugins a <code>backend/plugins/</code></p>
            ) : (
                <div className="plugin-list">
                    {plugins.map(p => (
                        <div key={p.name} className="plugin-card">
                            <div className="plugin-info">
                                <div className="plugin-name">
                                    <strong>{p.name}</strong>
                                    <span className="plugin-version">v{p.version}</span>
                                    <span className="plugin-status-dot" style={{ background: getStatusColor(p.status) }} />
                                </div>
                                <p className="plugin-desc">{p.description}</p>
                                {p.hooks?.length > 0 && (
                                    <div className="plugin-hooks">
                                        {p.hooks.map(h => (
                                            <span key={h} className="hook-tag">{h}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="plugin-actions">
                                {p.status === 'inactive' ? (
                                    <button className="btn btn-analyze btn-sm" onClick={() => loadPlugin(p.name)} disabled={loading}>
                                        <Power size={12} /> Cargar
                                    </button>
                                ) : (
                                    <button className="btn btn-danger-ghost btn-sm" onClick={() => unloadPlugin(p.name)}>
                                        <PowerOff size={12} /> Descargar
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default PluginPanel;
