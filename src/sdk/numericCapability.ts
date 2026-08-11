import type { EngineEffectRegistry, EngineEffectSettings } from "./effectRegistry.js";
import type { EngineSystemDefinition, EngineSystemRegistry } from "./systemRegistry.js";

export const NUMERIC_CAPABILITY = "numeric.state" as const;
export const NUMERIC_SET_EFFECT_ID = "numeric.set" as const;
export const NUMERIC_ADD_EFFECT_ID = "numeric.add" as const;
export const NUMERIC_RESET_EFFECT_ID = "numeric.reset" as const;
export const NUMERIC_EFFECT_IDS = [NUMERIC_SET_EFFECT_ID, NUMERIC_ADD_EFFECT_ID, NUMERIC_RESET_EFFECT_ID] as const;

export interface NumericTarget { type: "numeric"; entityId: string; stateId: string }
export interface NumericSetPayload { value: number }
export interface NumericAddPayload { amount: number }
export type NumericResetPayload = Record<string, never>;
export type NumericEffectSettings =
	| { schemaVersion: 1; type: typeof NUMERIC_SET_EFFECT_ID; target: NumericTarget; typeValue: NumericSetPayload }
	| { schemaVersion: 1; type: typeof NUMERIC_ADD_EFFECT_ID; target: NumericTarget; typeValue: NumericAddPayload }
	| { schemaVersion: 1; type: typeof NUMERIC_RESET_EFFECT_ID; target: NumericTarget; typeValue: NumericResetPayload };

export function numericSystemDefinition(): EngineSystemDefinition {
	return { id: "core.numeric", provides: [NUMERIC_CAPABILITY], acceptsEffects: [...NUMERIC_EFFECT_IDS] };
}

export function registerNumericSystem(registry: EngineSystemRegistry): EngineSystemRegistry {
	return registry.register(numericSystemDefinition());
}

export function registerNumericCommands(registry: EngineEffectRegistry): EngineEffectRegistry {
	return registry
		.register({ id: NUMERIC_SET_EFFECT_ID, requiresCapability: [NUMERIC_CAPABILITY], targetType: "numeric", lifecycleCategory: "command", validatePayload: payload => validateNumericPayload(payload, "Numeric set", "value"), validateTarget: validateNumericTarget })
		.register({ id: NUMERIC_ADD_EFFECT_ID, requiresCapability: [NUMERIC_CAPABILITY], targetType: "numeric", lifecycleCategory: "command", validatePayload: payload => validateNumericPayload(payload, "Numeric add", "amount"), validateTarget: validateNumericTarget })
		.register({ id: NUMERIC_RESET_EFFECT_ID, requiresCapability: [NUMERIC_CAPABILITY], targetType: "numeric", lifecycleCategory: "command", validatePayload: payload => { exactKeys(record(payload, "Numeric reset payload"), [], "Numeric reset payload"); }, validateTarget: validateNumericTarget });
}

export function validateNumericTarget(value: unknown): asserts value is NumericTarget {
	const target = record(value, "Numeric target");
	exactKeys(target, ["type", "entityId", "stateId"], "Numeric target");
	if (target.type !== "numeric") throw new Error("Numeric target type must be 'numeric'");
	if (typeof target.entityId !== "string" || target.entityId.length === 0) throw new Error("Numeric target requires a non-empty entityId");
	if (typeof target.stateId !== "string" || target.stateId.length === 0) throw new Error("Numeric target requires a non-empty stateId");
}

export function validateNumericEffectSettings(value: unknown): asserts value is NumericEffectSettings {
	const effect = record(value, "Numeric effect");
	exactKeys(effect, ["schemaVersion", "type", "target", "typeValue"], "Numeric effect");
	if (effect.schemaVersion !== 1) throw new Error("Unsupported numeric effect schema version");
	validateNumericTarget(effect.target);
	if (effect.type === NUMERIC_SET_EFFECT_ID) validateNumericPayload(effect.typeValue, "Numeric set", "value");
	else if (effect.type === NUMERIC_ADD_EFFECT_ID) validateNumericPayload(effect.typeValue, "Numeric add", "amount");
	else if (effect.type === NUMERIC_RESET_EFFECT_ID) exactKeys(record(effect.typeValue, "Numeric reset payload"), [], "Numeric reset payload");
	else throw new Error(`Unknown numeric effect '${String(effect.type)}'`);
}

function validateNumericPayload(payload: unknown, label: string, key: string): void {
	const value = record(payload, `${label} payload`);
	exactKeys(value, [key], `${label} payload`);
	if (typeof value[key] !== "number" || !Number.isFinite(value[key])) throw new Error(`${label} ${key} must be finite`);
}

function record(value: unknown, label: string): Record<string, any> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
	return value as Record<string, any>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
	if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw new Error(`${label} contains unexpected fields`);
}

export type NumericEffect = EngineEffectSettings;
