export const TRANSFORM_CAPABILITY = "transform.state";
export const TRANSFORM_SET_POSITION_EFFECT_ID = "transform.set-position";
export const TRANSFORM_SET_ROTATION_EFFECT_ID = "transform.set-rotation";
export const TRANSFORM_SWAP_POSITION_EFFECT_ID = "transform.swap-position";
/** Registers absolute transform commands without selecting their runtime system. */
export function registerTransformEffects(registry) {
    return registry
        .register({
        id: TRANSFORM_SET_POSITION_EFFECT_ID,
        requiresCapability: [TRANSFORM_CAPABILITY],
        targetType: "entity-or-structure",
        lifecycleCategory: "command",
        validatePayload: payload => validateVectorPayload(payload, "Transform position"),
        validateTarget: target => validateTransformTarget(target, true),
    })
        .register({
        id: TRANSFORM_SET_ROTATION_EFFECT_ID,
        requiresCapability: [TRANSFORM_CAPABILITY],
        targetType: "entity",
        lifecycleCategory: "command",
        validatePayload: payload => {
            const value = record(payload, "Transform rotation payload");
            exactKeys(value, ["rotation"], "Transform rotation payload");
            finite(value.rotation, "Transform rotation");
        },
        validateTarget: target => validateTransformTarget(target, false),
    })
        .register({
        id: TRANSFORM_SWAP_POSITION_EFFECT_ID,
        requiresCapability: [TRANSFORM_CAPABILITY],
        targetType: "entity",
        lifecycleCategory: "command",
        validatePayload: payload => {
            const value = record(payload, "Transform swap position payload");
            exactKeys(value, ["otherEntityId"], "Transform swap position payload");
            if (typeof value.otherEntityId !== "string" || value.otherEntityId.length === 0)
                throw new Error("Transform swap position requires a non-empty otherEntityId");
        },
        validateTarget: target => validateTransformTarget(target, false),
    });
}
export function validateTransformTarget(value, allowStructure = true) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Transform target must be an object");
    const target = value;
    if (target.type === "entity") {
        exactKeys(target, ["type", "entityId"], "Transform entity target");
        if (typeof target.entityId !== "string" || target.entityId.length === 0)
            throw new Error("Transform target requires a non-empty entityId");
        return;
    }
    if (allowStructure && target.type === "structure") {
        exactKeys(target, ["type", "structureId"], "Transform structure target");
        if (typeof target.structureId !== "string" || target.structureId.length === 0)
            throw new Error("Transform target requires a non-empty structureId");
        return;
    }
    throw new Error("Transform target type is unsupported");
}
function validateVectorPayload(payload, label) {
    const value = record(payload, `${label} payload`);
    exactKeys(value, ["x", "y"], `${label} payload`);
    finite(value.x, `${label} x`);
    finite(value.y, `${label} y`);
}
function record(value, label) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error(`${label} must be an object`);
    return value;
}
function exactKeys(value, keys, label) {
    const allowed = new Set(keys);
    for (const key of Object.keys(value))
        if (!allowed.has(key))
            throw new Error(`${label} contains unexpected fields`);
    for (const key of keys)
        if (!(key in value))
            throw new Error(`${label} is missing '${key}'`);
}
function finite(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value))
        throw new Error(`${label} must be finite`);
}
