import { assertJsonValue, type JsonValue } from "./systemSettings.js";
import { advanceLifetime, createLifetime, validateLifetime, type LifetimeSettings } from "./lifetime.js";

export const COLLISION_FILTER_SCHEMA_VERSION = 1 as const;
export const COLLISION_FILTER_LIFETIME_SCHEMA_VERSION = 1 as const;
export const COLLISION_CATEGORIES = ["entity", "structure"] as const;
export type CollisionCategory = typeof COLLISION_CATEGORIES[number];

/** Entity-owned relation exclusions; lifetime is stored by the owner separately. */
export interface CollisionFilterSettings {
	schemaVersion: typeof COLLISION_FILTER_SCHEMA_VERSION;
	id: string;
	excludedCategories: CollisionCategory[];
	sourceId?: string;
	sourceOrder?: number;
}

/** Turn lifetime for an entity-owned collision filter. */
export interface CollisionFilterLifetimeSettings {
	schemaVersion: typeof COLLISION_FILTER_LIFETIME_SCHEMA_VERSION;
	id: string;
	filterId: string;
	durationUnit: "turns";
	duration: number;
	remaining: number;
	sourceId?: string;
	sourceOrder?: number;
}

export interface CollisionFilterTemplate {
	excludedCategories: CollisionCategory[];
	durationUnit: "turns";
	duration: number;
}

export function createCollisionFilterTemplate(input: CollisionFilterTemplate): CollisionFilterTemplate {
	const template = structuredClone(input);
	validateExcludedCategories(template.excludedCategories);
	if (template.durationUnit !== "turns" || !Number.isSafeInteger(template.duration) || template.duration < 1) throw new Error("Collision filter template requires a positive turn duration");
	return template;
}

export function createCollisionFilter(input: Omit<CollisionFilterSettings, "schemaVersion">): CollisionFilterSettings {
	const filter: CollisionFilterSettings = {
		schemaVersion: COLLISION_FILTER_SCHEMA_VERSION,
		id: input.id,
		excludedCategories: [...input.excludedCategories],
		...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
		...(input.sourceOrder === undefined ? {} : { sourceOrder: input.sourceOrder }),
	};
	validateCollisionFilter(filter);
	return filter;
}

export function createCollisionFilterLifetime(input: Omit<CollisionFilterLifetimeSettings, "schemaVersion" | "remaining"> & { remaining?: number }): CollisionFilterLifetimeSettings {
	const lifetime: CollisionFilterLifetimeSettings = {
		schemaVersion: COLLISION_FILTER_LIFETIME_SCHEMA_VERSION,
		id: input.id,
		filterId: input.filterId,
		...createLifetime({ durationUnit: input.durationUnit, duration: input.duration, remaining: input.remaining }),
		...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
		...(input.sourceOrder === undefined ? {} : { sourceOrder: input.sourceOrder }),
	};
	validateCollisionFilterLifetime(lifetime);
	return lifetime;
}

export function advanceCollisionFilterLifetime(lifetime: CollisionFilterLifetimeSettings): CollisionFilterLifetimeSettings | undefined {
	validateCollisionFilterLifetime(lifetime);
	const next = advanceLifetime(lifetimeOf(lifetime));
	return next ? { ...structuredClone(lifetime), ...next } : undefined;
}

export function isCollisionAllowed(
	firstCategory: CollisionCategory,
	firstFilters: readonly CollisionFilterSettings[],
	secondCategory: CollisionCategory,
	secondFilters: readonly CollisionFilterSettings[],
): boolean {
	return !firstFilters.some(filter => filter.excludedCategories.includes(secondCategory)) &&
		!secondFilters.some(filter => filter.excludedCategories.includes(firstCategory));
}

export function validateCollisionFilter(value: unknown): asserts value is CollisionFilterSettings {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Collision filter must be an object");
	const filter = value as Partial<CollisionFilterSettings>;
	if (filter.schemaVersion !== COLLISION_FILTER_SCHEMA_VERSION) throw new Error("Unsupported collision filter schema version");
	if (typeof filter.id !== "string" || filter.id.length === 0) throw new Error("Collision filter requires a stable id");
	if (!Array.isArray(filter.excludedCategories) || filter.excludedCategories.length === 0) throw new Error("Collision filter requires excluded categories");
	validateExcludedCategories(filter.excludedCategories);
	if (filter.sourceId !== undefined && (typeof filter.sourceId !== "string" || filter.sourceId.length === 0)) throw new Error("Collision filter sourceId must be non-empty");
	if (filter.sourceOrder !== undefined && !Number.isSafeInteger(filter.sourceOrder)) throw new Error("Collision filter sourceOrder must be a safe integer");
	assertJsonValue(filter as unknown as JsonValue);
}

