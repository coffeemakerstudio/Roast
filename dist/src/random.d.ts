/** Deterministic pseudo-random source for replayable gameplay decisions. */
export declare class SeededRandom {
    private state;
    constructor(seed: number);
    /** Returns a deterministic value in the range [0, 1). */
    next(): number;
    /** Returns a deterministic integer in the range [0, maxExclusive). */
    nextInt(maxExclusive: number): number;
    /** Returns the exact internal state needed to resume this sequence. */
    getState(): number;
    /** Restores a sequence from a state emitted by getState(). */
    static fromState(state: number): SeededRandom;
}
