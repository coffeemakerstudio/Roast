import { assertJsonValue } from "../contracts/systemSettings.js";
import { validateEngineEffectComposition } from "./composition.js";
export const COLLISION_COMMAND_SCHEMA_VERSION = 1;
export const COLLISION_COMMAND_TYPE = "collision.command";
export function createCollisionCommandBinding(effect) {
    const binding = { schemaVersion: 1, type: COLLISION_COMMAND_TYPE, effect: structuredClone(effect) };
    validateCollisionCommandBinding(binding);
    return binding;
}
/** Validates a relative collision command without resolving a runtime target. */
export function validateCollisionCommandBinding(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Malformed collision command binding");
    const binding = value;
    if (Object.keys(binding).some(key => !["schemaVersion", "type", "effect"].includes(key)) || Object.keys(binding).length !== 3)
        throw new Error("Malformed collision command binding");
    if (binding.schemaVersion !== 1 || binding.type !== COLLISION_COMMAND_TYPE)
        throw new Error("Unsupported collision command binding");
    validateRelativeEffect(binding.effect);
}
export function isCollisionCommandBinding(value) {
    try {
        validateCollisionCommandBinding(value);
        return true;
    }
    catch {
        return false;
    }
}
function validateRelativeEffect(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Collision command effect must be an object");
    const effect = value;
    if (effect.type === "effect.composition") {
        validateEngineEffectComposition(effect);
        for (const child of effect.effects)
            validateRelativeEffect(child);
        return;
    }
    if (typeof effect.type !== "string" || effect.type.length === 0 || effect.schemaVersion !== 1 || !("typeValue" in effect) || "target" in effect)
        throw new Error("Collision command must be a target-relative Engine effect");
    assertJsonValue(effect.typeValue);
}
