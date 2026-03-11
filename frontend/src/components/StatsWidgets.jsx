import React, { useState, useEffect, useRef } from 'react';
import { Users, Activity, Zap, Wifi, TrendingUp, TrendingDown } from 'lucide-react';

import { API } from '../config.js';

/** Animated number counter */
const AnimatedCounter = ({ value, duration = 800 }) => {
    const [display, setDisplay] = useState(0);
    const ref = useRef(null);

    useEffect(() => {
        if (typeof value !== 'number') return;
        const start = display;
        const diff = value - start;
        if (diff === 0) return;
        const startTime = performance.now();

        const tick = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // cubic ease-out
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.round(start + diff * eased));
            if (progress < 1) ref.current = requestAnimationFrame(tick);
        };
        ref.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(ref.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return <span className="animated-number">{display}</span>;
};

const StatsWidgets = () => {
    const [stats, setStats] = useState(null);
    const [prevStats, setPrevStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, 10000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchStats = async () => {
        try {
            const res = await fetch(`${API}/stats`);
            const data = await res.json();
            setPrevStats(stats);
            setStats(data);
        } catch (err) {
            console.error("Failed to fetch stats:", err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="stats-grid">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="stat-card skeleton skeleton-stat" />
                ))}
            </div>
        );
    }

    const getTrend = (key) => {
        if (!prevStats || !stats) return null;
        const curr = stats[key] ?? 0;
        const prev = prevStats[key] ?? 0;
        if (curr > prev) return 'up';
        if (curr < prev) return 'down';
        return null;
    };

    const widgets = [
        {
            icon: <Users size={20} />,
            value: stats?.total_patients ?? 0,
            label: 'Total Patients',
            theme: 'accent',
            trend: getTrend('total_patients'),
            isNumeric: true,
        },
        {
            icon: <Activity size={20} />,
            value: stats?.total_scans ?? 0,
            label: 'Total Scans',
            theme: 'success',
            trend: getTrend('total_scans'),
            isNumeric: true,
        },
        {
            icon: <Zap size={20} />,
            value: stats?.scans_today ?? 0,
            label: 'Scans Today',
            theme: 'info',
            trend: getTrend('scans_today'),
            isNumeric: true,
        },
        {
            icon: <Wifi size={20} />,
            value: stats?.bot_online ? 'Online' : 'Offline',
            label: 'NLS System',
            theme: stats?.bot_online ? 'success' : 'warning',
            isNumeric: false,
            statusDot: true,
        }
    ];

    return (
        <div className="stats-grid">
            {widgets.map((w, idx) => (
                <div key={idx} className={`stat-card ${w.theme}`} style={{ animationDelay: `${idx * 60}ms` }}>
                    <div className="stat-icon">{w.icon}</div>
                    <div className="stat-value">
                        {w.isNumeric ? <AnimatedCounter value={w.value} /> : (
                            <span className="stat-status-text">
                                {w.statusDot && <span className={`stat-live-dot ${stats?.bot_online ? 'online' : 'offline'}`} />}
                                {w.value}
                            </span>
                        )}
                    </div>
                    <div className="stat-label">
                        {w.label}
                        {w.trend === 'up' && <TrendingUp size={12} className="trend-icon trend-up" />}
                        {w.trend === 'down' && <TrendingDown size={12} className="trend-icon trend-down" />}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default StatsWidgets;
