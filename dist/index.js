// src/contracts/systemSettings.ts
function assertJsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number") {
    if (Number.isFinite(value))
      return;
    throw new Error("System settings must contain finite JSON numbers");
  }
  if (Array.isArray(value)) {
    value.forEach(assertJsonValue);
    return;
  }
  if (typeof value === "object") {
    for (const child of Object.values(value))
      assertJsonValue(child);
    return;
  }
  throw new Error("System settings must contain JSON data only");
}

// src/sdk/systemRegistry.ts
class EngineSystemRegistry {
  definitions = new Map;
  executors = new Map;
  register(definition, executor) {
    validateDefinition(definition);
    if (this.definitions.has(definition.id))
      throw new Error(`Duplicate system definition '${definition.id}'`);
    this.definitions.set(definition.id, clone(definition));
    if (executor)
      this.executors.set(definition.id, executor);
    return this;
  }
  getDefinition(id) {
    const definition = this.definitions.get(id);
    if (!definition)
      throw new Error(`Unknown system '${id}'`);
    return clone(definition);
  }
  getExecutor(id) {
    return this.executors.get(id);
  }
  select(ids) {
    const selected = new Set;
    const add = (id) => {
      if (selected.has(id))
        return;
      const definition = this.definitions.get(id);
      if (!definition)
        throw new Error(`Unknown system '${id}'`);
      selected.add(id);
      for (const capability of definition.requires ?? []) {
        const providers = [...this.definitions.values()].filter((candidate) => provides(candidate, capability));
        const active = providers.filter((candidate) => selected.has(candidate.id));
        if (active.length === 1)
          continue;
        if (active.length > 1 || providers.length !== 1)
          throw new Error(`System '${id}' requires exactly one provider for '${capability}'`);
        add(providers[0].id);
      }
    };
    ids.forEach(add);
    validateReplacements([...selected].map((id) => this.definitions.get(id)));
    const order = topologicalOrder([...selected].map((id) => this.definitions.get(id)));
    return {
      schemaVersion: 1,
      systems: order.map((definition) => ({ systemId: definition.id, schemaVersion: definition.schemaVersion ?? 1, state: clone(definition.state ?? {}) })).sort((a, b) => a.systemId.localeCompare(b.systemId)),
      systemOrder: order.map((definition) => definition.id)
    };
  }
  validate(settings) {
    if (!settings || typeof settings !== "object" || Array.isArray(settings))
      throw new Error("Malformed framework settings");
    const value = settings;
    if (value.schemaVersion !== 1 || !Array.isArray(value.systems) || !Array.isArray(value.systemOrder))
      throw new Error("Malformed framework settings");
    const ids = new Set;
    for (const system of value.systems) {
      if (!system || typeof system.systemId !== "string" || system.schemaVersion !== 1 || !system.state || typeof system.state !== "object" || Array.isArray(system.state))
        throw new Error("Malformed system settings");
      if (!this.definitions.has(system.systemId) || ids.has(system.systemId))
        throw new Error(`Unknown or duplicate system '${system.systemId}'`);
      assertJsonValue(system.state);
      ids.add(system.systemId);
    }
    if (value.systemOrder.length !== ids.size || new Set(value.systemOrder).size !== ids.size || value.systemOrder.some((id) => !ids.has(id)))
      throw new Error("Invalid framework system order");
    const expected = this.select(value.systemOrder).systemOrder;
    if (expected.join("|") !== value.systemOrder.join("|"))
      throw new Error("Framework system order violates dependencies");
  }
  validateEffectSupport(settings, effects, catalog) {
    this.validate(settings);
    const selected = new Set(settings.systemOrder);
    const definitions = [...selected].map((id) => this.definitions.get(id));
    for (const effect of effects) {
      catalog.validate(effect);
      const typed = effect;
      const definition = catalog.get(typed.type);
      const accepted = definitions.some((candidate) => candidate.acceptsEffects?.includes(typed.type) === true);
      if (!accepted)
        throw new Error(`No selected system accepts effect '${typed.type}'`);
      for (const capability of definition.requiresCapability ?? []) {
        if (!definitions.some((candidate) => provides(candidate, capability)))
          throw new Error(`Effect '${typed.type}' requires missing capability '${capability}'`);
      }
    }
  }
}
function validateDefinition(definition) {
  if (!definition || typeof definition.id !== "string" || !/^[a-z0-9.-]{1,80}$/.test(definition.id))
    throw new Error("Invalid system definition ID");
  if (definition.schemaVersion !== undefined && definition.schemaVersion !== 1)
    throw new Error("Unsupported system definition version");
  for (const list of [definition.provides, definition.requires, definition.before, definition.after, definition.replaces, definition.requiresCapabilities]) {
    if (list !== undefined && (!Array.isArray(list) || list.some((value) => typeof value !== "string" || value.length === 0)))
      throw new Error(`Invalid system definition '${definition.id}'`);
  }
  if (definition.acceptsEffects !== undefined && (!Array.isArray(definition.acceptsEffects) || definition.acceptsEffects.some((value) => typeof value !== "string" || value.length === 0)))
    throw new Error(`Invalid accepted Effects for '${definition.id}'`);
  if (definition.requiresCapabilities !== undefined && (!Array.isArray(definition.requiresCapabilities) || definition.requiresCapabilities.some((value) => typeof value !== "string" || value.length === 0)))
    throw new Error(`Invalid required capabilities for '${definition.id}'`);
  assertJsonValue(definition.state ?? {});
}
function provides(definition, capability) {
  return definition.id === capability || definition.provides?.includes(capability) === true;
}
function validateReplacements(definitions) {
  for (const definition of definitions) {
    for (const capability of definition.replaces ?? []) {
      const conflicts = definitions.filter((candidate) => candidate.id !== definition.id && provides(candidate, capability) && !definition.replaces?.includes(capability) && !(definition.replaces?.includes(candidate.id) || candidate.replaces?.includes(definition.id)));
      if (conflicts.length > 0)
        throw new Error(`System '${definition.id}' conflicts with '${conflicts[0].id}' for '${capability}'`);
    }
  }
  const capabilities = new Set(definitions.flatMap((definition) => [definition.id, ...definition.provides ?? []]));
  for (const capability of capabilities) {
    const providers = definitions.filter((definition) => provides(definition, capability));
    if (providers.length > 1 && !providers.some((definition) => definition.replaces?.includes(capability)))
      throw new Error(`Multiple selected providers for '${capability}'`);
  }
}
function topologicalOrder(definitions) {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const edges = new Map(definitions.map((definition) => [definition.id, new Set]));
  for (const definition of definitions) {
    for (const dependency of definition.after ?? [])
      if (byId.has(dependency))
        edges.get(dependency).add(definition.id);
    for (const dependency of definition.before ?? [])
      if (byId.has(dependency))
        edges.get(definition.id).add(dependency);
    for (const capability of definition.requires ?? []) {
      const provider = definitions.find((candidate) => candidate.id !== definition.id && provides(candidate, capability));
      if (provider)
        edges.get(provider.id).add(definition.id);
    }
  }
  const incoming = new Map(definitions.map((definition) => [definition.id, 0]));
  for (const targets of edges.values())
    for (const target of targets)
      incoming.set(target, incoming.get(target) + 1);
  const available = definitions.filter((definition) => incoming.get(definition.id) === 0).map((definition) => definition.id).sort();
  const result = [];
  while (available.length) {
    const id = available.shift();
    result.push(byId.get(id));
    for (const target of edges.get(id)) {
      incoming.set(target, incoming.get(target) - 1);
      if (incoming.get(target) === 0) {
        available.push(target);
        available.sort();
      }
    }
  }
  if (result.length !== definitions.length)
    throw new Error("System dependencies contain a cycle");
  return result;
}
function clone(value) {
  return structuredClone(value);
}

// src/contracts/counterState.ts
var COUNTER_SCHEMA_VERSION = 1;
function createCounterState(input) {
  const state = {
    schemaVersion: COUNTER_SCHEMA_VERSION,
    id: input.id,
    value: input.value ?? 0
  };
  validateCounterState(state);
  return state;
}
function validateCounterState(value) {
  if (!isRecord(value) || Object.keys(value).some((key) => !["schemaVersion", "id", "value"].includes(key)) || Object.keys(value).length !== 3) {
    throw new Error("Malformed counter state");
  }
  if (value.schemaVersion !== COUNTER_SCHEMA_VERSION)
    throw new Error("Unsupported counter state schema version");
  if (typeof value.id !== "string" || value.id.length === 0)
    throw new Error("Counter state requires a non-empty id");
  if (typeof value.value !== "number" || !Number.isFinite(value.value))
    throw new Error("Counter state value must be finite");
}
function canonicalizeCounterStates(value) {
  if (!Array.isArray(value))
    throw new Error("Counter states must be an array");
  const counters = value.map((counter) => {
    validateCounterState(counter);
    return { ...counter };
  });
  if (new Set(counters.map((counter) => counter.id)).size !== counters.length)
    throw new Error("Counter state IDs must be unique");
  return counters.sort((a, b) => a.id.localeCompare(b.id));
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/sdk/schema.ts
class Writer {
  bytes = [];
  u8(v) {
    if (!Number.isInteger(v) || v < 0 || v > 255)
      throw new Error("Invalid u8");
    this.bytes.push(v);
  }
  raw(b) {
    for (const x of b)
      this.bytes.push(x);
  }
  fixed(n, f) {
    const b = new Uint8Array(n);
    f(new DataView(b.buffer));
    this.raw(b);
  }
  result() {
    return Uint8Array.from(this.bytes);
  }
}

class Reader {
  bytes;
  offset;
  constructor(bytes, offset = 0) {
    this.bytes = bytes;
    this.offset = offset;
  }
  need(n) {
    if (n < 0 || this.offset + n > this.bytes.length)
      throw new Error("Binary payload is truncated");
  }
  u8() {
    this.need(1);
    return this.bytes[this.offset++];
  }
  fixed(n, f) {
    this.need(n);
    const v = f(new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, n));
    this.offset += n;
    return v;
  }
  raw(n) {
    this.need(n);
    const b = this.bytes.slice(this.offset, this.offset + n);
    this.offset += n;
    return b;
  }
}
function make(write, read, fixed, fields) {
  const s = { size: fixed ?? 0, capabilities: { fixedSize: fixed !== undefined, byteLength: fixed, variableLength: fixed === undefined, zeroCopyReadable: fixed !== undefined, zeroCopyWritable: fixed !== undefined }, encode(view, offset, value) {
    const b = encodeBytes(s, value);
    if (b.length !== (fixed ?? b.length))
      throw new Error("Schema size mismatch");
    new Uint8Array(view.buffer, view.byteOffset + offset, b.length).set(b);
  }, decode(view, offset) {
    return decodeBytes(s, new Uint8Array(view.buffer, view.byteOffset + offset, view.byteLength - offset));
  }, encodeBytes(value) {
    const w = new Writer;
    write(w, value);
    return w.result();
  }, decodeBytes(bytes) {
    const r = new Reader(bytes);
    const value = read(r);
    if (r.offset !== bytes.length && fixed === undefined)
      throw new Error("Trailing schema bytes");
    return value;
  }, _write: write, _read: read, _fixed: fixed, _fields: fields };
  return s;
}
function writeSchema(w, s, v) {
  if (s._write)
    s._write(w, v);
  else
    w.raw(encodeBytes(s, v));
}
function readSchema(r, s) {
  return s._read ? s._read(r) : decodeBytes(s, r.raw(s.size));
}
function encodeBytes(s, v) {
  if (s.encodeBytes)
    return s.encodeBytes(v);
  const w = new Writer;
  s._write(w, v);
  return w.result();
}
function decodeBytes(s, b) {
  if (s.decodeBytes)
    return s.decodeBytes(b);
  return s._read(new Reader(b));
}
var binary = {
  u8: () => make((w, v) => w.u8(v), (r) => r.u8(), 1),
  u16: () => make((w, v) => w.fixed(2, (d) => d.setUint16(0, v, true)), (r) => r.fixed(2, (d) => d.getUint16(0, true)), 2),
  u32: () => make((w, v) => w.fixed(4, (d) => d.setUint32(0, v, true)), (r) => r.fixed(4, (d) => d.getUint32(0, true)), 4),
  i8: () => make((w, v) => w.fixed(1, (d) => d.setInt8(0, v)), (r) => r.fixed(1, (d) => d.getInt8(0)), 1),
  i16: () => make((w, v) => w.fixed(2, (d) => d.setInt16(0, v, true)), (r) => r.fixed(2, (d) => d.getInt16(0, true)), 2),
  i32: () => make((w, v) => w.fixed(4, (d) => d.setInt32(0, v, true)), (r) => r.fixed(4, (d) => d.getInt32(0, true)), 4),
  f32: () => make((w, v) => w.fixed(4, (d) => d.setFloat32(0, v, true)), (r) => r.fixed(4, (d) => d.getFloat32(0, true)), 4),
  f64: () => make((w, v) => w.fixed(8, (d) => d.setFloat64(0, v, true)), (r) => r.fixed(8, (d) => d.getFloat64(0, true)), 8),
  bool: () => make((w, v) => w.u8(v ? 1 : 0), (r) => {
    const v = r.u8();
    if (v > 1)
      throw new Error("Invalid boolean");
    return v === 1;
  }, 1),
  varuint: () => make((w, v) => {
    if (!Number.isSafeInteger(v) || v < 0)
      throw new Error("Invalid varuint");
    do {
      let b = v % 128;
      v = Math.floor(v / 128);
      if (v)
        b |= 128;
      w.u8(b);
    } while (v);
  }, (r) => {
    let n = 0, shift = 0;
    for (let i = 0;i < 10; i++) {
      const b = r.u8();
      n += (b & 127) * 2 ** shift;
      if (!(b & 128)) {
        if (!Number.isSafeInteger(n))
          throw new Error("Invalid varuint");
        return n;
      }
      shift += 7;
    }
    throw new Error("Invalid varuint");
  }),
  string: () => {
    const u = new TextEncoder, t = new TextDecoder;
    return make((w, v) => {
      const b = u.encode(v);
      writeSchema(w, binary.varuint(), b.length);
      w.raw(b);
    }, (r) => t.decode(r.raw(readSchema(r, binary.varuint()))));
  },
  bytes: (length) => make((w, v) => {
    if (v.length !== length)
      throw new Error("Invalid fixed byte length");
    w.raw(v);
  }, (r) => r.raw(length), length),
  fixedArray: (s, length) => make((w, v) => {
    if (v.length !== length)
      throw new Error("Invalid fixed array length");
    for (const x of v)
      writeSchema(w, s, x);
  }, (r) => Array.from({ length }, () => readSchema(r, s)), s.capabilities?.fixedSize && s.size ? s.size * length : undefined),
  array: (s) => make((w, v) => {
    writeSchema(w, binary.varuint(), v.length);
    for (const x of v)
      writeSchema(w, s, x);
  }, (r) => {
    const n = readSchema(r, binary.varuint());
    if (n > 1e6)
      throw new Error("Invalid array count");
    return Array.from({ length: n }, () => readSchema(r, s));
  }),
  optional: (s) => make((w, v) => {
    w.u8(v === undefined ? 0 : 1);
    if (v !== undefined)
      writeSchema(w, s, v);
  }, (r) => r.u8() === 0 ? undefined : readSchema(r, s)),
  struct: (fields) => {
    const entries = Object.entries(fields);
    const fixed = entries.every(([, s]) => s.capabilities?.fixedSize) ? entries.reduce((n, [, s]) => n + s.size, 0) : undefined;
    return make((w, v) => {
      for (const [k, s] of entries)
        writeSchema(w, s, v[k]);
    }, (r) => {
      const o = {};
      for (const [k, s] of entries)
        o[k] = readSchema(r, s);
      return o;
    }, fixed, fields);
  },
  enumU8: (mapping) => {
    const reverse = new Map;
    for (const [k, v] of Object.entries(mapping)) {
      if (!Number.isInteger(v) || v < 0 || v > 255 || reverse.has(v))
        throw new Error("Invalid enum mapping");
      reverse.set(v, k);
    }
    return make((w, v) => {
      const n = mapping[v];
      if (n === undefined)
        throw new Error(`Unknown enum value ${v}`);
      w.u8(n);
    }, (r) => {
      const v = r.u8(), name = reverse.get(v);
      if (name === undefined)
        throw new Error(`Unknown enum ID ${v}`);
      return name;
    }, 1);
  },
  taggedUnion: (options) => make((w, v) => {
    writeSchema(w, options.tag, v.tag);
    const s = options.variants[v.tag];
    if (!s)
      throw new Error(`Unknown union tag ${v.tag}`);
    writeSchema(w, s, v.value);
  }, (r) => {
    const tag = readSchema(r, options.tag);
    const s = options.variants[tag];
    if (!s)
      throw new Error(`Unknown union tag ${tag}`);
    return { tag, value: readSchema(r, s) };
  }),
  lazy: (get) => make((w, v) => writeSchema(w, get(), v), (r) => readSchema(r, get()))
};

class BinarySchemaRegistry {
  entries = new Map;
  sealed = false;
  register(entry) {
    if (this.sealed)
      throw new Error("Binary schema registry is sealed");
    if (!entry.namespace || !Number.isInteger(entry.typeId) || entry.typeId < 0 || entry.typeId > 65535 || !Number.isInteger(entry.version) || entry.version < 1)
      throw new Error("Invalid binary schema identity");
    const key = `${entry.namespace}:${entry.typeId}@${entry.version}`;
    if (this.entries.has(key))
      throw new Error(`Duplicate binary schema identity ${key}`);
    this.entries.set(key, entry);
    return this;
  }
  seal() {
    this.sealed = true;
    return this;
  }
  get(namespace, typeId, version) {
    if (version !== undefined)
      return this.entries.get(`${namespace}:${typeId}@${version}`);
    const matches = [...this.entries.values()].filter((entry) => entry.namespace === namespace && entry.typeId === typeId).sort((a, b) => b.version - a.version);
    return matches[0];
  }
  entriesSorted() {
    return [...this.entries.values()].sort((a, b) => a.namespace.localeCompare(b.namespace) || a.typeId - b.typeId || a.version - b.version);
  }
}
function createBinarySchemaRegistry() {
  return new BinarySchemaRegistry;
}
function encodeWithSchema(schema, value) {
  return encodeBytes(schema, value);
}
function decodeWithSchema(schema, bytes) {
  return decodeBytes(schema, bytes);
}
function createBinaryView(schema, bytes, offset = 0, writable = false) {
  if (!schema.capabilities?.fixedSize || !schema.capabilities.byteLength)
    throw new Error("Schema does not support fixed binary views");
  const base = offset;
  const structSchema = schema;
  const fields = structSchema._fields;
  if (!fields)
    throw new Error("Schema does not expose field views");
  const fieldOffsets = new Map;
  let cursor = 0;
  for (const [name, field] of Object.entries(fields)) {
    if (!field.capabilities?.fixedSize)
      throw new Error("Schema field is not fixed-size");
    fieldOffsets.set(name, cursor);
    cursor += field.size;
  }
  if (base < 0 || base + schema.size > bytes.length)
    throw new Error("Binary view is out of range");
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { schema, byteOffset: base, byteLength: schema.size, get(name) {
    const field = fields[name];
    const at = fieldOffsets.get(name);
    if (!field || at === undefined)
      throw new Error(`Unknown binary field ${name}`);
    return field.decode(data, base + at);
  }, set(name, value) {
    if (!writable)
      throw new Error("Binary view is read-only");
    const field = fields[name];
    const at = fieldOffsets.get(name);
    if (!field || at === undefined)
      throw new Error(`Unknown binary field ${name}`);
    field.encode(data, base + at, value);
  } };
}
function schemaIdentity(entry) {
  return `${entry.namespace}:${entry.typeId}@${entry.version}`;
}

