export type BinaryNamespace = string;
export interface BinarySchemaCapabilities { readonly fixedSize: boolean; readonly byteLength?: number; readonly variableLength: boolean; readonly zeroCopyReadable: boolean; readonly zeroCopyWritable: boolean; }
export interface BinaryView { readonly schema: BinarySchema<unknown>; readonly byteOffset: number; readonly byteLength: number; get(field: string): unknown; set(field: string, value: unknown): void; }
export interface BinarySchema<T> {
  readonly size: number;
  readonly typeId?: number;
  readonly version?: number;
  readonly capabilities?: BinarySchemaCapabilities;
  encode(view: DataView, offset: number, value: T): void;
  decode(view: DataView, offset: number): T;
  readonly byteLength?: number;
  encodeBytes?(value: T): Uint8Array;
  decodeBytes?(bytes: Uint8Array): T;
  createView?(bytes: Uint8Array, offset?: number, writable?: boolean): BinaryView;
}

class Writer { readonly bytes: number[] = []; u8(v: number) { if (!Number.isInteger(v) || v < 0 || v > 255) throw new Error("Invalid u8"); this.bytes.push(v); } raw(b: Uint8Array) { for (const x of b) this.bytes.push(x); } fixed(n: number, f: (d: DataView) => void) { const b = new Uint8Array(n); f(new DataView(b.buffer)); this.raw(b); } result() { return Uint8Array.from(this.bytes); } }
class Reader { constructor(readonly bytes: Uint8Array, public offset = 0) {} need(n: number) { if (n < 0 || this.offset + n > this.bytes.length) throw new Error("Binary payload is truncated"); } u8() { this.need(1); return this.bytes[this.offset++]; } fixed(n: number, f: (d: DataView) => number) { this.need(n); const v = f(new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, n)); this.offset += n; return v; } raw(n: number) { this.need(n); const b = this.bytes.slice(this.offset, this.offset + n); this.offset += n; return b; } }
type AnySchema<T> = BinarySchema<T> & { _write(w: Writer, value: T): void; _read(r: Reader): T; _fixed?: number; _fields?: Record<string, BinarySchema<unknown>> };
function make<T>(write: (w: Writer, v: T) => void, read: (r: Reader) => T, fixed?: number, fields?: Record<string, BinarySchema<unknown>>): AnySchema<T> { const s: AnySchema<T> = { size: fixed ?? 0, capabilities: { fixedSize: fixed !== undefined, byteLength: fixed, variableLength: fixed === undefined, zeroCopyReadable: fixed !== undefined, zeroCopyWritable: fixed !== undefined }, encode(view, offset, value) { const b = encodeBytes(s, value); if (b.length !== (fixed ?? b.length)) throw new Error("Schema size mismatch"); new Uint8Array(view.buffer, view.byteOffset + offset, b.length).set(b); }, decode(view, offset) { return decodeBytes(s, new Uint8Array(view.buffer, view.byteOffset + offset, view.byteLength - offset)); }, encodeBytes(value) { const w = new Writer(); write(w, value); return w.result(); }, decodeBytes(bytes) { const r = new Reader(bytes); const value = read(r); if (r.offset !== bytes.length && fixed === undefined) throw new Error("Trailing schema bytes"); return value; }, _write: write, _read: read, _fixed: fixed, _fields: fields }; return s; }
function writeSchema<T>(w: Writer, s: AnySchema<T>, v: T) { if (s._write) s._write(w, v); else w.raw(encodeBytes(s, v)); }
function readSchema<T>(r: Reader, s: AnySchema<T>): T { return s._read ? s._read(r) : decodeBytes(s, r.raw(s.size)); }
function encodeBytes<T>(s: BinarySchema<T>, v: T): Uint8Array { if (s.encodeBytes) return s.encodeBytes(v); const w = new Writer(); (s as AnySchema<T>)._write(w, v); return w.result(); }
function decodeBytes<T>(s: BinarySchema<T>, b: Uint8Array): T { if (s.decodeBytes) return s.decodeBytes(b); return (s as AnySchema<T>)._read(new Reader(b)); }

