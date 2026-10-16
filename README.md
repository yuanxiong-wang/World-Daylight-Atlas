# World Daylight Atlas

Explore sunlight around the world with an interactive 3D globe, a 2D daylight map, and local solar trajectory charts.

**Live app:** [mytest.ccwu.cc](https://mytest.ccwu.cc/)

## Features

- **3D Earth:** procedural terrain textures, night lights, clouds, atmosphere, the daylight terminator, and twilight boundaries.
- **City inspection:** choose a city from the dock or click the globe to inspect a location. Selecting a city centers the globe camera on it.
- **Sun trajectories:** inspect today's daylight and nighttime arcs, solar noon, sunrise, sunset, and the current Sun position.
- **Seasonal comparisons:** March and September equinoxes and June and December solstices share the same milestone names, colors, and dates across the dock, globe, and inspector.
- **Local solar charts:** compare altitude curves, daily peaks, daylight duration, twilight times, and annual noon altitude range.
- **Time simulation:** scrub the UTC timeline, change dates, adjust playback speed, or return to the present.
- **Shareable views:** copy a snapshot link with the location, UTC date/time, map mode, and layer settings. Shared views open paused, including custom observation points.
- **Annual daylight calendar:** inspect every day of a year, compare longest/shortest daylight duration, see polar day/night counts, and click a date to jump to it.
- **Compare cities:** compare two or three locations' clocks, solar altitude, sunrise/sunset, daylight duration, and 24-hour curves.
- **Ground-level sky:** look around an ideal horizon with compass directions, current Sun position, and daily/seasonal solar paths; drag, use arrow keys, or step through time.
- **Additional views:** global daylight analytics, lunar phases, and camera presets.

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

The current app runs in the browser and does not require API keys. The variables in `.env.example` are retained from the original scaffold and are not used by the current app.

## Controls

- Drag the globe to orbit and scroll to zoom.
- Select a city to center it, or click the Earth to inspect a custom observation point.
- Use **3D Sky Dome** to frame the selected location's solar trajectories.
- Click a trajectory apex's pick area to jump to its sampled solar noon.
- Open **Trajectory Chart** for local altitude curves and daylight comparisons.
- Use the dock to control time, layers, cities, lunar information, and camera presets.
- On desktop, use **Share view**, **Annual daylight**, **Compare cities**, and **Ground-level sky** in the toolbar below the header. On mobile, open **Tools** in the bottom navigation; the globe stays clear until a tool is opened. Select a location before opening its calendar or sky view. Mobile **Cities**, **Time**, and **Layers** open one bottom sheet at a time. Tap the selected city above the navigation for its details, then close the sheet to return to the globe.
- Calendar dates and comparison curves use UTC. City clocks use each location's time zone. Calendar years span 1900–2100.
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
    lunarCalculator.ts    Lunar phase calculations
    earthTextures.ts      Procedural globe textures
tests/                    Numerical regression checks
.github/workflows/        GitHub Pages build and deployment
```

Built with React, TypeScript, Vite, Three.js, and Tailwind CSS.

## Solar model

Dates and the timeline use UTC; city time readouts use the city's time zone. Seasonal milestones are fixed calendar benchmarks, not calculated astronomical event instants. Daily chart peaks are sampled from altitude curves. Annual noon altitude range includes tropical zenith crossings and is shared by the globe and inspector.


### Scroll-driven globe tour

Choose **Helix globe tour** from the desktop toolbar or **Tools** on mobile. Scroll or swipe to move the camera along a spiral around Earth, visiting Longyearbyen, London, Singapore, Sydney, and Ushuaia. Vortex rings build during travel and clear at each stop. Each stop explains its latitude’s daylight pattern and shows daylight hours and Sun altitude for the simulation date, which stays fixed during the tour.

Use **Previous stop**, **Next stop**, the progress slider, arrow/Page keys, or Home/End to navigate. **Exit tour** or Escape returns to your selected city. The tour replaces the regular controls while open; scrolling elsewhere in the app is unchanged. With your system’s reduced-motion preference enabled, it uses discrete city views without orbital spins or vortex effects.