// src/sdk/binary.ts
var ROAST_BINARY_PROTOCOL_VERSION = 1;
var ROAST_BINARY_SCHEMA_VERSION = 1;
var ROAST_PACKED_SCHEMA_VERSION = 2;
var ROAST_BINARY_FRAME_TYPE = 1;
var ROAST_PACKED_FRAME_TYPE = 2;
var MAGIC = 1414745938;
var PACKED_MAGIC = 827019346;
var HEADER_BYTES = 16;
var PACKED_HEADER_BYTES = 44;
var ENTITY_RECORD_BYTES = 20;
var COMPONENT_RECORD_BYTES = 20;
var COMPONENT_TRANSFORM = 1;
var COMPONENT_MOVEMENT = 2;
var COMPONENT_FALLBACK = 65535;
var COMPONENT_MODE_FIXED = 1;
var COMPONENT_MODE_REGISTERED = 2;
var COMPONENT_MODE_FALLBACK = 3;
var COMPONENT_REGISTERED = 65534;
var KNOWN_COMPONENT_NAMES = new Map([[COMPONENT_TRANSFORM, "transform.state"], [COMPONENT_MOVEMENT, "movement.state"]]);
function componentName(typeId, name) {
  return KNOWN_COMPONENT_NAMES.get(typeId) ?? name;
}
var arrayBufferStorage = { allocate(bytes) {
  return bytes.slice();
} };
function createArenaStorage(arena) {
  return { allocate(bytes) {
    const location = arena.alloc(bytes);
    const view = arena.read(location);
    if (!view)
      throw new Error("BumpArena allocation could not be read");
    return view;
  } };
}
var f32 = () => ({ size: 4, encode: (view, offset, value) => view.setFloat32(offset, value, true), decode: (view, offset) => view.getFloat32(offset, true) });
var f64 = () => ({ size: 8, encode: (view, offset, value) => view.setFloat64(offset, value, true), decode: (view, offset) => view.getFloat64(offset, true) });
var u8 = () => ({ size: 1, encode: (view, offset, value) => view.setUint8(offset, value), decode: (view, offset) => view.getUint8(offset) });
var bool = () => ({ size: 1, encode: (view, offset, value) => view.setUint8(offset, value ? 1 : 0), decode: (view, offset) => {
  const result = view.getUint8(offset);
  if (result > 1)
    throw new Error("Invalid boolean value");
  return result !== 0;
} });
function struct(fields) {
  const entries = Object.entries(fields), size = entries.reduce((total, [, schema]) => total + schema.size, 0);
  return { size, encode(view, offset, value) {
    let cursor = offset;
    for (const [key, schema] of entries) {
      schema.encode(view, cursor, value[key]);
      cursor += schema.size;
    }
  }, decode(view, offset) {
    let cursor = offset;
    const result = {};
    for (const [key, schema] of entries) {
      result[key] = schema.decode(view, cursor);
      cursor += schema.size;
    }
    return result;
  } };
}
var transformBinarySchema = struct({ x: f32(), y: f32(), rotation: f32() });
var movementBinarySchema = struct({ velocityX: f32(), velocityY: f32(), angularVelocity: f32(), enabled: bool() });
function encodeSchema(value, schema, storage = arrayBufferStorage) {
  const bytes = new Uint8Array(schema.size);
  schema.encode(new DataView(bytes.buffer), 0, value);
  return storage.allocate(bytes);
}
function decodeSchema(bytes, schema) {
  if (bytes.byteLength < schema.size)
    throw new Error("Binary schema payload is truncated");
  return schema.decode(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), 0);
}
function encodeFrameWithSchema(payload, frameType, schemaVersion) {
  const bytes = new Uint8Array(HEADER_BYTES + payload.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint16(4, ROAST_BINARY_PROTOCOL_VERSION, true);
  view.setUint16(6, schemaVersion, true);
  view.setUint8(8, frameType);
  view.setUint32(10, payload.byteLength, true);
  view.setUint16(14, 0, true);
  bytes.set(payload, HEADER_BYTES);
  return bytes;
}
function encodeFrame(payload, frameType = ROAST_BINARY_FRAME_TYPE) {
  return encodeFrameWithSchema(payload, frameType, ROAST_BINARY_SCHEMA_VERSION);
}
function decodeFrame(bytes) {
  if (bytes.byteLength < HEADER_BYTES)
    throw new Error("Binary frame is truncated");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC)
    throw new Error("Invalid Roast binary magic");
  const protocolVersion = view.getUint16(4, true), schemaVersion = view.getUint16(6, true), frameType = view.getUint8(8), length = view.getUint32(10, true);
  if (protocolVersion !== ROAST_BINARY_PROTOCOL_VERSION)
    throw new Error(`Unsupported Roast binary protocol version ${protocolVersion}`);
  if (schemaVersion !== ROAST_BINARY_SCHEMA_VERSION && schemaVersion !== ROAST_PACKED_SCHEMA_VERSION)
    throw new Error(`Unsupported Roast binary schema version ${schemaVersion}`);
  if (length !== bytes.byteLength - HEADER_BYTES)
    throw new Error("Invalid binary frame payload length");
  return { protocolVersion, schemaVersion, frameType, payload: bytes.subarray(HEADER_BYTES) };
}
function canonicalJson(value) {
  if (Array.isArray(value))
    return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function jsonBytes(value) {
  return new TextEncoder().encode(canonicalJson(value));
}
function encodeSettings(settings) {
  return encodeFrame(jsonBytes(settings));
}
function decodeSettings(bytes) {
  const frame = decodeFrame(bytes);
  if (frame.frameType !== ROAST_BINARY_FRAME_TYPE || frame.schemaVersion !== ROAST_BINARY_SCHEMA_VERSION)
    throw new Error("Not a JSON-backed Roast binary frame");
  try {
    return JSON.parse(new TextDecoder().decode(frame.payload));
  } catch {
    throw new Error("Invalid Roast binary JSON payload");
  }
}
function checkedRange(view, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > view.byteLength)
    throw new Error(`Invalid ${label} range`);
}
function text(value) {
  return new TextEncoder().encode(value);
}
function readText(bytes) {
  return new TextDecoder().decode(bytes);
}
function byteSlice(data, offset, length) {
  checkedRange(data, offset, length, "byte slice");
  return new Uint8Array(data.buffer, data.byteOffset + offset, length);
}
function concat(chunks) {
  const result = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function schemaEncode(schema, value) {
  if (schema.encodeBytes)
    return schema.encodeBytes(value);
  const bytes = new Uint8Array(schema.size);
  schema.encode(new DataView(bytes.buffer), 0, value);
  return bytes;
}
function schemaDecode(schema, bytes) {
  if (schema.decodeBytes)
    return schema.decodeBytes(bytes);
  return schema.decode(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), 0);
}
function identityKey(identity) {
  return `${identity.namespace}:${identity.typeId}@${identity.version}`;
}
function registeredEnvelope(identity, namespaceRef, payload) {
  const out = new Uint8Array(12 + payload.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, namespaceRef, true);
  v.setUint16(4, identity.typeId, true);
  v.setUint16(6, identity.version, true);
  v.setUint32(8, payload.length, true);
  out.set(payload, 12);
  return out;
}
function readRegisteredEnvelope(bytes) {
  if (bytes.length < 12)
    throw new Error("Registered payload is truncated");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), length = v.getUint32(8, true);
  if (length !== bytes.length - 12)
    throw new Error("Invalid registered payload length");
  return { namespaceRef: v.getUint32(0, true), typeId: v.getUint16(4, true), version: v.getUint16(6, true), payload: bytes.subarray(12) };
}
function componentBytes(name, value, options) {
  const identity = options.components?.[name];
  if (identity) {
    if (!options.registry)
      throw new Error(`Registry required for ${name}`);
    const entry = options.registry.get(identity.namespace, identity.typeId, identity.version);
    if (!entry)
      throw new Error(`Missing binary schema ${identity.namespace}:${identity.typeId}@${identity.version}`);
    return { typeId: COMPONENT_REGISTERED, schemaVersion: identity.version, mode: COMPONENT_MODE_REGISTERED, identity, bytes: schemaEncode(entry.schema, value) };
  }
  if (name === "transform.state" && isRecord2(value) && isRecord2(value.position))
    return { typeId: COMPONENT_TRANSFORM, schemaVersion: 1, mode: COMPONENT_MODE_FIXED, bytes: encodeSchema({ x: value.position.x, y: value.position.y, rotation: value.rotation }, transformBinarySchema) };
  if (name === "movement.state" && isRecord2(value) && isRecord2(value.velocity))
    return { typeId: COMPONENT_MOVEMENT, schemaVersion: 1, mode: COMPONENT_MODE_FIXED, bytes: encodeSchema({ velocityX: value.velocity.x, velocityY: value.velocity.y, angularVelocity: value.angularVelocity, enabled: value.enabled }, movementBinarySchema) };
  return { typeId: COMPONENT_FALLBACK, schemaVersion: 1, mode: COMPONENT_MODE_FALLBACK, bytes: jsonBytes(value) };
}
function decodeComponent(name, typeId, mode, bytes, strings, registry) {
  if (mode === COMPONENT_MODE_REGISTERED) {
    if (!registry)
      throw new Error("Missing binary schema registry");
    const envelope = readRegisteredEnvelope(bytes), namespace = strings[envelope.namespaceRef];
    if (!namespace)
      throw new Error("Invalid registered namespace reference");
    const entry = registry.get(namespace, envelope.typeId, envelope.version);
    if (!entry)
      throw new Error(`Missing binary schema ${namespace}:${envelope.typeId}@${envelope.version}`);
    return schemaDecode(entry.schema, envelope.payload);
  }
  if (mode === COMPONENT_MODE_FIXED && typeId === COMPONENT_TRANSFORM && name === "transform.state") {
    const value = decodeSchema(bytes, transformBinarySchema);
    return { schemaVersion: 1, position: { x: value.x, y: value.y }, rotation: value.rotation };
  }
  if (mode === COMPONENT_MODE_FIXED && typeId === COMPONENT_MOVEMENT && name === "movement.state") {
    const value = decodeSchema(bytes, movementBinarySchema);
    return { schemaVersion: 1, velocity: { x: value.velocityX, y: value.velocityY }, angularVelocity: value.angularVelocity, enabled: value.enabled };
  }
  if (mode !== COMPONENT_MODE_FALLBACK)
    throw new Error(`Unsupported packed component ${typeId}`);
  try {
    return JSON.parse(readText(bytes));
  } catch {
    throw new Error("Malformed packed fallback component");
  }
}
function encodePackedSnapshot(settings, storageOrOptions = arrayBufferStorage, maybeOptions) {
  const storage = "allocate" in storageOrOptions ? storageOrOptions : arrayBufferStorage;
  const options = "allocate" in storageOrOptions ? maybeOptions ?? {} : storageOrOptions;
  const root = structuredClone({ ...settings, entities: undefined });
  delete root.entities;
  const sections = [...options.sections ?? []].sort((a, b) => a.key.localeCompare(b.key));
  const claimed = sections.map((section) => section.path);
  for (let i = 0;i < claimed.length; i++)
    for (let j = i + 1;j < claimed.length; j++) {
      const a = claimed[i], b = claimed[j];
      if (a.length === b.length && a.every((v, n) => v === b[n]))
        throw new Error(`Duplicate typed section path ${sections[i].key}`);
      if (a.every((v, n) => v === b[n]))
        throw new Error(`Overlapping typed section paths ${sections[i].key}/${sections[j].key}`);
    }
  for (const section of sections) {
    if (!section.path.length)
      throw new Error("Typed section path cannot be empty");
    let cursor = root;
    for (let i = 0;i < section.path.length - 1; i++) {
      if (!isRecord2(cursor[section.path[i]]))
        throw new Error(`Invalid typed section parent ${section.key}`);
      cursor = cursor[section.path[i]];
    }
    delete cursor[section.path[section.path.length - 1]];
  }
  const sourceEntities = settings.entities.map((entity) => {
    const components = Object.keys(entity).filter((key) => key !== "id" && key !== "capabilities").sort().map((name) => ({ name, ...componentBytes(name, entity[name], options) }));
    return { id: String(entity.id), capabilities: [...entity.capabilities ?? []].map(String).sort(), components };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const strings = [];
  const stringIds = new Map;
  const stringId = (value) => {
    let id = stringIds.get(value);
    if (id === undefined) {
      id = strings.length;
      strings.push(value);
      stringIds.set(value, id);
    }
    return id;
  };
  for (const entity of sourceEntities) {
    stringId(entity.id);
    for (const capability of entity.capabilities)
      if (capability !== "transform.state" && capability !== "movement.state")
        stringId(capability);
    for (const component of entity.components) {
      if (component.mode === COMPONENT_MODE_FALLBACK || component.mode === COMPONENT_MODE_REGISTERED)
        stringId(component.name);
      if (component.identity)
        stringId(component.identity.namespace);
    }
  }
  const sectionValues = [];
  for (const section of sections) {
    if (!options.registry)
      throw new Error("Registry required for typed sections");
    const entry = options.registry.get(section.schema.namespace, section.schema.typeId, section.schema.version);
    if (!entry)
      throw new Error(`Missing binary schema ${section.schema.namespace}:${section.schema.typeId}@${section.schema.version}`);
    sectionValues.push({ section, payload: registeredEnvelope(section.schema, stringId(section.schema.namespace), schemaEncode(entry.schema, section.value)) });
  }
  const componentRecords = [];
  const entityRecords = [];
  const dataChunks = [];
  let dataLength = 0;
  const addData = (bytes) => {
    const offset = dataLength;
    dataChunks.push(bytes);
    dataLength += bytes.byteLength;
    return offset;
  };
  for (const entity of sourceEntities) {
    const capBytes = new Uint8Array(entity.capabilities.length * 4);
    const capView = new DataView(capBytes.buffer);
    entity.capabilities.forEach((capability, index) => {
      const ref = capability === "transform.state" ? (2147483648 | COMPONENT_TRANSFORM) >>> 0 : capability === "movement.state" ? (2147483648 | COMPONENT_MOVEMENT) >>> 0 : stringIds.get(capability);
      if (ref === undefined)
        throw new Error(`Missing capability string ${capability}`);
      capView.setUint32(index * 4, ref >>> 0, true);
    });
    const capOffset = addData(capBytes);
    const componentStart = componentRecords.length;
    for (const component of entity.components)
      componentRecords.push({ nameIndex: component.mode === COMPONENT_MODE_FALLBACK || component.mode === COMPONENT_MODE_REGISTERED ? stringId(component.name) : 0, typeId: component.typeId, schemaVersion: component.schemaVersion, mode: component.mode, bytes: component.identity ? registeredEnvelope(component.identity, stringId(component.identity.namespace), component.bytes) : component.bytes, offset: addData(component.identity ? registeredEnvelope(component.identity, stringId(component.identity.namespace), component.bytes) : component.bytes) });
    entityRecords.push({ idIndex: stringId(entity.id), capabilities: entity.capabilities.map((capability) => capability === "transform.state" ? (2147483648 | COMPONENT_TRANSFORM) >>> 0 : capability === "movement.state" ? (2147483648 | COMPONENT_MOVEMENT) >>> 0 : strings.indexOf(capability)), componentStart, componentCount: entity.components.length, capOffset });
  }
  for (const item of sectionValues) {
    const offset = addData(item.payload);
    (root.__roastTypedSections ??= []).push({ key: item.section.key, path: item.section.path, namespace: item.section.schema.namespace, typeId: item.section.schema.typeId, version: item.section.schema.version, offset, length: item.payload.length });
  }
  const metadata = jsonBytes(root);
  const metadataOffset = addData(metadata);
  const metadataLength = metadata.byteLength;
  const entityTableOffset = PACKED_HEADER_BYTES;
  const componentTableOffset = entityTableOffset + entityRecords.length * ENTITY_RECORD_BYTES;
  const dataOffset = componentTableOffset + componentRecords.length * COMPONENT_RECORD_BYTES;
  const stringOffset = dataOffset + dataLength;
  const stringChunks = [new Uint8Array(4)];
  new DataView(stringChunks[0].buffer).setUint32(0, strings.length, true);
  for (const value of strings) {
    const bytes = text(value), header = new Uint8Array(4);
    new DataView(header.buffer).setUint32(0, bytes.byteLength, true);
    stringChunks.push(header, bytes);
  }
  const stringBytes = concat(stringChunks);
  const payload = new Uint8Array(stringOffset + stringBytes.byteLength);
  const view = new DataView(payload.buffer);
  view.setUint32(0, PACKED_MAGIC, true);
  view.setUint16(4, 1, true);
  view.setUint16(6, 0, true);
  view.setUint32(8, entityRecords.length, true);
  view.setUint32(12, entityTableOffset, true);
  view.setUint32(16, componentTableOffset, true);
  view.setUint32(20, dataOffset, true);
  view.setUint32(24, dataLength, true);
  view.setUint32(28, stringOffset, true);
  view.setUint32(32, stringBytes.byteLength, true);
  view.setUint32(36, dataOffset + metadataOffset, true);
  view.setUint32(40, metadataLength, true);
  for (const chunk of dataChunks)
    payload.set(chunk, dataOffset + dataChunks.slice(0, dataChunks.indexOf(chunk)).reduce((n, item) => n + item.byteLength, 0));
  entityRecords.forEach((entity, index) => {
    const offset = entityTableOffset + index * ENTITY_RECORD_BYTES;
    view.setUint32(offset, entity.idIndex, true);
    view.setUint32(offset + 4, dataOffset + entity.capOffset, true);
    view.setUint16(offset + 8, entity.capabilities.length, true);
    view.setUint32(offset + 10, entity.componentStart, true);
    view.setUint16(offset + 14, entity.componentCount, true);
    view.setUint16(offset + 16, 0, true);
    view.setUint16(offset + 18, 0, true);
  });
  componentRecords.forEach((component, index) => {
    const offset = componentTableOffset + index * COMPONENT_RECORD_BYTES;
    view.setUint32(offset, component.nameIndex, true);
    view.setUint16(offset + 4, component.typeId, true);
    view.setUint16(offset + 6, component.schemaVersion, true);
    view.setUint8(offset + 8, component.mode);
    view.setUint8(offset + 9, 0);
    view.setUint32(offset + 10, dataOffset + component.offset, true);
    view.setUint32(offset + 14, component.bytes.byteLength, true);
    view.setUint32(offset + 18, 0, true);
  });
  payload.set(stringBytes, stringOffset);
  return storage.allocate(encodeFrameWithSchema(payload, ROAST_PACKED_FRAME_TYPE, ROAST_PACKED_SCHEMA_VERSION));
}
function readStrings(view, offset, length) {
  checkedRange(view, offset, length, "string table");
  const end = offset + length;
  if (length < 4)
    throw new Error("Truncated packed string table");
  const count = view.getUint32(offset, true);
  let cursor = offset + 4;
  const result = [];
  for (let i = 0;i < count; i += 1) {
    checkedRange(view, cursor, 4, "string length");
    const size = view.getUint32(cursor, true);
    cursor += 4;
    checkedRange(view, cursor, size, "string");
    result.push(readText(new Uint8Array(view.buffer, view.byteOffset + cursor, size)));
    cursor += size;
  }
  if (cursor !== end)
    throw new Error("Packed string table has trailing bytes");
  return result;
}
function encodePackedSnapshotWithDiagnostics(settings, options = {}) {
  const bytes = encodePackedSnapshot(settings, options);
  const frame = decodeFrame(bytes);
  const payload = frame.payload;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const entityCount = view.getUint32(8, true), entityTableBytes = entityCount * ENTITY_RECORD_BYTES;
  const componentOffset = view.getUint32(16, true), dataOffset = view.getUint32(20, true), dataLength = view.getUint32(24, true), stringOffset = view.getUint32(28, true), stringBytes = view.getUint32(32, true), metadataOffset = view.getUint32(36, true), metadataLength = view.getUint32(40, true);
  const componentRecordBytes = Math.max(0, dataOffset - componentOffset);
  const metadata = JSON.parse(readText(byteSlice(view, metadataOffset, metadataLength)));
  const descriptors = metadata.__roastTypedSections ?? [];
  const descriptorBytes = descriptors.length ? metadataLength - jsonBytes({ ...metadata, __roastTypedSections: undefined }).byteLength : 0;
  const schemaMap = new Map;
  const sectionsDiagnostics = [];
  let registeredComponentBytes = 0, registeredEnvelopeOverheadBytes = 0, fallbackComponentBytes = 0, builtInPackedPayloadBytes = 0, typedSectionPayloadBytes = 0;
  const addSchema = (identity, payloadBytes, envelopeBytes) => {
    const key = identityKey(identity);
    const existing = schemaMap.get(key);
    const entry = options.registry?.get(identity.namespace, identity.typeId, identity.version);
    if (existing) {
      existing.count += 1;
      existing.payloadBytes += payloadBytes;
      existing.recordBytes += envelopeBytes;
    } else
      schemaMap.set(key, { identity: key, name: entry?.name, count: 1, payloadBytes, recordBytes: envelopeBytes });
  };
  const componentCount = view.getUint32(8, true);
  const componentTableStart = componentOffset + componentCount * ENTITY_RECORD_BYTES;
  const totalComponents = componentRecordBytes / COMPONENT_RECORD_BYTES;
  for (let i = 0;i < totalComponents; i++) {
    const at = componentTableStart + i * COMPONENT_RECORD_BYTES;
    const mode = view.getUint8(at + 8), length = view.getUint32(at + 14, true);
    if (mode === COMPONENT_MODE_REGISTERED) {
      const payload2 = byteSlice(view, view.getUint32(at + 10, true), length), envelope = readRegisteredEnvelope(payload2);
      const namespace = readStrings(view, stringOffset, stringBytes)[envelope.namespaceRef];
      if (!namespace)
        throw new Error("Invalid registered namespace reference");
      const identity = { namespace, typeId: envelope.typeId, version: envelope.version };
      addSchema(identity, envelope.payload.length, 12);
      registeredComponentBytes += envelope.payload.length;
      registeredEnvelopeOverheadBytes += 12;
    } else if (mode === COMPONENT_MODE_FALLBACK)
      fallbackComponentBytes += length;
    else
      builtInPackedPayloadBytes += length;
  }
  for (const descriptor of descriptors) {
    const envelope = readRegisteredEnvelope(byteSlice(view, dataOffset + descriptor.offset, descriptor.length));
    const identity = { namespace: descriptor.namespace, typeId: descriptor.typeId, version: descriptor.version };
    const payloadBytes = envelope.payload.length;
    addSchema(identity, payloadBytes, 12);
    typedSectionPayloadBytes += payloadBytes;
    registeredEnvelopeOverheadBytes += 12;
    sectionsDiagnostics.push({ key: descriptor.key, path: descriptor.path, identity: identityKey(identity), payloadBytes, overheadBytes: descriptorBytes });
  }
  const fallbackRootBytes = jsonBytes({ ...metadata, __roastTypedSections: undefined }).byteLength;
  const fallbackJsonBytes = fallbackRootBytes + fallbackComponentBytes;
  builtInPackedPayloadBytes = Math.max(0, dataLength - registeredComponentBytes - typedSectionPayloadBytes - registeredEnvelopeOverheadBytes - fallbackJsonBytes);
  const attributed = HEADER_BYTES + PACKED_HEADER_BYTES + entityTableBytes + componentRecordBytes + stringBytes + builtInPackedPayloadBytes + registeredComponentBytes + typedSectionPayloadBytes + registeredEnvelopeOverheadBytes + fallbackJsonBytes;
  const residualBytes = Math.max(0, bytes.byteLength - attributed);
  const accountedFallbackBytes = fallbackJsonBytes + residualBytes;
  const metadataRegionBytes = metadataLength;
  const dataRegionBytes = dataLength - metadataLength;
  const physical = { outerFrameHeaderBytes: HEADER_BYTES, packedHeaderBytes: PACKED_HEADER_BYTES, entityTableBytes, componentTableBytes: componentRecordBytes, stringTableBytes: stringBytes, metadataRegionBytes, dataRegionBytes, unattributedBytes: 0 };
  const diagnostics = { frameBytes: bytes.byteLength, outerFrameHeaderBytes: HEADER_BYTES, outerHeaderBytes: HEADER_BYTES, packedHeaderBytes: PACKED_HEADER_BYTES, entityTableBytes, componentRecordBytes, stringTableBytes: stringBytes, tableBytes: stringBytes, metadataRegionBytes, dataRegionBytes, typedSectionDescriptorBytes: descriptorBytes, builtInBytes: builtInPackedPayloadBytes, builtInPackedPayloadBytes, registeredComponentBytes, registeredComponentPayloadBytes: registeredComponentBytes, typedSectionBytes: typedSectionPayloadBytes, typedSectionPayloadBytes, fallbackBytes: accountedFallbackBytes, fallbackJsonBytes, fallbackPercentage: bytes.byteLength ? accountedFallbackBytes / bytes.byteLength * 100 : 0, fallbackCount: settings.entities.reduce((n, entity) => n + Object.keys(entity).filter((key) => key !== "id" && key !== "capabilities" && !options.components?.[key] && key !== "transform.state" && key !== "movement.state").length, 0), namespaceTableBytes: stringBytes, registeredEnvelopeOverheadBytes, unattributedBytes: 0, physical, logical: { fallbackJsonBytes, builtInPackedPayloadBytes, registeredComponentPayloadBytes: registeredComponentBytes, typedSectionPayloadBytes, registeredEnvelopeOverheadBytes, typedSectionDescriptorBytes: descriptorBytes }, schemas: [...schemaMap.values()], sections: sectionsDiagnostics };
  return { bytes, diagnostics };
}
function decodePackedSnapshot(bytes, options = {}) {
  const frame = decodeFrame(bytes);
  if (frame.frameType !== ROAST_PACKED_FRAME_TYPE || frame.schemaVersion !== ROAST_PACKED_SCHEMA_VERSION)
    throw new Error("Not a packed Roast snapshot");
  const view = new PackedSnapshotView(frame.payload, options.registry);
  return { settings: view.toSettings(), view };
}

class PackedSnapshotView {
  bytes;
  data;
  strings;
  entityOffset;
  componentOffset;
  entityCount;
  registry;
  dataOffset;
  metadataOffset;
  metadataLength;
  constructor(payload, registry) {
    this.registry = registry;
    this.bytes = payload;
    this.data = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    if (payload.byteLength < PACKED_HEADER_BYTES || this.data.getUint32(0, true) !== PACKED_MAGIC || this.data.getUint16(4, true) !== 1)
      throw new Error("Invalid packed Roast payload");
    this.entityCount = this.data.getUint32(8, true);
    this.entityOffset = this.data.getUint32(12, true);
    this.componentOffset = this.data.getUint32(16, true);
    const dataOffset = this.data.getUint32(20, true), dataLength = this.data.getUint32(24, true), stringOffset = this.data.getUint32(28, true), stringLength = this.data.getUint32(32, true), metadataOffset = this.data.getUint32(36, true), metadataLength = this.data.getUint32(40, true);
    checkedRange(this.data, metadataOffset, metadataLength, "packed metadata");
    checkedRange(this.data, this.entityOffset, this.entityCount * ENTITY_RECORD_BYTES, "entity table");
    checkedRange(this.data, this.componentOffset, Math.max(0, stringOffset - this.componentOffset), "component table");
    checkedRange(this.data, dataOffset, dataLength, "packed data");
    this.dataOffset = dataOffset;
    this.metadataOffset = metadataOffset;
    this.metadataLength = metadataLength;
    this.strings = readStrings(this.data, stringOffset, stringLength);
  }
  getEntity(id) {
    for (let i = 0;i < this.entityCount; i += 1) {
      const offset = this.entityOffset + i * ENTITY_RECORD_BYTES;
      if (this.strings[this.data.getUint32(offset, true)] === id)
        return new PackedEntityView(this.data, this.strings, offset, this.componentOffset, this.registry);
    }
    return;
  }
  getEntities() {
    const result = [];
    for (let i = 0;i < this.entityCount; i += 1)
      result.push(new PackedEntityView(this.data, this.strings, this.entityOffset + i * ENTITY_RECORD_BYTES, this.componentOffset, this.registry));
    return result;
  }
  getTypedSection(key) {
    const metadata = this.metadataObject();
    const descriptor = metadata.__roastTypedSections?.find((section) => section.key === key);
    if (!descriptor)
      return;
    if (!this.registry)
      throw new Error("Missing binary schema registry");
    const entry = this.registry.get(descriptor.namespace, descriptor.typeId, descriptor.version);
    if (!entry)
      throw new Error(`Missing binary schema ${descriptor.namespace}:${descriptor.typeId}@${descriptor.version}`);
    const start = this.dataOffset + descriptor.offset + 12;
    checkedRange(this.data, start, descriptor.length - 12, "typed section payload");
    if (!entry.schema.capabilities?.fixedSize)
      throw new Error("Typed section schema does not support fixed views");
    return createBinaryView(entry.schema, this.bytes, start, false);
  }
  metadataObject() {
    checkedRange(this.data, this.metadataOffset, this.metadataLength, "packed metadata");
    return JSON.parse(readText(byteSlice(this.data, this.metadataOffset, this.metadataLength)));
  }
  toSettings() {
    const metadata = this.metadataObject();
    const sections = metadata.__roastTypedSections;
    delete metadata.__roastTypedSections;
    for (const descriptor of sections ?? []) {
      if (!this.registry)
        throw new Error("Missing binary schema registry");
      const entry = this.registry.get(descriptor.namespace, descriptor.typeId, descriptor.version);
      if (!entry)
        throw new Error(`Missing binary schema ${descriptor.namespace}:${descriptor.typeId}@${descriptor.version}`);
      const start = this.dataOffset + descriptor.offset + 12;
      checkedRange(this.data, start, descriptor.length - 12, "typed section payload");
      const value = schemaDecode(entry.schema, byteSlice(this.data, start, descriptor.length - 12));
      let cursor = metadata;
      for (let i = 0;i < descriptor.path.length - 1; i++) {
        if (cursor[descriptor.path[i]] !== undefined && !isRecord2(cursor[descriptor.path[i]]))
          throw new Error("Invalid typed section reconstruction parent");
        cursor = cursor[descriptor.path[i]] ?? (cursor[descriptor.path[i]] = {});
      }
      cursor[descriptor.path[descriptor.path.length - 1]] = value;
    }
    return { ...metadata, entities: this.getEntities().map((entity) => entity.toSettings()) };
  }
}

class PackedEntityView {
  data;
  bytes;
  strings;
  offset;
  componentBase;
  registry;
  constructor(data, strings, offset, componentBase, registry) {
    this.data = data;
    this.bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.strings = strings;
    this.offset = offset;
    this.componentBase = componentBase;
    this.registry = registry;
  }
  get id() {
    return this.strings[this.data.getUint32(this.offset, true)];
  }
  get capabilities() {
    const start = this.data.getUint32(this.offset + 10, true), count = this.data.getUint16(this.offset + 14, true);
    const names = [];
    for (let i = 0;i < count; i += 1) {
      const record = this.componentBase + (start + i) * COMPONENT_RECORD_BYTES;
      names.push(componentName(this.data.getUint16(record + 4, true), this.strings[this.data.getUint32(record, true)] ?? ""));
    }
    return names.sort();
  }
  getComponent(name) {
    const start = this.data.getUint32(this.offset + 10, true), count = this.data.getUint16(this.offset + 14, true);
    for (let i = 0;i < count; i += 1) {
      const record = this.componentBase + (start + i) * COMPONENT_RECORD_BYTES;
      if (componentName(this.data.getUint16(record + 4, true), this.strings[this.data.getUint32(record, true)] ?? "") !== name)
        continue;
      const typeId = this.data.getUint16(record + 4, true), payload = this.data.getUint32(record + 10, true), length = this.data.getUint32(record + 14, true);
      checkedRange(this.data, payload, length, "component payload");
      if (typeId === COMPONENT_TRANSFORM)
        return new PackedTransformView(this.data, payload, false);
      if (typeId === COMPONENT_MOVEMENT)
        return new PackedMovementView(this.data, payload, false);
    }
    return;
  }
  getRegisteredComponent(name, writable = false) {
    const start = this.data.getUint32(this.offset + 10, true), count = this.data.getUint16(this.offset + 14, true);
    for (let i = 0;i < count; i++) {
      const record = this.componentBase + (start + i) * COMPONENT_RECORD_BYTES;
      const typeId = this.data.getUint16(record + 4, true), mode = this.data.getUint8(record + 8), componentNameValue = this.strings[this.data.getUint32(record, true)] ?? "";
      if (mode !== COMPONENT_MODE_REGISTERED || componentNameValue !== name)
        continue;
      const payload = this.data.getUint32(record + 10, true), length = this.data.getUint32(record + 14, true);
      const envelope = readRegisteredEnvelope(byteSlice(this.data, payload, length));
      if (!this.registry)
        throw new Error("Missing binary schema registry");
      const namespace = this.strings[envelope.namespaceRef];
      if (!namespace)
        throw new Error("Invalid registered namespace reference");
      const entry = this.registry.get(namespace, envelope.typeId, envelope.version);
      if (!entry)
        throw new Error(`Missing binary schema ${namespace}:${envelope.typeId}@${envelope.version}`);
      return createBinaryView(entry.schema, this.bytes, payload + 12, writable);
    }
    return;
  }
  componentRanges() {
    const start = this.data.getUint32(this.offset + 10, true), count = this.data.getUint16(this.offset + 14, true);
    return Array.from({ length: count }, (_, i) => {
      const record = this.componentBase + (start + i) * COMPONENT_RECORD_BYTES;
      return { offset: this.data.getUint32(record + 10, true), length: this.data.getUint32(record + 14, true) };
    });
  }
  toSettings() {
    const result = { id: this.id, capabilities: this.capabilities };
    const start = this.data.getUint32(this.offset + 10, true), count = this.data.getUint16(this.offset + 14, true);
    for (let i = 0;i < count; i += 1) {
      const record = this.componentBase + (start + i) * COMPONENT_RECORD_BYTES;
      const typeId = this.data.getUint16(record + 4, true), name = componentName(typeId, this.strings[this.data.getUint32(record, true)] ?? ""), mode = this.data.getUint8(record + 8), payload = this.data.getUint32(record + 10, true), length = this.data.getUint32(record + 14, true);
      checkedRange(this.data, payload, length, "component payload");
      result[name] = decodeComponent(name, typeId, mode, byteSlice(this.data, payload, length), this.strings, this.registry);
    }
    return result;
  }
}

class PackedTransformView {
  data;
  offset;
  readOnly;
  constructor(data, offset, readOnly = true) {
    this.data = data;
    this.offset = offset;
    this.readOnly = readOnly;
  }
  set(offset, value) {
    if (this.readOnly)
      throw new Error("Packed view is read-only");
    this.data.setFloat32(this.offset + offset, value, true);
  }
  get x() {
    return this.data.getFloat32(this.offset, true);
  }
  set x(value) {
    this.set(0, value);
  }
  get y() {
    return this.data.getFloat32(this.offset + 4, true);
  }
  set y(value) {
    this.set(4, value);
  }
  get rotation() {
    return this.data.getFloat32(this.offset + 8, true);
  }
  set rotation(value) {
    this.set(8, value);
  }
  toSettings() {
    return { schemaVersion: 1, position: { x: this.x, y: this.y }, rotation: this.rotation };
  }
}

class PackedMovementView {
  data;
  offset;
  readOnly;
  constructor(data, offset, readOnly = true) {
    this.data = data;
    this.offset = offset;
    this.readOnly = readOnly;
  }
  get velocityX() {
    return this.data.getFloat32(this.offset, true);
  }
  get velocityY() {
    return this.data.getFloat32(this.offset + 4, true);
  }
  get angularVelocity() {
    return this.data.getFloat32(this.offset + 8, true);
  }
  get enabled() {
    return this.data.getUint8(this.offset + 12) !== 0;
  }
  toSettings() {
    return { schemaVersion: 1, velocity: { x: this.velocityX, y: this.velocityY }, angularVelocity: this.angularVelocity, enabled: this.enabled };
  }
}

class BinaryBackedTransform {
  bytes;
  view;
  constructor(value, storage = arrayBufferStorage) {
    this.bytes = encodeSchema({ x: value.position.x, y: value.position.y, rotation: value.rotation }, transformBinarySchema, storage);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
  }
  get x() {
    return this.view.getFloat32(0, true);
  }
  set x(value) {
    this.view.setFloat32(0, value, true);
  }
  get y() {
    return this.view.getFloat32(4, true);
  }
  set y(value) {
    this.view.setFloat32(4, value, true);
  }
  get rotation() {
    return this.view.getFloat32(8, true);
  }
  set rotation(value) {
    this.view.setFloat32(8, value, true);
  }
  toSettings() {
    return { schemaVersion: 1, position: { x: this.x, y: this.y }, rotation: this.rotation };
  }
  toBinary() {
    return this.bytes;
  }
}
function binaryBackedTransform(value, storage) {
  return new BinaryBackedTransform(value, storage);
}
function binarySnapshot(settings, storage = arrayBufferStorage) {
  return storage.allocate(encodeSettings(settings));
}
function restoreBinarySnapshot(bytes, options = {}) {
  const frame = decodeFrame(bytes);
  if (frame.frameType === ROAST_PACKED_FRAME_TYPE)
    return decodePackedSnapshot(bytes, options).settings;
  return decodeSettings(bytes);
}
function packedSnapshot(settings, storage = arrayBufferStorage, options) {
  return encodePackedSnapshot(settings, storage, options);
}

// src/sdk/runtime.ts
class RuntimeEntity {
  id;
  capabilities;
  components;
  constructor(value) {
    if (!isRecord3(value) || typeof value.id !== "string" || !Array.isArray(value.capabilities)) {
      throw new Error("Runtime entities require an id and capabilities");
    }
    this.id = value.id;
    this.capabilities = [...value.capabilities].filter((capability) => typeof capability === "string").sort();
    this.components = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "id" && key !== "capabilities").map(([key, component]) => [key, cloneJson(component)]));
  }
  hasCapability(capability) {
    return this.capabilities.includes(capability);
  }
  getComponent(capability) {
    return this.components[capability];
  }
  toSettings() {
    const settings = { id: this.id, capabilities: [...this.capabilities], ...this.components };
    assertJsonValue(settings);
    return cloneJson(settings);
  }
}

