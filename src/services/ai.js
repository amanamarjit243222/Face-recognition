import { CONFIG } from '../config/config.js';

export class BiometricEngine {
    constructor(logger) {
        this.logger = logger;
        this.options = new faceapi.TinyFaceDetectorOptions({
            inputSize: CONFIG.AI.INPUT_SIZE,
            scoreThreshold: CONFIG.AI.SCORE_THRESH
        });
        this.targetDescriptor = null;
        this.targetName = "";
        this.targetAge = 0;
        this.isLoaded = false;
    }

    async loadModels() {
        try {
            this.logger.log("Initializing Neural Networks...");
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(CONFIG.AI.MODELS_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(CONFIG.AI.MODELS_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(CONFIG.AI.MODELS_URL),
                faceapi.nets.ageGenderNet.loadFromUri(CONFIG.AI.MODELS_URL).catch(() => this.logger.log("AgeNet Optional Failed", "error"))
            ]);
            this.isLoaded = true;
            this.logger.log("AI Models Loaded Successfully", "success");
            return true;
        } catch (e) {
            this.logger.log("Critical AI Load Failure", "error");
            console.error(e);
            return false;
        }
    }

    async setTarget(imageElement, name, age) {
        this.logger.log(`Vectorizing Target: ${name}...`);
        const detections = await faceapi.detectSingleFace(imageElement, this.options)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (detections) {
            this.targetDescriptor = detections.descriptor;
            this.targetName = name;
            this.targetAge = parseInt(age) || 30;
            this.logger.log("Target Vector Locked. Ready.", "success");
            return true;
        } else {
            this.logger.log("Failed to Extract Face Vector", "error");
            return false;
        }
    }

    async scanFrame(videoElement) {
        if (!this.isLoaded) return [];
        return await faceapi.detectAllFaces(videoElement, this.options)
            .withFaceLandmarks()
            .withFaceDescriptors()
            .withAgeAndGender();
    }

    getMatchScore(descriptor) {
        if (!this.targetDescriptor) return 1.0;
        return faceapi.euclideanDistance(this.targetDescriptor, descriptor);
    }

    getAdaptiveThreshold(detectedAge) {
        let threshold = CONFIG.LOGIC.THRESH_MATCH_BASE;
        if (detectedAge && this.targetAge) {
            const diff = Math.abs(detectedAge - this.targetAge);
            threshold += (diff * CONFIG.LOGIC.AGE_COMPENSATION);
            if (threshold > 0.60) threshold = 0.60;
        }
        return threshold;
    }

    checkPose(landmarks) {
        const nose = landmarks.getNose()[3];
        const jawL = landmarks.getJawOutline()[0];
        const jawR = landmarks.getJawOutline()[16];
        const dL = Math.abs(nose.x - jawL.x);
        const dR = Math.abs(nose.x - jawR.x);
        const ratio = Math.min(dL, dR) / (Math.max(dL, dR) + 0.1);
        return ratio < 0.2;
    }
}
