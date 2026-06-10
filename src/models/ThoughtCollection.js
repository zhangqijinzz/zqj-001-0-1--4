import { Thought } from './Thought.js?v=20260610';
import { storage } from '../core/Storage.js';
import { eventBus } from '../core/EventBus.js';
import { deepClone } from '../core/utils.js';

export class ThoughtCollection {
    constructor(storageKey = 'thoughts') {
        this.storageKey = storageKey;
        this.thoughts = [];
        this.load();
    }

    load() {
        const data = storage.get(this.storageKey, []);
        this.thoughts = data.map(item => Thought.fromJSON(this.migrateItem(item)));
        eventBus.emit('thoughts:loaded', this.thoughts);
        return this;
    }

    migrateItem(item) {
        if (!item.editHistory) {
            return {
                ...item,
                editHistory: [{
                    text: item.text,
                    timestamp: item.createdAt,
                    isOriginal: true
                }]
            };
        }
        return item;
    }

    save() {
        const data = this.thoughts.map(t => t.toJSON());
        storage.set(this.storageKey, data);
        eventBus.emit('thoughts:saved', this.thoughts);
        return this;
    }

    getAll() {
        return [...this.thoughts];
    }

    getById(id) {
        return this.thoughts.find(t => t.id === id);
    }

    add(text, category = 'todo') {
        const thought = new Thought({ text, category });
        this.thoughts.push(thought);
        this.save();
        eventBus.emit('thought:added', thought);
        return thought;
    }

    update(id, newText) {
        const thought = this.getById(id);
        if (!thought) return null;
        
        if (thought.updateText(newText)) {
            this.save();
            eventBus.emit('thought:updated', thought);
        }
        return thought;
    }

    remove(id) {
        const index = this.thoughts.findIndex(t => t.id === id);
        if (index === -1) return null;
        
        const removed = this.thoughts.splice(index, 1)[0];
        this.save();
        eventBus.emit('thought:removed', removed);
        return removed;
    }

    removeMany(ids) {
        const removed = [];
        ids.forEach(id => {
            const index = this.thoughts.findIndex(t => t.id === id);
            if (index !== -1) {
                removed.push(this.thoughts.splice(index, 1)[0]);
            }
        });
        if (removed.length > 0) {
            this.save();
            eventBus.emit('thoughts:removed', removed);
        }
        return removed;
    }

    updateCategoryMany(ids, newCategory) {
        const updated = [];
        ids.forEach(id => {
            const thought = this.getById(id);
            if (thought && thought.updateCategory(newCategory)) {
                updated.push(thought);
            }
        });
        if (updated.length > 0) {
            this.save();
            eventBus.emit('thoughts:categoryUpdated', { thoughts: updated, category: newCategory });
        }
        return updated;
    }

    filterByCategory(category) {
        return this.thoughts.filter(t => t.category === category);
    }

    getByCategories(categories) {
        return this.thoughts.filter(t => categories.includes(t.category));
    }

    count() {
        return this.thoughts.length;
    }

    toJSON() {
        return this.thoughts.map(t => t.toJSON());
    }

    fromJSON(data, replace = true) {
        const thoughts = data.map(item => Thought.fromJSON(item));
        if (replace) {
            this.thoughts = thoughts;
        } else {
            const existingIds = new Set(this.thoughts.map(t => t.id));
            const existingTextKeys = new Set(this.thoughts.map(t => 
                `${t.text.trim()}|${t.category}`
            ));
            thoughts.forEach(t => {
                if (!existingIds.has(t.id) && 
                    t.text.trim() && 
                    !existingTextKeys.has(`${t.text.trim()}|${t.category}`)) {
                    this.thoughts.push(t);
                }
            });
        }
        this.save();
        eventBus.emit('thoughts:imported', this.thoughts);
        return this;
    }

    getSnapshot() {
        return {
            thoughts: deepClone(this.toJSON())
        };
    }

    restoreSnapshot(snapshot) {
        this.thoughts = snapshot.thoughts.map(item => Thought.fromJSON(item));
        this.save();
        eventBus.emit('thoughts:restored', this.thoughts);
        return this;
    }
}
