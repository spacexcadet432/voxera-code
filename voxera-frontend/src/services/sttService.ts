import type {
  SttService,
  SttSession,
  SttCallbacks,
} from "./types";

type SR = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: { new (): SR };
    webkitSpeechRecognition?: { new (): SR };
  }
}

/**
 * Browser STT via Web Speech API.
 * TODO(backend): swap with a Deepgram-backed implementation that streams
 * audio chunks over WebSocket to FastAPI.
 */
export const browserSttService: SttService = {
  isSupported() {
    if (typeof window === "undefined") return false;
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  },
  async start(opts: { lang?: string } & SttCallbacks): Promise<SttSession> {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) throw new Error("Web Speech API not supported");
    const recog = new Ctor();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = opts.lang ?? "en-US";

    let stopped = false;

    recog.onresult = (e: any) => {
      let interimText = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (interimText) opts.onInterim(interimText);
      if (finalText) opts.onFinal(finalText);
    };

    recog.onerror = (e: any) => {
      const code = e?.error ?? "unknown";
      opts.onError(code);
    };

    recog.onend = () => {
      if (stopped) {
        opts.onEnd?.();
        return;
      }
      // Auto-restart while session is alive
      try {
        recog.start();
      } catch {
        /* noop */
      }
    };

    try {
      recog.start();
    } catch {
      /* already started */
    }

    return {
      stop: () => {
        stopped = true;
        try {
          recog.abort();
        } catch {
          /* noop */
        }
      },
    };
  },
};
