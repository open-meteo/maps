/**
 * Synchronises the visual swap of independently loading render paths (GPU
 * raster slots, vector tile frames): each party loads on its own, then
 * `arrive`s with its commit callback — the callbacks all run in the same tick
 * once the last party arrives, so every layer of a timestep change starts
 * animating together instead of popping in one by one.
 *
 * A party that has nothing to show (unchanged, failed, superseded) arrives
 * without a callback, so it never holds the others hostage.
 */
export interface CommitBarrier {
	arrive(commit?: () => void): void;
}

export const createCommitBarrier = (parties: number): CommitBarrier => {
	let remaining = parties;
	const commits: (() => void)[] = [];
	return {
		arrive(commit?: () => void): void {
			if (remaining <= 0) return;
			if (commit) commits.push(commit);
			remaining--;
			if (remaining === 0) {
				for (const run of commits) run();
			}
		}
	};
};
