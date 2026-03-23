import React, { useState } from 'react';
import toast from 'react-hot-toast';

import { API } from '../config.js';

// Simplified organ map data — coordinates for clickable organ regions
const ORGANS = [
    { id: 'brain', name: 'Cerebro', cx: 200, cy: 55, r: 28, color: '#bd93f9' },
    { id: 'thyroid', name: 'Tiroides', cx: 200, cy: 105, r: 14, color: '#8be9fd' },
    { id: 'lungs_l', name: 'Pulmón Izq', cx: 155, cy: 170, r: 30, color: '#50fa7b' },
    { id: 'lungs_r', name: 'Pulmón Der', cx: 245, cy: 170, r: 30, color: '#50fa7b' },
    { id: 'heart', name: 'Corazón', cx: 215, cy: 185, r: 20, color: '#ff5555' },
    { id: 'liver', name: 'Hígado', cx: 155, cy: 235, r: 28, color: '#ffb86c' },
    { id: 'stomach', name: 'Estómago', cx: 230, cy: 240, r: 22, color: '#f1fa8c' },
    { id: 'spleen', name: 'Bazo', cx: 265, cy: 230, r: 15, color: '#ff79c6' },
    { id: 'pancreas', name: 'Páncreas', cx: 200, cy: 260, r: 16, color: '#b8e986' },
    { id: 'kidney_l', name: 'Riñón Izq', cx: 160, cy: 275, r: 16, color: '#8be9fd' },
    { id: 'kidney_r', name: 'Riñón Der', cx: 240, cy: 275, r: 16, color: '#8be9fd' },
    { id: 'intestines', name: 'Intestinos', cx: 200, cy: 315, r: 32, color: '#ffb86c' },
    { id: 'bladder', name: 'Vejiga', cx: 200, cy: 370, r: 18, color: '#f1fa8c' },
    { id: 'prostate', name: 'Próstata', cx: 200, cy: 395, r: 12, color: '#bd93f9' },
];

// Shared keyword mapping for organ detection (used in both status check and heatmap)
const ORGAN_KEYWORDS = {
    'liver': ['hígado', 'higado', 'biliar', 'hepátic', 'hepatic'],
    'brain': ['cerebro', 'neuronal', 'cabeza', 'meninges', 'encéfalo', 'encefalo'],
    'lungs_l': ['pulmón', 'pulmon', 'respiratorio', 'bronqu'],
    'lungs_r': ['pulmón', 'pulmon', 'respiratorio', 'bronqu'],
    'heart': ['corazón', 'corazon', 'cardiac', 'vascul', 'cardíaco', 'cardiaco'],
    'stomach': ['estómago', 'estomago', 'gástrico', 'gastric'],
    'kidney_l': ['riñón', 'rinon', 'renal'],
    'kidney_r': ['riñón', 'rinon', 'renal'],
    'intestines': ['digerir', 'intestino', 'colon', 'digestiv'],
    'thyroid': ['tiroides', 'thyroid'],
    'spleen': ['bazo', 'esplénic', 'esplenic'],
    'pancreas': ['páncreas', 'pancreas', 'pancreátic', 'pancreatic'],
    'bladder': ['vejiga', 'vesic'],
    'prostate': ['próstata', 'prostata'],
};

