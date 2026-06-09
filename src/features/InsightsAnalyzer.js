import { eventBus } from '../core/EventBus.js';

export class InsightsAnalyzer {
    constructor() {
        this.currentTimeRange = 'week';
        this.customDateFrom = null;
        this.customDateTo = null;
        this.chartAnimFrames = {};
        this.tooltipEl = null;
        this.thoughts = [];
    }

    setThoughts(thoughts) {
        this.thoughts = thoughts;
    }

    setTimeRange(range) {
        this.currentTimeRange = range;
        eventBus.emit('insights:timeRangeChanged', range);
    }

    setCustomDateRange(from, to) {
        this.customDateFrom = from;
        this.customDateTo = to;
        eventBus.emit('insights:customDateChanged', { from, to });
    }

    getDateRange() {
        const now = new Date();
        let from = new Date();
        let to = new Date();

        switch (this.currentTimeRange) {
            case 'week':
                from.setDate(now.getDate() - 7);
                to = now;
                break;
            case 'month':
                from.setDate(now.getDate() - 30);
                to = now;
                break;
            case 'custom':
                if (this.customDateFrom && this.customDateTo) {
                    from = new Date(this.customDateFrom);
                    to = new Date(this.customDateTo);
                    to.setHours(23, 59, 59, 999);
                }
                break;
        }

        return { from, to };
    }

    getFilteredThoughts() {
        const { from, to } = this.getDateRange();
        return this.thoughts.filter(t => {
            const date = new Date(t.createdAt);
            return date >= from && date <= to;
        });
    }

    calculateStats() {
        const thoughts = this.getFilteredThoughts();
        const { from, to } = this.getDateRange();

        const totalEntries = thoughts.length;
        
        const dateSet = new Set();
        thoughts.forEach(t => {
            const date = new Date(t.createdAt).toDateString();
            dateSet.add(date);
        });
        const activeDays = dateSet.size;

        const daysDiff = Math.max(1, Math.ceil((to - from) / (1000 * 60 * 60 * 24)));
        const avgPerDay = (totalEntries / daysDiff).toFixed(1);

        const allDates = [...new Set(this.thoughts.map(t => new Date(t.createdAt).toDateString()))];
        allDates.sort((a, b) => new Date(b) - new Date(a));
        
        let streakDays = 0;
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        
        if (allDates.includes(today) || allDates.includes(yesterday)) {
            let checkDate = allDates.includes(today) ? new Date() : new Date(Date.now() - 86400000);
            while (allDates.includes(checkDate.toDateString())) {
                streakDays++;
                checkDate.setDate(checkDate.getDate() - 1);
            }
        }

        return { totalEntries, streakDays, activeDays, avgPerDay };
    }

