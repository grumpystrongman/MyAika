# Lenore Review 2026-04-16 Pass 3

Live site used:
- http://127.0.0.1:3412/

This pass covered:
1. tongue and teeth visibility tuning for `th`, `s`, and `ch`
2. named choreography presets layered on top of response classes
3. saved look slots with frame labels and one-click preview thumbnails

## Phoneme review
Controlled morph previews captured on the live renderer:
- [phoneme-th](c:/Users/grump/Repo/output/playwright/lenore-review-pass5/phoneme-th.png)
- [phoneme-s](c:/Users/grump/Repo/output/playwright/lenore-review-pass5/phoneme-s.png)
- [phoneme-ch](c:/Users/grump/Repo/output/playwright/lenore-review-pass5/phoneme-ch.png)

Tracked live targets:
- `th`: `V_Tongue_Out 0.48`, `Mouth_Top_Lip_Up 0.24`, `V_Dental_Lip 0.32`, `Mouth_Lips_Part 0.12`, `Mouth_Open 0.04`
- `s`: `V_Affricate 0.52`, `V_Dental_Lip 0.20`, `Mouth_Widen 0.14`, `Mouth_Top_Lip_Up 0.08`, `Mouth_Lips_Part 0.11`, `Mouth_Open 0.02`
- `ch`: `V_Affricate 0.82`, `Mouth_Lips_Part 0.18`, `Mouth_Open 0.05`, `Mouth_Widen 0.10`, `Mouth_Pucker_Open 0.08`, `Mouth_Top_Lip_Up 0.04`

## Choreography preset review
Preset-driven live pose captures:
- [velvet tease](c:/Users/grump/Repo/output/playwright/lenore-review-pass5/choreo-velvet-tease.png)
- [command presence](c:/Users/grump/Repo/output/playwright/lenore-review-pass5/choreo-command-presence.png)
- [soft reassure](c:/Users/grump/Repo/output/playwright/lenore-review-pass5/choreo-soft-reassure.png)

Verified runtime states:
- `velvet_tease` -> `source_motion`
- `command_presence` -> `runtime_pose`
- `soft_reassure` -> `runtime_pose`

## Saved look slot review
Settings panel and thumbnail-apply flow:
- [look slots panel](c:/Users/grump/Repo/output/playwright/lenore-review-pass5/look-slots-panel.png)
- [reveal applied](c:/Users/grump/Repo/output/playwright/lenore-review-pass5/look-slot-reveal-applied.png)
- [formal applied](c:/Users/grump/Repo/output/playwright/lenore-review-pass5/look-slot-formal-applied.png)

Verified in the live panel:
- frame labels present
- motion labels present
- choreography labels present
- thumbnail previews apply the slot in one click

## Review JSON
- [review.json](c:/Users/grump/Repo/output/playwright/lenore-review-pass5/review.json)
