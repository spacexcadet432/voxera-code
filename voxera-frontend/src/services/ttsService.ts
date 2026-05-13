import type { TtsRequest, TtsService } from "./types";

/**
 * TTS via browser SpeechSynthesis with simulated amplitude pulses.
 * TODO(backend): swap with an ElevenLabs WebSocket stream that pipes PCM
 * frames to an AudioWorklet, exposing real amplitude through onAmplitude.
 */
export const browserTtsService: TtsService = {
  speak(req: TtsRequest): Promise<number> {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        resolve(0);
        return;
      }
      const t0 = Date.now();
      const synth = window.speechSynthesis;
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(req.text);
      if (req.voice && req.voice !== "auto") {
        const match = synth.getVoices().find((v) => v.voiceURI === req.voice);
        if (match) utter.voice = match;
      }
      utter.rate = 1;
      utter.pitch = 1;
      utter.onstart = () => req.onStart?.();
      utter.onend = () => {
        req.onAmplitude?.(0);
        resolve(Date.now() - t0);
      };
      utter.onerror = () => {
        req.onAmplitude?.(0);
        resolve(Date.now() - t0);
      };

      // Simulated amplitude envelope
      let phase = 0;
      const tick = () => {
        if (synth.speaking) {
          phase += 0.18;
          req.onAmplitude?.(0.3 + Math.abs(Math.sin(phase)) * 0.5);
          requestAnimationFrame(tick);
        } else {
          req.onAmplitude?.(0);
        }
      };
      requestAnimationFrame(tick);

      synth.speak(utter);
    });
  },
  cancel() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  },
};
