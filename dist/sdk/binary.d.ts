import type { EngineMovementState, EngineTransformState } from "./entityState.js";
import type { EngineWorldSettings } from "./worldBuilder.js";
import type { JsonValue } from "../contracts/systemSettings.js";
import type { BinarySchema, BinarySchemaRegistry, BinaryView } from "./schema.js";
export declare const ROAST_BINARY_PROTOCOL_VERSION = 1;
export declare const ROAST_BINARY_SCHEMA_VERSION = 1;
export declare const ROAST_PACKED_SCHEMA_VERSION = 2;
export declare const ROAST_BINARY_FRAME_TYPE = 1;
export declare const ROAST_PACKED_FRAME_TYPE = 2;
export interface BinaryStorage {
    allocate(bytes: Uint8Array): Uint8Array;
}
export interface BinarySchemaIdentity {
    namespace: string;
    typeId: number;
    version: number;
}
export interface PackedComponentBinding {
    [componentName: string]: BinarySchemaIdentity;
}
export interface PackedTypedSection {
    key: string;
    path: string[];
    schema: BinarySchemaIdentity;
    value: unknown;
}
export interface PackedSnapshotOptions {
    registry?: BinarySchemaRegistry;
    components?: PackedComponentBinding;
    sections?: PackedTypedSection[];
    diagnostics?: boolean;
}
export interface PackedSchemaDiagnostic {
    identity: string;
    name?: string;
    count: number;
    payloadBytes: number;
    recordBytes: number;
}
export interface PackedDiagnostics {
    frameBytes: number;
    outerFrameHeaderBytes: number;
    outerHeaderBytes: number;
    packedHeaderBytes: number;
    entityTableBytes: number;
    componentRecordBytes: number;
    stringTableBytes: number;
    tableBytes: number;
    metadataRegionBytes: number;
    dataRegionBytes: number;
    typedSectionDescriptorBytes: number;
    builtInBytes: number;
    builtInPackedPayloadBytes: number;
    registeredComponentBytes: number;
    registeredComponentPayloadBytes: number;
    typedSectionBytes: number;
    typedSectionPayloadBytes: number;
    fallbackBytes: number;
    fallbackJsonBytes: number;
    fallbackPercentage: number;
    fallbackCount: number;
    namespaceTableBytes: number;
    registeredEnvelopeOverheadBytes: number;
    unattributedBytes: number;
    physical: {
        outerFrameHeaderBytes: number;
        packedHeaderBytes: number;
        entityTableBytes: number;
        componentTableBytes: number;
        stringTableBytes: number;
        metadataRegionBytes: number;
        dataRegionBytes: number;
        unattributedBytes: number;
    };
    logical: {
        fallbackJsonBytes: number;
        builtInPackedPayloadBytes: number;
        registeredComponentPayloadBytes: number;
        typedSectionPayloadBytes: number;
        registeredEnvelopeOverheadBytes: number;
        typedSectionDescriptorBytes: number;
    };
    schemas: PackedSchemaDiagnostic[];
    sections: {
        key: string;
        path: string[];
        identity: string;
        payloadBytes: number;
        overheadBytes: number;
    }[];
}
export interface PackedSnapshotDiagnosticsResult {
    bytes: Uint8Array;
    diagnostics: PackedDiagnostics;
}
export declare const arrayBufferStorage: BinaryStorage;
/** BumpArena headers remain allocator metadata and are never part of Roast bytes. */
export declare function createArenaStorage(arena: {
    alloc(bytes: Uint8Array): unknown;
    read(location: unknown): Uint8Array | null;
}): BinaryStorage;
export declare const f32: () => BinarySchema<number>;
export declare const f64: () => BinarySchema<number>;
export declare const u8: () => BinarySchema<number>;
export declare const bool: () => BinarySchema<boolean>;
export declare function struct<T extends Record<string, unknown>>(fields: {
    [K in keyof T]: BinarySchema<T[K]>;
}): BinarySchema<T>;
export declare const transformBinarySchema: BinarySchema<{
    x: number;
    y: number;
    rotation: number;
}>;
export declare const movementBinarySchema: BinarySchema<{
    velocityX: number;
    velocityY: number;
    angularVelocity: number;
    enabled: boolean;
}>;
export declare function encodeSchema<T>(value: T, schema: BinarySchema<T>, storage?: BinaryStorage): Uint8Array;
export declare function decodeSchema<T>(bytes: Uint8Array, schema: BinarySchema<T>): T;
export declare function encodeFrame(payload: Uint8Array, frameType?: number): Uint8Array;
export declare function decodeFrame(bytes: Uint8Array): {
    protocolVersion: number;
    schemaVersion: number;
    frameType: number;
    payload: Uint8Array;
};
export declare function encodeSettings(settings: JsonValue): Uint8Array;
export declare function decodeSettings(bytes: Uint8Array): JsonValue;
export declare function encodePackedSnapshot(settings: EngineWorldSettings, storageOrOptions?: BinaryStorage | PackedSnapshotOptions, maybeOptions?: PackedSnapshotOptions): Uint8Array;
export declare function encodePackedSnapshotWithDiagnostics(settings: EngineWorldSettings, options?: PackedSnapshotOptions): PackedSnapshotDiagnosticsResult;
export declare function decodePackedSnapshot(bytes: Uint8Array, options?: {
    registry?: BinarySchemaRegistry;
}): {
    settings: EngineWorldSettings;
    view: PackedSnapshotView;
};
export declare class PackedSnapshotView {
    private readonly bytes;
    private readonly data;
    private readonly strings;
    private readonly entityOffset;
    private readonly componentOffset;
    private readonly entityCount;
    private readonly registry?;
    private readonly dataOffset;
    private readonly metadataOffset;
    private readonly metadataLength;
    constructor(payload: Uint8Array, registry?: BinarySchemaRegistry);
    getEntity(id: string): PackedEntityView | undefined;
    getEntities(): PackedEntityView[];
    getTypedSection(key: string): BinaryView | undefined;
    private metadataObject;
    toSettings(): EngineWorldSettings;
}
export declare class PackedEntityView {
    private readonly data;
    private readonly bytes;
    private readonly strings;
    private readonly offset;
    private readonly componentBase;
    private readonly registry?;
    constructor(data: DataView, strings: string[], offset: number, componentBase: number, registry?: BinarySchemaRegistry);
    get id(): string;
    get capabilities(): string[];
    getComponent(name: string): PackedTransformView | PackedMovementView | undefined;
    getRegisteredComponent(name: string, writable?: boolean): BinaryView | undefined;
    componentRanges(): {
        offset: number;
        length: number;
    }[];
    toSettings(): Record<string, unknown>;
}
export declare class PackedTransformView {
    private readonly data;
    private readonly offset;
    private readonly readOnly;
    constructor(data: DataView, offset: number, readOnly?: boolean);
    private set;
    get x(): number;
    set x(value: number);
    get y(): number;
    set y(value: number);
    get rotation(): number;
    set rotation(value: number);
    toSettings(): EngineTransformState;
}
export declare class PackedMovementView {
    private readonly data;
    private readonly offset;
    private readonly readOnly;
    constructor(data: DataView, offset: number, readOnly?: boolean);
    get velocityX(): number;
    get velocityY(): number;
    get angularVelocity(): number;
    get enabled(): boolean;
    toSettings(): EngineMovementState;
}
export declare class BinaryBackedTransform {
    private readonly bytes;
    private readonly view;
    constructor(value: EngineTransformState, storage?: BinaryStorage);
    get x(): number;
    set x(value: number);
    get y(): number;
    set y(value: number);
    get rotation(): number;
    set rotation(value: number);
    toSettings(): EngineTransformState;
    toBinary(): Uint8Array;
}
export declare function binaryBackedTransform(value: EngineTransformState, storage?: BinaryStorage): BinaryBackedTransform;
export declare function binarySnapshot(settings: EngineWorldSettings, storage?: BinaryStorage): Uint8Array;
export declare function restoreBinarySnapshot(bytes: Uint8Array, options?: {
    registry?: BinarySchemaRegistry;
}): EngineWorldSettings;
export type BinarySnapshotFormat = "json" | "packed";
export declare function packedSnapshot(settings: EngineWorldSettings, storage?: BinaryStorage, options?: PackedSnapshotOptions): Uint8Array;