class EngineRuntime {
  entities;
  order;
  executors;
  metadata;
  constructor(settings, registry) {
    if (!settings.framework)
      throw new Error("A runtime requires a selected framework");
    registry.validate(settings.framework);
    this.entities = settings.entities.map((entity) => new RuntimeEntity(entity)).sort((a, b) => a.id.localeCompare(b.id));
    const { entities: _entities, ...metadata } = settings;
    this.metadata = structuredClone(metadata);
    this.order = [...settings.framework.systemOrder];
    this.executors = this.order.map((id) => registry.getExecutor(id)).filter((executor) => Boolean(executor));
  }
  tick(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new Error("deltaSeconds must be finite and non-negative");
    const entities = this.entities;
    const context = {
      deltaSeconds,
      entities,
      query: (required) => entities.filter((entity) => required.every((capability) => entity.hasCapability(capability)))
    };
    for (const executor of this.executors)
      executor(context);
  }
  toSettings() {
    const entities = this.entities.map((entity) => entity.toSettings());
    const settings = { ...this.metadata, entities };
    assertJsonValue(settings);
    return cloneJson(settings);
  }
  snapshot() {
    return this.toSettings();
  }
  snapshotBinary(storageOrOptions) {
    const options = storageOrOptions && "allocate" in storageOrOptions ? { format: "json", storage: storageOrOptions } : storageOrOptions ?? {};
    return options.format === "packed" ? packedSnapshot(this.toSettings(), options.storage, options) : binarySnapshot(this.toSettings(), options.storage);
  }
  static restore(settings, registry) {
    return new EngineRuntime(settings, registry);
  }
  static restoreBinary(bytes, registry, binaryOptions) {
    return new EngineRuntime(restoreBinarySnapshot(bytes, binaryOptions), registry);
  }
  getEntity(id) {
    return this.entities.find((entity) => entity.id === id);
  }
  getEntities() {
    return this.entities;
  }
}
function cloneJson(value) {
  if (Array.isArray(value))
    return value.map((item) => cloneJson(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, cloneJson(item)]));
  }
  return value;
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/sdk/worldBuilder.ts
class EngineWorldBuilder {
  id;
  worldSize;
  entities = [];
  structures = [];
  effects = [];
  counters = [];
  background;
  framework;
  constructor(id, worldSize) {
    this.id = id;
    this.worldSize = worldSize;
    if (!id || !isPositiveVector(worldSize))
      throw new Error("A world requires an ID and positive finite worldSize");
  }
  setBackground(background) {
    assertJsonValue(background);
    this.background = clone2(background);
    return this;
  }
  addEntity(entity) {
    assertJsonValue(entity);
    this.entities.push(clone2(entity));
    return this;
  }
  addStructure(structure) {
    assertJsonValue(structure);
    this.structures.push(clone2(structure));
    return this;
  }
  addEffect(effect) {
    assertJsonValue(effect);
    this.effects.push(clone2(effect));
    return this;
  }
  addCounter(counter) {
    this.counters.push(...canonicalizeCounterStates([counter]));
    return this;
  }
  useFramework(framework) {
    this.framework = clone2(framework);
    return this;
  }
  build() {
    return { schemaVersion: 1, id: this.id, worldSize: clone2(this.worldSize), ...this.background === undefined ? {} : { background: clone2(this.background) }, entities: clone2(this.entities), structures: clone2(this.structures), effects: clone2(this.effects), counters: canonicalizeCounterStates(this.counters), ...this.framework ? { framework: clone2(this.framework) } : {} };
  }
  buildRuntime(registry) {
    if (!this.framework)
      throw new Error("A runtime requires a selected framework");
    return new EngineRuntime(this.build(), registry);
  }
  buildJson(space = 2) {
    return JSON.stringify(this.build(), null, space);
  }
}
function isPositiveVector(value) {
  return Number.isFinite(value.x) && value.x > 0 && Number.isFinite(value.y) && value.y > 0;
}
function clone2(value) {
  return structuredClone(value);
}

// src/sdk/effectRegistry.ts
class EngineEffectRegistry {
  definitions = new Map;
  register(definition) {
    validateDefinition2(definition);
    if (this.definitions.has(definition.id))
      throw new Error(`Duplicate effect definition '${definition.id}'`);
    this.definitions.set(definition.id, { ...definition, ...definition.requiresCapability ? { requiresCapability: [...definition.requiresCapability] } : {} });
    return this;
  }
  get(id) {
    return this.definitions.get(id);
  }
  validate(effect) {
    if (!effect || typeof effect !== "object" || Array.isArray(effect))
      throw new Error("Malformed effect settings");
    const value = effect;
    if (typeof value.type !== "string" || !this.definitions.has(value.type))
      throw new Error(`Unknown effect '${String(value.type)}'`);
    if (value.schemaVersion !== undefined && value.schemaVersion !== 1)
      throw new Error(`Unsupported effect schema version for '${value.type}'`);
    assertJsonValue(value.typeValue);
    this.definitions.get(value.type).validatePayload?.(value.typeValue);
    if (value.target !== undefined)
      assertJsonValue(value.target);
    if (value.target !== undefined)
      this.definitions.get(value.type).validateTarget?.(value.target);
  }
  describe() {
    return [...this.definitions.values()].sort((a, b) => a.id.localeCompare(b.id)).map((definition) => ({
      id: definition.id,
      schemaVersion: definition.schemaVersion ?? 1,
      ...definition.requiresCapability ? { requiresCapability: [...definition.requiresCapability] } : {},
      ...definition.targetType ? { targetType: definition.targetType } : {},
      ...definition.lifecycleCategory ? { lifecycleCategory: definition.lifecycleCategory } : {}
    }));
  }
}
function validateDefinition2(definition) {
  if (!definition || typeof definition.id !== "string" || !/^[a-z0-9.-]{1,80}$/.test(definition.id))
    throw new Error("Invalid effect definition ID");
  if (definition.schemaVersion !== undefined && definition.schemaVersion !== 1)
    throw new Error("Unsupported effect definition version");
  for (const value of [definition.targetType, definition.lifecycleCategory])
    if (value !== undefined && (typeof value !== "string" || value.length === 0))
      throw new Error(`Invalid effect definition '${definition.id}'`);
  if (definition.requiresCapability !== undefined && (!Array.isArray(definition.requiresCapability) || definition.requiresCapability.some((value) => typeof value !== "string" || value.length === 0)))
    throw new Error(`Invalid effect capabilities for '${definition.id}'`);
  if (definition.validatePayload !== undefined && typeof definition.validatePayload !== "function")
    throw new Error(`Invalid effect validator for '${definition.id}'`);
  if (definition.validateTarget !== undefined && typeof definition.validateTarget !== "function")
    throw new Error(`Invalid effect target validator for '${definition.id}'`);
}

