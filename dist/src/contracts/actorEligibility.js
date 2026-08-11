import { assertJsonValue } from "./systemSettings.js";
import { advanceLifetime, createLifetime, validateLifetime } from "./lifetime.js";
export const ACTOR_ELIGIBILITY_SCHEMA_VERSION = 1;
export const ACTOR_ELIGIBILITY_LIFETIME_SCHEMA_VERSION = 1;
export function createActorEligibilityConstraint(input) {
    const constraint = {
        schemaVersion: ACTOR_ELIGIBILITY_SCHEMA_VERSION,
        id: input.id,
        mode: input.mode,
        ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
        ...(input.sourceOrder === undefined ? {} : { sourceOrder: input.sourceOrder }),
    };
    validateActorEligibilityConstraint(constraint);
    return constraint;
}
export function createActorEligibilityConstraintLifetime(input) {
    const lifetime = {
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
export function createActorEligibilityConstraintTemplate(input) {
    const template = structuredClone(input);
    if (template.mode !== "excluded" || template.durationUnit !== "turns" || !Number.isSafeInteger(template.duration) || template.duration < 1)
        throw new Error("Actor eligibility constraint requires a positive turn duration");
    return template;
}
export function advanceActorEligibilityConstraintLifetime(lifetime) {
    validateActorEligibilityConstraintLifetime(lifetime);
    const next = advanceLifetime({ durationUnit: lifetime.durationUnit, duration: lifetime.duration, remaining: lifetime.remaining });
    return next ? { ...structuredClone(lifetime), ...next } : undefined;
}
export function isActorEligible(constraints) {
    return !constraints.some(constraint => constraint.mode === "excluded");
}
export function validateActorEligibilityConstraint(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Actor eligibility constraint must be an object");
    const constraint = value;
    if (constraint.schemaVersion !== ACTOR_ELIGIBILITY_SCHEMA_VERSION)
        throw new Error("Unsupported actor eligibility constraint schema version");
    if (typeof constraint.id !== "string" || constraint.id.length === 0)
        throw new Error("Actor eligibility constraint requires a stable id");
    if (constraint.mode !== "excluded")
        throw new Error("Unsupported actor eligibility constraint mode");
    if (constraint.sourceId !== undefined && (typeof constraint.sourceId !== "string" || constraint.sourceId.length === 0))
        throw new Error("Actor eligibility constraint sourceId must be non-empty");
    if (constraint.sourceOrder !== undefined && !Number.isSafeInteger(constraint.sourceOrder))
        throw new Error("Actor eligibility constraint sourceOrder must be a safe integer");
    assertJsonValue(constraint);
}
export function validateActorEligibilityConstraintLifetime(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Actor eligibility constraint lifetime must be an object");
    const lifetime = value;
    if (lifetime.schemaVersion !== ACTOR_ELIGIBILITY_LIFETIME_SCHEMA_VERSION)
        throw new Error("Unsupported actor eligibility lifetime schema version");
    if (typeof lifetime.id !== "string" || lifetime.id.length === 0 || typeof lifetime.constraintId !== "string" || lifetime.constraintId.length === 0)
        throw new Error("Actor eligibility lifetime requires stable ids");
    if (lifetime.durationUnit !== "turns")
        throw new Error("Actor eligibility constraint lifetime requires turns");
    validateLifetime({ durationUnit: lifetime.durationUnit, duration: lifetime.duration, remaining: lifetime.remaining });
    if (lifetime.sourceId !== undefined && (typeof lifetime.sourceId !== "string" || lifetime.sourceId.length === 0))
        throw new Error("Actor eligibility lifetime sourceId must be non-empty");
    if (lifetime.sourceOrder !== undefined && !Number.isSafeInteger(lifetime.sourceOrder))
        throw new Error("Actor eligibility lifetime sourceOrder must be a safe integer");
    assertJsonValue(lifetime);
}
export function validateActorEligibilityState(constraints, lifetimes) {
    const ids = new Set();
    let previous;
    for (const constraint of constraints) {
        validateActorEligibilityConstraint(constraint);
        if (ids.has(constraint.id) || (previous && compareConstraintOrder(previous, constraint) > 0))
            throw new Error("Actor eligibility constraints must be unique and canonically ordered");
        ids.add(constraint.id);
        previous = constraint;
    }
    const lifetimeIds = new Set();
    let previousLifetime;
    for (const lifetime of lifetimes) {
        validateActorEligibilityConstraintLifetime(lifetime);
        if (!ids.has(lifetime.constraintId))
            throw new Error("Actor eligibility lifetime references an unknown constraint");
        if (lifetimeIds.has(lifetime.id) || (previousLifetime && compareLifetimeOrder(previousLifetime, lifetime) > 0))
            throw new Error("Actor eligibility lifetimes must be unique and canonically ordered");
        lifetimeIds.add(lifetime.id);
        previousLifetime = lifetime;
    }
}
function compareConstraintOrder(first, second) {
    return (first.sourceOrder ?? 0) - (second.sourceOrder ?? 0) || first.id.localeCompare(second.id);
}
function compareLifetimeOrder(first, second) {
    return (first.sourceOrder ?? 0) - (second.sourceOrder ?? 0) || first.id.localeCompare(second.id);
}
