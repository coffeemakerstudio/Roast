export const PARTICIPATION_CAPABILITY = "participation.state";
export const PARTICIPATION_SET_PHYSICS_EFFECT_ID = "participation.set-physics";
export const PARTICIPATION_SET_DRAWING_EFFECT_ID = "participation.set-drawing";
export const PARTICIPATION_EFFECT_IDS = [PARTICIPATION_SET_PHYSICS_EFFECT_ID, PARTICIPATION_SET_DRAWING_EFFECT_ID];
export function participationSystemDefinition() {
    return { id: "core.participation", provides: [PARTICIPATION_CAPABILITY], acceptsEffects: [...PARTICIPATION_EFFECT_IDS] };
}
export function registerParticipationSystem(registry) {
    return registry.register(participationSystemDefinition());
}
export function registerParticipationCommands(registry) {
    return registry
        .register({ id: PARTICIPATION_SET_PHYSICS_EFFECT_ID, requiresCapability: [PARTICIPATION_CAPABILITY], targetType: "entity-or-structure", lifecycleCategory: "command", validatePayload: validateParticipationPayload })
        .register({ id: PARTICIPATION_SET_DRAWING_EFFECT_ID, requiresCapability: [PARTICIPATION_CAPABILITY], targetType: "entity-or-structure", lifecycleCategory: "command", validatePayload: validateParticipationPayload });
}
function validateParticipationPayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw new Error("Participation payload must be an object");
    const value = payload;
    if (Object.keys(value).length !== 1 || typeof value.enabled !== "boolean")
        throw new Error("Participation payload requires only boolean enabled");
}
