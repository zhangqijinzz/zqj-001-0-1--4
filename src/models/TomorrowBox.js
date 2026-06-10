import { generateId, deepClone } from '../core/utils.js';
import { storage } from '../core/Storage.js';
import { eventBus } from '../core/EventBus.js';

export class TomorrowBox {
    constructor(storageKey = 'tomorrowItems') {
        this.storageKey = storageKey;
        this.items = [];
        this.load();
    }

    load() {
        this.items = storage.get(this.storageKey, []);
        eventBus.emit('tomorrow:loaded', this.items);
        return this;
    }

    save() {
        storage.set(this.storageKey, this.items);
        eventBus.emit('tomorrow:saved', this.items);
        return this;
    }

    getAll() {
        return [...this.items];
    }

    add(text) {
        const item = {
            id: generateId(),
            text,
            createdAt: new Date().toISOString()
        };
        this.items.push(item);
        this.save();
        eventBus.emit('tomorrow:added', item);
        return item;
    }

    addMany(texts) {
        const items = texts.map(text => ({
            id: generateId(),
            text,
            createdAt: new Date().toISOString()
        }));
        this.items.push(...items);
        this.save();
        eventBus.emit('tomorrow:addedMany', items);
        return items;
    }

    remove(id) {
        const index = this.items.findIndex(t => t.id === id);
        if (index === -1) return null;
        
        const removed = this.items.splice(index, 1)[0];
        this.save();
        eventBus.emit('tomorrow:removed', removed);
        return removed;
    }

    clear() {
        const removed = [...this.items];
        this.items = [];
        this.save();
        eventBus.emit('tomorrow:cleared', removed);
        return removed;
    }

    count() {
        return this.items.length;
    }

    exportText() {
        return this.items.map((item, i) => `${i + 1}. ${item.text}`).join('\n');
    }

    toJSON() {
        return [...this.items];
    }

    fromJSON(data, replace = true) {
        if (replace) {
            this.items = data;
        } else {
            const existingIds = new Set(this.items.map(t => t.id));
            const existingTexts = new Set(this.items.map(t => t.text.trim()));
            data.forEach(item => {
                if (!existingIds.has(item.id) && 
                    item.text.trim() && 
                    !existingTexts.has(item.text.trim())) {
                    this.items.push(item);
                }
            });
        }
        this.save();
        eventBus.emit('tomorrow:imported', this.items);
        return this;
    }

    getSnapshot() {
        return {
            tomorrowItems: deepClone(this.items)
        };
    }

    restoreSnapshot(snapshot) {
        this.items = deepClone(snapshot.tomorrowItems || []);
        this.save();
        eventBus.emit('tomorrow:restored', this.items);
        return this;
    }
}
