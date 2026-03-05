/**
 * ------------------------------------------------------------------
 * [1] CONFIGURATION & CONSTANTS
 * ------------------------------------------------------------------
 */
const CONFIG = {
    THEME: {
        COLORS: {
            SCANNING: '#10b981', // Green
            VERIFYING: '#f59e0b', // Gold
            MATCH: '#3b82f6',    // Blue
            ALERT: '#ef4444'     // Red
        }
    },
    AI: {
        // Using 608px for Maximum Enterprise Fidelity
        INPUT_SIZE: 608,
        SCORE_THRESH: 0.5,
        MODELS_URL: 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights'
    },
    LOGIC: {
        MAX_FACES: 5,
        // Strict Identification Thresholds
        THRESH_MATCH_BASE: 0.45,
        THRESH_POSSIBLE: 0.60,
        AGE_COMPENSATION: 0.015,
        // Persistence: 10 frames = ~0.5s stability check
        PERSISTENCE_REQUIRED: 10,
        // Cooldowns
        AUDIO_DEBOUNCE_MS: 3000,
        // Throttling: 40ms = ~25 FPS max (prevents lag)
        LOOP_DELAY_MS: 40
    }
};

/**
 * ------------------------------------------------------------------
 * [2] SERVICE: LOGGER
 * Simulates a system terminal for professional feedback.
 * ------------------------------------------------------------------
 */
class LoggerService {
    constructor() {
        this.container = document.getElementById('system-log');
    }

    log(message, type = 'info') {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `<span class="log-time">[${timeStr}]</span> ${message}`;

        if (type === 'error') entry.style.color = 'var(--color-danger)';
        if (type === 'success') entry.style.color = 'var(--color-success)';

        this.container.appendChild(entry);
        this.container.scrollTop = this.container.scrollHeight;
    }
}

/**
 * ------------------------------------------------------------------
 * [3] SERVICE: DATABASE (IndexedDB)
 * ------------------------------------------------------------------
 */
class DatabaseService {
    constructor(logger) {
        this.logger = logger;
        this.dbName = "PoliceDB_Ent_V9";
        this.storeName = "records";
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, 1);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: "id", autoIncrement: true });
                }
            };

            req.onsuccess = (e) => {
                this.db = e.target.result;
                this.logger.log("Database Connection Established", "success");
                resolve(true);
            };

            req.onerror = (e) => {
                this.logger.log("Database Connection Failed", "error");
                reject(e);
            };
        });
    }

    async addRecord(data) {
        const tx = this.db.transaction([this.storeName], "readwrite");
        tx.objectStore(this.storeName).add(data);
        return new Promise(resolve => {
            tx.oncomplete = () => {
                this.logger.log(`Record Added: ${data.name}`, "success");
                resolve(true);
            }
        });
    }

    async getAllRecords() {
        const tx = this.db.transaction([this.storeName], "readonly");
        const store = tx.objectStore(this.storeName);
        return new Promise(resolve => {
            store.getAll().onsuccess = (e) => resolve(e.target.result);
        });
    }

    async deleteRecord(id) {
        const tx = this.db.transaction([this.storeName], "readwrite");
        tx.objectStore(this.storeName).delete(id);
        return new Promise(resolve => {
            tx.oncomplete = () => {
                this.logger.log(`Record ID ${id} Archived/Deleted`, "info");
                resolve(true);
            }
        });
    }
}

/**
 * ------------------------------------------------------------------
 * [4] SERVICE: BIOMETRIC ENGINE (AI)
 * ------------------------------------------------------------------
 */
class BiometricEngine {
    constructor(logger) {
        this.logger = logger;
        this.options = new faceapi.TinyFaceDetectorOptions({
            inputSize: CONFIG.AI.INPUT_SIZE,
            scoreThreshold: CONFIG.AI.SCORE_THRESH
        });
        this.targetDescriptor = null; // Storing Raw Descriptor (V7 Logic)
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
            // DIRECT DESCRIPTOR STORAGE (No FaceMatcher Black Box)
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
        // Detect All Faces
        return await faceapi.detectAllFaces(videoElement, this.options)
            .withFaceLandmarks()
            .withFaceDescriptors()
            .withAgeAndGender();
    }

    // RAW EUCLIDEAN DISTANCE (V7 Logic)
    getMatchScore(descriptor) {
        if (!this.targetDescriptor) return 1.0; // Max distance
        return faceapi.euclideanDistance(this.targetDescriptor, descriptor);
    }

