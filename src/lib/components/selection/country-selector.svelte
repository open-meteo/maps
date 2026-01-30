<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';

	import { omProtocolSettings } from '$lib/stores/om-protocol-settings';
	import { typing } from '$lib/stores/preferences';

	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';

	export interface Country {
		name: string;
		code: string;
		filename?: string;
		filenames?: string[];
		geojson?: any;
	}

	interface Props {
		selectedCountry?: string;
		onselect?: (country: Country) => void;
	}

	let { selectedCountry = $bindable(), onselect }: Props = $props();

	let open = $state(false);
	let searchValue = $state('');
	let loadingGeojson = $state(false);

	$effect(() => {
		typing.set(open);
	});

	// Map of country names/codes to their GeoJSON filenames
	const countryList: Country[] = [
		{ name: 'None', code: '', filename: '' },
		{
			name: 'Africa (Continent)',
			code: 'CONT-AF',
			filenames: [
				'algeria.json',
				'angola.json',
				'benin.json',
				'botswana.json',
				'burkina_faso.json',
				'burundi.json',
				'cameroon.json',
				'cape_verde.json',
				'central_african_republic.json',
				'chad.json',
				'comoros.json',
				'congo.json',
				'democratic_congo.json',
				'djibouti.json',
				'egypt.json',
				'equatorial_guinea.json',
				'eritrea.json',
				'eswatini.json',
				'ethiopia.json',
				'gabon.json',
				'gambia.json',
				'ghana.json',
				'guinea.json',
				'guinea_bissau.json',
				'ivory_coast.json',
				'kenya.json',
				'lesotho.json',
				'liberia.json',
				'libya.json',
				'madagascar.json',
				'malawi.json',
				'mali.json',
				'mauritania.json',
				'mauritius.json',
				'morocco.json',
				'mozambique.json',
				'namibia.json',
				'niger.json',
				'nigeria.json',
				'rwanda.json',
				'sao_tome_and_principe.json',
				'senegal.json',
				'seychelles.json',
				'sierra_leone.json',
				'somalia.json',
				'south_africa.json',
				'south_sudan.json',
				'sudan.json',
				'tanzania.json',
				'togo.json',
				'tunisia.json',
				'uganda.json',
				'western_sahara.json',
				'zambia.json',
				'zimbabwe.json'
			]
		},
		{
			name: 'Asia (Continent)',
			code: 'CONT-AS',
			filenames: [
				'afghanistan.json',
				'armenia.json',
				'azerbaijan.json',
				'bahrain.json',
				'bangladesh.json',
				'bhutan.json',
				'brunei.json',
				'cambodia.json',
				'china.json',
				'georgia.json',
				'india.json',
				'indonesia.json',
				'iran.json',
				'iraq.json',
				'israel.json',
				'japan.json',
				'jordan.json',
				'kazakhstan.json',
				'kuwait.json',
				'kyrgyzstan.json',
				'laos.json',
				'lebanon.json',
				'malaysia.json',
				'maldives.json',
				'mongolia.json',
				'myanmar.json',
				'nepal.json',
				'north_korea.json',
				'oman.json',
				'pakistan.json',
				'palestine.json',
				'philippines.json',
				'qatar.json',
				'russia.json',
				'saudi_arabia.json',
				'singapore.json',
				'south_korea.json',
				'sri_lanka.json',
				'syria.json',
				'taiwan.json',
				'tajikistan.json',
				'thailand.json',
				'east_timor.json',
				'turkey.json',
				'turkmenistan.json',
				'united_arab_emirates.json',
				'uzbekistan.json',
				'vietnam.json',
				'yemen.json'
			]
		},
		{
			name: 'Europe (Continent)',
			code: 'CONT-EU',
			filenames: [
				'albania.json',
				'andorra.json',
				'austria.json',
				'belarus.json',
				'belgium.json',
				'bosnia_and_herzegovina.json',
				'bulgaria.json',
				'croatia.json',
				'cyprus.json',
				'czechia.json',
				'denmark.json',
				'estonia.json',
				'finland.json',
				'france.json',
				'germany.json',
				'greece.json',
				'hungary.json',
				'iceland.json',
				'ireland.json',
				'italy.json',
				'latvia.json',
				'liechtenstein.json',
				'lithuania.json',
				'luxembourg.json',
				'malta.json',
				'moldova.json',
				'monaco.json',
				'montenegro.json',
				'netherlands.json',
				'north_macedonia.json',
				'norway.json',
				'poland.json',
				'portugal.json',
				'romania.json',
				'san_marino.json',
				'serbia.json',
				'slovakia.json',
				'slovenia.json',
				'spain.json',
				'sweden.json',
				'switzerland.json',
				'ukraine.json',
				'united_kingdom.json',
				'vatican.json'
			]
		},
		{
			name: 'North America (Continent)',
			code: 'CONT-NA',
			filenames: [
				'antigua_and_barbuda.json',
				'bahamas.json',
				'barbados.json',
				'belize.json',
				'canada.json',
				'costa_rica.json',
				'cuba.json',
				'dominica.json',
				'dominican_republic.json',
				'el_salvador.json',
				'grenada.json',
				'guatemala.json',
				'haiti.json',
				'honduras.json',
				'jamaica.json',
				'mexico.json',
				'nicaragua.json',
				'panama.json',
				'saint_kitts_and_nevis.json',
				'saint_lucia.json',
				'saint_vincent_and_the_grenadines.json',
				'trinidad_and_tobago.json',
				'usa.json'
			]
		},
		{
			name: 'South America (Continent)',
			code: 'CONT-SA',
			filenames: [
				'argentina.json',
				'bolivia.json',
				'brazil.json',
				'chile.json',
				'colombia.json',
				'ecuador.json',
				'guyana.json',
				'paraguay.json',
				'peru.json',
				'suriname.json',
				'uruguay.json',
				'venezuela.json'
			]
		},
		{
			name: 'Oceania (Continent)',
			code: 'CONT-OC',
			filenames: [
				'australia.json',
				'cook_islands.json',
				'fiji.json',
				'kiribati.json',
				'marshall_islands.json',
				'micronesia.json',
				'nauru.json',
				'new_zealand.json',
				'niue.json',
				'palau.json',
				'papua_new_guinea.json',
				'samoa.json',
				'solomon_islands.json',
				'tonga.json',
				'tuvalu.json',
				'vanuatu.json'
			]
		},
		{ name: 'Afghanistan', code: 'AF', filename: 'afghanistan.json' },
		{ name: 'Albania', code: 'AL', filename: 'albania.json' },
		{ name: 'Algeria', code: 'DZ', filename: 'algeria.json' },
		{ name: 'Andorra', code: 'AD', filename: 'andorra.json' },
		{ name: 'Angola', code: 'AO', filename: 'angola.json' },
		{ name: 'Antigua and Barbuda', code: 'AG', filename: 'antigua_and_barbuda.json' },
		{ name: 'Argentina', code: 'AR', filename: 'argentina.json' },
		{ name: 'Armenia', code: 'AM', filename: 'armenia.json' },
		{ name: 'Australia', code: 'AU', filename: 'australia.json' },
		{ name: 'Austria', code: 'AT', filename: 'austria.json' },
		{ name: 'Azerbaijan', code: 'AZ', filename: 'azerbaijan.json' },
		{ name: 'Bahamas', code: 'BS', filename: 'bahamas.json' },
		{ name: 'Bahrain', code: 'BH', filename: 'bahrain.json' },
		{ name: 'Bangladesh', code: 'BD', filename: 'bangladesh.json' },
		{ name: 'Barbados', code: 'BB', filename: 'barbados.json' },
		{ name: 'Belarus', code: 'BY', filename: 'belarus.json' },
		{ name: 'Belgium', code: 'BE', filename: 'belgium.json' },
		{ name: 'Belize', code: 'BZ', filename: 'belize.json' },
		{ name: 'Benin', code: 'BJ', filename: 'benin.json' },
		{ name: 'Bhutan', code: 'BT', filename: 'bhutan.json' },
		{ name: 'Bolivia', code: 'BO', filename: 'bolivia.json' },
		{ name: 'Bosnia and Herzegovina', code: 'BA', filename: 'bosnia_and_herzegovina.json' },
		{ name: 'Botswana', code: 'BW', filename: 'botswana.json' },
		{ name: 'Brazil', code: 'BR', filename: 'brazil.json' },
		{ name: 'Brunei', code: 'BN', filename: 'brunei.json' },
		{ name: 'Bulgaria', code: 'BG', filename: 'bulgaria.json' },
		{ name: 'Burkina Faso', code: 'BF', filename: 'burkina_faso.json' },
		{ name: 'Burundi', code: 'BI', filename: 'burundi.json' },
		{ name: 'Cambodia', code: 'KH', filename: 'cambodia.json' },
		{ name: 'Cameroon', code: 'CM', filename: 'cameroon.json' },
		{ name: 'Canada', code: 'CA', filename: 'canada.json' },
		{ name: 'Cape Verde', code: 'CV', filename: 'cape_verde.json' },
		{ name: 'Central African Republic', code: 'CF', filename: 'central_african_republic.json' },
		{ name: 'Chad', code: 'TD', filename: 'chad.json' },
		{ name: 'Chile', code: 'CL', filename: 'chile.json' },
		{ name: 'China', code: 'CN', filename: 'china.json' },
		{ name: 'Colombia', code: 'CO', filename: 'colombia.json' },
		{ name: 'Comoros', code: 'KM', filename: 'comoros.json' },
		{ name: 'Congo', code: 'CG', filename: 'congo.json' },
		{ name: 'Cook Islands', code: 'CK', filename: 'cook_islands.json' },
		{ name: 'Costa Rica', code: 'CR', filename: 'costa_rica.json' },
		{ name: 'Croatia', code: 'HR', filename: 'croatia.json' },
		{ name: 'Cuba', code: 'CU', filename: 'cuba.json' },
		{ name: 'Cyprus', code: 'CY', filename: 'cyprus.json' },
		{ name: 'Czech Republic', code: 'CZ', filename: 'czechia.json' },
		{ name: 'Democratic Republic of the Congo', code: 'CD', filename: 'democratic_congo.json' },
		{ name: 'Denmark', code: 'DK', filename: 'denmark.json' },
		{ name: 'Djibouti', code: 'DJ', filename: 'djibouti.json' },
		{ name: 'Dominica', code: 'DM', filename: 'dominica.json' },
		{ name: 'Dominican Republic', code: 'DO', filename: 'dominican_republic.json' },
		{ name: 'East Timor', code: 'TL', filename: 'east_timor.json' },
		{ name: 'Ecuador', code: 'EC', filename: 'ecuador.json' },
		{ name: 'Egypt', code: 'EG', filename: 'egypt.json' },
		{ name: 'El Salvador', code: 'SV', filename: 'el_salvador.json' },
		{ name: 'Equatorial Guinea', code: 'GQ', filename: 'equatorial_guinea.json' },
		{ name: 'Eritrea', code: 'ER', filename: 'eritrea.json' },
		{ name: 'Estonia', code: 'EE', filename: 'estonia.json' },
		{ name: 'Eswatini', code: 'SZ', filename: 'eswatini.json' },
		{ name: 'Ethiopia', code: 'ET', filename: 'ethiopia.json' },
		{ name: 'Fiji', code: 'FJ', filename: 'fiji.json' },
		{ name: 'Finland', code: 'FI', filename: 'finland.json' },
		{ name: 'France', code: 'FR', filename: 'france.json' },
		{ name: 'Gabon', code: 'GA', filename: 'gabon.json' },
		{ name: 'Gambia', code: 'GM', filename: 'gambia.json' },
		{ name: 'Georgia', code: 'GE', filename: 'georgia.json' },
		{ name: 'Germany', code: 'DE', filename: 'germany.json' },
		{ name: 'Ghana', code: 'GH', filename: 'ghana.json' },
		{ name: 'Greece', code: 'GR', filename: 'greece.json' },
		{ name: 'Grenada', code: 'GD', filename: 'grenada.json' },
		{ name: 'Guatemala', code: 'GT', filename: 'guatemala.json' },
		{ name: 'Guinea', code: 'GN', filename: 'guinea.json' },
		{ name: 'Guinea-Bissau', code: 'GW', filename: 'guinea_bissau.json' },
		{ name: 'Guyana', code: 'GY', filename: 'guyana.json' },
		{ name: 'Haiti', code: 'HT', filename: 'haiti.json' },
		{ name: 'Honduras', code: 'HN', filename: 'honduras.json' },
		{ name: 'Hungary', code: 'HU', filename: 'hungary.json' },
		{ name: 'Iceland', code: 'IS', filename: 'iceland.json' },
		{ name: 'India', code: 'IN', filename: 'india.json' },
		{ name: 'Indonesia', code: 'ID', filename: 'indonesia.json' },
		{ name: 'Iran', code: 'IR', filename: 'iran.json' },
		{ name: 'Iraq', code: 'IQ', filename: 'iraq.json' },
		{ name: 'Ireland', code: 'IE', filename: 'ireland.json' },
		{ name: 'Israel', code: 'IL', filename: 'israel.json' },
		{ name: 'Italy', code: 'IT', filename: 'italy.json' },
		{ name: 'Ivory Coast', code: 'CI', filename: 'ivory_coast.json' },
		{ name: 'Jamaica', code: 'JM', filename: 'jamaica.json' },
		{ name: 'Japan', code: 'JP', filename: 'japan.json' },
		{ name: 'Jordan', code: 'JO', filename: 'jordan.json' },
		{ name: 'Kazakhstan', code: 'KZ', filename: 'kazakhstan.json' },
		{ name: 'Kenya', code: 'KE', filename: 'kenya.json' },
		{ name: 'Kiribati', code: 'KI', filename: 'kiribati.json' },
		{ name: 'Kuwait', code: 'KW', filename: 'kuwait.json' },
		{ name: 'Kyrgyzstan', code: 'KG', filename: 'kyrgyzstan.json' },
		{ name: 'Laos', code: 'LA', filename: 'laos.json' },
		{ name: 'Latvia', code: 'LV', filename: 'latvia.json' },
		{ name: 'Lebanon', code: 'LB', filename: 'lebanon.json' },
		{ name: 'Lesotho', code: 'LS', filename: 'lesotho.json' },
		{ name: 'Liberia', code: 'LR', filename: 'liberia.json' },
		{ name: 'Libya', code: 'LY', filename: 'libya.json' },
		{ name: 'Liechtenstein', code: 'LI', filename: 'liechtenstein.json' },
		{ name: 'Lithuania', code: 'LT', filename: 'lithuania.json' },
		{ name: 'Luxembourg', code: 'LU', filename: 'luxembourg.json' },
		{ name: 'Madagascar', code: 'MG', filename: 'madagascar.json' },
		{ name: 'Malawi', code: 'MW', filename: 'malawi.json' },
		{ name: 'Malaysia', code: 'MY', filename: 'malaysia.json' },
		{ name: 'Maldives', code: 'MV', filename: 'maldives.json' },
		{ name: 'Mali', code: 'ML', filename: 'mali.json' },
		{ name: 'Malta', code: 'MT', filename: 'malta.json' },
		{ name: 'Marshall Islands', code: 'MH', filename: 'marshall_islands.json' },
		{ name: 'Mauritania', code: 'MR', filename: 'mauritania.json' },
		{ name: 'Mauritius', code: 'MU', filename: 'mauritius.json' },
		{ name: 'Mexico', code: 'MX', filename: 'mexico.json' },
		{ name: 'Micronesia', code: 'FM', filename: 'micronesia.json' },
		{ name: 'Moldova', code: 'MD', filename: 'moldova.json' },
		{ name: 'Monaco', code: 'MC', filename: 'monaco.json' },
		{ name: 'Mongolia', code: 'MN', filename: 'mongolia.json' },
		{ name: 'Montenegro', code: 'ME', filename: 'montenegro.json' },
		{ name: 'Morocco', code: 'MA', filename: 'morocco.json' },
		{ name: 'Mozambique', code: 'MZ', filename: 'mozambique.json' },
		{ name: 'Myanmar', code: 'MM', filename: 'myanmar.json' },
		{ name: 'Namibia', code: 'NA', filename: 'namibia.json' },
		{ name: 'Nauru', code: 'NR', filename: 'nauru.json' },
		{ name: 'Nepal', code: 'NP', filename: 'nepal.json' },
		{ name: 'Netherlands', code: 'NL', filename: 'netherlands.json' },
		{ name: 'New Zealand', code: 'NZ', filename: 'new_zealand.json' },
		{ name: 'Nicaragua', code: 'NI', filename: 'nicaragua.json' },
		{ name: 'Niger', code: 'NE', filename: 'niger.json' },
		{ name: 'Nigeria', code: 'NG', filename: 'nigeria.json' },
		{ name: 'Niue', code: 'NU', filename: 'niue.json' },
		{ name: 'North Korea', code: 'KP', filename: 'north_korea.json' },
		{ name: 'North Macedonia', code: 'MK', filename: 'north_macedonia.json' },
		{ name: 'Norway', code: 'NO', filename: 'norway.json' },
		{ name: 'Oman', code: 'OM', filename: 'oman.json' },
		{ name: 'Pakistan', code: 'PK', filename: 'pakistan.json' },
		{ name: 'Palau', code: 'PW', filename: 'palau.json' },
		{ name: 'Palestine', code: 'PS', filename: 'palestine.json' },
		{ name: 'Panama', code: 'PA', filename: 'panama.json' },
		{ name: 'Papua New Guinea', code: 'PG', filename: 'papua_new_guinea.json' },
		{ name: 'Paraguay', code: 'PY', filename: 'paraguay.json' },
		{ name: 'Peru', code: 'PE', filename: 'peru.json' },
		{ name: 'Philippines', code: 'PH', filename: 'philippines.json' },
		{ name: 'Poland', code: 'PL', filename: 'poland.json' },
		{ name: 'Portugal', code: 'PT', filename: 'portugal.json' },
		{ name: 'Qatar', code: 'QA', filename: 'qatar.json' },
		{ name: 'Romania', code: 'RO', filename: 'romania.json' },
		{ name: 'Russia', code: 'RU', filename: 'russia.json' },
		{ name: 'Rwanda', code: 'RW', filename: 'rwanda.json' },
		{ name: 'Saint Kitts and Nevis', code: 'KN', filename: 'saint_kitts_and_nevis.json' },
		{ name: 'Saint Lucia', code: 'LC', filename: 'saint_lucia.json' },
		{
			name: 'Saint Vincent and the Grenadines',
			code: 'VC',
			filename: 'saint_vincent_and_the_grenadines.json'
		},
		{ name: 'Samoa', code: 'WS', filename: 'samoa.json' },
		{ name: 'San Marino', code: 'SM', filename: 'san_marino.json' },
		{ name: 'Sao Tome and Principe', code: 'ST', filename: 'sao_tome_and_principe.json' },
		{ name: 'Saudi Arabia', code: 'SA', filename: 'saudi_arabia.json' },
		{ name: 'Senegal', code: 'SN', filename: 'senegal.json' },
		{ name: 'Serbia', code: 'RS', filename: 'serbia.json' },
		{ name: 'Seychelles', code: 'SC', filename: 'seychelles.json' },
		{ name: 'Sierra Leone', code: 'SL', filename: 'sierra_leone.json' },
		{ name: 'Singapore', code: 'SG', filename: 'singapore.json' },
		{ name: 'Slovakia', code: 'SK', filename: 'slovakia.json' },
		{ name: 'Slovenia', code: 'SI', filename: 'slovenia.json' },
		{ name: 'Solomon Islands', code: 'SB', filename: 'solomon_islands.json' },
		{ name: 'Somalia', code: 'SO', filename: 'somalia.json' },
		{ name: 'South Africa', code: 'ZA', filename: 'south_africa.json' },
		{ name: 'South Korea', code: 'KR', filename: 'south_korea.json' },
		{ name: 'South Sudan', code: 'SS', filename: 'south_sudan.json' },
		{ name: 'Spain', code: 'ES', filename: 'spain.json' },
		{ name: 'Sri Lanka', code: 'LK', filename: 'sri_lanka.json' },
		{ name: 'Sudan', code: 'SD', filename: 'sudan.json' },
		{ name: 'Suriname', code: 'SR', filename: 'suriname.json' },
		{ name: 'Sweden', code: 'SE', filename: 'sweden.json' },
		{ name: 'Switzerland', code: 'CH', filename: 'switzerland.json' },
		{ name: 'Syria', code: 'SY', filename: 'syria.json' },
		{ name: 'Taiwan', code: 'TW', filename: 'taiwan.json' },
		{ name: 'Tajikistan', code: 'TJ', filename: 'tajikistan.json' },
		{ name: 'Tanzania', code: 'TZ', filename: 'tanzania.json' },
		{ name: 'Thailand', code: 'TH', filename: 'thailand.json' },
		{ name: 'Togo', code: 'TG', filename: 'togo.json' },
		{ name: 'Tonga', code: 'TO', filename: 'tonga.json' },
		{ name: 'Trinidad and Tobago', code: 'TT', filename: 'trinidad_and_tobago.json' },
		{ name: 'Tunisia', code: 'TN', filename: 'tunisia.json' },
		{ name: 'Turkey', code: 'TR', filename: 'turkey.json' },
		{ name: 'Turkmenistan', code: 'TM', filename: 'turkmenistan.json' },
		{ name: 'Tuvalu', code: 'TV', filename: 'tuvalu.json' },
		{ name: 'Uganda', code: 'UG', filename: 'uganda.json' },
		{ name: 'Ukraine', code: 'UA', filename: 'ukraine.json' },
		{ name: 'United Arab Emirates', code: 'AE', filename: 'united_arab_emirates.json' },
		{ name: 'United Kingdom', code: 'GB', filename: 'united_kingdom.json' },
		{ name: 'United States', code: 'US', filename: 'usa.json' },
		{ name: 'Uruguay', code: 'UY', filename: 'uruguay.json' },
		{ name: 'Uzbekistan', code: 'UZ', filename: 'uzbekistan.json' },
		{ name: 'Vanuatu', code: 'VU', filename: 'vanuatu.json' },
		{ name: 'Vatican', code: 'VA', filename: 'vatican.json' },
		{ name: 'Venezuela', code: 'VE', filename: 'venezuela.json' },
		{ name: 'Vietnam', code: 'VN', filename: 'vietnam.json' },
		{ name: 'Western Sahara', code: 'EH', filename: 'western_sahara.json' },
		{ name: 'Yemen', code: 'YE', filename: 'yemen.json' },
		{ name: 'Zambia', code: 'ZM', filename: 'zambia.json' },
		{ name: 'Zimbabwe', code: 'ZW', filename: 'zimbabwe.json' }
	];

	// Filter countries based on search input
	const filteredCountries = $derived.by(() => {
		const search = searchValue.toLowerCase();
		return countryList.filter(
			(country) =>
				country.name === 'None' ||
				country.name.toLowerCase().includes(search) ||
				country.code.toLowerCase().includes(search)
		);
	});

	// Get the selected country object
	const selectedCountryObj = $derived.by(() => {
		return countryList.find((c) => c.code === selectedCountry);
	});

	// Load GeoJSON for a specific country asynchronously
	async function loadCountryGeoJson(country: Country): Promise<Country> {
		if (country.name === 'None') {
			return country;
		}

		if (country.geojson) {
			return country; // Already loaded
		}

		const files =
			country.filenames && country.filenames.length > 0
				? country.filenames
				: country.filename
					? [country.filename]
					: [];

		if (files.length === 0) {
			return country;
		}

		try {
			loadingGeojson = true;
			const responses = await Promise.all(
				files.map((file) => fetch(`/world-geojson/countries/${file}`))
			);
			const geojsons = await Promise.all(responses.map((response) => response.json()));

			if (geojsons.length === 1) {
				country.geojson = geojsons[0];
				return country;
			}

			const features = geojsons.flatMap((collection) =>
				Array.isArray(collection?.features) ? collection.features : []
			);
			country.geojson = {
				type: 'FeatureCollection',
				features
			};
			return country;
		} catch (error) {
			console.error(`Failed to load GeoJSON for ${country.name}:`, error);
			return country;
		} finally {
			loadingGeojson = false;
		}
	}

	async function handleSelect(country: Country) {
		selectedCountry = country.code;
		open = false;

		// Load GeoJSON asynchronously
		const countryWithGeojson = await loadCountryGeoJson(country);
		onselect?.(countryWithGeojson);
		searchValue = '';
	}
