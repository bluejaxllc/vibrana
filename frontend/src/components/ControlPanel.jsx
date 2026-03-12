import React from 'react';
import { Play, Square, Scan, Settings, ToggleLeft, ToggleRight } from 'lucide-react';

const ControlPanel = ({ onStart, onStop, onAnalyze, status }) => {
    const isScanning = status === 'Escaneando...' || status === 'Solicitando Escaneo...';
    const isAnalyzing = status?.includes('Analiz');
    const [autoReport, setAutoReport] = React.useState(true);
    const [autoNav, setAutoNav] = React.useState(true);

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
            </div>

            <div className="settings-group">
                <h3>Automatización</h3>
                <label className="toggle-setting" onClick={() => setAutoReport(!autoReport)}>
                    {autoReport ? <ToggleRight size={18} className="toggle-on" /> : <ToggleLeft size={18} className="toggle-off" />}
                    <span>Auto-Reporte</span>
                </label>
                <label className="toggle-setting" onClick={() => setAutoNav(!autoNav)}>
                    {autoNav ? <ToggleRight size={18} className="toggle-on" /> : <ToggleLeft size={18} className="toggle-off" />}
                    <span>Auto-Navegación</span>
                </label>
            </div>
        </div>
    );
};

export default ControlPanel;