    // Adaptive Threshold Logic
    getAdaptiveThreshold(detectedAge) {
        let threshold = CONFIG.LOGIC.THRESH_MATCH_BASE;
        if (detectedAge && this.targetAge) {
            const diff = Math.abs(detectedAge - this.targetAge);
            // Relax threshold by factor per year difference
            threshold += (diff * CONFIG.LOGIC.AGE_COMPENSATION);
            // Hard cap to prevent security holes
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
        // Ratio < 0.2 means profile view (bad angle)
        return ratio < 0.2;
    }
}

/**
 * ------------------------------------------------------------------
 * [5] SERVICE: INTERFACE MANAGER (UI)
 * ------------------------------------------------------------------
 */
class InterfaceManager {
    constructor() {
        // Elements
        this.video = document.getElementById('camera-feed');
        this.canvas = document.getElementById('hud-overlay');
        this.ctx = this.canvas.getContext('2d');

        this.btnScan = document.getElementById('btn-scan-control');
        this.btnAdd = document.getElementById('btn-add-record');
        this.btnSave = document.getElementById('btn-save-record');
        this.btnTheme = document.getElementById('theme-toggle');

        this.adminPanel = document.getElementById('admin-panel');
        this.gallery = document.getElementById('db-gallery');

        // Auth Modal Elements
        this.authModal = document.getElementById('auth-modal');
        this.authInput = document.getElementById('auth-code');
        this.btnAuthConfirm = document.getElementById('btn-auth-confirm');
        this.btnAuthCancel = document.getElementById('btn-auth-cancel');

        // Indicators
        this.confVal = document.getElementById('ui-conf-val');
        this.confBar = document.getElementById('ui-conf-bar');
        this.statusText = document.getElementById('ui-status-text');
        this.alertBanner = document.getElementById('alert-banner');

        // Profile
        this.pName = document.getElementById('ui-name');
        this.pAge = document.getElementById('ui-age');
        this.pLoc = document.getElementById('ui-loc');
        this.pImg = document.getElementById('ui-target-img');
    }

    // --- Theme Handling ---
    toggleTheme() {
        const html = document.documentElement;
        const current = html.getAttribute('data-theme');
        html.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
    }

    // --- Canvas Drawing ---
    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawBracketBox(x, y, w, h, color, label, info) {
        const ctx = this.ctx;
        const lineLen = Math.min(w, h) * 0.2;

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.fillStyle = color;

        // Pulsing Shadow for Match
        if (color === CONFIG.THEME.COLORS.MATCH) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 15;
        } else {
            ctx.shadowBlur = 0;
        }

        // Draw Corners
        ctx.beginPath();
        ctx.moveTo(x, y + lineLen); ctx.lineTo(x, y); ctx.lineTo(x + lineLen, y);
        ctx.moveTo(x + w - lineLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + lineLen);
        ctx.moveTo(x, y + h - lineLen); ctx.lineTo(x, y + h); ctx.lineTo(x + lineLen, y + h);
        ctx.moveTo(x + w - lineLen, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - lineLen);
        ctx.stroke();

        // Draw Label Background
        ctx.shadowBlur = 0;
        ctx.fillRect(x, y - 24, 120, 24);

        // Draw Text
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 12px Inter, sans-serif";
        ctx.fillText(`${label} | ${info}`, x + 6, y - 8);

        // Optional Fill
        if (color === CONFIG.THEME.COLORS.MATCH || color === CONFIG.THEME.COLORS.SCANNING) {
            ctx.globalAlpha = 0.1;
            ctx.fillStyle = color;
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = 1.0;
        }
    }

    // --- Status Updates ---
    updateStatus(percent, message, colorCode) {
        this.confVal.innerText = `${percent.toFixed(0)}%`;
        this.confBar.style.width = `${percent}%`;
        this.confBar.style.backgroundColor = colorCode;
        this.statusText.innerText = message;
        this.statusText.style.color = colorCode;
    }

    setButtonState(text, enabled, variant = 'primary') {
        this.btnScan.innerHTML = text;
        this.btnScan.disabled = !enabled;
        this.btnScan.className = 'btn'; // Reset
        if (variant === 'danger') this.btnScan.classList.add('btn-danger');
        else this.btnScan.classList.add('btn-primary');
    }

    updateProfile(rec) {
        this.pName.innerText = rec.name;
        this.pAge.innerText = rec.age;
        this.pLoc.innerText = rec.loc;
        this.pImg.src = rec.img;
    }

    resetProfile() {
        this.pName.innerText = "--";
        this.pAge.innerText = "--";
        this.pLoc.innerText = "--";
        this.pImg.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        this.updateStatus(0, "SYSTEM IDLE", "var(--text-muted)");
    }

    toggleAlert(show) {
        this.alertBanner.style.display = show ? 'block' : 'none';
    }

