/**
 * Chart model: everything rendered on the map is a chart. A chart is a list
 * of sources, each source a variable plus individual toggles for the layer
 * types it renders (raster fill, contour lines, wind arrows). Plain
 * single-variable selection is simply a chart with one raster source.
 */

export interface ChartSource {
	/** Full variable id incl. level suffix, e.g. `temperature_850hPa`. */
	variable: string;
	/** Show the raster (colour fill) layer for this source. Default: false */
	raster?: boolean;
	/** Show contour lines for this source. Default: false */
	contours?: boolean;
	/** Contour interval. Undefined = use the colour-scale breakpoints. */
	contourInterval?: number;
	/** Show wind arrow vectors for this source. Default: false */
	arrows?: boolean;
	/**
	 * Raster opacity multiplier (0..1) applied on top of the global opacity
	 * preference. Preset-file styling only, not editable in the UI and not
	 * carried by the `sources` URL encoding (use `chart=<preset>` links).
	 */
	opacity?: number;
	/**
	 * Width multiplier for this source's contour and arrow lines. Preset-file
	 * styling only, like `opacity`.
	 */
	lineWidth?: number;
	/**
	 * Render this source's contours/arrows directly on top of its own raster
	 * (inside the raster stack) instead of in the high vector stack. Rasters
	 * of later sources then overlap them. Preset-file styling only.
	 */
	inlineVectors?: boolean;
}

export interface ChartPreset {
	/** Unique identifier — also used as the `chart` URL parameter. */
	id: string;
	/** Human-readable name shown in the selector. */
	label: string;
	/** One-line description shown under the label. */
	description?: string;
	/** Grouping label (e.g. "Upper-level", "Surface"). */
	group?: string;
	/** One or more sources rendered together on the map. */
	sources: ChartSource[];
}

export interface ChartState {
	/** Set while an unmodified preset is active. */
	presetId?: string;
	/** Set when loaded from an unmodified saved custom chart. */
	name?: string;
	/** At least one source; variables are unique. */
	sources: ChartSource[];
}

export interface SavedChart {
	id: string;
	name: string;
	sources: ChartSource[];
	createdAt: number;
}
