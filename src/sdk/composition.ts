import { assertJsonValue, type JsonValue } from "../contracts/systemSettings.js";
import type { EngineEffectSettings } from "./effectRegistry.js";

export const ENGINE_EFFECT_COMPOSITION_SCHEMA_VERSION = 1 as const;
export const ENGINE_EFFECT_COMPOSITION_TYPE = "effect.composition" as const;

/** Ordered current Engine commands. It contains no interpreter-specific logic. */
export interface EngineEffectComposition {
	schemaVersion: 1;
	type: typeof ENGINE_EFFECT_COMPOSITION_TYPE;
	effects: EngineEffectSettings[];
}

export function createEngineEffectComposition(effects: readonly EngineEffectSettings[]): EngineEffectComposition {
	const composition: EngineEffectComposition = { schemaVersion: 1, type: ENGINE_EFFECT_COMPOSITION_TYPE, effects: structuredClone([...effects]) };
	validateEngineEffectComposition(composition);
	return composition;
}

export function validateEngineEffectComposition(value: unknown): asserts value is EngineEffectComposition {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed Engine effect composition");
	const composition = value as Record<string, unknown>;
	if (Object.keys(composition).some(key => !["schemaVersion", "type", "effects"].includes(key)) || Object.keys(composition).length !== 3) throw new Error("Malformed Engine effect composition");
	if (composition.schemaVersion !== 1 || composition.type !== ENGINE_EFFECT_COMPOSITION_TYPE || !Array.isArray(composition.effects)) throw new Error("Unsupported Engine effect composition");
	composition.effects.forEach(effect => {
		assertJsonValue(effect);
		if (!effect || typeof effect !== "object" || Array.isArray(effect) || typeof (effect as Record<string, unknown>).type !== "string") throw new Error("Composition children must be Engine effects");
	});
}

export type EngineEffectCompositionInput = JsonValue;
