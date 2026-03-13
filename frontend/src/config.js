// Centralized API configuration
// All routes served from a single cloud backend (Railway) by default
// Use local backend for device-dependent features (MJPEG stream, OCR capture)

const USE_LOCAL = false; // Toggle to true if running backend locally on port 5001

export const API = USE_LOCAL
    ? 'http://localhost:5001'
    : (import.meta.env.VITE_API_URL || 'https://fabulous-embrace-production-1e4f.up.railway.app');

export const LOCAL_API = API;
