## 1. Core Editor & Canvas (the Figma-grade foundation)

1. Infinite canvas workspace with 16:9 slide frames (plus 4:3, 9:16, ultrawide, LED-wall custom ratios)
2. Drag-and-drop WYSIWYG editing with pixel-perfect and snap-to-grid modes
3. Smart alignment guides, spacing hints, and distribution tools
4. Multi-select, group/ungroup, lock, hide layers
5. Full layers panel with drag-reorder, search, and filtering
6. Frames-within-frames (nested components, like Figma)
7. Auto-layout containers (flexbox-like: elements reflow when content changes)
8. Constraints system (pin elements to edges/center for responsive scaling)
9. Vector pen tool, boolean operations, and shape editing
10. Rulers, guides, and customizable grid systems (columns, baseline grids)
11. Zoom from 2% to 6400% with GPU-accelerated rendering
12. Unlimited undo/redo with visual history timeline
13. Keyboard-first workflow (full shortcut map, command palette Cmd+K)
14. Copy/paste styles, format painter, and "paste to match destination"
15. Eyedropper color picking from anywhere on screen
16. Right-click contextual menus tuned per element type
17. Multiplayer live editing with cursors, selections, and presence avatars
18. Cursor chat and pointer "ping" for design discussions
19. Branching & merging of decks (Git-like: draft a variant, merge back)
20. Full version history with named checkpoints, diffs, and restore
21. Offline editing with conflict-free sync on reconnect (CRDT-based)
22. Autosave every keystroke, never a "save" button

## 2. Components & Template Ecosystem (the Canva-scale library)

23. 10,000+ pre-built components: cards, stats, timelines, org charts, quotes, agendas, comparison tables, roadmaps
24. Component variants (light/dark, sizes, states) switchable in one click
25. **Smart components with editable props panel** — change a KPI card's value, trend, and icon via form fields, never touching layout
26. User-created components: select anything → "create component" → reuse everywhere with instance overrides
27. Shared team component libraries with publish/subscribe and update notifications
28. Community marketplace: sell/share templates, components, themes (creator revenue share)
29. Template gallery by use case: pitch decks, board reports, QBRs, all-hands, classroom, conference keynotes, product demos
30. Full deck templates with placeholder logic ("replace with your logo/data" flows)
31. Section templates (insert a complete "team slide" or "financials section")
32. Icon library (100k+ icons, multiple styles, recolorable)
33. Stock photo/video/illustration integrations (Unsplash, Pexels, etc.)
34. GIF and Lottie animation library
35. Sticker/annotation packs for informal decks
36. Brand-locked templates — admins mark regions as non-editable so juniors can't break the layout

## 3. Theming, Branding & Design Systems

37. **Design token system** — colors, type scale, spacing, radii defined once; restyle an entire deck instantly
38. One-click theme swap: whole deck re-themes without breaking layouts
39. Brand kit: logos, palettes, fonts, imagery rules per organization
40. **Brand extraction from URL** — paste your website, AI builds your brand kit (colors, fonts, logo) automatically
41. Multi-brand support (agencies managing client brands)
42. Custom font upload with automatic fallback and licensing checks
43. Dark/light deck variants generated automatically from one source
44. Accessibility-aware theming (contrast auto-checks, colorblind-safe palette suggestions)
45. Theme marketplace with previewable live demos
46. Style linting — flags off-brand colors/fonts across the whole deck with one-click fixes
47. Per-slide theme overrides with inheritance rules

## 4. Live Data & Interactive Charts (the killer differentiator)

