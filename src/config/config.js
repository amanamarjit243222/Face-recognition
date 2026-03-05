export const CONFIG = {
    THEME: {
        COLORS: {
            SCANNING: '#10b981', // Green
            VERIFYING: '#f59e0b', // Gold
            MATCH: '#3b82f6',    // Blue
            ALERT: '#ef4444'     // Red
        }
    },
    AI: {
        INPUT_SIZE: 608,
        SCORE_THRESH: 0.5,
        MODELS_URL: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights'
    },
    LOGIC: {
        MAX_FACES: 5,
        THRESH_MATCH_BASE: 0.45,
        THRESH_POSSIBLE: 0.60,
        AGE_COMPENSATION: 0.015,
        PERSISTENCE_REQUIRED: 10,
        AUDIO_DEBOUNCE_MS: 3000,
        LOOP_DELAY_MS: 40
    }
};