// src/sdk/entityState.ts
function createTransformState(input) {
  const state = { schemaVersion: 1, position: { ...input.position }, rotation: input.rotation ?? 0 };
  validateTransformState(state);
  return structuredClone(state);
}
function createMovementState(input) {
  const state = { schemaVersion: 1, velocity: { ...input.velocity }, angularVelocity: input.angularVelocity ?? 0, enabled: input.enabled ?? true };
  validateMovementState(state);
  return structuredClone(state);
}
function validateTransformState(value) {
  const state = record(value, "Transform state");
  exactKeys(state, ["schemaVersion", "position", "rotation"], "Transform state");
  if (state.schemaVersion !== 1)
    throw new Error("Unsupported Transform state schema version");
  validateVector(state.position, "Transform position");
  finite(state.rotation, "Transform rotation");
}
function validateMovementState(value) {
  const state = record(value, "Movement state");
  exactKeys(state, ["schemaVersion", "velocity", "angularVelocity", "enabled"], "Movement state");
  if (state.schemaVersion !== 1)
    throw new Error("Unsupported Movement state schema version");
  validateVector(state.velocity, "Movement velocity");
  finite(state.angularVelocity, "Movement angularVelocity");
  if (typeof state.enabled !== "boolean")
    throw new Error("Movement enabled must be boolean");
}
function validateVector(value, label) {
  const vector = record(value, label);
  exactKeys(vector, ["x", "y"], label);
  finite(vector.x, `${label} x`);
  finite(vector.y, `${label} y`);
}
function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function exactKeys(value, keys, label) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value))
    if (!allowed.has(key))
      throw new Error(`${label} contains unknown field '${key}'`);
  for (const key of keys)
    if (!(key in value))
      throw new Error(`${label} is missing '${key}'`);
}
function finite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${label} must be finite`);
}
// src/sdk/movementCapability.ts
var MOVEMENT_CAPABILITY = "movement.state";
var MOVEMENT_EFFECT_ID = "movement.integrate";
var MOVEMENT_SET_VELOCITY_EFFECT_ID = "movement.set-velocity";
var MOVEMENT_ADD_VELOCITY_EFFECT_ID = "movement.add-velocity";
var MOVEMENT_SCALE_SPEED_EFFECT_ID = "movement.scale-speed";
var MOVEMENT_APPLY_FORCE_FIELD_EFFECT_ID = "movement.apply-force-field";
var MOVEMENT_APPLY_FORCE_TO_ENTITY_EFFECT_ID = "movement.apply-force-to-entity";
var MOVEMENT_COMMAND_EFFECT_IDS = [MOVEMENT_SET_VELOCITY_EFFECT_ID, MOVEMENT_ADD_VELOCITY_EFFECT_ID, MOVEMENT_SCALE_SPEED_EFFECT_ID, MOVEMENT_APPLY_FORCE_FIELD_EFFECT_ID, MOVEMENT_APPLY_FORCE_TO_ENTITY_EFFECT_ID];
function movementSystemDefinition() {
  return { id: "core.movement", provides: [MOVEMENT_CAPABILITY], requiresCapabilities: ["transform.state", "movement.state"], acceptsEffects: [...MOVEMENT_COMMAND_EFFECT_IDS], before: ["core.playback"] };
}
function registerMovementSystem(registry) {
  return registry.register(movementSystemDefinition());
}
function registerMovementEffect(registry) {
  return registry.register({
    id: MOVEMENT_EFFECT_ID,
    requiresCapability: [MOVEMENT_CAPABILITY],
    targetType: "entity",
    lifecycleCategory: "modifier",
    validatePayload: (payload) => {
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw new Error("Movement payload must be an object");
      const value = payload;
      if (Object.keys(value).some((key) => !["deltaTime", "x", "y"].includes(key)) || Object.keys(value).length !== 3)
        throw new Error("Movement payload contains unexpected fields");
      for (const key of ["deltaTime", "x", "y"])
        if (typeof value[key] !== "number" || !Number.isFinite(value[key]))
          throw new Error(`Movement ${key} must be finite`);
    }
  });
}
function registerMovementCommands(registry) {
  return registry.register({
    id: MOVEMENT_SET_VELOCITY_EFFECT_ID,
    requiresCapability: [MOVEMENT_CAPABILITY],
    targetType: "entity",
    lifecycleCategory: "command",
    validatePayload: (payload) => validateVectorPayload(payload, "Movement velocity")
  }).register({
    id: MOVEMENT_ADD_VELOCITY_EFFECT_ID,
    requiresCapability: [MOVEMENT_CAPABILITY],
    targetType: "entity",
    lifecycleCategory: "command",
    validatePayload: (payload) => validateVectorPayload(payload, "Movement velocity delta")
  }).register({
    id: MOVEMENT_SCALE_SPEED_EFFECT_ID,
    requiresCapability: [MOVEMENT_CAPABILITY],
    targetType: "entity",
    lifecycleCategory: "command",
    validatePayload: (payload) => {
      const value = record2(payload, "Movement speed scale payload");
      exactKeys2(value, ["factor"], "Movement speed scale payload");
      if (typeof value.factor !== "number" || !Number.isFinite(value.factor) || value.factor < 0)
        throw new Error("Movement speed scale factor must be finite and non-negative");
    }
  }).register({
    id: MOVEMENT_APPLY_FORCE_FIELD_EFFECT_ID,
    requiresCapability: [MOVEMENT_CAPABILITY],
    targetType: "position",
    lifecycleCategory: "command",
    validatePayload: (payload) => {
      const value = record2(payload, "Movement force field payload");
      exactKeys2(value, ["mode", "force", "range"], "Movement force field payload");
      if (value.mode !== "attract" && value.mode !== "repel")
        throw new Error("Movement force field mode must be attract or repel");
      if (typeof value.force !== "number" || !Number.isFinite(value.force) || value.force < 0)
        throw new Error("Movement force field force must be finite and non-negative");
      if (typeof value.range !== "number" || !Number.isFinite(value.range) || value.range <= 0)
        throw new Error("Movement force field range must be finite and positive");
    }
  }).register({
    id: MOVEMENT_APPLY_FORCE_TO_ENTITY_EFFECT_ID,
    requiresCapability: [MOVEMENT_CAPABILITY],
    targetType: "entity",
    lifecycleCategory: "command",
    validatePayload: (payload) => {
      const value = record2(payload, "Movement entity force payload");
      exactKeys2(value, ["origin", "mode", "force", "range"], "Movement entity force payload");
      const origin = record2(value.origin, "Movement entity force origin");
      exactKeys2(origin, ["x", "y"], "Movement entity force origin");
      if (typeof origin.x !== "number" || !Number.isFinite(origin.x) || typeof origin.y !== "number" || !Number.isFinite(origin.y))
        throw new Error("Movement entity force origin must be finite");
      if (value.mode !== "attract" && value.mode !== "repel")
        throw new Error("Movement entity force mode must be attract or repel");
      if (typeof value.force !== "number" || !Number.isFinite(value.force) || value.force < 0)
        throw new Error("Movement entity force must be finite and non-negative");
      if (typeof value.range !== "number" || !Number.isFinite(value.range) || value.range <= 0)
        throw new Error("Movement entity force range must be finite and positive");
    }
  });
}
function validateVectorPayload(payload, label) {
  const value = record2(payload, `${label} payload`);
  exactKeys2(value, ["x", "y"], `${label} payload`);
  for (const key of ["x", "y"])
    if (typeof value[key] !== "number" || !Number.isFinite(value[key]))
      throw new Error(`${label} ${key} must be finite`);
}
function record2(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function exactKeys2(value, keys, label) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value))
    if (!allowed.has(key))
      throw new Error(`${label} contains unexpected fields`);
  for (const key of keys)
    if (!(key in value))
      throw new Error(`${label} is missing '${key}'`);
}
// src/sdk/movementForceField.ts
function calculateRadialVelocityDelta(origin, target, field) {
  validateVector2(origin, "Movement force origin");
  validateVector2(target, "Movement force target");
  if (field.mode !== "attract" && field.mode !== "repel")
    throw new Error("Movement force mode must be attract or repel");
  if (!Number.isFinite(field.force) || field.force < 0)
    throw new Error("Movement force must be finite and non-negative");
  if (!Number.isFinite(field.range) || field.range <= 0)
    throw new Error("Movement force range must be finite and positive");
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0 || distance > field.range)
    return { x: 0, y: 0 };
  const direction = field.mode === "attract" ? 1 : -1;
  return {
    x: normalizeZero(dx / distance * field.force * direction),
    y: normalizeZero(dy / distance * field.force * direction)
  };
}
function applyRadialVelocityDelta(velocity, origin, target, field) {
  validateVector2(velocity, "Movement velocity");
  const delta = calculateRadialVelocityDelta(origin, target, field);
  return { x: velocity.x + delta.x, y: velocity.y + delta.y };
}
function validateVector2(value, label) {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y))
    throw new Error(`${label} must be finite`);
}
function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}
// src/sdk/transformCapability.ts
var TRANSFORM_CAPABILITY = "transform.state";
var TRANSFORM_SET_POSITION_EFFECT_ID = "transform.set-position";
var TRANSFORM_SET_ROTATION_EFFECT_ID = "transform.set-rotation";
var TRANSFORM_SWAP_POSITION_EFFECT_ID = "transform.swap-position";
function registerTransformEffects(registry) {
  return registry.register({
    id: TRANSFORM_SET_POSITION_EFFECT_ID,
    requiresCapability: [TRANSFORM_CAPABILITY],
    targetType: "entity-or-structure",
    lifecycleCategory: "command",
    validatePayload: (payload) => validateVectorPayload2(payload, "Transform position"),
    validateTarget: (target) => validateTransformTarget(target, true)
  }).register({
    id: TRANSFORM_SET_ROTATION_EFFECT_ID,
    requiresCapability: [TRANSFORM_CAPABILITY],
    targetType: "entity",
    lifecycleCategory: "command",
    validatePayload: (payload) => {
      const value = record3(payload, "Transform rotation payload");
      exactKeys3(value, ["rotation"], "Transform rotation payload");
      finite2(value.rotation, "Transform rotation");
    },
    validateTarget: (target) => validateTransformTarget(target, false)
  }).register({
    id: TRANSFORM_SWAP_POSITION_EFFECT_ID,
    requiresCapability: [TRANSFORM_CAPABILITY],
    targetType: "entity",
    lifecycleCategory: "command",
    validatePayload: (payload) => {
      const value = record3(payload, "Transform swap position payload");
      exactKeys3(value, ["otherEntityId"], "Transform swap position payload");
      if (typeof value.otherEntityId !== "string" || value.otherEntityId.length === 0)
        throw new Error("Transform swap position requires a non-empty otherEntityId");
    },
    validateTarget: (target) => validateTransformTarget(target, false)
  });
}
function validateTransformTarget(value, allowStructure = true) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Transform target must be an object");
  const target = value;
  if (target.type === "entity") {
    exactKeys3(target, ["type", "entityId"], "Transform entity target");
    if (typeof target.entityId !== "string" || target.entityId.length === 0)
      throw new Error("Transform target requires a non-empty entityId");
    return;
  }
  if (allowStructure && target.type === "structure") {
    exactKeys3(target, ["type", "structureId"], "Transform structure target");
    if (typeof target.structureId !== "string" || target.structureId.length === 0)
      throw new Error("Transform target requires a non-empty structureId");
    return;
  }
  throw new Error("Transform target type is unsupported");
}
function validateVectorPayload2(payload, label) {
  const value = record3(payload, `${label} payload`);
  exactKeys3(value, ["x", "y"], `${label} payload`);
  finite2(value.x, `${label} x`);
  finite2(value.y, `${label} y`);
}
function record3(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function exactKeys3(value, keys, label) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value))
    if (!allowed.has(key))
      throw new Error(`${label} contains unexpected fields`);
  for (const key of keys)
    if (!(key in value))
      throw new Error(`${label} is missing '${key}'`);
}
function finite2(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${label} must be finite`);
}
// src/sdk/trigger.ts
class EngineTriggerActivationQueue {
  maxActivations;
  pending = [];
  processed = 0;
  constructor(maxActivations = 1024) {
    this.maxActivations = maxActivations;
    if (!Number.isSafeInteger(maxActivations) || maxActivations < 1)
      throw new Error("Trigger activation budget must be a positive safe integer");
  }
  enqueue(activation) {
    validateTriggerActivation(activation);
    this.enqueueValidated(activation);
  }
  enqueueValidated(activation) {
    if (this.pending.length + this.processed >= this.maxActivations)
      throw new Error("Trigger activation budget exceeded");
    this.pending.push(activation);
  }
  process(dispatch) {
    if (typeof dispatch !== "function")
      throw new Error("Trigger dispatcher must be a function");
    let processedNow = 0;
    while (this.pending.length > 0) {
      const activation = this.pending.shift();
      this.processed++;
      processedNow++;
      dispatch(structuredClone(activation));
    }
    return processedNow;
  }
  pendingCount() {
    return this.pending.length;
  }
}
function createTickTriggerEvent(input) {
  const event = { schemaVersion: 1, type: "tick", sourceId: input.sourceId, sequence: input.sequence, payload: { dt: input.dt } };
  validateTriggerEvent(event);
  return structuredClone(event);
}
function createCollisionEnterTriggerEvent(input) {
  const event = {
    schemaVersion: 1,
    type: "collision.enter",
    sourceId: input.sourceId,
    sequence: input.sequence,
    payload: { entityId: input.entityId, otherId: input.otherId, contactKey: input.contactKey }
  };
  validateTriggerEvent(event);
  return structuredClone(event);
}
function createTriggerActivation(input) {
  const activation = { schemaVersion: 1, effectId: input.effectId, event: structuredClone(input.event) };
  validateTriggerActivation(activation);
  return structuredClone(activation);
}
function createRoundStartTriggerEvent(input) {
  const event = {
    schemaVersion: 1,
    type: "round.start",
    sourceId: input.sourceId,
    sequence: input.sequence,
    payload: { turnNumber: input.turnNumber, activeTeam: input.activeTeam, phase: input.phase }
  };
  validateTriggerEvent(event);
  return structuredClone(event);
}
function createEnvironmentActivationTriggerEvent(input) {
  const event = {
    schemaVersion: 1,
    type: "environment.activation",
    sourceId: input.sourceId,
    sequence: input.sequence,
    payload: { mechanicId: input.mechanicId, mechanicIndex: input.mechanicIndex, tick: input.tick, active: input.active }
  };
  validateTriggerEvent(event);
  return structuredClone(event);
}
function createScheduleDueTriggerEvent(input) {
  const event = { schemaVersion: 1, type: "schedule.due", sourceId: input.sourceId, sequence: input.sequence, payload: { scheduleId: input.scheduleId, clock: input.clock, value: input.value } };
  validateTriggerEvent(event);
  return structuredClone(event);
}
function validateTriggerActivation(value) {
  const activation = record4(value, "Trigger activation");
  exactKeys4(activation, ["schemaVersion", "effectId", "event"], "Trigger activation");
  if (activation.schemaVersion !== 1)
    throw new Error("Unsupported Trigger activation schema version");
  string(activation.effectId, "Trigger activation effectId");
  validateTriggerEvent(activation.event);
}
function validateTriggerEvent(value) {
  const event = record4(value, "Trigger event");
  exactKeys4(event, ["schemaVersion", "type", "sourceId", "sequence", "payload"], "Trigger event");
  if (event.schemaVersion !== 1)
    throw new Error("Unsupported Trigger event schema version");
  string(event.sourceId, "Trigger event sourceId");
  safeSequence(event.sequence, "Trigger event sequence");
  if (event.type === "tick") {
    const payload = record4(event.payload, "Tick trigger payload");
    exactKeys4(payload, ["dt"], "Tick trigger payload");
    finiteNonNegative(payload.dt, "Tick trigger dt");
    return;
  }
  if (event.type === "collision.enter") {
    const payload = record4(event.payload, "Collision trigger payload");
    exactKeys4(payload, ["entityId", "otherId", "contactKey"], "Collision trigger payload");
    string(payload.entityId, "Collision trigger entityId");
    string(payload.otherId, "Collision trigger otherId");
    string(payload.contactKey, "Collision trigger contactKey");
    return;
  }
  if (event.type === "round.start") {
    const payload = record4(event.payload, "Round trigger payload");
    exactKeys4(payload, ["turnNumber", "activeTeam", "phase"], "Round trigger payload");
    safeSequence(payload.turnNumber, "Round trigger turnNumber");
    safeSequence(payload.activeTeam, "Round trigger activeTeam");
    string(payload.phase, "Round trigger phase");
    return;
  }
  if (event.type === "environment.activation") {
    const payload = record4(event.payload, "Environment activation payload");
    exactKeys4(payload, ["mechanicId", "mechanicIndex", "tick", "active"], "Environment activation payload");
    string(payload.mechanicId, "Environment activation mechanicId");
    safeSequence(payload.mechanicIndex, "Environment activation mechanicIndex");
    safeSequence(payload.tick, "Environment activation tick");
    if (typeof payload.active !== "boolean")
      throw new Error("Environment activation active must be boolean");
    return;
  }
  if (event.type === "schedule.due") {
    const payload = record4(event.payload, "Schedule due payload");
    exactKeys4(payload, ["scheduleId", "clock", "value"], "Schedule due payload");
    string(payload.scheduleId, "Schedule due scheduleId");
    if (payload.clock !== "tick" && payload.clock !== "turn")
      throw new Error("Schedule due clock must be tick or turn");
    safeSequence(payload.value, "Schedule due value");
    return;
  }
  throw new Error(`Unknown Trigger event type '${String(event.type)}'`);
}
function record4(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function exactKeys4(value, keys, label) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value))
    if (!allowed.has(key))
      throw new Error(`${label} contains unknown field '${key}'`);
  for (const key of keys)
    if (!(key in value))
      throw new Error(`${label} is missing '${key}'`);
}
function string(value, label) {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${label} must be a non-empty string`);
}
function safeSequence(value, label) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${label} must be a non-negative safe integer`);
}
function finiteNonNegative(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(`${label} must be a finite non-negative number`);
}

