import type { EngineEffectSettings } from "../sdk/effectRegistry.js";
export declare const DEFERRED_EFFECT_SCHEMA_VERSION: 1;
export declare const DEFERRED_EFFECT_DURATION_UNITS: readonly ["ticks"];
export type DeferredEffectDurationUnit = typeof DEFERRED_EFFECT_DURATION_UNITS[number];
export interface DeferredEffectTemplate {
    durationUnit: DeferredEffectDurationUnit;
    duration: number;
    effect: EngineEffectSettings;
}
export interface DeferredEffectSettings {
    schemaVersion: typeof DEFERRED_EFFECT_SCHEMA_VERSION;
    id: string;
    durationUnit: DeferredEffectDurationUnit;
    duration: number;
    remaining: number;
    effect: EngineEffectSettings;
    sourceId?: string;
    sourceOrder?: number;
    ownerId?: string;
}
export declare function createDeferredEffectTemplate(input: DeferredEffectTemplate): DeferredEffectTemplate;
export declare function createDeferredEffect(input: Omit<DeferredEffectSettings, "schemaVersion" | "remaining"> & {
    remaining?: number;
}): DeferredEffectSettings;
export declare function advanceDeferredEffect(effect: DeferredEffectSettings): DeferredEffectSettings | undefined;
export declare function validateDeferredEffectTemplate(value: unknown): asserts value is DeferredEffectTemplate;
export declare function validateDeferredEffect(value: unknown): asserts value is DeferredEffectSettings;