const OrganMap = ({ onOrganSelect, patientId, scanResults, aiReportData }) => {
    const [hoveredOrgan, setHoveredOrgan] = useState(null);
    const [selectedOrgan, setSelectedOrgan] = useState(null);
    const [showHeatmap, setShowHeatmap] = useState(false);

    // Build a map of organ status from scan results or AI PDF
    const getOrganStatus = (organ) => {
        // Priority 1: Semantic match from AI PDF Analysis
        if (aiReportData?.scan_metadata?.organ_or_tissue) {
            const target = aiReportData.scan_metadata.organ_or_tissue.toLowerCase();
            const organId = organ.id;
            const isMatch = ORGAN_KEYWORDS[organId]?.some(kw => target.includes(kw)) ||
                target.includes(organ.name.toLowerCase());

            if (isMatch) {
                const level = aiReportData.entropic_analysis?.fleindler_entropy_level;
                console.log(`[OrganMap] MATCH: ${organ.name} matched AI target "${target}" with Fleindler level ${level}`);
                if (level >= 5) return 'pathology';
                if (level >= 3) return 'compromised';
                if (level <= 2) return 'normal';
            }
        }

        // Priority 2: Database scan results
        if (!scanResults?.length) return null;
        const latestScan = scanResults.find(s =>
            s.organ_name?.toLowerCase().includes(organ.name.toLowerCase())
        );
        if (!latestScan) return null;

        const status = latestScan.status?.toLowerCase() || '';
        if (status.includes('pathol')) return 'pathology';
        if (status.includes('comprom') || status.includes('disorder') || status.includes('stress')) return 'compromised';
        return 'normal';
    };

    const getStatusColor = (status) => {
        if (status === 'pathology') return '#ff5555';
        if (status === 'compromised') return '#ffb86c';
        if (status === 'normal') return '#50fa7b';
        return null;
    };

    const getEntropyColor = (level) => {
        const colors = {
            '1': '#50fa7b', // Normal
            '2': '#8be9fd',
            '3': '#f1fa8c',
            '4': '#ffb86c', // Stressed
            '5': '#ff79c6', // Compromised
            '6': '#ff5555'  // Pathology
        };
        return colors[String(level)] || '#6272a4';
    };

    const handleOrganClick = (organ) => {
        setSelectedOrgan(organ.id);
        if (onOrganSelect) {
            onOrganSelect(organ);
        }
        toast(`${organ.name} seleccionado`, { icon: '🫁' });
    };

    const handleAutoScan = async () => {
        if (!patientId) {
            toast.error('Seleccione un paciente primero');
            return;
        }
        const organCoords = ORGANS.map(o => ({ name: o.name, x: o.cx * 3, y: o.cy * 3 }));
        toast.loading('Ejecutando secuencia de auto-escaneo...', { id: 'auto-scan' });
        try {
            const res = await fetch(`${API}/scan/auto-sequence`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` },
                body: JSON.stringify({ patientId, organs: organCoords })
            });
            const data = await res.json();
            toast.dismiss('auto-scan');
            if (data.status === 'completed') {
                toast.success(`Auto-escaneo completado: ${data.successful}/${data.total_organs} órganos`);
            } else {
                toast.error(`Auto-escaneo fallido: ${data.message}`);
            }
        } catch {
            toast.dismiss('auto-scan');
            toast.error('Auto-escaneo fallido');
        }
    };

    return (
        <div className="organ-map-container">
            <div className="organ-map-header">
                <h3>Mapa Corporal</h3>
                <div className="map-controls">
                    <button
                        className={`btn btn-xs ${showHeatmap ? 'btn-accent' : 'btn-ghost'}`}
                        onClick={() => setShowHeatmap(!showHeatmap)}
                        title="Toggle Global Intensity Heatmap"
                    >
                        {showHeatmap ? '🔥 Mapa Calor Activado' : '❄️ Mapa Calor Desactivado'}
                    </button>
                    {patientId && (
                        <button className="btn btn-analyze btn-xs" onClick={handleAutoScan}>
                            Auto-Escaneo
                        </button>
                    )}
                </div>
            </div>

            <svg viewBox="0 0 400 450" className="organ-svg">
                <defs>
                    <radialGradient id="pathology-gradient" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#ff5555" stopOpacity="0.8" />
                        <stop offset="50%" stopColor="#ff5555" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#ffb86c" stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id="compromised-gradient" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#ffb86c" stopOpacity="0.7" />
                        <stop offset="50%" stopColor="#f1fa8c" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#50fa7b" stopOpacity="0" />
                    </radialGradient>
                </defs>
                {/* Body silhouette */}
                <path
                    d="M200 20 C170 20 150 45 150 55 C150 70 170 80 175 90 
                       L165 100 C155 105 145 110 140 120 L120 140 C100 155 95 165 90 180 
                       L80 195 C75 205 80 210 90 210 L115 210 C125 210 130 210 135 215
                       L130 250 C128 270 125 290 125 310 L125 350 C125 370 130 385 135 400
                       L130 420 C128 430 135 440 145 440 L165 440 C175 440 178 435 178 425
                       L180 400 C182 390 195 385 200 385 C205 385 218 390 220 400
                       L222 425 C222 435 225 440 235 440 L255 440 C265 440 272 430 270 420
                       L265 400 C270 385 275 370 275 350 L275 310 C275 290 272 270 270 250
                       L265 215 C270 210 275 210 285 210 L310 210 C320 210 325 205 320 195
                       L310 180 C305 165 300 155 280 140 L260 120 C255 110 245 105 235 100
                       L225 90 C230 80 250 70 250 55 C250 45 230 20 200 20Z"
                    fill="rgba(255,255,255,0.03)"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="1.5"
                />

                {/* Global Heatmap Overlay (Phase 11 & PDF AI) */}
                {showHeatmap && (
                    <g key="heatmap-layer">
                        {/* 1. Database Scan Points */}
                        {scanResults && scanResults.map(scan => (
                            <g key={`heatmap-${scan.id}`}>
                                {scan.entropy_points && scan.entropy_points.map((pt, idx) => (
                                    <circle
                                        key={`${scan.id}-${idx}`}
                                        cx={pt.x / 3 + 10}
                                        cy={pt.y / 3 + 10}
                                        r={2}
                                        fill={getEntropyColor(pt.level)}
                                        opacity={0.6}
                                        className="heatmap-point"
                                    />
                                ))}
                            </g>
                        ))}

                        {/* 2. PDF AI Generated Points */}
                        {aiReportData?.scan_metadata?.organ_or_tissue && ORGANS.map(organ => {
                            const target = aiReportData.scan_metadata.organ_or_tissue.toLowerCase();
                            const isMatch = ORGAN_KEYWORDS[organ.id]?.some(kw => target.includes(kw)) || target.includes(organ.name.toLowerCase());

                            if (!isMatch) return null;

                            // Visual Enhancements: Smooth Pulsing Radial Gradient replacing scatter dots
                            const level = aiReportData.entropic_analysis?.fleindler_entropy_level || 1;
                            const isPathology = level >= 5;
                            const gradientUrl = isPathology ? "url(#pathology-gradient)" : "url(#compromised-gradient)";

                            return (
                                <g key={`heatmap-ai-${organ.id}`} className="vfx-fade-in">
                                    {/* 3 Rings for pulsing shockwave effect */}
                                    <circle
                                        cx={organ.cx}
                                        cy={organ.cy}
                                        r={organ.r * 1.8}
                                        fill={gradientUrl}
                                        className="organ-pulse-fast"
                                        style={{ transformOrigin: `${organ.cx}px ${organ.cy}px` }}
                                    />
                                    <circle
                                        cx={organ.cx}
                                        cy={organ.cy}
                                        r={organ.r * 1.2}
                                        fill={gradientUrl}
                                        className="organ-pulse-slow"
                                        style={{ transformOrigin: `${organ.cx}px ${organ.cy}px` }}
                                    />
                                    <circle
                                        cx={organ.cx}
                                        cy={organ.cy}
                                        r={organ.r * 0.6}
                                        fill={getEntropyColor(level)}
                                        opacity={0.9}
                                    />
                                </g>
                            );
                        })}
                    </g>
                )}

                {/* Organ circles */}
                {ORGANS.map(organ => {
                    const status = getOrganStatus(organ);
                    const statusColor = getStatusColor(status);
                    const isHovered = hoveredOrgan === organ.id;
                    const isSelected = selectedOrgan === organ.id;

                    return (
                        <g key={organ.id}>
                            {/* Glow effect */}
                            {(isHovered || status) && (
                                <circle
                                    cx={organ.cx}
                                    cy={organ.cy}
                                    r={organ.r + 6}
                                    fill="none"
                                    stroke={statusColor || organ.color}
                                    strokeWidth="1"
                                    opacity={0.3}
                                    className="organ-glow"
                                />
                            )}

                            {/* Main circle */}
                            <circle
                                cx={organ.cx}
                                cy={organ.cy}
                                r={organ.r}
                                fill={statusColor ? `${statusColor}22` : `${organ.color}15`}
                                stroke={statusColor || organ.color}
                                strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1}
                                opacity={isHovered ? 1 : (showHeatmap ? 0.2 : 0.75)}
                                style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                                onMouseEnter={() => setHoveredOrgan(organ.id)}
                                onMouseLeave={() => setHoveredOrgan(null)}
                                onClick={() => handleOrganClick(organ)}
                            />

                            {/* Label */}
                            <text
                                x={organ.cx}
                                y={organ.cy + 1}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill={isHovered ? '#fff' : 'rgba(255,255,255,0.6)'}
                                fontSize={organ.r < 16 ? 6 : 8}
                                fontWeight={isHovered ? 600 : 400}
                                style={{ pointerEvents: 'none', transition: 'fill 0.2s', opacity: showHeatmap ? 0.3 : 1 }}
                            >
                                {organ.name}
                            </text>

                            {/* Status indicator dot */}
                            {status && !showHeatmap && (
                                <circle
                                    cx={organ.cx + organ.r - 3}
                                    cy={organ.cy - organ.r + 3}
                                    r={4}
                                    fill={statusColor}
                                    stroke="#0f0f1a"
                                    strokeWidth={1.5}
                                />
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* Legend */}
            <div className="organ-legend">
                <span className="legend-item"><span className="legend-dot normal" /> Normal</span>
                <span className="legend-item"><span className="legend-dot compromised" /> Comprometido</span>
                <span className="legend-item"><span className="legend-dot pathology" /> Patología</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: 'rgba(255,255,255,0.2)' }} /> Sin Datos</span>
            </div>
        </div>
    );
};

export default OrganMap;
