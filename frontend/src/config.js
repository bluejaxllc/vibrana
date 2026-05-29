// Centralized API configuration
// Cloud API for production, Local API for device-dependent features (macros, MJPEG stream)

const USE_LOCAL = import.meta.env.VITE_USE_LOCAL === 'true';

export const API = import.meta.env.VITE_API_URL || 
    (USE_LOCAL ? 'http://localhost:5001' : 'https://fabulous-embrace-production-1e4f.up.railway.app');

// LOCAL_API always points to the local backend — used for device-dependent features
export const LOCAL_API = 'http://localhost:5001';
