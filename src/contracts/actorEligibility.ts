import { assertJsonValue, type JsonValue } from "./systemSettings.js";
import { advanceLifetime, createLifetime, validateLifetime } from "./lifetime.js";

export const ACTOR_ELIGIBILITY_SCHEMA_VERSION = 1 as const;
export const ACTOR_ELIGIBILITY_LIFETIME_SCHEMA_VERSION = 1 as const;

/** Entity-owned constraint that excludes the entity from acting while active. */
export interface ActorEligibilityConstraintSettings {
	schemaVersion: typeof ACTOR_ELIGIBILITY_SCHEMA_VERSION;
	id: string;
	mode: "excluded";
	sourceId?: string;
	sourceOrder?: number;
}

/** Turn lifetime stored separately from actor eligibility meaning. */
export interface ActorEligibilityConstraintLifetimeSettings {
	schemaVersion: typeof ACTOR_ELIGIBILITY_LIFETIME_SCHEMA_VERSION;
	id: string;
	constraintId: string;
	durationUnit: "turns";
	duration: number;
	remaining: number;
	sourceId?: string;
	sourceOrder?: number;
}

export interface ActorEligibilityConstraintTemplate {
	mode: "excluded";
	durationUnit: "turns";
	duration: number;
}

export function createActorEligibilityConstraint(input: Omit<ActorEligibilityConstraintSettings, "schemaVersion">): ActorEligibilityConstraintSettings {
	const constraint: ActorEligibilityConstraintSettings = {
		schemaVersion: ACTOR_ELIGIBILITY_SCHEMA_VERSION,
		id: input.id,
		mode: input.mode,
		...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
		...(input.sourceOrder === undefined ? {} : { sourceOrder: input.sourceOrder }),
	};
	validateActorEligibilityConstraint(constraint);
	return constraint;
}

export function createActorEligibilityConstraintLifetime(input: Omit<ActorEligibilityConstraintLifetimeSettings, "schemaVersion" | "remaining"> & { remaining?: number }): ActorEligibilityConstraintLifetimeSettings {
	const lifetime: ActorEligibilityConstraintLifetimeSettings = {
		schemaVersion: ACTOR_ELIGIBILITY_LIFETIME_SCHEMA_VERSION,
		id: input.id,
		constraintId: input.constraintId,
		...createLifetime({ durationUnit: input.durationUnit, duration: input.duration, remaining: input.remaining }),
		...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
		...(input.sourceOrder === undefined ? {} : { sourceOrder: input.sourceOrder }),
	};
	validateActorEligibilityConstraintLifetime(lifetime);
	return lifetime;
}

export function createActorEligibilityConstraintTemplate(input: ActorEligibilityConstraintTemplate): ActorEligibilityConstraintTemplate {
	const template = structuredClone(input);
	if (template.mode !== "excluded" || template.durationUnit !== "turns" || !Number.isSafeInteger(template.duration) || template.duration < 1) throw new Error("Actor eligibility constraint requires a positive turn duration");
	return template;
}

export function advanceActorEligibilityConstraintLifetime(lifetime: ActorEligibilityConstraintLifetimeSettings): ActorEligibilityConstraintLifetimeSettings | undefined {
	validateActorEligibilityConstraintLifetime(lifetime);
	const next = advanceLifetime({ durationUnit: lifetime.durationUnit, duration: lifetime.duration, remaining: lifetime.remaining });
	return next ? { ...structuredClone(lifetime), ...next } : undefined;
}

export function isActorEligible(constraints: readonly ActorEligibilityConstraintSettings[]): boolean {
	return !constraints.some(constraint => constraint.mode === "excluded");
}

