import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { BookOpen, Upload, Trash2, FileText, Loader2 } from 'lucide-react';
import { LOCAL_API as API } from '../config.js';

const KnowledgeBasePanel = () => {
    const [documents, setDocuments] = useState([]);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        fetchDocuments();
    }, []);

    const fetchDocuments = async () => {
        try {
            const res = await fetch(`${API}/api/references`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
            });
            const data = await res.json();
            if (data.status === 'success') {
                setDocuments(data.references || []);
            }
        } catch (err) {
            console.error("Failed to fetch references:", err);
            toast.error("Error al cargar base de conocimiento");
        }
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.type !== 'application/pdf') {
            toast.error("Solo se permiten archivos PDF");
            return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`${API}/api/references/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` },
                body: formData
            });
            const data = await res.json();
            if (data.status === 'success') {
                toast.success('Documento subido correctamente');
                fetchDocuments();
            } else {
                toast.error(data.message || 'Error al subir el documento');
            }
        } catch (err) {
            console.error("Upload failed", err);
            toast.error('Error de red al subir archivo');
        } finally {
            setUploading(false);
            event.target.value = null; // reset input
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿Eliminar este documento? La IA dejará de usarlo como contexto.")) return;

        try {
            const res = await fetch(`${API}/api/references/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
            });
            const data = await res.json();
            if (data.status === 'success') {
                toast.success('Documento eliminado');
                setDocuments(docs => docs.filter(d => d.id !== id));
            } else {
                toast.error(data.message || 'Error al eliminar');
            }
        } catch (err) {
            console.error("Delete failed", err);
            toast.error('Error al conectar con servidor');
        }
    };

    return (
        <div className="knowledge-base-panel data-log">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BookOpen size={18} color="#a78bfa" /> Base Conocimiento
                </h3>

                <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                    {uploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                    {uploading ? ' Subiendo...' : ' Subir PDF'}
                    <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handleFileUpload} disabled={uploading} />
                </label>
            </div>

            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px', lineHeight: '1.4' }}>
                Sube libros, guías clínicas o manuales en PDF. La IA de Vibrana los leerá y usará su contenido como contexto para mejorar la precisión de los reportes NLS.
            </p>

            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {documents.length === 0 && !uploading && (
                    <li className="log-empty" style={{ textAlign: 'center', padding: '24px 0', color: '#64748b' }}>
                        Sin documentos indexados. Sube tu primer PDF.
                    </li>
                )}

                {documents.map(doc => (
                    <li key={doc.id} style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '8px',
                        padding: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.2sease'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                            <FileText size={20} color="#60a5fa" />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                    {doc.filename}
                                </span>
                                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                    {(doc.size_chars / 1000).toFixed(1)}k caracteres indexados
                                </span>
                            </div>
                        </div>
                        <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '6px', color: '#f87171' }}
                            onClick={() => handleDelete(doc.id)}
                            title="Eliminar documento"
                        >
                            <Trash2 size={16} />
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default KnowledgeBasePanel;
