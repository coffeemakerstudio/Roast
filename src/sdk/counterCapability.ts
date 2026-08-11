import type { JsonValue } from "../contracts/systemSettings.js";
import { COUNTER_SCHEMA_VERSION, type CounterState } from "../contracts/counterState.js";
import type { EngineEffectRegistry, EngineEffectSettings } from "./effectRegistry.js";
import type { EngineSystemDefinition, EngineSystemRegistry } from "./systemRegistry.js";
import type { EngineTriggerEvent, EngineTriggerType } from "./trigger.js";
import { validateTriggerEvent } from "./trigger.js";

export const COUNTER_CAPABILITY = "counter.state" as const;
export const COUNTER_SET_EFFECT_ID = "counter.set" as const;
export const COUNTER_ADD_EFFECT_ID = "counter.add" as const;
export const COUNTER_RESET_EFFECT_ID = "counter.reset" as const;
export const COUNTER_EFFECT_IDS = [COUNTER_SET_EFFECT_ID, COUNTER_ADD_EFFECT_ID, COUNTER_RESET_EFFECT_ID] as const;

export function counterSystemDefinition(): EngineSystemDefinition {
	return { id: "core.counter", provides: [COUNTER_CAPABILITY], acceptsEffects: [...COUNTER_EFFECT_IDS] };
}

export function registerCounterSystem(registry: EngineSystemRegistry): EngineSystemRegistry {
	return registry.register(counterSystemDefinition());
}

export interface CounterTarget {
	type: "counter";
	counterId: string;
}

export interface CounterSetPayload { value: number }
export interface CounterAddPayload { amount: number }
export type CounterResetPayload = Record<string, never>;

export interface CounterTriggerBinding {
	trigger: EngineTriggerType;
	effect: CounterEffectSettings;
}

export type CounterEffectSettings =
	| { schemaVersion: typeof COUNTER_SCHEMA_VERSION; type: typeof COUNTER_SET_EFFECT_ID; target: CounterTarget; typeValue: CounterSetPayload }
	| { schemaVersion: typeof COUNTER_SCHEMA_VERSION; type: typeof COUNTER_ADD_EFFECT_ID; target: CounterTarget; typeValue: CounterAddPayload }
	| { schemaVersion: typeof COUNTER_SCHEMA_VERSION; type: typeof COUNTER_RESET_EFFECT_ID; target: CounterTarget; typeValue: CounterResetPayload };

/** Registers the generic counter mutation family without selecting its runtime interpreter. */
export function registerCounterCommands(registry: EngineEffectRegistry): EngineEffectRegistry {
	return registry
		.register({ id: COUNTER_SET_EFFECT_ID, requiresCapability: [COUNTER_CAPABILITY], targetType: "counter", lifecycleCategory: "command", validatePayload: payload => validateNumericPayload(payload, "Counter set", "value"), validateTarget: validateCounterTargetValue })
		.register({ id: COUNTER_ADD_EFFECT_ID, requiresCapability: [COUNTER_CAPABILITY], targetType: "counter", lifecycleCategory: "command", validatePayload: payload => validateNumericPayload(payload, "Counter add", "amount"), validateTarget: validateCounterTargetValue })
		.register({ id: COUNTER_RESET_EFFECT_ID, requiresCapability: [COUNTER_CAPABILITY], targetType: "counter", lifecycleCategory: "command", validatePayload: payload => exactKeys(record(payload, "Counter reset payload"), [], "Counter reset payload"), validateTarget: validateCounterTargetValue });
}

/** Validates the complete current counter command, including its stable target. */
export function validateCounterEffectSettings(value: unknown): asserts value is CounterEffectSettings {
	const effect = record(value, "Counter effect");
	exactKeys(effect, ["schemaVersion", "type", "target", "typeValue"], "Counter effect");
	if (effect.schemaVersion !== COUNTER_SCHEMA_VERSION) throw new Error("Unsupported counter effect schema version");
	validateCounterTargetValue(effect.target as JsonValue);
	if (effect.type === COUNTER_SET_EFFECT_ID) validateNumericPayload(effect.typeValue as JsonValue, "Counter set", "value");
	else if (effect.type === COUNTER_ADD_EFFECT_ID) validateNumericPayload(effect.typeValue as JsonValue, "Counter add", "amount");
	else if (effect.type === COUNTER_RESET_EFFECT_ID) exactKeys(record(effect.typeValue, "Counter reset payload"), [], "Counter reset payload");
	else throw new Error(`Unknown counter effect '${String(effect.type)}'`);
}

export function validateCounterTarget(target: unknown): asserts target is CounterTarget {
	validateCounterTargetValue(target as JsonValue);
}

export function validateCounterTriggerBinding(value: unknown): asserts value is CounterTriggerBinding {
	const binding = record(value, "Counter trigger binding");
	if (typeof binding.trigger !== "string" || !["tick", "collision.enter", "round.start", "environment.activation", "schedule.due"].includes(binding.trigger)) throw new Error("Counter trigger binding has an unknown trigger");
	validateCounterEffectSettings(binding.effect);
}

export function counterTriggerMatches(binding: CounterTriggerBinding, event: EngineTriggerEvent): boolean {
	validateCounterTriggerBinding(binding);
	validateTriggerEvent(event);
	return binding.trigger === event.type;
}

function validateCounterTargetValue(target: JsonValue): void {
	const value = record(target, "Counter target");
	exactKeys(value, ["type", "counterId"], "Counter target");
	if (value.type !== "counter") throw new Error("Counter target type must be 'counter'");
	if (typeof value.counterId !== "string" || value.counterId.length === 0) throw new Error("Counter target requires a non-empty counterId");
}

function validateNumericPayload(payload: JsonValue, label: string, key: string): void {
	const value = record(payload, `${label} payload`);
	exactKeys(value, [key], `${label} payload`);
	if (typeof value[key] !== "number" || !Number.isFinite(value[key])) throw new Error(`${label} ${key} must be finite`);
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
	return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
	const allowed = new Set(keys);
	for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contains unexpected fields`);
	for (const key of keys) if (!(key in value)) throw new Error(`${label} is missing '${key}'`);
}

export type CounterStateSnapshot = CounterState;
export type CounterEffect = EngineEffectSettings;
