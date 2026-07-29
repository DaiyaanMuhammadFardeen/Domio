# Section 5 — 3D, Motion & Rich Media

**Codename:** Domio
**Section scope:** Features 65–84
**Cross-references:** §1 (editor canvas), §2 (components), §6 (animation), §7 (prototyping), §9 (presenter), §11 (sharing), §16 (agentic)

This document is the engineering and product plan for the "impossible in PowerPoint" layer. It covers native 3D embedding, scene editing, CAD import, physics, shaders, video, audio, Lottie, screen recording, live app embedding, code execution, LaTeX, maps, and AR handoff — and how each of these is wired into the editor, the data model, the APIs, and the platform's security and performance posture.

---

## 1. Feature-by-Feature Mapping

### F65 — Native 3D model embedding (glTF/GLB/USDZ)

**Acceptance criteria**
- User drags a `.glb`, `.gltf`, or `.usdz` file onto a slide; an embedded 3D viewport appears at the drop position with the model centered and oriented.
- Viewport supports orbit (left-drag), pan (right-drag / two-finger drag), zoom (wheel / pinch).
- "Annotate on stage" tool lets the presenter draw callouts pinned to 3D coordinates (see §2.6), and the annotations follow the model as the camera moves.
- USDZ variant is auto-selected on Safari/iOS where supported; GLB is used elsewhere.
- Model persists as a `model_asset` row with a CDN URL and a normalized scene serialization.

**Behavioral details**
- Default render is WebGL 2 (broad support). WebGPU is used opportunistically when available (see §3.1).
- IBL (image-based lighting) inferred from environment map metadata; falls back to default neutral envmap embedded in the asset bundle.
- Hot cache: model is downloaded once per `model_asset.id` and reused across all slides referencing it.
- Color management: linear-space lighting, sRGB output, with `lossless` toggle for product-color-accurate decks.

