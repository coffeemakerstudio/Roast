import { assertJsonValue, type JsonValue } from "./systemSettings.js";
import type { EngineEffectSettings } from "../sdk/effectRegistry.js";
import { advanceLifetime, createLifetime, validateLifetime, type LifetimeSettings } from "./lifetime.js";

export const TEMPORAL_MODIFIER_SCHEMA_VERSION = 1 as const;
export const TEMPORAL_DURATION_UNITS = ["turns"] as const;
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

export function createTemporalModifierTemplate(input: TemporalModifierTemplate): TemporalModifierTemplate {
	const template = structuredClone(input);
	if (template.durationUnit !== "turns") throw new Error("Temporal modifier requires turns duration");
	if (!Number.isSafeInteger(template.duration) || template.duration < 1) throw new Error("Temporal modifier duration must be a positive integer");
	if (!template.effect || typeof template.effect !== "object" || Array.isArray(template.effect)) throw new Error("Temporal modifier requires an Engine effect");
	assertJsonValue(template.effect as unknown as JsonValue);
	if (template.effect.schemaVersion !== 1 || typeof template.effect.type !== "string") throw new Error("Temporal modifier Engine effect is invalid");
	return template;
}

export function createTemporalModifier(input: Omit<TemporalModifierSettings, "schemaVersion" | "remaining"> & { remaining?: number }): TemporalModifierSettings {
	const modifier: TemporalModifierSettings = {
		schemaVersion: TEMPORAL_MODIFIER_SCHEMA_VERSION,
		id: input.id,
		target: { ...input.target },
		effect: structuredClone(input.effect),
		...createLifetime({ durationUnit: input.durationUnit, duration: input.duration, remaining: input.remaining }),
		...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
		...(input.sourceOrder === undefined ? {} : { sourceOrder: input.sourceOrder }),
	};
	validateTemporalModifier(modifier);
	return modifier;
}

export function advanceTemporalModifier(modifier: TemporalModifierSettings): TemporalModifierSettings | undefined {
	validateTemporalModifier(modifier);
	const next = advanceLifetime(lifetimeOf(modifier));
	return next ? { ...structuredClone(modifier), ...next } : undefined;
}

export function validateTemporalModifier(value: unknown): asserts value is TemporalModifierSettings {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Temporal modifier must be an object");
	const modifier = value as Partial<TemporalModifierSettings>;
	if (modifier.schemaVersion !== TEMPORAL_MODIFIER_SCHEMA_VERSION) throw new Error("Unsupported temporal modifier schema version");
	if (typeof modifier.id !== "string" || modifier.id.length === 0) throw new Error("Temporal modifier requires a stable id");
	if (modifier.sourceId !== undefined && (typeof modifier.sourceId !== "string" || modifier.sourceId.length === 0)) throw new Error("Temporal modifier sourceId must be non-empty");
	if (modifier.sourceOrder !== undefined && !Number.isSafeInteger(modifier.sourceOrder)) throw new Error("Temporal modifier sourceOrder must be a safe integer");
	if (!modifier.target || modifier.target.type !== "entity" || typeof modifier.target.entityId !== "string" || modifier.target.entityId.length === 0) throw new Error("Temporal modifier requires a stable entity target");
	if (modifier.durationUnit !== "turns") throw new Error("Temporal modifier requires turns duration");
	validateLifetime({ durationUnit: modifier.durationUnit, duration: modifier.duration, remaining: modifier.remaining });
	if (!modifier.effect || typeof modifier.effect !== "object" || Array.isArray(modifier.effect)) throw new Error("Temporal modifier requires an Engine effect");
	assertJsonValue(modifier.effect as unknown as JsonValue);
	if (modifier.effect.schemaVersion !== 1 || typeof modifier.effect.type !== "string") throw new Error("Temporal modifier Engine effect is invalid");
	const effectKeys = Object.keys(modifier.effect);
	if (effectKeys.some(key => !["schemaVersion", "type", "typeValue", "target"].includes(key))) throw new Error("Temporal modifier Engine effect contains unexpected fields");
}

function lifetimeOf(value: Pick<TemporalModifierSettings, "durationUnit" | "duration" | "remaining">): LifetimeSettings & { durationUnit: TemporalDurationUnit } {
	return { durationUnit: value.durationUnit, duration: value.duration, remaining: value.remaining };
}