// src/sdk/counterCapability.ts
var COUNTER_CAPABILITY = "counter.state";
var COUNTER_SET_EFFECT_ID = "counter.set";
var COUNTER_ADD_EFFECT_ID = "counter.add";
var COUNTER_RESET_EFFECT_ID = "counter.reset";
var COUNTER_EFFECT_IDS = [COUNTER_SET_EFFECT_ID, COUNTER_ADD_EFFECT_ID, COUNTER_RESET_EFFECT_ID];
function counterSystemDefinition() {
  return { id: "core.counter", provides: [COUNTER_CAPABILITY], acceptsEffects: [...COUNTER_EFFECT_IDS] };
}
function registerCounterSystem(registry) {
  return registry.register(counterSystemDefinition());
}
function registerCounterCommands(registry) {
  return registry.register({ id: COUNTER_SET_EFFECT_ID, requiresCapability: [COUNTER_CAPABILITY], targetType: "counter", lifecycleCategory: "command", validatePayload: (payload) => validateNumericPayload(payload, "Counter set", "value"), validateTarget: validateCounterTargetValue }).register({ id: COUNTER_ADD_EFFECT_ID, requiresCapability: [COUNTER_CAPABILITY], targetType: "counter", lifecycleCategory: "command", validatePayload: (payload) => validateNumericPayload(payload, "Counter add", "amount"), validateTarget: validateCounterTargetValue }).register({ id: COUNTER_RESET_EFFECT_ID, requiresCapability: [COUNTER_CAPABILITY], targetType: "counter", lifecycleCategory: "command", validatePayload: (payload) => exactKeys5(record5(payload, "Counter reset payload"), [], "Counter reset payload"), validateTarget: validateCounterTargetValue });
}
function validateCounterEffectSettings(value) {
  const effect = record5(value, "Counter effect");
  exactKeys5(effect, ["schemaVersion", "type", "target", "typeValue"], "Counter effect");
  if (effect.schemaVersion !== COUNTER_SCHEMA_VERSION)
    throw new Error("Unsupported counter effect schema version");
  validateCounterTargetValue(effect.target);
  if (effect.type === COUNTER_SET_EFFECT_ID)
    validateNumericPayload(effect.typeValue, "Counter set", "value");
  else if (effect.type === COUNTER_ADD_EFFECT_ID)
    validateNumericPayload(effect.typeValue, "Counter add", "amount");
  else if (effect.type === COUNTER_RESET_EFFECT_ID)
    exactKeys5(record5(effect.typeValue, "Counter reset payload"), [], "Counter reset payload");
  else
    throw new Error(`Unknown counter effect '${String(effect.type)}'`);
}
function validateCounterTarget(target) {
  validateCounterTargetValue(target);
}
function validateCounterTriggerBinding(value) {
  const binding = record5(value, "Counter trigger binding");
  if (typeof binding.trigger !== "string" || !["tick", "collision.enter", "round.start", "environment.activation", "schedule.due"].includes(binding.trigger))
    throw new Error("Counter trigger binding has an unknown trigger");
  validateCounterEffectSettings(binding.effect);
}
function counterTriggerMatches(binding, event) {
  validateCounterTriggerBinding(binding);
  validateTriggerEvent(event);
  return binding.trigger === event.type;
}
function validateCounterTargetValue(target) {
  const value = record5(target, "Counter target");
  exactKeys5(value, ["type", "counterId"], "Counter target");
  if (value.type !== "counter")
    throw new Error("Counter target type must be 'counter'");
  if (typeof value.counterId !== "string" || value.counterId.length === 0)
    throw new Error("Counter target requires a non-empty counterId");
}
function validateNumericPayload(payload, label, key) {
  const value = record5(payload, `${label} payload`);
  exactKeys5(value, [key], `${label} payload`);
  if (typeof value[key] !== "number" || !Number.isFinite(value[key]))
    throw new Error(`${label} ${key} must be finite`);
}
function record5(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function exactKeys5(value, keys, label) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value))
    if (!allowed.has(key))
      throw new Error(`${label} contains unexpected fields`);
  for (const key of keys)
    if (!(key in value))
      throw new Error(`${label} is missing '${key}'`);
}
// src/sdk/participationCapability.ts
var PARTICIPATION_CAPABILITY = "participation.state";
var PARTICIPATION_SET_PHYSICS_EFFECT_ID = "participation.set-physics";
var PARTICIPATION_SET_DRAWING_EFFECT_ID = "participation.set-drawing";
var PARTICIPATION_EFFECT_IDS = [PARTICIPATION_SET_PHYSICS_EFFECT_ID, PARTICIPATION_SET_DRAWING_EFFECT_ID];
function participationSystemDefinition() {
  return { id: "core.participation", provides: [PARTICIPATION_CAPABILITY], acceptsEffects: [...PARTICIPATION_EFFECT_IDS] };
}
function registerParticipationSystem(registry) {
  return registry.register(participationSystemDefinition());
}
function registerParticipationCommands(registry) {
  return registry.register({ id: PARTICIPATION_SET_PHYSICS_EFFECT_ID, requiresCapability: [PARTICIPATION_CAPABILITY], targetType: "entity-or-structure", lifecycleCategory: "command", validatePayload: validateParticipationPayload }).register({ id: PARTICIPATION_SET_DRAWING_EFFECT_ID, requiresCapability: [PARTICIPATION_CAPABILITY], targetType: "entity-or-structure", lifecycleCategory: "command", validatePayload: validateParticipationPayload });
}
function validateParticipationPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("Participation payload must be an object");
  const value = payload;
  if (Object.keys(value).length !== 1 || typeof value.enabled !== "boolean")
    throw new Error("Participation payload requires only boolean enabled");
}
// src/sdk/numericCapability.ts
var NUMERIC_CAPABILITY = "numeric.state";
var NUMERIC_SET_EFFECT_ID = "numeric.set";
var NUMERIC_ADD_EFFECT_ID = "numeric.add";
var NUMERIC_RESET_EFFECT_ID = "numeric.reset";
var NUMERIC_EFFECT_IDS = [NUMERIC_SET_EFFECT_ID, NUMERIC_ADD_EFFECT_ID, NUMERIC_RESET_EFFECT_ID];
function numericSystemDefinition() {
  return { id: "core.numeric", provides: [NUMERIC_CAPABILITY], acceptsEffects: [...NUMERIC_EFFECT_IDS] };
}
function registerNumericSystem(registry) {
  return registry.register(numericSystemDefinition());
}
function registerNumericCommands(registry) {
  return registry.register({ id: NUMERIC_SET_EFFECT_ID, requiresCapability: [NUMERIC_CAPABILITY], targetType: "numeric", lifecycleCategory: "command", validatePayload: (payload) => validateNumericPayload2(payload, "Numeric set", "value"), validateTarget: validateNumericTarget }).register({ id: NUMERIC_ADD_EFFECT_ID, requiresCapability: [NUMERIC_CAPABILITY], targetType: "numeric", lifecycleCategory: "command", validatePayload: (payload) => validateNumericPayload2(payload, "Numeric add", "amount"), validateTarget: validateNumericTarget }).register({ id: NUMERIC_RESET_EFFECT_ID, requiresCapability: [NUMERIC_CAPABILITY], targetType: "numeric", lifecycleCategory: "command", validatePayload: (payload) => {
    exactKeys6(record6(payload, "Numeric reset payload"), [], "Numeric reset payload");
  }, validateTarget: validateNumericTarget });
}
function validateNumericTarget(value) {
  const target = record6(value, "Numeric target");
  exactKeys6(target, ["type", "entityId", "stateId"], "Numeric target");
  if (target.type !== "numeric")
    throw new Error("Numeric target type must be 'numeric'");
  if (typeof target.entityId !== "string" || target.entityId.length === 0)
    throw new Error("Numeric target requires a non-empty entityId");
  if (typeof target.stateId !== "string" || target.stateId.length === 0)
    throw new Error("Numeric target requires a non-empty stateId");
}
function validateNumericEffectSettings(value) {
  const effect = record6(value, "Numeric effect");
  exactKeys6(effect, ["schemaVersion", "type", "target", "typeValue"], "Numeric effect");
  if (effect.schemaVersion !== 1)
    throw new Error("Unsupported numeric effect schema version");
  validateNumericTarget(effect.target);
  if (effect.type === NUMERIC_SET_EFFECT_ID)
    validateNumericPayload2(effect.typeValue, "Numeric set", "value");
  else if (effect.type === NUMERIC_ADD_EFFECT_ID)
    validateNumericPayload2(effect.typeValue, "Numeric add", "amount");
  else if (effect.type === NUMERIC_RESET_EFFECT_ID)
    exactKeys6(record6(effect.typeValue, "Numeric reset payload"), [], "Numeric reset payload");
  else
    throw new Error(`Unknown numeric effect '${String(effect.type)}'`);
}
function validateNumericPayload2(payload, label, key) {
  const value = record6(payload, `${label} payload`);
  exactKeys6(value, [key], `${label} payload`);
  if (typeof value[key] !== "number" || !Number.isFinite(value[key]))
    throw new Error(`${label} ${key} must be finite`);
}
function record6(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function exactKeys6(value, keys, label) {
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error(`${label} contains unexpected fields`);
}
// src/sdk/composition.ts
var ENGINE_EFFECT_COMPOSITION_SCHEMA_VERSION = 1;
var ENGINE_EFFECT_COMPOSITION_TYPE = "effect.composition";
function createEngineEffectComposition(effects) {
  const composition = { schemaVersion: 1, type: ENGINE_EFFECT_COMPOSITION_TYPE, effects: structuredClone([...effects]) };
  validateEngineEffectComposition(composition);
  return composition;
}
function validateEngineEffectComposition(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed Engine effect composition");
  const composition = value;
  if (Object.keys(composition).some((key) => !["schemaVersion", "type", "effects"].includes(key)) || Object.keys(composition).length !== 3)
    throw new Error("Malformed Engine effect composition");
  if (composition.schemaVersion !== 1 || composition.type !== ENGINE_EFFECT_COMPOSITION_TYPE || !Array.isArray(composition.effects))
    throw new Error("Unsupported Engine effect composition");
  composition.effects.forEach((effect) => {
    assertJsonValue(effect);
    if (!effect || typeof effect !== "object" || Array.isArray(effect) || typeof effect.type !== "string")
      throw new Error("Composition children must be Engine effects");
  });
}
// src/sdk/collisionCommand.ts
var COLLISION_COMMAND_SCHEMA_VERSION = 1;
var COLLISION_COMMAND_TYPE = "collision.command";
function createCollisionCommandBinding(effect) {
  const binding = { schemaVersion: 1, type: COLLISION_COMMAND_TYPE, effect: structuredClone(effect) };
  validateCollisionCommandBinding(binding);
  return binding;
}
function validateCollisionCommandBinding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed collision command binding");
  const binding = value;
  if (Object.keys(binding).some((key) => !["schemaVersion", "type", "effect"].includes(key)) || Object.keys(binding).length !== 3)
    throw new Error("Malformed collision command binding");
  if (binding.schemaVersion !== 1 || binding.type !== COLLISION_COMMAND_TYPE)
    throw new Error("Unsupported collision command binding");
  validateRelativeEffect(binding.effect);
}
function isCollisionCommandBinding(value) {
  try {
    validateCollisionCommandBinding(value);
    return true;
  } catch {
    return false;
  }
}
function validateRelativeEffect(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Collision command effect must be an object");
  const effect = value;
  if (effect.type === "effect.composition") {
    validateEngineEffectComposition(effect);
    for (const child of effect.effects)
      validateRelativeEffect(child);
    return;
  }
  if (typeof effect.type !== "string" || effect.type.length === 0 || effect.schemaVersion !== 1 || !("typeValue" in effect) || "target" in effect)
    throw new Error("Collision command must be a target-relative Engine effect");
  assertJsonValue(effect.typeValue);
}
// src/contracts/numericState.ts
var NUMERIC_STATE_SCHEMA_VERSION = 1;
var NUMERIC_THRESHOLD_COMPARATORS = ["below", "below-or-equal", "above", "above-or-equal"];
function validateNumericThresholdBindings(value) {
  if (!Array.isArray(value))
    throw new Error("Numeric threshold bindings must be an array");
  const bindings = value.map((binding) => {
    validateNumericThresholdBinding(binding);
    return structuredClone(binding);
  });
  if (new Set(bindings.map((binding) => binding.id)).size !== bindings.length)
    throw new Error("Numeric threshold IDs must be unique");
}
function validateNumericThresholdBinding(value) {
  const binding = record7(value, "Numeric threshold binding");
  knownKeys(binding, ["schemaVersion", "id", "resetValue", "thresholds"], "Numeric threshold binding");
  if (binding.schemaVersion !== NUMERIC_STATE_SCHEMA_VERSION)
    throw new Error("Unsupported numeric threshold schema version");
  identifier(binding.id, "Numeric threshold ID");
  if (binding.resetValue !== undefined && (typeof binding.resetValue !== "number" || !Number.isFinite(binding.resetValue)))
    throw new Error("Numeric resetValue must be finite");
  if (!Array.isArray(binding.thresholds))
    throw new Error("Numeric threshold binding requires thresholds");
  binding.thresholds.forEach(validateNumericThreshold);
}
function validateNumericThreshold(value) {
  const threshold = record7(value, "Numeric threshold");
  exactKeys7(threshold, ["schemaVersion", "comparator", "value", "effects"], "Numeric threshold");
  if (threshold.schemaVersion !== NUMERIC_STATE_SCHEMA_VERSION)
    throw new Error("Unsupported numeric threshold schema version");
  if (!NUMERIC_THRESHOLD_COMPARATORS.includes(threshold.comparator))
    throw new Error("Unknown numeric threshold comparator");
  if (typeof threshold.value !== "number" || !Number.isFinite(threshold.value))
    throw new Error("Numeric threshold value must be finite");
  if (!Array.isArray(threshold.effects) || threshold.effects.length === 0)
    throw new Error("Numeric threshold requires at least one follow-up effect");
  threshold.effects.forEach(validateRelativeEffect2);
}
function validateRelativeEffect2(value) {
  const effect = record7(value, "Numeric threshold effect");
  if (Object.keys(effect).some((key) => !["schemaVersion", "type", "typeValue"].includes(key)) || Object.keys(effect).length !== 3)
    throw new Error("Numeric threshold effects cannot declare their own target");
  if (effect.schemaVersion !== undefined && effect.schemaVersion !== 1)
    throw new Error("Unsupported numeric threshold effect schema version");
  if (typeof effect.type !== "string" || effect.type.length === 0)
    throw new Error("Numeric threshold effect requires a type");
  assertJsonValue(effect.typeValue);
}
function identifier(value, label) {
  if (typeof value !== "string" || !/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(value))
    throw new Error(`${label} must be a stable identifier`);
}
function record7(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function exactKeys7(value, keys, label) {
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error(`${label} contains unexpected fields`);
}
function knownKeys(value, keys, label) {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error(`${label} contains unexpected fields`);
}
// src/sdk/assetReferences.ts
function collectAssetReferences(settings) {
  const references = new Set;
  const add = (value) => {
    if (typeof value === "string" && value.length > 0 || typeof value === "number" && Number.isFinite(value))
      references.add(value);
  };
  const record8 = (value) => typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
  const root = record8(settings);
  if (!root)
    return [];
  const background = record8(root.background);
  if (background?.type === "image")
    add(background.url);
  if (Array.isArray(root.players))
    for (const player of root.players) {
      const value = record8(player);
      add(value?.playericon);
      add(value?.hoop);
    }
  const visitUiNode = (value) => {
    const node = record8(value);
    if (!node)
      return;
    if (node.kind === "image")
      add(node.source);
    if (Array.isArray(node.elements))
      for (const child of node.elements)
        visitUiNode(child);
  };
  if (Array.isArray(root.screens))
    for (const screen of root.screens) {
      const value = record8(screen);
      if (Array.isArray(value?.elements))
        for (const child of value.elements)
          visitUiNode(child);
    }
  return [...references];
}
// src/contracts/lifetime.ts
var LIFETIME_DURATION_UNITS = ["turns", "ticks"];
function createLifetime(input) {
  const lifetime = {
    durationUnit: input.durationUnit,
    duration: input.duration,
    remaining: input.remaining ?? input.duration
  };
  validateLifetime(lifetime);
  return lifetime;
}
function advanceLifetime(lifetime) {
  validateLifetime(lifetime);
  if (lifetime.remaining <= 1)
    return;
  return { ...lifetime, remaining: lifetime.remaining - 1 };
}
function validateLifetime(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Lifetime must be an object");
  const lifetime = value;
  if (!LIFETIME_DURATION_UNITS.includes(lifetime.durationUnit))
    throw new Error("Lifetime duration unit is invalid");
  if (!Number.isSafeInteger(lifetime.duration) || lifetime.duration < 1)
    throw new Error("Lifetime duration must be a positive integer");
  if (!Number.isSafeInteger(lifetime.remaining) || lifetime.remaining < 1 || lifetime.remaining > lifetime.duration)
    throw new Error("Lifetime remaining duration is invalid");
}

// src/contracts/temporalModifier.ts
var TEMPORAL_MODIFIER_SCHEMA_VERSION = 1;
var TEMPORAL_DURATION_UNITS = ["turns"];
function createTemporalModifierTemplate(input) {
  const template = structuredClone(input);
  if (template.durationUnit !== "turns")
    throw new Error("Temporal modifier requires turns duration");
  if (!Number.isSafeInteger(template.duration) || template.duration < 1)
    throw new Error("Temporal modifier duration must be a positive integer");
  if (!template.effect || typeof template.effect !== "object" || Array.isArray(template.effect))
    throw new Error("Temporal modifier requires an Engine effect");
  assertJsonValue(template.effect);
  if (template.effect.schemaVersion !== 1 || typeof template.effect.type !== "string")
    throw new Error("Temporal modifier Engine effect is invalid");
  return template;
}
function createTemporalModifier(input) {
  const modifier = {
    schemaVersion: TEMPORAL_MODIFIER_SCHEMA_VERSION,
    id: input.id,
    target: { ...input.target },
    effect: structuredClone(input.effect),
    ...createLifetime({ durationUnit: input.durationUnit, duration: input.duration, remaining: input.remaining }),
    ...input.sourceId === undefined ? {} : { sourceId: input.sourceId },
    ...input.sourceOrder === undefined ? {} : { sourceOrder: input.sourceOrder }
  };
  validateTemporalModifier(modifier);
  return modifier;
}
function advanceTemporalModifier(modifier) {
  validateTemporalModifier(modifier);
  const next = advanceLifetime(lifetimeOf(modifier));
  return next ? { ...structuredClone(modifier), ...next } : undefined;
}
function validateTemporalModifier(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Temporal modifier must be an object");
  const modifier = value;
  if (modifier.schemaVersion !== TEMPORAL_MODIFIER_SCHEMA_VERSION)
    throw new Error("Unsupported temporal modifier schema version");
  if (typeof modifier.id !== "string" || modifier.id.length === 0)
    throw new Error("Temporal modifier requires a stable id");
  if (modifier.sourceId !== undefined && (typeof modifier.sourceId !== "string" || modifier.sourceId.length === 0))
    throw new Error("Temporal modifier sourceId must be non-empty");
  if (modifier.sourceOrder !== undefined && !Number.isSafeInteger(modifier.sourceOrder))
    throw new Error("Temporal modifier sourceOrder must be a safe integer");
  if (!modifier.target || modifier.target.type !== "entity" || typeof modifier.target.entityId !== "string" || modifier.target.entityId.length === 0)
    throw new Error("Temporal modifier requires a stable entity target");
  if (modifier.durationUnit !== "turns")
    throw new Error("Temporal modifier requires turns duration");
  validateLifetime({ durationUnit: modifier.durationUnit, duration: modifier.duration, remaining: modifier.remaining });
  if (!modifier.effect || typeof modifier.effect !== "object" || Array.isArray(modifier.effect))
    throw new Error("Temporal modifier requires an Engine effect");
  assertJsonValue(modifier.effect);
  if (modifier.effect.schemaVersion !== 1 || typeof modifier.effect.type !== "string")
    throw new Error("Temporal modifier Engine effect is invalid");
  const effectKeys = Object.keys(modifier.effect);
  if (effectKeys.some((key) => !["schemaVersion", "type", "typeValue", "target"].includes(key)))
    throw new Error("Temporal modifier Engine effect contains unexpected fields");
}
function lifetimeOf(value) {
  return { durationUnit: value.durationUnit, duration: value.duration, remaining: value.remaining };
}
// src/contracts/structureLifecycle.ts
var STRUCTURE_LIFECYCLE_SCHEMA_VERSION = 1;
var STRUCTURE_LIFECYCLE_DURATION_UNITS = ["turns"];
function createStructureLifecycleTemplate(input) {
  const template = structuredClone(input);
  validateStructureLifecycleTemplate(template);
  return template;
}
function createStructureLifecycle(input) {
  const lifecycle = {
    schemaVersion: STRUCTURE_LIFECYCLE_SCHEMA_VERSION,
    id: input.id,
    structureId: input.structureId,
    ...createLifetime({ durationUnit: input.durationUnit, duration: input.duration, remaining: input.remaining }),
    ...input.sourceId === undefined ? {} : { sourceId: input.sourceId },
    ...input.sourceOrder === undefined ? {} : { sourceOrder: input.sourceOrder },
    ...input.targetId === undefined ? {} : { targetId: input.targetId }
  };
  validateStructureLifecycle(lifecycle);
  return lifecycle;
}
function advanceStructureLifecycle(lifecycle) {
  validateStructureLifecycle(lifecycle);
  const next = advanceLifetime(lifetimeOf2(lifecycle));
  return next ? { ...structuredClone(lifecycle), ...next } : undefined;
}
function validateStructureLifecycleTemplate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Structure lifecycle template must be an object");
  const template = value;
  if (template.durationUnit !== "turns")
    throw new Error("Structure lifecycle requires turns duration");
  validateLifetime({ durationUnit: template.durationUnit, duration: template.duration, remaining: template.duration });
  if (!template.structure || typeof template.structure !== "object" || Array.isArray(template.structure))
    throw new Error("Structure lifecycle requires structure geometry");
  const structure = template.structure;
  if (structure.type !== "rectangle")
    throw new Error("Structure lifecycle currently requires rectangle geometry");
  if (typeof structure.w !== "number" || !Number.isFinite(structure.w) || structure.w <= 0)
    throw new Error("Structure lifecycle width must be positive");
  if (typeof structure.h !== "number" || !Number.isFinite(structure.h) || structure.h <= 0)
    throw new Error("Structure lifecycle height must be positive");
  if (structure.color !== undefined && typeof structure.color !== "string")
    throw new Error("Structure lifecycle color must be a string");
  if (structure.role !== undefined && !["solid", "containment", "both"].includes(structure.role))
    throw new Error("Structure lifecycle role is invalid");
  assertJsonValue(structure);
}
function validateStructureLifecycle(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Structure lifecycle must be an object");
  const lifecycle = value;
  if (lifecycle.schemaVersion !== STRUCTURE_LIFECYCLE_SCHEMA_VERSION)
    throw new Error("Unsupported structure lifecycle schema version");
  if (typeof lifecycle.id !== "string" || lifecycle.id.length === 0)
    throw new Error("Structure lifecycle requires a stable id");
  if (typeof lifecycle.structureId !== "string" || lifecycle.structureId.length === 0)
    throw new Error("Structure lifecycle requires a stable structure id");
  if (lifecycle.sourceId !== undefined && (typeof lifecycle.sourceId !== "string" || lifecycle.sourceId.length === 0))
    throw new Error("Structure lifecycle sourceId must be non-empty");
  if (lifecycle.sourceOrder !== undefined && !Number.isSafeInteger(lifecycle.sourceOrder))
    throw new Error("Structure lifecycle sourceOrder must be a safe integer");
  if (lifecycle.targetId !== undefined && (typeof lifecycle.targetId !== "string" || lifecycle.targetId.length === 0))
    throw new Error("Structure lifecycle targetId must be non-empty");
  if (lifecycle.durationUnit !== "turns")
    throw new Error("Structure lifecycle requires turns duration");
  validateLifetime({ durationUnit: lifecycle.durationUnit, duration: lifecycle.duration, remaining: lifecycle.remaining });
}
function lifetimeOf2(value) {
  return { durationUnit: value.durationUnit, duration: value.duration, remaining: value.remaining };
}
// src/contracts/deferredEffect.ts
var DEFERRED_EFFECT_SCHEMA_VERSION = 1;
var DEFERRED_EFFECT_DURATION_UNITS = ["ticks"];
function createDeferredEffectTemplate(input) {
  const template = structuredClone(input);
  validateDeferredEffectTemplate(template);
  return template;
}
function createDeferredEffect(input) {
  const deferred = {
    schemaVersion: DEFERRED_EFFECT_SCHEMA_VERSION,
    id: input.id,
    ...createLifetime({ durationUnit: input.durationUnit, duration: input.duration, remaining: input.remaining }),
    effect: structuredClone(input.effect),
    ...input.sourceId === undefined ? {} : { sourceId: input.sourceId },
    ...input.sourceOrder === undefined ? {} : { sourceOrder: input.sourceOrder },
    ...input.ownerId === undefined ? {} : { ownerId: input.ownerId }
  };
  validateDeferredEffect(deferred);
  return deferred;
}
function advanceDeferredEffect(effect) {
  validateDeferredEffect(effect);
  const next = advanceLifetime(lifetimeOf3(effect));
  return next ? { ...structuredClone(effect), ...next } : undefined;
}
function validateDeferredEffectTemplate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Deferred effect template must be an object");
  const template = value;
  if (template.durationUnit !== "ticks")
    throw new Error("Deferred effect requires ticks duration");
  validateLifetime({ durationUnit: template.durationUnit, duration: template.duration, remaining: template.duration });
  validateEngineEffect(template.effect);
}
function validateDeferredEffect(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Deferred effect must be an object");
  const effect = value;
  if (effect.schemaVersion !== DEFERRED_EFFECT_SCHEMA_VERSION)
    throw new Error("Unsupported deferred effect schema version");
  if (typeof effect.id !== "string" || effect.id.length === 0)
    throw new Error("Deferred effect requires a stable id");
  if (effect.sourceId !== undefined && (typeof effect.sourceId !== "string" || effect.sourceId.length === 0))
    throw new Error("Deferred effect sourceId must be non-empty");
  if (effect.sourceOrder !== undefined && !Number.isSafeInteger(effect.sourceOrder))
    throw new Error("Deferred effect sourceOrder must be a safe integer");
  if (effect.ownerId !== undefined && (typeof effect.ownerId !== "string" || effect.ownerId.length === 0))
    throw new Error("Deferred effect ownerId must be non-empty");
  if (effect.durationUnit !== "ticks")
    throw new Error("Deferred effect requires ticks duration");
  validateLifetime({ durationUnit: effect.durationUnit, duration: effect.duration, remaining: effect.duration });
  validateLifetime({ durationUnit: effect.durationUnit, duration: effect.duration, remaining: effect.remaining });
  validateEngineEffect(effect.effect);
}
function validateEngineEffect(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Deferred effect requires an Engine effect");
  const effect = value;
  if (effect.schemaVersion !== 1 || typeof effect.type !== "string" || effect.type.length === 0)
    throw new Error("Deferred Engine effect is invalid");
  assertJsonValue(effect.typeValue);
  if (effect.target !== undefined)
    assertJsonValue(effect.target);
}
function lifetimeOf3(value) {
  return { durationUnit: value.durationUnit, duration: value.duration, remaining: value.remaining };
}
// src/random.ts
class SeededRandom {
  state;
  constructor(seed) {
    if (!Number.isSafeInteger(seed))
      throw new RangeError("Seed must be a safe integer");
    this.state = seed >>> 0;
  }
  next() {
    this.state = this.state + 1831565813 >>> 0;
    let value = this.state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  }
  nextInt(maxExclusive) {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("Maximum must be a positive safe integer");
    }
    return Math.floor(this.next() * maxExclusive);
  }
  getState() {
    return this.state;
  }
  static fromState(state) {
    if (!Number.isSafeInteger(state) || state < 0 || state > 4294967295) {
      throw new RangeError("Random state must be an unsigned 32-bit integer");
    }
    const random = new SeededRandom(0);
    random.state = state;
    return random;
  }
}

