import { COUNTER_SCHEMA_VERSION, type CounterState } from "../contracts/counterState.js";
import type { EngineEffectRegistry, EngineEffectSettings } from "./effectRegistry.js";
import type { EngineSystemDefinition, EngineSystemRegistry } from "./systemRegistry.js";
import type { EngineTriggerEvent, EngineTriggerType } from "./trigger.js";
export declare const COUNTER_CAPABILITY: "counter.state";
export declare const COUNTER_SET_EFFECT_ID: "counter.set";
export declare const COUNTER_ADD_EFFECT_ID: "counter.add";
export declare const COUNTER_RESET_EFFECT_ID: "counter.reset";
export declare const COUNTER_EFFECT_IDS: readonly ["counter.set", "counter.add", "counter.reset"];
export declare function counterSystemDefinition(): EngineSystemDefinition;
export declare function registerCounterSystem(registry: EngineSystemRegistry): EngineSystemRegistry;
export interface CounterTarget {
    type: "counter";
    counterId: string;
}
export interface CounterSetPayload {
    value: number;
}
export interface CounterAddPayload {
    amount: number;
}
export type CounterResetPayload = Record<string, never>;
export interface CounterTriggerBinding {
    trigger: EngineTriggerType;
    effect: CounterEffectSettings;
}
export type CounterEffectSettings = {
    schemaVersion: typeof COUNTER_SCHEMA_VERSION;
    type: typeof COUNTER_SET_EFFECT_ID;
    target: CounterTarget;
    typeValue: CounterSetPayload;
} | {
    schemaVersion: typeof COUNTER_SCHEMA_VERSION;
    type: typeof COUNTER_ADD_EFFECT_ID;
    target: CounterTarget;
    typeValue: CounterAddPayload;
} | {
    schemaVersion: typeof COUNTER_SCHEMA_VERSION;
    type: typeof COUNTER_RESET_EFFECT_ID;
    target: CounterTarget;
    typeValue: CounterResetPayload;
};
/** Registers the generic counter mutation family without selecting its runtime interpreter. */
export declare function registerCounterCommands(registry: EngineEffectRegistry): EngineEffectRegistry;
/** Validates the complete current counter command, including its stable target. */
export declare function validateCounterEffectSettings(value: unknown): asserts value is CounterEffectSettings;
export declare function validateCounterTarget(target: unknown): asserts target is CounterTarget;
export declare function validateCounterTriggerBinding(value: unknown): asserts value is CounterTriggerBinding;
export declare function counterTriggerMatches(binding: CounterTriggerBinding, event: EngineTriggerEvent): boolean;
export type CounterStateSnapshot = CounterState;
export type CounterEffect = EngineEffectSettings;
