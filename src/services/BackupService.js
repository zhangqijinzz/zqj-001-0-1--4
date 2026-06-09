import { eventBus } from '../core/EventBus.js';
import { deepClone } from '../core/utils.js';

export class BackupService {
    constructor() {
        this.BACKUP_VERSION = 1;
        this.appName = '睡前脑内清仓机';
    }

    export(thoughts, tomorrowItems) {
        const hasData = thoughts.length > 0 || tomorrowItems.length > 0;
        if (!hasData) {
            eventBus.emit('backup:exportError', '暂无数据可导出');
            return null;
        }

        const backup = {
            version: this.BACKUP_VERSION,
            appName: this.appName,
            exportDate: new Date().toISOString(),
            data: {
                thoughts: deepClone(thoughts),
                tomorrowItems: deepClone(tomorrowItems)
            }
        };

        eventBus.emit('backup:exported', backup);
        return backup;
    }

    validate(backup) {
        if (!backup || typeof backup !== 'object') {
            throw new Error('INVALID_BACKUP');
        }
        if (typeof backup.version !== 'number' || backup.version < 1) {
            throw new Error('INVALID_BACKUP');
        }
        if (!backup.data || typeof backup.data !== 'object') {
            throw new Error('INVALID_BACKUP');
        }
        if (!Array.isArray(backup.data.thoughts) || !Array.isArray(backup.data.tomorrowItems)) {
            throw new Error('INVALID_BACKUP');
        }
        if (backup.version > this.BACKUP_VERSION) {
            throw new Error('INVALID_BACKUP');
        }
        return true;
    }

    migrate(backup) {
        let migrated = deepClone(backup);
        if (migrated.version < this.BACKUP_VERSION) {
            if (migrated.version === 1) {
                migrated.data.thoughts = migrated.data.thoughts.map(t => ({
                    id: t.id || this.generateId(),
                    text: t.text || '',
                    category: t.category || 'todo',
                    createdAt: t.createdAt || new Date().toISOString(),
                    editHistory: t.editHistory || [{
                        text: t.text,
                        timestamp: t.createdAt,
                        isOriginal: true
                    }]
                }));
                migrated.data.tomorrowItems = migrated.data.tomorrowItems.map(t => ({
                    id: t.id || this.generateId(),
                    text: t.text || '',
                    createdAt: t.createdAt || new Date().toISOString()
                }));
            }
            migrated.version = this.BACKUP_VERSION;
        }
        return migrated;
    }

    parseFile(file) {
        return new Promise((resolve, reject) => {
            if (!file.name.endsWith('.json')) {
                reject(new Error('请选择 .json 格式的备份文件'));
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const backup = JSON.parse(e.target.result);
                    this.validate(backup);
                    const migrated = this.migrate(backup);
                    resolve(migrated);
                } catch (err) {
                    if (err.message === 'INVALID_BACKUP') {
                        reject(new Error('备份文件格式无效'));
                    } else {
                        reject(new Error('文件解析失败，请检查文件格式'));
                    }
                }
            };
            reader.onerror = () => {
                reject(new Error('文件读取失败'));
            };
            reader.readAsText(file);
        });
    }

    merge(backup, currentThoughts, currentTomorrowItems) {
        const validThoughts = backup.data.thoughts.filter(t => t && typeof t.text === 'string');
        const validTomorrowItems = backup.data.tomorrowItems.filter(t => t && typeof t.text === 'string');

        const invalidCount = (backup.data.thoughts.length - validThoughts.length) + 
                             (backup.data.tomorrowItems.length - validTomorrowItems.length);

        const existingThoughtIds = new Set(currentThoughts.map(t => t.id));
        const existingTomorrowIds = new Set(currentTomorrowItems.map(t => t.id));

        const newThoughts = validThoughts.filter(t => !existingThoughtIds.has(t.id));
        const newTomorrowItems = validTomorrowItems.filter(t => !existingTomorrowIds.has(t.id));

        const textKeyThought = (t) => t.text.trim() + '|' + t.category;
        const textKeyTomorrow = (t) => t.text.trim();

        const existingTextKeysThought = new Set(currentThoughts.map(textKeyThought));
        const existingTextKeysTomorrow = new Set(currentTomorrowItems.map(textKeyTomorrow));

        const dedupedThoughts = newThoughts.filter(t => 
            t.text.trim() && !existingTextKeysThought.has(textKeyThought(t))
        );
        const dedupedTomorrowItems = newTomorrowItems.filter(t => 
            t.text.trim() && !existingTextKeysTomorrow.has(textKeyTomorrow(t))
        );

        const result = {
            thoughts: [...currentThoughts, ...dedupedThoughts],
            tomorrowItems: [...currentTomorrowItems, ...dedupedTomorrowItems],
            addedCount: dedupedThoughts.length + dedupedTomorrowItems.length,
            invalidCount
        };

        eventBus.emit('backup:merged', result);
        return result;
    }

    replace(backup) {
        const validThoughts = backup.data.thoughts.filter(t => t && typeof t.text === 'string');
        const validTomorrowItems = backup.data.tomorrowItems.filter(t => t && typeof t.text === 'string');

        const invalidCount = (backup.data.thoughts.length - validThoughts.length) + 
                             (backup.data.tomorrowItems.length - validTomorrowItems.length);

        const result = {
            thoughts: deepClone(validThoughts),
            tomorrowItems: deepClone(validTomorrowItems),
            totalCount: validThoughts.length + validTomorrowItems.length,
            invalidCount
        };

        eventBus.emit('backup:replaced', result);
        return result;
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    getFilename() {
        const dateStr = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-');
        return `睡前脑内清仓_备份_${dateStr}.json`;
    }
}

export const backupService = new BackupService();
