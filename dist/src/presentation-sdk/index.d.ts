import { type JsonValue } from "../contracts/systemSettings.js";
export type PresentationInterruption = "replace" | "higher-priority" | "ignore";
export type AnimationKeyframe = {
    tick: number;
    value: JsonValue;
};
export type AnimationTrack = {
    id: string;
    keyframes: AnimationKeyframe[];
};
export type AnimationSettings = {
    schemaVersion: 1;
    id: string;
    channel: string;
    durationTicks: number;
    priority: number;
    interruption: PresentationInterruption;
    tracks: AnimationTrack[];
};
export type PresentationEvent = {
    schemaVersion: 1;
    type: "play" | "cancel";
    eventId: string;
    channel?: string;
    animationId?: string;
    instanceId?: string;
    priority?: number;
    payload?: JsonValue;
};
export type PresentationEventRecord = PresentationEvent & {
    sequence: number;
    tick: number;
};
export type ActiveAnimation = {
    instanceId: string;
    animationId: string;
    channel: string;
    startTick: number;
    priority: number;
};
export type PresentationProjection = {
    instanceId: string;
    animationId: string;
    channel: string;
    priority: number;
    localTick: number;
    progress: number;
    values: Record<string, JsonValue>;
};
export type PresentationFrame = {
    schemaVersion: 1;
    runtimeId: string;
    tick: number;
    events: PresentationEventRecord[];
    animations: PresentationProjection[];
};
export type PresentationRuntimeSettings = {
    schemaVersion: 1;
    runtimeId: string;
    tick: number;
    sequence: number;
    active: ActiveAnimation[];
    pending: PresentationEvent[];
};
export interface PresentationOutputPort {
    apply(frame: Readonly<PresentationFrame>): void;
}
export declare function validateAnimationSettings(value: unknown): asserts value is AnimationSettings;
export declare function validatePresentationEvent(value: unknown): asserts value is PresentationEvent;
export declare function validatePresentationRuntimeSettings(value: unknown): asserts value is PresentationRuntimeSettings;
export declare class PresentationRuntime {
    readonly runtimeId: string;
    private readonly animations;
    private readonly active;
    private pending;
    private tickNumber;
    private sequence;
    private lastFrame;
    constructor(runtimeId: string, settings: {
        animations: AnimationSettings[];
        tick?: number;
        sequence?: number;
        active?: ActiveAnimation[];
        pending?: PresentationEvent[];
    });
    emit(event: PresentationEvent): void;
    tick(ticks?: number): PresentationFrame;
    project(): PresentationFrame;
    toSettings(): PresentationRuntimeSettings;
    private processPending;
    private eventPriority;
    private cancel;
    private expire;
    private record;
    private frame;
    private projectAnimation;
    private restoreActive;
}
export declare const presentation: {
    readonly createAnimation: (settings: Omit<AnimationSettings, "schemaVersion">) => AnimationSettings;
    readonly createRuntime: (runtimeId: string, settings: {
        animations: AnimationSettings[];
        tick?: number;
        sequence?: number;
        active?: ActiveAnimation[];
        pending?: PresentationEvent[];
    }) => PresentationRuntime;
    readonly play: (eventId: string, animationId: string, options?: Omit<PresentationEvent, "schemaVersion" | "type" | "eventId" | "animationId">) => PresentationEvent;
    readonly cancel: (eventId: string, options: Pick<PresentationEvent, "instanceId" | "channel">) => PresentationEvent;
    readonly validateAnimation: typeof validateAnimationSettings;
    readonly validateEvent: typeof validatePresentationEvent;
    readonly validateRuntime: typeof validatePresentationRuntimeSettings;
};
