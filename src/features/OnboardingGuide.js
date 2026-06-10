import { storage } from '../core/Storage.js';
import { eventBus } from '../core/EventBus.js';

class OnboardingGuide {
    constructor() {
        this.currentStep = 0;
        this.isActive = false;
        this.steps = [];
        this.overlay = null;
        this.tooltip = null;
        this.highlightBox = null;
        this.onCompleteCallback = null;
        this._resizeHandler = null;
        this._keydownHandler = null;
    }

    init() {
        this.buildSteps();
        this.createElements();
        this.bindGlobalEvents();
    }

    buildSteps() {
        this.steps = [
            {
                id: 'welcome',
                title: '👋 欢迎使用睡前脑内清仓机',
                description: '这是一个帮助你在睡前清空思绪、安心入睡的小工具。接下来我会用几个步骤带你了解如何使用它，你也可以随时跳过。',
                target: null,
                position: 'center',
                action: null
            },
            {
                id: 'jot-tab',
                title: '📝 第一步：记录思绪',
                description: '睡前脑子里有各种想法？先把它们都写下来！点击这个"念头速记"标签页开始记录。',
                target: '.tab-btn[data-tab="jot"]',
                position: 'bottom',
                action: () => this.switchToTab('jot')
            },
            {
                id: 'jot-input',
                title: '✍️ 快速记录想法',
                description: '在这里输入你的想法，然后选择下方的分类按钮提交。你也可以按回车键快速提交，使用上次选中的分类。',
                target: '#thoughtInput',
                position: 'bottom',
                action: () => this.switchToTab('jot')
            },
            {
                id: 'jot-categories',
                title: '🏷️ 四种分类方式',
                description: '想法可以分为四类：📋待办、💭担忧、💡灵感，或者直接丢给🌅"明天再说"。选一个类别，让大脑先放下它。',
                target: '.category-btns',
                position: 'top',
                action: () => this.switchToTab('jot')
            },
            {
                id: 'breathe-tab',
                title: '🌬️ 第二步：呼吸练习',
                description: '记录完思绪后，来做几组呼吸练习吧。跟随呼吸节奏，未处理的思绪会慢慢消散，帮助你情绪降噪。',
                target: '.tab-btn[data-tab="breathe"]',
                position: 'bottom',
                action: () => this.switchToTab('breathe')
            },
            {
                id: 'breathe-circle',
                title: '🧘 跟随呼吸节奏',
                description: '盯着这个圆圈，跟随它的扩张和收缩来呼吸。点击"开始呼吸练习"按钮，未处理的思绪会随着呼吸逐条淡出。',
                target: '#breatheCircle',
                position: 'right',
                action: () => this.switchToTab('breathe')
            },
            {
                id: 'tomorrow-tab',
                title: '📦 第三步：明日盒子',
                description: '那些标记为"明天再说"的事情，会自动汇总到这里。今天的你已经完成任务了，把它们交给明天的自己吧。',
                target: '.tab-btn[data-tab="tomorrow"]',
                position: 'bottom',
                action: () => this.switchToTab('tomorrow')
            },
            {
                id: 'ritual-tab',
                title: '🌙 第四步：入睡仪式',
                description: '最后，开启入睡仪式。选择你喜欢的白噪音，设置倒计时，让自己在柔和的氛围中慢慢进入梦乡。',
                target: '.tab-btn[data-tab="ritual"]',
                position: 'bottom',
                action: () => this.switchToTab('ritual')
            },
            {
                id: 'ritual-options',
                title: '🎵 选择助眠氛围',
                description: '选择雨声、海浪、森林或篝火等白噪音，配合倒计时，让身心慢慢放松下来，准备进入梦乡。',
                target: '.ritual-options',
                position: 'top',
                action: () => this.switchToTab('ritual')
            },
            {
                id: 'complete',
                title: '✨ 你已经准备好了',
                description: '记住推荐的使用顺序：先记录思绪 → 再做呼吸练习 → 最后开启入睡仪式。\n\n随时可以点击右上角的"使用引导"按钮重新查看此引导。现在，开始清空你的大脑吧！',
                target: null,
                position: 'center',
                action: null
            }
        ];

        this.filterAvailableSteps();
    }

    filterAvailableSteps() {
        this.steps = this.steps.filter(step => {
            if (!step.target) return true;
            const el = document.querySelector(step.target);
            return el !== null;
        });
    }

    createElements() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'onboarding-overlay';
        this.overlay.style.display = 'none';

        this.highlightBox = document.createElement('div');
        this.highlightBox.className = 'onboarding-highlight';
        this.overlay.appendChild(this.highlightBox);

