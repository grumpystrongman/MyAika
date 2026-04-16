# AIKA Nocturne Reference Translation (Original Character)

Date: 2026-04-12

## Input References Reviewed
- User-provided still image reference:
  - https://i.etsystatic.com/58247772/r/il/57e891/6841054896/il_1588xN.6841054896_s03j.jpg
- User-provided YouTube clips:
  - https://www.youtube.com/watch?v=wXVcSj7xDs0
  - https://www.youtube.com/watch?v=up_DKwJoJqI
  - https://www.youtube.com/watch?v=v7O_TM8SeNg
  - https://www.youtube.com/watch?v=MfVl56ZQBWA
  - https://www.youtube.com/watch?v=phR3PpRu7rQ
  - https://www.youtube.com/watch?v=ZqHThEgLvjg
- Public background context for archetype cues:
  - https://en.wikipedia.org/wiki/Elvira%27s_Movie_Macabre
  - https://en.wikipedia.org/wiki/Cassandra_Peterson

## Constraint
Target is an original character. No direct face/voice cloning of any real person.

## Clip Intake Notes
Machine-readable extraction from YouTube was limited in this environment. Direct downloader and caption tooling were unavailable, so clip analysis was based on public oEmbed metadata, known character archetype cues, and the supplied still reference.

Follow-up update on 2026-04-13:
- `yt-dlp`, `ffmpeg`, and `ffprobe` were installed via `winget`.
- Repeatable extraction now lives in `scripts/analyze_avatar_references.ps1`.
- The intended use is metadata dump + subtitle capture + storyboard availability checks for future tuning passes.

Resolved clip titles:
- `wXVcSj7xDs0`: `Best of Elvira, Mistress of the Dark`
- `up_DKwJoJqI`: `Elvira: Mistress of the Dark | Clip - Catch of the day | 4K`
- `v7O_TM8SeNg`: `ELVIRA MISTRESS OF THE DARK | Vegas Finale (1988) Movie CLIP HD`
- `MfVl56ZQBWA`: `Elvira Mistress Of The Dark (1988)`
- `phR3PpRu7rQ`: `ELVIRA: MISTRESS OF THE DARK | Maniac Clip (1988)`
- `ZqHThEgLvjg`: `Elvira - Don't Cancel Halloween ( Music Video )`

## Clip-Derived Performance Cues
- Delivery should stay poised and direct even when playful or campy.
- Brows, eyes, and mouth carry most of the performance; body motion can remain restrained.
- Gesture timing works best as short punctuations, not constant motion.
- A strong silhouette and frontal camera confidence are more important than large movement range.
- Humor reads best when the voice stays controlled rather than broad or frantic.

## Style Translation (Visual)
Derived high-level cues from references:
- High-contrast black silhouette against lighter skin values.
- Dramatic volumetric dark hair silhouette with strong crown volume.
- Stage-ready eye emphasis (heavy liner, high contrast eye shadow).
- Confident upright posture and direct camera engagement.
- Elegant gothic wardrobe language with controlled theatrical sensuality.

Translated into AIKA Nocturne:
- Face and proportions remain original, not identity-matching.
- Signature palette: obsidian black, moonlit ivory, garnet accent.
- Wardrobe grammar: sharp V-neck lines, cathedral sleeve variants, matte satin and velvet reads.
- Makeup grammar: smoked lid, long wing, deep neutral lip with optional oxblood mode.

## Performance Translation (Motion)
Conversation-safe performance profile:
- Idle: slow breathing loop, sparse blink cadence, subtle micro-sway.
- Listening: slight forward attention, reduced mouth motion, eye lock with small saccades.
- Speaking: synchronized mouth openness, jaw drive, controlled eyebrow punctuation.
- Turn-taking: short head dip or micro-nod before response onset.
- Interrupt handling: immediate mouth close, gaze settle, neutral recovery pose.

## Voice Translation (Original)
Archetype-level goals:
- Low-mid timbre emphasis, warm resonance, articulate diction.
- Playful theatrical phrasing without parody.
- Calm pacing baseline with selective phrase-level emphasis.

Implemented style presets:
- `nocturne_hostess`: balanced theatrical warmth.
- `nocturne_velvet`: softer intimate delivery.
- `nocturne_command`: executive and direct delivery.

## Runtime Mapping
- Personality modes map to expression and voice profile shifts:
  - `warm_supportive`, `witty_playful`, `analytical`, `serious`, `reflective`, `teasing`, `focused_executive`
- Emotion and state feed facial blendshape targets and speaking/listening transitions.

## Tuning Checklist
- Validate speaking/lipsync at 0.9x, 1.0x, 1.1x speaking rates.
- Validate eye contact stability in 5+ minute sessions.
- Verify interruption recovery is below 200 ms from stop signal.
- Confirm no prompts or assets contain direct celebrity replication directives.
