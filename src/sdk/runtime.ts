import type { JsonValue } from "../contracts/systemSettings.js";
import type {
  EngineRuntimeEntity,
  EngineSystemContext,
  EngineSystemExecutor,
  EngineSystemRegistry,
} from "./systemRegistry.js";
import type { EngineWorldSettings } from "./worldBuilder.js";

class RuntimeEntity implements EngineRuntimeEntity {
  public readonly id: string;
  public readonly capabilities: readonly string[];
  private readonly components: Record<string, unknown>;

  public constructor(value: JsonValue) {
    if (!isRecord(value) || typeof value.id !== "string" || !Array.isArray(value.capabilities)) {
      throw new Error("Runtime entities require an id and capabilities");
    }
    this.id = value.id;
    this.capabilities = [...value.capabilities].filter((capability): capability is string => typeof capability === "string");
    this.components = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "id" && key !== "capabilities"));
  }

  public hasCapability(capability: string): boolean {
    return this.capabilities.includes(capability);
  }

  public getComponent<T = unknown>(capability: string): T | undefined {
    return this.components[capability] as T | undefined;
  }
}

export class EngineRuntime {
  private readonly entities: RuntimeEntity[];
  private readonly order: readonly string[];
  private readonly executors: readonly EngineSystemExecutor[];

  public constructor(settings: EngineWorldSettings, registry: EngineSystemRegistry) {
    if (!settings.framework) throw new Error("A runtime requires a selected framework");
    registry.validate(settings.framework);
    this.entities = settings.entities.map(entity => new RuntimeEntity(entity)).sort((a, b) => a.id.localeCompare(b.id));
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

  public getEntity(id: string): EngineRuntimeEntity | undefined { return this.entities.find(entity => entity.id === id); }
  public getEntities(): readonly EngineRuntimeEntity[] { return this.entities; }
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
