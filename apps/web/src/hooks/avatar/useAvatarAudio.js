import { useEffect, useRef, useState, useCallback } from "react";

export function useAvatarAudio({
  onAudioStart = null,
  onAudioEnd = null,
  onVoiceActivityChange = null,
  voiceActivityThreshold = 0.02,
  voiceActivityDuration = 100
} = {}) {
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const audioSourceRef = useRef(null);
  const audioElementRef = useRef(null);
  const voiceActivityDetectorRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [volume, setVolume] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Initialize Web Audio API
  const initAudioContext = useCallback(() => {
    if (audioContextRef.current) return;

    const audioContext =
      new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    dataArrayRef.current = dataArray;

    return { audioContext, analyser };
  }, []);

  // Play audio from buffer
  const playAudioBuffer = useCallback(
    async (audioData, options = {}) => {
      try {
        const { audioContext, analyser } = initAudioContext() || {
          audioContext: audioContextRef.current,
          analyser: analyserRef.current
        };

        if (!audioContext) throw new Error("Audio context not initialized");

        const audioBuffer = await audioContext.decodeAudioData(audioData);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;

        const gainNode = audioContext.createGain();
        gainNode.gain.value = options.volume || 0.8;

        source.connect(gainNode);
        gainNode.connect(analyser);
        analyser.connect(audioContext.destination);

        source.onended = () => {
          setIsPlaying(false);
          if (onAudioEnd) onAudioEnd();
        };

        source.start(0);
        audioSourceRef.current = source;

        setIsPlaying(true);
        if (onAudioStart) onAudioStart();

        // Start voice activity detection
        if (options.enableVoiceActivity !== false) {
          startVoiceActivityDetection();
        }

        return {
          status: "playing",
          duration: audioBuffer.duration,
          success: true
        };
      } catch (error) {
        console.error("Failed to play audio buffer:", error);
        return { status: "failed", error: error.message, success: false };
      }
    },
    [initAudioContext, onAudioStart, onAudioEnd]
  );

  // Play audio from URL
  const playAudioURL = useCallback(
    (url, options = {}) => {
      return new Promise((resolve, reject) => {
        try {
          const audio = new Audio(url);
          audio.volume = options.volume || 0.8;
          audio.playbackRate = options.playbackRate || 1.0;

          audio.onplay = () => {
            setIsPlaying(true);
            if (onAudioStart) onAudioStart();

            initAudioContext();

            if (options.enableVoiceActivity !== false) {
              startVoiceActivityDetection();
            }
          };

          audio.onended = () => {
            setIsPlaying(false);
            if (onAudioEnd) onAudioEnd();
            resolve({ status: "completed", success: true });
          };

          audio.onerror = (error) => {
            setIsPlaying(false);
            reject({ status: "failed", error, success: false });
          };

          audio.ontimeupdate = () => {
            setCurrentTime(audio.currentTime);
          };

          audio.onloadedmetadata = () => {
            setDuration(audio.duration);
          };

          audioElementRef.current = audio;
          audio.play();
        } catch (error) {
          reject({ status: "failed", error: error.message, success: false });
        }
      });
    },
    [initAudioContext, onAudioStart, onAudioEnd]
  );

  // Voice Activity Detection (VAD)
  const startVoiceActivityDetection = useCallback(() => {
    if (voiceActivityDetectorRef.current) return;

    const audioContext = audioContextRef.current;
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;

    if (!audioContext || !analyser) return;

    let isCurrentlyActive = false;
    let inactiveCounter = 0;

    const detectActivity = () => {
      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length / 255;

      const wasActive = isCurrentlyActive;
      isCurrentlyActive = average > voiceActivityThreshold;

      if (isCurrentlyActive) {
        inactiveCounter = 0;
      } else {
        inactiveCounter++;
      }

      const shouldBeActive =
        isCurrentlyActive ||
        inactiveCounter < voiceActivityDuration / 16;

      if (shouldBeActive !== wasActive) {
        setIsListening(shouldBeActive);
        if (onVoiceActivityChange) {
          onVoiceActivityChange({ isActive: shouldBeActive, volume: average });
        }
      }

      setVolume(average);
      voiceActivityDetectorRef.current =
        requestAnimationFrame(detectActivity);
    };

    voiceActivityDetectorRef.current = requestAnimationFrame(detectActivity);
  }, [voiceActivityThreshold, voiceActivityDuration, onVoiceActivityChange]);

  // Stop voice activity detection
  const stopVoiceActivityDetection = useCallback(() => {
    if (voiceActivityDetectorRef.current) {
      cancelAnimationFrame(voiceActivityDetectorRef.current);
      voiceActivityDetectorRef.current = null;
      setIsListening(false);
    }
  }, []);

  // Pause audio
  const pauseAudio = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      setIsPlaying(false);
    }
    stopVoiceActivityDetection();
  }, [stopVoiceActivityDetection]);

  // Resume audio
  const resumeAudio = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.play();
      setIsPlaying(true);
      startVoiceActivityDetection();
    }
  }, [startVoiceActivityDetection]);

  // Stop audio
  const stopAudio = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
    }
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
    }
    setIsPlaying(false);
    setCurrentTime(0);
    stopVoiceActivityDetection();
  }, [stopVoiceActivityDetection]);

  // Seek to time
  const seek = useCallback((time) => {
    if (audioElementRef.current) {
      audioElementRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  // Set volume
  const setAudioVolume = useCallback((volumeLevel) => {
    const clampedVolume = Math.max(0, Math.min(1, volumeLevel));
    if (audioElementRef.current) {
      audioElementRef.current.volume = clampedVolume;
    }
    if (audioContextRef.current) {
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = clampedVolume;
    }
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      stopAudio();
      stopVoiceActivityDetection();
    };
  }, [stopAudio, stopVoiceActivityDetection]);

  return {
    // Action methods
    playAudioBuffer,
    playAudioURL,
    pauseAudio,
    resumeAudio,
    stopAudio,
    seek,
    setVolume: setAudioVolume,
    startVAD: startVoiceActivityDetection,
    stopVAD: stopVoiceActivityDetection,

    // State
    isPlaying,
    isListening,
    volume,
    currentTime,
    duration,

    // Context
    audioContext: audioContextRef.current,
    analyser: analyserRef.current
  };
}

export default useAvatarAudio;
