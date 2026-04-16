export class TTSProvider {
  constructor(config = {}) {
    this.engine = config.engine || "piper";
    this.voice = config.voice || "en_US-amy-medium";
    this.apiKey = config.apiKey || null;
    this.baseUrl = config.baseUrl || "http://localhost:8020";
    this.timeout = Math.max(5000, Math.min(120000, config.timeout || 30000)); // Clamp timeout
    this.requestQueue = [];
    this.isProcessing = false;
    this.maxQueueSize = config.maxQueueSize || 100;
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatency: 0
    };
  }

  async synthesize(text, { emotion, prosody, speakerId, requestId } = {}) {
    // Input validation
    if (typeof text !== "string") {
      throw new TypeError("text must be a string");
    }
    
    const trimmedText = String(text).trim();
    if (trimmedText.length === 0) {
      throw new Error("TEXT_EMPTY: Cannot synthesize empty text");
    }
    
    if (trimmedText.length > 5000) {
      throw new Error("TEXT_TOO_LONG: Text exceeds 5000 characters");
    }
    
    // Check queue size to prevent memory bloat
    if (this.requestQueue.length >= this.maxQueueSize) {
      throw new Error("QUEUE_FULL: Too many pending synthesis requests");
    }

    const request = {
      id: requestId || `tts_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      text: trimmedText,
      emotion: emotion || "neutral",
      prosody: prosody || this.getDefaultProsody(),
      speakerId: speakerId || "aika_default",
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      let timeoutHandle = null;
      const cleanup = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      };
      
      timeoutHandle = setTimeout(() => {
        cleanup();
        reject(new Error(`TTS_TIMEOUT: Synthesis did not complete within ${this.timeout}ms`));
      }, this.timeout);

      this.requestQueue.push(async () => {
        try {
          const startTime = Date.now();
          const result = await this._executeSynthesis(request);
          const latency = Date.now() - startTime;
          
          // Update metrics
          this.metrics.totalRequests++;
          this.metrics.successfulRequests++;
          this.metrics.averageLatency = (this.metrics.averageLatency * (this.metrics.successfulRequests - 1) + latency) / this.metrics.successfulRequests;
          
          cleanup();
          resolve(result);
        } catch (error) {
          this.metrics.totalRequests++;
          this.metrics.failedRequests++;
          cleanup();
          reject(error);
        }
      });

      this._processQueue();
    });
  }

  async _executeSynthesis(request) {
    const engineHandler = this._getEngineHandler(this.engine);
    return engineHandler.call(this, request);
  }

  _getEngineHandler(engine) {
    switch (engine) {
      case "piper":
        return this._piperSynthesize;
      case "azure":
        return this._azureSynthesize;
      case "elevenlabs":
        return this._elevenlabsSynthesize;
      case "local":
        return this._localSynthesize;
      default:
        throw new Error(`UNSUPPORTED_ENGINE: TTS engine '${engine}' not supported`);
    }
  }

  async _piperSynthesize(request) {
    const requestBody = {
      text: request.text,
      speaker: this.voice,
      length_scale: request.prosody.rate || 1.0,
      noise_scale: (request.prosody.energy || 0.5) * 0.333,
      noise_w: 0.667,
      language: "en_US"
    };

    try {
      // Validate URL to prevent SSRF
      const url = new URL(`${this.baseUrl}/api/tts`);
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("Invalid protocol");
      }
      
      const response = await fetch(`${this.baseUrl}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`PIPER_ERROR: HTTP ${response.status}`);
      }

      const audioBuffer = await response.arrayBuffer();
      const estimatedDuration = this._estimateAudioDuration(request.text, request.prosody.rate);

      return {
        requestId: request.id,
        audioData: audioBuffer,
        format: "wav",
        sampleRate: 22050,
        duration: estimatedDuration,
        engine: "piper",
        voice: this.voice,
        timestamp: Date.now(),
        prosody: request.prosody,
        emotion: request.emotion
      };
    } catch (error) {
      throw new Error(`PIPER_SYNTHESIS_FAILED: ${error.message}`);
    }
  }

  async _azureSynthesize(request) {
    const ssmlText = this._generateSSML(request);

    const speechConfig = {
      apiKey: this.apiKey,
      region: "eastus"
    };

    try {
      const response = await fetch("https://eastus.tts.speech.microsoft.com/cognitiveservices/v1", {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": speechConfig.apiKey,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3"
        },
        body: ssmlText,
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`AZURE_ERROR: HTTP ${response.status}`);
      }

      const audioBuffer = await response.arrayBuffer();
      const estimatedDuration = this._estimateAudioDuration(request.text, request.prosody.rate);

      return {
        requestId: request.id,
        audioData: audioBuffer,
        format: "mp3",
        sampleRate: 16000,
        duration: estimatedDuration,
        engine: "azure",
        voice: this.voice,
        timestamp: Date.now(),
        prosody: request.prosody,
        emotion: request.emotion
      };
    } catch (error) {
      throw new Error(`AZURE_SYNTHESIS_FAILED: ${error.message}`);
    }
  }

  async _elevenlabsSynthesize(request) {
    const voiceId = "21m00Tcm4TlvDq8ikWAM";

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: request.text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: request.emotion === "excited" ? 0.5 : 0.0,
            use_speaker_boost: true
          }
        }),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`ELEVENLABS_ERROR: HTTP ${response.status}`);
      }

      const audioBuffer = await response.arrayBuffer();
      const estimatedDuration = this._estimateAudioDuration(request.text, request.prosody.rate);

      return {
        requestId: request.id,
        audioData: audioBuffer,
        format: "mp3",
        sampleRate: 22050,
        duration: estimatedDuration,
        engine: "elevenlabs",
        voice: this.voice,
        timestamp: Date.now(),
        prosody: request.prosody,
        emotion: request.emotion
      };
    } catch (error) {
      throw new Error(`ELEVENLABS_SYNTHESIS_FAILED: ${error.message}`);
    }
  }

  async _localSynthesize(request) {
    const estimatedDuration = this._estimateAudioDuration(request.text, request.prosody.rate);

    return {
      requestId: request.id,
      audioData: new ArrayBuffer(0),
      format: "wav",
      sampleRate: 22050,
      duration: estimatedDuration,
      engine: "local",
      voice: this.voice,
      timestamp: Date.now(),
      prosody: request.prosody,
      emotion: request.emotion,
      status: "queued_for_local_synthesis"
    };
  }

  _generateSSML(request) {
    const pitchCents = Math.round((Math.log2(request.prosody.pitch || 1.0) * 1200));
    const ratePct = Math.round((request.prosody.rate || 1.0) * 100);

    return `<speak version="1.0" xml:lang="en-US">
      <voice xml:lang="en-US" name="en-US-AriaNeural">
        <prosody pitch="${pitchCents}st" rate="${ratePct}%">
          ${String(request.text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
        </prosody>
      </voice>
    </speak>`;
  }

  _estimateAudioDuration(text, rate = 1.0) {
    const wordCount = String(text || "").split(/\s+/).length;
    const avgWordsPerSecond = 150 * (rate || 1.0);
    return (wordCount / Math.max(0.1, avgWordsPerSecond)) * 1000;
  }

  getDefaultProsody() {
    return {
      pitch: 1.0,
      rate: 1.0,
      energy: 0.5,
      breathiness: 0.0,
      pauseFrequency: 0.3
    };
  }

  setVoice(voiceId) {
    this.voice = voiceId;
  }

  setEngine(engine) {
    const validEngines = ["piper", "azure", "elevenlabs", "local"];
    if (!validEngines.includes(engine)) {
      throw new Error(`INVALID_ENGINE: Engine must be one of ${validEngines.join(", ")}`);
    }
    this.engine = engine;
  }

  async _processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) return;

    this.isProcessing = true;
    while (this.requestQueue.length > 0) {
      const task = this.requestQueue.shift();
      await task();
    }
    this.isProcessing = false;
  }

  getStatus() {
    return {
      engine: this.engine,
      voice: this.voice,
      queueLength: this.requestQueue.length,
      isProcessing: this.isProcessing,
      baseUrl: this.baseUrl
    };
  }
}

export async function createTTSProvider(config = {}) {
  const provider = new TTSProvider(config);
  return provider;
}

export function detectTTSEngine() {
  const engines = {
    piper: "http://localhost:8020/api/tts",
    azure: "https://eastus.tts.speech.microsoft.com/cognitiveservices/v1"
  };

  const available = [];
  for (const [name, url] of Object.entries(engines)) {
    try {
      fetch(url, { method: "HEAD", timeout: 1000 }).then(r => {
        if (r.ok) available.push(name);
      });
    } catch (_e) {}
  }

  return available.length > 0 ? available[0] : "local";
}
