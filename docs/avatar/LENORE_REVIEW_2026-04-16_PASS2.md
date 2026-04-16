# Lenore Review 2026-04-16 Pass 2

This package covers the next three Lenore refinement requests:

1. tighter jaw vs lip timing on rapid consonant clusters
2. dedicated hostess idle loops for `paused`, `listening`, `thinking`, `speaking`, `ready`
3. saved named look slots for instant full-look switching

Live page:
- `http://127.0.0.1:3412/`

## 1. Rapid Consonant Cluster Review

Goal:
- reduce over-open jaw behavior on fast consonant sequences
- keep plosives and affricates tighter and more lip-driven

Review captures:
- [cluster-plosive.png](c:\Users\grump\Repo\output\playwright\lenore-review-pass4\cluster-plosive.png)
- [cluster-affricate.png](c:\Users\grump\Repo\output\playwright\lenore-review-pass4\cluster-affricate.png)

Expected visual change:
- less jaw flap during dense consonant phrases
- more closure/tension in the lips on `b/p/m`
- tighter shaping on `s/sh/ch/strict/scripts` type phrases

## 2. Hostess Idle Loop Review

Goal:
- make Lenore read differently in each conversation state
- stop reusing one generic idle posture

Review captures:
- [idle-paused.png](c:\Users\grump\Repo\output\playwright\lenore-review-pass4\idle-paused.png)
- [idle-listening.png](c:\Users\grump\Repo\output\playwright\lenore-review-pass4\idle-listening.png)
- [idle-thinking.png](c:\Users\grump\Repo\output\playwright\lenore-review-pass4\idle-thinking.png)
- [idle-speaking.png](c:\Users\grump\Repo\output\playwright\lenore-review-pass4\idle-speaking.png)
- [idle-ready.png](c:\Users\grump\Repo\output\playwright\lenore-review-pass4\idle-ready.png)

Expected visual change:
- `paused`: composed and still
- `listening`: forward attentive lean
- `thinking`: side tilt and reduced sway
- `speaking`: more animated hostess delivery
- `ready`: poised but lower-energy than speaking

## 3. Saved Look Slot Review

Goal:
- switch complete Lenore looks instantly
- keep look + motion paired in named slots

Review captures:
- [look-slots-panel.png](c:\Users\grump\Repo\output\playwright\lenore-review-pass4\look-slots-panel.png)
- [look-slot-reveal-applied.png](c:\Users\grump\Repo\output\playwright\lenore-review-pass4\look-slot-reveal-applied.png)
- [look-slot-renamed-saved.png](c:\Users\grump\Repo\output\playwright\lenore-review-pass4\look-slot-renamed-saved.png)
- [look-slots-summary.json](c:\Users\grump\Repo\output\playwright\lenore-review-pass4\look-slots-summary.json)

What the slot system now does:
- stores full `look`
- stores paired `motion`
- supports instant `Apply`
- supports overwriting a slot from the current live configuration with `Save Current`

## Notes

This pass is focused on visible behavior and operator workflow quality. It does not add new purchased source animations; it improves how Lenore uses the existing asset and settings surface.
