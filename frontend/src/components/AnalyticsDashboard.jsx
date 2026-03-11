import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { TrendingUp, AlertTriangle, CheckCircle, Activity } from 'lucide-react';

import { API } from '../config.js';

const COLORS = ['#50fa7b', '#b8e986', '#f1fa8c', '#ffb86c', '#ff7979', '#ff5555'];

const AnalyticsDashboard = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAnalytics();
    }, []);

    const fetchAnalytics = async () => {
        try {
            const teamId = localStorage.getItem('vibrana_active_team');
            const token = localStorage.getItem('vibrana_token');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

            if (teamId) {
                const res = await fetch(`${API}/teams/${teamId}/analytics`, { headers });
                const data = await res.json();
                setStats({ ...data, isTeam: true });
            } else {
                const res = await fetch(`${API}/stats`, { headers });
                const data = await res.json();
                setStats({ ...data, isTeam: false });
            }
        } catch (err) {
            console.error("Analytics fetch failed:", err);
        } finally {
            setLoading(false);
        }
    };


    if (loading) {
        return (
            <div className="analytics-dashboard">
                <h3><TrendingUp size={16} /> Analytics</h3>
                <div className="skeleton" style={{ height: 200 }} />
            </div>
        );
    }

    if (!stats) return null;

    // Prepare chart data based on whether it's team data or global data
    const statusData = stats.isTeam
        ? Object.entries(stats.severity_distribution || {}).map(([name, value]) => ({ name, value })).filter(d => d.value > 0)
        : Object.entries(stats.statusCounts || {}).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);

    const entropyData = stats.isTeam
        ? Object.entries(stats.organ_distribution || {}).map(([name, count]) => ({ name, count })) // For team, we show organ distribution instead of raw entropy levels
        : Object.entries(stats.entropyDistribution || {}).map(([level, count]) => ({ name: `Level ${level}`, count, level: parseInt(level) }));

    const statusColors = {
        Normal: '#50fa7b',
        Compromised: '#ffb86c',
        Pathology: '#ff5555',
        Attention: '#f1fa8c',
        Warning: '#ffb86c',
        Critical: '#ff5555'
    };

    const totalScans = stats.total_scans || stats.totalScans || 0;

    let pathologyRate = 0, normalRate = 0;
    if (totalScans > 0) {
        if (stats.isTeam) {
            pathologyRate = (((stats.severity_distribution?.Critical || 0) + (stats.severity_distribution?.Warning || 0)) / totalScans * 100).toFixed(1);
            normalRate = ((stats.severity_distribution?.Normal || 0) / totalScans * 100).toFixed(1);
        } else {
            pathologyRate = ((stats.statusCounts?.Pathology || 0) / totalScans * 100).toFixed(1);
            normalRate = ((stats.statusCounts?.Normal || 0) / totalScans * 100).toFixed(1);
        }
    }

    return (
        <div className="analytics-dashboard">
            <h3><TrendingUp size={16} /> {stats.isTeam ? "Team Population Analytics" : "Global Analytics Dashboard"}</h3>

            {/* Team Specific Summary Stats */}
            {stats.isTeam && (
                <div className="analytics-summary mt-4 mb-4" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div className="analytics-card" style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '1rem', borderRadius: '8px', flex: 1 }}>
                        <h4 style={{ margin: 0, opacity: 0.7, fontSize: '0.85rem' }}>Total Patients</h4>
                        <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.patient_count}</span>
                    </div>
                    <div className="analytics-card" style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '1rem', borderRadius: '8px', flex: 1 }}>
                        <h4 style={{ margin: 0, opacity: 0.7, fontSize: '0.85rem' }}>Activity Index</h4>
                        <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.activity_index}</span>
                    </div>
                </div>
            )}

            {/* Summary Cards */}
            <div className="analytics-summary">
                <div className="analytics-card success">
                    <CheckCircle size={18} />
                    <div>
                        <span className="analytics-value">{normalRate}%</span>
                        <span className="analytics-label">Normal Rate</span>
                    </div>
                </div>
                <div className="analytics-card warning">
                    <AlertTriangle size={18} />
                    <div>
                        <span className="analytics-value">{pathologyRate}%</span>
                        <span className="analytics-label">Pathology Rate</span>
                    </div>
                </div>
                <div className="analytics-card info">
                    <Activity size={18} />
                    <div>
                        <span className="analytics-value">{totalScans}</span>
                        <span className="analytics-label">Total Scans</span>
                    </div>
                </div>
            </div>

            {/* Charts Row */}
            <div className="analytics-charts">
                {/* Status Distribution Pie */}
                <div className="chart-panel">
                    <h4>Scan Status Distribution</h4>
                    {statusData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={40}
                                    outerRadius={75}
                                    paddingAngle={3}
                                    dataKey="value"
                                >
                                    {statusData.map((entry, idx) => (
                                        <Cell key={idx} fill={statusColors[entry.name] || '#8892a4'} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        background: '#1a1a2e',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 8,
                                        color: '#e2e8f0'
                                    }}
                                />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="no-data">No scan data yet.</p>
                    )}
                </div>

                {/* Entropy Level Bar Chart */}
                <div className="chart-panel">
                    <h4>{stats.isTeam ? "Scanned Organ Distribution" : "Entropy Level Distribution"}</h4>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={entropyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis
                                dataKey="name"
                                tick={{ fill: '#8892a4', fontSize: 11 }}
                                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                            />
                            <YAxis
                                tick={{ fill: '#8892a4', fontSize: 11 }}
                                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                                allowDecimals={false}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: '#1a1a2e',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: 8,
                                    color: '#e2e8f0'
                                }}
                            />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                {entropyData.map((entry, idx) => (
                                    <Cell key={idx} fill={COLORS[idx]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Recent Activity */}
            {stats.recent_activity?.length > 0 && (
                <div className="recent-activity-panel">
                    <h4>Recent Activity</h4>
                    <div className="activity-list">
                        {stats.recent_activity.map(a => (
                            <div key={a.id} className="activity-item">
                                <span className="activity-organ">{a.organ_name}</span>
                                <span className="activity-patient">{a.patient_name}</span>
                                <span className="activity-status">{a.status}</span>
                                <small>{a.timestamp ? new Date(a.timestamp).toLocaleString() : ''}</small>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnalyticsDashboard;
