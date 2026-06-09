class Storage {
    constructor() {
        this.prefix = 'braindump_';
    }

    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(this.prefix + key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.error(`Storage get error for ${key}:`, e);
            return defaultValue;
        }
    }

    set(key, value) {
        try {
            localStorage.setItem(this.prefix + key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error(`Storage set error for ${key}:`, e);
            return false;
        }
    }

    remove(key) {
        try {
            localStorage.removeItem(this.prefix + key);
            return true;
        } catch (e) {
            console.error(`Storage remove error for ${key}:`, e);
            return false;
        }
    }

    clear() {
        try {
            const keys = Object.keys(localStorage)
                .filter(k => k.startsWith(this.prefix));
            keys.forEach(k => localStorage.removeItem(k));
            return true;
        } catch (e) {
            console.error('Storage clear error:', e);
            return false;
        }
    }

    getAll() {
        const result = {};
        try {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(this.prefix)) {
                    const shortKey = key.replace(this.prefix, '');
                    result[shortKey] = this.get(shortKey);
                }
            });
        } catch (e) {
            console.error('Storage getAll error:', e);
        }
        return result;
    }
}

export const storage = new Storage();
