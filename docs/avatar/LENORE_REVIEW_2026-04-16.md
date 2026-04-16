# Lenore Review 2026-04-16

This review package covers three quality passes on the live `MyAika` Lenore avatar.

Live site:
- `http://127.0.0.1:3412/`

Capture script:
- [capture_lenore_review.mjs](c:\Users\grump\Repo\MyAika\scripts\avatar_pipeline\capture_lenore_review.mjs)

## 1. Per-Phoneme Mouth Tuning

Goal:
- reduce the game-rigged fish-breathing look
- tighten lip closure on plosives
- reduce over-open rounded vowels
- keep wide vowels and open vowels distinct

Review captures:
- [phoneme-plosive.png](c:\Users\grump\Repo\output\playwright\lenore-review\phoneme-plosive.png)
- [phoneme-rounded.png](c:\Users\grump\Repo\output\playwright\lenore-review\phoneme-rounded.png)
- [phoneme-wide.png](c:\Users\grump\Repo\output\playwright\lenore-review\phoneme-wide.png)
- [phoneme-open.png](c:\Users\grump\Repo\output\playwright\lenore-review\phoneme-open.png)

Expected visual differences:
- `plosive`: lips seal harder, less random jaw opening
- `rounded`: pucker shape is tighter, mouth opening is smaller
- `wide`: corners widen without rounding
- `open`: jaw opens cleanly without the old cartoonish over-stretch

## 2. Camera / Framing Review

Goal:
- expose finer framing presets for actual review work
- separate face/lipsync inspection from body/costume inspection

Frames now available:
- `Portrait`
- `Bust`
- `Waist`
- `Three-quarter`
- `Full body`

Review captures:
- [frame-portrait.png](c:\Users\grump\Repo\output\playwright\lenore-review\frame-portrait.png)
- [frame-bust.png](c:\Users\grump\Repo\output\playwright\lenore-review\frame-bust.png)
- [frame-waist.png](c:\Users\grump\Repo\output\playwright\lenore-review\frame-waist.png)
- [frame-three_quarter.png](c:\Users\grump\Repo\output\playwright\lenore-review\frame-three_quarter.png)
- [frame-full.png](c:\Users\grump\Repo\output\playwright\lenore-review\frame-full.png)

Expected visual differences:
- `Portrait`: face and mouth inspection
- `Bust`: head and chest framing
- `Waist`: conversation default
- `Three-quarter`: posture and upper-body choreography review
- `Full body`: whole-model inspection

## 3. Hostess Choreography Review

Goal:
- stop relying only on the imported body clip
- add procedural hostess-specific upper-body choreography on top of source motion / pose modes
- vary shoulders, head tilt, neck lean, and arm posture by response class

Review captures:
- [choreo-teasing.png](c:\Users\grump\Repo\output\playwright\lenore-review\choreo-teasing.png)
- [choreo-executive.png](c:\Users\grump\Repo\output\playwright\lenore-review\choreo-executive.png)
- [choreo-comfort.png](c:\Users\grump\Repo\output\playwright\lenore-review\choreo-comfort.png)

Support data:
- [choreo-comfort.json](c:\Users\grump\Repo\output\playwright\lenore-review\choreo-comfort.json)

Expected visual differences:
- `teasing`: asymmetrical tilt, more flirtatious shoulder/arm posture
- `executive`: more composed runtime pose, less sway, firmer squared posture
- `comfort`: softer head angle and more open arm posture

## Notes

The current review set is aimed at visible regression checking on the live page. It is not just a unit-level renderer check.
