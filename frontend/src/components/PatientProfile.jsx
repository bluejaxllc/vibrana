import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Trash2, Calendar, User, Activity, StickyNote, ClipboardList, MessageCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import toast from 'react-hot-toast';
import OrganMap from './OrganMap';
import AIInsights from './AIInsights';
import ComparisonMode from './ComparisonMode';
import '../App.css';

import { API } from '../config.js';

const PatientProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [patient, setPatient] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedScan, setSelectedScan] = useState(null);
    const [editingNotes, setEditingNotes] = useState('');
    const [report, setReport] = useState(null);
    const [showComparison, setShowComparison] = useState(false);

    // WhatsApp State
    const [showWhatsApp, setShowWhatsApp] = useState(false);
    const [messages, setMessages] = useState([]);
    const [whatsappText, setWhatsappText] = useState('');

    const fetchPatient = useCallback(async () => {
        try {
            const res = await fetch(`${API}/patients/${id}`);
            if (!res.ok) throw new Error('Patient not found');
            const data = await res.json();
            setPatient(data);
        } catch {
            toast.error('Failed to load patient');
            navigate('/');
        } finally {
            setLoading(false);
        }
    }, [id, navigate]);

    useEffect(() => {
        fetchPatient();
    }, [fetchPatient]);

    const handleDeleteScan = async (scanId) => {
        if (!confirm('Delete this scan result?')) return;
        try {
            await fetch(`${API}/scans/${scanId}`, { method: 'DELETE' });
            toast.success('Scan deleted');
            fetchPatient();
        } catch {
            toast.error('Failed to delete scan');
        }
    };

    const handleSaveNotes = async (scanId) => {
        try {
            await fetch(`${API}/scans/${scanId}/notes`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: editingNotes })
            });
            toast.success('Notes saved');
            setSelectedScan(null);
            fetchPatient();
        } catch {
            toast.error('Failed to save notes');
        }
    };

    const handleExport = (format) => {
        const teamId = localStorage.getItem('vibrana_active_team');
        const url = `${API}/patients/${id}/export/${format}${teamId ? `?team_id=${teamId}` : ''}`;
        window.open(url, '_blank');
        toast.success(`${format.toUpperCase()} export started`);
    };

    const generateReport = async () => {
        try {
            const res = await fetch(`${API}/patients/${id}/report`);
            const data = await res.json();
            setReport(data);
            toast.success('Health report generated');
        } catch {
            toast.error('Failed to generate report');
        }
    };

    const fetchMessages = async () => {
        try {
            const res = await fetch(`${API}/patients/${id}/messages`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMessages(data);
            }
        } catch (err) {
            console.error("Failed to fetch messages:", err);
        }
    };

    const handleOpenWhatsApp = () => {
        if (!patient.phone_number || !patient.opt_in_whatsapp) {
            toast.error("Patient has not opted in or missing phone number.");
            return;
        }
        setShowWhatsApp(true);
        fetchMessages();
    };

    const handleSendWhatsApp = async () => {
        if (!whatsappText.trim()) return;
        try {
            const res = await fetch(`${API}/patients/${id}/whatsapp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}`
                },
                body: JSON.stringify({ content: whatsappText })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success("WhatsApp message sent!");
                setWhatsappText('');
                fetchMessages(); // Refresh log
            } else {
                toast.error(data.error || "Failed to send message");
            }
        } catch (err) {
            toast.error("Network error sending message");
        }
    };

    const getStatusClass = (status) => {
        if (!status) return 'normal';
        const s = status.toLowerCase();
        if (s.includes('pathol')) return 'pathology';
        if (s.includes('comprom') || s.includes('stress')) return 'compromised';
        return 'normal';
    };

    // Build chart data from scans
    const getChartData = () => {
        if (!patient?.scans?.length) return [];
        return [...patient.scans].reverse().map((scan, idx) => {
            const counts = scan.counts || {};
            return {
                name: scan.organ_name?.substring(0, 12) || `Scan ${idx + 1}`,
                'Level 1': parseInt(counts['1']) || 0,
                'Level 2': parseInt(counts['2']) || 0,
                'Level 3': parseInt(counts['3']) || 0,
                'Level 4': parseInt(counts['4']) || 0,
                'Level 5': parseInt(counts['5']) || 0,
                'Level 6': parseInt(counts['6']) || 0,
                total: scan.total_points || 0,
            };
        });
    };

    if (loading) {
        return (
            <div className="profile-page">
                <div className="skeleton" style={{ height: 40, width: 200, marginBottom: 20 }} />
                <div className="skeleton" style={{ height: 200 }} />
            </div>
        );
    }

    if (!patient) return null;

    const chartColors = ['#50fa7b', '#b8e986', '#f1fa8c', '#ffb86c', '#ff7979', '#ff5555'];

    return (
        <div className="profile-page">
            {/* Header */}
            <div className="profile-header">
                <div className="profile-info">
                    <button className="back-btn" onClick={() => navigate('/')}>
                        <ArrowLeft size={16} /> Back to Dashboard
                    </button>
                    <h1>{patient.name}</h1>
                    <div className="profile-meta">
                        <span><User size={14} /> {patient.age} yrs, {patient.gender}</span>
                        <span><Calendar size={14} /> Since {new Date(patient.created_at).toLocaleDateString()}</span>
                        <span><Activity size={14} /> {patient.scan_count} scans</span>
                    </div>
                </div>
                <div className="profile-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => handleExport('csv')}>
                        <FileText size={14} /> CSV
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => handleExport('pdf')}>
                        <Download size={14} /> PDF
                    </button>
                    <button className="btn btn-analyze btn-sm" onClick={generateReport}>
                        <ClipboardList size={14} /> Report
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => handleExport('dicom')}>
                        🏥 DICOM
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => handleExport('hl7')}>
                        🌐 HL7
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                        const email = prompt('Send report to email:');
                        if (email) {
                            fetch(`${API}/patients/${id}/email-report`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email })
                            }).then(r => r.json()).then(d => {
                                if (d.status === 'sent') toast.success('Report sent!');
                                else toast.success(`Report preview generated (SMTP not configured)`);
                            }).catch(() => toast.error('Failed to send'));
                        }
                    }}>
                        ✉️ Email
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={handleOpenWhatsApp} title="Send WhatsApp Message">
                        <MessageCircle size={14} style={{ color: patient.opt_in_whatsapp ? '#25D366' : 'inherit' }} /> WhatsApp
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowComparison(true)}>
                        🔀 Compare
                    </button>
                </div>
            </div>

            {showComparison && (
                <ComparisonMode patientId={id} onClose={() => setShowComparison(false)} />
            )}

            {/* Health Report */}
            {report && (
                <div className="health-report">
                    <h3>Health Report</h3>
                    <p className="report-summary">{report.summary}</p>
                    <div className="report-recommendations">
                        {report.recommendations?.map((r, i) => (
                            <div key={i} className="recommendation-item">{r}</div>
                        ))}
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setReport(null)} style={{ marginTop: 8 }}>Close Report</button>
                </div>
            )}

            {/* Organ Map */}
            <OrganMap patientId={id} scanResults={patient.scans} />

            {/* AI Insights */}
            <AIInsights scanId={selectedScan?.id || patient.scans?.[0]?.id} patientId={id} />

            {/* Content Grid */}
            <div className="profile-content">
                {/* Entropy Trends Chart */}
                <div className="profile-section">
                    <h2><Activity size={18} /> Entropy Trends</h2>
                    {patient.scans?.length > 0 ? (
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={getChartData()}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fill: '#8892a4', fontSize: 11 }}
                                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                                    />
                                    <YAxis
                                        tick={{ fill: '#8892a4', fontSize: 11 }}
                                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            background: '#1a1a2e',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: 8,
                                            color: '#e2e8f0'
                                        }}
                                    />
                                    <Legend />
                                    {[1, 2, 3, 4, 5, 6].map((level, i) => (
                                        <Line
                                            key={level}
                                            type="monotone"
                                            dataKey={`Level ${level}`}
                                            stroke={chartColors[i]}
                                            strokeWidth={2}
                                            dot={{ r: 3 }}
                                            activeDot={{ r: 5 }}
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <p className="no-data">No scan data yet. Run a scan from the dashboard.</p>
                    )}
                </div>

                {/* Scan History */}
                <div className="profile-section">
                    <h2><FileText size={18} /> Scan History</h2>
                    {patient.scans?.length > 0 ? (
                        <div className="scan-timeline">
                            {patient.scans.map(scan => (
                                <div
                                    key={scan.id}
                                    className="scan-card"
                                    onClick={() => {
                                        setSelectedScan(scan);
                                        setEditingNotes(scan.practitioner_notes || '');
                                    }}
                                >
                                    <div className="scan-card-info">
                                        <span className="organ-name">{scan.organ_name}</span>
                                        <span className="scan-date">
                                            {scan.timestamp ? new Date(scan.timestamp).toLocaleString() : 'N/A'}
                                        </span>
                                        <span className={`scan-status ${getStatusClass(scan.status)}`}>
                                            {scan.status}
                                        </span>
                                    </div>
                                    <div className="scan-card-actions">
                                        <button
                                            className="btn btn-danger-ghost"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteScan(scan.id);
                                            }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="no-data">No scan history available.</p>
                    )}
                </div>
            </div>

            {/* Scan Detail Modal */}
            {selectedScan && (
                <div className="scan-detail-overlay" onClick={() => setSelectedScan(null)}>
                    <div className="scan-detail-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close" onClick={() => setSelectedScan(null)}>✕</button>
                        <h3>{selectedScan.organ_name}</h3>
                        <p className="status-text">
                            {selectedScan.status} • {selectedScan.total_points} points •{' '}
                            {selectedScan.timestamp ? new Date(selectedScan.timestamp).toLocaleString() : ''}
                        </p>

                        <div className="entropy-grid" style={{ marginBottom: 16 }}>
                            {Object.entries(selectedScan.counts || {}).map(([lvl, count]) => (
                                <div key={lvl} className={`entropy-item lvl-${lvl}`}>
                                    <span>Lvl {lvl}</span>
                                    <strong>{count}</strong>
                                </div>
                            ))}
                        </div>

                        <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem', color: '#8892a4', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <StickyNote size={14} /> Practitioner Notes
                        </h4>
                        <textarea
                            className="scan-notes-textarea"
                            value={editingNotes}
                            onChange={(e) => setEditingNotes(e.target.value)}
                            placeholder="Add notes about this scan..."
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedScan(null)}>Cancel</button>
                            <button className="btn btn-analyze btn-sm" onClick={() => handleSaveNotes(selectedScan.id)}>
                                Save Notes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* WhatsApp Messaging Modal */}
            {showWhatsApp && (
                <div className="scan-detail-overlay" onClick={() => setShowWhatsApp(false)}>
                    <div className="scan-detail-modal" onClick={(e) => e.stopPropagation()} style={{ width: '400px', display: 'flex', flexDirection: 'column' }}>
                        <button className="modal-close" onClick={() => setShowWhatsApp(false)}>✕</button>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#25D366' }}>
                            <MessageCircle size={20} /> WhatsApp Log
                        </h3>
                        <p className="status-text mb-4">Chatting with {patient.name} ({patient.phone_number})</p>

                        <div className="whatsapp-log p-2 rounded" style={{ height: '300px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {messages.length === 0 ? (
                                <div style={{ color: '#8892a4', textAlign: 'center', paddingTop: '2rem' }}>No messages sent yet.</div>
                            ) : (
                                messages.map(msg => (
                                    <div key={msg.id} style={{
                                        alignSelf: 'flex-end',
                                        background: '#056162',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        borderBottomRightRadius: '0',
                                        maxWidth: '85%',
                                        fontSize: '0.9rem'
                                    }}>
                                        {msg.content}
                                        <div style={{ fontSize: '0.65rem', opacity: 0.7, textAlign: 'right', marginTop: '4px' }}>
                                            {new Date(msg.timestamp).toLocaleString()} • {msg.status}
                                        </div>
                                    </div>
                                )).reverse() // Show chronological
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={whatsappText}
                                onChange={(e) => setWhatsappText(e.target.value)}
                                placeholder="Type a message..."
                                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '8px', color: 'white' }}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendWhatsApp()}
                            />
                            <button className="btn btn-analyze" onClick={handleSendWhatsApp} style={{ background: '#25D366', color: 'white' }}>
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PatientProfile;
