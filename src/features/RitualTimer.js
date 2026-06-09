import { eventBus } from '../core/EventBus.js';
import { audioService } from '../services/AudioService.js';

export class RitualTimer {
    constructor() {
        this.timer = null;
        this.isRunning = false;
        this.totalSeconds = 0;
        this.remainingSeconds = 0;
        this.selectedNoise = null;
    }

    setNoise(type) {
        this.selectedNoise = type;
        eventBus.emit('ritual:noiseSelected', type);
    }

    getNoise() {
        return this.selectedNoise;
    }

    start(minutes, noiseType = null) {
        if (noiseType) {
            this.selectedNoise = noiseType;
        }

        this.isRunning = true;
        this.totalSeconds = minutes * 60;
        this.remainingSeconds = this.totalSeconds;

        eventBus.emit('ritual:started', { 
            minutes, 
            noise: this.selectedNoise 
        });

        if (this.selectedNoise) {
            audioService.startAmbientSound(this.selectedNoise);
        }

        if (minutes > 0) {
            this.startCountdown();
        } else {
            eventBus.emit('ritual:timerUpdate', { minutes: '--', seconds: '--' });
        }
    }

    startCountdown() {
        this.updateDisplay();

        this.timer = setInterval(() => {
            this.remainingSeconds--;
            this.updateDisplay();

            if (this.remainingSeconds <= 0) {
                this.complete();
            }
        }, 1000);
    }

    updateDisplay() {
        const mins = Math.floor(this.remainingSeconds / 60);
        const secs = this.remainingSeconds % 60;
        eventBus.emit('ritual:timerUpdate', { 
            minutes: mins.toString().padStart(2, '0'), 
            seconds: secs.toString().padStart(2, '0') 
        });
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.isRunning = false;
        audioService.stopAmbientSound();

        eventBus.emit('ritual:stopped');
    }

    complete() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.isRunning = false;
        audioService.fadeOutAmbientSound(8);

        eventBus.emit('ritual:completed');
        this.showFadeScreen();
    }

    showFadeScreen() {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #0a0a15 0%, #000 100%);
            opacity: 0;
            z-index: 9999;
            transition: opacity 10s ease;
            pointer-events: auto;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        `;
        overlay.innerHTML = '<span style="opacity: 0; transition: opacity 3s ease; color: #b0b8c8; font-size: 2rem; text-align: center; line-height: 1.8;">晚安 💤<br><span style="font-size: 1rem; color: #7a8599;">点击屏幕可关闭</span></span>';
        document.body.appendChild(overlay);
        
        setTimeout(() => {
            overlay.style.opacity = '1';
        }, 100);

        setTimeout(() => {
            overlay.querySelector('span').style.opacity = '1';
        }, 10000);
        
        overlay.addEventListener('click', () => {
            audioService.stopAmbientSound();
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 1000);
        });
    }

    isActive() {
        return this.isRunning;
    }

    getRemainingTime() {
        return this.remainingSeconds;
    }

    getNoiseHint() {
        const hints = {
            rain: '🌧️ 听着雨声，让思绪慢慢沉淀...',
            ocean: '🌊 海浪轻轻拍打着岸边，心也随之平静...',
            forest: '🌲 森林里的风声，让一切都慢下来...',
            fire: '🔥 篝火噼啪作响，温暖而安心...'
        };
        return this.selectedNoise 
            ? hints[this.selectedNoise] 
            : '🌙 夜色温柔，好梦将至';
    }
}

export const ritualTimer = new RitualTimer();
