# Lenore Phase 1 Audit

Phase 1 goal:
- stabilize Lenore runtime states and supported wardrobe combinations
- disable unstable combinations
- ship authored conversational states for `paused`, `listening`, `thinking`, and `speaking`
- provide a browser regression harness for the live page on `3412`

## Runtime status

Lenore now runs in a strict conversation-safe mode:
- no imported source-body motion in the conversation runtime
- no reveal/nude presets in the live conversation runtime
- no jacket/top/bottom removal in the live conversation runtime
- authored upper-body hostess state set only
- camera frame controls verified on the live page

## Supported controls

Verified supported in the live runtime:
- `cameraFrame`
- `hairColor`
- `skinColor`
- `outfitColor`
- `accentColor`
- `eyeGlow`
- `matte`
- `showWrap`
- `showGloves`
- `showStockings`
- `showBoots`
- `showChoker`
- `showPiercing`

Supported motion controls:
- `Hostess pose`
- `Quiet Poise`
- `Command Presence`
- `Soft Reassure`

## Unsupported controls in Phase 1

Disabled intentionally:
- `Velvet Reveal`
- `After Hours`
- `Nude`
- `Source motion`
- `Velvet Tease`
- `Source Driven`
- `showJacket = false`
- `showTop = false`
- `showBottoms = false`

Reason:
- the purchased conversation asset exposes a broken left upper-arm seam when outerwear/core garments are removed
- the imported source-body motion is not production-safe for daily assistant use

## Authored conversation states

Stable authored states:
- `paused`
- `ready`
- `listening`
- `thinking`
- `speaking`

Phase 1 behavior:
- root breathing/sway
- neck/head drift
- restrained shoulder phrasing
- no performance clip takeover
- no extreme arm choreography in normal conversation

## Regression harness

Run:

```powershell
node c:\Users\grump\Repo\MyAika\scripts\avatar_pipeline\audit_lenore_phase1.mjs
```

Default target:
- `http://127.0.0.1:3412/`

Outputs:
- `paused.png`
- `settings.png`
- `frame-bust.png`
- `frame-full.png`
- `hair-color.png`
- `supported-toggles-off.png`
- `speaking.png`
- `audit.json`

Default output directory:
- `c:\Users\grump\Repo\output\playwright\lenore-phase1-regression`

## Phase 1 completion criteria

Accepted for Phase 1 when:
- full face visible in paused and bust framing
- arms remain down in paused/speaking states
- supported controls change the live render
- unsupported combinations are disabled in UI
- live page renders without chunk/model 404s
- browser regression harness completes and artifacts are produced

## Known remaining gaps

Deferred to later phases:
- real affect/empathy model
- Lenore-specific facial performance and commercial-grade lipsync
- richer response-to-motion emotional mapping
- split conversation/full-body assets for first-load performance
