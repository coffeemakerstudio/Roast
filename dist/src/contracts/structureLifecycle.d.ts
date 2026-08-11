export declare const STRUCTURE_LIFECYCLE_SCHEMA_VERSION: 1;
export declare const STRUCTURE_LIFECYCLE_DURATION_UNITS: readonly ["turns"];
export type StructureLifecycleDurationUnit = typeof STRUCTURE_LIFECYCLE_DURATION_UNITS[number];
/** Generic geometry payload required by the first timed-structure consumer. */
export interface StructureLifecycleStructure {
    type: "rectangle";
    w: number;
    h: number;
    color?: string;
    role?: "solid" | "containment" | "both";
}
export interface StructureLifecycleTemplate {
    durationUnit: StructureLifecycleDurationUnit;
    duration: number;
    structure: StructureLifecycleStructure;
}
export interface StructureLifecycleSettings {
    schemaVersion: typeof STRUCTURE_LIFECYCLE_SCHEMA_VERSION;
    id: string;
    structureId: string;
    durationUnit: StructureLifecycleDurationUnit;
    duration: number;
    remaining: number;
    sourceId?: string;
    sourceOrder?: number;
    targetId?: string;
}
export declare function createStructureLifecycleTemplate(input: StructureLifecycleTemplate): StructureLifecycleTemplate;
export declare function createStructureLifecycle(input: Omit<StructureLifecycleSettings, "schemaVersion" | "remaining"> & {
    remaining?: number;
}): StructureLifecycleSettings;
export declare function advanceStructureLifecycle(lifecycle: StructureLifecycleSettings): StructureLifecycleSettings | undefined;
export declare function validateStructureLifecycleTemplate(value: unknown): asserts value is StructureLifecycleTemplate;
export declare function validateStructureLifecycle(value: unknown): asserts value is StructureLifecycleSettings;