export const binary = {
  u8: () => make<number>((w, v) => w.u8(v), r => r.u8(), 1),
  u16: () => make<number>((w, v) => w.fixed(2, d => d.setUint16(0, v, true)), r => r.fixed(2, d => d.getUint16(0, true)), 2),
  u32: () => make<number>((w, v) => w.fixed(4, d => d.setUint32(0, v, true)), r => r.fixed(4, d => d.getUint32(0, true)), 4),
  i8: () => make<number>((w, v) => w.fixed(1, d => d.setInt8(0, v)), r => r.fixed(1, d => d.getInt8(0)), 1),
  i16: () => make<number>((w, v) => w.fixed(2, d => d.setInt16(0, v, true)), r => r.fixed(2, d => d.getInt16(0, true)), 2),
  i32: () => make<number>((w, v) => w.fixed(4, d => d.setInt32(0, v, true)), r => r.fixed(4, d => d.getInt32(0, true)), 4),
  f32: () => make<number>((w, v) => w.fixed(4, d => d.setFloat32(0, v, true)), r => r.fixed(4, d => d.getFloat32(0, true)), 4),
  f64: () => make<number>((w, v) => w.fixed(8, d => d.setFloat64(0, v, true)), r => r.fixed(8, d => d.getFloat64(0, true)), 8),
  bool: () => make<boolean>((w, v) => w.u8(v ? 1 : 0), r => { const v = r.u8(); if (v > 1) throw new Error("Invalid boolean"); return v === 1; }, 1),
  varuint: () => make<number>((w, v) => { if (!Number.isSafeInteger(v) || v < 0) throw new Error("Invalid varuint"); do { let b = v % 128; v = Math.floor(v / 128); if (v) b |= 128; w.u8(b); } while (v); }, r => { let n = 0, shift = 0; for (let i = 0; i < 10; i++) { const b = r.u8(); n += (b & 127) * 2 ** shift; if (!(b & 128)) { if (!Number.isSafeInteger(n)) throw new Error("Invalid varuint"); return n; } shift += 7; } throw new Error("Invalid varuint"); }),
  string: () => { const u = new TextEncoder(), t = new TextDecoder(); return make<string>((w, v) => { const b = u.encode(v); writeSchema(w, binary.varuint() as AnySchema<number>, b.length); w.raw(b); }, r => t.decode(r.raw(readSchema(r, binary.varuint() as AnySchema<number>)))); },
  bytes: (length: number) => make<Uint8Array>((w, v) => { if (v.length !== length) throw new Error("Invalid fixed byte length"); w.raw(v); }, r => r.raw(length), length),
  fixedArray: <T>(s: BinarySchema<T>, length: number) => make<T[]>((w, v) => { if (v.length !== length) throw new Error("Invalid fixed array length"); for (const x of v) writeSchema(w, s as AnySchema<T>, x); }, r => Array.from({ length }, () => readSchema(r, s as AnySchema<T>)), s.capabilities?.fixedSize && s.size ? s.size * length : undefined),
  array: <T>(s: BinarySchema<T>) => make<T[]>((w, v) => { writeSchema(w, binary.varuint() as AnySchema<number>, v.length); for (const x of v) writeSchema(w, s as AnySchema<T>, x); }, r => { const n = readSchema(r, binary.varuint() as AnySchema<number>); if (n > 1_000_000) throw new Error("Invalid array count"); return Array.from({ length: n }, () => readSchema(r, s as AnySchema<T>)); }),
  optional: <T>(s: BinarySchema<T>) => make<T | undefined>((w, v) => { w.u8(v === undefined ? 0 : 1); if (v !== undefined) writeSchema(w, s as AnySchema<T>, v); }, r => r.u8() === 0 ? undefined : readSchema(r, s as AnySchema<T>)),
  struct: <T extends Record<string, any>>(fields: { [K in keyof T]: BinarySchema<T[K]> }) => { const entries = Object.entries(fields) as [keyof T, BinarySchema<T[keyof T]>][]; const fixed = entries.every(([, s]) => s.capabilities?.fixedSize) ? entries.reduce((n, [, s]) => n + s.size, 0) : undefined; return make<T>((w, v) => { for (const [k, s] of entries) writeSchema(w, s as AnySchema<T[typeof k]>, v[k]); }, r => { const o = {} as T; for (const [k, s] of entries) o[k] = readSchema(r, s as AnySchema<T[typeof k]>); return o; }, fixed, fields as Record<string, BinarySchema<unknown>>); },
  enumU8: (mapping: Record<string, number>) => { const reverse = new Map<number, string>(); for (const [k, v] of Object.entries(mapping)) { if (!Number.isInteger(v) || v < 0 || v > 255 || reverse.has(v)) throw new Error("Invalid enum mapping"); reverse.set(v, k); } return make<string>((w, v) => { const n = mapping[v]; if (n === undefined) throw new Error(`Unknown enum value ${v}`); w.u8(n); }, r => { const v = r.u8(), name = reverse.get(v); if (name === undefined) throw new Error(`Unknown enum ID ${v}`); return name; }, 1); },
  taggedUnion: <T>(options: { tag: BinarySchema<number>; variants: Record<number, BinarySchema<any>> }) => make<{ tag: number; value: T }>((w, v) => { writeSchema(w, options.tag as AnySchema<number>, v.tag); const s = options.variants[v.tag]; if (!s) throw new Error(`Unknown union tag ${v.tag}`); writeSchema(w, s as AnySchema<any>, v.value); }, r => { const tag = readSchema(r, options.tag as AnySchema<number>); const s = options.variants[tag]; if (!s) throw new Error(`Unknown union tag ${tag}`); return { tag, value: readSchema(r, s as AnySchema<any>) }; }),
  lazy: <T>(get: () => BinarySchema<T>) => make<T>((w, v) => writeSchema(w, get() as AnySchema<T>, v), r => readSchema(r, get() as AnySchema<T>)),
};

