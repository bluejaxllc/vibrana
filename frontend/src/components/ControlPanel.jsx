import React, { useState, useEffect, useCallback } from 'react';
import { Play, Square, Scan, Settings, ToggleLeft, ToggleRight, Layers, Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import { API } from '../config.js';

const ControlPanel = ({ onStart, onStop, onAnalyze, status, patientId }) => {
    const isScanning = status === 'Escaneando...' || status === 'Solicitando Escaneo...';
    const isAnalyzing = status?.includes('Analiz');
    const [autoReport, setAutoReport] = useState(true);
    const [autoNav, setAutoNav] = useState(true);
    const [batchRunning, setBatchRunning] = useState(false);
    const [batchProgress, setBatchProgress] = useState('');

    // Load persisted config from backend on mount
    useEffect(() => {
        const token = localStorage.getItem('vibrana_token');
        fetch(`${API}/api/config`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        })
            .then(r => r.ok ? r.json() : {})
            .then(cfg => {
                if (cfg.auto_report_enabled !== undefined) setAutoReport(cfg.auto_report_enabled === 'true');
                if (cfg.auto_nav_enabled !== undefined) setAutoNav(cfg.auto_nav_enabled === 'true');
            })
            .catch(() => { }); // Graceful fallback to defaults
    }, []);

    const persistToggle = useCallback((key, value) => {
        const token = localStorage.getItem('vibrana_token');
        fetch(`${API}/api/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ [key]: String(value) })
        }).catch(() => { });
    }, []);

    const handleToggleReport = () => {
        const next = !autoReport;
        setAutoReport(next);
        persistToggle('auto_report_enabled', next);
        toast.success(next ? 'Auto-Reporte activado' : 'Auto-Reporte desactivado');
    };

    const handleToggleNav = () => {
        const next = !autoNav;
        setAutoNav(next);
        persistToggle('auto_nav_enabled', next);
        toast.success(next ? 'Auto-Navegación activada' : 'Auto-Navegación desactivada');
    };

    const handleBatchScan = async () => {
        if (!patientId) {
            toast.error('Seleccione un paciente primero');
            return;
        }
        setBatchRunning(true);
        setBatchProgress('Iniciando escaneo por lotes...');
        try {
            const token = localStorage.getItem('vibrana_token');
            const res = await fetch(`${API}/scan/batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ patientId })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`Lote completado: ${data.scanned || 0} órganos escaneados`);
                setBatchProgress(`✅ ${data.scanned} escaneos guardados`);
            } else {
                toast.error(data.error || 'Error en escaneo por lotes');
                setBatchProgress('❌ Error en lote');
            }
        } catch (err) {
            toast.error('Error de red en escaneo por lotes');
            setBatchProgress('❌ Error de red');
        } finally {
            setBatchRunning(false);
        }
    };

    return (
        <div className="control-panel">
            <div className="control-panel-header">
                <h2><Settings size={16} className="icon-spin-slow" /> Controles</h2>
                <div className={`control-status-chip ${isScanning ? 'active' : isAnalyzing ? 'analyzing' : 'idle'}`}>
                    {isScanning && <span className="control-pulse-dot" />}
                    {status || 'Inactivo'}
                </div>
            </div>

            <div className="button-group">
                <button
                    className={`btn btn-start ${isScanning ? 'btn-glow-green' : ''}`}
                    onClick={onStart}
                    disabled={isScanning}
                >
                    <Play size={14} /> Iniciar Diagnóstico
                </button>
                <button
                    className={`btn btn-analyze ${isAnalyzing ? 'btn-glow-blue' : ''}`}
                    onClick={onAnalyze}
                    disabled={isScanning}
                >
                    <Scan size={14} /> Analizar Pantalla
                </button>
                <button
                    className="btn btn-stop"
                    onClick={onStop}
                    disabled={!isScanning}
                >
                    <Square size={14} /> Detener
                </button>
                <button
                    className="btn btn-outline"
                    onClick={handleBatchScan}
                    disabled={batchRunning || isScanning || !patientId}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    {batchRunning ? <Loader size={14} className="icon-spin-slow" /> : <Layers size={14} />}
                    {batchRunning ? 'Escaneando...' : 'Escaneo por Lotes'}
                </button>
            </div>

            {batchProgress && (
                <div style={{ fontSize: '0.8rem', color: '#8892a4', marginTop: 6 }}>{batchProgress}</div>
            )}

            <div className="settings-group">
                <h3>Automatización</h3>
                <label className="toggle-setting" onClick={handleToggleReport}>
                    {autoReport ? <ToggleRight size={18} className="toggle-on" /> : <ToggleLeft size={18} className="toggle-off" />}
                    <span>Auto-Reporte</span>
                </label>
                <label className="toggle-setting" onClick={handleToggleNav}>
                    {autoNav ? <ToggleRight size={18} className="toggle-on" /> : <ToggleLeft size={18} className="toggle-off" />}
                    <span>Auto-Navegación</span>
                </label>
            </div>
        </div>
    );
};

export default ControlPanel;