export function validateCollisionFilterLifetime(value: unknown): asserts value is CollisionFilterLifetimeSettings {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Collision filter lifetime must be an object");
	const lifetime = value as Partial<CollisionFilterLifetimeSettings>;
	if (lifetime.schemaVersion !== COLLISION_FILTER_LIFETIME_SCHEMA_VERSION) throw new Error("Unsupported collision filter lifetime schema version");
	if (typeof lifetime.id !== "string" || lifetime.id.length === 0 || typeof lifetime.filterId !== "string" || lifetime.filterId.length === 0) throw new Error("Collision filter lifetime requires stable ids");
	if (lifetime.durationUnit !== "turns") throw new Error("Collision filter lifetime requires turns");
	validateLifetime({ durationUnit: lifetime.durationUnit, duration: lifetime.duration, remaining: lifetime.remaining });
	if (lifetime.sourceId !== undefined && (typeof lifetime.sourceId !== "string" || lifetime.sourceId.length === 0)) throw new Error("Collision filter lifetime sourceId must be non-empty");
	if (lifetime.sourceOrder !== undefined && !Number.isSafeInteger(lifetime.sourceOrder)) throw new Error("Collision filter lifetime sourceOrder must be a safe integer");
	assertJsonValue(lifetime as unknown as JsonValue);
}

export function validateCollisionFilterState(filters: readonly CollisionFilterSettings[], lifetimes: readonly CollisionFilterLifetimeSettings[]): void {
	const filterIds = new Set<string>();
	let previousFilter: CollisionFilterSettings | undefined;
	for (const filter of filters) {
		validateCollisionFilter(filter);
		if (filterIds.has(filter.id) || (previousFilter && compareFilterOrder(previousFilter, filter) > 0)) throw new Error("Collision filters must be unique and canonically ordered");
		filterIds.add(filter.id);
		previousFilter = filter;
	}
	const lifetimeIds = new Set<string>();
	let previousLifetime: CollisionFilterLifetimeSettings | undefined;
	for (const lifetime of lifetimes) {
		validateCollisionFilterLifetime(lifetime);
		if (!filterIds.has(lifetime.filterId)) throw new Error("Collision filter lifetime references an unknown filter");
		if (lifetimeIds.has(lifetime.id) || (previousLifetime && compareLifetimeOrder(previousLifetime, lifetime) > 0)) throw new Error("Collision filter lifetimes must be unique and canonically ordered");
		lifetimeIds.add(lifetime.id);
		previousLifetime = lifetime;
	}
}

function lifetimeOf(value: Pick<CollisionFilterLifetimeSettings, "durationUnit" | "duration" | "remaining">): LifetimeSettings & { durationUnit: "turns" } {
	return { durationUnit: value.durationUnit, duration: value.duration, remaining: value.remaining };
}

function validateExcludedCategories(value: unknown): asserts value is CollisionCategory[] {
	if (!Array.isArray(value) || value.length === 0) throw new Error("Collision filter requires excluded categories");
	const categories = [...value].sort();
	if (categories.some((category, index) => !COLLISION_CATEGORIES.includes(category as CollisionCategory) || (index > 0 && category === categories[index - 1]))) throw new Error("Collision filter categories must be unique and supported");
	if (value.some((category, index) => category !== categories[index])) throw new Error("Collision filter categories must be canonicalized");
}

function compareFilterOrder(first: CollisionFilterSettings, second: CollisionFilterSettings): number {
	return (first.sourceOrder ?? 0) - (second.sourceOrder ?? 0) || first.id.localeCompare(second.id);
}

function compareLifetimeOrder(first: CollisionFilterLifetimeSettings, second: CollisionFilterLifetimeSettings): number {
	return (first.sourceOrder ?? 0) - (second.sourceOrder ?? 0) || first.id.localeCompare(second.id);
}
