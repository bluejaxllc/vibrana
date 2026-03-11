import React, { useState, useEffect } from 'react';
import { ArrowLeftRight, X, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';

import { API } from '../config.js';

const ComparisonMode = ({ patientId, onClose }) => {
    const [scans, setScans] = useState([]);
    const [leftScan, setLeftScan] = useState(null);
    const [rightScan, setRightScan] = useState(null);

    useEffect(() => {
        if (patientId) {
            fetch(`${API}/patients/${patientId}`)
                .then(r => r.json())
                .then(data => {
                    const s = data.scans || [];
                    setScans(s);
                    if (s.length >= 2) {
                        setLeftScan(s[s.length - 2]);
                        setRightScan(s[s.length - 1]);
                    } else if (s.length === 1) {
                        setLeftScan(s[0]);
                    }
                })
                .catch(() => toast.error('Failed to load scans'));
        }
    }, [patientId]);

    const getStatusColor = (status) => {
        if (!status) return '#6272a4';
        if (status.includes('6')) return '#ff5555';
        if (status.includes('5')) return '#ffb86c';
        if (status.includes('Pathology')) return '#ff5555';
        return '#50fa7b';
    };

    const compareCounts = (left, right) => {
        if (!left?.counts || !right?.counts) return null;
        const diff = {};
        for (let i = 1; i <= 6; i++) {
            const lv = parseInt(left.counts[i] || 0);
            const rv = parseInt(right.counts[i] || 0);
            diff[i] = { left: lv, right: rv, change: rv - lv };
        }
        return diff;
    };

    const diff = compareCounts(leftScan, rightScan);

    return (
        <div className="comparison-overlay" onClick={onClose}>
            <div className="comparison-modal" onClick={e => e.stopPropagation()}>
                <div className="comparison-header">
                    <h3><ArrowLeftRight size={16} /> Scan Comparison</h3>
                    <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
                </div>

                <div className="compare-selectors">
                    <ScanSelector
                        value={leftScan}
                        scans={scans}
                        onChange={setLeftScan}
                        label="Baseline"
                    />
                    <ArrowLeftRight size={16} className="compare-arrow" />
                    <ScanSelector
                        value={rightScan}
                        scans={scans}
                        onChange={setRightScan}
                        label="Current"
                    />
                </div>

                <div className="compare-grid">
                    <ScanCard scan={leftScan} label="Baseline" getStatusColor={getStatusColor} />
                    <ScanCard scan={rightScan} label="Current" getStatusColor={getStatusColor} />
                </div>

                {diff && (
                    <div className="compare-diff">
                        <h4>Change Analysis</h4>
                        <div className="diff-bars">
                            {Object.entries(diff).map(([level, d]) => (
                                <div key={level} className="diff-row">
                                    <span className="diff-label">L{level}</span>
                                    <div className="diff-bar-container">
                                        <div className="diff-bar-left" style={{ width: `${Math.min(d.left * 8, 100)}%` }} />
                                        <div className="diff-bar-right" style={{ width: `${Math.min(d.right * 8, 100)}%` }} />
                                    </div>
                                    <span className={`diff-change ${d.change > 0 ? 'up' : d.change < 0 ? 'down' : ''}`}>
                                        {d.change > 0 ? '+' : ''}{d.change}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="diff-summary">
                            {(rightScan?.total_points || 0) > (leftScan?.total_points || 0) ? (
                                <span className="diff-trend up">↑ Entropy increased by {(rightScan?.total_points || 0) - (leftScan?.total_points || 0)} points</span>
                            ) : (rightScan?.total_points || 0) < (leftScan?.total_points || 0) ? (
                                <span className="diff-trend down">↓ Entropy decreased by {(leftScan?.total_points || 0) - (rightScan?.total_points || 0)} points</span>
                            ) : (
                                <span className="diff-trend">No change in total entropy</span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const ScanSelector = ({ value, scans, onChange, label }) => (
    <div className="compare-selector">
        <label>{label}</label>
        <select value={value?.id || ''} onChange={e => {
            const s = scans.find(s => s.id === e.target.value);
            onChange(s);
        }}>
            <option value="">Select scan...</option>
            {scans.map(s => (
                <option key={s.id} value={s.id}>
                    {s.organ_name} ΓÇö {new Date(s.timestamp).toLocaleDateString()} ({s.status})
                </option>
            ))}
        </select>
    </div>
);

const ScanCard = ({ scan, label, getStatusColor }) => {
    if (!scan) return <div className="compare-card empty"><p>No scan selected</p></div>;
    return (
        <div className="compare-card">
            <div className="compare-card-header">
                <span className="compare-label">{label}</span>
                <span style={{ color: getStatusColor(scan.status) }}>{scan.status}</span>
            </div>
            <h4>{scan.organ_name}</h4>
            <p className="compare-date">{new Date(scan.timestamp).toLocaleString()}</p>
            <div className="compare-stats">
                <div className="compare-stat">
                    <span>Total Points</span>
                    <strong>{scan.total_points || 0}</strong>
                </div>
                {scan.counts && Object.entries(scan.counts).map(([level, count]) => (
                    <div key={level} className="compare-stat">
                        <span>Level {level}</span>
                        <strong>{count}</strong>
                    </div>
                ))}
            </div>
            {scan.notes && <p className="compare-notes">≡ƒô¥ {scan.notes}</p>}
        </div>
    );
};

export default ComparisonMode;
