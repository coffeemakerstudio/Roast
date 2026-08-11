export const ENTITY_STATE_SCHEMA_VERSION = 1;
export function createTransformState(input) {
    const state = { schemaVersion: 1, position: { ...input.position }, rotation: input.rotation ?? 0 };
    validateTransformState(state);
    return structuredClone(state);
}
export function createMovementState(input) {
    const state = { schemaVersion: 1, velocity: { ...input.velocity }, angularVelocity: input.angularVelocity ?? 0, enabled: input.enabled ?? true };
    validateMovementState(state);
    return structuredClone(state);
}
export function validateTransformState(value) {
    const state = record(value, "Transform state");
    exactKeys(state, ["schemaVersion", "position", "rotation"], "Transform state");
    if (state.schemaVersion !== 1)
        throw new Error("Unsupported Transform state schema version");
    validateVector(state.position, "Transform position");
    finite(state.rotation, "Transform rotation");
}
export function validateMovementState(value) {
    const state = record(value, "Movement state");
    exactKeys(state, ["schemaVersion", "velocity", "angularVelocity", "enabled"], "Movement state");
    if (state.schemaVersion !== 1)
        throw new Error("Unsupported Movement state schema version");
    validateVector(state.velocity, "Movement velocity");
    finite(state.angularVelocity, "Movement angularVelocity");
    if (typeof state.enabled !== "boolean")
        throw new Error("Movement enabled must be boolean");
}
function validateVector(value, label) {
    const vector = record(value, label);
    exactKeys(vector, ["x", "y"], label);
    finite(vector.x, `${label} x`);
    finite(vector.y, `${label} y`);
}
function record(value, label) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error(`${label} must be an object`);
    return value;
}
function exactKeys(value, keys, label) {
    const allowed = new Set(keys);
    for (const key of Object.keys(value))
        if (!allowed.has(key))
            throw new Error(`${label} contains unknown field '${key}'`);
    for (const key of keys)
        if (!(key in value))
            throw new Error(`${label} is missing '${key}'`);
}
function finite(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value))
        throw new Error(`${label} must be finite`);
}
