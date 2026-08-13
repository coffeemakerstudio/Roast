import { expect, test } from "bun:test";
import { binary, createBinarySchemaRegistry, decodePackedSnapshot, encodePackedSnapshot } from "../src/index.ts";

const player = binary.struct({ hp: binary.u16(), flags: binary.u8() });
function registry() { return createBinarySchemaRegistry().register({ namespace: "example-game", typeId: 1, version: 1, name: "player", schema: player }); }
function settings() { return { schemaVersion: 1 as const, id: "world", worldSize: { x: 100, y: 100 }, entities: [{ id: "a", capabilities: ["example.player"], "example.player": { hp: 25, flags: 3 } }], structures: [], effects: [], counters: [] }; }

test("registered component is packed and round-trips without fallback duplication", () => {
  const bytes = encodePackedSnapshot(settings(), { registry: registry(), components: { "example.player": { namespace: "example-game", typeId: 1, version: 1 } } });
  const decoded = decodePackedSnapshot(bytes, { registry: registry() });
  expect(decoded.settings.entities[0]).toMatchObject({ id: "a", "example.player": { hp: 25, flags: 3 } });
  expect(new TextDecoder().decode(bytes)).not.toContain('"hp"');
});

test("missing registry fails safely", () => {
  const bytes = encodePackedSnapshot(settings(), { registry: registry(), components: { "example.player": { namespace: "example-game", typeId: 1, version: 1 } } });
  expect(() => decodePackedSnapshot(bytes)).toThrow(/registry/i);
});
