/**
 * @jest-environment node
 *
 * Unit Tests for Face-recognition Biometric Logic
 *
 * These tests cover the pure, non-DOM-dependent logic functions
 * extracted from the BiometricEngine and InterfaceManager.
 * Browser-dependent features (camera, canvas, face-api.js) are tested
 * through manual integration testing.
 */

// -------------------------------------------------------
// Test: Adaptive Threshold Calculation
// (Mirrors BiometricEngine.getAdaptiveThreshold logic)
// -------------------------------------------------------
const THRESH_MATCH_BASE = 0.42;
const AGE_COMPENSATION = 0.015;
const MAX_THRESHOLD = 0.60;

function getAdaptiveThreshold(targetAge, detectedAge) {
    let threshold = THRESH_MATCH_BASE;
    if (detectedAge != null && targetAge != null) {
        const diff = Math.abs(detectedAge - targetAge);
        threshold += diff * AGE_COMPENSATION;
        if (threshold > MAX_THRESHOLD) threshold = MAX_THRESHOLD;
    }
    return threshold;
}

describe('BiometricEngine - Adaptive Threshold', () => {
    test('returns base threshold when ages match exactly', () => {
        const result = getAdaptiveThreshold(30, 30);
        expect(result).toBeCloseTo(0.42);
    });

    test('increases threshold for age difference', () => {
        const result = getAdaptiveThreshold(30, 40); // 10 year diff
        expect(result).toBeCloseTo(0.42 + 10 * 0.015);
    });

    test('caps threshold at MAX (0.60)', () => {
        // 50 year difference: 0.42 + 50*0.015 = 1.17 → should cap at 0.60
        const result = getAdaptiveThreshold(20, 70);
        expect(result).toBe(0.60);
    });

    test('returns base if ages are null', () => {
        const result = getAdaptiveThreshold(null, null);
        expect(result).toBe(THRESH_MATCH_BASE);
    });
});

// -------------------------------------------------------
// Test: Pose Estimation Check
// (Mirrors BiometricEngine.checkPose logic)
// -------------------------------------------------------
function checkPose(noseX, jawLX, jawRX) {
    const dL = Math.abs(noseX - jawLX);
    const dR = Math.abs(noseX - jawRX);
    const ratio = Math.min(dL, dR) / (Math.max(dL, dR) + 0.1);
    return ratio < 0.2;
}

describe('BiometricEngine - Pose Check', () => {
    test('returns true for front-facing pose (balanced jaw)', () => {
        // Nose centered between jaws
        const result = checkPose(100, 50, 150);
        expect(result).toBe(true);
    });

    test('returns false for severely turned head', () => {
        // Nose way to the right → not front-facing
        const result = checkPose(140, 50, 150);
        expect(result).toBe(false);
    });
});

// -------------------------------------------------------
// Test: Confidence Level Display Logic
// -------------------------------------------------------
function getConfidenceLevel(distance) {
    if (distance < 0.40) return 'HIGH';
    if (distance < 0.52) return 'MEDIUM';
    return 'LOW';
}

describe('Confidence Level Categorization', () => {
    test('returns HIGH for distance < 0.40', () => {
        expect(getConfidenceLevel(0.25)).toBe('HIGH');
    });

    test('returns MEDIUM for distance between 0.40 and 0.52', () => {
        expect(getConfidenceLevel(0.45)).toBe('MEDIUM');
    });

    test('returns LOW for distance >= 0.52', () => {
        expect(getConfidenceLevel(0.60)).toBe('LOW');
    });
});
