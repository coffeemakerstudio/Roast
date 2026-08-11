import { assertJsonValue } from "./systemSettings.js";
import { advanceLifetime, createLifetime, validateLifetime } from "./lifetime.js";
export const TEMPORAL_MODIFIER_SCHEMA_VERSION = 1;
export const TEMPORAL_DURATION_UNITS = ["turns"];
export function createTemporalModifierTemplate(input) {
    const template = structuredClone(input);
    if (template.durationUnit !== "turns")
        throw new Error("Temporal modifier requires turns duration");
    if (!Number.isSafeInteger(template.duration) || template.duration < 1)
        throw new Error("Temporal modifier duration must be a positive integer");
    if (!template.effect || typeof template.effect !== "object" || Array.isArray(template.effect))
        throw new Error("Temporal modifier requires an Engine effect");
    assertJsonValue(template.effect);
    if (template.effect.schemaVersion !== 1 || typeof template.effect.type !== "string")
        throw new Error("Temporal modifier Engine effect is invalid");
    return template;
}
export function createTemporalModifier(input) {
    const modifier = {
        schemaVersion: TEMPORAL_MODIFIER_SCHEMA_VERSION,
        id: input.id,
        target: { ...input.target },
        effect: structuredClone(input.effect),
        ...createLifetime({ durationUnit: input.durationUnit, duration: input.duration, remaining: input.remaining }),
        ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
        ...(input.sourceOrder === undefined ? {} : { sourceOrder: input.sourceOrder }),
    };
    validateTemporalModifier(modifier);
    return modifier;
}
export function advanceTemporalModifier(modifier) {
    validateTemporalModifier(modifier);
    const next = advanceLifetime(lifetimeOf(modifier));
    return next ? { ...structuredClone(modifier), ...next } : undefined;
}
export function validateTemporalModifier(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Temporal modifier must be an object");
    const modifier = value;
    if (modifier.schemaVersion !== TEMPORAL_MODIFIER_SCHEMA_VERSION)
        throw new Error("Unsupported temporal modifier schema version");
    if (typeof modifier.id !== "string" || modifier.id.length === 0)
        throw new Error("Temporal modifier requires a stable id");
    if (modifier.sourceId !== undefined && (typeof modifier.sourceId !== "string" || modifier.sourceId.length === 0))
        throw new Error("Temporal modifier sourceId must be non-empty");
    if (modifier.sourceOrder !== undefined && !Number.isSafeInteger(modifier.sourceOrder))
        throw new Error("Temporal modifier sourceOrder must be a safe integer");
    if (!modifier.target || modifier.target.type !== "entity" || typeof modifier.target.entityId !== "string" || modifier.target.entityId.length === 0)
        throw new Error("Temporal modifier requires a stable entity target");
    if (modifier.durationUnit !== "turns")
        throw new Error("Temporal modifier requires turns duration");
    validateLifetime({ durationUnit: modifier.durationUnit, duration: modifier.duration, remaining: modifier.remaining });
    if (!modifier.effect || typeof modifier.effect !== "object" || Array.isArray(modifier.effect))
        throw new Error("Temporal modifier requires an Engine effect");
    assertJsonValue(modifier.effect);
    if (modifier.effect.schemaVersion !== 1 || typeof modifier.effect.type !== "string")
        throw new Error("Temporal modifier Engine effect is invalid");
    const effectKeys = Object.keys(modifier.effect);
    if (effectKeys.some(key => !["schemaVersion", "type", "typeValue", "target"].includes(key)))
        throw new Error("Temporal modifier Engine effect contains unexpected fields");
}
function lifetimeOf(value) {
    return { durationUnit: value.durationUnit, duration: value.duration, remaining: value.remaining };
}
