import { type JsonValue } from "../contracts/systemSettings.js";
export type EngineEffectSettings = {
    type: string;
    schemaVersion?: 1;
    typeValue: JsonValue;
    target?: JsonValue;
};
export interface EngineEffectDefinition {
    id: string;
    schemaVersion?: 1;
    requiresCapability?: readonly string[];
    targetType?: string;
    lifecycleCategory?: string;
    /** Runtime-only validation; never included in serialized descriptors. */
    validatePayload?: (payload: JsonValue) => void;
    /** Runtime-only target validation; never included in serialized descriptors. */
    validateTarget?: (target: JsonValue) => void;
}
export type EngineEffectDescriptor = Omit<EngineEffectDefinition, "validatePayload" | "validateTarget">;
/** Data catalog plus host-side validators for supported Effect contracts. */
export declare class EngineEffectRegistry {
    private readonly definitions;
    register(definition: EngineEffectDefinition): this;
    get(id: string): EngineEffectDefinition | undefined;
    /** Validates only JSON-safe effect data and the registered payload contract. */
    validate(effect: unknown): asserts effect is EngineEffectSettings;
    /** Returns a detached descriptor without runtime validator functions. */
    describe(): EngineEffectDescriptor[];
}
