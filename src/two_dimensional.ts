import { Waves } from './waves';
import GUI from 'lil-gui';

export function setupTwoDimensional(element: HTMLElement) {
    const canvas = document.createElement('canvas');
    const waves = new Waves(canvas, 1025);

    const config = {
        frequency: 1,
        phase: 0,
        amplitude: 1,
    };

    const gui = new GUI({ container: element });
    gui.add(waves.config, 'damping', 0.001, 0.1).name('Damping');
    gui.add(waves.config, 'mode', ['2d', '3d']).name('Mode');

    const folder = gui.addFolder('Oscillator');
    folder.add(config, 'amplitude', 0, 10).name('Amplitude');
    folder.add(config, 'frequency', 0, 10).name('Frequency');
    folder.add(config, 'phase', 0, Math.PI * 2).name('Phase');

    const tonemapping= gui.addFolder('Tonemapping');
    tonemapping.add(waves.config, 'exposure', 0, 3).name('Exposure');
    tonemapping.add(waves.config, 'gamma', 0, 3).name('Gamma');

    element.appendChild(canvas);

    const obs = new ResizeObserver(info => {
        const rect = info[0].contentRect;

        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        waves.aspect = canvas.width / canvas.height;
    });

    obs.observe(canvas);

    waves.config.mode = '2d';

    function render(t) {
        const sin = Math.sin(t / 1000 * config.frequency + config.phase) * config.amplitude;

        waves.set(waves.width / 2, waves.height / 2, sin);
        waves.set(waves.width / 2 + waves.width / 5, waves.height / 2, sin);

        waves.step(1);
        waves.draw();

        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
}
