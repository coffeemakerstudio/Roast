/** Calculates one deterministic radial velocity delta for a generic movement command. */
export function calculateRadialVelocityDelta(origin, target, field) {
    validateVector(origin, "Movement force origin");
    validateVector(target, "Movement force target");
    if (field.mode !== "attract" && field.mode !== "repel")
        throw new Error("Movement force mode must be attract or repel");
    if (!Number.isFinite(field.force) || field.force < 0)
        throw new Error("Movement force must be finite and non-negative");
    if (!Number.isFinite(field.range) || field.range <= 0)
        throw new Error("Movement force range must be finite and positive");
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0 || distance > field.range)
        return { x: 0, y: 0 };
    const direction = field.mode === "attract" ? 1 : -1;
    return {
        x: normalizeZero((dx / distance) * field.force * direction),
        y: normalizeZero((dy / distance) * field.force * direction),
    };
}
export function applyRadialVelocityDelta(velocity, origin, target, field) {
    validateVector(velocity, "Movement velocity");
    const delta = calculateRadialVelocityDelta(origin, target, field);
    return { x: velocity.x + delta.x, y: velocity.y + delta.y };
}
function validateVector(value, label) {
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y))
        throw new Error(`${label} must be finite`);
}
function normalizeZero(value) { return Object.is(value, -0) ? 0 : value; }
