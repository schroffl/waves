import { mat4, vec3 } from 'gl-matrix';
import REGL from 'regl';

export type Position = {
    x: number,
    y: number,
};

type ProcessProps = {
    source: REGL.Texture2D,
    target: REGL.Framebuffer,

    obstacles: REGL.Texture2D,

    dt: number,
    N: number,
    c: number,
    damping: number,
};

type BlitProps = {
    source: REGL.Texture2D,
    target: REGL.Framebuffer,
};

type DrawProps = {
    texture: REGL.Texture2D,
    view_matrix: mat4,
    gamma: number,
    exposure: number,
};

export type Config = {
    c: number,
    damping: number,
    gamma: number,
    exposure: number,
    mode: '2d' | '3d',
};

export class Waves {

    regl: REGL.Regl;

    public readonly width: number;
    public readonly height: number;
    public aspect: number = 1;

    protected readonly source: REGL.Texture2D;
    protected readonly target: REGL.Texture2D;

    protected readonly source_fb: REGL.Framebuffer;
    protected readonly target_fb: REGL.Framebuffer;

    protected processCmd: REGL.DrawCommand;
    protected blitCmd: REGL.DrawCommand;
    protected drawCmd: REGL.DrawCommand;
    protected drawMeshCmd: REGL.DrawCommand;

    protected obstacles: REGL.Texture2D;

    protected color_scale:  REGL.Texture2D;

    protected mesh: Float32Array;
    protected indices: Uint32Array;
    protected matrix: mat4;

    public config: Config = {
        c: 0.04,
        damping: 0.001,
        gamma: 0.4,
        exposure: 1.0,
        mode: '3d',
    };

