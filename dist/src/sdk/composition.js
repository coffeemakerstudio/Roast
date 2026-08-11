import { assertJsonValue } from "../contracts/systemSettings.js";
export const ENGINE_EFFECT_COMPOSITION_SCHEMA_VERSION = 1;
export const ENGINE_EFFECT_COMPOSITION_TYPE = "effect.composition";
export function createEngineEffectComposition(effects) {
    const composition = { schemaVersion: 1, type: ENGINE_EFFECT_COMPOSITION_TYPE, effects: structuredClone([...effects]) };
    validateEngineEffectComposition(composition);
    return composition;
}
export function validateEngineEffectComposition(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Malformed Engine effect composition");
    const composition = value;
    if (Object.keys(composition).some(key => !["schemaVersion", "type", "effects"].includes(key)) || Object.keys(composition).length !== 3)
        throw new Error("Malformed Engine effect composition");
    if (composition.schemaVersion !== 1 || composition.type !== ENGINE_EFFECT_COMPOSITION_TYPE || !Array.isArray(composition.effects))
        throw new Error("Unsupported Engine effect composition");
    composition.effects.forEach(effect => {
        assertJsonValue(effect);
        if (!effect || typeof effect !== "object" || Array.isArray(effect) || typeof effect.type !== "string")
            throw new Error("Composition children must be Engine effects");
    });
}
