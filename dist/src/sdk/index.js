import { EngineSystemRegistry } from "./systemRegistry.js";
import { EngineWorldBuilder } from "./worldBuilder.js";
import { assertJsonValue } from "../contracts/systemSettings.js";
import { EngineEffectRegistry } from "./effectRegistry.js";
import { createMovementState, createTransformState } from "./entityState.js";
import { canonicalizeCounterStates, createCounterState, validateCounterState } from "../contracts/counterState.js";
/** Single generic Engine SDK entry point. It has no dependency on KORE game code. */
export const engine = {
    createWorld(options) { return new EngineWorldBuilder(options.id, options.worldSize); },
    createSystemRegistry() { return new EngineSystemRegistry(); },
    createEffectRegistry() { return new EngineEffectRegistry(); },
    createTransformState,
    createMovementState,
    createCounterState,
    canonicalizeCounterStates,
    validateCounterState,
    /** Creates a detached JSON-safe generic entity authoring record. */
    createEntity(settings) { assertJsonValue(settings); return structuredClone(settings); },
    /** Creates a detached JSON-safe generic structure/geometry authoring record. */
    createStructure(settings) { assertJsonValue(settings); return structuredClone(settings); },
    /** Creates a detached JSON-safe generic effect authoring record. */
    createEffect(settings) { assertJsonValue(settings); return structuredClone(settings); },
    /** Validates an arbitrary generic SDK value is JSON-safe. */
    validate(value) { assertJsonValue(value); },
    buildJson(settings, space = 2) { return JSON.stringify(settings, null, space); },
};
export { EngineSystemRegistry, EngineWorldBuilder };
export { EngineEffectRegistry };
export { MOVEMENT_ADD_VELOCITY_EFFECT_ID, MOVEMENT_APPLY_FORCE_FIELD_EFFECT_ID, MOVEMENT_APPLY_FORCE_TO_ENTITY_EFFECT_ID, MOVEMENT_CAPABILITY, MOVEMENT_COMMAND_EFFECT_IDS, MOVEMENT_EFFECT_ID, MOVEMENT_SCALE_SPEED_EFFECT_ID, MOVEMENT_SET_VELOCITY_EFFECT_ID, movementSystemDefinition, registerMovementCommands, registerMovementEffect, registerMovementSystem } from "./movementCapability.js";
export { applyRadialVelocityDelta, calculateRadialVelocityDelta } from "./movementForceField.js";
export { TRANSFORM_CAPABILITY, TRANSFORM_SET_POSITION_EFFECT_ID, TRANSFORM_SET_ROTATION_EFFECT_ID, TRANSFORM_SWAP_POSITION_EFFECT_ID, registerTransformEffects, validateTransformTarget } from "./transformCapability.js";
export { COUNTER_ADD_EFFECT_ID, COUNTER_CAPABILITY, COUNTER_EFFECT_IDS, COUNTER_RESET_EFFECT_ID, COUNTER_SET_EFFECT_ID, counterSystemDefinition, registerCounterCommands, registerCounterSystem, validateCounterEffectSettings, validateCounterTarget } from "./counterCapability.js";
export { PARTICIPATION_CAPABILITY, PARTICIPATION_EFFECT_IDS, PARTICIPATION_SET_DRAWING_EFFECT_ID, PARTICIPATION_SET_PHYSICS_EFFECT_ID, participationSystemDefinition, registerParticipationCommands, registerParticipationSystem } from "./participationCapability.js";
export { NUMERIC_ADD_EFFECT_ID, NUMERIC_CAPABILITY, NUMERIC_EFFECT_IDS, NUMERIC_RESET_EFFECT_ID, NUMERIC_SET_EFFECT_ID, numericSystemDefinition, registerNumericCommands, registerNumericSystem, validateNumericEffectSettings, validateNumericTarget } from "./numericCapability.js";
export { ENGINE_EFFECT_COMPOSITION_SCHEMA_VERSION, ENGINE_EFFECT_COMPOSITION_TYPE, createEngineEffectComposition, validateEngineEffectComposition } from "./composition.js";
export { counterTriggerMatches, validateCounterTriggerBinding } from "./counterCapability.js";
export { EngineTriggerActivationQueue, createCollisionEnterTriggerEvent, createEnvironmentActivationTriggerEvent, createRoundStartTriggerEvent, createScheduleDueTriggerEvent, createTickTriggerEvent, createTriggerActivation, validateTriggerActivation, validateTriggerEvent } from "./trigger.js";
export { createMovementState, createTransformState, validateMovementState, validateTransformState } from "./entityState.js";
export { COLLISION_COMMAND_SCHEMA_VERSION, COLLISION_COMMAND_TYPE, createCollisionCommandBinding, isCollisionCommandBinding, validateCollisionCommandBinding } from "./collisionCommand.js";
export { COUNTER_SCHEMA_VERSION, canonicalizeCounterStates, createCounterState, validateCounterState } from "../contracts/counterState.js";
export { NUMERIC_STATE_SCHEMA_VERSION, NUMERIC_THRESHOLD_COMPARATORS, validateNumericThreshold, validateNumericThresholdBinding, validateNumericThresholdBindings } from "../contracts/numericState.js";
export { collectAssetReferences } from "./assetReferences.js";
export { advanceTemporalModifier, createTemporalModifier, createTemporalModifierTemplate, validateTemporalModifier, TEMPORAL_DURATION_UNITS, TEMPORAL_MODIFIER_SCHEMA_VERSION } from "../contracts/temporalModifier.js";
export { advanceStructureLifecycle, createStructureLifecycle, createStructureLifecycleTemplate, STRUCTURE_LIFECYCLE_DURATION_UNITS, STRUCTURE_LIFECYCLE_SCHEMA_VERSION, validateStructureLifecycle, validateStructureLifecycleTemplate } from "../contracts/structureLifecycle.js";
export { advanceDeferredEffect, createDeferredEffect, createDeferredEffectTemplate, DEFERRED_EFFECT_DURATION_UNITS, DEFERRED_EFFECT_SCHEMA_VERSION, validateDeferredEffect, validateDeferredEffectTemplate } from "../contracts/deferredEffect.js";
export { applyActionModifiers, consumeActionModifiers, createActionModifier, createActionModifierTemplate, validateActionModifier, ACTION_MODIFIER_SCHEMA_VERSION } from "../contracts/actionModifier.js";
export { advanceCollisionFilterLifetime, createCollisionFilter, createCollisionFilterLifetime, createCollisionFilterTemplate, isCollisionAllowed, validateCollisionFilter, validateCollisionFilterLifetime, validateCollisionFilterState, COLLISION_CATEGORIES, COLLISION_FILTER_SCHEMA_VERSION, COLLISION_FILTER_LIFETIME_SCHEMA_VERSION } from "../contracts/collisionFilter.js";
export { advanceActorEligibilityConstraintLifetime, createActorEligibilityConstraint, createActorEligibilityConstraintLifetime, createActorEligibilityConstraintTemplate, isActorEligible, validateActorEligibilityConstraint, validateActorEligibilityConstraintLifetime, validateActorEligibilityState, ACTOR_ELIGIBILITY_SCHEMA_VERSION, ACTOR_ELIGIBILITY_LIFETIME_SCHEMA_VERSION } from "../contracts/actorEligibility.js";
export { advanceLifetime, createLifetime, validateLifetime, LIFETIME_DURATION_UNITS } from "../contracts/lifetime.js";
