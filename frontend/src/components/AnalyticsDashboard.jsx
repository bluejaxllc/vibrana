import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line } from 'recharts';
import { TrendingUp, AlertTriangle, CheckCircle, Activity, Calendar } from 'lucide-react';

import { API } from '../config.js';

const COLORS = ['#50fa7b', '#b8e986', '#f1fa8c', '#ffb86c', '#ff7979', '#ff5555'];

const AnalyticsDashboard = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState(7);

    useEffect(() => {
        fetchAnalytics();
    }, [dateRange]);

    const fetchAnalytics = async () => {
        try {
            const teamId = localStorage.getItem('vibrana_active_team');
            const token = localStorage.getItem('vibrana_token');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

            // Try the new dedicated analytics endpoint first
            const params = new URLSearchParams({ days: dateRange });
            if (teamId) params.append('team_id', teamId);

            const res = await fetch(`${API}/analytics?${params}`, { headers });
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            } else {
                // Fallback to legacy /stats
                const fallback = await fetch(`${API}/stats`, { headers });
                const data = await fallback.json();
                setStats({ ...data, isLegacy: true });
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
                <h3><TrendingUp size={16} /> Analíticas</h3>
                <div className="skeleton" style={{ height: 200 }} />
            </div>
        );
    }

    if (!stats) return null;

    // Prepare chart data
    const statusData = Object.entries(stats.statusCounts || {}).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
    const entropyData = Object.entries(stats.entropyDistribution || {}).map(([level, count]) => ({ name: `Nivel ${level}`, count, level: parseInt(level) }));
    const weeklyTrends = stats.weeklyTrends || [];

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
        pathologyRate = ((stats.statusCounts?.Pathology || 0) / totalScans * 100).toFixed(1);
        normalRate = ((stats.statusCounts?.Normal || 0) / totalScans * 100).toFixed(1);
    }

    return (
        <div className="analytics-dashboard">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <h3><TrendingUp size={16} /> Panel de Analíticas</h3>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Calendar size={14} style={{ color: '#8892a4' }} />
                    {[7, 14, 30].map(d => (
                        <button
                            key={d}
                            className={`btn btn-sm ${dateRange === d ? 'btn-analyze' : 'btn-ghost'}`}
                            onClick={() => setDateRange(d)}
                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        >
                            {d}d
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="analytics-summary">
                <div className="analytics-card success">
                    <CheckCircle size={18} />
                    <div>
                        <span className="analytics-value">{normalRate}%</span>
                        <span className="analytics-label">Tasa Normal</span>
                    </div>
                </div>
                <div className="analytics-card warning">
                    <AlertTriangle size={18} />
                    <div>
                        <span className="analytics-value">{pathologyRate}%</span>
                        <span className="analytics-label">Tasa de Patología</span>
                    </div>
                </div>
                <div className="analytics-card info">
                    <Activity size={18} />
                    <div>
                        <span className="analytics-value">{totalScans}</span>
                        <span className="analytics-label">Escaneos Totales</span>
                    </div>
                </div>
            </div>

            {/* Weekly Trends */}
            {weeklyTrends.length > 0 && (
                <div className="chart-panel" style={{ marginBottom: 16 }}>
                    <h4>📈 Tendencias ({dateRange} días)</h4>
                    <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={weeklyTrends}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="date" tick={{ fill: '#8892a4', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                            <YAxis tick={{ fill: '#8892a4', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} allowDecimals={false} />
                            <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0' }} />
                            <Line type="monotone" dataKey="scans" stroke="#bd93f9" strokeWidth={2} dot={{ r: 3, fill: '#bd93f9' }} activeDot={{ r: 5 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Charts Row */}
            <div className="analytics-charts">
                {/* Status Distribution Pie */}
                <div className="chart-panel">
                    <h4>Distribución de Estados</h4>
                    {statusData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie data={statusData} cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={3} dataKey="value">
                                    {statusData.map((entry, idx) => (
                                        <Cell key={idx} fill={statusColors[entry.name] || '#8892a4'} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0' }} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="no-data">Sin datos de escaneo aún.</p>
                    )}
                </div>

                {/* Entropy Level Bar Chart */}
                <div className="chart-panel">
                    <h4>Distribución de Niveles de Entropía</h4>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={entropyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="name" tick={{ fill: '#8892a4', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                            <YAxis tick={{ fill: '#8892a4', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} allowDecimals={false} />
                            <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0' }} />
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
                    <h4>Actividad Reciente</h4>
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