    triggerFlash() {
        const f = document.getElementById('flash-effect');
        f.classList.add('flash-active');
        setTimeout(() => f.classList.remove('flash-active'), 200);
    }

    showSuccess(callback) {
        const overlay = document.getElementById('success-overlay');
        const counter = document.getElementById('countdown-val');
        overlay.style.display = 'flex';

        let count = 10;
        counter.innerText = count;

        const iv = setInterval(() => {
            count--;
            counter.innerText = count;
            if (count <= 0) {
                clearInterval(iv);
                overlay.style.display = 'none';
                if (callback) callback();
            }
        }, 1000);
    }
}

/**
 * ------------------------------------------------------------------
 * [6] CONTROLLER: MAIN APPLICATION
 * ------------------------------------------------------------------
 */
class SystemController {
    constructor() {
        this.logger = new LoggerService();
        this.db = new DatabaseService(this.logger);
        this.ai = new BiometricEngine(this.logger);
        this.ui = new InterfaceManager();

        // State
        this.isScanning = false;
        this.isVerifying = false; // Snapshot in progress
        this.activeRecord = null;
        this.matchPersistence = 0; // Counter for "Check 10 times"
        this.lastSpeech = 0;
        this.lightCounter = 0;
    }

    async init() {
        this.logger.log("System Boot Sequence Initiated...");

        // Bind UI Events
        this.ui.btnTheme.onclick = () => this.ui.toggleTheme();
        this.ui.btnScan.onclick = () => this.toggleScanState();
        this.ui.btnAdd.onclick = () => this.handleAdminAuth();
        this.ui.btnSave.onclick = () => this.handleUpload();

        // Auth Modal Bindings
        this.ui.btnAuthCancel.onclick = () => this.ui.authModal.style.display = 'none';
        this.ui.btnAuthConfirm.onclick = () => this.verifyAuth();

        try {
            // Initialize Subsystems
            await this.db.init();
            await this.ai.loadModels();
            this.renderGallery();

            // Camera Setup
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            this.ui.video.srcObject = stream;
            this.ui.video.onplay = () => {
                faceapi.matchDimensions(this.ui.canvas, this.ui.video);
                this.startProcessingLoop();
            };

            this.ui.setButtonState("SELECT A TARGET FROM DATABASE", false);
            this.logger.log("Camera Feed Active. System Ready.", "success");

        } catch (e) {
            this.logger.log("Initialization Failed: " + e.message, "error");
            this.ui.setButtonState("SYSTEM FAILURE", false, 'danger');
        }
    }