48. **Live data connections** — Google Sheets, Excel Online, Airtable, Notion, PostgreSQL, MySQL, BigQuery, Snowflake, REST APIs, GraphQL
49. **Charts that are alive during the presentation** — filter, drill down, hover tooltips, zoom into a time range mid-meeting
50. Full chart library: bar, line, area, pie, scatter, funnel, sankey, treemap, heatmap, waterfall, gauge, radar, candlestick, bullet
51. **Data refresh on stage** — "as of this morning" numbers update automatically when you open presenter mode
52. Cross-chart filtering — click a region on one chart, every chart on the slide filters to it (dashboard behavior inside a slide)
53. What-if sliders — drag an assumption slider, the financial model chart recalculates live in front of the board
54. Formula engine (spreadsheet-style computed fields inside the deck)
55. Data tables with sorting, pagination, conditional formatting, sparklines
56. Mock data generator — realistic fake data by schema for prototypes and templates
57. **Scenario switcher** — toggle "Base / Bull / Bear case" and every number, chart, and text callout on the slide swaps datasets
58. Number ticker animations and animated chart builds tied to real values
59. Data annotations pinned to data points ("this dip = server outage, March 3")
60. Threshold alerts — a KPI turning red automatically restyles its slide callout
61. Currency/unit localization on the fly (present the same deck in USD to one board, EUR to another)
62. Embedded live dashboards (Looker, Tableau, Power BI, Grafana embeds with auth passthrough)
63. Stale-data indicators showing when a source was last synced
64. Data source access control — deck viewers see the chart, never the raw credentials

## 5. 3D, Motion & Rich Media (the "impossible in PowerPoint" layer)

65. **Native 3D model embedding** (glTF/GLB/USDZ) — rotate, explode, annotate a product model live on a slide
66. 3D scene editor: lighting, camera paths, materials, environment maps
67. **Camera keyframes between slides** — slide 4 to 5 is a smooth camera move around the same 3D product
68. 3D data visualizations: globe plots, 3D bar terrains, point clouds, network graphs in space
69. Exploded-view animations for hardware/engineering presentations
70. CAD file import pipeline (STEP/FBX → optimized web 3D)
71. Physics-enabled elements (falling, bouncing, colliding objects for playful decks)
72. Particle systems and shader backgrounds (subtle, brand-tinted)
73. Scroll/click-driven 3D storytelling sequences
74. AR handoff — viewers scan a QR to see the 3D model in their own room
75. Video with in-editor trimming, cropping, speed, captions, and chaptering
76. Video that plays segments per click ("play next 8 seconds")
77. Background video with smart text-contrast protection
78. Audio tracks, voiceover recording per slide, and ambient soundscapes
79. Lottie/Rive interactive vector animations with state machines
80. Screen-recording capture built in (record a product demo clip without leaving the editor)
81. **Live app embedding** — embed your actual product (an iframe sandbox) and click through it inside the slide
82. Code blocks with syntax highlighting, line-step reveal, and runnable snippets (JS sandboxes)
83. Math/LaTeX rendering for scientific decks
84. Maps: interactive (zoom/pan/markers/choropleths) with live location data

## 6. Animation & Transition System