// src/contracts/actionModifier.ts
var ACTION_MODIFIER_SCHEMA_VERSION = 1;
function createActionModifierTemplate(input) {
  const template = structuredClone(input);
  if (template.action === "force" && template.operation === "scale")
    validateFactor(template.factor);
  else if (template.action === "aim" && template.operation === "random-offset") {
    validateVariance(template.maxVarianceDegrees);
    validateRandomState(template.randomState);
  } else
    throw new Error("Unsupported action modifier operation");
  return template;
}
function createActionModifier(input) {
  const modifier = { schemaVersion: ACTION_MODIFIER_SCHEMA_VERSION, ...structuredClone(input) };
  validateActionModifier(modifier);
  return modifier;
}
function applyActionModifiers(input, modifiers) {
  validateAcceptedForceInput(input);
  if (modifiers.length === 0)
    return { angle: normalizeAngle(input.angle), power: input.power };
  return [...modifiers].sort(compareModifiers).reduce((current, modifier) => {
    validateActionModifier(modifier);
    if (modifier.action === "force" && modifier.operation === "scale")
      return { angle: current.angle, power: current.power * modifier.factor };
    const random = SeededRandom.fromState(modifier.randomState);
    const offset = (random.next() * 2 - 1) * modifier.maxVarianceDegrees;
    return { angle: normalizeAngle(current.angle + offset), power: current.power };
  }, { angle: normalizeAngle(input.angle), power: input.power });
}
function consumeActionModifiers(modifiers) {
  return [...modifiers].sort(compareModifiers).flatMap((modifier) => {
    validateActionModifier(modifier);
    const next = structuredClone(modifier);
    if (next.action === "aim" && next.operation === "random-offset") {
      const random = SeededRandom.fromState(next.randomState);
      random.next();
      next.randomState = random.getState();
    }
    if (next.remainingUses === undefined || next.remainingUses <= 1)
      return next.remainingUses === undefined ? [next] : [];
    return [{ ...next, remainingUses: next.remainingUses - 1 }];
  });
}
function validateActionModifier(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Action modifier must be an object");
  const modifier = value;
  if (modifier.schemaVersion !== ACTION_MODIFIER_SCHEMA_VERSION)
    throw new Error("Unsupported action modifier schema version");
  if (typeof modifier.id !== "string" || modifier.id.length === 0)
    throw new Error("Action modifier requires a stable id");
  if (modifier.action === "force" && modifier.operation === "scale")
    validateFactor(modifier.factor);
  else if (modifier.action === "aim" && modifier.operation === "random-offset") {
    validateVariance(modifier.maxVarianceDegrees);
    validateRandomState(modifier.randomState);
  } else
    throw new Error("Unsupported action modifier operation");
  if (modifier.remainingUses !== undefined && (!Number.isSafeInteger(modifier.remainingUses) || modifier.remainingUses < 1))
    throw new Error("Action modifier remaining uses must be a positive integer");
  const hasLifetime = modifier.durationUnit !== undefined || modifier.duration !== undefined || modifier.remaining !== undefined;
  if (hasLifetime) {
    if (modifier.durationUnit === undefined || modifier.duration === undefined || modifier.remaining === undefined)
      throw new Error("Action modifier lifetime is incomplete");
    if (modifier.durationUnit !== "turns")
      throw new Error("Action modifier lifetime requires turns");
    validateLifetime({ durationUnit: modifier.durationUnit, duration: modifier.duration, remaining: modifier.remaining });
  }
  if (modifier.remainingUses === undefined && !hasLifetime)
    throw new Error("Action modifier requires consumption or lifetime");
  if (modifier.sourceId !== undefined && (typeof modifier.sourceId !== "string" || modifier.sourceId.length === 0))
    throw new Error("Action modifier sourceId must be non-empty");
  if (modifier.sourceOrder !== undefined && !Number.isSafeInteger(modifier.sourceOrder))
    throw new Error("Action modifier sourceOrder must be a safe integer");
  assertJsonValue(modifier);
}
function validateFactor(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error("Action modifier factor must be a finite non-negative number");
}
function validateVariance(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error("Action modifier variance must be a finite non-negative number");
}
function validateRandomState(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 4294967295)
    throw new Error("Action modifier random state must be an unsigned 32-bit integer");
}
function validateAcceptedForceInput(input) {
  if (!Number.isFinite(input.angle) || !Number.isFinite(input.power) || input.power < 0)
    throw new Error("Accepted force input must have a finite angle and non-negative power");
}
function compareModifiers(first, second) {
  return (first.sourceOrder ?? 0) - (second.sourceOrder ?? 0) || first.id.localeCompare(second.id);
}
function normalizeAngle(angle) {
  return (angle % 360 + 360) % 360;
}
// src/contracts/collisionFilter.ts
var COLLISION_FILTER_SCHEMA_VERSION = 1;
var COLLISION_FILTER_LIFETIME_SCHEMA_VERSION = 1;
var COLLISION_CATEGORIES = ["entity", "structure"];
function createCollisionFilterTemplate(input) {
  const template = structuredClone(input);
  validateExcludedCategories(template.excludedCategories);
  if (template.durationUnit !== "turns" || !Number.isSafeInteger(template.duration) || template.duration < 1)
    throw new Error("Collision filter template requires a positive turn duration");
  return template;
}
function createCollisionFilter(input) {
  const filter = {
    schemaVersion: COLLISION_FILTER_SCHEMA_VERSION,
    id: input.id,
    excludedCategories: [...input.excludedCategories],
    ...input.sourceId === undefined ? {} : { sourceId: input.sourceId },
    ...input.sourceOrder === undefined ? {} : { sourceOrder: input.sourceOrder }
  };
  validateCollisionFilter(filter);
  return filter;
}
function createCollisionFilterLifetime(input) {
  const lifetime = {
    schemaVersion: COLLISION_FILTER_LIFETIME_SCHEMA_VERSION,
    id: input.id,
    filterId: input.filterId,
    ...createLifetime({ durationUnit: input.durationUnit, duration: input.duration, remaining: input.remaining }),
    ...input.sourceId === undefined ? {} : { sourceId: input.sourceId },
    ...input.sourceOrder === undefined ? {} : { sourceOrder: input.sourceOrder }
  };
  validateCollisionFilterLifetime(lifetime);
  return lifetime;
}
function advanceCollisionFilterLifetime(lifetime) {
  validateCollisionFilterLifetime(lifetime);
  const next = advanceLifetime(lifetimeOf4(lifetime));
  return next ? { ...structuredClone(lifetime), ...next } : undefined;
}
function isCollisionAllowed(firstCategory, firstFilters, secondCategory, secondFilters) {
  return !firstFilters.some((filter) => filter.excludedCategories.includes(secondCategory)) && !secondFilters.some((filter) => filter.excludedCategories.includes(firstCategory));
}
function validateCollisionFilter(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Collision filter must be an object");
  const filter = value;
  if (filter.schemaVersion !== COLLISION_FILTER_SCHEMA_VERSION)
    throw new Error("Unsupported collision filter schema version");
  if (typeof filter.id !== "string" || filter.id.length === 0)
    throw new Error("Collision filter requires a stable id");
  if (!Array.isArray(filter.excludedCategories) || filter.excludedCategories.length === 0)
    throw new Error("Collision filter requires excluded categories");
  validateExcludedCategories(filter.excludedCategories);
  if (filter.sourceId !== undefined && (typeof filter.sourceId !== "string" || filter.sourceId.length === 0))
    throw new Error("Collision filter sourceId must be non-empty");
  if (filter.sourceOrder !== undefined && !Number.isSafeInteger(filter.sourceOrder))
    throw new Error("Collision filter sourceOrder must be a safe integer");
  assertJsonValue(filter);
}
function validateCollisionFilterLifetime(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Collision filter lifetime must be an object");
  const lifetime = value;
  if (lifetime.schemaVersion !== COLLISION_FILTER_LIFETIME_SCHEMA_VERSION)
    throw new Error("Unsupported collision filter lifetime schema version");
  if (typeof lifetime.id !== "string" || lifetime.id.length === 0 || typeof lifetime.filterId !== "string" || lifetime.filterId.length === 0)
    throw new Error("Collision filter lifetime requires stable ids");
  if (lifetime.durationUnit !== "turns")
    throw new Error("Collision filter lifetime requires turns");
  validateLifetime({ durationUnit: lifetime.durationUnit, duration: lifetime.duration, remaining: lifetime.remaining });
  if (lifetime.sourceId !== undefined && (typeof lifetime.sourceId !== "string" || lifetime.sourceId.length === 0))
    throw new Error("Collision filter lifetime sourceId must be non-empty");
  if (lifetime.sourceOrder !== undefined && !Number.isSafeInteger(lifetime.sourceOrder))
    throw new Error("Collision filter lifetime sourceOrder must be a safe integer");
  assertJsonValue(lifetime);
}
function validateCollisionFilterState(filters, lifetimes) {
  const filterIds = new Set;
  let previousFilter;
  for (const filter of filters) {
    validateCollisionFilter(filter);
    if (filterIds.has(filter.id) || previousFilter && compareFilterOrder(previousFilter, filter) > 0)
      throw new Error("Collision filters must be unique and canonically ordered");
    filterIds.add(filter.id);
    previousFilter = filter;
  }
  const lifetimeIds = new Set;
  let previousLifetime;
  for (const lifetime of lifetimes) {
    validateCollisionFilterLifetime(lifetime);
    if (!filterIds.has(lifetime.filterId))
      throw new Error("Collision filter lifetime references an unknown filter");
    if (lifetimeIds.has(lifetime.id) || previousLifetime && compareLifetimeOrder(previousLifetime, lifetime) > 0)
      throw new Error("Collision filter lifetimes must be unique and canonically ordered");
    lifetimeIds.add(lifetime.id);
    previousLifetime = lifetime;
  }
}
function lifetimeOf4(value) {
  return { durationUnit: value.durationUnit, duration: value.duration, remaining: value.remaining };
}
function validateExcludedCategories(value) {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error("Collision filter requires excluded categories");
  const categories = [...value].sort();
  if (categories.some((category, index) => !COLLISION_CATEGORIES.includes(category) || index > 0 && category === categories[index - 1]))
    throw new Error("Collision filter categories must be unique and supported");
  if (value.some((category, index) => category !== categories[index]))
    throw new Error("Collision filter categories must be canonicalized");
}
function compareFilterOrder(first, second) {
  return (first.sourceOrder ?? 0) - (second.sourceOrder ?? 0) || first.id.localeCompare(second.id);
}
function compareLifetimeOrder(first, second) {
  return (first.sourceOrder ?? 0) - (second.sourceOrder ?? 0) || first.id.localeCompare(second.id);
}
// src/contracts/actorEligibility.ts
var ACTOR_ELIGIBILITY_SCHEMA_VERSION = 1;
var ACTOR_ELIGIBILITY_LIFETIME_SCHEMA_VERSION = 1;
function createActorEligibilityConstraint(input) {
  const constraint = {
    schemaVersion: ACTOR_ELIGIBILITY_SCHEMA_VERSION,
    id: input.id,
    mode: input.mode,
    ...input.sourceId === undefined ? {} : { sourceId: input.sourceId },
    ...input.sourceOrder === undefined ? {} : { sourceOrder: input.sourceOrder }
  };
  validateActorEligibilityConstraint(constraint);
  return constraint;
}
function createActorEligibilityConstraintLifetime(input) {
  const lifetime = {
    schemaVersion: ACTOR_ELIGIBILITY_LIFETIME_SCHEMA_VERSION,
    id: input.id,
    constraintId: input.constraintId,
    ...createLifetime({ durationUnit: input.durationUnit, duration: input.duration, remaining: input.remaining }),
    ...input.sourceId === undefined ? {} : { sourceId: input.sourceId },
    ...input.sourceOrder === undefined ? {} : { sourceOrder: input.sourceOrder }
  };
  validateActorEligibilityConstraintLifetime(lifetime);
  return lifetime;
}
function createActorEligibilityConstraintTemplate(input) {
  const template = structuredClone(input);
  if (template.mode !== "excluded" || template.durationUnit !== "turns" || !Number.isSafeInteger(template.duration) || template.duration < 1)
    throw new Error("Actor eligibility constraint requires a positive turn duration");
  return template;
}
function advanceActorEligibilityConstraintLifetime(lifetime) {
  validateActorEligibilityConstraintLifetime(lifetime);
  const next = advanceLifetime({ durationUnit: lifetime.durationUnit, duration: lifetime.duration, remaining: lifetime.remaining });
  return next ? { ...structuredClone(lifetime), ...next } : undefined;
}
function isActorEligible(constraints) {
  return !constraints.some((constraint) => constraint.mode === "excluded");
}
function validateActorEligibilityConstraint(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Actor eligibility constraint must be an object");
  const constraint = value;
  if (constraint.schemaVersion !== ACTOR_ELIGIBILITY_SCHEMA_VERSION)
    throw new Error("Unsupported actor eligibility constraint schema version");
  if (typeof constraint.id !== "string" || constraint.id.length === 0)
    throw new Error("Actor eligibility constraint requires a stable id");
  if (constraint.mode !== "excluded")
    throw new Error("Unsupported actor eligibility constraint mode");
  if (constraint.sourceId !== undefined && (typeof constraint.sourceId !== "string" || constraint.sourceId.length === 0))
    throw new Error("Actor eligibility constraint sourceId must be non-empty");
  if (constraint.sourceOrder !== undefined && !Number.isSafeInteger(constraint.sourceOrder))
    throw new Error("Actor eligibility constraint sourceOrder must be a safe integer");
  assertJsonValue(constraint);
}
function validateActorEligibilityConstraintLifetime(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Actor eligibility constraint lifetime must be an object");
  const lifetime = value;
  if (lifetime.schemaVersion !== ACTOR_ELIGIBILITY_LIFETIME_SCHEMA_VERSION)
    throw new Error("Unsupported actor eligibility lifetime schema version");
  if (typeof lifetime.id !== "string" || lifetime.id.length === 0 || typeof lifetime.constraintId !== "string" || lifetime.constraintId.length === 0)
    throw new Error("Actor eligibility lifetime requires stable ids");
  if (lifetime.durationUnit !== "turns")
    throw new Error("Actor eligibility constraint lifetime requires turns");
  validateLifetime({ durationUnit: lifetime.durationUnit, duration: lifetime.duration, remaining: lifetime.remaining });
  if (lifetime.sourceId !== undefined && (typeof lifetime.sourceId !== "string" || lifetime.sourceId.length === 0))
    throw new Error("Actor eligibility lifetime sourceId must be non-empty");
  if (lifetime.sourceOrder !== undefined && !Number.isSafeInteger(lifetime.sourceOrder))
    throw new Error("Actor eligibility lifetime sourceOrder must be a safe integer");
  assertJsonValue(lifetime);
}
function validateActorEligibilityState(constraints, lifetimes) {
  const ids = new Set;
  let previous;
  for (const constraint of constraints) {
    validateActorEligibilityConstraint(constraint);
    if (ids.has(constraint.id) || previous && compareConstraintOrder(previous, constraint) > 0)
      throw new Error("Actor eligibility constraints must be unique and canonically ordered");
    ids.add(constraint.id);
    previous = constraint;
  }
  const lifetimeIds = new Set;
  let previousLifetime;
  for (const lifetime of lifetimes) {
    validateActorEligibilityConstraintLifetime(lifetime);
    if (!ids.has(lifetime.constraintId))
      throw new Error("Actor eligibility lifetime references an unknown constraint");
    if (lifetimeIds.has(lifetime.id) || previousLifetime && compareLifetimeOrder2(previousLifetime, lifetime) > 0)
      throw new Error("Actor eligibility lifetimes must be unique and canonically ordered");
    lifetimeIds.add(lifetime.id);
    previousLifetime = lifetime;
  }
}
function compareConstraintOrder(first, second) {
  return (first.sourceOrder ?? 0) - (second.sourceOrder ?? 0) || first.id.localeCompare(second.id);
}
function compareLifetimeOrder2(first, second) {
  return (first.sourceOrder ?? 0) - (second.sourceOrder ?? 0) || first.id.localeCompare(second.id);
}

