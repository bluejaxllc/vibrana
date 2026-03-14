// Centralized API configuration
// Cloud API (Railway) for most features
// Local API (localhost:5001) for device-dependent features (macros record/play, MJPEG stream)

const USE_LOCAL = false; // Toggle to true to route ALL traffic through local backend

export const API = USE_LOCAL
    ? 'http://localhost:5001'
    : (import.meta.env.VITE_API_URL || 'https://fabulous-embrace-production-1e4f.up.railway.app');

// LOCAL_API always points to the local backend — used for device-dependent features
export const LOCAL_API = 'http://localhost:5001';
