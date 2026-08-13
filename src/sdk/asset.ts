import type { EngineWorldSettings } from "./worldBuilder.js";
import { encodePackedSnapshotWithDiagnostics, type PackedSnapshotDiagnosticsResult, type PackedSnapshotOptions } from "./binary.js";

export interface PackedAssetManifest { protocolVersion: number; packedSchemaVersion: number; byteLength: number; contentHash: string; schemaIdentities: string[]; fallbackPercentage: number; label?: string; }
export interface PackedAssetCompilation extends PackedSnapshotDiagnosticsResult { manifest: PackedAssetManifest; }
function contentHash(bytes: Uint8Array): string { let hash = 2166136261; for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, "0"); }
export function compilePackedSnapshotAsset(settings: EngineWorldSettings, options: PackedSnapshotOptions & { label?: string } = {}): PackedAssetCompilation { const result = encodePackedSnapshotWithDiagnostics(settings, options); const hash = contentHash(result.bytes); return { ...result, manifest: { protocolVersion: 1, packedSchemaVersion: 2, byteLength: result.bytes.byteLength, contentHash: hash, schemaIdentities: result.diagnostics.schemas.map(schema => schema.identity), fallbackPercentage: result.diagnostics.fallbackPercentage, ...(options.label ? { label: options.label } : {}) } }; }
export function loadPackedSnapshotAsset(bytes: Uint8Array): Uint8Array { return bytes; }
