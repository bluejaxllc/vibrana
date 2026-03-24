// Centralized API configuration
// Cloud API for production, Local API for device-dependent features (macros, MJPEG stream)

const USE_LOCAL = import.meta.env.VITE_USE_LOCAL === 'true' ||
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API = USE_LOCAL
    ? 'http://localhost:5001'
    : (import.meta.env.VITE_API_URL || 'https://fabulous-embrace-production-1e4f.up.railway.app');

// LOCAL_API always points to the local backend — used for device-dependent features
export const LOCAL_API = 'http://localhost:5001';
