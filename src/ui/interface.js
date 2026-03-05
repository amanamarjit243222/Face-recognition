import { CONFIG } from '../config/config.js';

export class InterfaceManager {
    constructor() {
        this.video = document.getElementById('camera-feed');
        this.canvas = document.getElementById('hud-overlay');
        this.ctx = this.canvas.getContext('2d');

        this.btnScan = document.getElementById('btn-scan-control');
        this.btnAdd = document.getElementById('btn-add-record');
        this.btnSave = document.getElementById('btn-save-record');
        this.btnTheme = document.getElementById('theme-toggle');

        this.adminPanel = document.getElementById('admin-panel');
        this.gallery = document.getElementById('db-gallery');

        this.authModal = document.getElementById('auth-modal');
        this.authInput = document.getElementById('auth-code');
        this.btnAuthConfirm = document.getElementById('btn-auth-confirm');
        this.btnAuthCancel = document.getElementById('btn-auth-cancel');

        this.confVal = document.getElementById('ui-conf-val');
        this.confBar = document.getElementById('ui-conf-bar');
        this.statusText = document.getElementById('ui-status-text');
        this.alertBanner = document.getElementById('alert-banner');

        this.pName = document.getElementById('ui-name');
        this.pAge = document.getElementById('ui-age');
        this.pLoc = document.getElementById('ui-loc');
        this.pImg = document.getElementById('ui-target-img');
    }

    toggleTheme() {
        const html = document.documentElement;
        const current = html.getAttribute('data-theme');
        html.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawBracketBox(x, y, w, h, color, label, info) {
        const ctx = this.ctx;
        const lineLen = Math.min(w, h) * 0.2;

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.fillStyle = color;

        if (color === CONFIG.THEME.COLORS.MATCH) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 15;
        } else {
            ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.moveTo(x, y + lineLen); ctx.lineTo(x, y); ctx.lineTo(x + lineLen, y);
        ctx.moveTo(x + w - lineLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + lineLen);
        ctx.moveTo(x, y + h - lineLen); ctx.lineTo(x, y + h); ctx.lineTo(x + lineLen, y + h);
        ctx.moveTo(x + w - lineLen, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - lineLen);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillRect(x, y - 24, 120, 24);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 12px Inter, sans-serif";
        ctx.fillText(`${label} | ${info}`, x + 6, y - 8);

        if (color === CONFIG.THEME.COLORS.MATCH || color === CONFIG.THEME.COLORS.SCANNING) {
            ctx.globalAlpha = 0.1;
            ctx.fillStyle = color;
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = 1.0;
        }
    }

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
        this.btnScan.className = 'btn';
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
        if (f) {
            f.classList.add('flash-active');
            setTimeout(() => f.classList.remove('flash-active'), 200);
        }
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
