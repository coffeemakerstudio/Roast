import { COUNTER_SCHEMA_VERSION } from "../contracts/counterState.js";
import { validateTriggerEvent } from "./trigger.js";
export const COUNTER_CAPABILITY = "counter.state";
export const COUNTER_SET_EFFECT_ID = "counter.set";
export const COUNTER_ADD_EFFECT_ID = "counter.add";
export const COUNTER_RESET_EFFECT_ID = "counter.reset";
export const COUNTER_EFFECT_IDS = [COUNTER_SET_EFFECT_ID, COUNTER_ADD_EFFECT_ID, COUNTER_RESET_EFFECT_ID];
export function counterSystemDefinition() {
    return { id: "core.counter", provides: [COUNTER_CAPABILITY], acceptsEffects: [...COUNTER_EFFECT_IDS] };
}
export function registerCounterSystem(registry) {
    return registry.register(counterSystemDefinition());
}
/** Registers the generic counter mutation family without selecting its runtime interpreter. */
export function registerCounterCommands(registry) {
    return registry
        .register({ id: COUNTER_SET_EFFECT_ID, requiresCapability: [COUNTER_CAPABILITY], targetType: "counter", lifecycleCategory: "command", validatePayload: payload => validateNumericPayload(payload, "Counter set", "value"), validateTarget: validateCounterTargetValue })
        .register({ id: COUNTER_ADD_EFFECT_ID, requiresCapability: [COUNTER_CAPABILITY], targetType: "counter", lifecycleCategory: "command", validatePayload: payload => validateNumericPayload(payload, "Counter add", "amount"), validateTarget: validateCounterTargetValue })
        .register({ id: COUNTER_RESET_EFFECT_ID, requiresCapability: [COUNTER_CAPABILITY], targetType: "counter", lifecycleCategory: "command", validatePayload: payload => exactKeys(record(payload, "Counter reset payload"), [], "Counter reset payload"), validateTarget: validateCounterTargetValue });
}
/** Validates the complete current counter command, including its stable target. */
export function validateCounterEffectSettings(value) {
    const effect = record(value, "Counter effect");
    exactKeys(effect, ["schemaVersion", "type", "target", "typeValue"], "Counter effect");
    if (effect.schemaVersion !== COUNTER_SCHEMA_VERSION)
        throw new Error("Unsupported counter effect schema version");
    validateCounterTargetValue(effect.target);
    if (effect.type === COUNTER_SET_EFFECT_ID)
        validateNumericPayload(effect.typeValue, "Counter set", "value");
    else if (effect.type === COUNTER_ADD_EFFECT_ID)
        validateNumericPayload(effect.typeValue, "Counter add", "amount");
    else if (effect.type === COUNTER_RESET_EFFECT_ID)
        exactKeys(record(effect.typeValue, "Counter reset payload"), [], "Counter reset payload");
    else
        throw new Error(`Unknown counter effect '${String(effect.type)}'`);
}
export function validateCounterTarget(target) {
    validateCounterTargetValue(target);
}
export function validateCounterTriggerBinding(value) {
    const binding = record(value, "Counter trigger binding");
    if (typeof binding.trigger !== "string" || !["tick", "collision.enter", "round.start", "environment.activation", "schedule.due"].includes(binding.trigger))
        throw new Error("Counter trigger binding has an unknown trigger");
    validateCounterEffectSettings(binding.effect);
}
export function counterTriggerMatches(binding, event) {
    validateCounterTriggerBinding(binding);
    validateTriggerEvent(event);
    return binding.trigger === event.type;
}
function validateCounterTargetValue(target) {
    const value = record(target, "Counter target");
    exactKeys(value, ["type", "counterId"], "Counter target");
    if (value.type !== "counter")
        throw new Error("Counter target type must be 'counter'");
    if (typeof value.counterId !== "string" || value.counterId.length === 0)
        throw new Error("Counter target requires a non-empty counterId");
}
function validateNumericPayload(payload, label, key) {
    const value = record(payload, `${label} payload`);
    exactKeys(value, [key], `${label} payload`);
    if (typeof value[key] !== "number" || !Number.isFinite(value[key]))
        throw new Error(`${label} ${key} must be finite`);
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
            throw new Error(`${label} contains unexpected fields`);
    for (const key of keys)
        if (!(key in value))
            throw new Error(`${label} is missing '${key}'`);
}
