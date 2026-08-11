export declare const ACTOR_ELIGIBILITY_SCHEMA_VERSION: 1;
export declare const ACTOR_ELIGIBILITY_LIFETIME_SCHEMA_VERSION: 1;
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
export declare function createActorEligibilityConstraint(input: Omit<ActorEligibilityConstraintSettings, "schemaVersion">): ActorEligibilityConstraintSettings;
export declare function createActorEligibilityConstraintLifetime(input: Omit<ActorEligibilityConstraintLifetimeSettings, "schemaVersion" | "remaining"> & {
    remaining?: number;
}): ActorEligibilityConstraintLifetimeSettings;
export declare function createActorEligibilityConstraintTemplate(input: ActorEligibilityConstraintTemplate): ActorEligibilityConstraintTemplate;
export declare function advanceActorEligibilityConstraintLifetime(lifetime: ActorEligibilityConstraintLifetimeSettings): ActorEligibilityConstraintLifetimeSettings | undefined;
export declare function isActorEligible(constraints: readonly ActorEligibilityConstraintSettings[]): boolean;
export declare function validateActorEligibilityConstraint(value: unknown): asserts value is ActorEligibilityConstraintSettings;
export declare function validateActorEligibilityConstraintLifetime(value: unknown): asserts value is ActorEligibilityConstraintLifetimeSettings;
export declare function validateActorEligibilityState(constraints: readonly ActorEligibilityConstraintSettings[], lifetimes: readonly ActorEligibilityConstraintLifetimeSettings[]): void;
