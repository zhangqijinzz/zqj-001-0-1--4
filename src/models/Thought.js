import { generateId } from '../core/utils.js';

export class Thought {
    constructor(data = {}) {
        this.id = data.id || generateId();
        this.text = data.text || '';
        this.category = data.category || 'todo';
        this.createdAt = data.createdAt || new Date().toISOString();
        this.editHistory = data.editHistory || [{
            text: this.text,
            timestamp: this.createdAt,
            isOriginal: true
        }];
    }

    updateText(newText) {
        if (newText === this.text) return false;
        
        this.text = newText;
        this.editHistory.push({
            text: newText,
            timestamp: new Date().toISOString(),
            isOriginal: false
        });
        return true;
    }

    getEditHistory() {
        return [...this.editHistory];
    }

    hasHistory() {
        return this.editHistory.length > 1;
    }

    toJSON() {
        return {
            id: this.id,
            text: this.text,
            category: this.category,
            createdAt: this.createdAt,
            editHistory: this.editHistory
        };
    }

    static fromJSON(json) {
        return new Thought(json);
    }
}
