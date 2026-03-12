import React, { useState } from 'react';
import { Lock, Sparkles, Check, X, Zap, Building2, Crown } from 'lucide-react';
import { useLicense } from '../hooks/useLicense';
import toast from 'react-hot-toast';

const TIER_INFO = {
    free: {
        icon: <Zap size={20} />,
        color: '#8be9fd',
        price: 'Gratis',
        features: [
            'Hasta 5 pacientes',
            'Escaneo básico',
            'Análisis de entropía básico',
            'Mapa de órganos',
        ],
    },
    pro: {
        icon: <Sparkles size={20} />,
        color: '#bd93f9',
        price: '$49/mes',
        features: [
            'Pacientes ilimitados',
            'Reportes con IA',
            'Interpretación de escaneos con IA',
            'Detección de anomalías',
            'Analizador NLS',
            'Herramientas CV',
            'Macros',
            'Observador de pantalla',
            'Plugins',
            'Exportación completa (PDF/CSV)',
            'Reportes por correo',
            'Entropía en vivo',
        ],
    },
    clinic: {
        icon: <Building2 size={20} />,
        color: '#50fa7b',
        price: '$149/mes',
        features: [
            'Todo en Pro, más:',
            'Exportación DICOM/HL7',
            'Integración WhatsApp',
            'Colaboración en equipo',
            'Análisis por lotes',
            'Modo de comparación',
        ],
    },
};

const UpgradeModal = () => {
    const { showUpgrade, setShowUpgrade, upgradeFeature, tier, activateLicense, getRequiredTier } = useLicense();
    const [licenseKey, setLicenseKey] = useState('');
    const [activating, setActivating] = useState(false);
    const [activeTab, setActiveTab] = useState('plans'); // 'plans' or 'activate'

    if (!showUpgrade) return null;

    const requiredTier = upgradeFeature ? getRequiredTier(upgradeFeature) : 'pro';
    const tierInfo = TIER_INFO[requiredTier] || TIER_INFO.pro;

    const handleActivate = async () => {
        if (!licenseKey.trim()) return;
        setActivating(true);
        const result = await activateLicense(licenseKey.trim());
        setActivating(false);
        if (result.success) {
            toast.success(`¡Licencia activada! Plan: ${result.tier}`);
            setShowUpgrade(false);
            setLicenseKey('');
        } else {
            toast.error(result.error || 'Error al activar licencia');
        }
    };

    return (
        <div className="upgrade-overlay" onClick={() => setShowUpgrade(false)}>
            <div className="upgrade-modal" onClick={e => e.stopPropagation()}>
                <button className="upgrade-close" onClick={() => setShowUpgrade(false)}>
                    <X size={18} />
                </button>

                <div className="upgrade-header">
                    <Crown size={28} style={{ color: '#bd93f9' }} />
                    <h2>Actualizar Plan</h2>
                    {upgradeFeature && (
                        <p className="upgrade-subtitle">
                            Esta función requiere el plan <strong style={{ color: tierInfo.color }}>{requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)}</strong>
                        </p>
                    )}
                </div>

                <div className="upgrade-tabs">
                    <button
                        className={`upgrade-tab ${activeTab === 'plans' ? 'active' : ''}`}
                        onClick={() => setActiveTab('plans')}
                    >
                        Planes
                    </button>
                    <button
                        className={`upgrade-tab ${activeTab === 'activate' ? 'active' : ''}`}
                        onClick={() => setActiveTab('activate')}
                    >
                        Activar Licencia
                    </button>
                </div>

                {activeTab === 'plans' && (
                    <div className="upgrade-plans">
                        {Object.entries(TIER_INFO).map(([name, info]) => (
                            <div
                                key={name}
                                className={`plan-card ${name === tier ? 'current' : ''} ${name === requiredTier ? 'recommended' : ''}`}
                            >
                                {name === requiredTier && <div className="plan-badge">Recomendado</div>}
                                {name === tier && <div className="plan-badge current-badge">Actual</div>}
                                <div className="plan-icon" style={{ color: info.color }}>{info.icon}</div>
                                <h3 className="plan-name">{name.charAt(0).toUpperCase() + name.slice(1)}</h3>
                                <div className="plan-price" style={{ color: info.color }}>{info.price}</div>
                                <ul className="plan-features">
                                    {info.features.map((f, i) => (
                                        <li key={i}><Check size={12} /> {f}</li>
                                    ))}
                                </ul>
                                {name !== 'free' && name !== tier && (
                                    <button
                                        className="btn-plan-select"
                                        style={{ borderColor: info.color, color: info.color }}
                                        onClick={() => setActiveTab('activate')}
                                    >
                                        Seleccionar
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'activate' && (
                    <div className="upgrade-activate">
                        <p className="activate-desc">
                            Ingrese su clave de licencia para activar su plan.
                        </p>
                        <div className="activate-input-group">
                            <input
                                type="text"
                                value={licenseKey}
                                onChange={e => setLicenseKey(e.target.value.toUpperCase())}
                                placeholder="VIB-XXXX-XXXX-XXXX-XXXX"
                                className="activate-input"
                                onKeyDown={e => e.key === 'Enter' && handleActivate()}
                            />
                            <button
                                className="btn-activate"
                                onClick={handleActivate}
                                disabled={activating || !licenseKey.trim()}
                            >
                                {activating ? '...' : 'Activar'}
                            </button>
                        </div>
                        <p className="activate-hint">
                            ¿No tiene una clave? Contacte a <a href="mailto:ventas@vibrana.com" style={{ color: '#bd93f9' }}>ventas@vibrana.com</a>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

/**
 * FeatureGate — wraps a component to show a lock overlay when the feature is not available
 * 
 * Usage:
 *   <FeatureGate feature="ai_interpret">
 *     <AIInsights ... />
 *   </FeatureGate>
 */
export const FeatureGate = ({ feature, children, fallback = null }) => {
    const { isFeatureAvailable, promptUpgrade, getRequiredTier } = useLicense();

    if (isFeatureAvailable(feature)) {
        return children;
    }

    const requiredTier = getRequiredTier(feature);

    return (
        <div className="feature-locked" onClick={() => promptUpgrade(feature)}>
            <div className="feature-locked-overlay">
                <Lock size={24} />
                <span>Plan {requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)} requerido</span>
                <button className="btn-unlock">
                    <Sparkles size={14} /> Actualizar
                </button>
            </div>
            <div className="feature-locked-content">
                {fallback || children}
            </div>
        </div>
    );
};

export default UpgradeModal;
