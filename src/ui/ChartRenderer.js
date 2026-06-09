export class ChartRenderer {
    constructor() {
        this.chartAnimFrames = {};
        this.tooltipEl = null;
        this._createTooltip();
    }

    _createTooltip() {
        if (this.tooltipEl) return;
        this.tooltipEl = document.createElement('div');
        this.tooltipEl.className = 'chart-tooltip';
        this.tooltipEl.style.cssText = `
            position: absolute;
            background: rgba(30, 30, 58, 0.95);
            border: 1px solid rgba(102, 126, 234, 0.4);
            border-radius: 8px;
            padding: 8px 12px;
            color: #ccd6f6;
            font-size: 0.82rem;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.15s ease;
            z-index: 100;
            white-space: nowrap;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            backdrop-filter: blur(8px);
        `;
        document.body.appendChild(this.tooltipEl);
    }

    _showTooltip(x, y, html) {
        if (!this.tooltipEl) return;
        this.tooltipEl.innerHTML = html;
        this.tooltipEl.style.opacity = '1';
        const rect = this.tooltipEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = x + 12;
        let top = y - 10;
        if (left + rect.width > vw - 10) left = x - rect.width - 12;
        if (top + rect.height > vh - 10) top = y - rect.height - 10;
        if (top < 10) top = 10;
        this.tooltipEl.style.left = left + 'px';
        this.tooltipEl.style.top = top + 'px';
    }

    _hideTooltip() {
        if (this.tooltipEl) {
            this.tooltipEl.style.opacity = '0';
        }
    }

    _cancelChartAnim(key) {
        if (this.chartAnimFrames[key]) {
            cancelAnimationFrame(this.chartAnimFrames[key]);
            this.chartAnimFrames[key] = null;
        }
    }

    _animateChart(key, drawFn, duration = 600) {
        this._cancelChartAnim(key);
        const start = performance.now();
        const animate = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            drawFn(eased);
            if (progress < 1) {
                this.chartAnimFrames[key] = requestAnimationFrame(animate);
            }
        };
        this.chartAnimFrames[key] = requestAnimationFrame(animate);
    }

    drawLineChart(canvas, data) {
        const width = canvas.parentElement.clientWidth;
        const height = canvas.parentElement.clientHeight;
        const padding = { top: 20, right: 20, bottom: 35, left: 40 };

        canvas.width = width * 2;
        canvas.height = height * 2;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        const maxValue = Math.max(...data.map(d => d.count), 1);
        const stepCount = data.length > 1 ? data.length - 1 : 1;

        const points = data.map((d, i) => ({
            x: padding.left + (chartWidth * i / stepCount),
            y: padding.top + chartHeight - (chartHeight * d.count / maxValue),
            count: d.count,
            date: d.date
        }));

        const draw = (progress) => {
            const ctx = canvas.getContext('2d');
            ctx.setTransform(2, 0, 0, 2, 0, 0);
            ctx.clearRect(0, 0, width, height);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const y = padding.top + (chartHeight * i / 4);
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.stroke();
            }

            ctx.fillStyle = '#8892b0';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'right';
            for (let i = 0; i <= 4; i++) {
                const value = Math.round(maxValue * (4 - i) / 4);
                const y = padding.top + (chartHeight * i / 4);
                ctx.fillText(value.toString(), padding.left - 8, y + 3);
            }

            if (points.length === 0) return;

            const visibleCount = Math.max(1, Math.ceil(points.length * progress));
            const visiblePoints = points.slice(0, visibleCount);

            const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
            gradient.addColorStop(0, 'rgba(102, 126, 234, 0.25)');
            gradient.addColorStop(1, 'rgba(102, 126, 234, 0)');

            ctx.beginPath();
            ctx.moveTo(visiblePoints[0].x, height - padding.bottom);
            ctx.lineTo(visiblePoints[0].x, visiblePoints[0].y);

            if (visiblePoints.length === 1) {
                ctx.lineTo(visiblePoints[0].x, height - padding.bottom);
            } else {
                for (let i = 1; i < visiblePoints.length; i++) {
                    const prev = visiblePoints[i - 1];
                    const curr = visiblePoints[i];
                    const cpx = (prev.x + curr.x) / 2;
                    ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
                }
                ctx.lineTo(visiblePoints[visiblePoints.length - 1].x, height - padding.bottom);
            }

            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();

            ctx.beginPath();
            ctx.strokeStyle = '#667eea';
            ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            ctx.moveTo(visiblePoints[0].x, visiblePoints[0].y);
            for (let i = 1; i < visiblePoints.length; i++) {
                const prev = visiblePoints[i - 1];
                const curr = visiblePoints[i];
                const cpx = (prev.x + curr.x) / 2;
                ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
            }
            ctx.stroke();

            visiblePoints.forEach((p, i) => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#667eea';
                ctx.fill();
                ctx.strokeStyle = '#1a1a2e';
                ctx.lineWidth = 2;
                ctx.stroke();

                if (p.count > 0 && progress >= 0.8) {
                    ctx.fillStyle = '#a8b2d1';
                    ctx.font = '9px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(p.count.toString(), p.x, p.y - 10);
                }
            });

            ctx.fillStyle = '#8892b0';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center';
            const labelStep = Math.ceil(data.length / 7);
            data.forEach((d, i) => {
                if (i % labelStep === 0 || i === data.length - 1) {
                    const x = padding.left + (chartWidth * i / stepCount);
                    const dateStr = `${d.date.getMonth() + 1}/${d.date.getDate()}`;
                    ctx.fillText(dateStr, x, height - padding.bottom + 15);
                }
            });
        };

        this._animateChart('trend', draw, 700);

        const tooltipData = points;
        canvas.onmousemove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            let closest = null;
            let minDist = Infinity;
            tooltipData.forEach(p => {
                const dist = Math.abs(p.x - mx);
                if (dist < minDist) {
                    minDist = dist;
                    closest = p;
                }
            });

            if (closest && minDist < 30) {
                const dateStr = `${closest.date.getMonth() + 1}月${closest.date.getDate()}日`;
                this._showTooltip(e.clientX, e.clientY,
                    `<div style="font-weight:500;margin-bottom:2px">${dateStr}</div><div style="color:#667eea">${closest.count} 条记录</div>`);
            } else {
                this._hideTooltip();
            }
        };
        canvas.onmouseleave = () => this._hideTooltip();
    }

    drawDonutChart(canvas, categories) {
        const size = Math.min(canvas.parentElement.clientWidth, canvas.parentElement.clientHeight);

        canvas.width = size * 2;
        canvas.height = size * 2;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';

        const centerX = size / 2;
        const centerY = size / 2;
        const outerRadius = size / 2 - 20;
        const innerRadius = outerRadius * 0.6;
        const gapAngle = 0.03;

        const data = Object.values(categories).filter(c => c.count > 0);
        const total = data.reduce((sum, c) => sum + c.count, 0);

        const draw = (progress) => {
            const ctx = canvas.getContext('2d');
            ctx.setTransform(2, 0, 0, 2, 0, 0);
            ctx.clearRect(0, 0, size, size);

            if (total === 0) {
                ctx.beginPath();
                ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
                ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2, true);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.fill();

                ctx.fillStyle = '#8892b0';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('暂无数据', centerX, centerY + 4);
                return;
            }

            const totalAngle = Math.PI * 2 * progress;
            let startAngle = -Math.PI / 2;

            data.forEach((category, idx) => {
                const sliceAngle = (category.count / total) * totalAngle;
                if (sliceAngle <= 0) return;

                const actualGap = data.length > 1 ? gapAngle : 0;
                const drawStart = startAngle + actualGap / 2;
                const drawEnd = startAngle + sliceAngle - actualGap / 2;

                if (drawEnd > drawStart) {
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, outerRadius, drawStart, drawEnd);
                    ctx.arc(centerX, centerY, innerRadius, drawEnd, drawStart, true);
                    ctx.closePath();

                    const glowGradient = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, outerRadius);
                    glowGradient.addColorStop(0, category.color + '40');
                    glowGradient.addColorStop(1, category.color + '10');
                    
                    ctx.fillStyle = glowGradient;
                    ctx.fill();

                    ctx.strokeStyle = category.color;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }

                startAngle += sliceAngle;
            });

            if (progress >= 0.9) {
                ctx.fillStyle = '#e6f1ff';
                ctx.font = 'bold 18px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(total.toString(), centerX, centerY - 2);
                
                ctx.fillStyle = '#8892b0';
                ctx.font = '10px sans-serif';
                ctx.fillText('总记录', centerX, centerY + 15);
            }
        };

        this._animateChart('donut', draw, 800);
    }

    drawBarChart(canvas, data, colors) {
        const width = canvas.parentElement.clientWidth;
        const height = canvas.parentElement.clientHeight;
        const padding = { top: 20, right: 20, bottom: 30, left: 40 };

        canvas.width = width * 2;
        canvas.height = height * 2;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        const maxValue = Math.max(...data.map(d => d.count), 1);
        const barWidth = (chartWidth / data.length) * 0.6;
        const gap = (chartWidth / data.length) * 0.4;

        const draw = (progress) => {
            const ctx = canvas.getContext('2d');
            ctx.setTransform(2, 0, 0, 2, 0, 0);
            ctx.clearRect(0, 0, width, height);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const y = padding.top + (chartHeight * i / 4);
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.stroke();
            }

            ctx.fillStyle = '#8892b0';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'right';
            for (let i = 0; i <= 4; i++) {
                const value = Math.round(maxValue * (4 - i) / 4);
                const y = padding.top + (chartHeight * i / 4);
                ctx.fillText(value.toString(), padding.left - 8, y + 3);
            }

            data.forEach((d, i) => {
                const x = padding.left + (chartWidth / data.length) * i + gap / 2;
                const barHeight = (chartHeight * d.count / maxValue) * progress;
                const y = padding.top + chartHeight - barHeight;
                const color = colors[i % colors.length];

                const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
                gradient.addColorStop(0, color);
                gradient.addColorStop(1, color + '80');

                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
                ctx.fill();

                ctx.fillStyle = '#8892b0';
                ctx.font = '9px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(d.label, x + barWidth / 2, height - padding.bottom + 12);
            });
        };

        this._animateChart('bar', draw, 600);
    }

    cleanup() {
        Object.keys(this.chartAnimFrames).forEach(key => {
            this._cancelChartAnim(key);
        });
        if (this.tooltipEl) {
            this.tooltipEl.remove();
            this.tooltipEl = null;
        }
    }
}

export const chartRenderer = new ChartRenderer();
