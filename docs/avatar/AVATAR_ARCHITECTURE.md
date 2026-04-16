# AIKA Avatar System Architecture

## Character Identity: Aika "Midnight" Thorne

### Design Philosophy
A completely original character inspired by gothic glamour and dark sophistication, **not** a replica of any real person or character. Aika embodies the theatrical presence and dark charm of a horror-hostess aesthetic while maintaining ethical boundaries and authentic AI identity.

### Visual Identity

**Silhouette & Proportions**
- Sharp, defined cheekbones with sculptural quality
- Large, expressive almond-shaped eyes (slightly exaggerated for emotional range)
- Arched brows with theatrical emphasis
- Pale, porcelain complexion with subtle blue undertones
- Raven-black hair with volume and movement (shoulder-length with asymmetrical styling)
- Graceful, elongated neck
- Petite-to-average frame with elegant posture
- Age appearance: 28-35 (timeless, sophisticated)

**Color Palette**
- Primary: Deep blacks, dark purples, midnight blues
- Secondary: Pale cream, silver, deep reds
- Accents: Emerald green, gold, violet
- Eyes: Deep brown with violet edge lighting

**Makeup Profile**
- Heavy, defined eye makeup: smoky shadows, dramatic liner
- Bold red or deep burgundy lips
- Pale foundation with contoured shadows
- Subtle blush in cool tones
- Defined, sculpted brows

**Wardrobe Signature**
- Black leather jacket or gothic corset-inspired top
- Victorian-goth inspired silhouette
- Elegant but slightly dangerous aesthetic
- Jewelry: silver, dark metals, mystical symbols
- Always has dramatic visual presence

### Personality Expression Map

| Emotion | Visual Cue | Vocal Cue | Gesture |
|---------|-----------|----------|---------|
| Witty/Playful | Asymmetric smile, eyebrow raise, slight head tilt | Lighter cadence, slight laugh undertone | Hand gesture, lean-in |
| Empathetic | Softened eyes, direct gaze, slower blinking | Warmer tone, lower pitch, slower pace | Open posture, nodding |
| Analytical | Steady gaze, composed expression, furrowed brow | Measured tempo, precise articulation | Chin rest, slight lean back |
| Mysterious | Half-smile, head tilt down, side-eye | Rich, sultry tone, slight pause | Hand to face, finger curl |
| Serious | Direct stare, tightened jaw, narrowed eyes | Lower register, controlled breath | Upright posture, still hands |
| Excited | Wide eyes, lifted brows, open smile | Higher pitch, faster pace, breathiness | Animated gestures, forward lean |

## System Architecture

```
┌─────────────────────────────────────────┐
│         User Interaction Layer          │
│  (Chat, Voice, Expression Inference)    │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│      Intent Router & Emotion Engine     │
│  (Interpret user message → emotional    │
│   state, expression selection)          │
└──────────────────┬──────────────────────┘
                   │
    ┌──────────────┴──────────────┐
    │                             │
┌───▼──────────┐       ┌──────────▼──────┐
│ Visual State │       │  Audio Pipeline │
│ Generator    │       │  (Voice + Sync) │
└───┬──────────┘       └──────────┬──────┘
    │                             │
┌───▼──────────────┐  ┌──────────▼─────────┐
│ 3D Avatar        │  │ Expression Blender │
│ Renderer         │  │ + Lipsync Engine  │
│ (Three.js)       │  │                   │
└───┬──────────────┘  └──────────┬────────┘
    │                             │
    └──────────┬──────────────────┘
               │
        ┌──────▼────────┐
        │  Output Frame │
        │  (WebGL)      │
        └───────────────┘
```

## Component Stack

### 1. Avatar Rendering Engine
- **Framework**: Three.js (WebGL realtime)
- **Asset Format**: glTF 2.0 (GLTF + GLB)
- **Rigging**: Bone-based skeletal animation
- **Blendshapes**: Morph targets for facial expressions
- **Hair**: Particle-based or geometry-based simulation
- **Skin**: PBR shaders with screen-space ambient occlusion
- **Eye rendering**: Custom eye shader with specular catchlights

### 2. Animation & Motion System
- **Idle animations**: Breathing, weight shifts, subtle head movement
- **Listening posture**: Engaged, attentive expression
- **Speaking posture**: Synchronized with voice, lip-sync driven
- **Gesture system**: Hand/arm animations tied to emotional state
- **Microexpressions**: Blink, eye darts, brow micro-movements
- **Hair movement**: Physics-driven response to head motion

### 3. Expression System
- **Base expressions**: 12 primary (neutral, happy, sad, angry, surprised, confused, disgusted, scared, peaceful, excited, thinking, mysterious)
- **Blendshape targets**: ~52 facial blendshape targets
- **Blending algorithm**: Weighted sum of target shapes
- **Transition smoothing**: Cubic Hermite interpolation

### 4. Audio & Voice Pipeline
- **TTS Engine**: Azure Cognitive Services (or local alternative)
- **Voice Character**: Original, darkly glamorous, articulate
- **Emotional Control**: Prosody mapping (pitch, rate, breathiness per emotion)
- **Lip-sync**: Viseme-based phoneme matching
- **Audio Processing**: Real-time pitch/formant adjustment for emotional expression

