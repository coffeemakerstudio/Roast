import { assertJsonValue, type JsonValue } from "./systemSettings.js";
import type { EngineEffectSettings } from "../sdk/effectRegistry.js";
import { advanceLifetime, createLifetime, validateLifetime, type LifetimeSettings } from "./lifetime.js";

export const DEFERRED_EFFECT_SCHEMA_VERSION = 1 as const;
export const DEFERRED_EFFECT_DURATION_UNITS = ["ticks"] as const;
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

export function createDeferredEffectTemplate(input: DeferredEffectTemplate): DeferredEffectTemplate {
	const template = structuredClone(input);
	validateDeferredEffectTemplate(template);
	return template;
}

export function createDeferredEffect(input: Omit<DeferredEffectSettings, "schemaVersion" | "remaining"> & { remaining?: number }): DeferredEffectSettings {
	const deferred: DeferredEffectSettings = {
		schemaVersion: DEFERRED_EFFECT_SCHEMA_VERSION,
		id: input.id,
		...createLifetime({ durationUnit: input.durationUnit, duration: input.duration, remaining: input.remaining }),
		effect: structuredClone(input.effect),
		...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
		...(input.sourceOrder === undefined ? {} : { sourceOrder: input.sourceOrder }),
		...(input.ownerId === undefined ? {} : { ownerId: input.ownerId }),
	};
	validateDeferredEffect(deferred);
	return deferred;
}

export function advanceDeferredEffect(effect: DeferredEffectSettings): DeferredEffectSettings | undefined {
	validateDeferredEffect(effect);
	const next = advanceLifetime(lifetimeOf(effect));
	return next ? { ...structuredClone(effect), ...next } : undefined;
}

export function validateDeferredEffectTemplate(value: unknown): asserts value is DeferredEffectTemplate {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Deferred effect template must be an object");
	const template = value as Partial<DeferredEffectTemplate>;
	if (template.durationUnit !== "ticks") throw new Error("Deferred effect requires ticks duration");
	validateLifetime({ durationUnit: template.durationUnit, duration: template.duration, remaining: template.duration });
	validateEngineEffect(template.effect);
}

export function validateDeferredEffect(value: unknown): asserts value is DeferredEffectSettings {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Deferred effect must be an object");
	const effect = value as Partial<DeferredEffectSettings>;
	if (effect.schemaVersion !== DEFERRED_EFFECT_SCHEMA_VERSION) throw new Error("Unsupported deferred effect schema version");
	if (typeof effect.id !== "string" || effect.id.length === 0) throw new Error("Deferred effect requires a stable id");
	if (effect.sourceId !== undefined && (typeof effect.sourceId !== "string" || effect.sourceId.length === 0)) throw new Error("Deferred effect sourceId must be non-empty");
	if (effect.sourceOrder !== undefined && !Number.isSafeInteger(effect.sourceOrder)) throw new Error("Deferred effect sourceOrder must be a safe integer");
	if (effect.ownerId !== undefined && (typeof effect.ownerId !== "string" || effect.ownerId.length === 0)) throw new Error("Deferred effect ownerId must be non-empty");
	if (effect.durationUnit !== "ticks") throw new Error("Deferred effect requires ticks duration");
	validateLifetime({ durationUnit: effect.durationUnit, duration: effect.duration, remaining: effect.duration });
	validateLifetime({ durationUnit: effect.durationUnit, duration: effect.duration, remaining: effect.remaining });
	validateEngineEffect(effect.effect);
}

function validateEngineEffect(value: unknown): asserts value is EngineEffectSettings {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Deferred effect requires an Engine effect");
	const effect = value as Partial<EngineEffectSettings>;
	if (effect.schemaVersion !== 1 || typeof effect.type !== "string" || effect.type.length === 0) throw new Error("Deferred Engine effect is invalid");
	assertJsonValue(effect.typeValue as JsonValue);
	if (effect.target !== undefined) assertJsonValue(effect.target);
}


function lifetimeOf(value: Pick<DeferredEffectSettings, "durationUnit" | "duration" | "remaining">): LifetimeSettings & { durationUnit: DeferredEffectDurationUnit } {
	return { durationUnit: value.durationUnit, duration: value.duration, remaining: value.remaining };
}
