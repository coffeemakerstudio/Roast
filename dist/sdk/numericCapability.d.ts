import type { EngineEffectRegistry, EngineEffectSettings } from "./effectRegistry.js";
import type { EngineSystemDefinition, EngineSystemRegistry } from "./systemRegistry.js";
export declare const NUMERIC_CAPABILITY: "numeric.state";
export declare const NUMERIC_SET_EFFECT_ID: "numeric.set";
export declare const NUMERIC_ADD_EFFECT_ID: "numeric.add";
export declare const NUMERIC_RESET_EFFECT_ID: "numeric.reset";
export declare const NUMERIC_EFFECT_IDS: readonly ["numeric.set", "numeric.add", "numeric.reset"];
export interface NumericTarget {
    type: "numeric";
    entityId: string;
    stateId: string;
}
export interface NumericSetPayload {
    value: number;
}
export interface NumericAddPayload {
    amount: number;
}
export type NumericResetPayload = Record<string, never>;
export type NumericEffectSettings = {
    schemaVersion: 1;
    type: typeof NUMERIC_SET_EFFECT_ID;
    target: NumericTarget;
    typeValue: NumericSetPayload;
} | {
    schemaVersion: 1;
    type: typeof NUMERIC_ADD_EFFECT_ID;
    target: NumericTarget;
    typeValue: NumericAddPayload;
} | {
    schemaVersion: 1;
    type: typeof NUMERIC_RESET_EFFECT_ID;
    target: NumericTarget;
    typeValue: NumericResetPayload;
};
export declare function numericSystemDefinition(): EngineSystemDefinition;
export declare function registerNumericSystem(registry: EngineSystemRegistry): EngineSystemRegistry;
export declare function registerNumericCommands(registry: EngineEffectRegistry): EngineEffectRegistry;
export declare function validateNumericTarget(value: unknown): asserts value is NumericTarget;
export declare function validateNumericEffectSettings(value: unknown): asserts value is NumericEffectSettings;
export type NumericEffect = EngineEffectSettings;
