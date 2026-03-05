import { CONFIG } from './config/config.js';
import { LoggerService } from './services/logger.js';
import { DatabaseService } from './services/db.js';
import { BiometricEngine } from './services/ai.js';
import { InterfaceManager } from './ui/interface.js';

class SystemController {
    constructor() {
        this.logger = new LoggerService();
        this.db = new DatabaseService(this.logger);
        this.ai = new BiometricEngine(this.logger);
        this.ui = new InterfaceManager();

        this.isScanning = false;
        this.isVerifying = false;
        this.activeRecord = null;
        this.matchPersistence = 0;
        this.lastSpeech = 0;
        this.lightCounter = 0;
    }

    async init() {
        this.logger.log("System Boot Sequence Initiated...");

        if (!sessionStorage.getItem('ADMIN_ACCESS_KEY')) {
            sessionStorage.setItem('ADMIN_ACCESS_KEY', 'ADMIN');
            this.logger.log("Secure Session Key Initialized: 'ADMIN'", "info");
        }

        this.ui.btnTheme.onclick = () => this.ui.toggleTheme();
        this.ui.btnScan.onclick = () => this.toggleScanState();
        this.ui.btnAdd.onclick = () => this.handleAdminAuth();
        this.ui.btnSave.onclick = () => this.handleUpload();

        this.ui.btnAuthCancel.onclick = () => this.ui.authModal.style.display = 'none';
        this.ui.btnAuthConfirm.onclick = () => this.verifyAuth();

        try {
            await this.db.init();
            await this.ai.loadModels();
            this.renderGallery();

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

    startProcessingLoop() {
        const loop = async () => {
            if (this.ui.video.paused || this.ui.video.ended) return setTimeout(loop, 100);
            if (this.ui.video.clientWidth === 0) return requestAnimationFrame(loop);

            if (this.isScanning && !this.isVerifying) {
                this.checkLighting();
                const detections = await this.ai.scanFrame(this.ui.video);
                const dims = { width: this.ui.video.clientWidth, height: this.ui.video.clientHeight };

                if (dims.width === 0 || dims.height === 0) {
                    requestAnimationFrame(loop);
                    return;
                }

                const resized = faceapi.resizeResults(detections, dims);
                this.ui.clearCanvas();

                let bestMatchFound = false;

                resized.slice(0, CONFIG.LOGIC.MAX_FACES).forEach(d => {
                    const { x, y, width, height } = d.detection.box;
                    let color = CONFIG.THEME.COLORS.SCANNING;
                    let label = "SCANNING";
                    let info = d.age ? `${Math.round(d.age)} YRS` : "";

                    const badPose = this.ai.checkPose(d.landmarks);

                    if (badPose) {
                        color = CONFIG.THEME.COLORS.ALERT;
                        label = "BAD ANGLE";
                        info = "TURN";
                    } else if (this.ai.targetDescriptor) {
                        const dist = this.ai.getMatchScore(d.descriptor);
                        const adaptiveThresh = this.ai.getAdaptiveThreshold(d.age);
                        const matchPercent = Math.max(0, (1 - dist) * 100).toFixed(0);

                        if (dist < adaptiveThresh) {
                            bestMatchFound = true;
                            if (this.matchPersistence >= CONFIG.LOGIC.PERSISTENCE_REQUIRED) {
                                color = CONFIG.THEME.COLORS.MATCH;
                                label = "CAPTURING...";
                                this.triggerSnapshotVerification();
                            } else {
                                color = CONFIG.THEME.COLORS.VERIFYING;
                                label = `VERIFYING (${this.matchPersistence}/${CONFIG.LOGIC.PERSISTENCE_REQUIRED})`;
                                info = `${matchPercent}%`;
                            }
                        } else if (dist < CONFIG.LOGIC.THRESH_POSSIBLE) {
                            color = CONFIG.THEME.COLORS.VERIFYING;
                            label = "POSSIBLE";
                            info = `${matchPercent}%`;
                        } else {
                            info = "NO MATCH";
                        }
                    }
                    this.ui.drawBracketBox(x, y, width, height, color, label, info);
                });

                if (bestMatchFound) {
                    this.matchPersistence++;
                    const confidence = Math.min(100, (this.matchPersistence / CONFIG.LOGIC.PERSISTENCE_REQUIRED) * 100);
                    this.ui.updateStatus(confidence, "ACQUIRING BIOMETRIC LOCK...", CONFIG.THEME.COLORS.VERIFYING);
                } else {
                    this.matchPersistence = Math.max(0, this.matchPersistence - 2);
                    this.ui.updateStatus(0, "SCANNING SECTOR...", CONFIG.THEME.COLORS.SCANNING);
                }

            } else if (!this.isScanning) {
                this.ui.clearCanvas();
            }

            setTimeout(() => requestAnimationFrame(loop), CONFIG.LOGIC.LOOP_DELAY_MS);
        };
        loop();
    }

    async triggerSnapshotVerification() {
        if (this.isVerifying) return;
        this.isVerifying = true;

        this.ui.triggerFlash();
        this.logger.log("Acquiring High-Res Snapshot for Verification...", "info");
        this.ui.updateStatus(100, "ANALYZING SNAPSHOT...", CONFIG.THEME.COLORS.MATCH);

        const snapCanvas = document.createElement('canvas');
        snapCanvas.width = this.ui.video.videoWidth;
        snapCanvas.height = this.ui.video.videoHeight;
        snapCanvas.getContext('2d').drawImage(this.ui.video, 0, 0);

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
                this.matchPersistence = 0;
                this.isVerifying = false;
            }
        } catch (e) {
            this.isVerifying = false;
        }
    }

