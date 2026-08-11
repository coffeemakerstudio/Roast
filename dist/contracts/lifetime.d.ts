export declare const LIFETIME_DURATION_UNITS: readonly ["turns", "ticks"];
export type DurationUnit = typeof LIFETIME_DURATION_UNITS[number];
/** Flat canonical countdown fields shared by time-based lifecycle contracts. */
export interface LifetimeSettings {
    durationUnit: DurationUnit;
    duration: number;
    remaining: number;
}
export declare function createLifetime<Unit extends DurationUnit>(input: Omit<LifetimeSettings, "remaining"> & {
    durationUnit: Unit;
    remaining?: number;
}): LifetimeSettings & {
    durationUnit: Unit;
};
/** Purely advances one qualified time unit; expiry is represented by undefined. */
export declare function advanceLifetime<Unit extends DurationUnit>(lifetime: LifetimeSettings & {
    durationUnit: Unit;
}): (LifetimeSettings & {
    durationUnit: Unit;
}) | undefined;
export declare function validateLifetime(value: unknown): asserts value is LifetimeSettings;
