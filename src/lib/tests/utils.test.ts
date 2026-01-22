import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { debounce, throttle } from '$lib';

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

describe('debounce', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should not call the callback immediately', () => {
		const callback = vi.fn();
		const debounced = debounce(callback, 100);

		debounced();

		expect(callback).not.toHaveBeenCalled();
	});

	it('should call the callback after the delay period', () => {
		const callback = vi.fn();
		const debounced = debounce(callback, 100);

		debounced();
		vi.advanceTimersByTime(100);

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('should reset the timer on subsequent calls', () => {
		const callback = vi.fn();
		const debounced = debounce(callback, 100);

		debounced();
		vi.advanceTimersByTime(50);
		debounced(); // Reset timer
		vi.advanceTimersByTime(50);

		expect(callback).not.toHaveBeenCalled();

		vi.advanceTimersByTime(50);
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('should only call the callback once for multiple rapid calls', () => {
		const callback = vi.fn();
		const debounced = debounce(callback, 100);

		debounced();
		debounced();
		debounced();
		debounced();

		vi.advanceTimersByTime(100);

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('should pass the latest arguments to the callback', () => {
		const callback = vi.fn();
		const debounced = debounce(callback, 100);

		debounced('first');
		debounced('second');
		debounced('third');

		vi.advanceTimersByTime(100);

		expect(callback).toHaveBeenCalledWith('third');
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('should handle multiple arguments with different types', () => {
		const callback = vi.fn();
		const debounced = debounce<[string, number, boolean]>(callback, 100);

		debounced('test', 42, true);
		vi.advanceTimersByTime(100);

		expect(callback).toHaveBeenCalledWith('test', 42, true);
	});

	it('should work with different delay values', () => {
		const callback = vi.fn();
		const debounced = debounce(callback, 500);

		debounced();
		vi.advanceTimersByTime(499);
		expect(callback).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('should handle typing simulation (real-world use case)', () => {
		const searchCallback = vi.fn();
		const debouncedSearch = debounce(searchCallback, 300);

		// Simulate user typing "hello"
		debouncedSearch('h');
		vi.advanceTimersByTime(50);
		debouncedSearch('he');
		vi.advanceTimersByTime(50);
		debouncedSearch('hel');
		vi.advanceTimersByTime(50);
		debouncedSearch('hell');
		vi.advanceTimersByTime(50);
		debouncedSearch('hello');

		// Search should not have been called yet
		expect(searchCallback).not.toHaveBeenCalled();

		// After 300ms of no typing, search is triggered
		vi.advanceTimersByTime(300);
		expect(searchCallback).toHaveBeenCalledWith('hello');
		expect(searchCallback).toHaveBeenCalledTimes(1);
	});

	it('should allow multiple debounced calls after delays', () => {
		const callback = vi.fn();
		const debounced = debounce(callback, 100);

		debounced('first');
		vi.advanceTimersByTime(100);
		expect(callback).toHaveBeenCalledWith('first');

		debounced('second');
		vi.advanceTimersByTime(100);
		expect(callback).toHaveBeenCalledWith('second');

		expect(callback).toHaveBeenCalledTimes(2);
	});

	it('should clear previous timeout when called again', () => {
		const callback = vi.fn();
		const debounced = debounce(callback, 100);

		debounced('first');
		vi.advanceTimersByTime(99);
		debounced('second'); // This should cancel the first timeout

		vi.advanceTimersByTime(100);

		expect(callback).toHaveBeenCalledWith('second');
		expect(callback).not.toHaveBeenCalledWith('first');
		expect(callback).toHaveBeenCalledTimes(1);
	});
});

describe('throttle vs debounce comparison', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should demonstrate the difference in behavior', () => {
		const throttleCallback = vi.fn();
		const debounceCallback = vi.fn();
		const throttled = throttle(throttleCallback, 100);
		const debounced = debounce(debounceCallback, 100);

		// Both called at t=0
		throttled();
		debounced();

		// Throttle calls immediately, debounce doesn't
		expect(throttleCallback).toHaveBeenCalledTimes(1);
		expect(debounceCallback).not.toHaveBeenCalled();

		// After delay, debounce finally calls
		vi.advanceTimersByTime(100);
		expect(throttleCallback).toHaveBeenCalledTimes(1);
		expect(debounceCallback).toHaveBeenCalledTimes(1);

		// Both called again
		throttled();
		debounced();

		// Throttle calls immediately (delay passed), debounce waits
		expect(throttleCallback).toHaveBeenCalledTimes(2);
		expect(debounceCallback).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(100);
		expect(throttleCallback).toHaveBeenCalledTimes(2);
		expect(debounceCallback).toHaveBeenCalledTimes(2);
	});
});
