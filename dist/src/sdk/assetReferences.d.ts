export type RenderAssetReference = string | number;
/** Collects only explicit render-asset fields from JSON-safe engine/KORE settings. */
export declare function collectAssetReferences(settings: unknown): RenderAssetReference[];
