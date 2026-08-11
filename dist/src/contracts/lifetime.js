export const LIFETIME_DURATION_UNITS = ["turns", "ticks"];
export function createLifetime(input) {
    const lifetime = {
        durationUnit: input.durationUnit,
        duration: input.duration,
        remaining: input.remaining ?? input.duration,
    };
    validateLifetime(lifetime);
    return lifetime;
}
/** Purely advances one qualified time unit; expiry is represented by undefined. */
export function advanceLifetime(lifetime) {
    validateLifetime(lifetime);
    if (lifetime.remaining <= 1)
        return undefined;
    return { ...lifetime, remaining: lifetime.remaining - 1 };
}
export function validateLifetime(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Lifetime must be an object");
    const lifetime = value;
    if (!LIFETIME_DURATION_UNITS.includes(lifetime.durationUnit))
        throw new Error("Lifetime duration unit is invalid");
    if (!Number.isSafeInteger(lifetime.duration) || lifetime.duration < 1)
        throw new Error("Lifetime duration must be a positive integer");
    if (!Number.isSafeInteger(lifetime.remaining) || lifetime.remaining < 1 || lifetime.remaining > lifetime.duration)
        throw new Error("Lifetime remaining duration is invalid");
}
