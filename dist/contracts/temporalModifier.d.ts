import type { EngineEffectSettings } from "../sdk/effectRegistry.js";
export declare const TEMPORAL_MODIFIER_SCHEMA_VERSION: 1;
export declare const TEMPORAL_DURATION_UNITS: readonly ["turns"];
export type TemporalDurationUnit = typeof TEMPORAL_DURATION_UNITS[number];
export interface TemporalModifierTarget {
    type: "entity";
    entityId: string;
}
export interface TemporalModifierSettings {
    schemaVersion: typeof TEMPORAL_MODIFIER_SCHEMA_VERSION;
    id: string;
    target: TemporalModifierTarget;
    effect: EngineEffectSettings;
    durationUnit: TemporalDurationUnit;
    duration: number;
    remaining: number;
    sourceId?: string;
    sourceOrder?: number;
}
export interface TemporalModifierTemplate {
    durationUnit: TemporalDurationUnit;
    duration: number;
    effect: EngineEffectSettings;
}
export declare function createTemporalModifierTemplate(input: TemporalModifierTemplate): TemporalModifierTemplate;
export declare function createTemporalModifier(input: Omit<TemporalModifierSettings, "schemaVersion" | "remaining"> & {
    remaining?: number;
}): TemporalModifierSettings;
export declare function advanceTemporalModifier(modifier: TemporalModifierSettings): TemporalModifierSettings | undefined;
export declare function validateTemporalModifier(value: unknown): asserts value is TemporalModifierSettings;
