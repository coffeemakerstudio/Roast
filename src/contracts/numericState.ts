import { assertJsonValue, type JsonValue } from "./systemSettings.js";
import type { EngineEffectSettings } from "../sdk/effectRegistry.js";

export const NUMERIC_STATE_SCHEMA_VERSION = 1 as const;
export const NUMERIC_THRESHOLD_COMPARATORS = ["below", "below-or-equal", "above", "above-or-equal"] as const;
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

export function validateNumericThresholdBindings(value: unknown): asserts value is NumericThresholdBinding[] {
	if (!Array.isArray(value)) throw new Error("Numeric threshold bindings must be an array");
	const bindings = value.map(binding => {
		validateNumericThresholdBinding(binding);
		return structuredClone(binding);
	});
	if (new Set(bindings.map(binding => binding.id)).size !== bindings.length) throw new Error("Numeric threshold IDs must be unique");
}

export function validateNumericThresholdBinding(value: unknown): asserts value is NumericThresholdBinding {
	const binding = record(value, "Numeric threshold binding");
	knownKeys(binding, ["schemaVersion", "id", "resetValue", "thresholds"], "Numeric threshold binding");
	if (binding.schemaVersion !== NUMERIC_STATE_SCHEMA_VERSION) throw new Error("Unsupported numeric threshold schema version");
	identifier(binding.id, "Numeric threshold ID");
	if (binding.resetValue !== undefined && (typeof binding.resetValue !== "number" || !Number.isFinite(binding.resetValue))) throw new Error("Numeric resetValue must be finite");
	if (!Array.isArray(binding.thresholds)) throw new Error("Numeric threshold binding requires thresholds");
	binding.thresholds.forEach(validateNumericThreshold);
}

export function validateNumericThreshold(value: unknown): asserts value is NumericThreshold {
	const threshold = record(value, "Numeric threshold");
	exactKeys(threshold, ["schemaVersion", "comparator", "value", "effects"], "Numeric threshold");
	if (threshold.schemaVersion !== NUMERIC_STATE_SCHEMA_VERSION) throw new Error("Unsupported numeric threshold schema version");
	if (!(NUMERIC_THRESHOLD_COMPARATORS as readonly unknown[]).includes(threshold.comparator)) throw new Error("Unknown numeric threshold comparator");
	if (typeof threshold.value !== "number" || !Number.isFinite(threshold.value)) throw new Error("Numeric threshold value must be finite");
	if (!Array.isArray(threshold.effects) || threshold.effects.length === 0) throw new Error("Numeric threshold requires at least one follow-up effect");
	threshold.effects.forEach(validateRelativeEffect);
}

function validateRelativeEffect(value: unknown): asserts value is NumericThresholdEffect {
	const effect = record(value, "Numeric threshold effect");
	if (Object.keys(effect).some(key => !["schemaVersion", "type", "typeValue"].includes(key)) || Object.keys(effect).length !== 3) throw new Error("Numeric threshold effects cannot declare their own target");
	if (effect.schemaVersion !== undefined && effect.schemaVersion !== 1) throw new Error("Unsupported numeric threshold effect schema version");
	if (typeof effect.type !== "string" || effect.type.length === 0) throw new Error("Numeric threshold effect requires a type");
	assertJsonValue(effect.typeValue as JsonValue);
}

function identifier(value: unknown, label: string): asserts value is string {
	if (typeof value !== "string" || !/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(value)) throw new Error(`${label} must be a stable identifier`);
}

function record(value: unknown, label: string): Record<string, any> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
	return value as Record<string, any>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
	if (Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw new Error(`${label} contains unexpected fields`);
}

function knownKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
	if (Object.keys(value).some(key => !keys.includes(key))) throw new Error(`${label} contains unexpected fields`);
}
