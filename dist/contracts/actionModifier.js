import { assertJsonValue } from "./systemSettings.js";
import { validateLifetime } from "./lifetime.js";
import { SeededRandom } from "../random.js";
export const ACTION_MODIFIER_SCHEMA_VERSION = 1;
export function createActionModifierTemplate(input) {
    const template = structuredClone(input);
    if (template.action === "force" && template.operation === "scale")
        validateFactor(template.factor);
    else if (template.action === "aim" && template.operation === "random-offset") {
        validateVariance(template.maxVarianceDegrees);
        validateRandomState(template.randomState);
    }
    else
        throw new Error("Unsupported action modifier operation");
    return template;
}
export function createActionModifier(input) {
    const modifier = { schemaVersion: ACTION_MODIFIER_SCHEMA_VERSION, ...structuredClone(input) };
    validateActionModifier(modifier);
    return modifier;
}
export function applyActionModifiers(input, modifiers) {
    validateAcceptedForceInput(input);
    if (modifiers.length === 0)
        return { angle: normalizeAngle(input.angle), power: input.power };
    return [...modifiers]
        .sort(compareModifiers)
        .reduce((current, modifier) => {
        validateActionModifier(modifier);
        if (modifier.action === "force" && modifier.operation === "scale")
            return { angle: current.angle, power: current.power * modifier.factor };
        const random = SeededRandom.fromState(modifier.randomState);
        const offset = (random.next() * 2 - 1) * modifier.maxVarianceDegrees;
        return { angle: normalizeAngle(current.angle + offset), power: current.power };
    }, { angle: normalizeAngle(input.angle), power: input.power });
}
export function consumeActionModifiers(modifiers) {
    return [...modifiers]
        .sort(compareModifiers)
        .flatMap(modifier => {
        validateActionModifier(modifier);
        const next = structuredClone(modifier);
        if (next.action === "aim" && next.operation === "random-offset") {
            const random = SeededRandom.fromState(next.randomState);
            random.next();
            next.randomState = random.getState();
        }
        if (next.remainingUses === undefined || next.remainingUses <= 1)
            return next.remainingUses === undefined ? [next] : [];
        return [{ ...next, remainingUses: next.remainingUses - 1 }];
    });
}
export function validateActionModifier(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Action modifier must be an object");
    const modifier = value;
    if (modifier.schemaVersion !== ACTION_MODIFIER_SCHEMA_VERSION)
        throw new Error("Unsupported action modifier schema version");
    if (typeof modifier.id !== "string" || modifier.id.length === 0)
        throw new Error("Action modifier requires a stable id");
    if (modifier.action === "force" && modifier.operation === "scale")
        validateFactor(modifier.factor);
    else if (modifier.action === "aim" && modifier.operation === "random-offset") {
        validateVariance(modifier.maxVarianceDegrees);
        validateRandomState(modifier.randomState);
    }
    else
        throw new Error("Unsupported action modifier operation");
    if (modifier.remainingUses !== undefined && (!Number.isSafeInteger(modifier.remainingUses) || modifier.remainingUses < 1))
        throw new Error("Action modifier remaining uses must be a positive integer");
    const hasLifetime = modifier.durationUnit !== undefined || modifier.duration !== undefined || modifier.remaining !== undefined;
    if (hasLifetime) {
        if (modifier.durationUnit === undefined || modifier.duration === undefined || modifier.remaining === undefined)
            throw new Error("Action modifier lifetime is incomplete");
        if (modifier.durationUnit !== "turns")
            throw new Error("Action modifier lifetime requires turns");
        validateLifetime({ durationUnit: modifier.durationUnit, duration: modifier.duration, remaining: modifier.remaining });
    }
    if (modifier.remainingUses === undefined && !hasLifetime)
        throw new Error("Action modifier requires consumption or lifetime");
    if (modifier.sourceId !== undefined && (typeof modifier.sourceId !== "string" || modifier.sourceId.length === 0))
        throw new Error("Action modifier sourceId must be non-empty");
    if (modifier.sourceOrder !== undefined && !Number.isSafeInteger(modifier.sourceOrder))
        throw new Error("Action modifier sourceOrder must be a safe integer");
    assertJsonValue(modifier);
}
function validateFactor(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
        throw new Error("Action modifier factor must be a finite non-negative number");
}
function validateVariance(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
        throw new Error("Action modifier variance must be a finite non-negative number");
}
function validateRandomState(value) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 0xFFFFFFFF)
        throw new Error("Action modifier random state must be an unsigned 32-bit integer");
}
function validateAcceptedForceInput(input) {
    if (!Number.isFinite(input.angle) || !Number.isFinite(input.power) || input.power < 0)
        throw new Error("Accepted force input must have a finite angle and non-negative power");
}
function compareModifiers(first, second) {
    return (first.sourceOrder ?? 0) - (second.sourceOrder ?? 0) || first.id.localeCompare(second.id);
}
function normalizeAngle(angle) { return ((angle % 360) + 360) % 360; }
