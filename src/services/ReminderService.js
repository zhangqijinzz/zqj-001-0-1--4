import { storage } from '../core/Storage.js';
import { eventBus } from '../core/EventBus.js';

class ReminderService {
    constructor() {
        this.settings = storage.get('reminderSettings') || {
            enabled: false,
            time: '22:30',
            repeatMode: 'daily',
            title: '该准备睡觉了',
            message: '放下手机，开始睡前整理吧',
            sound: true
        };
        this.checkInterval = null;
        this.lastReminderDate = storage.get('lastReminderDate') || null;
        this.broadcastChannel = null;
        
        this.initBroadcastChannel();
    }

    initBroadcastChannel() {
        if ('BroadcastChannel' in window) {
            this.broadcastChannel = new BroadcastChannel('braindump-reminder');
            this.broadcastChannel.onmessage = (event) => {
                if (event.data.type === 'reminder-triggered') {
                    this.lastReminderDate = event.data.date;
                    storage.set('lastReminderDate', this.lastReminderDate);
                }
            };
        }
    }

    saveSettings() {
        storage.set('reminderSettings', this.settings);
    }

    getSettings() {
        return { ...this.settings };
    }

    setEnabled(enabled) {
        this.settings.enabled = enabled;
        this.saveSettings();
        this.updateReminderCheck();
    }

    setTime(time) {
        this.settings.time = time;
        this.saveSettings();
    }

    setRepeatMode(mode) {
        this.settings.repeatMode = mode;
        this.saveSettings();
    }

    setTitle(title) {
        this.settings.title = title;
        this.saveSettings();
    }

    setMessage(message) {
        this.settings.message = message;
        this.saveSettings();
    }

    setSound(enabled) {
        this.settings.sound = enabled;
        this.saveSettings();
    }

    async requestPermission() {
        if (!('Notification' in window)) {
            return { granted: false, error: '浏览器不支持通知' };
        }

        const permission = await Notification.requestPermission();
        return {
            granted: permission === 'granted',
            permission
        };
    }

    hasPermission() {
        return 'Notification' in window && Notification.permission === 'granted';
    }

    getPermissionStatus() {
        if (!('Notification' in window)) {
            return 'unsupported';
        }
        return Notification.permission;
    }

    isWeekday(date) {
        const day = date.getDay();
        return day >= 1 && day <= 5;
    }

    shouldTriggerToday() {
        if (this.settings.repeatMode === 'daily') {
            return true;
        }
        if (this.settings.repeatMode === 'weekdays') {
            return this.isWeekday(new Date());
        }
        return false;
    }

    getNextReminderTime() {
        if (!this.settings.enabled) return null;
        if (!this.hasPermission()) return null;

        const now = new Date();
        const [hours, minutes] = this.settings.time.split(':').map(Number);
        
        const todayReminder = new Date();
        todayReminder.setHours(hours, minutes, 0, 0);

        if (now < todayReminder && this.shouldTriggerToday()) {
            return todayReminder;
        }

        const tomorrowReminder = new Date(todayReminder);
        tomorrowReminder.setDate(tomorrowReminder.getDate() + 1);
        
        while (this.settings.repeatMode === 'weekdays' && !this.isWeekday(tomorrowReminder)) {
            tomorrowReminder.setDate(tomorrowReminder.getDate() + 1);
        }

        return tomorrowReminder;
    }

    formatNextReminderTime() {
        const nextTime = this.getNextReminderTime();
        if (!nextTime) return null;

        const now = new Date();
        const diffMs = nextTime - now;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        const timeStr = nextTime.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        if (diffHours < 24) {
            if (diffHours > 0) {
                return `${timeStr}（${diffHours}小时${diffMinutes}分钟后）`;
            }
            return `${timeStr}（${diffMinutes}分钟后）`;
        }

        const dateStr = nextTime.toLocaleDateString('zh-CN', {
            month: 'long',
            day: 'numeric',
            weekday: 'short'
        });
        return `${dateStr} ${timeStr}`;
    }

    showNotification() {
        if (!this.hasPermission()) return;

        const notification = new Notification(this.settings.title, {
            body: this.settings.message,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌙</text></svg>',
            tag: 'braindump-reminder',
            renotify: true,
            silent: !this.settings.sound
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
        };

        eventBus.emit('reminder:shown', {
            title: this.settings.title,
            message: this.settings.message
        });
    }

    checkReminder() {
        if (!this.settings.enabled) return;
        if (!this.hasPermission()) return;
        if (!this.shouldTriggerToday()) return;

        const now = new Date();
        const todayStr = now.toDateString();
        
        if (this.lastReminderDate === todayStr) {
            return;
        }

        const [hours, minutes] = this.settings.time.split(':').map(Number);
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const targetMinutes = hours * 60 + minutes;

        if (currentMinutes >= targetMinutes && currentMinutes < targetMinutes + 5) {
            this.showNotification();
            this.lastReminderDate = todayStr;
            storage.set('lastReminderDate', todayStr);

            if (this.broadcastChannel) {
                this.broadcastChannel.postMessage({
                    type: 'reminder-triggered',
                    date: todayStr
                });
            }
        }
    }

    updateReminderCheck() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        if (this.settings.enabled && this.hasPermission()) {
            this.checkInterval = setInterval(() => this.checkReminder(), 30000);
            this.checkReminder();
        }
    }

    start() {
        this.updateReminderCheck();
    }

    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
}

const reminderService = new ReminderService();
export { reminderService };
