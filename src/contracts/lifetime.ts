export const LIFETIME_DURATION_UNITS = ["turns", "ticks"] as const;
export type DurationUnit = typeof LIFETIME_DURATION_UNITS[number];

/** Flat canonical countdown fields shared by time-based lifecycle contracts. */
export interface LifetimeSettings {
	durationUnit: DurationUnit;
	duration: number;
	remaining: number;
}

export function createLifetime<Unit extends DurationUnit>(input: Omit<LifetimeSettings, "remaining"> & { durationUnit: Unit; remaining?: number }): LifetimeSettings & { durationUnit: Unit } {
 const lifetime: LifetimeSettings & { durationUnit: Unit } = {
		durationUnit: input.durationUnit,
		duration: input.duration,
		remaining: input.remaining ?? input.duration,
	};
	validateLifetime(lifetime);
	return lifetime;
}

/** Purely advances one qualified time unit; expiry is represented by undefined. */
export function advanceLifetime<Unit extends DurationUnit>(lifetime: LifetimeSettings & { durationUnit: Unit }): (LifetimeSettings & { durationUnit: Unit }) | undefined {
	validateLifetime(lifetime);
	if (lifetime.remaining <= 1) return undefined;
	return { ...lifetime, remaining: lifetime.remaining - 1 };
}

export function validateLifetime(value: unknown): asserts value is LifetimeSettings {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Lifetime must be an object");
	const lifetime = value as Partial<LifetimeSettings>;
	if (!(LIFETIME_DURATION_UNITS as readonly unknown[]).includes(lifetime.durationUnit)) throw new Error("Lifetime duration unit is invalid");
	if (!Number.isSafeInteger(lifetime.duration) || (lifetime.duration as number) < 1) throw new Error("Lifetime duration must be a positive integer");
	if (!Number.isSafeInteger(lifetime.remaining) || (lifetime.remaining as number) < 1 || (lifetime.remaining as number) > (lifetime.duration as number)) throw new Error("Lifetime remaining duration is invalid");
}
