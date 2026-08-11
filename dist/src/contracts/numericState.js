import { assertJsonValue } from "./systemSettings.js";
export const NUMERIC_STATE_SCHEMA_VERSION = 1;
export const NUMERIC_THRESHOLD_COMPARATORS = ["below", "below-or-equal", "above", "above-or-equal"];
export function validateNumericThresholdBindings(value) {
    if (!Array.isArray(value))
        throw new Error("Numeric threshold bindings must be an array");
    const bindings = value.map(binding => {
        validateNumericThresholdBinding(binding);
        return structuredClone(binding);
    });
    if (new Set(bindings.map(binding => binding.id)).size !== bindings.length)
        throw new Error("Numeric threshold IDs must be unique");
}
export function validateNumericThresholdBinding(value) {
    const binding = record(value, "Numeric threshold binding");
    knownKeys(binding, ["schemaVersion", "id", "resetValue", "thresholds"], "Numeric threshold binding");
    if (binding.schemaVersion !== NUMERIC_STATE_SCHEMA_VERSION)
        throw new Error("Unsupported numeric threshold schema version");
    identifier(binding.id, "Numeric threshold ID");
    if (binding.resetValue !== undefined && (typeof binding.resetValue !== "number" || !Number.isFinite(binding.resetValue)))
        throw new Error("Numeric resetValue must be finite");
    if (!Array.isArray(binding.thresholds))
        throw new Error("Numeric threshold binding requires thresholds");
    binding.thresholds.forEach(validateNumericThreshold);
}
export function validateNumericThreshold(value) {
    const threshold = record(value, "Numeric threshold");
    exactKeys(threshold, ["schemaVersion", "comparator", "value", "effects"], "Numeric threshold");
    if (threshold.schemaVersion !== NUMERIC_STATE_SCHEMA_VERSION)
        throw new Error("Unsupported numeric threshold schema version");
    if (!NUMERIC_THRESHOLD_COMPARATORS.includes(threshold.comparator))
        throw new Error("Unknown numeric threshold comparator");
    if (typeof threshold.value !== "number" || !Number.isFinite(threshold.value))
        throw new Error("Numeric threshold value must be finite");
    if (!Array.isArray(threshold.effects) || threshold.effects.length === 0)
        throw new Error("Numeric threshold requires at least one follow-up effect");
    threshold.effects.forEach(validateRelativeEffect);
}
function validateRelativeEffect(value) {
    const effect = record(value, "Numeric threshold effect");
    if (Object.keys(effect).some(key => !["schemaVersion", "type", "typeValue"].includes(key)) || Object.keys(effect).length !== 3)
        throw new Error("Numeric threshold effects cannot declare their own target");
    if (effect.schemaVersion !== undefined && effect.schemaVersion !== 1)
        throw new Error("Unsupported numeric threshold effect schema version");
    if (typeof effect.type !== "string" || effect.type.length === 0)
        throw new Error("Numeric threshold effect requires a type");
    assertJsonValue(effect.typeValue);
}
function identifier(value, label) {
    if (typeof value !== "string" || !/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(value))
        throw new Error(`${label} must be a stable identifier`);
}
function record(value, label) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error(`${label} must be an object`);
    return value;
}
function exactKeys(value, keys, label) {
    if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key)))
        throw new Error(`${label} contains unexpected fields`);
}
function knownKeys(value, keys, label) {
    if (Object.keys(value).some(key => !keys.includes(key)))
        throw new Error(`${label} contains unexpected fields`);
}
