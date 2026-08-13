import type {
  EngineRuntimeEntity,
  EngineSystemContext,
  EngineSystemExecutor,
  EngineSystemRegistry,
} from "./systemRegistry.js";
import type { EngineWorldSettings } from "./worldBuilder.js";
import { assertJsonValue, type JsonValue } from "../contracts/systemSettings.js";
import { binarySnapshot, packedSnapshot, restoreBinarySnapshot, type BinaryStorage, type BinarySnapshotFormat, type PackedSnapshotOptions } from "./binary.js";

class RuntimeEntity implements EngineRuntimeEntity {
  public readonly id: string;
  public readonly capabilities: readonly string[];
  private readonly components: Record<string, unknown>;

  public constructor(value: JsonValue) {
    if (!isRecord(value) || typeof value.id !== "string" || !Array.isArray(value.capabilities)) {
      throw new Error("Runtime entities require an id and capabilities");
    }
    this.id = value.id;
    this.capabilities = [...value.capabilities].filter((capability): capability is string => typeof capability === "string").sort();
    this.components = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "id" && key !== "capabilities").map(([key, component]) => [key, cloneJson(component)]));
  }

  public hasCapability(capability: string): boolean {
    return this.capabilities.includes(capability);
  }

  public getComponent<T = unknown>(capability: string): T | undefined {
    return this.components[capability] as T | undefined;
  }

  public toSettings(): JsonValue {
    const settings = { id: this.id, capabilities: [...this.capabilities], ...this.components } as unknown;
    assertJsonValue(settings);
    return cloneJson(settings);
  }
}

export class EngineRuntime {
  private readonly entities: RuntimeEntity[];
  private readonly order: readonly string[];
  private readonly executors: readonly EngineSystemExecutor[];
  private readonly metadata: Omit<EngineWorldSettings, "entities">;

  public constructor(settings: EngineWorldSettings, registry: EngineSystemRegistry) {
    if (!settings.framework) throw new Error("A runtime requires a selected framework");
    registry.validate(settings.framework);
    this.entities = settings.entities.map(entity => new RuntimeEntity(entity)).sort((a, b) => a.id.localeCompare(b.id));
    const { entities: _entities, ...metadata } = settings;
    this.metadata = structuredClone(metadata);
    this.order = [...settings.framework.systemOrder];
    this.executors = this.order.map(id => registry.getExecutor(id)).filter((executor): executor is EngineSystemExecutor => Boolean(executor));
  }

  public tick(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error("deltaSeconds must be finite and non-negative");
    const entities = this.entities;
    const context: EngineSystemContext = {
      deltaSeconds,
      entities,
      query: required => entities.filter(entity => required.every(capability => entity.hasCapability(capability))),
    };
    for (const executor of this.executors) executor(context);
  }

  /** Returns an authoritative, detached snapshot of the current runtime state. */
  public toSettings(): EngineWorldSettings {
    const entities = this.entities.map(entity => entity.toSettings());
    const settings = { ...this.metadata, entities };
    assertJsonValue(settings);
    return cloneJson(settings as unknown as JsonValue) as unknown as EngineWorldSettings;
  }

  /** Alias for callers that prefer snapshot terminology. */
  public snapshot(): EngineWorldSettings { return this.toSettings(); }

  /** Opt-in deterministic binary snapshot; the JSON/settings lifecycle remains canonical. */
  public snapshotBinary(storageOrOptions?: BinaryStorage | { format?: BinarySnapshotFormat; storage?: BinaryStorage; registry?: PackedSnapshotOptions["registry"]; components?: PackedSnapshotOptions["components"]; sections?: PackedSnapshotOptions["sections"] }): Uint8Array { const options = storageOrOptions && "allocate" in storageOrOptions ? { format: "json" as const, storage: storageOrOptions } : (storageOrOptions ?? {}); return options.format === "packed" ? packedSnapshot(this.toSettings(), options.storage, options) : binarySnapshot(this.toSettings(), options.storage); }

  /** Restores a runtime from a previously exported snapshot. */
  public static restore(settings: EngineWorldSettings, registry: EngineSystemRegistry): EngineRuntime {
    return new EngineRuntime(settings, registry);
  }

  public static restoreBinary(bytes: Uint8Array, registry: EngineSystemRegistry, binaryOptions?: { registry?: PackedSnapshotOptions["registry"] }): EngineRuntime { return new EngineRuntime(restoreBinarySnapshot(bytes, binaryOptions), registry); }

  public getEntity(id: string): EngineRuntimeEntity | undefined { return this.entities.find(entity => entity.id === id); }
  public getEntities(): readonly EngineRuntimeEntity[] { return this.entities; }
}

function cloneJson<T extends JsonValue>(value: T): T {
  if (Array.isArray(value)) return value.map(item => cloneJson(item)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, cloneJson(item)])) as T;
  }
  return value;
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
