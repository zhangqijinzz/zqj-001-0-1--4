export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function formatDateTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

export function getTimeSlot(hour) {
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 24) return 'evening';
    return 'night';
}

export function getTimeSlotLabel(timeSlot) {
    const labels = {
        morning: '🌅 早晨',
        afternoon: '☀️ 下午',
        evening: '🌆 傍晚',
        night: '🌙 深夜'
    };
    return labels[timeSlot] || '';
}

export function getCategoryLabel(category) {
    const labels = {
        todo: '📋 待办',
        worry: '💭 担忧',
        idea: '💡 灵感'
    };
    return labels[category] || category;
}

export function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

export function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function downloadJson(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function copyToClipboard(text) {
    if (navigator.clipboard) {
        return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            resolve();
        } catch (e) {
            reject(e);
        }
        document.body.removeChild(textarea);
    });
}

export function animateValue(el, targetVal, duration = 600, isFloat = false) {
    const startVal = parseFloat(el.textContent) || 0;
    const diff = targetVal - startVal;
    if (Math.abs(diff) < 0.01) {
        el.textContent = isFloat ? targetVal.toFixed(1) : targetVal;
        return;
    }
    const startTime = performance.now();
    const animate = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = startVal + diff * eased;
        el.textContent = isFloat ? current.toFixed(1) : Math.round(current);
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    };
    requestAnimationFrame(animate);
}
