import React from 'react';

const ComparisonMode = ({ onClose }) => (
  <div style={{ padding: 16, opacity: 0.5, fontSize: '0.85rem', textAlign: 'center' }}>
    <p>📊 Modo de comparación no disponible aún</p>
    {onClose && <button onClick={onClose} style={{ marginTop: 8, padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>Cerrar</button>}
  </div>
);

export default ComparisonMode;
