import { expect, test } from "bun:test";
import { binary, createBinarySchemaRegistry, createBinaryView, decodeWithSchema, encodeWithSchema } from "../src/index.ts";

test("generic fixed downstream schema encodes and supports writable views", () => {
  const schema = binary.struct({ x: binary.f32(), hp: binary.u16(), flags: binary.u8() });
  const bytes = encodeWithSchema(schema, { x: 2.5, hp: 300, flags: 3 });
  expect(Array.from(bytes)).toEqual([0, 0, 32, 64, 44, 1, 3]);
  const view = createBinaryView(schema, bytes, 0, true);
  expect(view.get("hp")).toBe(300); view.set("hp", 12); expect(decodeWithSchema(schema, bytes).hp).toBe(12);
});

test("generic enums, unions, arrays and optionals round-trip", () => {
  const mode = binary.enumU8({ "mode.alpha": 1, "mode.beta": 2 });
  const effect = binary.taggedUnion({ tag: binary.u8(), variants: { 1: binary.struct({ x: binary.f32(), y: binary.f32() }), 2: binary.struct({ amount: binary.u16() }) } });
  const schema = binary.struct({ mode, effects: binary.array(effect), note: binary.optional(binary.string()) });
  const value = { mode: "mode.beta", effects: [{ tag: 1, value: { x: 1, y: 2 } }, { tag: 2, value: { amount: 7 } }], note: undefined };
  expect(decodeWithSchema(schema, encodeWithSchema(schema, value))).toEqual(value);
  expect(() => encodeWithSchema(mode, "unknown")).toThrow();
});

test("schema registry requires stable identities and seals", () => {
  const registry = createBinarySchemaRegistry(); const schema = binary.u8();
  registry.register({ namespace: "example", typeId: 1, version: 1, schema });
  expect(() => registry.register({ namespace: "example", typeId: 1, version: 1, schema })).toThrow();
  registry.seal(); expect(() => registry.register({ namespace: "other", typeId: 1, version: 1, schema })).toThrow();
  expect(registry.get("example", 1)?.schema).toBe(schema);
});

test("registration order does not affect sorted registry view", () => {
  const a = createBinarySchemaRegistry().register({ namespace: "b", typeId: 2, version: 1, schema: binary.u8() }).register({ namespace: "a", typeId: 1, version: 1, schema: binary.u8() }).entriesSorted().map(x => `${x.namespace}:${x.typeId}`);
  const b = createBinarySchemaRegistry().register({ namespace: "a", typeId: 1, version: 1, schema: binary.u8() }).register({ namespace: "b", typeId: 2, version: 1, schema: binary.u8() }).entriesSorted().map(x => `${x.namespace}:${x.typeId}`);
  expect(a).toEqual(b);
});

test("registry supports multiple versions of one stable type identity", () => { const v1 = binary.u8(); const v2 = binary.u16(); const registry = createBinarySchemaRegistry().register({ namespace: "example", typeId: 7, version: 1, schema: v1 }).register({ namespace: "example", typeId: 7, version: 2, schema: v2 }); expect(registry.get("example", 7, 1)?.schema).toBe(v1); expect(registry.get("example", 7, 2)?.schema).toBe(v2); expect(registry.get("example", 7)?.schema).toBe(v2); expect(registry.entriesSorted().map(entry => entry.version)).toEqual([1, 2]); });