    calculateTrendData() {
        const thoughts = this.getFilteredThoughts();
        const { from, to } = this.getDateRange();
        
        const dailyData = [];
        const currentDate = new Date(from);
        
        while (currentDate <= to) {
            const dateStr = currentDate.toDateString();
            const count = thoughts.filter(t => new Date(t.createdAt).toDateString() === dateStr).length;
            dailyData.push({
                date: new Date(currentDate),
                count
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return dailyData;
    }

    calculateCategoryData() {
        const thoughts = this.getFilteredThoughts();
        
        const categories = {
            todo: { count: 0, color: '#4ecdc4', label: '待办', icon: '📋' },
            worry: { count: 0, color: '#ff6b6b', label: '担忧', icon: '💭' },
            idea: { count: 0, color: '#ffd93d', label: '灵感', icon: '💡' }
        };

        thoughts.forEach(t => {
            if (categories[t.category]) {
                categories[t.category].count++;
            }
        });

        const total = thoughts.length;
        Object.keys(categories).forEach(key => {
            categories[key].percentage = total > 0 ? (categories[key].count / total * 100).toFixed(1) : 0;
        });

        return categories;
    }

    calculateTimeSlotData() {
        const thoughts = this.getFilteredThoughts();

        const slots = new Array(24).fill(0);
        thoughts.forEach(t => {
            const hour = new Date(t.createdAt).getHours();
            slots[hour]++;
        });

        return slots;
    }

    calculateTimePeriodData() {
        const thoughts = this.getFilteredThoughts();
        const periods = [
            { key: 'morning', label: '早晨', icon: '🌅', range: '6-12', color: '#ffd93d', hours: [6,7,8,9,10,11], count: 0 },
            { key: 'afternoon', label: '下午', icon: '☀️', range: '12-18', color: '#ff6b6b', hours: [12,13,14,15,16,17], count: 0 },
            { key: 'evening', label: '傍晚', icon: '🌆', range: '18-24', color: '#667eea', hours: [18,19,20,21,22,23], count: 0 },
            { key: 'night', label: '深夜', icon: '🌙', range: '0-6', color: '#764ba2', hours: [0,1,2,3,4,5], count: 0 }
        ];

        thoughts.forEach(t => {
            const hour = new Date(t.createdAt).getHours();
            for (const p of periods) {
                if (p.hours.includes(hour)) {
                    p.count++;
                    break;
                }
            }
        });

        return periods;
    }

    calculateWeekdayData() {
        const thoughts = this.getFilteredThoughts();
        
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const data = weekdays.map((label, index) => ({
            label,
            count: thoughts.filter(t => new Date(t.createdAt).getDay() === index).length
        }));

        return data;
    }

    calculateWordFrequency() {
        const thoughts = this.getFilteredThoughts();
        const wordCount = new Map();
        const stopWords = new Set(['的', '了', '是', '我', '有', '在', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这']);

        thoughts.forEach(t => {
            const text = t.text.replace(/[^\w\u4e00-\u9fa5\s]/g, ' ');
            const words = text.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]+/g) || [];
            
            words.forEach(word => {
                if (!stopWords.has(word.toLowerCase()) && word.length > 1) {
                    wordCount.set(word, (wordCount.get(word) || 0) + 1);
                }
            });
        });

        return [...wordCount.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30);
    }

    generateSuggestions() {
        const suggestions = [];
        const thoughts = this.getFilteredThoughts();
        const categories = this.calculateCategoryData();
        const timeSlots = this.calculateTimeSlotData();
        const periods = this.calculateTimePeriodData();
        const weekdayData = this.calculateWeekdayData();
        const stats = this.calculateStats();

        if (thoughts.length < 3) {
            suggestions.push({
                type: 'habit',
                icon: '🌱',
                text: '刚开始记录思绪，继续坚持就能看到更多洞察啦！试试每天睡前记录几条想法~'
            });
            return suggestions;
        }

        if (categories.worry.count > 0 && categories.worry.percentage > 30) {
            suggestions.push({
                type: 'worry',
                icon: '🧘',
                text: `近期<strong>担忧类</strong>条目占比<strong>${categories.worry.percentage}%</strong>，偏多一些。建议多做几次<strong>呼吸练习</strong>，让心情平静下来。`
            });
        }

        if (categories.idea.count > 0 && categories.idea.percentage > 40) {
            suggestions.push({
                type: 'idea',
                icon: '💡',
                text: `你最近有很多<strong>灵感</strong>迸发（占比${categories.idea.percentage}%）！这些都是宝贵的财富，建议定期整理灵感清单。`
            });
        }

        if (categories.todo.count > 0 && categories.todo.percentage > 50) {
            suggestions.push({
                type: 'todo',
                icon: '📋',
                text: `<strong>待办事项</strong>较多（占比${categories.todo.percentage}%），建议优先处理重要事项，适当使用<strong>明日盒子</strong>减轻心理负担。`
            });
        }

        if (categories.worry.count > 0 && categories.idea.count > 0) {
            const ratio = (categories.worry.count / categories.idea.count).toFixed(1);
            if (ratio > 2) {
                suggestions.push({
                    type: 'worry',
                    icon: '⚖️',
                    text: `担忧与灵感的比例约为<strong>${ratio}:1</strong>，担忧明显偏多。试着把一些担忧转化为待办行动，或者用<strong>呼吸练习</strong>释放压力。`
                });
            } else if (ratio < 0.5) {
                suggestions.push({
                    type: 'idea',
                    icon: '✨',
                    text: `灵感远多于担忧，你正处于<strong>创造力旺盛</strong>的阶段！这是记录和实现想法的最佳时机。`
                });
            }
        }

        const nightCount = timeSlots.slice(22).reduce((a, b) => a + b, 0) + timeSlots.slice(0, 5).reduce((a, b) => a + b, 0);
        const nightPercentage = thoughts.length > 0 ? (nightCount / thoughts.length * 100).toFixed(1) : 0;
        if (nightPercentage > 40) {
            suggestions.push({
                type: 'habit',
                icon: '🌙',
                text: `你在<strong>深夜时段</strong>记录较多（占比${nightPercentage}%）。睡前思绪丰富是正常的，但也要注意保证充足睡眠哦~`
            });
        }

        const morningCount = timeSlots.slice(6, 12).reduce((a, b) => a + b, 0);
        const morningPercentage = thoughts.length > 0 ? (morningCount / thoughts.length * 100).toFixed(1) : 0;
        if (morningPercentage > 35) {
            suggestions.push({
                type: 'habit',
                icon: '🌅',
                text: `你习惯在<strong>早晨</strong>记录思绪（占比${morningPercentage}%），这是个很棒的习惯！清晨的思维最清晰。`
            });
        }

        const eveningCount = timeSlots.slice(18, 24).reduce((a, b) => a + b, 0);
        const eveningPercentage = thoughts.length > 0 ? (eveningCount / thoughts.length * 100).toFixed(1) : 0;
        if (eveningPercentage > 50) {
            suggestions.push({
                type: 'habit',
                icon: '🌆',
                text: `你大部分思绪记录在<strong>傍晚到深夜</strong>（占比${eveningPercentage}%）。这是大脑最活跃的时段，建议在睡前一小时完成记录，然后开启<strong>入睡仪式</strong>。`
            });
        }

        const maxWeekday = weekdayData.reduce((max, d) => d.count > max.count ? d : max, weekdayData[0]);
        const minWeekday = weekdayData.reduce((min, d) => d.count < min.count ? d : min, weekdayData[0]);
        if (maxWeekday.count > 0 && minWeekday.count >= 0 && maxWeekday.count > minWeekday.count * 2) {
            suggestions.push({
                type: 'habit',
                icon: '📅',
                text: `你在<strong>周${maxWeekday.label}</strong>记录最多（${maxWeekday.count}条），而周${minWeekday.label}最少。了解自己的节奏有助于合理安排~`
            });
        }

        const activePeriod = periods.reduce((max, p) => p.count > max.count ? p : max, periods[0]);
        if (activePeriod.count > 0 && thoughts.length >= 5) {
            suggestions.push({
                type: 'habit',
                icon: activePeriod.icon,
                text: `你最活跃的时段是<strong>${activePeriod.label}（${activePeriod.range}时）</strong>，共${activePeriod.count}条记录。`
            });
        }

        if (stats.streakDays >= 7) {
            suggestions.push({
                type: 'habit',
                icon: '🏆',
                text: `太厉害了！你已经<strong>连续记录${stats.streakDays}天</strong>了！坚持记录是了解自己的最佳方式，继续加油~`
            });
        } else if (stats.streakDays >= 3) {
            suggestions.push({
                type: 'habit',
                icon: '🔥',
                text: `已经连续记录<strong>${stats.streakDays}天</strong>了，保持这个势头！连续7天就能解锁成就哦~`
            });
        }

        if (stats.totalEntries > 0) {
            const avgStr = stats.avgPerDay;
            if (parseFloat(avgStr) >= 3) {
                suggestions.push({
                    type: 'habit',
                    icon: '📝',
                    text: `日均记录<strong>${avgStr}条</strong>，你是一个善于反思的人！记得适时清空大脑，用<strong>呼吸练习</strong>放松~`
                });
            }
        }

        return suggestions;
    }

    getAllData() {
        return {
            stats: this.calculateStats(),
            trendData: this.calculateTrendData(),
            categoryData: this.calculateCategoryData(),
            timeSlotData: this.calculateTimeSlotData(),
            timePeriodData: this.calculateTimePeriodData(),
            weekdayData: this.calculateWeekdayData(),
            wordFrequency: this.calculateWordFrequency(),
            suggestions: this.generateSuggestions()
        };
    }
}

export const insightsAnalyzer = new InsightsAnalyzer();