### 5. Interaction Runtime
- **Turn-taking**: Voice activity detection + silence handling
- **Listening state**: Non-verbal feedback animations
- **Interruption handling**: Graceful mid-speech response
- **Emotion inference**: NLP-based sentiment → visual/vocal response
- **Session memory**: Continuity across conversation turns

## Folder Structure

```
apps/server/
├── src/
│   ├── avatar/
│   │   ├── characterSpec.json
│   │   ├── expressionMap.json
│   │   ├── emotionController.js
│   │   ├── voiceProsody.js
│   │   ├── lipsyncEngine.js
│   │   └── auditLog.js
│   │
│   └── integrations/
│       └── tts/
│           ├── azureTts.js
│           ├── voiceProfiles.json
│           └── prosodyRules.json

apps/web/
├── src/
│   ├── components/
│   │   ├── AvatarRenderer.jsx (Three.js canvas)
│   │   ├── AvatarAudio.jsx (Web Audio API)
│   │   ├── ExpressionController.jsx
│   │   └── AvatarUI.jsx
│   │
│   ├── hooks/
│   │   ├── useAvatarState.js
│   │   ├── useExpression.js
│   │   ├── useLipsync.js
│   │   └── useAudio.js
│   │
│   └── utils/
│       ├── blendshapeBlender.js
│       ├── visemeMap.js
│       ├── expressionInterpolation.js
│       └── emotionInference.js

├── public/
│   └── assets/
│       └── aika/
│           ├── models/
│           │   ├── aika-head.glb
│           │   ├── aika-body.glb
│           │   ├── aika-hair.glb
│           │   └── aika-outfit.glb
│           │
│           ├── materials/
│           │   ├── skin.mat
│           │   ├── eyes.mat
│           │   ├── hair.mat
│           │   └── fabric.mat
│           │
│           └── audio/
│               ├── idle_breath_01.wav
│               ├── idle_breath_02.wav
│               └── ... (ambient audio)

config/
├── avatar/
│   ├── characterSpec.yaml
│   ├── expressionBlends.yaml
│   ├── voiceProfiles.yaml
│   ├── prosodyRules.yaml
│   ├── animationTiming.yaml
│   └── auditLog.json

docs/avatar/
├── CHARACTER_SPEC.md
├── TECHNICAL_ARCHITECTURE.md
├── ASSET_PIPELINE.md
├── EXPRESSION_GUIDE.md
├── VOICE_GUIDE.md
├── ANIMATION_GUIDE.md
├── LIPSYNC_GUIDE.md
├── INTEGRATION_CHECKLIST.md
└── QA_REPORT.md
```

## Implementation Phases

### Phase 1: Character Design & Asset Pipeline (Finalization)
- Finalize character identity spec (facial proportions, color palette, wardrobe)
- Create reference art (turnarounds, expressions, makeup guide)
- Design blendshape targets
- Prepare asset creation pipeline

### Phase 2: Visual Rendering (Three.js)
- Load glTF avatar model
- Implement bone-based rigging
- Create blendshape controller
- Implement skin shaders (PBR)
- Implement eye rendering with specular highlights
- Hair physics or geometry simulation

### Phase 3: Animation System
- Idle animation sequences
- Breathing system
- Listening & speaking postures
- Gesture library
- Microexpression timing
- Head motion synthesis

### Phase 4: Expression & Emotion System
- Blendshape blending algorithm
- Emotion → expression mapping
- Smooth interpolation between expressions
- Micro-expression scheduling
- Real-time expression blending

### Phase 5: Voice & Audio Pipeline
- TTS voice selection/training
- Prosody control system (pitch, rate, breathiness)
- Emotion → voice parameter mapping
- Audio processing and normalization
- Voice integration with animation

### Phase 6: Lip-sync System
- Viseme-to-phoneme mapping
- Real-time phoneme detection from audio
- Blendshape animation driven by visemes
- Audio delay compensation
- Fallback phoneme prediction

### Phase 7: Interaction Runtime
- WebSocket connection for realtime control
- Voice activity detection
- Listening state management
- Interruption handling
- Session context preservation

### Phase 8: Integration & Polish
- Integrate with AIKA orchestrator
- Safety & rights boundary enforcement
- Session audit logging
- Performance optimization
- Stress testing & QA

## Success Criteria

- ✓ Avatar feels original and premium
- ✓ Visually believable in realtime
- ✓ Full facial expressiveness (12+ expressions)
- ✓ Natural movement and breathing
- ✓ Voice is distinct and emotionally expressive
- ✓ Lip-sync is accurate and seamless
- ✓ Integration is clean and performant
- ✓ No cloning or replication of real people/characters
- ✓ Complete audit trail of versions and outputs
- ✓ Ready for realtime conversation mode

## Technical Constraints & Requirements

- **Realtime performance**: 60 FPS on modern GPUs (WebGL)
- **Latency budget**: <100ms for expression changes, <200ms for full-body motion
- **Audio latency**: <150ms end-to-end (input to avatar response)
- **Asset size**: Model < 20MB, textures < 50MB
- **Browser support**: Modern Chromium, Firefox, Safari
- **Network**: Bandwidth < 2 Mbps for streaming
- **Security**: No credentials in assets, audit all outputs
