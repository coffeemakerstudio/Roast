import { expect, test } from "bun:test";
import { engine, type EngineSystemContext } from "../src/index.ts";

function makeRuntime() {
  const registry = engine.createSystemRegistry();
  registry.register({ id: "test.mutate", requiresCapabilities: ["example.custom-state", "health.state", "inventory.state"] }, (context: EngineSystemContext) => {
    for (const entity of context.query(["example.custom-state", "health.state", "inventory.state"])) {
      const custom = entity.getComponent<{ value: number; nested: { enabled: boolean } }>("example.custom-state")!;
      const health = entity.getComponent<{ current: number }>("health.state")!;
      const inventory = entity.getComponent<{ items: string[] }>("inventory.state")!;
      custom.value += context.deltaSeconds;
      custom.nested.enabled = false;
      health.current += 4;
      inventory.items.push("runtime-item");
    }
  });
  const runtime = engine.createWorld({ id: "snapshot-test", worldSize: { x: 100, y: 100 } })
    .addEntity(engine.createEntity({
      id: "entity-b",
      capabilities: ["inventory.state", "example.custom-state", "health.state"],
      "example.custom-state": { value: 1, nested: { enabled: true } },
      "health.state": { current: 10 },
      "inventory.state": { items: ["initial"] },
    }))
    .addEntity(engine.createEntity({
      id: "entity-a",
      capabilities: ["example.custom-state"],
      "example.custom-state": { value: 7, nested: { enabled: true } },
    }))
    .useFramework(registry.select(["test.mutate"]))
    .buildRuntime(registry);
  return { runtime, registry };
}

test("snapshot exports mutated arbitrary components and restores deterministic continuation", () => {
  const { runtime, registry } = makeRuntime();
  runtime.tick(2);
  const snapshot = runtime.toSettings();
  const alias = runtime.getEntity("entity-b")?.getComponent<{ value: number }>("example.custom-state")!;
  const saved = snapshot.entities.find(entity => (entity as { id: string }).id === "entity-b") as Record<string, any>;

  expect(saved["example.custom-state"]).toEqual({ value: 3, nested: { enabled: false } });
  expect(saved["health.state"]).toEqual({ current: 14 });
  expect(saved["inventory.state"]).toEqual({ items: ["initial", "runtime-item"] });
  expect(saved["example.custom-state"]).not.toBe(alias);

  const restored = runtime.constructor.restore(structuredClone(snapshot), registry);
  saved["example.custom-state"].value = 999;
  expect(alias.value).toBe(3);

  runtime.tick(1);
  restored.tick(1);
  expect(restored.toSettings()).toEqual(runtime.toSettings());
});

test("snapshot is isolated from later runtime mutation and has stable entity/capability ordering", () => {
  const { runtime } = makeRuntime();
  const snapshot = runtime.snapshot();
  expect(snapshot.entities.map(entity => (entity as { id: string }).id)).toEqual(["entity-a", "entity-b"]);
  expect((snapshot.entities[1] as { capabilities: string[] }).capabilities).toEqual(["example.custom-state", "health.state", "inventory.state"]);

  const custom = runtime.getEntity("entity-b")?.getComponent<{ value: number }>("example.custom-state")!;
  custom.value = 42;
  expect(((snapshot.entities[1] as Record<string, any>)["example.custom-state"]).value).toBe(1);
});

test("generic runtime authoring rejects non-JSON-safe component values", () => {
  expect(() => engine.createEntity({ id: "bad", capabilities: ["bad"], bad: () => 1 })).toThrow();
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  expect(() => engine.createEntity({ id: "bad", capabilities: ["bad"], bad: cyclic })).toThrow();
});
