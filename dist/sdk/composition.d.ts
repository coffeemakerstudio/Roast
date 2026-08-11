import { type JsonValue } from "../contracts/systemSettings.js";
import type { EngineEffectSettings } from "./effectRegistry.js";
export declare const ENGINE_EFFECT_COMPOSITION_SCHEMA_VERSION: 1;
export declare const ENGINE_EFFECT_COMPOSITION_TYPE: "effect.composition";
/** Ordered current Engine commands. It contains no interpreter-specific logic. */
export interface EngineEffectComposition {
    schemaVersion: 1;
    type: typeof ENGINE_EFFECT_COMPOSITION_TYPE;
    effects: EngineEffectSettings[];
}
export declare function createEngineEffectComposition(effects: readonly EngineEffectSettings[]): EngineEffectComposition;
export declare function validateEngineEffectComposition(value: unknown): asserts value is EngineEffectComposition;
export type EngineEffectCompositionInput = JsonValue;