// src/sdk/index.ts
var engine = {
  createWorld(options) {
    return new EngineWorldBuilder(options.id, options.worldSize);
  },
  createSystemRegistry() {
    return new EngineSystemRegistry;
  },
  createEffectRegistry() {
    return new EngineEffectRegistry;
  },
  createTransformState,
  createMovementState,
  createCounterState,
  canonicalizeCounterStates,
  validateCounterState,
  createEntity(settings) {
    assertJsonValue(settings);
    return structuredClone(settings);
  },
  createStructure(settings) {
    assertJsonValue(settings);
    return structuredClone(settings);
  },
  createEffect(settings) {
    assertJsonValue(settings);
    return structuredClone(settings);
  },
  validate(value) {
    assertJsonValue(value);
  },
  buildJson(settings, space = 2) {
    return JSON.stringify(settings, null, space);
  }
};
// src/audio-sdk/index.ts
var DEFAULT_BUSES = [
  { id: "master", volume: 1, muted: false, maxVoices: 64, defaultPriority: 0, paused: false },
  { id: "music", volume: 1, muted: false, maxVoices: 1, defaultPriority: 50, paused: false },
  { id: "ambience", volume: 1, muted: false, maxVoices: 8, defaultPriority: 20, paused: false },
  { id: "effects", volume: 1, muted: false, maxVoices: 32, defaultPriority: 10, paused: false },
  { id: "ui", volume: 1, muted: false, maxVoices: 8, defaultPriority: 30, paused: false },
  { id: "voice", volume: 1, muted: false, maxVoices: 8, defaultPriority: 40, paused: false }
];

class AudioEmitter {
  soundSourceId;
  pending = [];
  constructor(soundSourceId) {
    this.soundSourceId = soundSourceId;
    validateId(soundSourceId, "sound source ID");
  }
  emit(command) {
    validateAudioCommand(command);
    if (command.sourceId !== this.soundSourceId)
      throw new Error(`Audio command source '${command.sourceId}' does not match emitter '${this.soundSourceId}'`);
    this.pending.push(clone3(command));
  }
  drainSoundCommands() {
    const commands = this.pending.map(clone3);
    this.pending = [];
    return commands;
  }
}

class SoundSystem {
  runtimeId;
  buses = new Map;
  persistent = new Map;
  pending = [];
  output;
  sequence;
  constructor(runtimeId, settings = { buses: clone3(DEFAULT_BUSES), persistentSources: [] }) {
    this.runtimeId = runtimeId;
    validateId(runtimeId, "runtime ID");
    for (const bus of settings.buses) {
      validateBus(bus);
      if (this.buses.has(bus.id))
        throw new Error(`Duplicate audio bus '${bus.id}'`);
      this.buses.set(bus.id, clone3(bus));
    }
    if (!this.buses.has("master"))
      this.buses.set("master", clone3(DEFAULT_BUSES[0]));
    for (const source of settings.persistentSources) {
      validatePersistentSource(source, this.buses);
      if (this.persistent.has(source.sourceId))
        throw new Error(`Duplicate persistent audio source '${source.sourceId}'`);
      this.persistent.set(source.sourceId, clone3(source));
    }
    this.sequence = settings.sequence ?? 0;
    this.output = emptyBatch(runtimeId, this.sequence, this.diagnostics());
  }
  submit(command) {
    validateAudioCommand(command);
    this.pending.push(clone3(command));
  }
  tick(candidates) {
    const collected = [];
    let ordinal = 0;
    for (const candidate of candidates.filter(isSoundEmitter).sort((a, b) => a.soundSourceId.localeCompare(b.soundSourceId))) {
      for (const command of candidate.drainSoundCommands())
        collected.push({ command, ordinal: ordinal++ });
    }
    for (const command of this.pending.splice(0))
      collected.push({ command, ordinal: ordinal++ });
    const result = this.aggregate(collected);
    this.output = { schemaVersion: 1, runtimeId: this.runtimeId, sequence: ++this.sequence, commands: result.commands, diagnostics: { ...this.diagnostics(), ...result.diagnostics, sequence: this.sequence } };
  }
  drainOutput() {
    const value = clone3(this.output);
    this.output = emptyBatch(this.runtimeId, this.sequence, this.diagnostics());
    return value;
  }
  restorePersistentIntent() {
    for (const source of [...this.persistent.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId)))
      this.pending.push(clone3(source.command));
  }
  toSettings(framework = createDefaultAudioFramework()) {
    const settings = { schemaVersion: 1, runtimeId: this.runtimeId, buses: [...this.buses.values()].sort(byBus).map(clone3), persistentSources: [...this.persistent.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId)).map(clone3), framework: clone3(framework), sequence: this.sequence };
    validateAudioSettings(settings);
    return settings;
  }
  getDiagnostics() {
    return clone3(this.diagnostics());
  }
  aggregate(collected) {
    let rejected = 0;
    let deduplicated = 0;
    let droppedByPriority = 0;
    const valid = [];
    for (const entry of collected) {
      try {
        validateAudioCommand(entry.command);
        validateBusReference(entry.command, this.buses);
        valid.push(entry);
      } catch {
        rejected++;
      }
    }
    const dedupe = new Map;
    const retained = [];
    for (const entry of valid) {
      const key = entry.command.type === "playSound" && entry.command.dedupeKey ? `${entry.command.sourceId}|${entry.command.dedupeKey}` : undefined;
      if (!key) {
        retained.push(entry);
        continue;
      }
      const prior = dedupe.get(key);
      if (!prior || compareCommand(entry.command, prior.command, entry.ordinal, prior.ordinal, this.buses) < 0) {
        if (prior)
          deduplicated++;
        dedupe.set(key, entry);
      } else
        deduplicated++;
    }
    retained.push(...dedupe.values());
    const admitted = [];
    for (const [busId, entries] of groupBy(retained.filter((entry) => isVoiceCommand(entry.command)), (entry) => commandBus(entry.command)).entries()) {
      const bus = this.buses.get(busId);
      const ordered = entries.sort((a, b) => compareCommand(a.command, b.command, a.ordinal, b.ordinal, this.buses));
      admitted.push(...ordered.slice(0, bus.maxVoices));
      droppedByPriority += Math.max(0, ordered.length - bus.maxVoices);
    }
    admitted.push(...retained.filter((entry) => !isVoiceCommand(entry.command)));
    for (const entry of admitted)
      this.applyPersistent(entry.command);
    const commands = admitted.sort((a, b) => comparePipeline(a.command, b.command, a.ordinal, b.ordinal, this.buses)).map((entry) => this.resolve(entry.command));
    return { commands, diagnostics: { collected: collected.length, rejected, deduplicated, droppedByPriority } };
  }
  resolve(command) {
    return { ...clone3(command), runtimeId: this.runtimeId, globalSourceId: `${this.runtimeId}:${command.sourceId}`, sequence: this.sequence + 1 };
  }
  applyPersistent(command) {
    if (command.type === "startLoop" || command.type === "playMusic")
      this.persistent.set(command.sourceId, { sourceId: command.sourceId, command: clone3(command) });
    if (command.type === "stopSource")
      this.persistent.delete(command.sourceId);
    if (command.type === "stopMusic") {
      for (const [id, source] of this.persistent)
        if (source.command.type === "playMusic" && (!command.sourceId || command.sourceId === id))
          this.persistent.delete(id);
    }
    if (command.type === "stopAll")
      this.persistent.clear();
    if (command.type === "setBusVolume") {
      const bus = this.buses.get(command.bus);
      bus.volume = command.volume;
      if (command.muted !== undefined)
        bus.muted = command.muted;
    }
    if (command.type === "pauseBus" || command.type === "resumeBus")
      this.buses.get(command.bus).paused = command.type === "pauseBus";
  }
  diagnostics() {
    return { collected: 0, rejected: 0, deduplicated: 0, droppedByPriority: 0, activePersistentSources: [...this.persistent.keys()].sort(), outputStatus: "ready", sequence: this.sequence };
  }
}

class AudioRuntime {
  system;
  framework;
  constructor(settings) {
    validateAudioSettings(settings);
    this.framework = clone3(settings.framework);
    this.system = new SoundSystem(settings.runtimeId, settings);
  }
  tick(emitters) {
    this.system.tick(emitters);
  }
  submit(command) {
    this.system.submit(command);
  }
  drainOutput() {
    return this.system.drainOutput();
  }
  restorePersistentIntent() {
    this.system.restorePersistentIntent();
  }
  toSettings() {
    return this.system.toSettings(this.framework);
  }
  getDiagnostics() {
    return this.system.getDiagnostics();
  }
}

class ApplicationAudioMixer {
  applicationId;
  buses = new Map;
  pending = [];
  activeMusic;
  sequence;
  constructor(applicationId, settings = { buses: clone3(DEFAULT_BUSES) }) {
    this.applicationId = applicationId;
    validateId(applicationId, "application ID");
    for (const bus of settings.buses) {
      validateBus(bus);
      if (this.buses.has(bus.id))
        throw new Error(`Duplicate audio bus '${bus.id}'`);
      this.buses.set(bus.id, clone3(bus));
    }
    if (!this.buses.has("master"))
      this.buses.set("master", clone3(DEFAULT_BUSES[0]));
    if (settings.activeMusic) {
      validateResolvedCommand(settings.activeMusic);
      this.activeMusic = clone3(settings.activeMusic);
    }
    this.sequence = settings.sequence ?? 0;
  }
  submit(batch) {
    validateAudioBatch(batch);
    this.pending.push(clone3(batch));
  }
  flush() {
    const submitted = this.pending.splice(0).flatMap((batch) => batch.commands);
    const rejected = submitted.filter((command) => ("bus" in command) && command.bus !== undefined && !this.buses.has(command.bus)).length;
    const incoming = submitted.filter((command) => !(("bus" in command) && command.bus !== undefined && !this.buses.has(command.bus))).sort((a, b) => compareResolved(a, b, this.buses));
    const controls = incoming.filter((command) => !isVoiceCommand(command));
    for (const command of controls)
      this.applyControl(command);
    const voices = incoming.filter(isVoiceCommand);
    const music = voices.filter((command) => command.type === "playMusic");
    const nonMusic = this.limitVoices(voices.filter((command) => command.type !== "playMusic"));
    const previousMusic = this.activeMusic;
    const selectedMusic = this.selectMusic(music);
    const replacedMusic = selectedMusic && previousMusic && previousMusic.globalSourceId !== selectedMusic.globalSourceId ? [{ type: "stopSource", sourceId: previousMusic.sourceId, runtimeId: previousMusic.runtimeId, globalSourceId: previousMusic.globalSourceId, sequence: this.sequence + 1 }] : [];
    const commands = [...controls, ...replacedMusic, ...nonMusic, ...selectedMusic ? [selectedMusic] : []].sort((a, b) => compareResolved(a, b, this.buses));
    const diagnostics = { collected: submitted.length, rejected, deduplicated: 0, droppedByPriority: Math.max(0, voices.filter((command) => command.type !== "playMusic").length - nonMusic.length) + Math.max(0, music.length - (selectedMusic ? 1 : 0)), activePersistentSources: this.activeMusic ? [this.activeMusic.globalSourceId] : [], activeMusicSourceId: this.activeMusic?.globalSourceId, outputStatus: "ready", sequence: ++this.sequence };
    return { schemaVersion: 1, runtimeId: this.applicationId, sequence: this.sequence, commands: commands.map((command) => ({ ...command, sequence: this.sequence })), diagnostics };
  }
  toSettings() {
    const settings = { schemaVersion: 1, applicationId: this.applicationId, buses: [...this.buses.values()].sort(byBus).map(clone3), ...this.activeMusic ? { activeMusic: clone3(this.activeMusic) } : {}, sequence: this.sequence };
    validateApplicationAudioSettings(settings);
    return settings;
  }
  limitVoices(commands) {
    const result = [];
    for (const [busId, entries] of groupBy(commands, (command) => commandBus(command)).entries())
      result.push(...entries.sort((a, b) => compareResolved(a, b, this.buses)).slice(0, this.buses.get(busId).maxVoices));
    return result;
  }
  selectMusic(candidates) {
    const ordered = candidates.sort((a, b) => compareResolved(a, b, this.buses));
    for (const candidate of ordered) {
      const policy = candidate.replacementPolicy ?? "replace-lower-or-equal";
      const currentPriority = this.activeMusic ? resolvedPriority(this.activeMusic, this.buses) : -Infinity;
      const priority = resolvedPriority(candidate, this.buses);
      if (!this.activeMusic || policy === "replace-current" || policy === "replace-lower-or-equal" && priority >= currentPriority || policy === "keep-current" && !this.activeMusic) {
        this.activeMusic = clone3(candidate);
        return candidate;
      }
    }
    return;
  }
  applyControl(command) {
    if (command.type === "stopMusic" && (!command.sourceId || this.activeMusic?.globalSourceId === `${command.runtimeId}:${command.sourceId}`))
      this.activeMusic = undefined;
    if (command.type === "stopSource" && this.activeMusic?.globalSourceId === `${command.runtimeId}:${command.sourceId}`)
      this.activeMusic = undefined;
    if (command.type === "stopAll")
      this.activeMusic = undefined;
    if (command.type === "setBusVolume") {
      const bus = this.buses.get(command.bus);
      if (bus) {
        bus.volume = command.volume;
        if (command.muted !== undefined)
          bus.muted = command.muted;
      }
    }
    if (command.type === "pauseBus" || command.type === "resumeBus") {
      const bus = this.buses.get(command.bus);
      if (bus)
        bus.paused = command.type === "pauseBus";
    }
  }
}
function createDefaultAudioFramework() {
  const registry = new EngineSystemRegistry().register({ id: "audio.collect", provides: ["audio.commands"] }).register({ id: "audio.mix", requires: ["audio.commands"], after: ["audio.collect"], provides: ["audio.batch"] });
  return registry.select(["audio.collect", "audio.mix"]);
}
function createAudioRuntime(settings) {
  return new AudioRuntime(settings);
}
function createAudioSettings(options) {
  return { schemaVersion: 1, runtimeId: options.runtimeId, buses: clone3(options.buses ?? DEFAULT_BUSES), persistentSources: clone3(options.persistentSources ?? []), framework: createDefaultAudioFramework(), sequence: 0 };
}
function validateAudioSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed audio settings");
  const settings = value;
  if (settings.schemaVersion !== 1 || typeof settings.runtimeId !== "string" || !Array.isArray(settings.buses) || !Array.isArray(settings.persistentSources) || !settings.framework || typeof settings.sequence !== "number" || !Number.isSafeInteger(settings.sequence) || settings.sequence < 0)
    throw new Error("Malformed audio settings");
  const sequence = settings.sequence;
  validateId(settings.runtimeId, "runtime ID");
  const buses = new Map;
  for (const bus of settings.buses) {
    validateBus(bus);
    if (buses.has(bus.id))
      throw new Error(`Duplicate audio bus '${bus.id}'`);
    buses.set(bus.id, bus);
  }
  if (!buses.has("master"))
    throw new Error("Audio settings require a master bus");
  const sources = new Set;
  for (const source of settings.persistentSources) {
    validatePersistentSource(source, buses);
    if (sources.has(source.sourceId))
      throw new Error(`Duplicate persistent audio source '${source.sourceId}'`);
    sources.add(source.sourceId);
  }
  const registry = new EngineSystemRegistry().register({ id: "audio.collect", provides: ["audio.commands"] }).register({ id: "audio.mix", requires: ["audio.commands"], after: ["audio.collect"], provides: ["audio.batch"] });
  registry.validate(settings.framework);
  if (sequence < 0)
    throw new Error("Invalid audio sequence");
  assertJsonValue(settings);
}
function validateApplicationAudioSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed application audio settings");
  const settings = value;
  if (settings.schemaVersion !== 1 || typeof settings.applicationId !== "string" || !Array.isArray(settings.buses) || typeof settings.sequence !== "number" || !Number.isSafeInteger(settings.sequence) || settings.sequence < 0)
    throw new Error("Malformed application audio settings");
  const sequence = settings.sequence;
  validateId(settings.applicationId, "application ID");
  const ids = new Set;
  for (const bus of settings.buses) {
    validateBus(bus);
    if (ids.has(bus.id))
      throw new Error(`Duplicate audio bus '${bus.id}'`);
    ids.add(bus.id);
  }
  if (!ids.has("master"))
    throw new Error("Application audio settings require a master bus");
  if (settings.activeMusic)
    validateResolvedCommand(settings.activeMusic);
  if (sequence < 0)
    throw new Error("Invalid audio sequence");
  assertJsonValue(settings);
}
function validateAudioCommand(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed audio command");
  const command = value;
  if (typeof command.type !== "string" || !COMMAND_TYPES.has(command.type))
    throw new Error("Unknown audio command");
  if (command.type !== "stopMusic")
    validateId(command.sourceId, "audio source ID");
  else if (command.sourceId !== undefined)
    validateId(command.sourceId, "audio source ID");
  if ("soundId" in command)
    validateId(command.soundId, "sound ID");
  if ("bus" in command && command.bus !== undefined)
    validateId(command.bus, "audio bus ID");
  if ("instanceId" in command && command.instanceId !== undefined)
    validateId(command.instanceId, "audio instance ID");
  if ("dedupeKey" in command && command.dedupeKey !== undefined)
    validateId(command.dedupeKey, "audio dedupe key");
  for (const name of ["volume", "pitch", "pan", "fadeInMs", "fadeOutMs", "priority"]) {
    const numeric = command[name];
    if (numeric !== undefined && (typeof numeric !== "number" || !Number.isFinite(numeric) || name === "volume" && (numeric < 0 || numeric > 1) || name === "pitch" && numeric <= 0 || name === "pan" && (numeric < -1 || numeric > 1) || (name === "fadeInMs" || name === "fadeOutMs") && numeric < 0 || name === "priority" && !Number.isInteger(numeric)))
      throw new Error(`Invalid audio ${name}`);
  }
  if (command.type === "playMusic" && command.replacementPolicy !== undefined && !["replace-current", "replace-lower-or-equal", "keep-current"].includes(command.replacementPolicy))
    throw new Error("Invalid music replacement policy");
  assertJsonValue(command);
}
function validateAudioBatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed audio batch");
  const batch = value;
  if (batch.schemaVersion !== 1 || typeof batch.runtimeId !== "string" || typeof batch.sequence !== "number" || !Number.isSafeInteger(batch.sequence) || batch.sequence < 0 || !Array.isArray(batch.commands) || !batch.diagnostics)
    throw new Error("Malformed audio batch");
  const sequence = batch.sequence;
  validateId(batch.runtimeId, "runtime ID");
  for (const command of batch.commands)
    validateResolvedCommand(command);
  if (sequence < 0)
    throw new Error("Invalid audio sequence");
  assertJsonValue(batch);
}
var audio = {
  engine: { createSystemRegistry: engine.createSystemRegistry },
  createSettings: createAudioSettings,
  createRuntime: createAudioRuntime,
  createApplicationMixer(applicationId, settings) {
    return new ApplicationAudioMixer(applicationId, settings);
  },
  createDefaultFramework: createDefaultAudioFramework,
  emitter(sourceId) {
    return new AudioEmitter(sourceId);
  },
  bus(settings) {
    validateBus(settings);
    return clone3(settings);
  },
  command: {
    play(settings) {
      return { type: "playSound", ...clone3(settings) };
    },
    loop(settings) {
      return { type: "startLoop", ...clone3(settings) };
    },
    music(settings) {
      return { type: "playMusic", ...clone3(settings) };
    },
    stopSource(settings) {
      return { type: "stopSource", ...clone3(settings) };
    },
    stopInstance(settings) {
      return { type: "stopInstance", ...clone3(settings) };
    },
    stopMusic(settings = {}) {
      return { type: "stopMusic", ...clone3(settings) };
    },
    setBusVolume(settings) {
      return { type: "setBusVolume", ...clone3(settings) };
    },
    pauseBus(settings) {
      return { type: "pauseBus", ...clone3(settings) };
    },
    resumeBus(settings) {
      return { type: "resumeBus", ...clone3(settings) };
    },
    stopAll(settings) {
      return { type: "stopAll", ...clone3(settings) };
    }
  },
  validate: validateAudioSettings,
  validateCommand: validateAudioCommand,
  validateBatch: validateAudioBatch
};
var COMMAND_TYPES = new Set(["playSound", "startLoop", "playMusic", "stopSource", "stopInstance", "stopMusic", "pauseBus", "resumeBus", "setBusVolume", "stopAll"]);
function isSoundEmitter(value) {
  return !!value && typeof value === "object" && typeof value.soundSourceId === "string" && typeof value.drainSoundCommands === "function";
}
function validateId(value, name) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._:-]{1,120}$/.test(value))
    throw new Error(`Invalid ${name}`);
}
function validateBus(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed audio bus");
  const bus = value;
  validateId(bus.id, "audio bus ID");
  const volume = bus.volume;
  const maxVoices = bus.maxVoices;
  if (typeof volume !== "number" || !Number.isFinite(volume) || volume < 0 || volume > 1 || typeof bus.muted !== "boolean" || typeof maxVoices !== "number" || !Number.isSafeInteger(maxVoices) || maxVoices < 1 || !Number.isSafeInteger(bus.defaultPriority) || typeof bus.paused !== "boolean")
    throw new Error(`Invalid audio bus '${bus.id}'`);
  assertJsonValue(bus);
}
function validatePersistentSource(value, buses) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Malformed persistent audio source");
  const source = value;
  validateId(source.sourceId, "persistent source ID");
  validateAudioCommand(source.command);
  if (source.command.type !== "startLoop" && source.command.type !== "playMusic")
    throw new Error("Persistent audio source must be a loop or music command");
  if (source.command.sourceId !== source.sourceId)
    throw new Error("Persistent audio source ID mismatch");
  validateBusReference(source.command, buses);
}
function validateBusReference(command, buses) {
  if ("bus" in command && command.bus !== undefined && !buses.has(command.bus))
    throw new Error(`Unknown audio bus '${command.bus}'`);
}
function validateResolvedCommand(value) {
  validateAudioCommand(value);
  const command = value;
  validateId(command.runtimeId, "runtime ID");
  validateId(command.globalSourceId, "global audio source ID");
  const sequence = command.sequence;
  if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 0)
    throw new Error("Invalid audio sequence");
}
function commandBus(command) {
  return "bus" in command && command.bus ? command.bus : command.type === "playMusic" ? "music" : "effects";
}
function isVoiceCommand(command) {
  return command.type === "playSound" || command.type === "startLoop" || command.type === "playMusic";
}
function resolvedPriority(command, buses) {
  return command.priority ?? buses.get(commandBus(command))?.defaultPriority ?? 0;
}
function compareCommand(a, b, aOrdinal, bOrdinal, buses) {
  return resolvedPriority(b, buses) - resolvedPriority(a, buses) || commandBus(a).localeCompare(commandBus(b)) || (a.sourceId ?? "").localeCompare(b.sourceId ?? "") || ("soundId" in a ? a.soundId : "").localeCompare("soundId" in b ? b.soundId : "") || aOrdinal - bOrdinal;
}
function pipelineOrder(command) {
  if (command.type === "stopAll" || command.type === "pauseBus" || command.type === "resumeBus" || command.type === "setBusVolume")
    return 0;
  if (command.type === "stopSource" || command.type === "stopInstance" || command.type === "stopMusic")
    return 1;
  if (command.type === "playMusic")
    return 2;
  if (command.type === "startLoop")
    return 3;
  return 4;
}
function comparePipeline(a, b, aOrdinal, bOrdinal, buses) {
  return pipelineOrder(a) - pipelineOrder(b) || compareCommand(a, b, aOrdinal, bOrdinal, buses);
}
function compareResolved(a, b, buses) {
  return pipelineOrder(a) - pipelineOrder(b) || resolvedPriority(b, buses) - resolvedPriority(a, buses) || a.globalSourceId.localeCompare(b.globalSourceId) || ("soundId" in a ? a.soundId : "").localeCompare("soundId" in b ? b.soundId : "") || a.sequence - b.sequence;
}
function byBus(a, b) {
  return a.id.localeCompare(b.id);
}
function emptyBatch(runtimeId, sequence, diagnostics) {
  return { schemaVersion: 1, runtimeId, sequence, commands: [], diagnostics: { ...diagnostics, sequence } };
}
function groupBy(items, key) {
  const grouped = new Map;
  for (const item of items) {
    const id = key(item);
    const values = grouped.get(id) ?? [];
    values.push(item);
    grouped.set(id, values);
  }
  return grouped;
}
function clone3(value) {
  return structuredClone(value);
}
// src/presentation-sdk/index.ts
function validateAnimationSettings(value) {
  if (!isRecord4(value) || value.schemaVersion !== 1 || typeof value.id !== "string" || typeof value.channel !== "string" || !positiveInteger(value.durationTicks) || !integer(value.priority) || !INTERRUPTIONS.has(value.interruption) || !Array.isArray(value.tracks))
    throw new Error("Malformed animation settings");
  assertKeys(value, ["schemaVersion", "id", "channel", "durationTicks", "priority", "interruption", "tracks"], "animation settings");
  validateId2(value.id, "animation ID");
  validateId2(value.channel, "animation channel");
  const ids = new Set;
  for (const track of value.tracks) {
    if (!isRecord4(track) || typeof track.id !== "string" || !Array.isArray(track.keyframes))
      throw new Error("Malformed animation track");
    assertKeys(track, ["id", "keyframes"], "animation track");
    validateId2(track.id, "animation track ID");
    if (ids.has(track.id))
      throw new Error(`Duplicate animation track '${track.id}'`);
    ids.add(track.id);
    let previous = -1;
    for (const keyframe of track.keyframes) {
      if (!isRecord4(keyframe) || !nonNegativeInteger(keyframe.tick) || keyframe.tick > value.durationTicks || keyframe.tick <= previous)
        throw new Error("Invalid animation keyframe");
      assertKeys(keyframe, ["tick", "value"], "animation keyframe");
      assertJsonValue(keyframe.value);
      previous = keyframe.tick;
    }
    if (track.keyframes.length === 0)
      throw new Error("Animation tracks require keyframes");
  }
  assertJsonValue(value);
}
function validatePresentationEvent(value) {
  if (!isRecord4(value) || value.schemaVersion !== 1 || value.type !== "play" && value.type !== "cancel" || typeof value.eventId !== "string")
    throw new Error("Malformed presentation event");
  assertKeys(value, ["schemaVersion", "type", "eventId", "channel", "animationId", "instanceId", "priority", "payload"], "presentation event");
  validateId2(value.eventId, "presentation event ID");
  if (value.channel !== undefined)
    validateId2(value.channel, "presentation channel");
  if (value.animationId !== undefined)
    validateId2(value.animationId, "animation ID");
  if (value.instanceId !== undefined)
    validateId2(value.instanceId, "presentation instance ID");
  if (value.priority !== undefined && !integer(value.priority))
    throw new Error("Invalid presentation priority");
  if (value.type === "play" && value.animationId === undefined)
    throw new Error("Play events require an animation ID");
  if (value.type === "cancel" && value.instanceId === undefined && value.channel === undefined)
    throw new Error("Cancel events require an instance or channel");
  if (value.payload !== undefined)
    assertJsonValue(value.payload);
  assertJsonValue(value);
}
function validatePresentationRuntimeSettings(value) {
  if (!isRecord4(value) || value.schemaVersion !== 1 || typeof value.runtimeId !== "string" || !nonNegativeInteger(value.tick) || !nonNegativeInteger(value.sequence) || !Array.isArray(value.active) || !Array.isArray(value.pending))
    throw new Error("Malformed presentation runtime settings");
  assertKeys(value, ["schemaVersion", "runtimeId", "tick", "sequence", "active", "pending"], "presentation runtime settings");
  validateId2(value.runtimeId, "presentation runtime ID");
  for (const active of value.active) {
    if (!isRecord4(active) || typeof active.instanceId !== "string" || typeof active.animationId !== "string" || typeof active.channel !== "string" || !nonNegativeInteger(active.startTick) || !integer(active.priority))
      throw new Error("Malformed active animation");
    assertKeys(active, ["instanceId", "animationId", "channel", "startTick", "priority"], "active animation");
    validateId2(active.instanceId, "presentation instance ID");
    validateId2(active.animationId, "animation ID");
    validateId2(active.channel, "presentation channel");
  }
  for (const event of value.pending)
    validatePresentationEvent(event);
  assertJsonValue(value);
}