export interface RegisteredBinarySchema<T = unknown> { readonly namespace: string; readonly typeId: number; readonly version: number; readonly name?: string; readonly schema: BinarySchema<T>; }
export class BinarySchemaRegistry {
  private readonly entries = new Map<string, RegisteredBinarySchema>(); private sealed = false;
  public register<T>(entry: RegisteredBinarySchema<T>): this { if (this.sealed) throw new Error("Binary schema registry is sealed"); if (!entry.namespace || !Number.isInteger(entry.typeId) || entry.typeId < 0 || entry.typeId > 0xffff || !Number.isInteger(entry.version) || entry.version < 1) throw new Error("Invalid binary schema identity"); const key = `${entry.namespace}:${entry.typeId}@${entry.version}`; if (this.entries.has(key)) throw new Error(`Duplicate binary schema identity ${key}`); this.entries.set(key, entry as RegisteredBinarySchema); return this; }
  public seal(): this { this.sealed = true; return this; }
  public get(namespace: string, typeId: number, version?: number): RegisteredBinarySchema | undefined {
    if (version !== undefined) return this.entries.get(`${namespace}:${typeId}@${version}`);
    const matches = [...this.entries.values()].filter(entry => entry.namespace === namespace && entry.typeId === typeId).sort((a, b) => b.version - a.version);
    return matches[0];
  }
  public entriesSorted(): RegisteredBinarySchema[] { return [...this.entries.values()].sort((a, b) => a.namespace.localeCompare(b.namespace) || a.typeId - b.typeId || a.version - b.version); }
}
export function createBinarySchemaRegistry(): BinarySchemaRegistry { return new BinarySchemaRegistry(); }
export function encodeWithSchema<T>(schema: BinarySchema<T>, value: T): Uint8Array { return encodeBytes(schema, value); }
export function decodeWithSchema<T>(schema: BinarySchema<T>, bytes: Uint8Array): T { return decodeBytes(schema, bytes); }
export function createBinaryView<T>(schema: BinarySchema<T>, bytes: Uint8Array, offset = 0, writable = false): BinaryView {
  if (!schema.capabilities?.fixedSize || !schema.capabilities.byteLength) throw new Error("Schema does not support fixed binary views"); const base = offset; const structSchema = schema as AnySchema<T>; const fields = structSchema._fields; if (!fields) throw new Error("Schema does not expose field views"); const fieldOffsets = new Map<string, number>(); let cursor = 0; for (const [name, field] of Object.entries(fields)) { if (!field.capabilities?.fixedSize) throw new Error("Schema field is not fixed-size"); fieldOffsets.set(name, cursor); cursor += field.size; } if (base < 0 || base + schema.size > bytes.length) throw new Error("Binary view is out of range"); const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); return { schema: schema as BinarySchema<unknown>, byteOffset: base, byteLength: schema.size, get(name) { const field = fields[name]; const at = fieldOffsets.get(name); if (!field || at === undefined) throw new Error(`Unknown binary field ${name}`); return field.decode(data, base + at); }, set(name, value) { if (!writable) throw new Error("Binary view is read-only"); const field = fields[name]; const at = fieldOffsets.get(name); if (!field || at === undefined) throw new Error(`Unknown binary field ${name}`); field.encode(data, base + at, value); } };
}
export function schemaIdentity(entry: Pick<RegisteredBinarySchema, "namespace" | "typeId" | "version">): string { return `${entry.namespace}:${entry.typeId}@${entry.version}`; }
