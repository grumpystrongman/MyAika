# Avatar System Deployment & Integration Guide

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Installation & Setup](#installation--setup)
3. [Server-Side Integration](#server-side-integration)
4. [Client-Side Integration](#client-side-integration)
5. [Avatar Model Asset Setup](#avatar-model-asset-setup)
6. [Configuration & Customization](#configuration--customization)
7. [Deployment Checklist](#deployment-checklist)
8. [Troubleshooting](#troubleshooting)

## System Architecture Overview

The AIKA avatar system comprises:

- **Backend Avatar Orchestrator** (`InteractionRuntime`) - Manages emotion, expression, voice, and motion
- **Expression Engine** (`BlendshapeAnimator`) - Controls facial animations via Three.js morphtargets
- **Voice System** (`TTSProvider`) - Synthesizes emotional speech with prosody control
- **Lipsync Engine** - Maps phonemes to visemes for mouth animation
- **Motion Controller** - Manages breathing, blinking, eye darts, and head motion
- **Frontend Rendering** (`AvatarRenderer`, `AvatarUI`) - Three.js-based avatar visualization

### Data Flow

```
User Input
    ↓
[Emotion Detector] → Infers emotion from text
    ↓
[Expression Selector] → Maps emotion to facial blendshapes
    ↓
[Motion Controller] → Applies gestures and motion
    ↓
[Voice Prosody] → Generates emotional prosody parameters
    ↓
[TTS Provider] → Synthesizes audio with prosody
    ↓
[Lipsync Engine] → Generates phoneme-to-viseme mapping
    ↓
[Renderer] → Animates avatar (expression + motion + lipsync)
    ↓
[Audio Playback] → Streams audio to user
    ↓
[Audit Trail] → Logs all interactions for compliance
```

## Installation & Setup

### Prerequisites

- Node.js 18+ and npm/yarn
- Express.js server running
- Next.js web application
- Three.js (already in dependencies)
- GLTFLoader for model loading

### Backend Installation

```bash
# Install avatar system dependencies
npm install --save three-morphtargets glsl-shader

# Copy avatar files to server
cp -r apps/server/src/avatar /path/to/server/src/

# Copy configuration
cp -r config/avatar /path/to/config/
```

### Frontend Installation

```bash
# Copy components
cp apps/web/src/components/Avatar*.jsx /path/to/web/components/

# Copy hooks
cp -r apps/web/src/hooks/avatar /path/to/web/hooks/

# Ensure Three.js and dependencies are installed
npm install --save three gsap
```

## Server-Side Integration

### 1. Initialize Avatar System in Express Server

**File: `apps/server/src/index.js`**

```javascript
import express from "express";
import {
  InteractionRuntime,
  createInteractionRuntime
} from "./avatar/interactionRuntime.js";
import { initializeAvatarBridge } from "./avatar/avatarBridge.js";
import characterSpec from "../config/avatar/characterSpec.json" assert { type: "json" };
import expressionMap from "../config/avatar/expressionMap.json" assert { type: "json" };
import { emotionController } from "./avatar/emotionController.js";
import { voiceProsody } from "./avatar/voiceProsody.js";
import { TTSProvider } from "./avatar/ttsProvider.js";
import { lipsyncEngine } from "./avatar/lipsyncEngine.js";
import { BlendshapeAnimator } from "./avatar/blendshapeAnimator.js";
import { MotionController } from "./avatar/motionController.js";

const app = express();

// Initialize TTS Provider
const ttsProvider = new TTSProvider({
  engine: process.env.TTS_ENGINE || "piper",
  voice: process.env.TTS_VOICE || "en_US-amy-medium",
  baseUrl: process.env.TTS_BASE_URL || "http://localhost:8020"
});

// Create avatar system
const avatarSystem = {
  emotionController,
  voiceProsody,
  ttsProvider,
  lipsyncEngine,
  blendshapeAnimator: null, // Initialized per session on client
  motionController: new MotionController(characterSpec),
  startSession: function(sessionId, userId, config) {
    console.log(`Avatar session started: ${sessionId}`);
    return {
      status: "session_started",
      sessionId,
      characterSpec,
      expressionMap
    };
  },
  processUserInput: async function(text) {
    return {
      emotion: emotionController.inferEmotionFromText(text),
      expression: emotionController.selectExpression(text)
    };
  },
  generateAvatarResponse: async function(text, emotion) {
    const prosody = voiceProsody.emotionToProsody(emotion);
    const ttsResult = await ttsProvider.synthesize(text, { emotion, prosody });
    return {
      audioData: ttsResult.audioData,
      lipsync: lipsyncEngine.generateLipsyncSequence(text, ttsResult.duration)
    };
  },
  endSession: function() {
    console.log("Avatar session ended");
    return { status: "session_ended" };
  }
};

// Initialize avatar bridge
initializeAvatarBridge(app, null, avatarSystem);

// Start server
app.listen(3001, () => {
  console.log("✓ Avatar system initialized on :3001/api/avatar");
});
```

### 2. Environment Variables

**File: `.env`**

```bash
# TTS Configuration
TTS_ENGINE=piper  # Options: piper, azure, elevenlabs, local
TTS_VOICE=en_US-amy-medium
TTS_BASE_URL=http://localhost:8020

# Optional: Azure Cognitive Services
AZURE_SPEECH_KEY=your_key_here
AZURE_SPEECH_REGION=eastus

# Optional: ElevenLabs
ELEVENLABS_API_KEY=your_key_here

# Avatar Assets
AVATAR_MODEL_URL=/models/aika-production.glb
AVATAR_MATERIAL_OR_URL=/materials/aika-pbr.json

# Audio Output
AUDIO_OUTPUT_FORMAT=mp3  # Options: wav, mp3, ogg
AUDIO_SAMPLE_RATE=22050

# Performance
MAX_CONCURRENT_SYNTHESIS=5
AVATAR_ANIMATION_FPS=60
LIPSYNC_INTERPOLATION_METHOD=cubic-bezier
```

## Client-Side Integration

### 1. Use Avatar Component in Your App

**File: `apps/web/pages/avatar.jsx`**

```jsx
"use client";

import AvatarUI from "@/components/AvatarUI";
import characterSpec from "@/config/avatar/characterSpec.json";
import expressionMap from "@/config/avatar/expressionMap.json";

export default function AvatarPage() {
  return (
    <AvatarUI
      modelUrl="/models/aika-production.glb"
      characterSpec={characterSpec}
      expressionMap={expressionMap}
      width={800}
      height={600}
      enableMicrophone={true}
      apiBaseUrl="http://localhost:3001"
      onInteractionStart={(data) => console.log("Avatar session started", data)}
      onInteractionEnd={() => console.log("Avatar session ended")}
    />
  );
}
```

### 2. Direct Component Usage

```jsx
import AvatarRenderer from "@/components/AvatarRenderer";
import useAvatarAudio from "@/hooks/avatar/useAvatarAudio";

export function MyAvatarComponent() {
  const audio = useAvatarAudio({
    onAudioStart: () => console.log("Playing audio"),
    onAudioEnd: () => console.log("Audio finished"),
    voiceActivityThreshold: 0.02
  });

  return (
    <div>
      <AvatarRenderer
        modelUrl="/models/aika.glb"
        width={800}
        height={600}
        quality="high"
        onLoadComplete={(context) => {
          console.log("Avatar loaded:", context);
        }}
      />
    </div>
  );
}
```

## Avatar Model Asset Setup

### 1. Prepare 3D Model

Requirements for avatar model (glTF 2.0):
- **Format**: `model.glb` (binary glTF)
- **Morphtargets**: 52+ blendshapes (see `expressionMap.json` for target names)
- **Materials**: PBR (Physically Based Rendering) compatible
- **Rigging**: Skeletal rig for bone animations (optional)
- **Texture Size**: 2048×2048 or 4096×4096 for quality
- **Polygon Count**: 50k-150k for real-time performance

### 2. Model Optimization

```bash
# Using Blender Python script or gltf-transform
gltf-transform quantize model.glb model-quantized.glb
gltf-transform etc1 model-quantized.glb model-optimized.glb
```

### 3. Place Model in Public Folder

```
apps/web/public/
├── models/
│   ├── aika.glb (development)
│   └── aika-production.glb (deployed)
└── materials/
    └── aika-pbr.json
```

### 4. Verify Morphtargets

```javascript
// Test script to verify morphtargets
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

const loader = new GLTFLoader();
loader.load("/models/aika.glb", (gltf) => {
  const model = gltf.scene;
  model.traverse((node) => {
    if (node.isMesh && node.morphTargetDictionary) {
      console.log("Available morphtargets:", Object.keys(node.morphTargetDictionary));
      console.log("Total morphtargets:", node.morphTargetInfluences.length);
    }
  });
});
```

## Configuration & Customization

### 1. Character Customization

Edit `config/avatar/characterSpec.json`:
```json
{
  "name": "Custom Avatar Name",
  "visual": {
    "face": { "shape": "oval", "skinTone": "#e8d5c4" },
    "eyes": { "color": "#3d2817", "style": "almond" },
    "hair": { "color": "#1a1a1a", "style": "asymmetrical_shoulder_length" }
  },
  "voice": {
    "profile": "darkly-glamorous-articulate",
    "gender": "female",
    "profiles": {
      "witty": { "pitch": 1.1, "rate": 1.05, ... },
      "empathetic": { "pitch": 0.9, "rate": 0.95, ... }
    }
  }
}
```

### 2. Expression Customization

Edit `config/avatar/expressionMap.json` to adjust blendshape values:
```json
{
  "expressions": {
    "happy": {
      "blendshapes": {
        "mouthSmile": 0.8,
        "eyeWide": 0.3,
        ...
      }
    }
  }
}
```

### 3. Voice Customization

Update TTS provider settings:
```javascript
const ttsProvider = new TTSProvider({
  engine: "piper",
  voice: "en_US-custom-model",
  baseUrl: "http://your-tts-server:8020"
});
```

## Deployment Checklist

### Pre-Deployment Verification

- [ ] All avatar components imported and exported correctly
- [ ] Character spec and expression map loaded without errors
- [ ] TTS provider configured and tested
- [ ] Avatar model (glB) optimized and placed in public folder
- [ ] Morphtarget names verified against expression map
- [ ] Expression keyframes tested in browser
- [ ] Voice synthesis tested with emotional prosody
- [ ] Lipsync timing verified (< 150ms latency)
- [ ] Motion animations smooth (60 FPS on target hardware)
- [ ] Audit trail logging enabled
- [ ] Error handling and fallbacks implemented
- [ ] Security: API rate limiting configured
- [ ] Security: CORS properly configured for avatar endpoints

### Deployment Steps

1. **Build & Optimize**
```bash
npm run build
# Optimize avatar assets
npm run optimize:avatar
```

2. **Configure Production Environment**
```bash
cp .env.production .env
# Update with production TTS endpoint, API keys, etc.
```

3. **Deploy Server**
```bash
npm run start:server
# Verify avatar endpoints: GET /api/avatar/status
```

4. **Deploy Web App**
```bash
npm run start:web
# Test avatar page load time and responsiveness
```

5. **Health Checks**
```bash
# Check TTS provider connectivity
curl http://your-server:3001/api/avatar/status

# Verify model loading
curl http://your-server:3001/api/avatar/model-info
```

### Docker Deployment (Optional)

**Dockerfile**:
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY . .

RUN npm install
RUN npm run build

ENV NODE_ENV=production
ENV TTS_ENGINE=piper
ENV TTS_BASE_URL=http://tts-service:8020

EXPOSE 3001
CMD ["npm", "start"]
```

**docker-compose.yml**:
```yaml
version: '3.8'
services:
  avatar-server:
    build: .
    ports:
      - "3001:3001"
    depends_on:
      - tts-service
    environment:
      TTS_BASE_URL: http://tts-service:8020

  tts-service:
    image: rhasspy/piper:latest
    ports:
      - "8020:8020"
```

## Troubleshooting

### Avatar Not Loading

**Problem**: "Failed to load model"
**Solution**:
- Verify model file exists and is valid glTF 2.0
- Check CORS headers if serving from different domain
- Ensure morphtargets exist in model

### Expressions Not Working

**Problem**: Blendshapes not animating
**Solution**:
- Verify morphtarget names in expression map match model
- Check that `morphTargetInfluences` array is accessible
- Inspect browser console for Three.js errors

### Voice Latency High

**Problem**: Audio synthesis takes too long
**Solution**:
- Use local TTS provider (Piper) instead of cloud services
- Reduce model quality or use faster TTS engine
- Implement caching for common phrases

### Lipsync Out of Sync

**Problem**: Mouth movements don't match audio
**Solution**:
- Verify audio duration estimation accuracy
- Reduce interpolation complexity (switch to linear if needed)
- Check phoneme-to-viseme mapping accuracy

### Performance Issues (FPS Drop)

**Problem**: Avatar animation stutters
**Solution**:
- Reduce expression update frequency
- Lower morphtarget precision
- Optimize 3D model polygon count
- Enable frame rate limiting to 30 FPS if needed

### Audit Trail Missing

**Problem**: No logs being created
**Solution**:
- Verify `enableAuditTrail` is true in session config
- Check that `/logs/avatar-audit/` directory exists and is writable
- Verify file system permissions

## Performance Optimization Tips

1. **Expression Animation**: Use `cubic-hermite` interpolation for smooth transitions (default)
2. **Lipsync**: Linear interpolation is faster, suitable for real-time streaming
3. **Motion**: Motion controller uses `requestAnimationFrame` for efficient updates
4. **Rendering**: Enable frustum culling for non-visible avatar parts
5. **Audio**: Stream audio chunks instead of loading entire file
6. **Memory**: Reuse morphtarget buffers, don't create new arrays per frame

## Security Considerations

1. **Input Validation**: All user text is sanitized before TTS synthesis
2. **Rate Limiting**: Implement rate limits on `/api/avatar` endpoints
3. **Audit Trail**: All avatar actions logged for compliance
4. **API Keys**: Store TTS provider keys in environment variables (never in code)
5. **CORS**: Restrict avatar API to known domains
6. **Content Safety**: Text filtering for profanity and inappropriate content

## Next Steps

After deployment:
1. Monitor avatar system performance metrics
2. Collect user feedback on expression accuracy and personality
3. Iterate on prosody parameters for better emotional expressiveness
4. A/B test different TTS engines for voice quality
5. Fine-tune lipsync accuracy based on real-world usage