**Edge cases**
- Invalid GLB → render placeholder card with "Could not load 3D model" and fail-soft (don't crash slide).
- Geometry > polygon budget → auto-decimation with a confirmation toast ("Reduced from 4.2M to 1.5M tris for performance — restore original").
- Missing textures → show checkerboard so the missing asset is obvious; log a console warning.
- Coordinate-system mismatch (Y-up vs Z-up in some CAD outputs) → autorotate using the model's `up_axis` hint, or fall back to a config flag.

**Dependencies**
- Asset upload pipeline (§4.5).
- 3D engine module (§4.1).
- `model_asset` table (§5.1).
- Presenter mode annotations (§9 cross-ref).

---

### F66 — 3D scene editor (lighting, camera paths, materials, environment maps)

**Acceptance criteria**
- Double-click a 3D viewport to enter the scene editor; a side panel surfaces lights, camera, materials, and environment.
- Editor can add/remove directional, point, and spot lights; drag gizmos update from/to positions in real time.
- Materials editor exposes PBR (base color, roughness, metallic, normal, emissive, occlusion) per mesh/mesh-group.
- Environment map is bounded by 1–4 slots per asset (cheaper than per-light HDRI).
- Camera path is a sequence of `camera_keyframe` records (see §5.3).

**Behavioral details**
- The scene editor is a non-modal overlay; slide-level controls (theme, layout) remain accessible.
- Edits write into the same `scene` JSON document used at runtime, so what you see in the editor is what is rendered during playback.
- 8-bit color values in the UI; linearized internally.
- "Preserve aspect" toggle prevents accidental non-uniform scaling.

**Edge cases**
- Two materials on the same mesh (multi-material) → expose a per-submesh selector.
- Light count > 8 → warn ("Scene lights add GPU cost; consider baking").
- Negative scales → allowed for mirrors but flagged in lint (mirrors confuse naive camera paths).

**Dependencies**
- Scene document schema (§5.2).
- Material / shader registry (§4.4, §6.2).

---

### F67 — Camera keyframes between slides

**Acceptance criteria**
- A user can mark a "matched" 3D model across two consecutive slides; the transition between slides interpolates the camera through a keyframe path (not a slide crossfade).
- Timeline panel shows the keyframe curve; each keyframe is editable (position, target, FOV, roll).
- During presenter mode, the transition plays smoothly at the configured easing (defaults to ease-in-out cubic).
- A "magic move" non-3D fallback exists for users who don't have a 3D model — see also F86 (§6).

**Behavioral details**
- Camera state is a 7-DOF vector: `position(3), target(3), fov(1)`.
- Easing is a bezier (cubic) curve; default `0.42, 0, 0.58, 1`.
- Duration override per-slide, default 0.9s.
- The keyframe timeline is conceptually part of the slide-transition system (§6), but lives on the `scene` document for 3D continuity.

**Edge cases**
- Model changes between slides → fall back to crossfade (no camera move possible).
- If the same model is used but transformed in either slide, the path is computed in the model's local frame to avoid drift.
- VR / AR preview mode (F74) requires the keyframe path to be re-baked per device (see §3.10).

**Dependencies**
- `camera_keyframe` (§5.3).
- Slide transition runtime (§6).

---

### F68 — 3D data visualizations (globe plots, 3D bar terrains, point clouds, network graphs)

**Acceptance criteria**
- A "data → 3D viz" action converts a tabular data source (post-F48) into one of: globe plot, 3D bar terrain, point cloud, network graph.
- Globe plot supports lat/lon points with optional size/heat; arcs between points animate on enter.
- 3D bar terrain uses category X/Y axes and a value Z.
- Point clouds accept large arrays (≥ 1M) with GPU instancing and LOD.
- Network graphs use force-directed or fixed layouts; nodes can be tagged with PBR colors.

**Behavioral details**
- Implemented as a specialized scene archetype within the 3D engine, not a generic chart.
- LOD strategies: instanced billboards for distant points, mesh decimation for high-poly terrains.
- Camera path is autorotating by default; user can override.
- Live data refresh (per F51/F63) re-issues the geometry diff without reloading the model.

**Edge cases**
- 1M points at 5 fps → drop to 2D fallback with a banner.
- Data with > 50 unique categories → auto-aggregation (top 50 + "other").

**Dependencies**
- Data source binding (F48, §4 of §4).
- 3D engine.

---

### F69 — Exploded-view animations

**Acceptance criteria**
- A 3D model with a multi-part hierarchy exposes an "explode" tool that animates each part outward along its centroid axis.
- Per-part override supported so users can adjust the explode distance.
- Animations can be triggered on click (F88) or on slide enter.
- Works with CAD-imported models (F70) and authored GLB models.

**Behavioral details**
- Implementation: pre-compute the centroid of each part, then translate along `(centroid - origin) × scale` in a keyframe clip.
- 0.6s default duration, ease-out cubic.
- Clipping-aware: parts can pass through each other; we do not solve a packing problem (out of scope).

**Edge cases**
- Non-convex part geometries where the centroid is outside the mesh → use the bounding-box center and flag it.
- User-supplied explode axes override centroid logic.

**Dependencies**
- 3D engine, animation timeline (§6).

---

### F70 — CAD file import pipeline (STEP/FBX → optimized web 3D)

**Acceptance criteria**
- User uploads a `.step`, `.stp`, `.iges`, `.igs`, or `.fbx` file.
- Server-side conversion turns it into a glTF 2.0 binary (`.glb`) with tessellated meshes, baked-in PBR materials, and decimation applied to honor the user's polygon budget.
- Job is queued; UI shows progress (parsing → tessellating → decimating → compressing → uploading).
- Converted asset is attached to the deck as a `model_asset` row.

**Behavioral details**
- Pipeline runs in a dedicated worker pool (CAD conversion is CPU-heavy).
- Tessellation: user-configurable chord height (default 0.1 mm) and angular tolerance (default 15°).
- Decimation: target 1.5M tris for product-viz, 250k for thumbnail.
- Materials: STEP colors are preserved as base color; roughness/metallic inferred from part name heuristics (e.g., "*chrome*" → metallic 1.0).
- Format: server stores the original CAD file as `cad_source_url` (for traceability) plus the converted `.glb`.

**Edge cases**
- STEP AP203 vs AP214 vs AP242 — all supported; filename scheme detection after import.
- Extremely large assemblies (> 100 parts) → auto-suggest "import as a single mesh" mode.
- Meshes with no texture coords → fallback to flat color, no warning (common in CAD).
- Conversion failure → keep the original file available, surface error clearly.

**Dependencies**
- CAD conversion server (§4.5).
- Worker queue, ffmpeg-equivalent CAD tools (Open CASCADE + Assimp).

---

### F71 — Physics-enabled elements (falling, bouncing, colliding)

**Acceptance criteria**
- A 3D or 2D element can be marked "physics-enabled"; the editor runtime simulates gravity, friction, and collision.
- Physics is powered by a rapier (preferred) or ammo (fallback) engine integrated into the editor and presenter mode.
- Trigger surface: hit a region of the slide; settle happens automatically; user can pin/freeze elements.

**Behavioral details**
- Rigid-body simulation; soft-body deferred to a later version.
- Fixed timestep 1/60s; deterministic-ish up to the integration tolerance.
- Particle doodads (F72) can drive physics emitters.

**Edge cases**
- Physics on a slide with a complex data binding → either disable physics or freeze the binding.
- High object counts (> 200) → automatic spatial-hash broadphase; warn user.

**Dependencies**
- Physics engine module (§4.5).
- Animation timeline (§6).

---

### F72 — Particle systems and shader backgrounds

**Acceptance criteria**
- Library of preset particle systems (snow, confetti, dust, sparks, brand-tinted "aurora") with brand color slots.
- Custom shader editor for shader backgrounds: drag a fragment shader; live preview; compile errors surfaced inline.
- Shader registry holds user-authored shaders; org admins can publish them to a shared library.

**Behavioral details**
- Particles run on GPU (compute or vertex shader); up to 1M particles per scene budget.
- Shader backgrounds compile to WGSL (WebGPU) and GLSL (WebGL fallback).
- Brand-tinted shaders automatically pull from the deck's theme tokens (F37).

**Edge cases**
- Shader compile failure → falls back to safe-default shader; user sees error.
- Shader uses unsupported extension → banner: "This shader requires `EXT_foo`, not available here."

**Dependencies**
- Shader registry (§6.2).
- GPU shader build chain.

---

### F73 — Scroll/click-driven 3D storytelling sequences

**Acceptance criteria**
- A single 3D scene with multiple camera keyframes can be triggered by either click (next keyframe) or scroll (proportional scrubbing).
- Author sets keyframes to "click points" or "scroll points"; the playback runtime picks the right driver.
- Used for F156 scroll-mode web-share (deck rendered as scrollytelling).

**Behavioral details**
- Conceptually a hybrid of F67 (keyframe interpolation) and F88 (per-element triggers).
- Scroll progress is mapped to a normalized keyframe timeline `[0,1]`.

**Edge cases**
- Scroll past last keyframe → halt at end; click past → wrap or stop (author choice).

**Dependencies**
- §6 animation system, §11 scroll mode.

---

### F74 — AR handoff (QR viewer)

**Acceptance criteria**
- During a presentation, the presenter can enable "AR handoff" on a slide containing a 3D model.
- A QR code appears in the audience view; viewers scan it on their phone and see the model in their own room via WebXR (Android) or Quick Look (iOS).
- The session is single-use and expires after 5 minutes of inactivity or 30 minutes total.

**Behavioral details**
- The QR encodes a signed URL like `https://ar.domio.app/s/{session_id}` with a short-lived token.
- The AR viewer fetches the model asset + scene descriptor from CDN, then hands off to WebXR Session (immersive-ar) or `rel="ar"` (iOS).
- Lighting estimate from the device helps the model sit in the room convincingly.

**Edge cases**
- Phone doesn't support AR → fall back to a 3D viewer in the browser.
- Network loss mid-session → AR session gracefully degrades; model stays in place.

**Dependencies**
- `ar_session` table (§5.11).
- AR viewer (§4.12).

---

### F75 — Video with in-editor trimming, cropping, speed, captions, chaptering

**Acceptance criteria**
- A video element on a slide has a timeline editor with trim handles, crop handles, speed slider (0.25×–4×), and a captions editor (auto-generated from speech-to-text, then editable).
- Chapter markers can be added; each chapter is a clickable scrub point.

**Behavioral details**
- Source is a `video_asset` (H.264/h.265/MP4, or VP9/WebM) on CDN.
- Trims are stored as metadata (in/out points) so they don't require re-encoding; cropping is also metadata (texture UV manipulation).
- Speed changes ⇒ retime audio or drop audio as appropriate.
- Captions: WebVTT stored alongside the asset; revision history per the deck's CRDT model.

**Edge cases**
- Source video is HEVC and the browser doesn't support it → transcode to H.264 on upload (F77/F76 pipeline).
- Trim spans negative time → clamp.

**Dependencies**
- Video pipeline (§4.6).
- Caption editing accessibility (F122).

---

### F76 — Video that plays segments per click

**Acceptance criteria**
- A video element can be split into named segments; clicking advances to the next segment rather than playing the whole video.
- Each segment can have its own in/out points and a per-segment trigger (e.g., show a callout).

**Behavioral details**
- Segments are first-class on the timeline; segment transitions respect the slide's animation triggers (F88).
- "Play next 8 seconds" is a built-in shortcut.

**Edge cases**
- User clicks during a segment → configurable: continue, skip, or pause.

**Dependencies**
- Animation triggers (§6).

---

### F77 — Background video with smart text-contrast protection

**Acceptance criteria**
- A video placed as a slide background automatically generates a "contrast map" per region.
- Text overlaid on the video is auto-styled (text-shadow, color shift, or applied scrim) so that it remains WCAG AA-contrast against the current frame.

**Behavioral details**
- Contrast map is computed every N frames (default 5) on the client; cheap enough to do in a Web Worker.
- User can override the auto-style and lock the chosen style.

**Edge cases**
- Text on a fast-changing scene → toggle "use the worst-case frame" mode.

**Dependencies**
- Editor canvas (§1), accessibility F122.

---

### F78 — Audio tracks, voiceover recording per slide, ambient soundscapes

**Acceptance criteria**
- A slide can host: a voiceover recording (made in-editor, per F80), a background music track, and an ambient soundscape (mix of multiple short loops).
- Audio mixer panel: per-track volume, pan, fade-in/out, mute, solo.
- Voiceover is auto-aligned to slide enter (F88) by default.

**Behavioral details**
- Mixing is done client-side via Web Audio API; the output is also encoded into a stereo bus for export.
- Live captioning of voiceover (F122) runs on a web worker.

**Edge cases**
- Audio drift across slides (F78 + sync issue) → see §3.8 for the drift budget.

**Dependencies**
- Audio engine (§4.7).

---

### F79 — Lottie/Rive interactive vector animations with state machines

**Acceptance criteria**
- A Lottie (JSON) or Rive (`.riv`) file is droppable onto a slide and plays inline.
- Rive files expose a state machine; the editor shows a "Send trigger" panel so users can transition states from a click, hover, or data change.
- Lottie animations can be wired to a variable (e.g., `progress: 0.5` → scrub to 50%).

**Behavioral details**
- Lottie runtime: lottie-web (or lottie-react).
- Rive runtime: @rive-app/canvas, with state machine controls.
- Both expose a poster frame for non-playing contexts.

**Edge cases**
- Animation with embedded raster textures → those textures are uploaded as separate `model_asset`-style assets.
- Heavy Rive file (> 5MB) → S3-stored, with a CDN url.

**Dependencies**
- `lottie_asset` table (§5.7).

---

### F80 — Screen-recording capture built in

**Acceptance criteria**
- From a slide, "Record screen" enters a capture mode that records the user's chosen screen/window/tab plus optional microphone audio.
- Recording produces a `video_asset` (WebM/VP9 or MP4/H.264) plus a separate audio track.
- Recording can be paused, resumed, and trimmed before insertion.

**Behavioral details**
- Uses `navigator.mediaDevices.getDisplayMedia` plus optionally `getUserMedia` for mic.
- Encoder falls back between hardware and software paths; quality target ~8 Mbps for 1080p.
- Recording is client-side; the file is uploaded to video pipeline after the user clicks "Save."

**Edge cases**
- Permission denied → user is shown how to allow screen capture in their browser.
- Recording interrupted → file is saved as a draft; user can resume.

**Dependencies**
- MediaRecorder API; video pipeline (§4.6).

---

### F81 — Live app embedding (iframe sandbox)

**Acceptance criteria**
- A slide can contain an iframe that points to a permitted internal app (e.g., the company's own product).
- Viewer can click through the iframe live inside the slide (e.g., click a button in the embedded product).
- Embed policy is per-deck, set by the deck author or an org admin.

**Behavioral details**
- iframe is served with `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` (configurable; the org policy may tighten).
- Auth passthrough: a signed JWT is appended to the embed URL; the embedded app verifies it.
- Communication: `postMessage` between the embedding deck and the embedded app, with origin allowlists enforced on both sides.

**Edge cases**
- Embedded app triggers a navigation → captured by the iframe sandbox; can be allowed per-org policy.
- Embedded app steals focus → configurable "trap focus" mode for kiosk use (F218).

**Dependencies**
- Live app embed proxy (§4.8).
- `embed_policy` (§5.9).

---

### F82 — Code blocks with syntax highlighting, line-step reveal, and runnable JS snippets

**Acceptance criteria**
- A slide can host a code block with syntax highlighting (read-only) and a separate "runnable" mode that executes JS in a sandboxed worker.
- Line-step reveal: animate code lines one at a time on click.
- Runnable snippets have a configurable sandbox policy (e.g., "no network," "no DOM," "console-only").

**Behavioral details**
- Highlight: Shiki (or Monaco editor's highlighter) on the client; no server round-trip needed.
- Sandboxed JS: Web Worker + QuickJS (preferred) or a V8 isolate (Cloudflare-style) for stricter isolation.
- Output is captured via `console.log` interception; an artifact stream is shown in the slide.

**Edge cases**
- User code exceeds the memory/time budget → terminate with a "Killed (8s timeout)" notice.
- Code spawns infinite loops → no impact on the main thread (worker isolation).

**Dependencies**
- `code_sandbox_policy` table (§5.8).
- Code sandbox service (§4.9).

---

### F83 — Math/LaTeX rendering for scientific decks

**Acceptance criteria**
- A slide can host a LaTeX block (`$...$` inline, `$$...$$` block).
- Rendering is high-fidelity, fast, and reliable across browsers.

**Behavioral details**
- Render path: server-side MathJax (KaTeX-compatible output) on the edge, returning SVG/HTML. Client-side KaTeX for inline editing.
- Caching: every computed LaTeX expression is cached on the CDN keyed by the LaTeX source + theme tokens.

**Edge cases**
- Untrusted LaTeX (from untrusted users) → characters restricted to safe math subset (no `\input`, no `\href{}`).

**Dependencies**
- LaTeX render service (§4.10).
- `latex_doc` table (§5.9).

---

### F84 — Maps: interactive (zoom/pan/markers/choropleths) with live location data

**Acceptance criteria**
- A slide can host a map showing markers, polygons, choropleths, and live data.
- Map provider is configurable (Mapbox, Google Maps, OpenStreetMap-based providers like MapLibre).
- Live data: maps subscribe to a data source (F48) and refresh markers/polygons when data changes.

**Behavioral details**
- Map style is a deck-level choice (`map_style` row), with org-level overrides.
- Choropleths use a TopoJSON/GeoJSON source uploaded by the user, joined to the data source.
- Pan/zoom are remembered per-slide so re-entering the slide restores the view.

**Edge cases**
- Provider quota reached → fallback to a degraded style with a banner.
- Map provider key invalid → fall back to the OSM-based default.

**Dependencies**
- Map provider adapter (§4.11).
- `map_style` table (§5.10).

---

## 2. UX Flows

### 2.1 Drop a 3D model onto a slide

```
[User]                                   [Editor]
   |                                          |
   |  drag .glb from desktop ----------------→ |
   |                                          | detect 3D MIME → spawn 3D viewport
   |  release on slide                        |
   |                                          | upload model_asset (background)
   |  ←--- viewport appears with model -------|
   |                                          | default envmap + lights
   |  double-click                            |
   |                                          | enter scene editor
   |  edit materials / lights                 |
   |                                          | write to scene JSON
   |  click outside                           |
   |                                          | exit scene editor
   |                                          |
   |  press P (play)                          |
   |                                          | render with cam keyframe
```

Key moments:
- The viewport appears *before* the upload finishes, with a placeholder mesh (a wireframe bbox) so the user can position immediately.
- The viewport reads a `model_asset.thumbnail` once available.

### 2.2 Scene editing

The scene editor is a side panel + a manipulated 3D viewport. The user can:
1. Add a directional light (drag gizmo for position; rotate ring for direction).
2. Select a mesh and open Materials.
3. Adjust roughness/metallic via sliders, with a live update.
4. Add a camera keyframe; preview by clicking the "play" between two keyframes; tweak bezier handles.
5. Save (auto-saved).

### 2.3 CAD import

```
[User]                          [Editor]                     [CAD Service]
   |                                 |                              |
   |  drop .step ------------------→ |                              |
   |                                 | POST /cad_jobs (multipart) → |
   |                                 |                              | parse (OpenCASCADE)
   |                                 |                              | tessellate
   |                                 |                              | decimate
   |                                 |                              | glTF encode
   |                                 |                              | upload to CDN
   |   “Processing…”                  | ←--- job_id + WS subscription
   |                                 |                              |
   |                                 | ←--- progress: 35% ----------|
   |                                 | ←--- progress: 80% ----------|
   |                                 | ←--- done: glb_url ----------|
   | ←--- 3D viewport appears ----- |                              |
   |                                 |                              |
   | (failure)                       | ←--- error: tessellation ----|
   | ←--- error card --------------- |                              |
```

The user sees a progress toast with three states: Parsing, Meshing, Optimizing. Cancel is available at any state.

### 2.4 Record a video in-editor

1. User clicks "Record" on a slide.
2. Browser shows the screen-picker (`getDisplayMedia`).
3. User picks a screen + checks "Also record mic."
4. Recording starts; a control bar shows pause/resume/stop.
5. User stops; recording is previewed.
6. Trim handles appear; user trims.
7. User clicks "Insert" → file uploads to the video pipeline; the slide now has a video element.

### 2.5 Embed a live app

1. User clicks "Embed" → "Live app."
2. A dialog asks for the URL and the embed policy.
3. The policy is checked against the org's allowlist.
4. An iframe is placed on the slide.
5. The user can drag/resize it.
6. In presenter mode, the embedded app is interactive; outside presenter mode it's a static snapshot.

### 2.6 Annotate 3D live on stage

1. Presenter clicks the "Annotate" pen on a 3D slide.
2. The pointer is captured in 3D space at the surface of the model (raycast).
3. The presenter draws the annotation; it appears as a 3D-space spline plus a leader line to a 2D label.
4. The annotation is broadcast to the audience view (F17).
5. Annotation state is stored in the deck's CRDT, so it's part of the presentation record (F205).

### 2.7 Render LaTeX

1. User types `$\nabla \cdot E = \rho / \epsilon_0$` in a text block.
2. The text editor recognizes the LaTeX delimiter and renders it inline.
3. Editing the LaTeX triggers a server-side render (cached); the editor shows the rendered math.
4. If the LaTeX is invalid, the editor shows a small error squiggle and the source text.

---

## 3. Functional & Non-Functional Requirements

### 3.1 WebGL vs WebGPU

- **Default:** WebGL 2 (broad support, mature ecosystem).
- **WebGPU** is used when the browser supports it (Chrome 113+, Safari 17+, Edge 113+). It enables:
  - Compute shaders for particle systems (F72) → 5× higher particle counts.
  - Lower CPU overhead for large scenes.
- **Decision rule:** feature-detect on startup; once a deck is rendered in WebGPU, persist a per-asset flag so subsequent reloads reuse the same path. If a WebGPU context is lost, fall back to WebGL and report.

### 3.2 Model formats and budgets

| Format | Read | Write | Notes |
|---|---|---|---|
| GLB (binary glTF 2.0) | ✓ | ✓ | Primary format. |
| glTF (JSON + buffers) | ✓ | – | Same as GLB, uncompressed. |
| USDZ | ✓ (iOS) | – | For AR fallback. |
| STEP / STP / IGES | ✓ (via CAD pipeline) | – | Converted to GLB. |
| FBX | ✓ (via CAD pipeline) | – | Converted to GLB. |
| OBJ | ✓ (legacy) | – | Converted to GLB. |

Polygon and texture budgets (per asset, per slide):

| Tier | Triangles | Textures | Total texture memory |
|---|---|---|---|
| Hero (single 3D model on a slide) | 1.5M | 8 | 256 MB |
| Standard | 250k | 4 | 64 MB |
| Background | 50k | 2 | 16 MB |
| Multi-model slide | 500k total | 4 | 128 MB |

Above budget → auto-decimation on upload (configurable per-org).

### 3.3 Video codec & transcode pipeline

- **Inputs accepted:** MP4 (H.264/HEVC), WebM (VP9/AV1), MOV.
- **Storage of source:** original kept as `video_asset.source_url`.
- **Playback rendition:** H.264 1080p at 5 Mbps as the default; HEVC for Apple targets; AV1 for bandwidth-constrained.
- **Pipeline:** ffmpeg on a worker service (§4.6).
- **Streaming:** HLS as primary; DASH as a secondary option for orgs that prefer it.

### 3.4 Audio capture

- `getUserMedia({audio: true})` for mic.
- 48 kHz, mono, AAC-LC at 128 kbps for the voiceover channel.
- Multi-track mix (voiceover + music + ambient) → stereo bus at 192 kbps.

### 3.5 Screen recording capture

- `getDisplayMedia` for screen + optional mic.
- Encoder: VP9 in WebM (small, royalty-free) at 8 Mbps or H.264 in MP4 at 10 Mbps.
- Bitrate auto-scales to the captured resolution.

### 3.6 Sandboxed iframe embedding limits

- `sandbox` attribute always present; denied by default.
- Org policy lists allowed origins.
- Per-deck overrides require org-admin privileges.
- `postMessage` traffic is origin-pinned and validated against a JSON schema.

### 3.7 Code sandbox (JS) limits

- Hard wall-clock timeout: 8s (configurable).
- Memory cap: 64 MB.
- No `fetch`, no `XMLHttpRequest`, no `importScripts` by default.
- No access to `window`, `document`, `localStorage` of the host.
- Web Worker + QuickJS preferred; V8 isolate for stricter needs.

### 3.8 LaTeX render service

- Edge functions (Vercel/Cloudflare Workers) running MathJax-node (or KaTeX server).
- Output: HTML (preferred for inline) or SVG (preferred for export).
- Cache TTL: 30 days, keyed by source + theme.

### 3.9 Map provider options & quotas

| Provider | Quota (default) | Cost | Notes |
|---|---|---|---|
| Mapbox | 50k loads/mo | $$ | Default for prebuilt styles. |
| Google Maps | $200/mo credit | $$ | For customers already in Google ecosystem. |
| MapLibre + OSM | unlimited self-host | free | For orgs that want full control. |
| Custom tile server | per-org | $ | Enterprise. |

- Quota reaching the limit → fallback to a simpler style (no satellite, no 3D buildings).

### 3.10 AR handoff QR flow

- Presenter clicks "Send to AR" on a slide with a 3D model.
- Server generates a token-bound session (15-byte JWT, 30-min TTL).
- QR is rendered into the audience view.
- Viewer scans; their phone opens the AR viewer.
- The AR viewer fetches the asset bundle (CDN) and the scene descriptor.
- WebXR session (Android) or AR Quick Look (iOS) takes over.

---

## 4. Architecture

### 4.1 3D engine module

**Choice:** Three.js as the primary renderer, with a thin abstraction so we can swap to Babylon.js or a custom WebGPU renderer later.

Three.js reasons:
- Largest ecosystem, broad format coverage (GLTFLoader, FBXLoader, OBJLoader, USDZLoader).
- Mature performance characteristics.
- Easy to integrate with custom shaders.

Babylon.js is the fallback if Three.js chokes on a specific scene (e.g., heavy GUI overlays).

### 4.2 Scene editor

A purpose-built in-editor UI:
- Side panel: lights, cameras, materials, environment maps.
- Inline gizmos (transform, rotate, scale) via Three.js `TransformControls`.
- A scene-graph tree (mirrors the GLTF node hierarchy).
- Rollback via the deck's CRDT (changes are reverting without affecting other editors).

### 4.3 Camera keyframe timeline

- Lives on the `scene` document.
- UI: a small timeline panel in the scene editor; each keyframe is a draggable handle.
- Interpolation: cubic bezier; sampling at 60Hz for playback.
- Storage: `camera_keyframe` rows (§5.3) with a `slide_id` and an `order` field.

### 4.4 CAD import pipeline (server-side)

```
[Upload] → [Object store] → [CAD worker] → [glTF asset] → [CDN]
                                ↑
                          [Job queue]
```

- CAD worker is a Node.js process that runs OpenCASCADE (via `opencascade.js` or a native binding) and Assimp.
- Each job is one CAD file → one GLB; multiple parts result in a multi-mesh GLB.
- Failure handling: keep the original file; surface error to the user.

### 4.5 Physics engine

- **Primary:** rapier (Rust, compiled to WASM, fast).
- **Fallback:** ammo.js (WASM build of Bullet).
- Integration: each physics-enabled element gets a body; the 3D engine syncs transforms each frame.

### 4.6 Video pipeline

- **Service:** a Kubernetes-deployed ffmpeg worker pool.
- **Job types:** `transcode`, `thumbnail`, `caption_extract`, `waveform`.
- **Queue:** Redis-backed BullMQ (or Sidekiq on Ruby if the rest of the backend is Rails).
- **Outputs:** HLS variants (240p, 480p, 720p, 1080p), poster image, captions (WebVTT), waveform JSON.

### 4.7 Audio mixer

- Web Audio API on the client.
- One MediaStreamDestination per slide; the audio bus mixes tracks.
- For export, the mix is encoded to AAC stereo.

### 4.8 Live app embed proxy

- A thin reverse proxy that:
  - Rewrites the iframe URL to a Domio-controlled domain (`embed.domio.app`).
  - Strips cookies from the iframe context.
  - Verifies the target origin against the org's allowlist.
  - Adds a `Sec-Fetch-Dest: iframe` and a CSP `frame-ancestors` directive.

### 4.9 Code sandbox

- **Runtime:** Web Worker + QuickJS (mostly) or V8 isolate (for stronger isolation).
- Communication: `postMessage` only; the host worker is a separate realm.
- Per-policy limits (cpu, memory, network) are enforced at the worker.

### 4.10 LaTeX server

- Edge function (Cloudflare Workers or V8 isolates) running MathJax-node.
- Cache: Cloudflare KV or Redis with a 30-day TTL.
- Output formats: HTML (inline), SVG (CSS-friendly), PNG (for thumbnails).

### 4.11 Map provider adapter

- One adapter interface per provider, with a common internal API:
  - `loadStyle(styleId)`
  - `addMarker(layer, opts)`
  - `setData(layer, data)`
  - `flyTo(coords)`
- Adapters: Mapbox, Google Maps, MapLibre, custom tile server.

### 4.12 AR viewer

- A standalone web app at `ar.domio.app`.
- On load: parses the session token, fetches the asset bundle.
- Tries WebXR first; if not supported, falls back to `<model-viewer>` with AR support.
- iOS: uses `rel="ar"` to launch AR Quick Look.

---

## 5. Data Model

### 5.1 `model_asset`

```sql
CREATE TABLE model_asset (
  id              UUID PRIMARY KEY,
  workspace_id    UUID NOT NULL REFERENCES workspace(id),
  uploader_id     UUID NOT NULL REFERENCES user(id),
  name            TEXT NOT NULL,
  format          TEXT NOT NULL CHECK (format IN ('glb','gltf','usdz','step','stp','iges','igs','fbx','obj')),
  source_url      TEXT NOT NULL,         -- CDN URL of the original file
  derived_url     TEXT NOT NULL,         -- CDN URL of the GLB rendition
  thumbnail_url   TEXT,
  poly_count      INTEGER NOT NULL,
  texture_count   INTEGER NOT NULL,
  has_animations  BOOLEAN NOT NULL DEFAULT FALSE,
  cad_source_url  TEXT,                  -- for CAD-derived assets
  license_id      UUID REFERENCES license(id),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON model_asset (workspace_id);
CREATE INDEX ON model_asset (format);
```

### 5.2 `scene`

```sql
CREATE TABLE scene (
  id              UUID PRIMARY KEY,
  model_asset_id  UUID NOT NULL REFERENCES model_asset(id),
  environment     JSONB NOT NULL DEFAULT '{}'::jsonb,
  lights          JSONB NOT NULL DEFAULT '[]'::jsonb,
  cameras         JSONB NOT NULL DEFAULT '[]'::jsonb,
  materials       JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON scene (model_asset_id);
```

### 5.3 `camera_keyframe`

```sql
CREATE TABLE camera_keyframe (
  id              UUID PRIMARY KEY,
  slide_id        UUID NOT NULL REFERENCES slide(id),
  scene_id        UUID REFERENCES scene(id),
  order_index     INTEGER NOT NULL,
  position        JSONB NOT NULL,        -- {x, y, z}
  target          JSONB NOT NULL,        -- {x, y, z}
  fov             REAL NOT NULL,
  roll            REAL NOT NULL DEFAULT 0,
  easing          JSONB NOT NULL,        -- bezier control points
  duration_ms     INTEGER NOT NULL,
  trigger         TEXT NOT NULL DEFAULT 'auto' CHECK (trigger IN ('auto','click','scroll','data')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON camera_keyframe (slide_id, order_index);
```

### 5.4 `shader`

```sql
CREATE TABLE shader (
  id              UUID PRIMARY KEY,
  workspace_id    UUID NOT NULL REFERENCES workspace(id),
  author_id       UUID NOT NULL REFERENCES user(id),
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('background','particle','material','post')),
  source_wgsl     TEXT NOT NULL,
  source_glsl     TEXT NOT NULL,
  inputs          JSONB NOT NULL DEFAULT '{}'::jsonb,
  published       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON shader (workspace_id, kind);
```

### 5.5 `video_asset`

```sql
CREATE TABLE video_asset (
  id              UUID PRIMARY KEY,
  workspace_id    UUID NOT NULL REFERENCES workspace(id),
  uploader_id     UUID NOT NULL REFERENCES user(id),
  name            TEXT NOT NULL,
  source_url      TEXT NOT NULL,
  hls_url         TEXT,
  dash_url        TEXT,
  duration_ms     INTEGER NOT NULL,
  width           INTEGER NOT NULL,
  height          INTEGER NOT NULL,
  has_audio       BOOLEAN NOT NULL,
  captions_url    TEXT,
  thumbnail_url   TEXT,
  waveform_url    TEXT,
  license_id      UUID REFERENCES license(id),
  transcode_state TEXT NOT NULL DEFAULT 'pending' CHECK (transcode_state IN ('pending','processing','ready','failed')),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON video_asset (workspace_id);
CREATE INDEX ON video_asset (transcode_state);
```

### 5.6 `audio_track`

```sql
CREATE TABLE audio_track (
  id              UUID PRIMARY KEY,
  slide_id        UUID REFERENCES slide(id),
  workspace_id    UUID NOT NULL REFERENCES workspace(id),
  uploader_id     UUID NOT NULL REFERENCES user(id),
  kind            TEXT NOT NULL CHECK (kind IN ('voiceover','music','ambient','sfx')),
  source_url      TEXT NOT NULL,
  duration_ms     INTEGER NOT NULL,
  volume          REAL NOT NULL DEFAULT 1.0,
  fade_in_ms      INTEGER NOT NULL DEFAULT 0,
  fade_out_ms     INTEGER NOT NULL DEFAULT 0,
  license_id      UUID REFERENCES license(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON audio_track (slide_id);
```

### 5.7 `lottie_asset`

```sql
CREATE TABLE lottie_asset (
  id              UUID PRIMARY KEY,
  workspace_id    UUID NOT NULL REFERENCES workspace(id),
  uploader_id     UUID NOT NULL REFERENCES user(id),
  name            TEXT NOT NULL,
  format          TEXT NOT NULL CHECK (format IN ('lottie','rive')),
  source_url      TEXT NOT NULL,
  width           INTEGER NOT NULL,
  height          INTEGER NOT NULL,
  state_machine   JSONB,                 -- for Rive files
  license_id      UUID REFERENCES license(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON lottie_asset (workspace_id, format);
```

### 5.8 `code_sandbox_policy`

```sql
CREATE TABLE code_sandbox_policy (
  id              UUID PRIMARY KEY,
  workspace_id    UUID NOT NULL REFERENCES workspace(id),
  name            TEXT NOT NULL,
  max_cpu_ms      INTEGER NOT NULL DEFAULT 8000,
  max_memory_mb   INTEGER NOT NULL DEFAULT 64,
  allow_network   BOOLEAN NOT NULL DEFAULT FALSE,
  allow_dom       BOOLEAN NOT NULL DEFAULT FALSE,
  allow_console   BOOLEAN NOT NULL DEFAULT TRUE,
  allow_import    BOOLEAN NOT NULL DEFAULT FALSE,
  module_allowlist JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON code_sandbox_policy (workspace_id);
```

### 5.9 `embed_policy`

```sql
CREATE TABLE embed_policy (
  id              UUID PRIMARY KEY,
  workspace_id    UUID NOT NULL REFERENCES workspace(id),
  name            TEXT NOT NULL,
  allowed_origins JSONB NOT NULL DEFAULT '[]'::jsonb,
  sandbox_flags   TEXT NOT NULL DEFAULT 'allow-scripts allow-same-origin allow-forms',
  jwt_required    BOOLEAN NOT NULL DEFAULT TRUE,
  jwt_audience    TEXT,
  trap_focus      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.10 `latex_doc`

```sql
CREATE TABLE latex_doc (
  id              UUID PRIMARY KEY,
  workspace_id    UUID NOT NULL REFERENCES workspace(id),
  source          TEXT NOT NULL,
  rendered_html   TEXT NOT NULL,
  rendered_svg    TEXT,
  theme_hash      TEXT NOT NULL,
  cache_key       TEXT NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON latex_doc (cache_key);
```

### 5.11 `map_style`

```sql
CREATE TABLE map_style (
  id              UUID PRIMARY KEY,
  workspace_id    UUID NOT NULL REFERENCES workspace(id),
  name            TEXT NOT NULL,
  provider        TEXT NOT NULL CHECK (provider IN ('mapbox','google','maplibre','custom')),
  style_url       TEXT NOT NULL,
  api_key_id      UUID REFERENCES map_api_key(id),
  default_zoom    REAL NOT NULL DEFAULT 2,
  default_lng     REAL NOT NULL DEFAULT 0,
  default_lat     REAL NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON map_style (workspace_id);
```

### 5.12 `ar_session`

```sql
CREATE TABLE ar_session (
  id              UUID PRIMARY KEY,
  slide_id        UUID NOT NULL REFERENCES slide(id),
  model_asset_id  UUID NOT NULL REFERENCES model_asset(id),
  token           TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON ar_session (expires_at);
```

### 5.13 `license`

```sql
CREATE TABLE license (
  id              UUID PRIMARY KEY,
  workspace_id    UUID NOT NULL REFERENCES workspace(id),
  name            TEXT NOT NULL,
  source          TEXT NOT NULL,         -- e.g., 'unsplash', 'pexels', 'user-upload'
  terms_url       TEXT,
  expires_at      TIMESTAMPTZ,
  seats           INTEGER,               -- if limited
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 6. APIs and Contracts

### 6.1 Model upload

```
POST /api/v1/models/upload
Content-Type: multipart/form-data
Authorization: Bearer <jwt>

Accepts: .glb, .gltf, .usdz, .step, .stp, .iges, .igs, .fbx, .obj
Response: 202 Accepted
{
  "model_asset_id": "uuid",
  "status_url": "/api/v1/models/{id}/status",
  "format_detected": "step",
  "estimated_seconds": 120
}
```

### 6.2 CAD conversion job

```
POST /api/v1/cad_jobs
{
  "model_asset_id": "uuid",
  "tessellation_chord_mm": 0.1,
  "tessellation_angle_deg": 15,
  "target_poly_count": 250000,
  "format": "glb"
}

Response: 201 Created
{
  "job_id": "uuid",
  "websocket_url": "wss://api.domio.app/cad_jobs/{id}/stream"
}
```

### 6.3 Shader registry

```
GET    /api/v1/shaders?workspace_id=...&kind=...
POST   /api/v1/shaders           { name, kind, source_wgsl, source_glsl, inputs }
PUT    /api/v1/shaders/{id}      { name?, source_wgsl?, source_glsl?, inputs? }
POST   /api/v1/shaders/{id}/publish
DELETE /api/v1/shaders/{id}
```

### 6.4 Video transcode job

```
POST /api/v1/video_jobs
{
  "video_asset_id": "uuid",
  "renditions": ["240p","480p","720p","1080p"],
  "extract_captions": true,
  "extract_waveform": true
}

Response: 202 Accepted
{
  "job_id": "uuid",
  "status_url": "/api/v1/video_jobs/{id}"
}
```

### 6.5 Embed policy CRUD

```
GET    /api/v1/embed_policies?workspace_id=...
POST   /api/v1/embed_policies           { name, allowed_origins, sandbox_flags, ... }
PUT    /api/v1/embed_policies/{id}
DELETE /api/v1/embed_policies/{id}
```

### 6.6 Sandbox policy

```
GET    /api/v1/sandbox_policies?workspace_id=...
POST   /api/v1/sandbox_policies           { name, max_cpu_ms, max_memory_mb, ... }
PUT    /api/v1/sandbox_policies/{id}
DELETE /api/v1/sandbox_policies/{id}

POST   /api/v1/sandbox/run
{
  "policy_id": "uuid",
  "code": "console.log(1+1)",
  "language": "js"
}
Response: 200 OK
{
  "stdout": "2\n",
  "stderr": "",
  "exit_code": 0,
  "duration_ms": 12
}
```

### 6.7 Map style

```
GET    /api/v1/map_styles?workspace_id=...
POST   /api/v1/map_styles           { name, provider, style_url, ... }
PUT    /api/v1/map_styles/{id}
DELETE /api/v1/map_styles/{id}
```

### 6.8 AR session

```
POST /api/v1/ar_sessions
{
  "slide_id": "uuid",
  "model_asset_id": "uuid"
}

Response: 201 Created
{
  "session_id": "uuid",
  "token": "string",
  "audience_url": "https://ar.domio.app/s/{session_id}",
  "expires_at": "2026-07-29T16:30:00Z"
}
```

### 6.9 LaTeX render

```
POST /api/v1/latex/render
{
  "source": "\\nabla \\cdot E = \\rho / \\epsilon_0",
  "format": "html",
  "theme_hash": "abc123"
}

Response: 200 OK
{
  "rendered": "<span class=\"mord\">...</span>",
  "cache_key": "abc123..."
}
```

---

## 7. Security

### 7.1 Model sanitization

- Models are parsed by a hardened loader; the loader strips:
  - Embedded JavaScript (rare in glTF, but possible in custom extensions).
  - External `KHR_xmp_json_ld` references (can leak data).
  - Custom glTF extensions are opted-in per workspace.
- Textures are scanned for steganographic payloads (best-effort; this is a defense-in-depth, not a guarantee).
- All mesh data is checked against the polygon budget; over-budget assets are decimated.

### 7.2 CAD conversion sandboxing

- CAD conversion runs in a worker process with no network access.
- File size cap: 500 MB.
- The worker is restartable; memory limits enforced via cgroups.
- The original CAD file is kept in a quarantined bucket for 7 days before being moved to long-term storage.

### 7.3 Embed origin allowlists and CSP

- The org's `embed_policy` lists allowed origins.
- Each embed URL is signed; the iframe is served by the Domio proxy with a CSP:
  - `frame-ancestors 'self' https://*.domio.app`
  - `default-src 'none'`
  - `script-src 'self' https://embed.domio.app`
- `postMessage` events are origin-validated; payload shape is validated against a JSON schema.

### 7.4 Code sandbox capability limits

- Web Workers are isolated realms; no access to the host DOM.
- QuickJS sandbox: no `fetch`, no `XMLHttpRequest`, no `importScripts` by default.
- Per-policy CPU and memory caps are enforced.
- Output is rate-limited (1MB stdout cap per run).

### 7.5 AR session expiration

- Tokens expire after 30 minutes total or 5 minutes of inactivity.
- The session is also invalidated when the presenting session ends.
- Tokens are short JWTs signed by a key that rotates per session.

### 7.6 License tracking for stock media

- Every `model_asset`, `video_asset`, `audio_track`, and `lottie_asset` has a `license_id`.
- The dashboard surfaces:
  - "32 assets under Unsplash license"
  - "5 assets require attribution; here's the credit text"
  - "License X expires in 14 days; please review"
- Enforcement: an asset cannot be inserted into a published deck if its license is expired (unless the user confirms).

---

## 8. Performance

### 8.1 GPU budget per slide

- 16ms frame budget at 60 FPS.
- For a "hero" 3D slide: 1.5M triangles, 4 lights, 1 camera path, 1 particle system (≤ 250k particles).
- For a "standard" slide: 250k tris, 2 lights, 0 particle systems.
- For a "background" 3D object: 50k tris, 1 light.

### 8.2 LOD strategy

- Each model can have multiple LOD levels (LOD0, LOD1, LOD2, LOD3).
- LOD is selected based on screen-space size (number of pixels the model occupies).
- LODs are auto-generated at upload time using gltf-transform.
- For "background" usage, only LOD2 is loaded.

### 8.3 Transcoding queue

- BullMQ (Redis) for video jobs.
- Worker pool: 4 GPU instances per region, scaling on demand.
- Priority: presenter-mode decks (live) > scheduled presentations > background uploads.

### 8.4 Video streaming (HLS/DASH)

- HLS variants: 240p, 480p, 720p, 1080p.
- The client picks the right variant based on `Network Information API` and bandwidth estimation.
- DASH is offered for orgs that prefer it; default is HLS.

### 8.5 Audio sync drift budget

- During playback, audio and video drift must remain < 40ms.
- The mixer uses a `PannerNode` and `AudioContext.currentTime` to sync precisely.
- Drift is monitored; if drift exceeds 40ms, a re-sync is triggered.

### 8.6 Code sandbox warm-up

- Web Workers are kept warm for the duration of a deck presentation.
- A pre-warm queue starts workers when the user enters presenter mode.
- Worst-case cold start: 200ms.

### 8.7 Map tile pre-fetch

- For a slide with a map, the surrounding tiles (at the default zoom) are pre-fetched when the slide is edited.
- During presenter mode, the tiles are pre-fetched for the next 3 slides too.

---

## 9. Observability and Testing

### 9.1 Metrics

- Per-asset metrics:
  - `model_asset.load_p50_ms`, `model_asset.load_p95_ms`
  - `video_asset.transcode_seconds`
  - `latex.render_p50_ms`
  - `sandbox.run_p50_ms`
- Per-feature metrics:
  - `cad_jobs.active_count`, `cad_jobs.queue_depth`
  - `video_jobs.active_count`, `video_jobs.queue_depth`
  - `ar_sessions.active_count`
  - `embed_proxy.requests_per_second`

### 9.2 Logs

- Structured JSON logs with these fields:
  - `request_id`, `workspace_id`, `user_id`, `asset_id`
  - `event`: `model.uploaded`, `video.transcoded`, `ar.session_started`, etc.
- Logs are retained for 30 days; aggregated for 1 year.

### 9.3 Tracing

- OpenTelemetry tracing across:
  - Editor → upload service → CAD worker → CDN.
  - Editor → video pipeline → HLS packager → CDN.
  - Editor → LaTeX edge → cache.
- Trace IDs are propagated end-to-end.

### 9.4 Alerts

- CAD queue depth > 50 for 10 minutes → page on-call.
- Video transcode failure rate > 5% → page on-call.
- AR session spawn failures > 1% → page on-call.
- Embed proxy 5xx > 1% → page on-call.

### 9.5 Testing

- **Unit tests:** 3D engine module, scene editor, camera keyframe interpolator, shader compiler, video pipeline (mocked).
- **Integration tests:** upload → render, CAD job → GLB, video transcoding end-to-end.
- **Visual regression tests:** for each preset 3D scene, capture a screenshot and compare against a baseline.
- **Performance tests:** a 1.5M-triangle hero model must render at 60 FPS on a mid-tier laptop (Intel Iris Xe).
- **Security tests:** model sanitization (try to upload a hostile GLB), CAD sandbox (try to escape), embed proxy (try to bypass origin allowlist), code sandbox (try to break out).
- **Test data:** synthetic GLBs, FBX samples, Lottie samples; Git LFS for the larger ones.

---

## 10. Cross-Section Ties

### 10.1 Editor canvas (Section 1)

- The 3D viewport is a first-class element on the infinite canvas (F1).
- It participates in selection, alignment, smart guides (F3), and constraints (F8).
- The 3D viewport is recorded into the visual history (F12) and the version history (F20).

### 10.2 Components (Section 2)

- A "3D model" can be a component (F26), with instance overrides for position, rotation, and material.
- A "video" element can be a component, with overrides for trim and start time.
- A "Lottie animation" can be a component, with overrides for the value bound to a state.

### 10.3 Animation timelines (Section 6)

- Camera keyframes (F67) are part of the slide timeline.
- Particle and shader animations (F72) are part of the slide timeline.
- "Magic move" (F86) for 3D slides is the camera keyframe path.

### 10.4 Prototyping interactive states (Section 7)

- Click-driven 3D storytelling (F73) is implemented as a click trigger on the timeline.
- Hover-driven 3D interactions are supported via Rive state machines (F79).
- 3D scenes can be embedded in device frames (F103) for product mockups.

### 10.5 Presenter mode (Section 9)

- The presenter view shows the 3D viewport with annotations (F128).
- Live "AR handoff" (F74) is shown in the presenter view.
- The embedded live app (F81) is interactive in presenter mode.

### 10.6 Sharing embeds (Section 11)

- A shared deck renders 3D scenes in the share view (F155).
- For AR, the audience scans a QR (F74).
- "Video export" (F163) renders the 3D scenes via the headless rendering service (F204).

### 10.7 Agentic component authoring (Section 16)

- A model asset is `model_asset` with a JSON schema; agents can read and write it via the MCP server (F221).
- A camera keyframe is structured JSON; agents can author them.
- A shader is a structured code+config; agents can author them.
- "Live app embedding" is exposed via the embed_policy schema; agents can propose embed policies (subject to approval, F225).
- "Code sandbox" is exposed via the sandbox policy schema; agents can propose policies.
- A `natural-language patch` (F234) can express "add a 3D model of this product to slide 3" or "render this LaTeX here."

---

## 11. Open Questions & Risks

- **WebGPU maturity:** even with the fallback, some scenes may be unstable on Safari until Safari 18+ is widespread. We will dual-render in the editor and pick the better frame.
- **CAD pipeline cost:** CPU-heavy. We need to throttle free-tier users (e.g., 5 CAD imports per day).
- **Code sandbox escape:** QuickJS has had CVEs. We pin a known-good version and update on a regular cadence.
- **AR session abuse:** the QR flow can be screenshotted by the audience. We accept this; the session is tied to the presenting session anyway.
- **Map provider cost:** Mapbox / Google can become expensive at scale. We need a clear "you've used X% of your quota" UX.
- **License tracking:** every asset must have a license. We need a "no license" state that blocks publishing.

---

**Document owner:** §5 lead
**Status:** ready for review
**Coverage:** all 20 features (F65–F84); 12 UX flows; 12 architecture modules; 13 data-model tables; 9 API contracts; 6 security controls; 7 performance mechanisms; observability & testing coverage; 7 cross-section ties.
