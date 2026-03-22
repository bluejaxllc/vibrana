// Centralized API configuration
// Cloud API (Google Cloud Run) for most features
// Local API (localhost:5001) for device-dependent features (macros record/play, MJPEG stream)

const USE_LOCAL = false; // Toggle to true to route ALL traffic through local backend

export const API = USE_LOCAL
    ? 'http://localhost:5001'
    : (import.meta.env.VITE_API_URL || 'https://vibrana-backend-snz5dayccq-uc.a.run.app');

// LOCAL_API always points to the local backend — used for device-dependent features
export const LOCAL_API = 'http://localhost:5001';
