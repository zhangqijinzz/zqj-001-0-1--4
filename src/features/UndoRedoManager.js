import { eventBus } from '../core/EventBus.js';
import { deepClone } from '../core/utils.js';

export class UndoRedoManager {
    constructor(maxHistory = 20) {
        this.undoStack = [];
        this.redoStack = [];
        this.MAX_HISTORY = maxHistory;
        this.snapshotProviders = new Map();
    }

    registerProvider(name, provider) {
        this.snapshotProviders.set(name, provider);
    }

    takeSnapshot(description) {
        const snapshot = {
            description,
            timestamp: Date.now(),
            data: {}
        };
        
        this.snapshotProviders.forEach((provider, name) => {
            if (provider.getSnapshot) {
                snapshot.data[name] = deepClone(provider.getSnapshot());
            }
        });

        this.undoStack.push(snapshot);
        if (this.undoStack.length > this.MAX_HISTORY) {
            this.undoStack.shift();
        }
        this.redoStack = [];
        this.updateUI();
        eventBus.emit('history:snapshotTaken', { description, canUndo: this.canUndo(), canRedo: this.canRedo() });
    }

    undo() {
        if (!this.canUndo()) return;

        const currentSnapshot = this.createCurrentSnapshot(this.undoStack[this.undoStack.length - 1].description);
        this.redoStack.push(currentSnapshot);

        const previousState = this.undoStack.pop();
        this.restoreSnapshot(previousState);
        
        this.updateUI();
        eventBus.emit('history:undo', { 
            description: previousState.description, 
            canUndo: this.canUndo(), 
            canRedo: this.canRedo() 
        });
        return previousState;
    }

    redo() {
        if (!this.canRedo()) return;

        const currentSnapshot = this.createCurrentSnapshot(this.redoStack[this.redoStack.length - 1].description);
        this.undoStack.push(currentSnapshot);

        const nextState = this.redoStack.pop();
        this.restoreSnapshot(nextState);
        
        this.updateUI();
        eventBus.emit('history:redo', { 
            description: nextState.description, 
            canUndo: this.canUndo(), 
            canRedo: this.canRedo() 
        });
        return nextState;
    }

    createCurrentSnapshot(description) {
        const snapshot = {
            description,
            timestamp: Date.now(),
            data: {}
        };
        
        this.snapshotProviders.forEach((provider, name) => {
            if (provider.getSnapshot) {
                snapshot.data[name] = deepClone(provider.getSnapshot());
            }
        });
        
        return snapshot;
    }

    restoreSnapshot(snapshot) {
        Object.entries(snapshot.data).forEach(([name, data]) => {
            const provider = this.snapshotProviders.get(name);
            if (provider && provider.restoreSnapshot) {
                provider.restoreSnapshot(data);
            }
        });
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    getUndoStack() {
        return [...this.undoStack];
    }

    getRedoStack() {
        return [...this.redoStack];
    }

    getLastDescription() {
        if (this.undoStack.length > 0) {
            return this.undoStack[this.undoStack.length - 1].description;
        }
        return null;
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this.updateUI();
        eventBus.emit('history:cleared');
    }

    updateUI() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        const bar = document.getElementById('undoRedoBar');
        
        if (undoBtn) undoBtn.disabled = !this.canUndo();
        if (redoBtn) redoBtn.disabled = !this.canRedo();
        if (bar) {
            bar.classList.toggle('has-history', this.canUndo() || this.canRedo());
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            const isMod = e.ctrlKey || e.metaKey;
            if (isMod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            } else if (isMod && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) {
                e.preventDefault();
                this.redo();
            }
        });
    }

    setupButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        
        if (undoBtn) undoBtn.addEventListener('click', () => this.undo());
        if (redoBtn) redoBtn.addEventListener('click', () => this.redo());
    }

    init() {
        this.setupKeyboardShortcuts();
        this.setupButtons();
        this.updateUI();
    }
}

export const undoRedoManager = new UndoRedoManager(20);
