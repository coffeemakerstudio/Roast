export const COUNTER_SCHEMA_VERSION = 1;
/** Creates one detached, complete canonical counter state. */
export function createCounterState(input) {
    const state = {
        schemaVersion: COUNTER_SCHEMA_VERSION,
        id: input.id,
        value: input.value ?? 0,
    };
    validateCounterState(state);
    return state;
}
/** Validates one current counter state without constructing runtime objects. */
export function validateCounterState(value) {
    if (!isRecord(value) || Object.keys(value).some(key => !["schemaVersion", "id", "value"].includes(key)) || Object.keys(value).length !== 3) {
        throw new Error("Malformed counter state");
    }
    if (value.schemaVersion !== COUNTER_SCHEMA_VERSION)
        throw new Error("Unsupported counter state schema version");
    if (typeof value.id !== "string" || value.id.length === 0)
        throw new Error("Counter state requires a non-empty id");
    if (typeof value.value !== "number" || !Number.isFinite(value.value))
        throw new Error("Counter state value must be finite");
}
/** Validates and canonically orders a detached world counter collection. */
export function canonicalizeCounterStates(value) {
    if (!Array.isArray(value))
        throw new Error("Counter states must be an array");
    const counters = value.map(counter => {
        validateCounterState(counter);
        return { ...counter };
    });
    if (new Set(counters.map(counter => counter.id)).size !== counters.length)
        throw new Error("Counter state IDs must be unique");
    return counters.sort((a, b) => a.id.localeCompare(b.id));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