85. Timeline-based animation editor (After Effects-lite: keyframes, easing curves, delays)
86. **Magic move between slides** — shared elements morph position/size/style automatically (Keynote's best feature, but on the web and better)
87. Entrance/exit/emphasis presets with physics-based easing
88. Per-element animation triggers: on click, on slide enter, on hover, on data change, on timer
89. Staggered list/grid reveals with one control
90. Scroll-linked animations for the web-shared version of the deck
91. Slide transitions: morph, push, fade, 3D flip, cube, portal (tasteful defaults, full control)
92. Animation curve library + custom bezier editor
93. Reduced-motion mode auto-respecting viewer OS preferences
94. Animation copy/paste between elements and slides
95. GIF/video export of any animated slide for social sharing

## 7. Prototyping & Interactivity (the Figma-prototype layer)

96. Clickable hotspots and links between any slides (non-linear navigation)
97. **Interactive branching presentations** — "which topic first?" audience choice changes the path through the deck
98. Overlay states (modals, tooltips, drawers inside a slide)
99. Component states & interactions (hover, pressed, toggled) for product mockups
100.  Variables & conditional logic ("if toggle = annual, show annual pricing")
101.  Form inputs inside slides (text fields, dropdowns, sliders) feeding variables
102.  Embedded calculators (ROI calculator slide that prospects can use live)
103.  Device frames (present a mobile app flow inside an iPhone frame with working taps)
104.  Prototype user-testing mode — share a deck as a clickable prototype and record where viewers click
105.  Mini-games/quiz mechanics for training decks (drag-to-match, hotspot quizzes)
106.  Timed auto-advance sequences with pause/resume
107.  Deep-linkable slide states (a URL that opens slide 7 with the "Bear case" scenario active)

## 8. AI Copilot (generation, design, and coaching)

108. **Full deck generation from a prompt, doc, or meeting transcript** — outline first, approve, then designed slides
109. Doc-to-deck: paste a Word/Notion/PDF report, get a structured presentation with sources cited per slide
110. **Data-to-story**: connect a spreadsheet, AI finds the narrative ("revenue up 40% driven by APAC") and builds the slides with the right charts
111. AI slide designer — describe a slide ("comparison of our 3 pricing tiers, playful"), get 4 layout options
112. AI redesign — select an ugly slide, get on-brand redesigns preserving content
113. Copy assistant: shorten to bullet, punch up headlines, fix tone, translate (100+ languages) while preserving layout
114. AI image generation and background removal built into the canvas
115. **Voice-to-deck** — talk through your idea for 3 minutes, AI drafts the deck structure
116. AI speaker notes generation from slide content ("what should I say here?")
117. **AI rehearsal coach** — practice with your camera/mic; get feedback on pace, filler words, eye contact, time per slide, and which slides you stumble on
118. AI-anticipated Q&A — generates likely tough questions per slide with suggested answers (board-prep mode)
119. Smart summarization — auto-generate the "executive summary" slide and the TL;DD one-pager from the full deck
120. Audience-adaptive versions — one click generates the 5-minute version, the technical version, and the exec version of the same deck
121. Layout repair — AI fixes overflowing text, misalignment, and orphaned elements deck-wide
122. Accessibility AI — auto alt-text, reading-order fixes, caption generation for all video/audio
123. AI chart selection ("this data would be clearer as a waterfall chart — apply?")
124. Semantic deck search ("find the slide where we mention churn") across your whole workspace
125. AI content freshness checker — flags stats/claims in old decks that are now outdated

## 9. Presenter Experience (the boardroom weapon)

126. **Presenter view**: current + next slide, notes, timer, audience view preview, on any second screen or phone
127. **Phone as remote + confidence monitor** — scan QR, your phone becomes clicker, notes viewer, and laser pointer
128. Live annotation tools while presenting: pen, highlighter, spotlight, zoom lens, screen blur
129. **On-the-fly slide reordering and hiding from presenter view** — the meeting shifted? Drag slide 12 up next, skip the appendix, audience never sees the seams
130. Instant "jump to slide" grid with thumbnail search mid-presentation
131. Rehearsal mode with per-slide time tracking and pacing targets
132. Teleprompter mode (scrolling notes overlay at adjustable speed)
133. **Live "parking lot"** — audience questions get pinned during the talk; a wrap-up slide auto-assembles them
134. Picture-in-picture presenter camera bubble (positionable, styled, with virtual background)
135. Multi-presenter handoff — pass control to a co-presenter anywhere in the world, seamlessly
136. Presenter failover — if your laptop dies, resume from your phone at the exact slide and state
137. Offline presenting mode (fully cached, zero-internet boardrooms) with data snapshot fallback for live charts
138. 4K/LED-wall output profiles and dual-screen mirroring controls
139. Countdown/agenda timers visible to presenter (or audience, optionally)
140. Backstage whisper — a teammate sends you private notes mid-presentation ("CEO looks confused, slow down")
141. Post-presentation instant recap: what you showed, skipped, annotated, and time spent per slide

## 10. Audience Participation (turn viewers into participants)

142. **Audience joins via QR on their phones** — no app, instant
143. Live polls with real-time result charts on the slide
144. Word clouds built live from audience input
145. Q&A with upvoting and anonymous submission
146. Live quizzes with leaderboards (Kahoot-grade, but inside your deck)
147. Emoji reactions floating over the presentation in real time (toggleable)
148. **Audience-driven navigation votes** ("what should we cover next?")
149. Slider sentiment inputs ("how confident are you in this plan, 1–10?") aggregated live
150. Raise-hand queue for hybrid/remote meetings
151. Per-audience-member personalized handout links sent automatically at the end
152. Attendance and engagement capture for training/compliance use cases
153. Live translation captions of the presenter's voice on audience devices (each in their own language)
154. Post-session feedback forms with per-slide ratings

## 11. Sharing, Publishing & the Deck-as-a-Website

155. Every deck is a responsive web page with its own URL — no viewer software, ever
156. **Scroll mode** — the same deck renders as a beautiful scrollytelling web page for async reading
157. Password, domain-restricted, SSO-gated, or public sharing levels
158. Expiring links and per-viewer watermarking for confidential decks
159. **Per-link content control** — send the investor version and internal version from one deck with slide-level visibility rules per link
160. Custom domains (deck.yourcompany.com) and white-label viewer
161. Embeds anywhere (Notion, websites, docs) with live interactivity preserved
162. Narrated auto-play mode — your recorded voiceover plays the deck like a video, but it stays interactive
163. Video export (MP4 with animations and narration) for platforms that need video
164. PDF/PPTX export with graceful degradation (static snapshots of interactive parts, links back to live versions)
165. SEO-ready public decks (a conference talk that ranks on Google)
166. Social preview cards auto-generated per deck and per slide
167. Print-optimized handout layouts (notes pages, 4-up grids)
168. Deck update propagation — fix a typo once, every shared link is already correct (kills "final_v7.pptx" forever)

## 12. Analytics & Engagement Intelligence

169. **Per-viewer, per-slide analytics** — who opened it, how long on each slide, where they dropped off, what they clicked
170. Interactive element analytics (which scenario did the investor toggle? Did they use the ROI calculator?)
171. Attention heatmaps for scroll-mode decks
172. Sales-mode notifications ("Acme Corp just reopened your proposal — slide 9, pricing, third time this week")
173. A/B testing two deck versions with engagement comparison
174. Team analytics — which templates and components drive the most engagement across the org
175. Presentation delivery analytics (live sessions: attendance, poll participation, question volume)
176. CRM sync — viewer engagement written back to Salesforce/HubSpot contact timelines
177. Funnel view for sales decks: sent → opened → completed → replied
178. Benchmarks ("decks like yours average 62% completion — yours is at 78%")

## 13. Collaboration & Workflow

179. Comments pinned to elements or slides, with threads, mentions, and resolve states
180. Review/approval workflows (legal signs off before a deck can be shared externally)
181. Slide-level assignments ("Priya owns slides 4–7") with status tracking
182. Suggestion mode — propose edits without changing the deck (Google-Docs-style)
183. Deck merge requests with visual diffing between branches
184. Team workspaces with folders, projects, and granular permissions
185. Slide library — a governed pool of approved slides anyone can pull from (single source of truth for the "company overview" slide)
186. **Auto-updating shared slides** — legal updates the disclaimer slide once; all 400 decks using it update
187. Content expiry policies (this pricing slide auto-flags for review every quarter)
188. Meeting-tool integrations: present natively inside Zoom/Meet/Teams with participation features intact
189. Slack/Teams notifications (comments, approvals, viewer activity)
190. Calendar integration — deck linked to the meeting invite, opens in presenter mode at meeting time
191. Task-manager integrations (Asana/Jira/Linear) for deck production pipelines
192. Guest collaborators with scoped, expiring access

## 14. Enterprise, Governance & Platform

193. SSO (SAML/OIDC), SCIM provisioning, and role hierarchies
194. Brand governance dashboard: org-wide on-brand score, violation reports
195. Content DLP rules (block sharing decks containing flagged terms externally)
196. Audit logs for every view, edit, share, and export
197. Data residency options and SOC 2 / GDPR compliance tooling
198. Legal hold and retention policies on decks
199. Usage-based seat analytics for admins
200. **Public API + SDK** — generate decks programmatically (auto-created weekly business review decks from your data warehouse, every Monday 8am)
201. Webhooks (deck viewed, comment added, approval granted)
202. Plugin architecture — third-party developers build canvas plugins, data connectors, and export formats (the Figma plugin playbook)
203. Custom component development kit (build interactive components in code, publish to your org's library)
204. Headless rendering service (deck → image/PDF/video via API)

## 15. Novel & Frontier Features (the "no one has this" list)

205. **Presentation state timeline** — every interaction during a live session is recorded; replay the meeting exactly as it happened, including which scenario toggles the CFO clicked
206. **"Living documents" decks** — a QBR deck that is permanently alive: numbers always current, comments accumulating, no one ever makes "Q3 deck v2"
207. **Gaze-guided highlighting** — presenter's webcam eye-tracking subtly spotlights the region of the slide they're looking at (opt-in)
208. Gesture control — advance slides and point using hand gestures via webcam (great on stage, no clicker)
209. **Voice-triggered slide states** — say "let's look at the bear case" and the scenario switches (speech-recognition triggers, with confirmation guard)
210. Ambient boardroom mode — before the meeting starts, the deck idles with a live, branded dashboard of the numbers you're about to discuss
211. **Two-way slides** — a pricing negotiation slide where both sides adjust sliders from their own devices and converge on a number, recorded to the deck
212. Deck inheritance trees — see every deck ever derived from the master pitch deck, and push updates selectively down the tree
213. Real-time co-presenting with synced audience views across continents (everyone sees exactly what the presenter sees, sub-second)
214. AI meeting listener (opt-in) — during your live presentation, it hears a question about churn and quietly surfaces your churn appendix slide in presenter view
215. **Component "provenance" chips** — any stat on any slide can show its lineage: source system, query, owner, and last-verified date, on hover
216. Deck-to-podcast — AI converts your deck + notes into a two-voice audio discussion for stakeholders who prefer listening
217. Haptic remote feedback — your phone-remote vibrates at rehearsed pacing checkpoints
218. Kiosk mode — trade-show loops with touch interactivity and auto-reset
219. **Cross-deck knowledge graph** — the platform understands entities across all your decks ("show me every slide across the company that cites our NPS score — and which ones are stale")

## 16. Agentic & Programmable Interfaces (new — the "AI builds on this" layer)

This is the core addition: treat the platform not just as an app with an API bolted on, but as **infrastructure other agents (and power users) drive natively**.

221. **MCP server (first-class, not an afterthought)** — expose the deck engine as an MCP server so Claude, GPT agents, or any MCP-compatible client can create decks, edit slides, query data, and read back structured deck state as part of their own workflows
222. **Full MCP tool surface**: `create_deck`, `add_slide`, `edit_element`, `bind_data_source`, `apply_theme`, `get_deck_state`, `render_slide_to_image`, `list_components`, `insert_component`, `run_scenario`, `export_deck` — granular enough that an agent can do surgical edits, not just "regenerate everything"
223. **Structured deck schema (JSON/YAML) as the source of truth** — the visual canvas is one view onto this schema; any agent can read/write the schema directly and the canvas reflects it live, same as how code and a GUI both edit the same file
224. **Deck-as-code mode** — a text/YAML representation of the whole deck that's diffable, git-friendly, and editable in a real code editor, with two-way sync to the visual canvas (agents are much better at editing structured text than clicking)
225. **Agent-scoped permissions** — an API key or MCP session can be scoped to "this deck only," "read-only," "data-binding only," "cannot touch brand-locked regions" — so you can hand an agent real editing power without handing it the whole workspace
226. **Semantic element addressing** — every element has a stable, human/agent-readable ID and role (`slide[3].chart[revenue_by_region]`) so an agent's edit from last week still resolves correctly even after a human reorders slides
227. **Tool-call transcript / agent audit trail** — every action an agent took on a deck is logged distinctly from human edits, visible in version history ("Agent: Claude via MCP — added slide 7, bound to Q3 sheet")
228. **Dry-run / preview mode for agent edits** — an agent can propose a diff (like suggestion mode for humans) that a person approves before it lands, for high-stakes decks
229. **Webhooks → agent triggers, not just notifications** — "when this data source updates, invoke this agent workflow to regenerate the affected slides and flag changes for review"
230. **Agent-to-agent handoff** — a research agent produces findings → hands off to a "deck-builder" agent via MCP → hands off to a "brand-compliance" agent that checks it → hands off to a "rehearsal coach" agent, all orchestrated, all inspectable as a pipeline
231. **CLI** for power users — `deckctl create`, `deckctl push`, `deckctl diff`, scriptable in CI (a literal "deploy pipeline" for decks, matching your automated weekly-review use case in #200 but generalized)
232. **Local-first / offline SDK mode** — since your own workflow leans local-first, worth noting: an embeddable, self-hostable rendering + schema engine so an org (or a privacy-conscious individual) can run the core engine without the SaaS backend, syncing later if desired
233. **Function-calling-ready component props** — every smart component (#25) exposes its editable props as a typed schema (JSON Schema) specifically so LLMs can fill them via structured output/tool calling, not just via a form UI
234. **Natural-language patch API** — `POST /decks/{id}/patch {"instruction": "make slide 5's chart a waterfall and shorten the headline"}` as a higher-level convenience wrapper over the granular tools, for agents that want one-shot edits without orchestrating multiple tool calls
235. **Agent-readable deck comprehension endpoint** — `get_deck_summary` returns a structured, non-visual description of every slide's content, data bindings, and intent, so an agent can "read" a deck without OCR-ing rendered images
236. **Capability discovery** — an MCP `list_tools`/`describe_schema` call that's rich enough an agent can learn the full editing surface at runtime without pre-training on your docs

## Weaving AI further into what already exists

Rather than only bolting AI onto section 8, a few places in your existing list are natural extension points:

- **#48 (live data connections)** → add an **agent-writable data layer**: not just read from Sheets/Airtable, but let an agent _write back_ computed fields or annotations (#59) into the data source, closing the loop between "AI found the insight" and "AI recorded it back to the source of truth"
- **#124 (semantic deck search)** → extend to **cross-deck semantic search exposed via MCP**, so an external agent can query "find every deck referencing churn" as a tool call, not just inside your UI
- **#200 (public API for programmatic decks)** → this is really the same idea as the MCP layer above; worth merging conceptually so you don't build two parallel "external access" systems that drift apart
- **#216 (provenance chips)** → make provenance **queryable by agents**, not just visible on hover — an agent auditing a deck for stale stats should be able to pull lineage programmatically
- **#108 (full deck generation)** → add an explicit **agent-initiated generation mode**: the difference between a human typing a prompt and another AI system calling `generate_deck(brief, data_sources, constraints)` as part of a larger automated workflow (e.g., "every Monday, an agent pulls the warehouse numbers, writes the narrative, generates the deck, and posts it to Slack for review" — this is #200's cron job, but agent-orchestrated rather than just scheduled)

## A few genuinely new ideas beyond agentic access

237. **Deck "linting for agents"** — a validation pass an agent can run before finalizing: checks for broken data bindings, orphaned components, off-brand colors, accessibility issues — the machine-readable counterpart to #46/#121/#122, callable as a single tool
238. **Confidence/uncertainty surfacing** — when AI generates a chart interpretation or narrative (#110), it can flag which claims are strongly data-supported vs. inferential, so a human reviewer (or a downstream compliance agent) knows what to double-check
239. **Simulation mode for scenario testing** — an agent can programmatically sweep the what-if sliders (#53) across a range and get back the resulting numbers, useful for automated sensitivity analysis rather than a human dragging one slider at a time
240. **Deck diffing API for agents** — structured diff between two deck versions (not just visual diff for humans, #183), so an agent can programmatically detect "what changed" and decide whether to re-notify, re-approve, or re-generate downstream content
