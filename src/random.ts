/** Deterministic pseudo-random source for replayable gameplay decisions. */
export class SeededRandom {
	private state: number;

	public constructor(seed: number) {
		if (!Number.isSafeInteger(seed)) throw new RangeError("Seed must be a safe integer")
		this.state = seed >>> 0
	}

	/** Returns a deterministic value in the range [0, 1). */
	public next(): number {
		this.state = (this.state + 0x6D2B79F5) >>> 0
		let value = this.state
		value = Math.imul(value ^ (value >>> 15), value | 1)
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
		return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
	}

	/** Returns a deterministic integer in the range [0, maxExclusive). */
	public nextInt(maxExclusive: number): number {
		if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
			throw new RangeError("Maximum must be a positive safe integer")
		}
		return Math.floor(this.next() * maxExclusive)
	}

	/** Returns the exact internal state needed to resume this sequence. */
	public getState(): number { return this.state }

	/** Restores a sequence from a state emitted by getState(). */
	public static fromState(state: number): SeededRandom {
		if (!Number.isSafeInteger(state) || state < 0 || state > 0xFFFFFFFF) {
			throw new RangeError("Random state must be an unsigned 32-bit integer")
		}
		const random = new SeededRandom(0)
		random.state = state
		return random
	}
}
