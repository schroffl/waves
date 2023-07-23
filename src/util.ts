export function map(value: number, fmin: number, fmax: number, tmin: number, tmax: number): number {
    return (value - fmin) / (fmax - fmin) * (tmax - tmin) + tmin;
}
