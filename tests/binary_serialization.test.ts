import { expect, test } from "bun:test";
import { engine, binaryBackedTransform, decodeFrame, decodeSettings, encodeFrame, encodeSettings, createArenaStorage, type EngineTransformState } from "../src/index.ts";

const transform: EngineTransformState = { schemaVersion: 1, position: { x: 10, y: 20 }, rotation: 0.5 };
test("fixed transform binary view mirrors direct runtime mutations", () => {
  const backed = binaryBackedTransform(transform); expect(backed.toSettings()).toEqual(transform); backed.x = 50;
  const raw = new DataView(backed.toBinary().buffer, backed.toBinary().byteOffset, backed.toBinary().byteLength);
  expect(raw.getFloat32(0, true)).toBe(50); expect(backed.toSettings().position).toEqual({ x: 50, y: 20 });
});
test("binary frame and settings round-trip with explicit versions", () => {
  const settings = { mode: "continuous", value: 7, nested: { enabled: true } } as const; const bytes = encodeSettings(settings); const decoded = decodeSettings(bytes);
  expect(decoded).toEqual(settings); expect(Array.from(bytes)).toEqual(Array.from(encodeSettings(settings))); expect(decodeFrame(bytes).protocolVersion).toBe(1);
});
test("binary frame rejects invalid, truncated, and unsupported data", () => {
  const bytes = encodeFrame(new Uint8Array([1, 2])); expect(() => decodeFrame(bytes.subarray(0, 4))).toThrow("truncated"); const bad = bytes.slice(); bad[0] ^= 1; expect(() => decodeFrame(bad)).toThrow("magic");
  const version = bytes.slice(); new DataView(version.buffer).setUint16(4, 99, true); expect(() => decodeFrame(version)).toThrow("version");
});
test("runtime binary snapshot restores through existing settings lifecycle", () => {
  const registry = engine.createSystemRegistry(); registry.register({ id: "noop" }, () => {});
  const runtime = engine.createWorld({ id: "binary", worldSize: { x: 100, y: 100 } }).addEntity(engine.createEntity({ id: "entity", capabilities: ["transform.state"], "transform.state": transform })).useFramework(registry.select(["noop"])).buildRuntime(registry);
  const binary = runtime.snapshotBinary(); const restored = runtime.constructor.restoreBinary(binary, registry); expect(restored.snapshot()).toEqual(runtime.snapshot()); expect(Array.from(binary)).toEqual(Array.from(runtime.snapshotBinary()));
});
test("arena-compatible storage changes allocation backend, not Roast payload", () => {
  let stored = new Uint8Array(); const arena = { alloc(bytes: Uint8Array) { stored = bytes.slice(); return 1; }, read(_location: unknown) { return stored; } };
  const settings = { a: 1, b: "two" }; const standard = encodeSettings(settings); const arenaBytes = encodeSettings(settings); const adapted = createArenaStorage(arena); const backed = adapted.allocate(arenaBytes);
  expect(Array.from(backed)).toEqual(Array.from(standard)); expect(Array.from(backed)).toEqual(Array.from(arenaBytes));
});