    // --- MAIN LOGIC LOOP ---
    startProcessingLoop() {
        const loop = async () => {
            // 1. Validation Checks
            if (this.ui.video.paused || this.ui.video.ended) return setTimeout(loop, 100);

            // Prevent crash if minimized
            if (this.ui.video.clientWidth === 0) return requestAnimationFrame(loop);

            // 2. Throttling (Anti-Lag)
            // We execute logic only if not verifying and scanning enabled
            if (this.isScanning && !this.isVerifying) {

                this.checkLighting();

                // AI DETECT
                const detections = await this.ai.scanFrame(this.ui.video);

                // RESIZE & CLEAR
                const dims = { width: this.ui.video.clientWidth, height: this.ui.video.clientHeight };

                // FIX: Ensure dimensions are valid before resizing to prevent crash
                if (dims.width === 0 || dims.height === 0) {
                    requestAnimationFrame(loop);
                    return;
                }

                const resized = faceapi.resizeResults(detections, dims);
                this.ui.clearCanvas();

                let bestMatchFound = false;

                // PROCESS FACES (Max 5)
                resized.slice(0, CONFIG.LOGIC.MAX_FACES).forEach(d => {
                    const { x, y, width, height } = d.detection.box;

                    // Default Visuals
                    let color = CONFIG.THEME.COLORS.SCANNING;
                    let label = "SCANNING";
                    let info = d.age ? `${Math.round(d.age)} YRS` : "";

                    // Logic Chain
                    const badPose = this.ai.checkPose(d.landmarks);

                    if (badPose) {
                        color = CONFIG.THEME.COLORS.ALERT;
                        label = "BAD ANGLE";
                        info = "TURN";
                    } else if (this.ai.targetDescriptor) {
                        // DIRECT MATCHING LOGIC (RESTORED FROM V7)
                        const dist = this.ai.getMatchScore(d.descriptor);
                        const adaptiveThresh = this.ai.getAdaptiveThreshold(d.age);
                        const matchPercent = Math.max(0, (1 - dist) * 100).toFixed(0);

                        if (dist < adaptiveThresh) {
                            // STRICT MATCH CANDIDATE
                            bestMatchFound = true;

                            // "CHECK 10 TIMES" Logic
                            if (this.matchPersistence >= CONFIG.LOGIC.PERSISTENCE_REQUIRED) {
                                color = CONFIG.THEME.COLORS.MATCH; // Blue
                                label = "CAPTURING...";
                                this.triggerSnapshotVerification();
                            } else {
                                color = CONFIG.THEME.COLORS.VERIFYING; // Gold
                                label = `VERIFYING (${this.matchPersistence}/${CONFIG.LOGIC.PERSISTENCE_REQUIRED})`;
                                info = `${matchPercent}%`;
                            }
                        } else if (dist < CONFIG.LOGIC.THRESH_POSSIBLE) {
                            // POSSIBLE (Yellow)
                            color = CONFIG.THEME.COLORS.VERIFYING;
                            label = "POSSIBLE";
                            info = `${matchPercent}%`;
                        } else {
                            // NO MATCH (Green)
                            info = "NO MATCH";
                        }
                    }

                    this.ui.drawBracketBox(x, y, width, height, color, label, info);
                });

                // UPDATE PERSISTENCE
                if (bestMatchFound) {
                    this.matchPersistence++;
                    const confidence = Math.min(100, (this.matchPersistence / CONFIG.LOGIC.PERSISTENCE_REQUIRED) * 100);
                    this.ui.updateStatus(confidence, "ACQUIRING BIOMETRIC LOCK...", CONFIG.THEME.COLORS.VERIFYING);
                } else {
                    // Decay persistence if target lost
                    this.matchPersistence = Math.max(0, this.matchPersistence - 2);
                    this.ui.updateStatus(0, "SCANNING SECTOR...", CONFIG.THEME.COLORS.SCANNING);
                }

            } else if (!this.isScanning) {
                this.ui.clearCanvas();
            }

            // Loop Throttle (40ms = ~25 FPS)
            setTimeout(() => requestAnimationFrame(loop), CONFIG.LOGIC.LOOP_DELAY_MS);
        };
        loop();
    }

    // --- SNAPSHOT VERIFICATION LOGIC ---
    async triggerSnapshotVerification() {
        if (this.isVerifying) return;
        this.isVerifying = true;

        this.ui.triggerFlash();
        this.logger.log("Acquiring High-Res Snapshot for Verification...", "info");
        this.ui.updateStatus(100, "ANALYZING SNAPSHOT...", CONFIG.THEME.COLORS.MATCH);

        // Capture Frame
        const snapCanvas = document.createElement('canvas');
        snapCanvas.width = this.ui.video.videoWidth;
        snapCanvas.height = this.ui.video.videoHeight;
        snapCanvas.getContext('2d').drawImage(this.ui.video, 0, 0);

        // Analyze Frame (Double Check)
        try {
            const snapResults = await this.ai.scanFrame(snapCanvas);
            let verified = false;

            for (const snapDet of snapResults) {
                const dist = this.ai.getMatchScore(snapDet.descriptor);
                const strictThresh = this.ai.getAdaptiveThreshold(snapDet.age);

                if (dist < strictThresh) {
                    verified = true;
                    break;
                }
            }

            if (verified) {
                this.handleConfirmedMatch(snapCanvas);
            } else {
                this.logger.log("Snapshot Verification Failed. Resuming Scan.", "error");
                this.matchPersistence = 0; // Reset
                this.isVerifying = false; // Release lock
            }
        } catch (e) {
            this.isVerifying = false;
        }
    }

    handleConfirmedMatch(snapCanvas) {
        this.isScanning = false; // Stop scanning loop
        this.ui.updateStatus(100, "POSITIVE ID CONFIRMED", CONFIG.THEME.COLORS.MATCH);
        this.logger.log(`TARGET IDENTIFIED: ${this.activeRecord.name}`, "success");

        this.speak("Target Identified. Archiving record.");

        // Auto Download Evidence
        if (snapCanvas) {
            try {
                const link = document.createElement('a');
                link.download = `MATCH_${this.activeRecord.name}_${Date.now()}.png`;
                link.href = snapCanvas.toDataURL('image/png');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                this.logger.log("Evidence photo downloaded.", "success");
            } catch (e) {
                this.logger.log("Failed to download evidence.", "error");
            }
        }

        // Show Overlay & Countdown
        this.ui.showSuccess(async () => {
            // Action after countdown
            if (this.activeRecord) {
                await this.db.deleteRecord(this.activeRecord.id);
                this.renderGallery();
                this.resetSystem();
                alert("Case Closed: Record has been archived/deleted.");
            }
            this.isVerifying = false;
        });
    }

