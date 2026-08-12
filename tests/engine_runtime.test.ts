import { expect, test } from "bun:test";
import { engine, type EngineSystemContext } from "../src/index.ts";

test("runtime executes registered systems against matching capabilities", () => {
  const registry = engine.createSystemRegistry();
  registry.register({ id: "test.movement", requiresCapabilities: ["transform.state", "movement.state"] }, (context: EngineSystemContext) => {
    for (const entity of context.query(["transform.state", "movement.state"])) {
      const transform = entity.getComponent<{ position: { x: number; y: number } }>("transform");
      const movement = entity.getComponent<{ velocity: { x: number; y: number } }>("movement");
      if (transform && movement) transform.position.x += movement.velocity.x * context.deltaSeconds;
    }
  });

  const transform = engine.createTransformState({ position: { x: 0, y: 0 } });
  const movement = engine.createMovementState({ velocity: { x: 4, y: 2 } });
  const runtime = engine.createWorld({ id: "test", worldSize: { x: 100, y: 100 } })
    .addEntity(engine.createEntity({ id: "player", capabilities: ["transform.state", "movement.state"], transform, movement }))
    .useFramework(registry.select(["test.movement"]))
    .buildRuntime(registry);

  runtime.tick(0.5);
  const result = runtime.getEntity("player")?.getComponent<typeof transform>("transform");
  expect(result?.position).toEqual({ x: 2, y: 0 });
});

test("runtime system order and entity iteration are deterministic", () => {
  const calls: string[] = [];
  const registry = engine.createSystemRegistry();
  registry.register({ id: "z-last" }, () => calls.push("z"));
  registry.register({ id: "a-first" }, () => calls.push("a"));
  const runtime = engine.createWorld({ id: "test", worldSize: { x: 10, y: 10 } })
    .useFramework(registry.select(["z-last", "a-first"]))
    .buildRuntime(registry);

  runtime.tick(1);
  expect(calls).toEqual(["a", "z"]);
});