export function validateActorEligibilityConstraint(value: unknown): asserts value is ActorEligibilityConstraintSettings {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Actor eligibility constraint must be an object");
	const constraint = value as Partial<ActorEligibilityConstraintSettings>;
	if (constraint.schemaVersion !== ACTOR_ELIGIBILITY_SCHEMA_VERSION) throw new Error("Unsupported actor eligibility constraint schema version");
	if (typeof constraint.id !== "string" || constraint.id.length === 0) throw new Error("Actor eligibility constraint requires a stable id");
	if (constraint.mode !== "excluded") throw new Error("Unsupported actor eligibility constraint mode");
	if (constraint.sourceId !== undefined && (typeof constraint.sourceId !== "string" || constraint.sourceId.length === 0)) throw new Error("Actor eligibility constraint sourceId must be non-empty");
	if (constraint.sourceOrder !== undefined && !Number.isSafeInteger(constraint.sourceOrder)) throw new Error("Actor eligibility constraint sourceOrder must be a safe integer");
	assertJsonValue(constraint as unknown as JsonValue);
}

export function validateActorEligibilityConstraintLifetime(value: unknown): asserts value is ActorEligibilityConstraintLifetimeSettings {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Actor eligibility constraint lifetime must be an object");
	const lifetime = value as Partial<ActorEligibilityConstraintLifetimeSettings>;
	if (lifetime.schemaVersion !== ACTOR_ELIGIBILITY_LIFETIME_SCHEMA_VERSION) throw new Error("Unsupported actor eligibility lifetime schema version");
	if (typeof lifetime.id !== "string" || lifetime.id.length === 0 || typeof lifetime.constraintId !== "string" || lifetime.constraintId.length === 0) throw new Error("Actor eligibility lifetime requires stable ids");
	if (lifetime.durationUnit !== "turns") throw new Error("Actor eligibility constraint lifetime requires turns");
	validateLifetime({ durationUnit: lifetime.durationUnit, duration: lifetime.duration, remaining: lifetime.remaining });
	if (lifetime.sourceId !== undefined && (typeof lifetime.sourceId !== "string" || lifetime.sourceId.length === 0)) throw new Error("Actor eligibility lifetime sourceId must be non-empty");
	if (lifetime.sourceOrder !== undefined && !Number.isSafeInteger(lifetime.sourceOrder)) throw new Error("Actor eligibility lifetime sourceOrder must be a safe integer");
	assertJsonValue(lifetime as unknown as JsonValue);
}

export function validateActorEligibilityState(constraints: readonly ActorEligibilityConstraintSettings[], lifetimes: readonly ActorEligibilityConstraintLifetimeSettings[]): void {
	const ids = new Set<string>();
	let previous: ActorEligibilityConstraintSettings | undefined;
	for (const constraint of constraints) {
		validateActorEligibilityConstraint(constraint);
		if (ids.has(constraint.id) || (previous && compareConstraintOrder(previous, constraint) > 0)) throw new Error("Actor eligibility constraints must be unique and canonically ordered");
		ids.add(constraint.id);
		previous = constraint;
	}
	const lifetimeIds = new Set<string>();
	let previousLifetime: ActorEligibilityConstraintLifetimeSettings | undefined;
	for (const lifetime of lifetimes) {
		validateActorEligibilityConstraintLifetime(lifetime);
		if (!ids.has(lifetime.constraintId)) throw new Error("Actor eligibility lifetime references an unknown constraint");
		if (lifetimeIds.has(lifetime.id) || (previousLifetime && compareLifetimeOrder(previousLifetime, lifetime) > 0)) throw new Error("Actor eligibility lifetimes must be unique and canonically ordered");
		lifetimeIds.add(lifetime.id);
		previousLifetime = lifetime;
	}
}

function compareConstraintOrder(first: ActorEligibilityConstraintSettings, second: ActorEligibilityConstraintSettings): number {
	return (first.sourceOrder ?? 0) - (second.sourceOrder ?? 0) || first.id.localeCompare(second.id);
}

function compareLifetimeOrder(first: ActorEligibilityConstraintLifetimeSettings, second: ActorEligibilityConstraintLifetimeSettings): number {
	return (first.sourceOrder ?? 0) - (second.sourceOrder ?? 0) || first.id.localeCompare(second.id);
}
