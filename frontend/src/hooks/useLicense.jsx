/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API } from '../config.js';

const LicenseContext = createContext(null);

export function LicenseProvider({ children }) {
    const [license, setLicense] = useState({
        tier: 'free',
        tier_label: 'Gratis',
        features: [],
        max_patients: 5,
        all_tiers: {},
        feature_tier_map: {},
        loading: true,
    });
    const [showUpgrade, setShowUpgrade] = useState(false);
    const [upgradeFeature, setUpgradeFeature] = useState(null);

    const fetchLicense = useCallback(async () => {
        try {
            const token = localStorage.getItem('vibrana_token');
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            const res = await fetch(`${API}/license/status`, { headers });
            if (res.ok) {
                const data = await res.json();
                setLicense({ ...data, loading: false });
            } else {
                setLicense(prev => ({ ...prev, loading: false }));
            }
        } catch (err) {
            console.error('[License] Failed to fetch status:', err);
            setLicense(prev => ({ ...prev, loading: false }));
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchLicense();
    }, [fetchLicense]);

    const isFeatureAvailable = useCallback((feature) => {
        // DEMO_MODE: all features unlocked for customer demos.
        // Set to false when paywall goes live.
        const DEMO_MODE = true;
        if (DEMO_MODE) return true;
        if (license.paywall_enabled === false) return true;
        return license.features?.includes(feature);
    }, [license.features, license.paywall_enabled]);

    const getRequiredTier = useCallback((feature) => {
        return license.feature_tier_map?.[feature] || 'pro';
    }, [license.feature_tier_map]);

    const promptUpgrade = useCallback((feature) => {
        setUpgradeFeature(feature);
        setShowUpgrade(true);
    }, []);

    const activateLicense = useCallback(async (key) => {
        try {
            const res = await fetch(`${API}/license/activate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` },
                body: JSON.stringify({ license_key: key }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                await fetchLicense(); // Refresh state
                return { success: true, tier: data.tier };
            }
            return { success: false, error: data.error || 'Error de activación' };
        } catch {
            return { success: false, error: 'Error de conexión' };
        }
    }, [fetchLicense]);

    const deactivateLicense = useCallback(async () => {
        try {
            await fetch(`${API}/license/deactivate`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('vibrana_token')}` }
            });
            await fetchLicense();
        } catch (err) {
            console.error('[License] Deactivation failed:', err);
        }
    }, [fetchLicense]);

    const value = {
        ...license,
        isFeatureAvailable,
        getRequiredTier,
        promptUpgrade,
        activateLicense,
        deactivateLicense,
        showUpgrade,
        setShowUpgrade,
        upgradeFeature,
        refreshLicense: fetchLicense,
    };

    return (
        <LicenseContext.Provider value={value}>
            {children}
        </LicenseContext.Provider>
    );
}

export function useLicense() {
    const ctx = useContext(LicenseContext);
    if (!ctx) throw new Error('useLicense must be used within LicenseProvider');
    return ctx;
}

export default useLicense;