</script>

<div class="w-48 absolute left-2.5 top-32 z-50">
	<Popover.Root bind:open>
		<Popover.Trigger>
			<Button
				variant="outline"
				role="combobox"
				aria-expanded={open}
				class="w-full bg-glass h-8 rounded-sm w-[180px] backdrop-blur-sm cursor-pointer border-none justify-between {$omProtocolSettings.clippingOptions
					? 'ring-2 ring-accent ring-foreground'
					: ''}"
			>
				<span class="truncate">
					Clip: {selectedCountryObj ? selectedCountryObj.name : 'Select country...'}
				</span>
				<ChevronsUpDownIcon class="-ml-2 h-4 w-4 shrink-0 opacity-50" />
			</Button>
		</Popover.Trigger>
		<Popover.Content
			class="w-full p-0 bg-glass! backdrop-blur-sm border-none shadow-lg mt-1 rounded-sm"
		>
			<Command.Root shouldFilter={false}>
				<div class="flex items-center gap-2 p-2 bg-transparent">
					<Command.Input placeholder="Search country..." bind:value={searchValue} class="flex-1" />
					<button
						onclick={() => (searchValue = '')}
						class="px-2 py-1 text-sm hover:bg-muted/80 rounded text-muted-foreground hover:text-foreground transition-colors"
					>
						Clear
					</button>
				</div>
				<Command.List>
					<Command.Empty>No country found.</Command.Empty>
					<Command.Group>
						{#each filteredCountries as country (country.code)}
							<Command.Item
								value={`${country.name} ${country.code}`}
								onSelect={() => handleSelect(country)}
								class="cursor-pointer"
							>
								<CheckIcon
									class={`mr-2 h-4 w-4 ${selectedCountry === country.code ? 'opacity-100' : 'opacity-0'}`}
								/>
								{country.name}
								<span class="ml-auto text-xs text-muted-foreground">{country.code}</span>
							</Command.Item>
						{/each}
					</Command.Group>
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
</div>