class PresentationRuntime {
  runtimeId;
  animations = new Map;
  active = new Map;
  pending = [];
  tickNumber;
  sequence;
  lastFrame;
  constructor(runtimeId, settings) {
    this.runtimeId = runtimeId;
    validateId2(runtimeId, "presentation runtime ID");
    for (const animation of settings.animations) {
      validateAnimationSettings(animation);
      if (this.animations.has(animation.id))
        throw new Error(`Duplicate animation '${animation.id}'`);
      this.animations.set(animation.id, clone4(animation));
    }
    this.tickNumber = settings.tick ?? 0;
    this.sequence = settings.sequence ?? 0;
    for (const item of settings.active ?? [])
      this.restoreActive(item);
    for (const event of settings.pending ?? []) {
      validatePresentationEvent(event);
      this.pending.push(clone4(event));
    }
    this.lastFrame = this.frame([]);
  }
  emit(event) {
    validatePresentationEvent(event);
    this.pending.push(clone4(event));
  }
  tick(ticks = 1) {
    if (!nonNegativeInteger(ticks))
      throw new Error("Presentation tick count must be a non-negative integer");
    const records = [];
    for (let step = 0;step < ticks; step++) {
      this.tickNumber++;
      this.processPending(records);
      this.expire(records);
    }
    this.lastFrame = this.frame(records);
    return clone4(this.lastFrame);
  }
  project() {
    return clone4(this.frame([]));
  }
  toSettings() {
    const settings = { schemaVersion: 1, runtimeId: this.runtimeId, tick: this.tickNumber, sequence: this.sequence, active: [...this.active.values()].sort(byInstance).map(clone4), pending: this.pending.map(clone4) };
    validatePresentationRuntimeSettings(settings);
    return settings;
  }
  processPending(records) {
    const pending = this.pending.splice(0).map((event, ordinal) => ({ event, ordinal })).sort((a, b) => this.eventPriority(b.event) - this.eventPriority(a.event) || a.ordinal - b.ordinal || a.event.eventId.localeCompare(b.event.eventId));
    for (const { event } of pending) {
      if (event.type === "cancel") {
        for (const item2 of [...this.active.values()])
          if (event.instanceId && item2.instanceId === event.instanceId || event.channel && item2.channel === event.channel)
            this.cancel(item2, records, event.eventId);
        continue;
      }
      const animation = this.animations.get(event.animationId);
      if (!animation)
        throw new Error(`Unknown animation '${event.animationId}'`);
      const current = this.active.get(animation.channel);
      if (current && (animation.interruption === "ignore" || animation.interruption === "higher-priority" && animation.priority <= current.priority))
        continue;
      if (current)
        this.cancel(current, records, event.eventId);
      const item = { instanceId: event.instanceId ?? `${this.runtimeId}:${event.eventId}`, animationId: animation.id, channel: animation.channel, startTick: this.tickNumber, priority: animation.priority };
      this.active.set(animation.channel, item);
      records.push(this.record({ ...event, type: "play", animationId: animation.id, instanceId: item.instanceId }, this.sequence++));
    }
  }
  eventPriority(event) {
    return event.priority ?? (event.type === "play" ? this.animations.get(event.animationId)?.priority ?? 0 : 0);
  }
  cancel(item, records, eventId) {
    this.active.delete(item.channel);
    records.push(this.record({ schemaVersion: 1, type: "cancel", eventId, instanceId: item.instanceId, channel: item.channel }, this.sequence++));
  }
  expire(records) {
    for (const item of [...this.active.values()]) {
      const animation = this.animations.get(item.animationId);
      if (this.tickNumber - item.startTick >= animation.durationTicks)
        this.cancel(item, records, `${item.instanceId}:complete`);
    }
  }
  record(event, sequence) {
    return { ...clone4(event), sequence, tick: this.tickNumber };
  }
  frame(events) {
    return { schemaVersion: 1, runtimeId: this.runtimeId, tick: this.tickNumber, events: events.map(clone4), animations: [...this.active.values()].sort(byInstance).map((item) => this.projectAnimation(item)) };
  }
  projectAnimation(item) {
    const animation = this.animations.get(item.animationId);
    const localTick = Math.max(0, this.tickNumber - item.startTick);
    const values = {};
    for (const track of animation.tracks)
      values[track.id] = sample(track.keyframes, localTick);
    return { instanceId: item.instanceId, animationId: item.animationId, channel: item.channel, priority: item.priority, localTick, progress: Math.min(1, localTick / animation.durationTicks), values };
  }
  restoreActive(item) {
    validatePresentationRuntimeSettings({ schemaVersion: 1, runtimeId: this.runtimeId, tick: this.tickNumber, sequence: this.sequence, active: [item], pending: [] });
    if (this.active.has(item.channel))
      throw new Error(`Duplicate active animation channel '${item.channel}'`);
    if (!this.animations.has(item.animationId))
      throw new Error(`Unknown animation '${item.animationId}'`);
    this.active.set(item.channel, clone4(item));
  }
}
function sample(keyframes, tick) {
  let result = keyframes[0].value;
  for (const keyframe of keyframes) {
    if (keyframe.tick > tick)
      break;
    result = keyframe.value;
  }
  return clone4(result);
}
function validateId2(value, name) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._:-]{1,120}$/.test(value))
    throw new Error(`Invalid ${name}`);
}
function assertKeys(value, allowed, name) {
  const keys = new Set(allowed);
  for (const key of Object.keys(value))
    if (!keys.has(key))
      throw new Error(`Unknown ${name} field '${key}'`);
}
function isRecord4(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function integer(value) {
  return typeof value === "number" && Number.isSafeInteger(value);
}
function nonNegativeInteger(value) {
  return integer(value) && value >= 0;
}
function positiveInteger(value) {
  return integer(value) && value > 0;
}
function clone4(value) {
  return structuredClone(value);
}
function byInstance(a, b) {
  return a.channel.localeCompare(b.channel) || a.instanceId.localeCompare(b.instanceId);
}
var INTERRUPTIONS = new Set(["replace", "higher-priority", "ignore"]);
var presentation = {
  createAnimation(settings) {
    const result = { schemaVersion: 1, ...clone4(settings) };
    validateAnimationSettings(result);
    return result;
  },
  createRuntime(runtimeId, settings) {
    return new PresentationRuntime(runtimeId, settings);
  },
  play(eventId, animationId, options = {}) {
    return { schemaVersion: 1, type: "play", eventId, animationId, ...clone4(options) };
  },
  cancel(eventId, options) {
    return { schemaVersion: 1, type: "cancel", eventId, ...clone4(options) };
  },
  validateAnimation: validateAnimationSettings,
  validateEvent: validatePresentationEvent,
  validateRuntime: validatePresentationRuntimeSettings
};
export {
  validateTriggerEvent,
  validateTriggerActivation,
  validateTransformTarget,
  validateTransformState,
  validateTemporalModifier,
  validateStructureLifecycleTemplate,
  validateStructureLifecycle,
  validatePresentationRuntimeSettings,
  validatePresentationEvent,
  validateNumericThresholdBindings,
  validateNumericThresholdBinding,
  validateNumericThreshold,
  validateNumericTarget,
  validateNumericEffectSettings,
  validateMovementState,
  validateLifetime,
  validateEngineEffectComposition,
  validateDeferredEffectTemplate,
  validateDeferredEffect,
  validateCounterTriggerBinding,
  validateCounterTarget,
  validateCounterState,
  validateCounterEffectSettings,
  validateCollisionFilterState,
  validateCollisionFilterLifetime,
  validateCollisionFilter,
  validateCollisionCommandBinding,
  validateAudioSettings,
  validateAudioCommand,
  validateAudioBatch,
  validateApplicationAudioSettings,
  validateAnimationSettings,
  validateActorEligibilityState,
  validateActorEligibilityConstraintLifetime,
  validateActorEligibilityConstraint,
  validateActionModifier,
  u8,
  transformBinarySchema,
  struct,
  schemaIdentity,
  restoreBinarySnapshot,
  registerTransformEffects,
  registerParticipationSystem,
  registerParticipationCommands,
  registerNumericSystem,
  registerNumericCommands,
  registerMovementSystem,
  registerMovementEffect,
  registerMovementCommands,
  registerCounterSystem,
  registerCounterCommands,
  presentation,
  participationSystemDefinition,
  packedSnapshot,
  numericSystemDefinition,
  movementSystemDefinition,
  movementBinarySchema,
  isCollisionCommandBinding,
  isCollisionAllowed,
  isActorEligible,
  f64,
  f32,
  engine,
  encodeWithSchema,
  encodeSettings,
  encodeSchema,
  encodePackedSnapshotWithDiagnostics,
  encodePackedSnapshot,
  encodeFrame,
  decodeWithSchema,
  decodeSettings,
  decodeSchema,
  decodePackedSnapshot,
  decodeFrame,
  createTriggerActivation,
  createTransformState,
  createTickTriggerEvent,
  createTemporalModifierTemplate,
  createTemporalModifier,
  createStructureLifecycleTemplate,
  createStructureLifecycle,
  createScheduleDueTriggerEvent,
  createRoundStartTriggerEvent,
  createMovementState,
  createLifetime,
  createEnvironmentActivationTriggerEvent,
  createEngineEffectComposition,
  createDeferredEffectTemplate,
  createDeferredEffect,
  createDefaultAudioFramework,
  createCounterState,
  createCollisionFilterTemplate,
  createCollisionFilterLifetime,
  createCollisionFilter,
  createCollisionEnterTriggerEvent,
  createCollisionCommandBinding,
  createBinaryView,
  createBinarySchemaRegistry,
  createAudioSettings,
  createAudioRuntime,
  createArenaStorage,
  createActorEligibilityConstraintTemplate,
  createActorEligibilityConstraintLifetime,
  createActorEligibilityConstraint,
  createActionModifierTemplate,
  createActionModifier,
  counterTriggerMatches,
  counterSystemDefinition,
  consumeActionModifiers,
  collectAssetReferences,
  canonicalizeCounterStates,
  calculateRadialVelocityDelta,
  bool,
  binarySnapshot,
  binaryBackedTransform,
  binary,
  audio,
  assertJsonValue,
  arrayBufferStorage,
  applyRadialVelocityDelta,
  applyActionModifiers,
  advanceTemporalModifier,
  advanceStructureLifecycle,
  advanceLifetime,
  advanceDeferredEffect,
  advanceCollisionFilterLifetime,
  advanceActorEligibilityConstraintLifetime,
  TRANSFORM_SWAP_POSITION_EFFECT_ID,
  TRANSFORM_SET_ROTATION_EFFECT_ID,
  TRANSFORM_SET_POSITION_EFFECT_ID,
  TRANSFORM_CAPABILITY,
  TEMPORAL_MODIFIER_SCHEMA_VERSION,
  TEMPORAL_DURATION_UNITS,
  SoundSystem,
  SeededRandom,
  STRUCTURE_LIFECYCLE_SCHEMA_VERSION,
  STRUCTURE_LIFECYCLE_DURATION_UNITS,
  ROAST_PACKED_SCHEMA_VERSION,
  ROAST_PACKED_FRAME_TYPE,
  ROAST_BINARY_SCHEMA_VERSION,
  ROAST_BINARY_PROTOCOL_VERSION,
  ROAST_BINARY_FRAME_TYPE,
  PresentationRuntime,
  PackedTransformView,
  PackedSnapshotView,
  PackedMovementView,
  PackedEntityView,
  PARTICIPATION_SET_PHYSICS_EFFECT_ID,
  PARTICIPATION_SET_DRAWING_EFFECT_ID,
  PARTICIPATION_EFFECT_IDS,
  PARTICIPATION_CAPABILITY,
  NUMERIC_THRESHOLD_COMPARATORS,
  NUMERIC_STATE_SCHEMA_VERSION,
  NUMERIC_SET_EFFECT_ID,
  NUMERIC_RESET_EFFECT_ID,
  NUMERIC_EFFECT_IDS,
  NUMERIC_CAPABILITY,
  NUMERIC_ADD_EFFECT_ID,
  MOVEMENT_SET_VELOCITY_EFFECT_ID,
  MOVEMENT_SCALE_SPEED_EFFECT_ID,
  MOVEMENT_EFFECT_ID,
  MOVEMENT_COMMAND_EFFECT_IDS,
  MOVEMENT_CAPABILITY,
  MOVEMENT_APPLY_FORCE_TO_ENTITY_EFFECT_ID,
  MOVEMENT_APPLY_FORCE_FIELD_EFFECT_ID,
  MOVEMENT_ADD_VELOCITY_EFFECT_ID,
  LIFETIME_DURATION_UNITS,
  EngineWorldBuilder,
  EngineTriggerActivationQueue,
  EngineSystemRegistry,
  EngineRuntime,
  EngineEffectRegistry,
  ENGINE_EFFECT_COMPOSITION_TYPE,
  ENGINE_EFFECT_COMPOSITION_SCHEMA_VERSION,
  DEFERRED_EFFECT_SCHEMA_VERSION,
  DEFERRED_EFFECT_DURATION_UNITS,
  COUNTER_SET_EFFECT_ID,
  COUNTER_SCHEMA_VERSION,
  COUNTER_RESET_EFFECT_ID,
  COUNTER_EFFECT_IDS,
  COUNTER_CAPABILITY,
  COUNTER_ADD_EFFECT_ID,
  COLLISION_FILTER_SCHEMA_VERSION,
  COLLISION_FILTER_LIFETIME_SCHEMA_VERSION,
  COLLISION_COMMAND_TYPE,
  COLLISION_COMMAND_SCHEMA_VERSION,
  COLLISION_CATEGORIES,
  BinarySchemaRegistry,
  BinaryBackedTransform,
  AudioRuntime,
  AudioEmitter,
  ApplicationAudioMixer,
  ACTOR_ELIGIBILITY_SCHEMA_VERSION,
  ACTOR_ELIGIBILITY_LIFETIME_SCHEMA_VERSION,
  ACTION_MODIFIER_SCHEMA_VERSION
};
