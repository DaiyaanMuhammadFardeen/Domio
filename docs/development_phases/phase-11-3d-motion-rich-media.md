# Phase 11 — 3D, Motion & Rich Media

> **Phase:** 11 of 22
> **Name:** 3D, Motion & Rich Media
> **Stream:** C (Interactive media) — runs in parallel with Phase 10 (Prototyping & Interactivity), Phase 06/07 (Ecosystem), Phase 08/09 (Data & Motion), Phase 12/13 (AI & Agents)
> **Critical path?** No — runs as a **deepening** track once Phase 05 lands. The 3D engine, video pipeline, and embed-policy machinery become shared infrastructure consumed by Phases 14, 15, 16, and 21.
> **Owner:** Stream C tech lead + 4–6 engineers (frontend WebGL/WebGPU + workers for CAD/video transcoding)
> **Status:** Not started (phase doc only)

**Intent.** Make Domio the "impossible in PowerPoint" layer — native 3D embedding with a scene editor and camera keyframes (#65–#67), 3D data visualizations (#68), exploded views (#69), a CAD import pipeline (#70), physics-enabled elements (#71), particle and shader systems (#72), scroll-driven 3D storytelling (#73), AR handoff via QR (#74), in-editor video editing with captions and chaptering (#75), segmented video playback (#76), background video with smart text-contrast protection (#77), audio tracks and mixing (#78), Lottie/Rive runtime (#79), in-editor screen recording (#80), sandboxed live-app embedding (#81), runnable code blocks (#82), LaTeX rendering (#83), and interactive maps (#84). Every feature must be GPU-performant (60 fps hero / 30 fps standard on a mid-tier laptop), CDN-served, and licensed-tracked; every external surface (live app, code sandbox, map provider, AR viewer) must be capability-limited behind per-org policies.

---

## 1. Goals

1. **Native 3D in the editor.** A `.glb` / `.gltf` / `.usdz` drop renders into a WebGL2 (default) / WebGPU (when available) viewport with orbit / pan / zoom, lighting, environment maps, materials, and per-slide camera keyframes (#65–#67). The viewport is a first-class canvas element using the same selection / alignment / constraints system as every other element.
2. **CAD-to-web-3D in minutes, not hours.** A `.step` / `.iges` / `.fbx` file is tessellated, decimated, and converted to glTF 2.0 binary on a worker pool with progress streaming; the resulting GLB is CDN-served, license-tagged, and decimated to a configurable polygon budget (#70).
3. **Physics, particles, shaders, scroll-driven 3D.** Authoring surfaces for rigid-body physics, GPU particle systems, custom WGSL/GLSL shaders, and scroll-driven camera keyframes — all with deterministic fixed-step integration, reduced-motion defaults, and brand-token integration (#71–#73).
4. **AR handoff that actually works.** A QR in the audience view hands the presenter over to a WebXR session (Android) or AR Quick Look (iOS) with a 30-minute expiring token, lighting estimate, and graceful fallback to a 3D web viewer (#74).
5. **Rich media that respects the canvas.** In-editor video editing (trim, cut, captions, chaptering, speed), segmented video playback, smart text-contrast protection on background video, multi-track audio mixing with Web Audio API, Lottie/Rive with state machines, screen recording via `getDisplayMedia` (#75–#80).
6. **Sandboxes, math, and maps.** Live-app embedding (#81) with iframe sandbox + JWT passthrough + origin allowlist; sandboxed runnable JS via Web Worker + QuickJS (#82); LaTeX via edge-rendered KaTeX (#83); interactive maps via Mapbox/Google/MapLibre adapters (#84). All run with capability-limited defaults, per-org policies, and audit trails.

---

## 2. Scope

**Feature numbers in scope (per `feature-list.md`):**

| Feature | Name | Notes |
|---|---|---|
| #65 | Native 3D model embedding (glTF/GLB/USDZ) | Drop, orbit, pan, zoom; IBL; LOD; CDN cache |
| #66 | 3D scene editor | Lights, cameras, materials, environment maps; non-modal side panel |
| #67 | Camera keyframes between slides | 7-DOF keyframes; cubic bezier easing; magic-move fallback |
| #68 | 3D data visualizations | Globe plots, 3D bars, point clouds, network graphs |
| #69 | Exploded-view animations | Per-part centroid axes; 0.6 s ease-out cubic default |
| #70 | CAD file import (STEP/IGES/FBX → glTF) | Server-side conversion pipeline; tessellation/decimation params |
| #71 | Physics-enabled elements | rapier WASM primary; ammo fallback; fixed-step 1/60s |
| #72 | Particle systems and shader backgrounds | GPU compute; WGSL/GLSL; brand-tinted presets |
| #73 | Scroll/click-driven 3D storytelling | Camera keyframes triggered by scroll or click |
| #74 | AR handoff (QR viewer) | WebXR (Android) + AR Quick Look (iOS); 30-min tokens |
| #75 | Video with in-editor trimming, captions, chaptering | Metadata-only trims; WebVTT captions; chapters |
| #76 | Video segments per click | First-class segments on the timeline |
| #77 | Background video with smart text-contrast protection | Per-region contrast map every N frames |
| #78 | Audio tracks, voiceover, ambient | Web Audio mixer; per-track volume/pan/fade |
| #79 | Lottie/Rive with state machines | lottie-web + @rive-app/canvas; variable scrub |
| #80 | Screen-recording capture | `getDisplayMedia`; VP9 WebM or H.264 MP4 |
| #81 | Live app embedding (sandboxed iframe) | Per-org allowlist; auth passthrough; CSP `frame-ancestors` |
| #82 | Code blocks with syntax highlighting + runnable JS | Shiki highlighter; Web Worker + QuickJS sandbox |
| #83 | Math/LaTeX rendering | Edge-rendered KaTeX; 30-day CDN cache |
| #84 | Interactive maps | Mapbox/Google/MapLibre adapters; live data refresh |

**Out of scope (deferred):**

- **Animation timeline authoring** (#85–#95) — Phase 9. This phase ships runtime consumption of timelines (camera keyframes ride the timeline; particles/shaders are timeline-bound) but timeline authoring UI is Phase 9.
- **Prototyping runtime** (#96–#107) — Phase 10. AR handoff (#74) and live-app embedding (#81) tokens may be deep-linked; the deep-link codec itself ships in Phase 10.
- **AI-generated 3D / shaders / LaTeX** (#108, #114) — Phase 12. AI can read/write the JSON Schemas emitted here.
- **MCP server core** (#221) — Phase 13, but every asset + scene + keyframe here must expose at least one MCP tool.
- **Sharing/publishing transport** (#155, #162, #163, #164) — Phase 14. This phase ships the render side; the export side is Phase 14 with the headless renderer (F204).
- **Analytics OLAP / dashboards** (#169–#178) — Phase 17. AR sessions and embed proxy emit metrics here; dashboards in Phase 17.
- **Presenter view** (#126–#141) — Phase 15. Annotations on 3D (#65 acceptance) are Phase 15.
- **Audience participation** (#142–#154) — Phase 16. Maps (#84) may subscribe to live data from Phase 08, but audience-driven map interactions are Phase 16.
- **AR session record / replay** (#205) — Phase 21. AR session metadata is captured here; full presentation state timeline is Phase 21.
- **Voice/gesture-triggered 3D** (#209, #211, #214) — Phase 21. Trigger surface is exposed here.
- **Two-way slides** (#211) — Phase 21.
- **Gaze-guided highlighting** (#207) — Phase 21.
- **Map provider cost optimization** beyond quota fallbacks — Phase 19 marketplace license tokens.

---

## 3. Dependencies

**Upstream (must be complete):**

- **Phase 02 — Deck schema & scene-graph foundation.** 3D viewports, scenes, materials, and camera keyframes hang off the `(deck_id, slide_id, element_id)` triple. `element_role` is the binding key for variable-driven 3D (Phase 10 #100).
- **Phase 03 — Canvas editor MVP.** The 3D viewport is a first-class canvas element with the same selection / alignment / constraints system. Scene-editor UI docks to the canvas.
- **Phase 04 — CRDT.** Multiplayer presence in the scene editor ("Sarah is editing `scene.lights[2].position`") rides the CRDT awareness channel. Material edits are CRDT-merged.
- **Phase 05 — Persistence, versioning, branches.** `model_asset`, `scene`, `camera_keyframe`, `shader`, `video_asset`, `audio_track`, `lottie_asset`, `code_sandbox_policy`, `embed_policy`, `map_style`, `license` rows are branch-scoped. Slide reordering (#129) invalidates affected `camera_keyframe` paths.

**Cross-stream (parallel, must coexist):**

- **Phase 06 — Components.** 3D models, videos, Lottie animations can be components (#26) with instance overrides. Brand-locked components lock the model asset reference.
- **Phase 07 — Theming.** Shader inputs auto-bind to theme tokens (`color.brand.primary`); background video contrast map is theme-aware; code-block syntax highlighting honors theme palette.
- **Phase 08 — Live Data & Charts.** 3D data viz (#68) subscribes to the same data source bindings; map markers (#84) refresh on data change; chart inside calculator (Phase 10 #102) reuses this phase's chart vocabulary.
- **Phase 09 — Animation & Transitions.** Camera keyframes (#67) ride the animation timeline; particle systems (#72) and shader backgrounds are timeline-bound; `on_click` / `on_hover` / `on_data_change` / `on_timer` triggers from #88 fire on 3D elements.
- **Phase 10 — Prototyping.** AR handoff tokens reuse the deep-link codec (#107); live-app embedding (#81) iframe sandbox is reused by device frames (#103); code sandbox (#82) shares safety primitives with the calculator sandbox (#102).

**Downstream (this phase unblocks):**

- **Phase 14 — Sharing & Publishing.** Shared web deck renders 3D scenes (#65); AR via QR (#74); embeds via Notion (#162); video export (#163); PDF/PPTX export with interactive deep links (#164).
- **Phase 15 — Presenter Experience.** Presenter view shows 3D with live annotations (#128); AR handoff (#74) is shown in the presenter view; live-app embed (#81) is interactive in presenter mode.
- **Phase 16 — Audience Participation.** Audience-driven navigation (#148) may insert a 3D slide; live polls can drive 3D data viz scenarios.
- **Phase 17 — Analytics.** AR session counts, embed proxy RPS, model load p95, video transcode seconds — all surface in analytics.
- **Phase 20 — Security & Enterprise.** Audit log entries for every embed policy change and code sandbox run; DLP can flag decks with unapproved embed origins.
- **Phase 21 — Novel & Frontier.** Two-way slides (#211), voice-triggered states (#209), AI meeting listener (#214) all consume the trigger surface here.
- **Phase 22 — Polish.** Performance pass; visual regression baselines for every preset 3D scene.

---

## 4. Workstreams

The phase splits into nine ordered workstreams. **M1** is the GPU/render foundation; **M2** ships asset upload + CDN; **M3** ships the scene editor + camera keyframes + exploded views + data viz; **M4** ships the CAD pipeline + physics; **M5** ships particles/shaders/AR; **M6** ships the video pipeline; **M7** ships audio + Lottie + screen recording; **M8** ships embeds (live app + code + LaTeX + maps); **M9** ships the MCP agent surface.

### M1 — 3D Engine Module + WebGL2 / WebGPU Abstraction

#### M1.1 — Renderer abstraction + Three.js primary + Babylon fallback

- **Files / packages touched:**
  - `packages/3d-engine/src/renderer/{WebGL2Renderer,WebGPURenderer,RendererFactory}.ts` — feature-detect; fall back on context loss.
  - `packages/3d-engine/src/renderer/types.ts` — `RenderPlan`, `DrawCallBudget`, `LODSelection`.
  - `apps/editor/src/canvas/three/{SceneRoot,ViewportFrame}.tsx` — 3D viewport as a first-class canvas element.
  - `apps/web-viewer/src/canvas/three/{SceneRoot,ViewportFrame}.tsx` — same contract; reused in presenter and share views.
- **Contracts produced:**
  - `packages/3d-engine/src/contracts/renderer.v1.ts` — typed contract consumed by every downstream 3D feature.
- **Tests written:**
  - Unit: feature-detect chooses WebGPU when `navigator.gpu` available; falls back on context loss.
  - Unit: a 1.5M-triangle hero model renders ≥ 60 fps on the CI reference machine (Intel Iris Xe).
  - Unit: USDZ is auto-selected on Safari/iOS, GLB elsewhere.
- **DoD:** Hero scene (1.5M tris, 4 lights, 1 camera path, 1 particle system ≤ 250k particles) at 60 fps; standard scene (250k tris, 2 lights) at 60 fps; background scene (50k tris, 1 light) at 60 fps.

#### M1.2 — Asset loader + glTF 2.0 parser + texture streaming

- **Files / packages touched:**
  - `packages/3d-engine/src/loaders/{GLTFLoader,USDZLoader,TextureStreamer}.ts`
  - `packages/3d-engine/src/cache/ModelAssetCache.ts` — hot cache by `model_asset.id`; CDN URL reuse.
  - `apps/editor/src/canvas/three/ViewportDropHandler.ts` — drag-and-drop detect by MIME.
- **Tests written:**
  - Unit: invalid GLB renders placeholder card; does not crash slide.
  - Unit: 4.2M tris auto-decimated to 1.5M with confirmation toast.
  - Unit: missing textures → checkerboard + console warn.
- **DoD:** AC-65 acceptance; `model_asset.load_p50_ms` ≤ 800 ms in-region; `load_p95_ms` ≤ 2 s.

#### M1.3 — Coordinate systems + IBL + color management

- **Files / packages touched:**
  - `packages/3d-engine/src/coords/{UpAxis,UnitScale}.ts` — Y-up default; Z-up auto-rotate via `up_axis` hint.
  - `packages/3d-engine/src/color/{LinearToSRGB,LosslessToggle}.ts`
  - `packages/3d-engine/src/env/{EnvMapRegistry,IBLConfig}.ts`
- **Tests written:**
  - Unit: Y-up vs Z-up auto-rotation; manual override flag.
  - Unit: linear-space lighting with sRGB output; `lossless` toggle preserves colors.
- **DoD:** Product-color-accurate decks in `lossless` mode; default neutral envmap fallback.

### M2 — Asset Upload + CDN + `model_asset` Schema

#### M2.1 — `model_asset`, `scene`, `camera_keyframe`, `shader`, `license` schema + CRUD

- **Files / packages touched:**
  - `db/migrations/2026Q4/p11_3d_assets.sql` — `model_asset`, `scene`, `camera_keyframe`, `shader`, `license` (per `/docs/3d-motion-media.md` §5.1, §5.2, §5.3, §5.4, §5.13).
  - `db/migrations/2026Q4/p11_3d_assets_indexes.sql` — `(workspace_id)`, `(format)`, `(slide_id, order_index)` on `camera_keyframe`, `(workspace_id, kind)` on `shader`.
  - `services/asset-api/src/routes/{models,scenes,camera-keyframes,shaders,licenses}.ts` — REST per `/docs/3d-motion-media.md` §6.1, §6.3.
  - `packages/schema/src/3d/{model-asset,scene,camera-keyframe,shader,license}.ts`.
- **Contracts produced:**
  - `contracts/openapi/v1/3d-models.yaml`
  - `contracts/openapi/v1/3d-scenes.yaml`
  - `contracts/openapi/v1/3d-camera-keyframes.yaml`
  - `contracts/openapi/v1/3d-shaders.yaml`
  - `contracts/openapi/v1/licenses.yaml`
  - `contracts/json-schema/model-asset.v1.json`
  - `contracts/json-schema/scene.v1.json`
  - `contracts/json-schema/camera-keyframe.v1.json`
  - `contracts/json-schema/shader.v1.json`
  - `contracts/json-schema/license.v1.json`
- **Tests written:**
  - Migration test: each DDL applies and reverts cleanly; RLS enforces tenant scope.
  - Contract: every endpoint validates against JSON Schema (Ajv); 422 on mismatch.
  - Unit: license expiry blocks deck publishing.
- **DoD:** All endpoints live; tests green; types generated; MCP tools (M9.1) wired.

#### M2.2 — Asset upload pipeline + sanitization + license binding

- **Files / packages touched:**
  - `services/asset-api/src/upload/{handler,sanitizer,license-binder}.ts` — multipart upload; detect MIME; sanitization (§7.1).
  - `packages/3d-engine/src/sanitize/{StripExtensions,TextureScan}.ts` — strips embedded JS; rejects `KHR_xmp_json_ld` external refs; best-effort stego scan.
  - `apps/editor/src/components/assets/{LicensePicker,AssetLibrary}.tsx` — license picker; expired-license banner.
- **Tests written:**
  - Security: hostile GLB with embedded JS / external refs / oversized → rejected.
  - Security: textures scanned for stego payloads (best-effort gate).
  - Compliance: license binding enforced; expired license blocks publish.
- **DoD:** AC-65 acceptance; sanitization in place; license dashboard surfaces expiry.

#### M2.3 — CDN integration + polygon/texture budget enforcement

- **Files / packages touched:**
  - `services/asset-api/src/cdn/{SignedUrl,TierCache}.ts` — S3-compatible signed URLs; tiered cache (hot/standard/cold).
  - `services/asset-api/src/budget/{PolygonBudget,TextureBudget}.ts` — hero/standard/background tiers (§3.2); per-org override.
  - `packages/3d-engine/src/loaders/decimator.ts` — auto-decimation using gltf-transform.
- **Tests written:**
  - Performance: hero model 1.5M tris loads p50 ≤ 800 ms in-region.
  - Unit: budget enforcement triggers decimation toast with "Restore original" affordance.
- **DoD:** AC-65 acceptance; budget tiers configurable per org.

### M3 — Scene Editor + Camera Keyframes + Exploded Views + 3D Data Viz

#### M3.1 — Scene editor (lights, cameras, materials, environment)

- **Files / packages touched:**
  - `apps/editor/src/components/scene-editor/{Panel,LightGizmo,MaterialEditor,EnvMapSlot}.tsx`
  - `packages/3d-engine/src/scene/{LightManager,MaterialRegistry,EnvMapRegistry}.ts`
  - `apps/editor/src/components/scene-editor/SceneTree.tsx` — scene-graph tree mirrors GLTF node hierarchy.
- **Tests written:**
  - Unit: 8 lights warns ("Scene lights add GPU cost; consider baking").
  - Unit: per-submesh material selector for multi-material meshes.
  - Unit: negative scale flagged in lint.
- **DoD:** AC-66 acceptance; scene editor non-modal; 8-bit UI values linearized internally.

#### M3.2 — Camera keyframe interpolation + magic-move integration

- **Files / packages touched:**
  - `services/keyframes-svc/src/{interpolate,easing}.ts` — cubic bezier at 60 Hz; LUT cache.
  - `apps/editor/src/components/scene-editor/CameraKeyframePanel.tsx` — draggable keyframes; bezier handles.
  - `apps/web-viewer/src/animation/camera-keyframes.ts` — playback during presenter mode.
  - `packages/schema/src/3d/camera-path.ts` — 7-DOF vector (`position(3) + target(3) + fov(1)`).
- **Contracts consumed:** Phase 09's `transitions`/`magic_move_pairs` for cross-slide tweening.
- **Tests written:**
  - Unit: 7-DOF interpolation at 60 Hz; default `0.42, 0, 0.58, 1`.
  - Unit: model changes between slides → fall back to crossfade.
  - Unit: same model transformed in either slide → path in local frame.
- **DoD:** AC-67 acceptance; per-slide duration override (default 0.9 s); magic-move non-3D fallback.

#### M3.3 — Exploded views + 3D data viz

- **Files / packages touched:**
  - `packages/3d-engine/src/exploded/{CentroidAxis,BoundingBoxFallback}.ts`
  - `packages/3d-engine/src/viz/{GlobePlot,BarTerrain,PointCloud,NetworkGraph}.ts` — specialized scene archetypes; LOD; instancing.
  - `apps/editor/src/components/scene-editor/ExplodeTool.tsx` — per-part override; trigger on click (Phase 09 #88) or on slide enter.
- **Tests written:**
  - Unit: non-convex part → bounding-box center fallback with flag.
  - Unit: 1M point cloud at 5 fps → 2D fallback banner.
  - Unit: > 50 unique categories → top 50 + "other" aggregation.
- **DoD:** AC-68, AC-69 acceptance; live data refresh (Phase 08 #51/#63) re-issues geometry diff without reload.

### M4 — CAD Pipeline + Physics

#### M4.1 — CAD worker pool (OpenCASCADE + Assimp)

- **Files / packages touched:**
  - `workers/cad-pipeline/src/{parse,tessellate,decimate,encode}.ts` — Go primary (per §4.4); OpenCASCADE for STEP/IGES; Assimp for FBX.
  - `services/cad-jobs/src/routes.ts` — `POST /api/v1/cad_jobs`; `wss://api.domio.app/cad_jobs/{id}/stream` (per §6.2).
  - `db/migrations/2026Q4/p11_cad_jobs.sql` — `cad_jobs` table; progress states.
  - `apps/editor/src/components/cad/{CadDropZone,ProgressToast,CancelButton}.tsx`.
- **Contracts produced:**
  - `contracts/openapi/v1/cad-jobs.yaml`
  - `contracts/json-schema/cad-job.v1.json`
- **Tests written:**
  - Unit: STEP AP203 / AP214 / AP242 all parsed.
  - Unit: tessellation chord 0.1 mm, angle 15° defaults; target 1.5M tris hero / 250k thumbnail.
  - Unit: failure keeps original CAD file available; surfaces error clearly.
  - Performance: 100-part assembly auto-suggests "single mesh" mode.
- **DoD:** AC-70 acceptance; progress streamed in three states (Parsing / Meshing / Optimizing); cancel at any state.

#### M4.2 — Physics engine (rapier primary; ammo fallback)

- **Files / packages touched:**
  - `packages/physics/src/{rapier,ammo,BodyManager,Broadphase}.ts` — rapier (Rust→WASM) primary.
  - `apps/editor/src/components/physics/{PhysicsToggle,FreezeTool,HitRegion}.tsx`
  - `apps/web-viewer/src/physics/runtime.ts` — synced from Phase 09 animation timeline.
- **Tests written:**
  - Unit: rigid-body deterministic-ish up to integration tolerance; fixed-step 1/60s.
  - Unit: 200+ objects → spatial-hash broadphase with user warning.
  - Unit: physics on a slide with a complex data binding → freezes binding.
- **DoD:** AC-71 acceptance; soft-body deferred to v2.

### M5 — Particle Systems + Shaders + AR Handoff

#### M5.1 — Particle system library + GPU compute path

- **Files / packages touched:**
  - `packages/3d-engine/src/particles/{GPUComputeEmitter,BrandTinted,Snow,Confetti,Dust,Sparks,Aurora}.ts`
  - `apps/editor/src/components/particles/{ParticlePicker,EmitterConfig}.tsx`
  - `apps/web-viewer/src/particles/runtime.ts` — up to 1M particles per scene budget (5× WebGPU uplift).
- **Tests written:**
  - Performance: 1M particles at 60 fps in WebGPU; 250k in WebGL2.
  - Unit: brand color slots auto-bind to theme tokens (`color.brand.primary`).
- **DoD:** AC-72 (particles) acceptance; brand-tinted presets auto-theme.

#### M5.2 — Shader registry + WGSL/GLSL build chain

- **Files / packages touched:**
  - `services/shader-registry/src/{routes,build}.ts` — REST per §6.3; `kind ∈ {background, particle, material, post}`.
  - `packages/3d-engine/src/shaders/{WGSLBuilder,GLSLBuilder,ErrorReporter}.ts` — compile errors surfaced inline.
  - `apps/editor/src/components/shaders/{ShaderEditor,CompileErrorPanel}.tsx` — fragment-shader editor; live preview.
  - `db/seeds/2026Q4/3d_shader_presets.sql` — curated shader library.
- **Tests written:**
  - Unit: WGSL compile error → falls back to safe-default shader; user sees error.
  - Unit: unsupported extension → "This shader requires `EXT_foo`, not available here" banner.
  - Security: shader source sanitized; no host-environment access.
- **DoD:** AC-72 (shaders) acceptance; org admin can publish shaders to a shared library.

#### M5.3 — AR handoff + QR viewer (WebXR + AR Quick Look)

- **Files / packages touched:**
  - `services/ar-sessions/src/{routes,token,expiry}.ts` — `POST /api/v1/ar_sessions` per §6.8; 30-min TTL; 5-min inactivity timeout.
  - `db/migrations/2026Q4/p11_ar_sessions.sql` — `ar_session` table per §5.12.
  - `apps/ar-viewer/src/{App,WebXRSession,QuickLookHandoff,LightingEstimate}.tsx` — standalone web app at `ar.domio.app`.
  - `apps/editor/src/components/ar/{ArHandoffButton,QrInAudienceView}.tsx`
- **Tests written:**
  - Unit: token expiry 30 min total, 5 min inactivity; session invalidated when presenting session ends.
  - Unit: phone without AR → falls back to 3D web viewer.
  - Unit: network loss mid-session → model stays in place; session degrades gracefully.
  - Security: token rotating key per session; `kid` registry.
- **DoD:** AC-74 acceptance; QR rendered into audience view; lighting estimate used.

#### M5.4 — Scroll-driven 3D storytelling

- **Files / packages touched:**
  - `apps/web-viewer/src/scroll-3d/scroll-driver.ts` — passive scroll listener; normalized `[0,1]` keyframe timeline.
  - `apps/web-viewer/src/scroll-3d/click-driver.ts` — click to advance keyframe.
  - `apps/editor/src/components/scene-editor/KeyframeTrigger.tsx` — `trigger ∈ {click, scroll, auto, data}` per keyframe.
- **Tests written:**
  - Performance: scroll-linked driver ≤ 1 ms / frame for hero scene.
  - Unit: scroll past last keyframe halts at end; click past wraps or stops per author choice.
- **DoD:** AC-73 acceptance; integrates with Phase 14 #156 scroll-mode web share.

### M6 — Video Pipeline

#### M6.1 — Video asset schema + upload + transcode worker

- **Files / packages touched:**
  - `db/migrations/2026Q4/p11_video.sql` — `video_asset` per §5.5; `transcode_state ∈ {pending, processing, ready, failed}`.
  - `services/video-pipeline/src/{routes,job,worker-pool}.ts` — `POST /api/v1/video_jobs` per §6.4.
  - `workers/video-pipeline/src/{transcode,thumbnail,caption-extract,waveform}.ts` — ffmpeg on Kubernetes worker pool.
  - `packages/video/src/{HlsPackager,DashPackager,RenditionSelector}.ts` — HLS primary (240p/480p/720p/1080p); DASH opt-in.
- **Contracts produced:**
  - `contracts/openapi/v1/video-jobs.yaml`
  - `contracts/openapi/v1/video-assets.yaml`
  - `contracts/json-schema/video-asset.v1.json`
- **Tests written:**
  - Performance: transcoding queue depth > 50 for 10 min → page on-call.
  - Performance: HEVC source unsupported in browser → transcode to H.264.
  - Unit: priority presenter-live > scheduled > background uploads.
  - Security: video source not stored unencrypted at rest.
- **DoD:** AC-75 acceptance; HLS variants live; client picks via `Network Information API`.

#### M6.2 — In-editor trim, crop, speed, captions, chaptering

- **Files / packages touched:**
  - `apps/editor/src/components/video/{TimelineEditor,TrimHandle,CropHandle,SpeedSlider,ChapterMarker,CaptionsEditor}.tsx`
  - `services/video-pipeline/src/captions.ts` — auto-generate WebVTT via speech-to-text; user-editable.
  - `apps/web-viewer/src/video/{SegmentedVideo,TrimmedPlayback,ChapterScrub}.ts`
- **Tests written:**
  - Unit: trims stored as metadata (in/out points); no re-encoding.
  - Unit: crop via texture UV manipulation.
  - Unit: speed 0.25×–4×; retime audio or drop audio as appropriate.
  - Unit: WebVTT revision history per CRDT.
- **DoD:** AC-75 acceptance; AC-76 acceptance (segmented playback); captions editor accessibility per Phase 09 #122.

#### M6.3 — Smart text-contrast protection on background video

- **Files / packages touched:**
  - `packages/video/src/contrast-map.ts` — per-region contrast map every N frames (default 5); Web Worker offload.
  - `apps/editor/src/components/video/ContrastOverride.tsx` — user override; lock style.
- **Tests written:**
  - Performance: contrast map compute ≤ 1 ms / frame on a 1080p background video.
  - Unit: "use worst-case frame" toggle for fast-changing scenes.
  - Accessibility: text-shadow / color shift / scrim options meet WCAG AA.
- **DoD:** AC-77 acceptance; style override persisted.

### M7 — Audio + Lottie + Screen Recording

#### M7.1 — Audio track schema + mixer

- **Files / packages touched:**
  - `db/migrations/2026Q4/p11_audio.sql` — `audio_track` per §5.6.
  - `services/asset-api/src/routes/audio.ts`
  - `packages/audio/src/{WebAudioMixer,PannerNode,ExportMixer}.ts` — client-side mixer; AAC stereo bus for export.
  - `apps/editor/src/components/audio/{MixerPanel,VoiceoverRecorder,AmbientPicker}.tsx`
- **Tests written:**
  - Performance: drift budget < 40 ms; re-sync triggers when exceeded.
  - Unit: voiceover auto-aligned to slide enter (Phase 09 #88 trigger).
  - Unit: live captioning (Phase 09 #122) runs on Web Worker.
- **DoD:** AC-78 acceptance; export mix encoded to AAC stereo.

#### M7.2 — Lottie / Rive runtime + state machine

- **Files / packages touched:**
  - `db/migrations/2026Q4/p11_lottie.sql` — `lottie_asset` per §5.7.
  - `services/asset-api/src/routes/lottie.ts`
  - `packages/lottie/src/{LottieRuntime,RiveRuntime,StateMachinePanel}.ts` — lottie-web + @rive-app/canvas.
  - `apps/editor/src/components/lottie/{LottieDropZone,SendTriggerPanel,VariableScrub}.tsx` — "Send trigger" panel; variable scrub.
- **Tests written:**
  - Unit: Lottie animation bound to variable scrubs in < 16 ms.
  - Unit: Rive state-machine transition triggered by `on_click` (Phase 09 #88).
  - Performance: heavy Rive file (> 5 MB) → S3-stored, CDN-served.
- **DoD:** AC-79 acceptance; poster frame rendered for non-playing contexts.

#### M7.3 — Screen recording via `getDisplayMedia`

- **Files / packages touched:**
  - `apps/editor/src/components/recording/{RecordButton,ControlBar,TrimBeforeInsert}.tsx` — `getDisplayMedia` + optional `getUserMedia` mic.
  - `packages/recording/src/{EncoderSelector,HardwareFallback,ResumableDraft}.ts` — VP9 WebM / H.264 MP4; software fallback.
- **Tests written:**
  - Unit: permission-denied → instructions shown; recording interrupted → draft saved.
  - Performance: ~8 Mbps for 1080p target; bitrate auto-scales.
- **DoD:** AC-80 acceptance; recording pauses/resumes; trim handles before insert.

### M8 — Live App Embed + Code Sandbox + LaTeX + Maps

#### M8.1 — `embed_policy` schema + live-app embed proxy

- **Files / packages touched:**
  - `db/migrations/2026Q4/p11_embed.sql` — `embed_policy` per §5.9.
  - `services/embed-proxy/src/{proxy,origin-check,jwt-passthrough,csp}.ts` — reverse proxy at `embed.domio.app`.
  - `apps/editor/src/components/embed/{EmbedPicker,PolicyPicker,AllowlistManager}.tsx`
- **Contracts produced:**
  - `contracts/openapi/v1/embed-policies.yaml`
  - `contracts/json-schema/embed-policy.v1.json`
- **Tests written:**
  - Security: iframe served with CSP `frame-ancestors 'self' https://*.domio.app`, `default-src 'none'`, `script-src 'self' https://embed.domio.app`.
  - Security: origin allowlist enforced; `postMessage` origin-validated; payload shape validated against JSON Schema.
  - Security: trap-focus mode for kiosk use (#218).
- **DoD:** AC-81 acceptance; per-org policy + per-deck override (org-admin required).

#### M8.2 — Code sandbox (`code_sandbox_policy` + QuickJS worker)

- **Files / packages touched:**
  - `db/migrations/2026Q4/p11_code.sql` — `code_sandbox_policy` per §5.8.
  - `services/code-sandbox/src/{routes,worker-pool}.ts` — `POST /api/v1/sandbox/run` per §6.6.
  - `packages/code-sandbox/src/{QuickJsRuntime,V8IsolateRuntime,ConsoleInterceptor,ArtifactStream}.ts`
  - `apps/editor/src/components/code/{MonacoEditor,LineStepReveal,RunsMode,ConsolePanel}.tsx` — Shiki highlighter.
- **Contracts produced:**
  - `contracts/openapi/v1/sandbox-policies.yaml`
  - `contracts/openapi/v1/sandbox-runs.yaml`
  - `contracts/json-schema/code-sandbox-policy.v1.json`
- **Tests written:**
  - Unit: 8s CPU cap (configurable up to 50s); 64 MB memory cap; no `fetch`/`XMLHttpRequest`/`importScripts` by default.
  - Unit: 1 MB stdout cap per run; rate-limited per workspace.
  - Security: Web Worker isolation; QuickJS pinned to known-good version; V8 isolate for stricter needs.
  - Security: fuzz QuickJS for known CVEs; update cadence.
- **DoD:** AC-82 acceptance; line-step reveal animates on click; artifact stream shown.

#### M8.3 — LaTeX render service (edge-rendered KaTeX)

- **Files / packages touched:**
  - `services/latex-render/src/{edge,cache}.ts` — Cloudflare Worker or V8 isolate; MathJax-node; KaTeX-compatible output.
  - `packages/latex/src/{EditorMarker,RenderedHtml,RenderedSvg,ErrorSquiggle}.tsx` — `$...$` inline, `$$...$$` block.
  - `db/migrations/2026Q4/p11_latex.sql` — `latex_doc` per §5.10; `cache_key UNIQUE`.
  - `apps/editor/src/components/latex/{LatexEditor,RenderedPreview}.tsx`
- **Contracts produced:**
  - `contracts/openapi/v1/latex.yaml`
  - `contracts/json-schema/latex-doc.v1.json`
- **Tests written:**
  - Performance: render p50 ≤ 80 ms; cache hit p50 ≤ 5 ms.
  - Security: untrusted LaTeX restricted to safe math subset (no `\input`, no `\href{}`).
  - Unit: cache TTL 30 days keyed by source + theme hash.
- **DoD:** AC-83 acceptance; CDN-cached HTML/SVG/PNG outputs.

#### M8.4 — Maps (Mapbox / Google / MapLibre adapters)

- **Files / packages touched:**
  - `db/migrations/2026Q4/p11_maps.sql` — `map_style` per §5.11.
  - `services/asset-api/src/routes/maps.ts`
  - `packages/maps/src/{ProviderAdapter,MapboxAdapter,GoogleAdapter,MapLibreAdapter,CustomTileAdapter}.ts` — common internal API.
  - `apps/editor/src/components/maps/{MapPicker,StylePicker,ChoroplethConfig}.tsx` — TopoJSON/GeoJSON join to data source.
- **Contracts produced:**
  - `contracts/openapi/v1/map-styles.yaml`
  - `contracts/json-schema/map-style.v1.json`
- **Tests written:**
  - Performance: tiles pre-fetched for surrounding zoom; presenter-mode pre-fetches next 3 slides.
  - Unit: provider quota → fallback to simpler style with banner.
  - Unit: invalid provider key → MapLibre + OSM fallback.
- **DoD:** AC-84 acceptance; live data refresh updates markers/polygons; pan/zoom remembered per slide.

### M9 — MCP Agent Surface (parallel, depends on M2.1 + M6.1 + M8.x contracts)

#### M9.1 — MCP tools for models, scenes, keyframes, shaders, video, audio, lottie, embed, code, latex, map

- **Files / packages touched:**
  - `services/mcp/src/tools/3d/{models,scenes,camera-keyframes,shaders}.ts`
  - `services/mcp/src/tools/media/{video,audio,lottie}.ts`
  - `services/mcp/src/tools/embed/{live-app,sandbox,latex,maps}.ts`
  - `services/mcp/src/router.ts` — capability-claim gating (Phase 13 #225); e.g., `manage_assets`, `manage_scenes`, `manage_policies`.
  - `packages/agent-schema/src/3d/{models,camera-keyframes,shaders}.ts` — JSON Schemas with semantic element addressing.
- **Contracts produced:**
  - `contracts/openapi/v1/mcp-3d.yaml`
  - `contracts/openapi/v1/mcp-media.yaml`
  - `contracts/openapi/v1/mcp-embed.yaml`
  - `contracts/mcp/3d.tools.json`
  - `contracts/mcp/media.tools.json`
- **Tests written:**
  - Unit: every tool validates against JSON Schema; rejects with `422` on invalid.
  - Security: agent without `manage_policies` cannot create/update `embed_policy` or `code_sandbox_policy`.
  - E2E: agent authors a camera keyframe via `create_camera_keyframe`; deck re-renders with new path.
- **DoD:** Every feature in #65–#84 has at least one MCP tool; tool-call transcript appended to audit trail (#227).

#### M9.2 — License tracker dashboard for asset governance

- **Files / packages touched:**
  - `apps/editor/src/components/assets/LicenseDashboard.tsx` — "32 assets under Unsplash license", "5 assets require attribution", "License X expires in 14 days".
  - `services/asset-api/src/license-scheduler.ts` — daily expiry scan; publishes `license.expiring` event.
- **Tests written:**
  - Compliance: an asset cannot be inserted into a published deck if its license is expired (unless author confirms).
  - Unit: license expiry within 14 days surfaces a banner.
- **DoD:** License dashboard live; expired license blocks publish.

---

## 5. Architecture & Data

References master docs: `/docs/04-system-architecture.md`, `/docs/05-data-database-design.md`, `/docs/06-technology-stack.md`, `/docs/3d-motion-media.md`.

### New Postgres tables

Exactly per `/docs/3d-motion-media.md` §5.1–§5.13:

- `model_asset` (§5.1) — `format ∈ {glb, gltf, usdz, step, stp, iges, igs, fbx, obj}`; `source_url`, `derived_url`, `poly_count`, `texture_count`, `has_animations`, `cad_source_url`, `license_id`.
- `scene` (§5.2) — `model_asset_id`, `environment JSONB`, `lights JSONB`, `cameras JSONB`, `materials JSONB`.
- `camera_keyframe` (§5.3) — `slide_id`, `scene_id`, `order_index`, `position`, `target`, `fov`, `roll`, `easing`, `duration_ms`, `trigger ∈ {auto, click, scroll, data}`; index `(slide_id, order_index)`.
- `shader` (§5.4) — `workspace_id`, `author_id`, `kind ∈ {background, particle, material, post}`, `source_wgsl`, `source_glsl`, `inputs`, `published`.
- `video_asset` (§5.5) — `hls_url`, `dash_url`, `duration_ms`, `width`, `height`, `has_audio`, `captions_url`, `waveform_url`, `transcode_state`.
- `audio_track` (§5.6) — `slide_id`, `kind ∈ {voiceover, music, ambient, sfx}`, `volume`, `fade_in_ms`, `fade_out_ms`, `license_id`.
- `lottie_asset` (§5.7) — `format ∈ {lottie, rive}`, `width`, `height`, `state_machine JSONB`.
- `code_sandbox_policy` (§5.8) — `max_cpu_ms`, `max_memory_mb`, `allow_network`, `allow_dom`, `allow_console`, `allow_import`, `module_allowlist`.
- `embed_policy` (§5.9) — `allowed_origins JSONB`, `sandbox_flags`, `jwt_required`, `jwt_audience`, `trap_focus`.
- `latex_doc` (§5.10) — `source`, `rendered_html`, `rendered_svg`, `theme_hash`, `cache_key UNIQUE`.
- `map_style` (§5.11) — `provider ∈ {mapbox, google, maplibre, custom}`, `style_url`, `api_key_id`, `default_zoom`, `default_lng`, `default_lat`.
- `ar_session` (§5.12) — `slide_id`, `model_asset_id`, `token UNIQUE`, `expires_at`.
- `license` (§5.13) — `name`, `source`, `terms_url`, `expires_at`, `seats`.
- `cad_jobs` — `model_asset_id`, `tessellation_chord_mm`, `tessellation_angle_deg`, `target_poly_count`, `progress ∈ {parsing, meshing, optimizing, done, failed}`.
- `video_jobs` — `video_asset_id`, `renditions[]`, `extract_captions`, `extract_waveform`.

### New services

- **`services/asset-api/`** (TypeScript + Hono) — CRUD for models, scenes, camera keyframes, shaders, audio tracks, lottie assets, embed policies, code sandbox policies, map styles, licenses; upload pipeline + sanitization + license binding + CDN.
- **`services/embed-proxy/`** (TypeScript) — reverse proxy for live-app embeds; CSP enforcement; origin allowlist; JWT passthrough.
- **`services/code-sandbox/`** (TypeScript) — code-sandbox policy + runs API; QuickJS worker pool.
- **`services/latex-render/`** (edge function — Cloudflare Workers or V8 isolate) — MathJax-node / KaTeX render; CDN cache.
- **`services/ar-sessions/`** (TypeScript) — AR session tokens; QR generation; expiry enforcement.
- **`services/shader-registry/`** (TypeScript) — shader CRUD + build chain.
- **`services/cad-jobs/`** (TypeScript) — CAD job dispatch + progress streaming via WebSocket.
- **`services/keyframes-svc/`** (TypeScript) — camera keyframe interpolation; magic-move integration.
- **`services/video-pipeline/`** (TypeScript) — video transcode orchestration; HLS/DASH packaging.

### New workers

- **`workers/cad-pipeline/`** (Go primary per §4.4) — OpenCASCADE + Assimp; tessellation/decimation/encoding; restartable; cgroups memory limits.
- **`workers/video-pipeline/`** (Go) — ffmpeg transcode pool; thumbnail/caption/waveform extraction; priority queue.
- **`workers/physics/`** (Rust→WASM in `packages/physics`; runtime in Web Worker) — rapier; fixed-step 1/60s.
- **`workers/code-sandbox/`** (TypeScript Web Worker) — QuickJS runtime; per-frame CPU budget; memory cap.

### New packages

- **`packages/3d-engine/`** — renderer abstraction, loaders, sanitization, scene editor helpers, particle system, shader registry client.
- **`packages/physics/`** — rapier/ammo integration; deterministic fixed-step integration.
- **`packages/audio/`** — Web Audio mixer; export bus.
- **`packages/video/`** — HLS client, contrast-map, segmented playback.
- **`packages/lottie/`** — lottie-web + @rive-app/canvas wrappers; state-machine control.
- **`packages/recording/`** — `getDisplayMedia` + `getUserMedia`; encoder selector; resumable drafts.
- **`packages/code-sandbox/`** — QuickJS runtime; V8 isolate adapter.
- **`packages/latex/`** — editor marker; rendered HTML/SVG/PNG; error squiggle.
- **`packages/maps/`** — provider adapters; choropleth join.
- **`packages/schema/src/3d/`** and **`packages/agent-schema/src/3d/`** — generated TS types; semantic element addressing helpers.

### New CRDT additions

- Sub-document `3d-runtime` per deck: scenes, camera keyframes, materials, lights, shader references. Pinned in CRDT log with deck-version stamp.

### New event topics (NATS JetStream subjects)

- `3d.model.uploaded`, `3d.model.decimated`, `3d.cad.job_progress`, `3d.cad.job_done`, `3d.cad.job_failed`
- `3d.shader.compiled`, `3d.shader.error`
- `media.video.uploaded`, `media.video.transcoded`, `media.video.failed`
- `media.audio.uploaded`
- `media.lottie.uploaded`
- `ar.session_started`, `ar.session_ended`, `ar.session_expired`
- `embed.request`, `embed.denied`
- `sandbox.run_started`, `sandbox.run_completed`, `sandbox.run_killed`
- `license.expiring`

### Performance budgets (per `/docs/3d-motion-media.md` §8)

- Hero slide: 1.5M tris, 4 lights, 1 camera path, ≤ 250k particles → 60 fps at 16 ms frame.
- Standard slide: 250k tris, 2 lights → 60 fps.
- Background 3D: 50k tris, 1 light → 60 fps.
- LOD0/LOD1/LOD2/LOD3 auto-generated at upload.
- Audio drift budget < 40 ms; re-sync on exceed.
- LaTeX render p50 ≤ 80 ms; cache hit ≤ 5 ms.
- Map tiles pre-fetched for current + 3 next slides in presenter mode.
- Code sandbox warm-up ≤ 200 ms cold start.

### Security primitives

- Model sanitization (§7.1) — strip embedded JS, external refs, custom extensions (opt-in per workspace).
- CAD conversion sandbox (§7.2) — no network; 500 MB cap; restartable; quarantined bucket for 7 days.
- Embed origin allowlist + CSP `frame-ancestors` (§7.3) — per-org allowlist; per-deck override requires admin.
- Code sandbox capability limits (§7.4) — no `fetch`/`XHR`/`importScripts` by default; per-policy caps; output rate-limited.
- AR session expiration (§7.5) — 30-min total, 5-min inactivity; rotating per-session keys.
- License tracking (§7.6) — every asset has `license_id`; expired blocks publishing.

---

## 6. Verification

| Feature | Test | Expected result | Owner |
|---|---|---|---|
| #65 | Drop `.glb` 1.5M tris on a slide | Viewport appears with model centered; orbit/pan/zoom work | Editor FE |
| #65 | Invalid GLB | Placeholder card "Could not load 3D model"; no crash | Runtime |
| #65 | Geometry > 4.2M tris | Auto-decimation with "Reduced from 4.2M to 1.5M tris for performance — restore original" toast | Editor FE / Runtime |
| #66 | Add a directional light; drag gizmo | Light position updates from real-time gizmo | Editor FE |
| #66 | 9th light added | "Scene lights add GPU cost; consider baking" warning | Editor FE |
| #67 | Author marks 3D model on slides 4 and 5 as matched | Camera keyframes interpolated in transition | Runtime |
| #67 | Author changes model between slides | Fallback to crossfade | Runtime |
| #68 | Globe plot with 10K lat/lon points; arcs | Arcs animate on enter; arc drawing ≤ 16 ms / frame | Runtime |
| #68 | 1M-point point cloud at 5 fps | Drops to 2D fallback with banner | Runtime |
| #69 | Explode tool on multi-part assembly | Parts animate outward 0.6s ease-out cubic | Runtime |
| #70 | Upload `.step` AP214 100-part assembly | Parsing → Meshing → Optimizing progress; GLB at 1.5M tris | CAD worker |
| #70 | Tessellation chord 0.1 mm, angle 15° | Defaults honored; user override respected | CAD worker |
| #70 | Conversion failure | Original CAD file kept; error surfaced clearly | CAD worker / FE |
| #71 | Mark a 3D element physics-enabled | Gravity + friction simulated; settle at fixed-step 1/60s | Physics |
| #71 | 200+ physics objects | Spatial-hash broadphase with user warning | Physics |
| #72 | Snow particle system at 250k particles | 60 fps in WebGL2; brand-tinted via theme token | Runtime |
| #72 | Custom WGSL fragment shader compile error | Falls back to safe-default shader; user sees error | Shader registry |
| #73 | Scroll-driven keyframes | `[0,1]` normalized timeline mapped to scroll position | Runtime |
| #73 | Scroll past last keyframe | Halts at end (or wraps per author choice) | Runtime |
| #74 | Presenter clicks AR handoff on a 3D slide | QR in audience view; viewer scans; WebXR session opens | AR |
| #74 | iOS phone without WebXR | AR Quick Look via `rel="ar"` | AR |
| #74 | Phone doesn't support AR | Falls back to 3D web viewer | AR |
| #74 | AR session token expired (30 min) | Session invalidated; new token required | AR |
| #75 | Trim a video element | Metadata-only in/out points; no re-encoding | Video pipeline |
| #75 | HEVC source + Safari | Transcoded to H.264 on upload | Video pipeline |
| #75 | Chapter markers | Clickable scrub points on the timeline | Editor FE |
| #76 | Video with 3 named segments; click advances | Segments respect animation triggers (Phase 09 #88) | Runtime |
| #77 | Background video with overlay text | Text contrast auto-styled per frame | Runtime |
| #77 | "Use worst-case frame" toggle | Style based on lowest-contrast frame | Runtime |
| #78 | Voiceover + music + ambient | Web Audio mix; per-track volume/pan/fade; export to AAC stereo | Audio |
| #78 | Drift > 40 ms mid-playback | Re-sync triggers automatically | Audio |
| #79 | Drop `.riv` state machine; click trigger | State transition fires; animation plays | Lottie / Rive |
| #79 | Lottie bound to variable `$progress = 0.5` | Animation scrubs to 50% | Lottie |
| #80 | Screen recording with mic | `getDisplayMedia` produces WebM/VP9 + mic AAC; pause/resume; trim handles | Recording |
| #80 | Recording interrupted | Draft saved; user can resume | Recording |
| #81 | Embed `https://app.example.com` | iframe sandbox + CSP `frame-ancestors`; origin allowlist enforced | Embed proxy |
| #81 | Per-org policy; org-admin override | Per-deck override requires admin | Embed |
| #82 | Run `console.log(1+1)` in a code block | Output `2\n`; ≤ 100 ms total | Code sandbox |
| #82 | Code with infinite loop | Worker terminates after 8 s; "Killed (8s timeout)" notice | Code sandbox |
| #82 | Code attempts `fetch('https://evil.example')` | Rejected by sandbox; no network | Code sandbox |
| #83 | LaTeX block `$\nabla \cdot E = \rho / \epsilon_0$` | Renders inline; cache hit on second render | LaTeX |
| #83 | Untrusted LaTeX with `\input{...}` | Rejected; safe-subset enforced | LaTeX |
| #84 | Map with 100 markers; live data refresh | Markers update without re-mount | Maps |
| #84 | Mapbox quota reached | Fallback to degraded style with banner | Maps |
| #84 | Invalid Mapbox API key | Falls back to MapLibre + OSM | Maps |
| MCP | Agent invokes `create_camera_keyframe` for `slide[3].camera_path[keyframe_2]` | Keyframe created; deck re-renders | MCP |
| MCP | Agent without `manage_policies` calls `create_embed_policy` | Rejected with `403` | MCP / Auth |
| License | Insert expired-license asset into published deck | Blocked; user must confirm | License / Compliance |
| License | License expires in 14 days | Banner surfaces in License Dashboard | License / FE |
| Performance | Hero scene 1.5M tris, 4 lights, 1 camera path, 250k particles | 60 fps on CI reference machine | Perf |
| Performance | Video transcoding queue depth > 50 for 10 min | On-call alert fires | Perf / Ops |
| Performance | Audio drift budget | < 40 ms; re-sync on exceed | Audio |
| Performance | LaTeX render p50 | ≤ 80 ms; cache hit ≤ 5 ms | Perf |
| Performance | Code sandbox cold start | ≤ 200 ms | Perf |
| Performance | Map tile pre-fetch | Current + 3 next slides in presenter mode | Maps |
| A11y | Live captions/transcripts on every video with audio | Manual QA pass per release | A11y |

---

## 7. Risks & Open Decisions

| Risk | Mitigation |
|---|---|
| WebGPU maturity on Safari ≤ 17 | Dual-render in editor; pick better frame; fall back to WebGL2; report context loss |
| CAD conversion cost is CPU-heavy | Throttle free tier (e.g., 5 CAD imports/day); priority queue; tiered pricing |
| QuickJS sandbox escape CVEs | Pin known-good version; external fuzzing vendor in Phase 22; update cadence |
| AR session QR screenshots in the audience | Accepted risk; session tied to presenting session anyway |
| Map provider cost (Mapbox / Google) at scale | Quota UX ("X% used"); degraded-style fallback; org-level config |
| License tracking drift | No-license state blocks publish; expiry banner; license scheduler |
| Shader compile failures on some GPU drivers | Safe-default fallback; error surfaced inline; CSP-capable |
| Video transcode backlog during peak | BullMQ priority queue (live > scheduled > background); autoscaling worker pool |
| Iframe `postMessage` payload mutation | Origin-pinned validation; JSON Schema payload validation; rate limit |
| Code sandbox DoS via large output | 1 MB stdout cap per run; rate-limit per workspace; abort after 8 s |
| Asset license expiry mid-presentation | Editor banner; license scheduler publishes event; embedded asset continues to render but flagged |
| Open question: shader registry governance | Open — org admin can publish to shared library; global marketplace in Phase 19 |
| Open question: AR handoff on Linux desktop browsers | Best-effort via `<model-viewer>`; WebXR if available; else 3D web viewer fallback |
| Open question: AR Quick Look on iPadOS Safari | Use `rel="ar"`; same path as iOS; fallback to web viewer if unsupported |
| Open question: LaTeX on dark/light theme switching | Cache keyed by `theme_hash`; re-render on theme change; consider precomputing common expressions per theme |
| Open question: Mapbox/Google licensing tiers | MapLibre + OSM as default for self-host/orgs wanting control |
| Open question: 3D model provenance chips (#215) | Defer to Phase 21; this phase captures `model_asset.license_id` and `cad_source_url` |

---

## 8. Demo

**Demo: "Product launch — 3D product reveal with CAD import, ROI calculator, and AR handoff"**

1. **Build (editor).** Open a 10-slide product launch deck. Slide 4 is a "Hero slide" — drop in a `.glb` of the product (1.2M tris).
2. **3D scene editor.** Double-click the 3D viewport → enter scene editor. Add a directional light from above-front; add a soft point light under the product. Open Materials; tweak the product's metallic to 0.9, roughness to 0.3.
3. **Camera keyframes.** Add a camera path on slide 4 (start wide, zoom into the front face, then orbit 30°). Add a matched model on slide 5; the transition interpolates through the keyframe.
4. **Exploded view.** On slide 5, click Explode Tool; product parts animate outward 0.6 s ease-out cubic.
5. **3D data viz.** On slide 6, insert a globe plot of customer locations; bind to a live data source (Phase 08) with 10K points. Arcs animate from HQ to top 20 cities on enter.
6. **CAD import.** On slide 7, drop a `.step` file of the product assembly. Three-state progress: Parsing → Meshing → Optimizing. Convert to GLB at 1.5M tris. Viewport appears with decimated assembly.
7. **Physics.** On slide 7, mark the assembly physics-enabled. In presenter mode, drop a small ball onto the assembly; bounces and settles.
8. **Particle background.** On slide 1 (cover), add a brand-tinted "Aurora" particle background using theme tokens.
9. **Scroll-driven 3D (web share).** Switch to scroll-mode preview; scrolling scrubs through the camera keyframes on slide 4.
10. **Video.** On slide 8, insert a marketing video; trim 0:00–0:30; add chapter markers; auto-generate captions; user-edits one caption.
11. **Segmented video + background contrast.** On slide 9, background video with overlay text; smart text-contrast map every 5 frames ensures WCAG AA.
12. **Audio.** Add voiceover to slide 4 (recorded in-editor), music to slide 5, ambient drone to slide 6. Mixer panel: per-track volume/pan/fade. Drift stays < 40 ms.
13. **Lottie.** On slide 3, drop a Lottie animation; bind `$progress` to scrub through it.
14. **Screen recording.** On slide 10, click Record → screen + mic → record a 30-second demo → insert into the slide.
15. **Live app embed.** On slide 8, embed `https://app.example.com` (allowed by org policy); iframe rendered with sandbox + CSP. Click through the embedded app interactively in presenter mode.
16. **Code block.** On slide 8, insert a code block: "Try this calculation" → `console.log(team_size * 120000 / 2080 * 4 * 50)`; output renders.
17. **LaTeX.** On slide 6, add `$\nabla \cdot E = \rho / \epsilon_0$` inline in a caption; rendered inline.
18. **Map.** On slide 6, add a Mapbox-styled map with markers bound to customer locations; live data refresh updates markers.
19. **AR handoff.** Presenter clicks "Send to AR" on slide 4. Audience scans QR on phone → WebXR session opens on Android; AR Quick Look opens on iOS. Model sits in the room with lighting estimate.
20. **License dashboard.** Open License Dashboard → see "32 assets under Unsplash license", "5 assets require attribution", "License X expires in 14 days".
21. **MCP.** From the MCP agent sandbox, call `create_camera_keyframe` for `slide[4].camera_path[keyframe_2]`; audit-trail entry "Agent: Claude via MCP — added camera keyframe." Call `create_embed_policy` with an allowed origin; rejected without `manage_policies` capability.
22. **Compliance + A11y.** Verify license expiry blocks publishing. Run axe-core on slides with video/lottie/embed/code/latex/map. Manual keyboard-only pass on every interactive element.

---

## 9. Definition of Done

A feature #65–#84 ships only when:

- **Code merged.** All M1–M9 workstreams merged to `main`; CRDT sub-documents pinned; renderer feature flags off by default.
- **Contracts versioned.** `contracts/openapi/v1/{3d-models,3d-scenes,3d-camera-keyframes,3d-shaders,licenses,cad-jobs,video-jobs,video-assets,embed-policies,sandbox-policies,sandbox-runs,latex,map-styles,mcp-3d,mcp-media,mcp-embed}.yaml` published and semver-tagged; JSON Schemas emitted; consumers migrated.
- **Tests pass.** Unit ≥ 80% line coverage on `3d-engine`, `physics`, `video`, `audio`, `lottie`, `code-sandbox`, `latex`, `maps`; integration suite green; visual regression baselines for every preset 3D scene; security suite green (model sanitization, CAD sandbox, embed proxy bypass, code sandbox breakout); performance suite green (1.5M-tri hero at 60 fps; video transcoding SLAs; LaTeX p50; code sandbox cold start).
- **Telemetry in place.** Prometheus metrics: `domio_3d_model_load_seconds_bucket`, `domio_cad_jobs_active_count`, `domio_video_transcode_seconds_bucket`, `domio_ar_sessions_active_count`, `domio_embed_proxy_requests_per_second`, `domio_sandbox_run_seconds_bucket`, `domio_latex_render_seconds_bucket`. OpenTelemetry spans cover upload → process → CDN. Structured logs redact PII.
- **Alerts wired.** CAD queue depth > 50 for 10 min; video transcode failure rate > 5%; AR session spawn failures > 1%; embed proxy 5xx > 1%; code sandbox escape rate > 0.01%; license expiry within 14 days.
- **Documentation updated.** Public docs portal updated; author changelog entry added; security runbook updated per `/docs/07-security-planning.md`; ops runbook covers worker pool scaling.
- **MCP surface complete.** Every feature in #65–#84 has at least one MCP tool tested under capability-claim gating; tool-call transcript visible in audit trail.
- **License tracking enforced.** Expired license blocks publishing; license dashboard surfaces expiry; org-level license scanner runs daily.
- **Localization verified.** `en`, `bn`, `es`, `ja` (with Bangla numerals per §12.4 of pre-development-planning-guide) for any user-facing chrome; LaTeX rendering honors text direction.
- **Performance budgets met.** Hero scene 60 fps on CI reference machine; video transcoding SLAs; LaTeX p50 ≤ 80 ms; code sandbox cold start ≤ 200 ms; audio drift < 40 ms.
- **Demo passed.** Demo script (Section 8) executes end-to-end in internal environment with all expected results.
- **Cross-team sign-off.** Schema review board (Phase 02 owner) approves `model_asset`, `scene`, `camera_keyframe`, `shader`, `video_asset`, `audio_track`, `lottie_asset`, `code_sandbox_policy`, `embed_policy`, `map_style`, `license` schemas; security reviewer (Phase 20) approves model sanitization, CAD sandboxing, embed CSP, code sandbox capability limits, AR token rotation, license tracking; UX lead approves scene editor, CAD import progress UI, and AR handoff QR.
- **Status:** "Internal demo passed" → eligible for "Design partner demo passed."