    // --- UTILITIES ---
    checkLighting() {
        if (this.lightCounter++ < 30) return;
        this.lightCounter = 0;
        try {
            const p = this.ui.ctx.getImageData(this.ui.canvas.width / 2, this.ui.canvas.height / 2, 1, 1).data;
            const b = (p[0] + p[1] + p[2]) / 3;
            this.ui.toggleAlert(b < 20 && b > 0);
        } catch (e) { }
    }

    speak(text) {
        const now = Date.now();
        if (now - this.lastSpeech > CONFIG.LOGIC.AUDIO_DEBOUNCE_MS && 'speechSynthesis' in window) {
            const u = new SpeechSynthesisUtterance(text);
            u.rate = 1.1;
            window.speechSynthesis.speak(u);
            this.lastSpeech = now;
        }
    }

    // --- STATE MANAGEMENT ---
    toggleScanState() {
        this.isScanning = !this.isScanning;
        if (this.isScanning) {
            this.ui.setButtonState("TERMINATE SCAN PROTOCOL", true, 'danger');
            document.getElementById('scan-line').classList.add('scan-active');
            this.logger.log("Scan Protocol Initiated.");
        } else {
            this.ui.setButtonState("INITIATE SCAN PROTOCOL", true, 'primary');
            document.getElementById('scan-line').classList.remove('scan-active');
            this.ui.updateStatus(0, "SYSTEM IDLE", "var(--text-muted)");
            this.matchPersistence = 0;
            this.logger.log("Scan Protocol Paused.");
        }
    }

    resetSystem() {
        this.activeRecord = null;
        this.isScanning = false;
        this.isVerifying = false;
        this.matchPersistence = 0;
        this.ui.resetProfile();
        this.ui.setButtonState("SELECT A TARGET", false);
        document.getElementById('scan-line').classList.remove('scan-active');
    }

    // --- DATABASE / ADMIN INTERACTION ---
    async renderGallery() {
        const records = await this.db.getAllRecords();
        this.ui.gallery.innerHTML = "";

        records.reverse().forEach(r => {
            const div = document.createElement('div');
            div.className = 'gallery-item';
            div.innerHTML = `<img src="${r.img}">`;
            div.onclick = () => this.loadRecord(r);
            this.ui.gallery.appendChild(div);
        });
    }

    loadRecord(r) {
        this.activeRecord = r;
        this.ui.updateProfile(r);
        this.ui.setButtonState("VECTORIZING...", false);
        this.logger.log(`Loading Record: ${r.name}`);

        const img = new Image();
        img.src = r.img;
        img.onload = async () => {
            const success = await this.ai.setTarget(img, r.name, r.age);
            if (success) {
                this.ui.setButtonState("INITIATE SCAN PROTOCOL", true, 'primary');
            } else {
                this.ui.setButtonState("INVALID IMAGE DATA", false, 'danger');
            }
        };
    }

    handleAdminAuth() {
        const panel = this.ui.adminPanel;
        if (panel.style.display === 'block') {
            panel.style.display = 'none';
        } else {
            // Open Custom Modal
            this.ui.authModal.style.display = 'flex';
            this.ui.authInput.value = "";
            this.ui.authInput.focus();
        }
    }

    verifyAuth() {
        const code = this.ui.authInput.value;
        if (code === "100") {
            this.ui.authModal.style.display = 'none';
            this.ui.adminPanel.style.display = 'block';
            this.logger.log("Admin Access Granted.", "success");
        } else {
            this.ui.authInput.value = "";
            this.ui.authInput.placeholder = "INVALID CODE";
            this.logger.log("Access Denied: Invalid Credentials", "error");
        }
    }

    async handleUpload() {
        const name = document.getElementById('in-name').value;
        const age = document.getElementById('in-age').value;
        const loc = document.getElementById('in-loc').value;
        const f = document.getElementById('in-file').files[0];

        if (!name || !f) {
            this.logger.log("Upload Failed: Missing Name or Photo.", "error");
            return;
        }

        const r = new FileReader();
        r.onload = async (e) => {
            await this.db.addRecord({
                name,
                age: age || "Unknown",
                loc: loc || "Unknown",
                img: e.target.result
            });
            this.renderGallery();
            this.ui.adminPanel.style.display = 'none';
            // Reset Inputs
            document.getElementById('in-name').value = "";
            document.getElementById('in-file').value = "";
        };
        r.readAsDataURL(f);
    }
}

// --- BOOTSTRAP ---
const App = new SystemController();
window.onload = () => App.init();
