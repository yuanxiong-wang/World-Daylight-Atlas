# World Daylight Atlas

Explore sunlight around the world with an interactive 3D globe, a 2D daylight map, and local solar trajectory charts.

**Live app:** [mytest.ccwu.cc](https://mytest.ccwu.cc/)

## Features

- **3D Earth:** procedural terrain textures, night lights, clouds, atmosphere, the daylight terminator, and twilight boundaries.
- **City inspection:** search cities worldwide with Open-Meteo geocoding, choose from 45 built-in cities offline, or click the globe to inspect a location. Selecting a city centers the globe camera on it.
- **Sun trajectories:** inspect today's daylight and nighttime arcs, solar noon, sunrise, sunset, and the current Sun position.
- **Seasonal comparisons:** March and September equinoxes and June and December solstices share the same milestone names, colors, and dates across the dock, globe, and inspector.
- **Photography light:** golden-hour (−4° to +6° geometric Sun altitude) and blue-hour (−6° to −4°) windows, with the current simulation phase and city-local clock readouts.
- **Local solar charts:** compare altitude curves, daily peaks, daylight duration, twilight times, and annual noon altitude range.
- **UTC and local clocks:** the header and city comparison show the simulation instant in your device’s time zone beneath UTC, with matching typography and the UTC offset. Each comparison card also shows that city’s clock and date.
- **Helix globe tour:** an optional scroll/swipe camera tour with vortex transitions and five latitude stops; normal atlas gestures stay unchanged.
- **Time simulation:** scrub the UTC timeline, change dates, adjust playback speed, or return to the present.
- **Shareable views:** copy a snapshot link with the location, UTC date/time, map mode, and layer settings. Shared views open paused, including custom observation points.
- **Annual daylight calendar:** inspect every day of a year, compare longest/shortest daylight duration, see polar day/night counts, and click a date to jump to it.
- **Compare cities:** compare two or three locations' clocks, solar altitude, sunrise/sunset, daylight duration, and 24-hour curves.
- **Ground-level sky:** look around an ideal horizon with compass directions, current Sun position, and daily/seasonal solar paths; drag, use arrow keys, or step through time.
- **Additional views:** global daylight analytics, lunar phases, and camera presets.

Seattle, Dallas, Charlotte, Toronto, and New York City are included. Longyearbyen, Beijing, Hong Kong, and New Delhi are no longer in the built-in list. Existing shared links can still restore custom coordinates.

The globe's seasonal-path toggle and the inspector's seasonal-curve toggle work independently.

## Run locally

Use **Node.js 24** and npm, matching the deployment workflow.

```bash
git clone https://github.com/yuanxiong-wang/World-Daylight-Atlas.git
cd World-Daylight-Atlas
npm install --no-package-lock
npm run dev
```

Open [localhost:3000](http://localhost:3000).

The current app runs in the browser and does not require API keys. Worldwide search requires an Internet connection to Open-Meteo; built-in and already-selected session cities remain available without that request. The variables in `.env.example` are retained from the original scaffold and are not used by the current app.

## Controls

- Drag the globe to orbit and scroll to zoom.
- Select a city to center it, or click the Earth to inspect a custom observation point. In **Cities**, type at least two characters to search worldwide; results show region/country to distinguish matching names. Desktop selection closes the dock; mobile selection closes the sheet. Newly selected cities stay in the current session and work with sharing, calendars, charts, ground sky, and comparisons. In **Compare cities**, each card also has **Search worldwide** to replace that city directly.
- Use **3D Sky Dome** to frame the selected location's solar trajectories.
- Click a trajectory apex's pick area to jump to its sampled solar noon. Seasonal milestone buttons jump to the computed equinox/solstice instant in UTC; the date labels change with the year.
- Open **Trajectory Chart** for local altitude curves and daylight comparisons.
- Use the dock to control time, layers, cities, lunar information, and camera presets.
- On desktop, use **Share view**, **Annual daylight**, **Compare cities**, and **Ground-level sky** in the toolbar below the header. On mobile, open **Tools** in the bottom navigation; the globe stays clear until a tool is opened. Select a location before opening its calendar or sky view. Mobile **Cities**, **Time**, and **Layers** open one bottom sheet at a time. Tap the selected city above the navigation for its details, then close the sheet to return to the globe.
- Calendar dates and comparison curves use UTC. **Local** beneath UTC always means the viewer’s device time zone and follows the simulation instant. City clocks use each location's time zone. Calendar years span 1900–2100.
- In the ground-level sky, drag or use arrow keys to look around. **Face the Sun** recenters the view; hour/day buttons change the simulation time. Its seasonal overlay is independent of the globe and inspector overlays.
- Shared links contain selected coordinates in the URL fragment. Share them with people you want to see that location. Camera orientation and open dialogs are not included.

| Shortcut | Action |
| --- | --- |
| Space | Play or pause the simulation |
| M | Switch between the globe and 2D map |
| R | Reset to the current time |
| A | Toggle global analytics |

Shortcuts are ignored while typing in an input or text area.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite on port 3000 |
| `npm test` | Run numerical regression tests |
| `npm run lint` | Run TypeScript checks without emitting files |
| `npm run build` | Build production assets into `dist/` |
| `npm run test:e2e` | Run Playwright browser checks against the production build |
| `npm run preview` | Preview the production build locally |

Before publishing changes, run:

```bash
npm test
npm run lint
npm run build
```

For browser checks, install Chromium once, then test the production build:

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

## Deployment

### GitHub Pages — current hosting

[The Pages workflow](.github/workflows/deploy-pages.yml) runs on pushes to `main` and supports manual execution. It installs dependencies, runs regression tests and type checks, builds with Vite, runs browser checks, copies `CNAME` into `dist/`, and deploys the compiled output.

In **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**. Publishing the repository directly with Jekyll serves uncompiled TypeScript and can result in a blank page.

The custom domain is recorded in [CNAME](CNAME). Domain DNS and HTTPS are configured through GitHub Pages and the DNS provider.

### Cloudflare Workers — optional alternative

[wrangler.jsonc](wrangler.jsonc) provides a static-assets Workers configuration. It builds the app and serves `dist/`.

For your own deployment, update the Cloudflare account, Worker name, and custom domain in that file, authenticate Wrangler, then run:

```bash
npx wrangler@4 deploy
```

The current live site uses GitHub Pages; the Workers configuration is an alternative deployment path.

## Project structure

```text
src/
  App.tsx                 Application state and interactions
  components/             Globe, map, dock, inspector, and analytics
  data/cities.ts          Built-in city coordinates and time zones
  types/                  Shared TypeScript models
  utils/
    solarCalculator.ts    Solar calculations and shared milestones
    geocoding.ts          Validated Open-Meteo search results
    photography.ts        Local-date golden/blue-hour windows
    lunarCalculator.ts    Ephemeris phase, illumination, and lunar event searches
    visibleFrameLoop.ts   Visibility-aware render scheduling
    earthTextures.ts      Procedural globe textures
tests/                    Numerical regression checks
.github/workflows/        GitHub Pages build and deployment
```

Built with React, TypeScript, Vite, Three.js, Tailwind CSS, and pinned Astronomy Engine 2.1.19.

## Astronomy model and validation

Dates and the timeline use UTC; city clocks use the city’s time zone and the **Local** clock uses the viewer’s device time zone. All clocks represent the same simulation instant.

Equinoxes and solstices are calculated for each year with [Astronomy Engine](https://github.com/cosinekitty/astronomy), rather than fixed calendar dates. The dock, mobile time sheet, globe, inspector, and ground-level sky use that shared list. Event buttons jump to the exact computed instant; solar-path apex picks still jump to sampled solar noon on that event’s UTC date. Daily chart peaks are sampled altitude maxima. Annual noon altitude range includes tropical zenith crossings and is shared by the globe and inspector.

Solar positions use the existing NOAA/Meeus-style equations. Daily rise/set and twilight calculations use the UTC date at noon, independent of the simulation clock, and preserve fractional minutes. Rise/set assumes an ideal sea-level horizon and a solar-center altitude of −0.8333° (standard refraction plus solar radius). Terrain, observer height, weather, and variable refraction are not modeled. Solar altitude readouts are geometric, without atmospheric refraction.

Lunar elongation and illumination now use Astronomy Engine’s ephemeris. Next new/full Moon times are searched astronomical events; age is elapsed time since the previous searched new Moon. Event timestamps are not calculated from rounded day counts. The displayed age/countdowns are rounded to 0.1 day, elongation to 0.1°, and illumination to 0.1 percentage point.

`tests/astronomy-reference.test.mjs` checks independent published event fixtures and compares the separate solar model with Astronomy Engine:

| Quantity | Test tolerance | Reference and coverage |
| --- | --- | --- |
| Equinox/solstice instant | 2 minutes | Eight published UTC events in 2024–2025; USNO season tables. All 201 years from 1900–2100 also checked for ordered, valid events. |
| Geometric solar altitude | 0.05° | Astronomy Engine topocentric Sun coordinates, without refraction; 480 positions. |
| Solar azimuth | 0.1° | Same positions, excluding within 5° of zenith/nadir, where azimuth is poorly defined. |
| Sunrise/sunset | 3 minutes | Astronomy Engine sea-level rise/set search; 220 nonpolar events plus polar no-event cases. |
| New/full Moon instant | 2 minutes | Seven published NASA phase events in 2000, 2024, and 2025. |
| Lunar illumination at those events | 0.2 percentage point | Near 0% at published new Moons and 100% at published full Moons. |

The solar matrix covers London, Shanghai, Sydney, Seattle, Singapore, and Tromsø; years 1900, 2000, 2024, 2026, and 2100; March 20, June 21, September 22, and December 21; and 00:00, 06:00, 12:00, and 18:00 UTC. Observed maxima on that matrix: altitude **0.0143°**, azimuth **0.0169°**, and rise/set **1.430 minutes**. The published lunar fixture maximum is **1.038 minutes**. Tests print these maxima so future changes can be audited.

These are tested tolerances for the listed samples, not a global accuracy guarantee. Near polar day/night transitions, atmospheric and horizon assumptions can dominate event timing. Twilight times, all intermediate lunar phases, and every day in the calendar have not received independent numerical accuracy bounds.

Sources: [USNO Earth seasons](https://aa.usno.navy.mil/data/Earth_Seasons), [NASA phases 2001–2100](https://eclipse.gsfc.nasa.gov/phase/phase2001gmt.html), and [NASA phases 1901–2000](https://eclipse.gsfc.nasa.gov/phase/phase1901gmt.html).

## Worldwide city search and photography light

Worldwide city searches use the public [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api), backed by [GeoNames](https://www.geonames.org/). Attribution links appear in every search picker. Typed queries (up to 100 characters) are sent directly from the browser to Open-Meteo after a 400 ms debounce, with a minimum of two characters. Requests omit credentials, cancel when the query changes or the picker unmounts, and time out after eight seconds. Successful queries have a bounded in-memory cache. No account or API key is needed for the public endpoint. Rate limits, network failures, retries, and empty results have explicit messages; saved-city search remains available. Results validate coordinates and the IANA time zone before selection.

The app keeps up to 100 additionally selected locations in memory for the current session. They are not persisted to browser storage. Comparison-only search results stay in that comparison until selected with **View on globe**. Shared links retain the chosen coordinates and time zone. Neither the catalog nor the geocoder guarantees every settlement is indexed; try another spelling or a nearby city if no match is returned.

**Photography light** appears in the desktop location card, mobile city details, trajectory inspector, and each comparison card. It uses these explicit definitions, which can differ from other photography apps:

- **Golden hour:** geometric solar-center altitude from −4° through +6°.
- **Blue hour:** geometric solar-center altitude from −6° through −4°.

The date is the selected location’s local date, with time-zone and daylight-saving rules applied. Windows span the solar day centered on that date’s local solar noon, so they may continue across civil midnight. Clock readouts use the city’s time zone; a month/day prefix marks an endpoint on a different local date. A dagger (†) marks a window clipped at the solar-day boundary. Polar locations can have no windows or long continuous windows; these are not forced into invented morning/evening events. The current simulation altitude also identifies whether golden or blue hour is active.

The implementation scans solar altitude every five minutes and refines detected threshold crossings by bisection. Tests check normal northern/southern windows, threshold altitudes, polar continuous/absent light, DST, and date-line zones. Very brief tangent windows near polar transitions can fall between samples. These photography windows have no independent event-time accuracy guarantee; clouds, terrain, atmospheric refraction, and local obstructions affect observed light.

## Rendering and motion

- Globe and ground-sky canvas pixel ratios are capped at **2**; automated headless WebGL checks use 1.
- The globe render loop stops when the document is hidden, its viewport is offscreen/hidden, or a planner/inspector dialog covers it. It resumes with a fresh frame clock and cleans up observers/listeners on unmount. Switching to the 2D map unmounts the globe renderer.
- Playback schedules no animation loop when paused. Hidden tabs suspend playback and resume without catching up hidden elapsed time; live-clock updates also skip hidden tabs.
- The system’s **prefers-reduced-motion** setting disables globe auto-rotation, orbital damping, cloud drift, and tour spins/vortex effects. Automatic rotation is unavailable in the mobile layer controls while this preference is active. Explicitly starting playback advances simulation time once per second instead of continuously animating it. Changing the motion preference pauses playback.

### Scroll-driven globe tour

Choose **Helix globe tour** from the desktop toolbar or **Tools** on mobile. Scroll or swipe to move the camera along a spiral around Earth, visiting Tromsø, London, Singapore, Sydney, and Ushuaia. Vortex rings build during travel and clear at each stop. Each stop explains its latitude’s daylight pattern and shows daylight hours and Sun altitude for the simulation date, which stays fixed during the tour.

Use **Previous stop**, **Next stop**, the progress slider, arrow/Page keys, or Home/End to navigate. **Exit tour** or Escape returns to your selected city. The tour replaces the regular controls while open; scrolling elsewhere in the app is unchanged. With your system’s reduced-motion preference enabled, it uses discrete city views without orbital spins or vortex effects.
