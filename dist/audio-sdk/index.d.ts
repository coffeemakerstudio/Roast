import { EngineSystemRegistry, type EngineFrameworkSettings } from "../sdk/index.js";
export type AudioOutputStatus = "locked" | "ready" | "suspended" | "failed";
export type AudioReplacementPolicy = "replace-current" | "replace-lower-or-equal" | "keep-current";
export type AudioBusSettings = {
    id: string;
    volume: number;
    muted: boolean;
    maxVoices: number;
    defaultPriority: number;
    paused: boolean;
};
type AudioCommandBase = {
    sourceId: string;
    bus?: string;
    priority?: number;
    dedupeKey?: string;
    instanceId?: string;
};
export type PlaySoundCommand = AudioCommandBase & {
    type: "playSound";
    soundId: string;
    volume?: number;
    pitch?: number;
    pan?: number;
};
export type StartLoopCommand = AudioCommandBase & {
    type: "startLoop";
    soundId: string;
    volume?: number;
    pitch?: number;
    pan?: number;
    fadeInMs?: number;
};
export type PlayMusicCommand = AudioCommandBase & {
    type: "playMusic";
    soundId: string;
    volume?: number;
    fadeInMs?: number;
    replacementPolicy?: AudioReplacementPolicy;
};
export type StopSourceCommand = {
    type: "stopSource";
    sourceId: string;
    fadeOutMs?: number;
};
export type StopInstanceCommand = {
    type: "stopInstance";
    sourceId: string;
    instanceId: string;
    fadeOutMs?: number;
};
export type StopMusicCommand = {
    type: "stopMusic";
    sourceId?: string;
    fadeOutMs?: number;
};
export type PauseBusCommand = {
    type: "pauseBus";
    sourceId: string;
    bus: string;
};
export type ResumeBusCommand = {
    type: "resumeBus";
    sourceId: string;
    bus: string;
};
export type SetBusVolumeCommand = {
    type: "setBusVolume";
    sourceId: string;
    bus: string;
    volume: number;
    muted?: boolean;
};
export type StopAllCommand = {
    type: "stopAll";
    sourceId: string;
    fadeOutMs?: number;
};
export type AudioCommand = PlaySoundCommand | StartLoopCommand | PlayMusicCommand | StopSourceCommand | StopInstanceCommand | StopMusicCommand | PauseBusCommand | ResumeBusCommand | SetBusVolumeCommand | StopAllCommand;
export type ResolvedAudioCommand = AudioCommand & {
    runtimeId: string;
    globalSourceId: string;
    sequence: number;
};
export interface ISoundSource {
    readonly soundSourceId: string;
}
export interface ISoundEmitter extends ISoundSource {
    drainSoundCommands(): AudioCommand[];
}
export interface IAudioPosition {
    readonly x: number;
    readonly y: number;
}
export interface IAudioVelocity {
    readonly vx: number;
    readonly vy: number;
}
export interface IAudioListener {
    readonly listenerId: string;
    readonly position: IAudioPosition;
}
export interface IAudioPriority {
    readonly audioPriority: number;
}
export interface AudioOutputPort {
    apply(batch: Readonly<AudioCommandBatch>): void;
}
export type AudioPersistentSourceSettings = {
    sourceId: string;
    command: StartLoopCommand | PlayMusicCommand;
};
export type AudioRuntimeSettings = {
    schemaVersion: 1;
    runtimeId: string;
    buses: AudioBusSettings[];
    persistentSources: AudioPersistentSourceSettings[];
    framework: EngineFrameworkSettings;
    sequence: number;
};
export type AudioApplicationSettings = {
    schemaVersion: 1;
    applicationId: string;
    buses: AudioBusSettings[];
    activeMusic?: ResolvedAudioCommand;
    sequence: number;
};
export type AudioDiagnostics = {
    collected: number;
    rejected: number;
    deduplicated: number;
    droppedByPriority: number;
    activePersistentSources: string[];
    activeMusicSourceId?: string;
    outputStatus: AudioOutputStatus;
    sequence: number;
};
export type AudioCommandBatch = {
    schemaVersion: 1;
    runtimeId: string;
    sequence: number;
    commands: ResolvedAudioCommand[];
    diagnostics: AudioDiagnostics;
};
/** Detached queue capability for any entity, UI object, or KORE adapter. */
export declare class AudioEmitter implements ISoundEmitter {
    readonly soundSourceId: string;
    private pending;
    constructor(soundSourceId: string);
    emit(command: AudioCommand): void;
    drainSoundCommands(): AudioCommand[];
}
/** Generic deterministic collector. It never calls an output port or browser API. */
export declare class SoundSystem {
    private readonly runtimeId;
    private readonly buses;
    private readonly persistent;
    private pending;
    private output;
    private sequence;
    constructor(runtimeId: string, settings?: Omit<AudioRuntimeSettings, "schemaVersion" | "runtimeId" | "framework" | "sequence"> & {
        sequence?: number;
    });
    submit(command: AudioCommand): void;
    tick(candidates: readonly unknown[]): void;
    drainOutput(): AudioCommandBatch;
    /** Re-emits persistent intent only when a host explicitly requests restoration. */
    restorePersistentIntent(): void;
    toSettings(framework?: EngineFrameworkSettings): AudioRuntimeSettings;
    getDiagnostics(): AudioDiagnostics;
    private aggregate;
    private resolve;
    private applyPersistent;
    private diagnostics;
}
/** Explicit runtime lifecycle wrapper around the generic sound system. */
export declare class AudioRuntime {
    private readonly system;
    private readonly framework;
    constructor(settings: AudioRuntimeSettings);
    tick(emitters: readonly unknown[]): void;
    submit(command: AudioCommand): void;
    drainOutput(): AudioCommandBatch;
    restorePersistentIntent(): void;
    toSettings(): AudioRuntimeSettings;
    getDiagnostics(): AudioDiagnostics;
}
/** Application-level merge point: many runtimes, one explicit output batch. */
export declare class ApplicationAudioMixer {
    private readonly applicationId;
    private readonly buses;
    private pending;
    private activeMusic;
    private sequence;
    constructor(applicationId: string, settings?: Omit<AudioApplicationSettings, "schemaVersion" | "applicationId" | "sequence"> & {
        sequence?: number;
    });
    submit(batch: AudioCommandBatch): void;
    flush(): AudioCommandBatch;
    toSettings(): AudioApplicationSettings;
    private limitVoices;
    private selectMusic;
    private applyControl;
}
export declare function createDefaultAudioFramework(): EngineFrameworkSettings;
export declare function createAudioRuntime(settings: AudioRuntimeSettings): AudioRuntime;
export declare function createAudioSettings(options: {
    runtimeId: string;
    buses?: AudioBusSettings[];
    persistentSources?: AudioPersistentSourceSettings[];
}): AudioRuntimeSettings;
export declare function validateAudioSettings(value: unknown): asserts value is AudioRuntimeSettings;
export declare function validateApplicationAudioSettings(value: unknown): asserts value is AudioApplicationSettings;
export declare function validateAudioCommand(value: unknown): asserts value is AudioCommand;
export declare function validateAudioBatch(value: unknown): asserts value is AudioCommandBatch;
export declare const audio: {
    readonly engine: {
        readonly createSystemRegistry: () => EngineSystemRegistry;
    };
    readonly createSettings: typeof createAudioSettings;
    readonly createRuntime: typeof createAudioRuntime;
    readonly createApplicationMixer: (applicationId: string, settings?: Omit<AudioApplicationSettings, "schemaVersion" | "applicationId" | "sequence"> & {
        sequence?: number;
    }) => ApplicationAudioMixer;
    readonly createDefaultFramework: typeof createDefaultAudioFramework;
    readonly emitter: (sourceId: string) => AudioEmitter;
    readonly bus: (settings: AudioBusSettings) => AudioBusSettings;
    readonly command: {
        readonly play: (settings: Omit<PlaySoundCommand, "type">) => PlaySoundCommand;
        readonly loop: (settings: Omit<StartLoopCommand, "type">) => StartLoopCommand;
        readonly music: (settings: Omit<PlayMusicCommand, "type">) => PlayMusicCommand;
        readonly stopSource: (settings: Omit<StopSourceCommand, "type">) => StopSourceCommand;
        readonly stopInstance: (settings: Omit<StopInstanceCommand, "type">) => StopInstanceCommand;
        readonly stopMusic: (settings?: Omit<StopMusicCommand, "type">) => StopMusicCommand;
        readonly setBusVolume: (settings: Omit<SetBusVolumeCommand, "type">) => SetBusVolumeCommand;
        readonly pauseBus: (settings: Omit<PauseBusCommand, "type">) => PauseBusCommand;
        readonly resumeBus: (settings: Omit<ResumeBusCommand, "type">) => ResumeBusCommand;
        readonly stopAll: (settings: Omit<StopAllCommand, "type">) => StopAllCommand;
    };
    readonly validate: typeof validateAudioSettings;
    readonly validateCommand: typeof validateAudioCommand;
    readonly validateBatch: typeof validateAudioBatch;
};
export {};
