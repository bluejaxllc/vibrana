import React from 'react';
import { Play, Square, Scan, Settings, ToggleLeft, ToggleRight } from 'lucide-react';

const ControlPanel = ({ onStart, onStop, onAnalyze, status }) => {
    const isScanning = status === 'Scanning...' || status === 'Requesting Scan...';
    const isAnalyzing = status?.includes('Analyz');
    const [autoReport, setAutoReport] = React.useState(true);
    const [autoNav, setAutoNav] = React.useState(true);

    return (
        <div className="control-panel">
            <div className="control-panel-header">
                <h2><Settings size={16} className="icon-spin-slow" /> Controls</h2>
                <div className={`control-status-chip ${isScanning ? 'active' : isAnalyzing ? 'analyzing' : 'idle'}`}>
                    {isScanning && <span className="control-pulse-dot" />}
                    {status || 'Idle'}
                </div>
            </div>

            <div className="button-group">
                <button
                    className={`btn btn-start ${isScanning ? 'btn-glow-green' : ''}`}
                    onClick={onStart}
                    disabled={isScanning}
                >
                    <Play size={14} /> Start Diagnostics
                </button>
                <button
                    className={`btn btn-analyze ${isAnalyzing ? 'btn-glow-blue' : ''}`}
                    onClick={onAnalyze}
                    disabled={isScanning}
                >
                    <Scan size={14} /> Analyze Screen
                </button>
                <button
                    className="btn btn-stop"
                    onClick={onStop}
                    disabled={!isScanning}
                >
                    <Square size={14} /> Stop
                </button>
            </div>

            <div className="settings-group">
                <h3>Automation</h3>
                <label className="toggle-setting" onClick={() => setAutoReport(!autoReport)}>
                    {autoReport ? <ToggleRight size={18} className="toggle-on" /> : <ToggleLeft size={18} className="toggle-off" />}
                    <span>Auto-Report</span>
                </label>
                <label className="toggle-setting" onClick={() => setAutoNav(!autoNav)}>
                    {autoNav ? <ToggleRight size={18} className="toggle-on" /> : <ToggleLeft size={18} className="toggle-off" />}
                    <span>Auto-Navigation</span>
                </label>
            </div>
        </div>
    );
};

export default ControlPanel;
