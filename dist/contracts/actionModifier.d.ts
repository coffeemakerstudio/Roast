export declare const ACTION_MODIFIER_SCHEMA_VERSION: 1;
export interface AcceptedForceInput {
    angle: number;
    power: number;
}
/** Generic entity-owned modifier applied to one or more accepted actions. */
interface ActionModifierBase {
    schemaVersion: typeof ACTION_MODIFIER_SCHEMA_VERSION;
    id: string;
    remainingUses?: number;
    durationUnit?: "turns";
    duration?: number;
    remaining?: number;
    sourceId?: string;
    sourceOrder?: number;
}
export type ActionModifierSettings = (ActionModifierBase & {
    action: "force";
    operation: "scale";
    factor: number;
}) | (ActionModifierBase & {
    action: "aim";
    operation: "random-offset";
    maxVarianceDegrees: number;
    randomState: number;
});
export type ActionModifierTemplate = {
    action: "force";
    operation: "scale";
    factor: number;
} | {
    action: "aim";
    operation: "random-offset";
    maxVarianceDegrees: number;
    randomState: number;
};
export type ActionModifierInput = Omit<Extract<ActionModifierSettings, {
    action: "force";
}>, "schemaVersion"> | Omit<Extract<ActionModifierSettings, {
    action: "aim";
}>, "schemaVersion">;
export declare function createActionModifierTemplate(input: ActionModifierTemplate): ActionModifierTemplate;
export declare function createActionModifier(input: ActionModifierInput): ActionModifierSettings;
export declare function applyActionModifiers(input: AcceptedForceInput, modifiers: readonly ActionModifierSettings[]): AcceptedForceInput;
export declare function consumeActionModifiers(modifiers: readonly ActionModifierSettings[]): ActionModifierSettings[];
export declare function validateActionModifier(value: unknown): asserts value is ActionModifierSettings;
export {};
