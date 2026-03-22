import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { FileText, UploadCloud, Activity, Printer, Download, X, Shield, Target, Zap, ChevronDown, ChevronRight, BookOpen } from 'lucide-react';
import { API } from '../config.js';
import OrganMap from './OrganMap';

/* ── Collapsible Therapy Card ── */
const TherapyCard = ({ etalon }) => {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="nls-therapy-card">
            <button className="nls-therapy-header" onClick={() => setExpanded(!expanded)}>
                <div className="nls-therapy-title-area">
                    <span className="nls-therapy-category">{etalon.category}</span>
                    <h5 className="nls-therapy-name">{etalon.remedy_name}</h5>
                </div>
                <div className="nls-therapy-meta">
                    <span className="nls-therapy-action">
                        <Zap size={13} /> {etalon.target_action}
                    </span>
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
            </button>
            {expanded && (
                <div className="nls-therapy-body">
                    {etalon.items && etalon.items.length > 0 ? (
                        etalon.items.map((item, iIdx) => (
                            <div key={iIdx} className="nls-therapy-item">
                                <h6 className="nls-therapy-item-name">
                                    <span className="nls-therapy-num">{iIdx + 1}</span>
                                    {item.name}
                                </h6>
                                <div className="nls-therapy-details">
                                    <div className="nls-detail-card nls-detail-purpose">
                                        <span className="nls-detail-label">¿Para qué sirve?</span>
                                        <p>{item.purpose}</p>
                                    </div>
                                    <div className="nls-detail-card nls-detail-protocol">
                                        <span className="nls-detail-label">Protocolo</span>
                                        <p>{item.protocol}</p>
                                    </div>
                                    <div className="nls-detail-card nls-detail-impact">
                                        <span className="nls-detail-label">Impacto Esperado</span>
                                        <p>{item.expected_impact}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : etalon.therapy_description ? (
                        <p className="nls-therapy-desc">{etalon.therapy_description}</p>
                    ) : null}
                </div>
            )}
        </div>
    );
};

/* ── Time Slot Component ── */
const TimeSlot = ({ label, emoji, color, data }) => {
    if (!data) return null;
    return (
        <div className={`nls-time-slot nls-time-${color}`}>
            <div className="nls-time-header">
                <span>{emoji} {label}</span>
            </div>
            <div className="nls-time-body">
                {data.supplements && (
                    <div className="nls-time-section">
                        <span className="nls-time-label">Suplementos</span>
                        {data.supplements.map((s, si) => (
                            <p key={si} className="nls-time-item">• {s}</p>
                        ))}
                    </div>
                )}
                {data.food && (
                    <div className="nls-time-section">
                        <span className="nls-time-label">Alimentación</span>
                        <p className="nls-time-item">{data.food}</p>
                    </div>
                )}
                {data.exercise && (
                    <div className="nls-time-section">
                        <span className="nls-time-label">Ejercicio</span>
                        <p className="nls-time-item nls-highlight">{data.exercise}</p>
                    </div>
                )}
                {data.therapy && (
                    <div className="nls-time-section">
                        <span className="nls-time-label">Terapia</span>
                        <p className="nls-time-item nls-highlight">{data.therapy}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

/* ── Main Component ── */
const NLSAnalyzerPanel = ({ onAnalyzeComplete, patientId, patientScans }) => {
    const [file, setFile] = useState(null);
    const [status, setStatus] = useState('idle');
    const [reportData, setReportData] = useState(null);
    const [selectedDay, setSelectedDay] = useState(0);
    const [showModal, setShowModal] = useState(false);

    // Therapy selection state
    const [selectedTherapies, setSelectedTherapies] = useState({
        "Nutrición Funcional y Suplementos": true,
        "Fitoterapia y Herbolaria": true,
        "Homeopatía y Terapia Frecuencial": true,
        "Medicina Tradicional China (TCM/Acupuntura)": true,
        "Terapia Emocional y Energética": true,
        "Terapia Física y Ejercicio": true
    });

    // Knowledge Base Reference Documents State
    const [referenceDocs, setReferenceDocs] = useState([]);
    const [selectedReferences, setSelectedReferences] = useState({});
    const [uploadingRef, setUploadingRef] = useState(false);

    // Fetch existing reference documents on mount
    useEffect(() => {
        const fetchReferences = async () => {
            try {
                const res = await fetch(`${API}/api/references`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
                });
                const data = await res.json();
                if (res.ok && data.references) {
                    setReferenceDocs(data.references);
                    // By default, do not select any reference
                    const defaults = {};
                    data.references.forEach(doc => defaults[doc.id] = false);
                    setSelectedReferences(defaults);
                }
            } catch (err) {
                console.error("Failed to fetch references:", err);
            }
        };
        fetchReferences();
    }, []);

    // Close modal on Escape
    useEffect(() => {
        const handleEsc = (e) => { if (e.key === 'Escape') setShowModal(false); };
        if (showModal) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [showModal]);

    // Lock body scroll when modal open
    useEffect(() => {
        if (showModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [showModal]);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
            setReportData(null);
        }
    };

    const handleUpload = async () => {
        if (!file) {
            toast.error("Seleccione un archivo PDF primero");
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        // Append selected therapies as a comma-separated string
        const activeTherapies = Object.keys(selectedTherapies).filter(k => selectedTherapies[k]);
        formData.append('therapies', activeTherapies.join('|'));

        // Append selected reference document IDs
        const activeRefs = Object.keys(selectedReferences).filter(k => selectedReferences[k]);
        formData.append('reference_ids', activeRefs.join(','));

        setStatus('analyzing');
        setSelectedDay(0);
        toast("Analizando escaneo... esto puede tomar 1-2 minutos", { icon: '⏳', duration: 5000 });

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000);

            const res = await fetch(`${API}/api/analyze-nls-scan`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` },
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const data = await res.json();

            if (res.ok && data.status === "success" && data.report_data) {
                let parsed = data.report_data;
                if (typeof parsed === 'string') {
                    try { parsed = JSON.parse(parsed); } catch (e) {
                        console.warn('[NLS] report_data was a string but could not be parsed:', e);
                    }
                }
                console.log('[NLS] Parsed report data keys:', Object.keys(parsed));
                console.log('[NLS] Full report data:', JSON.stringify(parsed, null, 2));
                setReportData(parsed);
                setShowModal(true);
                toast.success("¡Análisis completo!");
                setStatus('complete');
                if (onAnalyzeComplete) onAnalyzeComplete(parsed);
            } else {
                toast.error(data.message || "Error al analizar el PDF");
                setStatus('error');
            }
        } catch (err) {
            console.error(err);
            if (err.name === 'AbortError') {
                toast.error("Tiempo de espera agotado. Intente con un PDF más pequeño.");
            } else {
                toast.error("Error de servidor durante el análisis. Verifique que el backend esté corriendo.");
            }
            setStatus('error');
        }
    };

    const handlePrint = () => {
        document.body.classList.add('nls-printing');
        setTimeout(() => {
            window.print();
            document.body.classList.remove('nls-printing');
        }, 100);
    };

    const handleDownloadPdf = async () => {
        if (!reportData) return;
        const toastId = toast.loading('Generando PDF...');
        try {
            const res = await fetch(`${API}/api/nls-report-pdf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` },
                body: JSON.stringify({ report_data: reportData }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Error ${res.status}`);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // Extract filename from Content-Disposition or use default
            const disposition = res.headers.get('Content-Disposition');
            const match = disposition && disposition.match(/filename="?(.+?)"?$/);
            a.download = match ? match[1] : `Vibrana_Reporte_NLS_${new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('PDF descargado correctamente', { id: toastId });
        } catch (err) {
            console.error('[NLS PDF]', err);
            toast.error(`Error al generar PDF: ${err.message}`, { id: toastId });
        }
    };

    const handleReferenceUpload = async (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const refFile = e.target.files[0];
        setUploadingRef(true);
        const uploadData = new FormData();
        uploadData.append('file', refFile);

        try {
            const res = await fetch(`${API}/api/references/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` },
                body: uploadData
            });
            const data = await res.json();
            if (res.ok && data.document) {
                toast.success(data.message || "Documento subido correctamente");
                setReferenceDocs(prev => [data.document, ...prev]);
                setSelectedReferences(prev => ({ ...prev, [data.document.id]: true }));
            } else {
                toast.error(data.message || "Error al subir documento");
            }
        } catch (err) {
            console.error(err);
            toast.error("Error de red al subir documento");
        } finally {
            setUploadingRef(false);
            e.target.value = null; // reset input
        }
    };

    const urgencyClass = (timeframe) => {
        if (!timeframe) return 'nls-urgency-green';
        if (timeframe.includes('semana')) return 'nls-urgency-red';
        if (timeframe.includes('1 mes')) return 'nls-urgency-orange';
        if (timeframe.includes('6 meses')) return 'nls-urgency-yellow';
        return 'nls-urgency-green';
    };

    return (
        <>
            {/* ── Sidebar Upload Widget ── */}
            <div className="nls-analyzer-panel" style={{
                background: 'linear-gradient(180deg, rgba(20,20,40,0.95), rgba(15,15,30,0.98))',
                border: '1px solid rgba(139,233,253,0.1)',
                borderRadius: 16,
                padding: 0,
                marginTop: 16,
                boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
            }}>
                {/* Header */}
                <div style={{
                    padding: '18px 24px',
                    borderBottom: '1px solid rgba(139,233,253,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(109,40,217,0.04)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: 'linear-gradient(135deg, rgba(109,40,217,0.25), rgba(139,233,253,0.1))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Activity size={16} style={{ color: '#a78bfa' }} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.2px' }}>
                                Analizador NLS
                            </h3>
                            <p style={{ margin: 0, fontSize: 11, color: '#64748b', marginTop: 1 }}>
                                Intérprete de Escaneo de Biorresonancia
                            </p>
                        </div>
                    </div>
                </div>

                {/* Upload Section */}
                <div style={{ padding: '24px 24px 20px' }}>
                    <label
                        htmlFor="nls-file-upload"
                        style={{
                            display: 'block',
                            cursor: 'pointer',
                            position: 'relative',
                            overflow: 'hidden',
                            borderRadius: 14,
                            padding: '28px 24px',
                            textAlign: 'center',
                            transition: 'all 0.3s ease',
                            background: status === 'analyzing'
                                ? 'linear-gradient(135deg, rgba(80,250,123,0.06), rgba(80,250,123,0.01))'
                                : file
                                    ? 'linear-gradient(135deg, rgba(109,40,217,0.08), rgba(139,233,253,0.03))'
                                    : 'linear-gradient(135deg, rgba(30,30,60,0.5), rgba(20,20,45,0.3))',
                            border: status === 'analyzing'
                                ? '1.5px solid rgba(80,250,123,0.35)'
                                : file
                                    ? '1.5px solid rgba(109,40,217,0.4)'
                                    : '1.5px dashed rgba(100,116,139,0.25)',
                        }}
                    >
                        <input
                            type="file"
                            accept="application/pdf"
                            onChange={handleFileChange}
                            className="hidden"
                            id="nls-file-upload"
                        />
                        <div style={{
                            width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px',
                            background: status === 'analyzing'
                                ? 'rgba(80,250,123,0.1)'
                                : file ? 'rgba(109,40,217,0.12)' : 'rgba(100,116,139,0.08)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: '1px solid rgba(255,255,255,0.04)',
                        }}>
                            <UploadCloud size={24} className={status === 'analyzing' ? 'animate-pulse' : ''}
                                style={{ color: status === 'analyzing' ? '#50fa7b' : file ? '#a78bfa' : '#64748b' }} />
                        </div>
                        {file ? (
                            <>
                                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{file.name}</p>
                                <p style={{ margin: '5px 0 0', fontSize: 11, color: '#64748b' }}>
                                    {(file.size / 1024).toFixed(1)} KB · Clic para cambiar archivo
                                </p>
                            </>
                        ) : (
                            <>
                                <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#94a3b8' }}>
                                    Seleccionar PDF de Escaneo NLS
                                </p>
                                <p style={{ margin: '5px 0 0', fontSize: 11, color: '#475569' }}>
                                    Haga clic aquí o arrastre y suelte su archivo
                                </p>
                            </>
                        )}
                        {status === 'analyzing' && <div className="scanning-laser"></div>}
                    </label>

                    {/* ── Diagnostic Resources Selector ── */}
                    <div style={{ marginTop: 24, padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(139,233,253,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                            <Target size={14} style={{ color: '#8be9fd' }} />
                            <h4 style={{ margin: 0, fontSize: 13, color: '#f1f5f9' }}>Filtros de Diagnóstico</h4>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {Object.keys(selectedTherapies).map(therapy => (
                                <label key={therapy} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#e2e8f0', cursor: 'pointer', opacity: status === 'analyzing' ? 0.5 : 1 }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedTherapies[therapy]}
                                        disabled={status === 'analyzing'}
                                        onChange={(e) => setSelectedTherapies(prev => ({ ...prev, [therapy]: e.target.checked }))}
                                        style={{ accentColor: '#a78bfa', cursor: 'pointer' }}
                                    />
                                    {therapy.split(' ')[0]} {/* Display a shortened version if needed, or full name */}
                                    <span style={{ fontSize: 10 }}>{therapy}</span>
                                </label>
                            ))}
                        </div>

                        {/* ── Knowledge Base References ── */}
                        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(139,233,253,0.1)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <BookOpen size={14} style={{ color: '#f1fa8c' }} />
                                    <h4 style={{ margin: 0, fontSize: 13, color: '#f1f5f9' }}>Base de Conocimiento (PDFs)</h4>
                                </div>
                                <label style={{ cursor: 'pointer', opacity: uploadingRef || status === 'analyzing' ? 0.5 : 1 }}>
                                    <input
                                        type="file"
                                        accept="application/pdf"
                                        className="hidden"
                                        onChange={handleReferenceUpload}
                                        disabled={uploadingRef || status === 'analyzing'}
                                    />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(241,250,140,0.1)', color: '#f1fa8c', padding: '4px 8px', borderRadius: 4, fontSize: 11 }}>
                                        <UploadCloud size={12} /> {uploadingRef ? 'Subiendo...' : 'Subir Protocolo'}
                                    </div>
                                </label>
                            </div>

                            {referenceDocs.length === 0 ? (
                                <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>No hay documentos de referencia subidos.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '100px', overflowY: 'auto' }}>
                                    {referenceDocs.map(doc => (
                                        <label key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#e2e8f0', cursor: 'pointer', opacity: status === 'analyzing' ? 0.5 : 1 }}>
                                            <input
                                                type="checkbox"
                                                checked={!!selectedReferences[doc.id]}
                                                disabled={status === 'analyzing'}
                                                onChange={(e) => setSelectedReferences(prev => ({ ...prev, [doc.id]: e.target.checked }))}
                                                style={{ accentColor: '#f1fa8c', cursor: 'pointer' }}
                                            />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }} title={doc.filename}>{doc.filename}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={handleUpload}
                        disabled={!file || status === 'analyzing'}
                        style={{
                            width: '100%',
                            marginTop: 16,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: 8,
                            padding: '14px 20px',
                            borderRadius: 12,
                            fontWeight: 600,
                            fontSize: 13,
                            letterSpacing: '0.3px',
                            transition: 'all 0.2s ease',
                            background: (!file || status === 'analyzing')
                                ? 'rgba(109,40,217,0.1)'
                                : 'linear-gradient(135deg, #6d28d9, #7c3aed)',
                            color: (!file || status === 'analyzing') ? 'rgba(255,255,255,0.25)' : '#fff',
                            border: (!file || status === 'analyzing')
                                ? '1px solid rgba(109,40,217,0.15)'
                                : '1px solid rgba(124,58,237,0.5)',
                            cursor: file && status !== 'analyzing' ? 'pointer' : 'not-allowed',
                            boxShadow: file && status !== 'analyzing'
                                ? '0 4px 24px rgba(109,40,217,0.4), inset 0 1px 0 rgba(255,255,255,0.1)'
                                : 'none',
                        }}
                    >
                        {status === 'analyzing' ? (
                            <><Activity size={15} className="animate-spin" /> Analizando Entropía...</>
                        ) : (
                            <><Zap size={15} /> Analizar Escaneo</>
                        )}
                    </button>

                    {/* View Results Button (shows after analysis is complete) */}
                    {reportData && status === 'complete' && (
                        <button
                            onClick={() => setShowModal(true)}
                            style={{
                                width: '100%',
                                marginTop: 10,
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: 8,
                                padding: '12px 20px',
                                borderRadius: 12,
                                fontWeight: 600,
                                fontSize: 13,
                                background: 'rgba(139,233,253,0.08)',
                                color: '#8be9fd',
                                border: '1px solid rgba(139,233,253,0.2)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <FileText size={15} /> Ver Reporte Completo
                        </button>
                    )}
                </div>
            </div>

            {/* ── Full-Screen Results Modal ── */}
            {showModal && reportData && createPortal(
                <div className="nls-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
                    <div className="nls-modal-container print-nls-container">
                        {/* Modal Header */}
                        <div className="nls-modal-header no-print">
                            <div className="nls-modal-title-area">
                                <Shield size={22} style={{ color: '#a78bfa' }} />
                                <div>
                                    <h2 className="nls-modal-title">Reporte de Análisis NLS</h2>
                                    <p className="nls-modal-subtitle">
                                        {reportData.scan_metadata?.organ_or_tissue || "Escaneo Completo"} — {reportData.scan_metadata?.base_frequency_hz || "N/A"} Hz
                                    </p>
                                </div>
                            </div>
                            <div className="nls-modal-actions">
                                <button className="nls-btn-icon nls-btn-download" onClick={handleDownloadPdf} title="Descargar PDF">
                                    <Download size={18} />
                                </button>
                                <button className="nls-btn-icon" onClick={handlePrint} title="Imprimir reporte">
                                    <Printer size={18} />
                                </button>
                                <button className="nls-btn-icon nls-btn-close" onClick={() => setShowModal(false)} title="Cerrar">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="nls-modal-body" style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                            {/* Left Side: Body Map */}
                            <div className="nls-modal-map no-print" style={{ flex: '1 1 400px', maxWidth: '500px', background: 'rgba(15,15,30,0.5)', borderRadius: '12px', overflow: 'hidden' }}>
                                <OrganMap patientId={patientId} scanResults={patientScans} aiReportData={reportData} />
                            </div>

                            {/* Right Side: Report */}
                            <div className="nls-modal-report" style={{ flex: '2 1 600px', display: 'flex', flexDirection: 'column', gap: '16px' }}>



                                {/* ── Entropic Metrics ── */}
                                <div className="nls-section">
                                    <div className="nls-metrics-grid">
                                        <div className="nls-metric nls-metric-danger">
                                            <span className="nls-metric-label">Nivel Fleindler</span>
                                            <span className="nls-metric-value">{reportData.entropic_analysis?.fleindler_entropy_level ?? '—'}<span className="nls-metric-unit">/6</span></span>
                                        </div>
                                        <div className="nls-metric nls-metric-warning">
                                            <span className="nls-metric-label">Brecha Rojo/Azul</span>
                                            <span className="nls-metric-value-sm">{reportData.entropic_analysis?.red_blue_dissociation ?? '—'}</span>
                                        </div>
                                        <div className="nls-metric nls-metric-info">
                                            <span className="nls-metric-label">CSS (Valor-D)</span>
                                            <span className="nls-metric-value">{reportData.entropic_analysis?.css_d_value ?? '—'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* ── Clinical Synthesis ── */}
                                {reportData.clinical_synthesis && (
                                    <div className="nls-section">
                                        <div className="nls-synthesis">
                                            <h3 className="nls-section-title">
                                                <Activity size={16} /> Síntesis Clínica
                                            </h3>
                                            <p className="nls-synthesis-text">{reportData.clinical_synthesis}</p>
                                        </div>
                                    </div>
                                )}

                                {/* ── Recommended Therapies ── */}
                                <div className="nls-section">
                                    <h3 className="nls-section-title">
                                        <Target size={16} /> Terapias Recomendadas
                                    </h3>
                                    {reportData.recommended_etalons && reportData.recommended_etalons.length > 0 ? (
                                        <div className="nls-therapy-list">
                                            {reportData.recommended_etalons.map((etalon, idx) => (
                                                <TherapyCard key={idx} etalon={etalon} />
                                            ))}
                                        </div>
                                    ) : (
                                        <p style={{ color: '#64748b', fontSize: '14px', fontStyle: 'italic' }}>El PDF no contenía datos de escaneo de paciente. Suba un reporte NLS con resultados de Fleindler, CSS y disociación para obtener un plan terapéutico completo.</p>
                                    )}
                                </div>

                                {/* ── Foods Grid ── */}
                                <div className="nls-section nls-foods-section">
                                    {/* Foods to Eat */}
                                    {reportData.foods_to_eat && reportData.foods_to_eat.length > 0 && (
                                        <div>
                                            <h3 className="nls-section-title nls-green">🥗 Alimentos Recomendados</h3>
                                            <div className="nls-food-grid">
                                                {reportData.foods_to_eat.map((f, idx) => (
                                                    <div key={idx} className="nls-food-card nls-food-good">
                                                        <h6 className="nls-food-name">{f.food}</h6>
                                                        <p className="nls-food-benefit">{f.benefit}</p>
                                                        <p className="nls-food-how">📋 {f.how_to_consume}</p>
                                                        {f.active_compounds && (
                                                            <div className="nls-food-compounds">
                                                                {f.active_compounds.map((c, ci) => (
                                                                    <span key={ci} className="nls-compound-tag">{c}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Foods to Avoid */}
                                    {reportData.foods_to_avoid && reportData.foods_to_avoid.length > 0 && (
                                        <div style={{ marginTop: 28 }}>
                                            <h3 className="nls-section-title nls-red">🚫 Alimentos a Evitar</h3>
                                            <div className="nls-food-grid">
                                                {reportData.foods_to_avoid.map((f, idx) => (
                                                    <div key={idx} className="nls-food-card nls-food-bad">
                                                        <div className="nls-food-bad-header">
                                                            <span className="nls-food-x">✕</span>
                                                            <h6 className="nls-food-name">{f.food}</h6>
                                                        </div>
                                                        <p className="nls-food-reason">{f.reason}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* ── Herbal Teas ── */}
                                {reportData.herbal_teas && reportData.herbal_teas.length > 0 && (
                                    <div className="nls-section">
                                        <h3 className="nls-section-title nls-amber">🍵 Infusiones Herbales</h3>
                                        <div className="nls-tea-grid">
                                            {reportData.herbal_teas.map((t, idx) => (
                                                <div key={idx} className="nls-tea-card">
                                                    <h6 className="nls-tea-name">{t.herb}</h6>
                                                    <p className="nls-tea-benefit">{t.benefit}</p>
                                                    <div className="nls-tea-details">
                                                        <div className="nls-tea-detail">
                                                            <span className="nls-tea-label">Preparación</span>
                                                            <p>{t.preparation}</p>
                                                        </div>
                                                        <div className="nls-tea-detail">
                                                            <span className="nls-tea-label">Cuándo Tomar</span>
                                                            <p>{t.when}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ── Weekly Regime ── */}
                                {reportData.weekly_regime && reportData.weekly_regime.length > 0 && (
                                    <div className="nls-section">
                                        <h3 className="nls-section-title nls-cyan">📅 Régimen Semanal</h3>
                                        <div className="nls-day-tabs">
                                            {reportData.weekly_regime.map((dayData, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => setSelectedDay(idx)}
                                                    className={`nls-day-tab ${selectedDay === idx ? 'active' : ''}`}
                                                >
                                                    {dayData.day}
                                                </button>
                                            ))}
                                        </div>
                                        {reportData.weekly_regime[selectedDay] && (
                                            <div className="nls-day-content">
                                                <TimeSlot label="Mañana" emoji="☀️" color="morning" data={reportData.weekly_regime[selectedDay].morning} />
                                                <TimeSlot label="Mediodía" emoji="🌤️" color="midday" data={reportData.weekly_regime[selectedDay].midday} />
                                                <TimeSlot label="Noche" emoji="🌙" color="evening" data={reportData.weekly_regime[selectedDay].evening} />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── Next Scan ── */}
                                {reportData.next_scan && (
                                    <div className="nls-section">
                                        <div className="nls-next-scan">
                                            <h3 className="nls-section-title">📋 Próximo Escaneo Recomendado</h3>
                                            <div className="nls-next-scan-body">
                                                <span className={`nls-urgency-badge ${urgencyClass(reportData.next_scan.timeframe)}`}>
                                                    {reportData.next_scan.timeframe}
                                                </span>
                                                <p className="nls-next-scan-reason">{reportData.next_scan.reason}</p>
                                                {reportData.next_scan.what_to_monitor && (
                                                    <div className="nls-monitor-list">
                                                        <span className="nls-monitor-label">Qué Monitorear</span>
                                                        <ul>
                                                            {reportData.next_scan.what_to_monitor.map((item, idx) => (
                                                                <li key={idx}><span className="nls-monitor-arrow">→</span> {item}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div> {/* End Right Side */}
                        </div>
                    </div>
                </div>
                , document.body)}

            {/* ── Animations ── */}
            <style jsx="true">{`
                .scanning-laser {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 4px;
                    background-color: #50fa7b;
                    box-shadow: 0 0 10px 2px rgba(80, 250, 123, 0.6);
                    animation: scanningSweep 2s infinite ease-in-out;
                    pointer-events: none;
                }
                @keyframes scanningSweep {
                    0% { top: -10px; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
            `}</style>
        </>
    );
};

export default NLSAnalyzerPanel;
