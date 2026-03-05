export class LoggerService {
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
