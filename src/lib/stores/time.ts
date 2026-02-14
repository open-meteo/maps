import { type Writable, writable } from 'svelte/store';

import type { DomainMetaDataJson } from '@openmeteo/mapbox-layer';

export const now = writable(new Date());

const currentTimeStep = new Date();
currentTimeStep.setUTCHours(currentTimeStep.getUTCHours() + 1, 0, 0, 0);
export const time = writable(new Date(currentTimeStep));

export const modelRun: Writable<Date | undefined> = writable(undefined);
export const modelRunLocked = writable(false);

export const latest: Writable<DomainMetaDataJson | undefined> = writable(undefined);
export const inProgress: Writable<DomainMetaDataJson | undefined> = writable(undefined);
export const metaJson: Writable<DomainMetaDataJson | undefined> = writable(undefined);
