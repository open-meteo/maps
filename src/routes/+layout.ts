export const prerender = true;
export const trailingSlash = 'never';
// Leaflet touches `window` when its module loads, so the page is a
// client-only shell (still prerendered, just without server-rendered markup)
export const ssr = false;