    constructor(
        public canvas: HTMLCanvasElement | undefined,
        public size: number,
    ) {
        this.regl = REGL({
            canvas: canvas,
            extensions: ['OES_texture_float', 'OES_element_index_uint'],
            optionalExtensions: ['oes_texture_float_linear'],
        });

        this.width = size;
        this.height = size;

        this.mesh = new Float32Array(this.width * this.height);
        this.mesh.forEach((_, i, arr) => arr[i] = i);

        this.matrix = mat4.create();
        mat4.perspective(this.matrix, Math.PI * 0.6, this.aspect, .001, 10);

        const w = this.width - 1;
        const h = this.height - 1;
        this.indices = new Uint32Array(w * h * 6);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = y * w + x;
                const idx2 = y * this.width + x;

                this.indices.set([
                    idx2, idx2 + 1, idx2 + this.width,
                    idx2 + 1, idx2 + 1 + this.width, idx2 + this.width,
                ], idx * 6);
            }
        }

        this.source = this.regl.texture({
            width: this.width,
            height: this.height,
            format: 'rgba',
            type: 'float',
        });

        this.target = this.regl.texture({
            width: this.width,
            height: this.height,
            format: 'rgba',
            type: 'float',
        });

        this.source_fb = this.regl.framebuffer({
            color: this.source,
            depth: false,
        });

        this.target_fb = this.regl.framebuffer({
            color: this.target,
            depth: false,
        });

        this.obstacles = this.regl.texture({
            width: 1,
            height: 1,
            format: 'rgba',
            data: [1, 1, 1, 1],
        });

        this.color_scale = this.regl.texture({
            width: 1,
            height: 1,
            format: 'rgba',
            data: [1, 1, 1, 1],
        });

        this.processCmd = this.regl<{}, {}, ProcessProps>({
            vert: `
                precision highp float;

                attribute vec2 position;

                varying vec2 uv;

                void main() {
                    gl_Position = vec4(position, 0, 1);
                    uv = position * 0.5 + 0.5;
                }
            `,
            frag: `
                precision highp float;

                uniform sampler2D source;
                uniform sampler2D obstacles;
                uniform vec2 resolution;

                uniform float dt;
                uniform float N;
                uniform float damping;
                uniform float c;

                varying vec2 uv;

                vec4 sample(vec2 offset) {
                    vec2 pos = uv + offset / resolution;
                    return texture2D(source, pos);
                }

                void main() {
                    vec2 delta = vec2(0.1);
                    delta *= delta;

                    vec4 self = sample(vec2(0.0));
                    float d2x = (sample(vec2(1.0, 0.0)).r - 2.0 * self.r + sample(vec2(-1.0, 0.0)).r) / delta.x;
                    float d2z = (sample(vec2(0.0, 1.0)).r - 2.0 * self.r + sample(vec2(0.0, -1.0)).r) / delta.y;

                    float obs = texture2D(obstacles, uv).r;

                    float uy = self.g;
                    float ay = (c * c) * (d2x + d2z);

                    ay += -damping * uy;
                    uy += dt * ay;

                    float new_r = self.r + dt * uy;
                    new_r *= obs;

                    gl_FragColor = vec4(
                        // Intensity
                        new_r,
                        uy,
                        self.b,
                        self.a
                    );
                }
            `,

            attributes: {
                position: this.regl.buffer([
                    -1, -1,
                    1, -1,
                    -1,  1,
                    1,  1,
                ])
            },

            uniforms: {
                source: this.regl.prop<ProcessProps, keyof ProcessProps>('source'),
                obstacles: this.regl.prop<ProcessProps, keyof ProcessProps>('obstacles'),
                resolution: [this.width, this.height],
                c: this.regl.prop<ProcessProps, keyof ProcessProps>('c'),
                damping: this.regl.prop<ProcessProps, keyof ProcessProps>('damping'),
                N: this.regl.prop<ProcessProps, keyof ProcessProps>('N'),
                dt: this.regl.prop<ProcessProps, keyof ProcessProps>('dt'),
            },

            framebuffer: this.regl.prop<ProcessProps, keyof ProcessProps>('target'),
            primitive: 'triangle strip',
            count: 4,
        });

        this.blitCmd = this.regl({
            vert: `
                precision highp float;

                attribute vec2 position;

                varying vec2 uv;

                void main() {
                    gl_Position = vec4(position, 0, 1);
                    uv = position * 0.5 + 0.5;
                }
            `,

            frag: `
                precision highp float;

                uniform sampler2D source;

                varying vec2 uv;

                void main() {
                    gl_FragColor = texture2D(source, uv);
                }
            `,

            attributes: {
                position: this.regl.buffer([
                    -1, -1,
                    1, -1,
                    -1,  1,
                    1,  1,
                ])
            },

            uniforms: {
                source: this.regl.prop<BlitProps, keyof BlitProps>('source'),
            },

            framebuffer: this.regl.prop<BlitProps, keyof BlitProps>('target'),
            primitive: 'triangle strip',
            count: 4,
        });

        this.drawCmd = this.regl({
            vert: `
                precision highp float;

                attribute vec2 position;

                varying vec2 uv;

                void main() {
                    gl_Position = vec4(position, 0, 1);
                    uv = position * 0.5 + 0.5;
                }
            `,

            frag: `
                precision highp float;

                uniform sampler2D tex;
                uniform sampler2D scale;
                uniform float exposure;
                uniform float gamma;

                varying vec2 uv;

                float reinhardToneMapping(float value) {
                    value *= exposure / (1.0 + value / exposure);
                    value = pow(value, 1.0 / gamma);
                    return value;
                }

                void main() {
                    float raw = texture2D(tex, uv).r;
                    float value = reinhardToneMapping(abs(raw));

                    vec3 lower = vec3(0.0, 1.0, 0.0);
                    vec3 upper = vec3(1.0, 0.0, 0.0);

                    // vec3 lower = vec3(0.0235, 0.7294, 0.3882);
                    // vec3 upper = vec3(0.9725, 0.4627, 0.4627);

                    if (raw < 0.0) {
                        gl_FragColor = texture2D(scale, vec2(0.5 - value * 0.5, 0.5));
                        // gl_FragColor = vec4(lower * value, 1.0);
                    } else {
                        gl_FragColor = texture2D(scale, vec2(0.5 + value * 0.5, 0.5));
                        // gl_FragColor = vec4(upper * value, 1.0);
                    }
                }
            `,

            attributes: {
                position: this.regl.buffer([
                    -1, -1,
                    1, -1,
                    -1,  1,
                    1,  1,
                ])
            },

            uniforms: {
                tex: this.regl.prop<DrawProps, keyof DrawProps>('texture'),
                gamma: this.regl.prop<DrawProps, keyof DrawProps>('gamma'),
                exposure: this.regl.prop<DrawProps, keyof DrawProps>('exposure'),
                scale: this.color_scale,
            },

            primitive: 'triangle strip',
            count: 4,
        });

        this.drawMeshCmd = this.regl({
            vert: `
                precision highp float;

                attribute float index;

                uniform sampler2D texture;
                uniform vec2 resolution;

                uniform mat4 view_matrix;
                uniform mat4 perspective;
                uniform float exposure;
                uniform float gamma;

                varying vec3 color;
                varying vec3 position;
                varying vec3 vLighting;

                float reinhardToneMapping(float value) {
                    value *= exposure / (1.0 + value / exposure);
                    value = pow(value, 1.0 / gamma);
                    return value;
                }

                vec2 calculatePixel(float idx) {
                    return vec2(mod(index, resolution.x), floor(index / resolution.y));
                }

                vec2 calculateUV(vec2 pos) {
                    return pos / resolution;
                }

                float calculateZ(vec2 pos) {
                    vec2 uv_coords = pos / resolution;
                    return texture2D(texture, uv_coords).r;
                }

                vec3 calculateVertex(vec2 pos) {
                    vec2 uv = calculateUV(pos);
                    return vec3(uv.xy, calculateZ(pos));
                }

                void main() {
                    vec2 pixel = calculatePixel(index);

                    vec3 up       = calculateVertex(pixel + vec2( 0.0,  1.0));
                    vec3 upright  = calculateVertex(pixel + vec2( 1.0,  1.0));
                    vec3 right    = calculateVertex(pixel + vec2( 1.0,  0.0));
                    vec3 down     = calculateVertex(pixel + vec2( 0.0, -1.0));
                    vec3 downleft = calculateVertex(pixel + vec2(-1.0, -1.0));
                    vec3 left     = calculateVertex(pixel + vec2(-1.0,  0.0));

                    float ax = 1.0 / resolution.x;
                    float ay = 1.0 / resolution.y;

                    vec3 normal = vec3(
                        (2.0 * (left.z - right.z) - upright.z + downleft.z + up.z - down.z) / ax,
                        (2.0 * (down.z - up.z) + upright.z + downleft.z - up.z - left.z) / ay,
                        6.0
                    );

                    normal = normalize(normal);
                    color = normal;

                    vec3 pos = calculateVertex(pixel);
                    pos.z = sign(pos.z) * reinhardToneMapping(abs(pos.z));
                    position = pos;

                    pos.xy = pos.xy * 2.0 - 1.0;

                    gl_Position = perspective * view_matrix * vec4(pos, 1);

                    highp vec3 ambientLight = vec3(0.5, 0.5, 0.5);
                    highp vec3 directionalLightColor = vec3(1, 1, 1);
                    highp vec3 directionalVector = normalize(vec3(0.85, 0.8, 0.75));

                    highp vec4 transformedNormal = vec4(normal, 1.0);

                    highp float directional = max(dot(transformedNormal.xyz, directionalVector), 0.0);
                    vLighting = ambientLight + (directionalLightColor * directional);
                }
            `,

            frag: `
                precision highp float;

                varying vec3 position;
                varying vec3 color;
                varying vec3 vLighting;

                uniform sampler2D scale;
                uniform float exposure;
                uniform float gamma;

                float reinhardToneMapping(float value) {
                    value *= exposure / (1.0 + value / exposure);
                    value = pow(value, 1.0 / gamma);
                    return value;
                }

                void main() {
                    float raw = position.z;
                    float value = position.z;

                    if (raw < 0.0) {
                        gl_FragColor = texture2D(scale, vec2(0.5 - value * 0.5, 0.5));
                    } else {
                        gl_FragColor = texture2D(scale, vec2(0.5 + value * 0.5, 0.5));
                    }

                    // gl_FragColor = vec4(0.0, 0.0, position.z * 0.5 + 0.5, 1.0);
                    gl_FragColor.rgb *= vLighting;
                    // gl_FragColor = vec4(vec3(1.0) * vLighting, 1.0);
                }
            `,

            attributes: {
                index: this.mesh,
            },

            uniforms: {
                texture: this.target,
                resolution: [this.width, this.height],
                perspective: this.matrix,
                view_matrix: this.regl.prop<DrawProps, keyof DrawProps>('view_matrix'),
                scale: this.color_scale,

                gamma: this.regl.prop<DrawProps, keyof DrawProps>('gamma'),
                exposure: this.regl.prop<DrawProps, keyof DrawProps>('exposure'),
            },

            primitive: 'triangles',
            elements: this.indices,
            cull: {
                enable: false,
            },
        });

        const img = new Image();
        img.src = './stencil.png';
        img.onload = () => this.obstacles({ data: img, flipY: true });

        const img2 = new Image();
        img2.src = './turbo.png';
        img2.onload = () => this.color_scale({ data: img2, flipY: true });
    }

    step(dt: number) {
        this.processCmd({
            source: this.source,
            target: this.target_fb,
            obstacles: this.obstacles,

            dt: dt,
            N: this.width,
            c: this.config.c,
            damping: this.config.damping,
        });

        // Render the target to the source for the next step.
        this.blitCmd({
            source: this.target,
            target: this.source_fb,
        });
    }

    draw() {
        this.regl.poll();

        this.regl.clear({
            framebuffer: null,
            color: [0, 0, 0, 0],
            depth: 1,
        });

        const camera_pos = vec3.fromValues(0, -2, 2);
        const target_pos = vec3.fromValues(0, 0, 0);
        const up = vec3.fromValues(0, 0, 1);

        vec3.rotateZ(camera_pos, camera_pos, vec3.fromValues(0, 0, 2), Math.PI / 4);

        // vec3.rotateZ(camera_pos, camera_pos, target_pos, Date.now() / 1000);
        // vec3.rotateX(camera_pos, camera_pos, target_pos, Math.PI);

        const camera = mat4.create();
        mat4.lookAt(camera, camera_pos, target_pos, up);
        mat4.scale(camera, camera, vec3.fromValues(2, 2, 0.2));

        if (this.config.mode === '2d') {
            this.drawCmd({
                texture: this.target,
                gamma: this.config.gamma,
                exposure: this.config.exposure,
            });
        } else if (this.config.mode === '3d') {
            const view_matrix = mat4.create();
            mat4.translate(view_matrix, view_matrix, vec3.fromValues(0, 0, -2));
            mat4.rotateX(view_matrix, view_matrix, -Math.PI * 0.5);

            this.drawMeshCmd({
                view_matrix: camera,
                gamma: this.config.gamma,
                exposure: this.config.exposure,
            });
        }
    }

    get(x: number, y: number): number {
        const pixel = this.getPixelAt(x, y);
        return pixel[0];
    }

    getPixelAt(x: number, y: number): Float32Array {
        return this.regl.read({
            x: x,
            y: y,
            width: 1,
            height: 1,
            framebuffer: this.target_fb,
        });
    }

    set(x: number, y: number, value: number) {
        const pixel = this.getPixelAt(x, y);
        pixel[0] = value;
        this.setPixelAt(x, y, pixel);
    }

    setPixelAt(x: number, y: number, pixel: Float32Array) {
        this.source.subimage({
            width: 1,
            height: 1,
            data: pixel,
        }, x, y);
    }

}
