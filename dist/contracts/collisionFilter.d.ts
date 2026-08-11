export declare const COLLISION_FILTER_SCHEMA_VERSION: 1;
export declare const COLLISION_FILTER_LIFETIME_SCHEMA_VERSION: 1;
export declare const COLLISION_CATEGORIES: readonly ["entity", "structure"];
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
export declare function createCollisionFilterTemplate(input: CollisionFilterTemplate): CollisionFilterTemplate;
export declare function createCollisionFilter(input: Omit<CollisionFilterSettings, "schemaVersion">): CollisionFilterSettings;
export declare function createCollisionFilterLifetime(input: Omit<CollisionFilterLifetimeSettings, "schemaVersion" | "remaining"> & {
    remaining?: number;
}): CollisionFilterLifetimeSettings;
export declare function advanceCollisionFilterLifetime(lifetime: CollisionFilterLifetimeSettings): CollisionFilterLifetimeSettings | undefined;
export declare function isCollisionAllowed(firstCategory: CollisionCategory, firstFilters: readonly CollisionFilterSettings[], secondCategory: CollisionCategory, secondFilters: readonly CollisionFilterSettings[]): boolean;
export declare function validateCollisionFilter(value: unknown): asserts value is CollisionFilterSettings;
export declare function validateCollisionFilterLifetime(value: unknown): asserts value is CollisionFilterLifetimeSettings;
export declare function validateCollisionFilterState(filters: readonly CollisionFilterSettings[], lifetimes: readonly CollisionFilterLifetimeSettings[]): void;