    handleConfirmedMatch(snapCanvas) {
        this.isScanning = false;
        this.ui.updateStatus(100, "POSITIVE ID CONFIRMED", CONFIG.THEME.COLORS.MATCH);
        this.logger.log(`TARGET IDENTIFIED: ${this.activeRecord.name}`, "success");

        this.speak("Target Identified. Archiving record.");

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

        this.ui.showSuccess(async () => {
            if (this.activeRecord) {
                await this.db.deleteRecord(this.activeRecord.id);
                this.renderGallery();
                this.resetSystem();
                alert("Case Closed: Record has been archived/deleted.");
            }
            this.isVerifying = false;
        });
    }

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

    toggleScanState() {
        this.isScanning = !this.isScanning;
        if (this.isScanning) {
            this.ui.setButtonState("TERMINATE SCAN PROTOCOL", true, 'danger');
            const scanLine = document.getElementById('scan-line');
            if (scanLine) scanLine.classList.add('scan-active');
            this.logger.log("Scan Protocol Initiated.");
        } else {
            this.ui.setButtonState("INITIATE SCAN PROTOCOL", true, 'primary');
            const scanLine = document.getElementById('scan-line');
            if (scanLine) scanLine.classList.remove('scan-active');
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
        const scanLine = document.getElementById('scan-line');
        if (scanLine) scanLine.classList.remove('scan-active');
    }

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
            this.ui.authModal.style.display = 'flex';
            this.ui.authInput.value = "";
            this.ui.authInput.focus();
        }
    }

    verifyAuth() {
        const code = this.ui.authInput.value;
        const sessionKey = sessionStorage.getItem('ADMIN_ACCESS_KEY') || "ADMIN_SESSION_ACTIVE";

        if (code === sessionKey) {
            this.ui.authModal.style.display = 'none';
            this.ui.adminPanel.style.display = 'block';
            this.logger.log("Admin Access Granted. Secure Session Active.", "success");
        } else {
            this.ui.authInput.value = "";
            this.ui.authInput.placeholder = "INVALID CREDENTIALS";
            this.logger.log("Critical: Unauthorized Access Attempt Detected", "error");
            this.speak("Access Denied.");
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
            document.getElementById('in-name').value = "";
            document.getElementById('in-file').value = "";
        };
        r.readAsDataURL(f);
    }
}

const App = new SystemController();
window.onload = () => App.init();
