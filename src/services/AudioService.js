import { eventBus } from '../core/EventBus.js';

export class AudioService {
    constructor() {
        this.audioContext = null;
        this.activeNodes = [];
        this.masterGain = null;
        this.fadeOutTimer = null;
        this.currentNoise = null;
        this.volume = 0.5;
    }

    initAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        return this.audioContext;
    }

    createNoiseBuffer(duration, type) {
        const ctx = this.audioContext;
        const sampleRate = ctx.sampleRate;
        const length = sampleRate * duration;
        const buffer = ctx.createBuffer(2, length, sampleRate);
        const fadeSamples = Math.floor(sampleRate * 0.05);

        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            if (type === 'white') {
                for (let i = 0; i < length; i++) {
                    data[i] = Math.random() * 2 - 1;
                }
            } else if (type === 'pink') {
                let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
                for (let i = 0; i < length; i++) {
                    const w = Math.random() * 2 - 1;
                    b0 = 0.99886 * b0 + w * 0.0555179;
                    b1 = 0.99332 * b1 + w * 0.0750759;
                    b2 = 0.96900 * b2 + w * 0.1538520;
                    b3 = 0.86650 * b3 + w * 0.3104856;
                    b4 = 0.55000 * b4 + w * 0.5329522;
                    b5 = -0.7616 * b5 - w * 0.0168980;
                    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
                    b6 = w * 0.115926;
                }
            } else if (type === 'brown') {
                let last = 0;
                for (let i = 0; i < length; i++) {
                    const w = Math.random() * 2 - 1;
                    data[i] = (last + 0.02 * w) / 1.02;
                    last = data[i];
                    data[i] *= 3.5;
                }
            }

            for (let i = 0; i < fadeSamples; i++) {
                const f = i / fadeSamples;
                data[i] *= f;
                data[length - 1 - i] *= f;
            }
        }
        return buffer;
    }

    createCrackleBuffer(duration, density) {
        const ctx = this.audioContext;
        const sampleRate = ctx.sampleRate;
        const length = sampleRate * duration;
        const buffer = ctx.createBuffer(2, length, sampleRate);
        const fadeSamples = Math.floor(sampleRate * 0.05);

        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            let i = 0;
            while (i < length) {
                if (Math.random() < density) {
                    const burstLen = Math.floor(sampleRate * (0.001 + Math.random() * 0.003));
                    const amp = 0.3 + Math.random() * 0.7;
                    for (let j = 0; j < burstLen && (i + j) < length; j++) {
                        const env = Math.exp(-j / (burstLen * 0.3));
                        data[i + j] = (Math.random() * 2 - 1) * amp * env;
                    }
                    i += burstLen;
                } else {
                    data[i] = 0;
                    i++;
                }
            }

            for (let i = 0; i < fadeSamples; i++) {
                const f = i / fadeSamples;
                data[i] *= f;
                data[length - 1 - i] *= f;
            }
        }
        return buffer;
    }

    createChirpBuffer(duration) {
        const ctx = this.audioContext;
        const sampleRate = ctx.sampleRate;
        const length = sampleRate * duration;
        const buffer = ctx.createBuffer(2, length, sampleRate);
        const fadeSamples = Math.floor(sampleRate * 0.05);

        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            let i = 0;
            while (i < length) {
                const gap = Math.floor(sampleRate * (0.8 + Math.random() * 2.5));
                i += gap;
                if (i >= length) break;

                const baseFreq = 2200 + Math.random() * 2000;
                const freqRange = 400 + Math.random() * 800;
                const numNotes = 2 + Math.floor(Math.random() * 3);
                const noteLen = Math.floor(sampleRate * (0.04 + Math.random() * 0.06));

                for (let n = 0; n < numNotes && i < length; n++) {
                    for (let j = 0; j < noteLen && (i + j) < length; j++) {
                        const t = j / sampleRate;
                        const freq = baseFreq + freqRange * j / noteLen;
                        const env = Math.sin(Math.PI * j / noteLen);
                        data[i + j] += Math.sin(2 * Math.PI * freq * t) * env * 0.25;
                    }
                    i += noteLen + Math.floor(sampleRate * 0.02);
                }
            }

            for (let i = 0; i < fadeSamples; i++) {
                const f = i / fadeSamples;
                data[i] *= f;
                data[length - 1 - i] *= f;
            }
        }
        return buffer;
    }

    startAmbientSound(type) {
        this.stopAmbientSound();
        this.currentNoise = type;

        const ctx = this.initAudioContext();
        this.masterGain = ctx.createGain();
        this.masterGain.gain.value = this.volume;
        this.masterGain.connect(ctx.destination);

        const whiteBuf = this.createNoiseBuffer(4, 'white');
        const pinkBuf = this.createNoiseBuffer(4, 'pink');
        const brownBuf = this.createNoiseBuffer(4, 'brown');

        switch (type) {
            case 'rain': this.buildRain(ctx, whiteBuf, pinkBuf); break;
            case 'ocean': this.buildOcean(ctx, pinkBuf, whiteBuf); break;
            case 'forest': this.buildForest(ctx, pinkBuf); break;
            case 'fire': this.buildFire(ctx, brownBuf, whiteBuf); break;
        }

        eventBus.emit('audio:started', type);
    }

    buildRain(ctx, whiteBuf, pinkBuf) {
        const n1 = ctx.createBufferSource();
        n1.buffer = whiteBuf; n1.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 0.5;
        const g1 = ctx.createGain(); g1.gain.value = 0.25;
        n1.connect(bp); bp.connect(g1); g1.connect(this.masterGain);

        const n2 = ctx.createBufferSource();
        n2.buffer = pinkBuf; n2.loop = true;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 400;
        const g2 = ctx.createGain(); g2.gain.value = 0.1;
        n2.connect(lp); lp.connect(g2); g2.connect(this.masterGain);

        const crackle = this.createCrackleBuffer(8, 0.003);
        const n3 = ctx.createBufferSource();
        n3.buffer = crackle; n3.loop = true;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 2000;
        const g3 = ctx.createGain(); g3.gain.value = 0.08;
        n3.connect(hp); hp.connect(g3); g3.connect(this.masterGain);

        n1.start(); n2.start(); n3.start();
        this.activeNodes = [n1, n2, n3];
    }

    buildOcean(ctx, pinkBuf, whiteBuf) {
        const n1 = ctx.createBufferSource();
        n1.buffer = pinkBuf; n1.loop = true;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 800;
        const g1 = ctx.createGain(); g1.gain.value = 0.18;

        const lfo = ctx.createOscillator();
        lfo.type = 'sine'; lfo.frequency.value = 0.08;
        const lfoG = ctx.createGain(); lfoG.gain.value = 0.14;
        lfo.connect(lfoG); lfoG.connect(g1.gain);

        n1.connect(lp); lp.connect(g1); g1.connect(this.masterGain);

        const n2 = ctx.createBufferSource();
        n2.buffer = whiteBuf; n2.loop = true;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 3000;
        const lp2 = ctx.createBiquadFilter();
        lp2.type = 'lowpass'; lp2.frequency.value = 6000;
        const g2 = ctx.createGain(); g2.gain.value = 0.05;

        const lfo2 = ctx.createOscillator();
        lfo2.type = 'sine'; lfo2.frequency.value = 0.08;
        const lfoG2 = ctx.createGain(); lfoG2.gain.value = 0.04;
        lfo2.connect(lfoG2); lfoG2.connect(g2.gain);

        n2.connect(hp); hp.connect(lp2); lp2.connect(g2); g2.connect(this.masterGain);

        n1.start(); n2.start(); lfo.start(); lfo2.start();
        this.activeNodes = [n1, n2, lfo, lfo2];
    }

    buildForest(ctx, pinkBuf) {
        const n1 = ctx.createBufferSource();
        n1.buffer = pinkBuf; n1.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.3;
        const g1 = ctx.createGain(); g1.gain.value = 0.08;

        const lfo = ctx.createOscillator();
        lfo.type = 'sine'; lfo.frequency.value = 0.05;
        const lfoG = ctx.createGain(); lfoG.gain.value = 0.04;
        lfo.connect(lfoG); lfoG.connect(g1.gain);

        n1.connect(bp); bp.connect(g1); g1.connect(this.masterGain);

        const cr1 = ctx.createOscillator();
        cr1.type = 'sine'; cr1.frequency.value = 4200;
        const cg1 = ctx.createGain(); cg1.gain.value = 0.02;
        const am1 = ctx.createOscillator();
        am1.type = 'square'; am1.frequency.value = 6;
        const amG1 = ctx.createGain(); amG1.gain.value = 0.015;
        am1.connect(amG1); amG1.connect(cg1.gain);
        cr1.connect(cg1); cg1.connect(this.masterGain);

        const cr2 = ctx.createOscillator();
        cr2.type = 'sine'; cr2.frequency.value = 3800;
        const cg2 = ctx.createGain(); cg2.gain.value = 0.015;
        const am2 = ctx.createOscillator();
        am2.type = 'square'; am2.frequency.value = 5;
        const amG2 = ctx.createGain(); amG2.gain.value = 0.012;
        am2.connect(amG2); amG2.connect(cg2.gain);
        cr2.connect(cg2); cg2.connect(this.masterGain);

        const chirpBuf = this.createChirpBuffer(6);
        const chirp = ctx.createBufferSource();
        chirp.buffer = chirpBuf; chirp.loop = true;
        const cg3 = ctx.createGain(); cg3.gain.value = 0.06;
        chirp.connect(cg3); cg3.connect(this.masterGain);

        n1.start(); lfo.start();
        cr1.start(); am1.start();
        cr2.start(); am2.start();
        chirp.start();
        this.activeNodes = [n1, lfo, cr1, am1, cr2, am2, chirp];
    }

    buildFire(ctx, brownBuf, whiteBuf) {
        const n1 = ctx.createBufferSource();
        n1.buffer = brownBuf; n1.loop = true;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 200;
        const g1 = ctx.createGain(); g1.gain.value = 0.2;
        n1.connect(lp); lp.connect(g1); g1.connect(this.masterGain);

        const crackle = this.createCrackleBuffer(6, 0.005);
        const n2 = ctx.createBufferSource();
        n2.buffer = crackle; n2.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.8;
        const g2 = ctx.createGain(); g2.gain.value = 0.15;
        n2.connect(bp); bp.connect(g2); g2.connect(this.masterGain);

        const n3 = ctx.createBufferSource();
        n3.buffer = whiteBuf; n3.loop = true;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 4000;
        const g3 = ctx.createGain(); g3.gain.value = 0.02;
        n3.connect(hp); hp.connect(g3); g3.connect(this.masterGain);

        n1.start(); n2.start(); n3.start();
        this.activeNodes = [n1, n2, n3];
    }

    stopAmbientSound() {
        if (this.fadeOutTimer) {
            clearTimeout(this.fadeOutTimer);
            this.fadeOutTimer = null;
        }

        this.activeNodes.forEach(node => {
            try { node.stop(); } catch (e) {}
        });
        this.activeNodes = [];
        if (this.masterGain) {
            try { this.masterGain.disconnect(); } catch (e) {}
            this.masterGain = null;
        }
        
        if (this.currentNoise) {
            eventBus.emit('audio:stopped', this.currentNoise);
            this.currentNoise = null;
        }
    }

    fadeOutAmbientSound(duration, callback) {
        if (this.fadeOutTimer) {
            clearTimeout(this.fadeOutTimer);
            this.fadeOutTimer = null;
        }

        if (this.masterGain && this.audioContext) {
            const ctx = this.audioContext;
            const now = ctx.currentTime;
            this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
            this.masterGain.gain.linearRampToValueAtTime(0, now + duration);
            this.fadeOutTimer = setTimeout(() => {
                this.stopAmbientSound();
                if (callback) callback();
            }, duration * 1000);
        } else {
            this.stopAmbientSound();
            if (callback) callback();
        }
    }

    setVolume(value) {
        this.volume = value;
        if (this.masterGain) {
            this.masterGain.gain.value = value;
        }
        eventBus.emit('audio:volumeChanged', value);
    }

    getCurrentNoise() {
        return this.currentNoise;
    }

    isPlaying() {
        return this.activeNodes.length > 0;
    }
}

export const audioService = new AudioService();