        this.tooltip = document.createElement('div');
        this.tooltip.className = 'onboarding-tooltip';
        this.tooltip.innerHTML = `
            <div class="onboarding-tooltip-content">
                <button class="onboarding-close" title="关闭引导">✕</button>
                <h3 class="onboarding-title"></h3>
                <p class="onboarding-description"></p>
                <div class="onboarding-progress">
                    <span class="onboarding-step-info"></span>
                    <div class="onboarding-progress-bar">
                        <div class="onboarding-progress-fill"></div>
                    </div>
                </div>
                <div class="onboarding-actions">
                    <button class="onboarding-btn onboarding-later">稍后再看</button>
                    <button class="onboarding-btn onboarding-skip">跳过引导</button>
                    <div class="onboarding-nav-btns">
                        <button class="onboarding-btn onboarding-prev">上一步</button>
                        <button class="onboarding-btn onboarding-next primary">下一步</button>
                    </div>
                </div>
            </div>
        `;
        this.overlay.appendChild(this.tooltip);

        document.body.appendChild(this.overlay);

        this.tooltip.querySelector('.onboarding-close').addEventListener('click', () => this.skip());
        this.tooltip.querySelector('.onboarding-later').addEventListener('click', () => this.later());
        this.tooltip.querySelector('.onboarding-skip').addEventListener('click', () => this.skip());
        this.tooltip.querySelector('.onboarding-prev').addEventListener('click', () => this.prev());
        this.tooltip.querySelector('.onboarding-next').addEventListener('click', () => this.next());
    }

    bindGlobalEvents() {
        this._resizeHandler = () => {
            if (this.isActive) {
                const step = this.steps[this.currentStep];
                this.updateHighlight(step);
                this.positionTooltip(step);
            }
        };
        window.addEventListener('resize', this._resizeHandler);

        this._keydownHandler = (e) => {
            if (!this.isActive) return;
            
            if (e.key === 'Escape') {
                e.preventDefault();
                this.skip();
            } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
                e.preventDefault();
                this.next();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                this.prev();
            }
        };
        document.addEventListener('keydown', this._keydownHandler);
    }

    unbindGlobalEvents() {
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }
    }

    switchToTab(tabName) {
        eventBus.emit('onboarding:switchTab', tabName);
    }

    start(onComplete = null) {
        this.buildSteps();
        this.onCompleteCallback = onComplete;
        this.currentStep = 0;
        this.isActive = true;
        this.overlay.style.display = 'block';
        
        setTimeout(() => {
            this.overlay.classList.add('active');
            this.showStep(0);
        }, 10);

        eventBus.emit('onboarding:started');
    }

    showStep(index) {
        if (index < 0 || index >= this.steps.length) return;

        this.currentStep = index;
        const step = this.steps[index];

        if (step.action) {
            step.action();
        }

        setTimeout(() => {
            this.updateTooltipContent(step);
            this.updateHighlight(step);
            this.positionTooltip(step);
            this.updateNavButtons();
            this.updateProgress();
        }, step.action ? 350 : 0);
    }

    updateTooltipContent(step) {
        const titleEl = this.tooltip.querySelector('.onboarding-title');
        const descEl = this.tooltip.querySelector('.onboarding-description');
        
        titleEl.textContent = step.title;
        descEl.textContent = step.description;

        this.tooltip.classList.remove('position-top', 'position-bottom', 'position-left', 'position-right', 'position-center');
        this.tooltip.classList.add(`position-${step.position || 'center'}`);
    }

    updateHighlight(step) {
        if (!step.target || step.position === 'center' || step.target === null) {
            this.highlightBox.style.opacity = '0';
            return;
        }

        const targetEl = document.querySelector(step.target);
        if (!targetEl) {
            this.highlightBox.style.opacity = '0';
            return;
        }

        const rect = targetEl.getBoundingClientRect();
        const padding = 12;

        this.highlightBox.style.width = `${rect.width + padding * 2}px`;
        this.highlightBox.style.height = `${rect.height + padding * 2}px`;
        this.highlightBox.style.left = `${rect.left - padding}px`;
        this.highlightBox.style.top = `${rect.top - padding}px`;
        this.highlightBox.style.opacity = '1';
        this.highlightBox.style.borderRadius = this.getTargetBorderRadius(targetEl);
    }

    getTargetBorderRadius(targetEl) {
        const style = window.getComputedStyle(targetEl);
        const radius = style.borderRadius;
        if (radius && radius !== '0px') {
            const numericRadius = parseInt(radius);
            return `${numericRadius + 12}px`;
        }
        return '16px';
    }

    positionTooltip(step) {
        const tooltip = this.tooltip;
        const tooltipRect = tooltip.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        let left, top;

        if (step.position === 'center' || !step.target) {
            left = (windowWidth - tooltipRect.width) / 2;
            top = (windowHeight - tooltipRect.height) / 2;
        } else {
            const targetEl = document.querySelector(step.target);
            if (!targetEl) {
                left = (windowWidth - tooltipRect.width) / 2;
                top = (windowHeight - tooltipRect.height) / 2;
            } else {
                const rect = targetEl.getBoundingClientRect();

                switch (step.position) {
                    case 'bottom':
                        left = rect.left + rect.width / 2 - tooltipRect.width / 2;
                        top = rect.bottom + 20;
                        break;
                    case 'top':
                        left = rect.left + rect.width / 2 - tooltipRect.width / 2;
                        top = rect.top - tooltipRect.height - 20;
                        break;
                    case 'right':
                        left = rect.right + 20;
                        top = rect.top + rect.height / 2 - tooltipRect.height / 2;
                        break;
                    case 'left':
                        left = rect.left - tooltipRect.width - 20;
                        top = rect.top + rect.height / 2 - tooltipRect.height / 2;
                        break;
                    default:
                        left = rect.left + rect.width / 2 - tooltipRect.width / 2;
                        top = rect.bottom + 20;
                }

                const padding = 24;
                if (left < padding) left = padding;
                if (left + tooltipRect.width > windowWidth - padding) {
                    left = windowWidth - tooltipRect.width - padding;
                }
                if (top < padding) top = padding;
                if (top + tooltipRect.height > windowHeight - padding) {
                    top = rect.top - tooltipRect.height - 20;
                    if (top < padding) {
                        top = padding;
                    }
                }
            }
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    updateNavButtons() {
        const prevBtn = this.tooltip.querySelector('.onboarding-prev');
        const nextBtn = this.tooltip.querySelector('.onboarding-next');
        const skipBtn = this.tooltip.querySelector('.onboarding-skip');
        const laterBtn = this.tooltip.querySelector('.onboarding-later');
        const closeBtn = this.tooltip.querySelector('.onboarding-close');

        prevBtn.style.display = this.currentStep > 0 ? 'inline-block' : 'none';
        nextBtn.textContent = this.currentStep === this.steps.length - 1 ? '开始使用' : '下一步';
        
        if (this.currentStep === this.steps.length - 1) {
            skipBtn.style.display = 'none';
            laterBtn.style.display = 'none';
            closeBtn.style.display = 'none';
        } else {
            skipBtn.style.display = 'inline-block';
            laterBtn.style.display = 'inline-block';
            closeBtn.style.display = 'flex';
        }
    }

    updateProgress() {
        const stepInfo = this.tooltip.querySelector('.onboarding-step-info');
        const progressFill = this.tooltip.querySelector('.onboarding-progress-fill');
        
        const current = this.currentStep + 1;
        const total = this.steps.length;
        stepInfo.textContent = `${current} / ${total}`;
        
        const percent = (current / total) * 100;
        progressFill.style.width = `${percent}%`;
    }

    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.showStep(this.currentStep + 1);
        } else {
            this.complete();
        }
    }

    prev() {
        if (this.currentStep > 0) {
            this.showStep(this.currentStep - 1);
        }
    }

    later() {
        this.isActive = false;
        this.overlay.classList.remove('active');
        setTimeout(() => {
            this.overlay.style.display = 'none';
        }, 300);
        eventBus.emit('onboarding:later');
    }

    skip() {
        this.complete();
    }

    complete() {
        this.isActive = false;
        storage.set('onboardingCompleted', true);
        storage.set('onboardingCompletedAt', Date.now());
        
        this.overlay.classList.remove('active');
        setTimeout(() => {
            this.overlay.style.display = 'none';
        }, 300);

        if (this.onCompleteCallback) {
            this.onCompleteCallback();
        }

        eventBus.emit('onboarding:completed');
    }

    shouldShowOnboarding() {
        if (storage.get('onboardingCompleted', false)) {
            return false;
        }

        const allData = storage.getAll();
        const userDataKeys = ['thoughts', 'tomorrowItems', 'reminderSettings', 
                             'voiceGuideSettings', 'breathingMode', 'backupLastExport'];
        
        const hasUserData = userDataKeys.some(key => {
            const data = allData[key];
            if (Array.isArray(data)) {
                return data.length > 0;
            }
            if (typeof data === 'object' && data !== null) {
                return Object.keys(data).length > 0;
            }
            return data !== null && data !== undefined;
        });

        return !hasUserData;
    }

    reset() {
        storage.remove('onboardingCompleted');
        storage.remove('onboardingCompletedAt');
    }

    destroy() {
        this.unbindGlobalEvents();
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
    }
}

export const onboardingGuide = new OnboardingGuide();
