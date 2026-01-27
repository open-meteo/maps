import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { throttle } from '$lib';

describe('throttle', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should call the callback immediately on first invocation', () => {
		const callback = vi.fn();
		const throttled = throttle(callback, 100);

		throttled();

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('should ignore calls made within the delay period', () => {
		const callback = vi.fn();
		const throttled = throttle(callback, 100);

		throttled();
		throttled();
		throttled();

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('should allow another call after the delay period has passed', () => {
		const callback = vi.fn();
		const throttled = throttle(callback, 100);

		throttled();
		expect(callback).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(100);
		throttled();

		expect(callback).toHaveBeenCalledTimes(2);
	});

	it('should pass arguments to the callback', () => {
		const callback = vi.fn();
		const throttled = throttle(callback, 100);

		throttled('arg1', 'arg2', 123);

		expect(callback).toHaveBeenCalledWith('arg1', 'arg2', 123);
	});

	it('should handle multiple arguments with different types', () => {
		const callback = vi.fn();
		const throttled = throttle<[string, number, boolean]>(callback, 100);

		throttled('test', 42, true);

		expect(callback).toHaveBeenCalledWith('test', 42, true);
	});

	it('should maintain correct timing for multiple throttled calls', () => {
		const callback = vi.fn();
		const throttled = throttle(callback, 100);

		throttled(); // t=0, called
		expect(callback).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(50);
		throttled(); // t=50, ignored (within delay)
		expect(callback).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(50);
		throttled(); // t=100, called
		expect(callback).toHaveBeenCalledTimes(2);

		vi.advanceTimersByTime(200);
		throttled(); // t=300, called
		expect(callback).toHaveBeenCalledTimes(3);
	});

	it('should work with different delay values', () => {
		const callback = vi.fn();
		const throttled = throttle(callback, 500);

		throttled();
		expect(callback).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(499);
		throttled();
		expect(callback).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(1);
		throttled();
		expect(callback).toHaveBeenCalledTimes(2);
	});

	it('should handle rapid consecutive calls correctly', () => {
		const callback = vi.fn();
		const throttled = throttle(callback, 100);

		// Simulate rapid clicks/events
		for (let i = 0; i < 10; i++) {
			throttled();
		}

		expect(callback).toHaveBeenCalledTimes(1);
	});
});
