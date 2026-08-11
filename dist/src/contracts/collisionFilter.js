import { assertJsonValue } from "./systemSettings.js";
import { advanceLifetime, createLifetime, validateLifetime } from "./lifetime.js";
export const COLLISION_FILTER_SCHEMA_VERSION = 1;
export const COLLISION_FILTER_LIFETIME_SCHEMA_VERSION = 1;
export const COLLISION_CATEGORIES = ["entity", "structure"];
export function createCollisionFilterTemplate(input) {
    const template = structuredClone(input);
    validateExcludedCategories(template.excludedCategories);
    if (template.durationUnit !== "turns" || !Number.isSafeInteger(template.duration) || template.duration < 1)
        throw new Error("Collision filter template requires a positive turn duration");
    return template;
}
export function createCollisionFilter(input) {
    const filter = {
        schemaVersion: COLLISION_FILTER_SCHEMA_VERSION,
        id: input.id,
        excludedCategories: [...input.excludedCategories],
        ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
        ...(input.sourceOrder === undefined ? {} : { sourceOrder: input.sourceOrder }),
    };
    validateCollisionFilter(filter);
    return filter;
}
export function createCollisionFilterLifetime(input) {
    const lifetime = {
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
export function advanceCollisionFilterLifetime(lifetime) {
    validateCollisionFilterLifetime(lifetime);
    const next = advanceLifetime(lifetimeOf(lifetime));
    return next ? { ...structuredClone(lifetime), ...next } : undefined;
}
export function isCollisionAllowed(firstCategory, firstFilters, secondCategory, secondFilters) {
    return !firstFilters.some(filter => filter.excludedCategories.includes(secondCategory)) &&
        !secondFilters.some(filter => filter.excludedCategories.includes(firstCategory));
}
export function validateCollisionFilter(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Collision filter must be an object");
    const filter = value;
    if (filter.schemaVersion !== COLLISION_FILTER_SCHEMA_VERSION)
        throw new Error("Unsupported collision filter schema version");
    if (typeof filter.id !== "string" || filter.id.length === 0)
        throw new Error("Collision filter requires a stable id");
    if (!Array.isArray(filter.excludedCategories) || filter.excludedCategories.length === 0)
        throw new Error("Collision filter requires excluded categories");
    validateExcludedCategories(filter.excludedCategories);
    if (filter.sourceId !== undefined && (typeof filter.sourceId !== "string" || filter.sourceId.length === 0))
        throw new Error("Collision filter sourceId must be non-empty");
    if (filter.sourceOrder !== undefined && !Number.isSafeInteger(filter.sourceOrder))
        throw new Error("Collision filter sourceOrder must be a safe integer");
    assertJsonValue(filter);
}
export function validateCollisionFilterLifetime(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Collision filter lifetime must be an object");
    const lifetime = value;
    if (lifetime.schemaVersion !== COLLISION_FILTER_LIFETIME_SCHEMA_VERSION)
        throw new Error("Unsupported collision filter lifetime schema version");
    if (typeof lifetime.id !== "string" || lifetime.id.length === 0 || typeof lifetime.filterId !== "string" || lifetime.filterId.length === 0)
        throw new Error("Collision filter lifetime requires stable ids");
    if (lifetime.durationUnit !== "turns")
        throw new Error("Collision filter lifetime requires turns");
    validateLifetime({ durationUnit: lifetime.durationUnit, duration: lifetime.duration, remaining: lifetime.remaining });
    if (lifetime.sourceId !== undefined && (typeof lifetime.sourceId !== "string" || lifetime.sourceId.length === 0))
        throw new Error("Collision filter lifetime sourceId must be non-empty");
    if (lifetime.sourceOrder !== undefined && !Number.isSafeInteger(lifetime.sourceOrder))
        throw new Error("Collision filter lifetime sourceOrder must be a safe integer");
    assertJsonValue(lifetime);
}
export function validateCollisionFilterState(filters, lifetimes) {
    const filterIds = new Set();
    let previousFilter;
    for (const filter of filters) {
        validateCollisionFilter(filter);
        if (filterIds.has(filter.id) || (previousFilter && compareFilterOrder(previousFilter, filter) > 0))
            throw new Error("Collision filters must be unique and canonically ordered");
        filterIds.add(filter.id);
        previousFilter = filter;
    }
    const lifetimeIds = new Set();
    let previousLifetime;
    for (const lifetime of lifetimes) {
        validateCollisionFilterLifetime(lifetime);
        if (!filterIds.has(lifetime.filterId))
            throw new Error("Collision filter lifetime references an unknown filter");
        if (lifetimeIds.has(lifetime.id) || (previousLifetime && compareLifetimeOrder(previousLifetime, lifetime) > 0))
            throw new Error("Collision filter lifetimes must be unique and canonically ordered");
        lifetimeIds.add(lifetime.id);
        previousLifetime = lifetime;
    }
}
function lifetimeOf(value) {
    return { durationUnit: value.durationUnit, duration: value.duration, remaining: value.remaining };
}
function validateExcludedCategories(value) {
    if (!Array.isArray(value) || value.length === 0)
        throw new Error("Collision filter requires excluded categories");
    const categories = [...value].sort();
    if (categories.some((category, index) => !COLLISION_CATEGORIES.includes(category) || (index > 0 && category === categories[index - 1])))
        throw new Error("Collision filter categories must be unique and supported");
    if (value.some((category, index) => category !== categories[index]))
        throw new Error("Collision filter categories must be canonicalized");
}
function compareFilterOrder(first, second) {
    return (first.sourceOrder ?? 0) - (second.sourceOrder ?? 0) || first.id.localeCompare(second.id);
}
function compareLifetimeOrder(first, second) {
    return (first.sourceOrder ?? 0) - (second.sourceOrder ?? 0) || first.id.localeCompare(second.id);
}
