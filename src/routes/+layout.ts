export const prerender = true;
export const trailingSlash = 'never';
// OpenLayers touches `document` when its modules load, so the page is a
// client-only shell (still prerendered, just without server-rendered markup)
export const ssr = false;
