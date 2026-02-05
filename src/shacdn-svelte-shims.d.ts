// Shadcn-svelte components do not use tsc.
// As a result, the components fail to build because some types are exposed in Svelte TS modules.
// This workaround allows us to run tsc before build or test.
// Issue: https://github.com/huntabyte/shadcn-svelte/issues/1468
declare module '*.svelte' {
	import type { Component } from 'svelte';

	const component: Component<never>;
	export default component;

	// Allow any named exports from module context
	export const buttonVariants: never;
	export type ButtonProps = never;
	export type ButtonSize = never;
	export type ButtonVariant = never;
}
