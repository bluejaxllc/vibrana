import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, Map as MapIcon, FileText } from 'lucide-react';
import OrganMap from './OrganMap';
import { API } from '../config.js';

const WebReport = () => {
    const { token } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetch(`${API}/public/report/${token}`)
            .then(res => {
                if (!res.ok) throw new Error('Reporte no válido o expirado');
                return res.json();
            })
            .then(d => {
                if (d.error) throw new Error(d.error);
                setData(d);
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [token]);

    const handlePrint = () => {
        window.print();
    };

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Cargando reporte...</div>;
    if (error) return <div style={{ padding: 40, textAlign: 'center', color: 'red' }}>{error}</div>;
    if (!data) return null;

    const { patient, scans, ai_report } = data;

    return (
        <div className="web-report-container">
            {/* Print Controls - hidden while printing */}
            <div className="web-report-controls no-print">
                <button className="btn btn-primary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', fontSize: 16 }}>
                    <Printer size={20} /> Imprimir / Guardar como PDF
                </button>
            </div>

            {/* A4 Report Page */}
            <div className="web-report-page">
                <div className="report-header">
                    <img src="/logo-vibrana.svg" alt="Vibrana" style={{ height: 40 }} onError={(e) => e.target.style.display='none'} />
                    <div style={{ textAlign: 'right' }}>
                        <h2>Reporte NLS</h2>
                        <span style={{ color: '#666' }}>Fecha: {new Date(data.generated_at).toLocaleDateString()}</span>
                    </div>
                </div>

                <div className="patient-demographics">
                    <div className="demo-item"><strong>Paciente:</strong> {patient.name}</div>
                    <div className="demo-item"><strong>Edad:</strong> {patient.age} años</div>
                    <div className="demo-item"><strong>Sexo:</strong> {patient.gender}</div>
                    <div className="demo-item"><strong>Escaneos:</strong> {scans.length}</div>
                </div>

                {/* AI Executive Summary */}
                {ai_report && ai_report.narrative_markdown && (
                    <div className="report-section">
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileText size={18} /> Análisis Integrativo IA</h3>
                        <div className="ai-content-rendered" dangerouslySetInnerHTML={{ __html: ai_report.narrative_markdown.replace(/\n/g, '<br/>') }} />
                    </div>
                )}
                
                {ai_report && !ai_report.narrative_markdown && ai_report.summary && (
                    <div className="report-section">
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileText size={18} /> Resumen Ejecutivo</h3>
                        <p>{ai_report.summary}</p>
                    </div>
                )}

                {/* Body Map Section */}
                <div className="report-section map-section" style={{ pageBreakInside: 'avoid' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MapIcon size={18} /> Mapa Corporal de Entalpía</h3>
                    <div className="report-organ-map-wrapper" style={{ transform: 'scale(0.8)', transformOrigin: 'top center', marginBottom: '-100px' }}>
                        <OrganMap patientId={patient.id} scanResults={scans} />
                    </div>
                </div>

                <div className="report-footer">
                    <p>Reporte generado por Vibrana Cloud Analyzer.</p>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{__html: `
                .web-report-container {
                    background-color: #f3f4f6;
                    min-height: 100vh;
                    padding: 40px 20px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    font-family: 'Inter', system-ui, sans-serif;
                    color: #1f2937;
                }
                .web-report-controls {
                    width: 100%;
                    max-width: 800px;
                    display: flex;
                    justify-content: flex-end;
                    margin-bottom: 20px;
                }
                .web-report-page {
                    background: white;
                    width: 100%;
                    max-width: 800px;
                    min-height: 1122px; /* A4 approx */
                    padding: 60px;
                    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
                    border-radius: 8px;
                }
                .report-header {
                    display: flex;
                    justify-content: space-between;
                    border-bottom: 2px solid #e5e7eb;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                }
                .report-header h2 { margin: 0 0 5px 0; color: #111827; }
                
                .patient-demographics {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 15px 30px;
                    background: #f9fafb;
                    padding: 15px 20px;
                    border-radius: 6px;
                    margin-bottom: 30px;
                }
                
                .report-section {
                    margin-bottom: 40px;
                }
                .report-section h3 {
                    border-bottom: 1px solid #e5e7eb;
                    padding-bottom: 10px;
                    margin-bottom: 15px;
                    color: #0369a1;
                }

                .ai-content-rendered h1, .ai-content-rendered h2, .ai-content-rendered h3 {
                    font-size: 1.1em;
                    color: #1f2937;
                    margin-top: 15px;
                    margin-bottom: 5px;
                }
                .ai-content-rendered p, .ai-content-rendered li {
                    line-height: 1.6;
                    color: #374151;
                    font-size: 0.95rem;
                }

                .report-organ-map-wrapper {
                    display: flex;
                    justify-content: center;
                    pointer-events: none; /* Disable clicking inside the map on the report */
                }

                .report-footer {
                    margin-top: 50px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                    text-align: center;
                    color: #9ca3af;
                    font-size: 13px;
                }

                @media print {
                    @page { margin: 0; size: A4 portrait; }
                    body { background: white; }
                    .no-print { display: none !important; }
                    .web-report-container { padding: 0; background: white; }
                    .web-report-page { 
                        box-shadow: none; 
                        padding: 15mm; 
                        max-width: 100%; 
                        width: 100%;
                    }
                    .report-organ-map-wrapper {
                        transform: scale(0.65) !important;
                    }
                }
            `}} />
        </div>
    );
};

export default WebReport;
