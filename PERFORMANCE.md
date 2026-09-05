# 4.7 battlefield refresh and performance investigation

The battlefield keeps the original hex silhouettes, faction and resource colors, letters, train badges, selection indicators, ranges, and warning effects. UI markup and styling are unchanged apart from the version. New artwork includes detailed locomotive and cargo bodies, organic combat units, machinery panels, crystalline deposits, layered forest canopies, rock strata, textured ground and water. Terrain has 30 deterministic tile appearances; variation does not change terrain generation or movement rules.

## What caused the hitches

- Camera movement beyond the overscan margin rebuilt the entire visible terrain and six static layers. A settled pan also rebuilt all these layers unnecessarily.
- Two permitted neutralizer searches per tick could each explore 20,000–60,000 cells when congestion blocked a target. Limiting search *count* did not limit frame cost. In the sustained battle benchmark, old simulation ticks regularly took over 100 ms.
- Creep navigation rebuilt its entire shared field synchronously after invalidation.
- Moving unit bodies rebuilt their geometry and requested a shadow blur each frame, including at exactly 100 units per faction.
- Unlimited simulation catch-up could compound one slow frame into another.

## Changes

- Reusable sprite images bake facets, small details and halos once. Letters and badges remain separate live overlays. Terrain uses a shared atlas, and rebuilds enumerate rectangular world bounds rather than a larger axial parallelogram.
- World-space terrain chunks survive camera movement and zooming, with multiple raster resolutions and a 96 MiB pixel budget. Idle preparation processes at most two chunks or about 2 ms per callback, prefetches the maximum-range overview, and caps pending work at 512 jobs. Uncached areas immediately draw their correct artwork; no terrain placeholders or blank cells are introduced. Mixed views draw only missing sections directly.
- A covering cache remains valid when panning stops. Zoom settling still refreshes sharpness. Seed and terrain revision changes invalidate cached content even during a gesture.
- Neutralizers share a 256-cell expansion budget per simulation tick. Long searches resume later, retain complete routes, and check occupancy before movement. Fully blocked attack perimeters are rejected early. The existing rotating unit priority and two-search limit remain.
- Creep navigation grows its shared field in 128-cell batches. Nearby units can use it while distant regions are prepared.
- Browser frames run at most four catch-up ticks, retaining the remaining time for later frames. Explicit simulation advancement remains unrestricted by default.

## Initial controlled browser measurements

Measured in local headless Microsoft Edge at a 1920 × 1080 CSS viewport, first at device pixel ratio 1, then 2. Each scenario contains 180 animation frames with 100 Creeps and 100 Neutralizers on traversable terrain. Higher hit points keep all 200 combatants alive for sustained combat. The test asserts that the simulation never pauses and the unit counts remain intact. Frame intervals include browser presentation scheduling; render timings measure Canvas2D submission, not GPU completion in isolation.

| Scenario | 4.6.5 median frame | 4.7 median frame | 4.7 p95 frame | 4.7 p95 frame, DPR 2 |
| --- | ---: | ---: | ---: | ---: |
| Stationary battle | 100.2 ms | 16.7 ms | 16.8 ms | 16.8 ms |
| Max-range pan across cache boundaries | 116.7 ms | 16.7 ms | 16.9 ms | 16.8 ms |
| Rapid zoom between 0.42× and 2.15× | 100.1 ms | 16.7 ms | 16.9 ms | 16.8 ms |
| Jump to unseen terrain, then pan | 83.3 ms | 16.7 ms | 16.8 ms | 16.8 ms |

At DPR 1, max-range pan render submission peaked at 20.3 ms, down from 40.7 ms. Rapid zoom submission peaked at 3.0 ms. Simulation p95 stayed at or below 1.6 ms in the refreshed run. DPR 2 pan submission peaked at 16.5 ms.

These runs support roughly 60 FPS in the tested battle and camera scenarios, not a universal locked-60 guarantee. Each refreshed run had one startup/presentation outlier (167–184 ms) and one pan frame around 33 ms. Cold terrain submission can still exceed a frame budget (23.9 ms observed). Results vary with viewport, browser, GPU, map, and other applications. Production uses browser idle callbacks; the controlled benchmark invokes the same bounded chunk preparation between sampled frames. Death effects and larger or more complex worlds are covered by functional tests, not an exhaustive performance matrix.

## Follow-up to the reported terrain regression

The user reported a regression after the additional terrain variations and shoreline pass. Those additions have been reduced: the atlas is back to 30 appearances, the shoreline pass is removed, and source tiles are released after packing instead of retaining duplicate pixels. The detailed trains, units, buildings, and core terrain refresh remain.

The six static world layers now allocate tightly cropped textures around their actual content, at the original pixel density. Empty layers use one pixel and are not composited. Their separate camera-coverage metadata preserves pan reuse without clipping buildings or labels. This avoids retaining six full-screen transparent images for a small or sparse base. Overview chunks use half-resolution terrain textures so a large high-DPI overview can stay resident within the cache budget; icon and label resolution is unchanged.

The regression check also runs the normal animation loop, simulation catch-up, and native idle callbacks at 2560 × 1440 CSS pixels and DPR 2, with the same sustained 200-unit battle. After two seconds of startup warmup, an extended 240-frame live run measured 16.7 ms median frames throughout: pan p95 16.8 ms / max 33.4 ms, rapid zoom p95 17.0 ms / max 17.3 ms, and a jump into unseen terrain p95 16.8 ms / max 66.6 ms. Cold terrain still has an occasional hitch; the earlier controlled-loop numbers should not be interpreted as a promise that every live frame meets 16.7 ms.

## Reproduce

Run `npm test` for the 267 functional and rendering tests. New regressions cover resumable path equivalence, expansion budgets, incremental navigation convergence, retained simulation time, cached unit draws, terrain work and memory limits, and content invalidation during zoom.

The browser tools require Playwright and installed Microsoft Edge. Set `PLAYWRIGHT_MODULE` to an existing Playwright module directory when it is not installed locally, then run `npm run benchmark -- my-run`. Set `BENCH_DPR=2` for high DPI or `BENCH_ROOT` to a separate checkout for a baseline. Set `BENCH_LIVE=1` to retain the real game loop and idle scheduling; `BENCH_WIDTH` and `BENCH_HEIGHT` control the viewport. Live mode includes a two-second warmup and measures frame intervals rather than attributing submission time to the controlled loop. `node tools/battlefield-preview.cjs` produces close-up and overview screenshots. Outputs go to the ignored `artifacts/` directory.
