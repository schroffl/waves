import { map } from './util';
import GUI from 'lil-gui';

type Point = {
    y: number;
    new_y: number;
    uy: number,
    fixed: boolean,
};

type Config = {
    c: number;
    damping: number,
    frequency: number,
    phase: number,
    amplitude: number,
};

export function setupOneDimensional(element: HTMLElement) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.lineCap = 'round';

    element.appendChild(canvas);

    const points = new Array<Point>(100).fill(undefined).map(_ => {
        return {
            y: 0,
            uy: 0,
            new_y: 0,
            fixed: false,
        };
    });

    const padding = 32;

    const config: Config = {
        c: 0.9,
        damping: 0.05,
        frequency: 1,
        phase: 0,
        amplitude: 1,
    };

    const mouse = {
        x: 0,
        y: 0,
        id: -1,
        down: false,
    };

    const gui = new GUI({ container: element });
    gui.add(config, 'c', 0.0, 1).name('Wave velocity');
    gui.add(config, 'damping', 0.001, 0.1).name('Damping');

    const folder = gui.addFolder('Oscillator');
    folder.add(config, 'amplitude', 0, 1).name('Amplitude');
    folder.add(config, 'frequency', 0, 5).name('Frequency');
    folder.add(config, 'phase', 0, Math.PI * 2).name('Phase');

    function step(dt: number, final: boolean = true) {
        // points[0].y = 0;
        // points[points.length - 1].y = 0;

        for (let i = 1; i < points.length - 1; i++) {
            const p = points[i];

            const left = points[i - 1];
            const right = points[i + 1];

            const d2x = 1000 / 1000;
            const d2y = (left.y - 2 * p.y + right.y) / Math.pow(d2x, 2);
            const ay = (config.c * config.c * d2y) - config.damping * p.uy;

            if (!p.fixed) {
                p.uy += dt * ay;
                p.new_y = p.y + dt * p.uy;
            } else {
                p.new_y = p.y;
            }
        }

        for (let i = 0; i < points.length; i++) {
            if (!points[i].fixed) {
                points[i].y = points[i].new_y;
                points[i].new_y = 0;
            }

            if (final) {
                points[i].fixed = false;
            }
        }
    }

    const obs = new ResizeObserver(info => {
        const rect = info[0].contentRect;

        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
    });

    obs.observe(canvas);

    let last_t = 0;

    function render(t: number) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const ticks = { y: 4, x: 10 };
        const tick_padding = 0;

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#F4F2DEbb';

        for (let i = 1; i < ticks.y; i++) {
            const t = map(i, 0, ticks.y, canvas.height, 0);

            ctx.beginPath();
            ctx.moveTo(tick_padding, t);
            ctx.lineTo(canvas.width - tick_padding, t);
            ctx.stroke();
        }

        for (let i = 1; i < ticks.x; i++) {
            const t = map(i, 0, ticks.x, canvas.width, 0);

            ctx.beginPath();
            ctx.moveTo(t, tick_padding);
            ctx.lineTo(t, canvas.height - tick_padding);
            ctx.stroke();
        }

        ctx.beginPath();

        const osc = points[0];
        osc.y = Math.sin(t / 1000 * Math.PI * 2 * config.frequency + config.phase) * config.amplitude;
        osc.new_y = points[0].y;
        osc.fixed = true;

        if (mouse.down) {
            const unclamped_idx = Math.floor(map(mouse.x, padding, canvas.offsetWidth - padding, 0, points.length - 1));
            const idx = Math.max(0, Math.min(unclamped_idx, points.length - 1));

            const y = map(mouse.y, canvas.offsetHeight, 0, -1, 1);
            points[idx].y = y;
            points[idx].fixed = true;
        }

        if (last_t == 0) {
            last_t = t;
        }

        step(1);

        // step((t - last_t) * 0.1);
        last_t = t;

        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const x = map(i, 0, points.length - 1, padding, canvas.width - padding);
            const y = map(point.y, -1, 1, canvas.height, 0);

            if (i == 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.strokeStyle = '#7C9D96';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 6;
        ctx.stroke();

        const lambda = (config.c / config.frequency).toFixed(5);
        ctx.fillStyle = '#00000099';
        ctx.font = '16px sans-serif';
        ctx.fillText(`λ = ${lambda}`, padding, padding);

        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);

    canvas.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        mouse.id = e.pointerId;
        mouse.x = e.offsetX;
        mouse.y = e.offsetY;
        mouse.down = true;
    });

    canvas.addEventListener('pointerup', e => {
        if (e.pointerId != mouse.id) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        mouse.x = mouse.y = 0;
        mouse.down = false;
        mouse.id = -1;
    });

    canvas.addEventListener('pointermove', e => {
        if (e.pointerId != mouse.id) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        mouse.y = e.offsetY;
    });
}
