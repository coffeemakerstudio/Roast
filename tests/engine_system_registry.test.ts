import { expect, test } from "bun:test";
import { engine, EngineSystemRegistry } from "@coffeemakerstudio/roast";

test("generic engine system registry resolves dependencies in deterministic order", () => {
	const registry = new EngineSystemRegistry()
		.register({ id: "physics", provides: ["physics"] })
		.register({ id: "collision", requires: ["physics"], after: ["physics"] })
		.register({ id: "debug", optional: true });
	const selected = registry.select(["collision"]);
	expect(selected.systemOrder).toEqual(["physics", "collision"]);
	expect(selected.systems.map(system => system.systemId)).toEqual(["collision", "physics"]);
	expect(() => registry.validate(selected)).not.toThrow();
	expect(() => registry.select(["unknown"])).toThrow("Unknown");
});

test("generic engine worlds contain only JSON-safe authoring data", () => {
	const entity = engine.createEntity({ id: "entity", capabilities: ["position"] });
	const world = engine.createWorld({ id: "world", worldSize: { x: 100, y: 100 } })
		.addEntity(entity)
		.addStructure(engine.createStructure({ shape: "line", x: 0, y: 0, x2: 100, y2: 100 }))
		.addEffect(engine.createEffect({ type: "tag", value: "generic" }))
		.build();
	expect(JSON.parse(engine.buildJson(world))).toEqual(world);
	expect(() => engine.validate(() => undefined)).toThrow("JSON");
});
