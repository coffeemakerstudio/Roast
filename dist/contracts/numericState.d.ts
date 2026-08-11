import type { EngineEffectSettings } from "../sdk/effectRegistry.js";
export declare const NUMERIC_STATE_SCHEMA_VERSION: 1;
export declare const NUMERIC_THRESHOLD_COMPARATORS: readonly ["below", "below-or-equal", "above", "above-or-equal"];
export type NumericThresholdComparator = typeof NUMERIC_THRESHOLD_COMPARATORS[number];
/** A JSON-safe follow-up command relative to the numeric target entity. */
export type NumericThresholdEffect = Omit<EngineEffectSettings, "target">;
export interface NumericThreshold {
    schemaVersion: typeof NUMERIC_STATE_SCHEMA_VERSION;
    comparator: NumericThresholdComparator;
    value: number;
    effects: NumericThresholdEffect[];
}
export interface NumericThresholdBinding {
    schemaVersion: typeof NUMERIC_STATE_SCHEMA_VERSION;
    id: string;
    resetValue?: number;
    thresholds: NumericThreshold[];
}
/** Runtime capability for canonical entity-owned numeric values. */
export interface NumericStateOwner {
    getNumericValue(stateId: string): number;
    setNumericValue(stateId: string, value: number): void;
    getNumericResetValue(stateId: string): number | undefined;
    getNumericThresholds(stateId: string): NumericThresholdBinding[];
}
export declare function validateNumericThresholdBindings(value: unknown): asserts value is NumericThresholdBinding[];
export declare function validateNumericThresholdBinding(value: unknown): asserts value is NumericThresholdBinding;
export declare function validateNumericThreshold(value: unknown): asserts value is NumericThreshold;
