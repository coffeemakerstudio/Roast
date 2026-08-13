import { expect, test } from "bun:test";
import { binary, createBinarySchemaRegistry, decodePackedSnapshot, encodePackedSnapshot } from "../src/index.ts";
const player = binary.struct({ hp: binary.u16(), flags: binary.u8() });
const rule = binary.struct({ turn: binary.u32(), active: binary.u8() });
const mode = binary.struct({ id: binary.u8() });
const registry = () => createBinarySchemaRegistry().register({ namespace: "example", typeId: 1, version: 1, schema: player }).register({ namespace: "example", typeId: 2, version: 1, schema: rule }).register({ namespace: "example", typeId: 3, version: 1, schema: mode });
test("root and nested typed sections reconstruct without mutating settings", () => {
 const settings: any = { schemaVersion: 1, id: "w", worldSize: { x: 1, y: 1 }, entities: [{ id: "a", capabilities: ["notes", "player"], player: { hp: 4242, flags: 3 }, notes: { text: "keep" } }], structures: [], effects: [], counters: [], ruleState: { turn: 4, active: 1 }, game: { metadata: { id: 7 }, sibling: true } };
 const before = structuredClone(settings); const options: any = { registry: registry(), components: { player: { namespace: "example", typeId: 1, version: 1 } }, sections: [{ key: "rule", path: ["ruleState"], schema: { namespace: "example", typeId: 2, version: 1 }, value: settings.ruleState }, { key: "mode", path: ["game", "metadata"], schema: { namespace: "example", typeId: 3, version: 1 }, value: settings.game.metadata }] };
 const bytes = encodePackedSnapshot(settings, options); expect(settings).toEqual(before); expect(decodePackedSnapshot(bytes, { registry: options.registry }).settings).toEqual(settings);
});
test("overlapping typed section ownership is rejected", () => { const s: any = { schemaVersion: 1, id: "w", worldSize: { x: 1, y: 1 }, entities: [], structures: [], effects: [], counters: [], game: { metadata: 1 } }; const r = registry(); expect(() => encodePackedSnapshot(s, { registry: r, sections: [{ key: "a", path: ["game"], schema: { namespace: "example", typeId: 3, version: 1 }, value: { id: 1 } }, { key: "b", path: ["game", "metadata"], schema: { namespace: "example", typeId: 3, version: 1 }, value: { id: 1 } }] })).toThrow(/overlapping/i); });
