import { assertJsonValue, type JsonValue } from "./systemSettings.js";
import { advanceLifetime, createLifetime, validateLifetime, type LifetimeSettings } from "./lifetime.js";

export const STRUCTURE_LIFECYCLE_SCHEMA_VERSION = 1 as const;
export const STRUCTURE_LIFECYCLE_DURATION_UNITS = ["turns"] as const;
export type StructureLifecycleDurationUnit = typeof STRUCTURE_LIFECYCLE_DURATION_UNITS[number];

/** Generic geometry payload required by the first timed-structure consumer. */
export interface StructureLifecycleStructure {
	type: "rectangle";
	w: number;
	h: number;
	color?: string;
	role?: "solid" | "containment" | "both";
}

export interface StructureLifecycleTemplate {
	durationUnit: StructureLifecycleDurationUnit;
	duration: number;
	structure: StructureLifecycleStructure;
}

export interface StructureLifecycleSettings {
	schemaVersion: typeof STRUCTURE_LIFECYCLE_SCHEMA_VERSION;
	id: string;
	structureId: string;
	durationUnit: StructureLifecycleDurationUnit;
	duration: number;
	remaining: number;
	sourceId?: string;
	sourceOrder?: number;
	targetId?: string;
}

export function createStructureLifecycleTemplate(input: StructureLifecycleTemplate): StructureLifecycleTemplate {
	const template = structuredClone(input);
	validateStructureLifecycleTemplate(template);
	return template;
}

export function createStructureLifecycle(input: Omit<StructureLifecycleSettings, "schemaVersion" | "remaining"> & { remaining?: number }): StructureLifecycleSettings {
	const lifecycle: StructureLifecycleSettings = {
		schemaVersion: STRUCTURE_LIFECYCLE_SCHEMA_VERSION,
		id: input.id,
		structureId: input.structureId,
		...createLifetime({ durationUnit: input.durationUnit, duration: input.duration, remaining: input.remaining }),
		...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
		...(input.sourceOrder === undefined ? {} : { sourceOrder: input.sourceOrder }),
		...(input.targetId === undefined ? {} : { targetId: input.targetId }),
	};
	validateStructureLifecycle(lifecycle);
	return lifecycle;
}

export function advanceStructureLifecycle(lifecycle: StructureLifecycleSettings): StructureLifecycleSettings | undefined {
	validateStructureLifecycle(lifecycle);
	const next = advanceLifetime(lifetimeOf(lifecycle));
	return next ? { ...structuredClone(lifecycle), ...next } : undefined;
}

export function validateStructureLifecycleTemplate(value: unknown): asserts value is StructureLifecycleTemplate {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Structure lifecycle template must be an object");
	const template = value as Partial<StructureLifecycleTemplate>;
	if (template.durationUnit !== "turns") throw new Error("Structure lifecycle requires turns duration");
	validateLifetime({ durationUnit: template.durationUnit, duration: template.duration, remaining: template.duration });
	if (!template.structure || typeof template.structure !== "object" || Array.isArray(template.structure)) throw new Error("Structure lifecycle requires structure geometry");
	const structure = template.structure as Partial<StructureLifecycleStructure>;
	if (structure.type !== "rectangle") throw new Error("Structure lifecycle currently requires rectangle geometry");
	if (typeof structure.w !== "number" || !Number.isFinite(structure.w) || structure.w <= 0) throw new Error("Structure lifecycle width must be positive");
	if (typeof structure.h !== "number" || !Number.isFinite(structure.h) || structure.h <= 0) throw new Error("Structure lifecycle height must be positive");
	if (structure.color !== undefined && typeof structure.color !== "string") throw new Error("Structure lifecycle color must be a string");
	if (structure.role !== undefined && !["solid", "containment", "both"].includes(structure.role)) throw new Error("Structure lifecycle role is invalid");
	assertJsonValue(structure as unknown as JsonValue);
}

export function validateStructureLifecycle(value: unknown): asserts value is StructureLifecycleSettings {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Structure lifecycle must be an object");
	const lifecycle = value as Partial<StructureLifecycleSettings>;
	if (lifecycle.schemaVersion !== STRUCTURE_LIFECYCLE_SCHEMA_VERSION) throw new Error("Unsupported structure lifecycle schema version");
	if (typeof lifecycle.id !== "string" || lifecycle.id.length === 0) throw new Error("Structure lifecycle requires a stable id");
	if (typeof lifecycle.structureId !== "string" || lifecycle.structureId.length === 0) throw new Error("Structure lifecycle requires a stable structure id");
	if (lifecycle.sourceId !== undefined && (typeof lifecycle.sourceId !== "string" || lifecycle.sourceId.length === 0)) throw new Error("Structure lifecycle sourceId must be non-empty");
	if (lifecycle.sourceOrder !== undefined && !Number.isSafeInteger(lifecycle.sourceOrder)) throw new Error("Structure lifecycle sourceOrder must be a safe integer");
	if (lifecycle.targetId !== undefined && (typeof lifecycle.targetId !== "string" || lifecycle.targetId.length === 0)) throw new Error("Structure lifecycle targetId must be non-empty");
	if (lifecycle.durationUnit !== "turns") throw new Error("Structure lifecycle requires turns duration");
	validateLifetime({ durationUnit: lifecycle.durationUnit, duration: lifecycle.duration, remaining: lifecycle.remaining });
}

function lifetimeOf(value: Pick<StructureLifecycleSettings, "durationUnit" | "duration" | "remaining">): LifetimeSettings & { durationUnit: StructureLifecycleDurationUnit } {
	return { durationUnit: value.durationUnit, duration: value.duration, remaining: value.remaining };
}
