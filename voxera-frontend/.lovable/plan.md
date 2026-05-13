## Voxera — Realtime AI Voice Interface

A single immersive page. Cinematic dark aesthetic, animated AI orb centerpiece, real microphone input via browser Speech Recognition, real AI replies via Lovable AI, and simulated speaking visuals (browser SpeechSynthesis as a stand-in for ElevenLabs TTS).

### Experience

One route (`/`) with a fixed full-viewport stage:

```
┌──────────────────────────────────────────────────┐
│  ambient particles · grid · gradient blooms      │
│                                                  │
│   [status pill: Listening…]                      │
│                                                  │
│              ╭──────────╮                        │
│              │   ORB    │   ← centerpiece        │
│              ╰──────────╯                        │
│           [waveform bars]                        │
│                                                  │
│   [Start]  [Mute]  [Stop]                        │
│                                                  │
│  ╭─ Transcript ─╮      ╭─ Pipeline ─╮            │
│  │ user / AI    │      │ STT · LLM  │            │
│  │ (auto-scroll)│      │ TTS · Tot. │            │
│  ╰──────────────╯      ╰────────────╯            │
│                                       [⚙ Settings]│
└──────────────────────────────────────────────────┘
```

### What's built

1. **Design system** — graphite/near-black background, neon cyan/blue accents, glassmorphism tokens, glow shadows, gradient utilities (all in `src/styles.css` via oklch).
2. **AI Orb** (`components/Orb.tsx`) — layered radial gradients + blur, Framer Motion driven. Four states: `idle` (slow pulse), `listening` (audio-reactive scale from mic analyser), `thinking` (rotating inner energy + flicker), `speaking` (expanding glow rings synced to fake amplitude).
3. **Background** (`components/AmbientBackground.tsx`) — animated particles (canvas), subtle grid overlay, two slow-drifting gradient blooms.
4. **Voice controls** (`components/VoiceControls.tsx`) — Start / Stop / Mute buttons with glow + tactile hover.
5. **Waveform** (`components/Waveform.tsx`) — real-time bars from `AnalyserNode` while mic is open.
6. **Transcript panel** (`components/TranscriptPanel.tsx`) — animated message cards, user vs AI styling, auto-scroll, glassmorphism.
7. **Status indicator** (`components/StatusPill.tsx`) — animated label for Idle / Listening / Processing / Speaking.
8. **Pipeline metrics** (`components/PipelineMetrics.tsx`) — four cards (STT, LLM, TTS, Total) with live values + sparkline mini-graphs.
9. **Settings panel** (`components/SettingsPanel.tsx`) — floating glass sheet: System Prompt, Personality preset, Voice select, Temperature slider. Persisted in `localStorage` (client-only, hydration-safe).
10. **Voice engine hook** (`hooks/useVoiceSession.ts`) — orchestrates the pipeline:
    - Web Speech API (`SpeechRecognition`) for live STT + interim transcripts
    - `getUserMedia` + `AudioContext` analyser for orb/waveform reactivity
    - On final user utterance → call server fn → AI reply
    - `SpeechSynthesis` plays reply while orb enters `speaking` state (simulated TTS visuals, as scoped)
    - Records latency at each stage → feeds PipelineMetrics
11. **Server function** (`lib/voxera.functions.ts`) — `chatWithVoxera` server fn calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with the user's system prompt + conversation history. Reads `LOVABLE_API_KEY` inside the handler.

### Technical details

- **Stack**: TanStack Start + React 19 + Vite + Tailwind v4 + Framer Motion + shadcn/ui + Lucide. (Next.js isn't available in this environment; the visual + behavioral result is identical.)
- **Routing**: single route at `src/routes/index.tsx`; replace placeholder.
- **Backend**: enable Lovable Cloud (auto-provisions `LOVABLE_API_KEY`). No database, no auth needed.
- **Browser APIs**: all `window` / `navigator` / `localStorage` / `SpeechRecognition` access gated inside `useEffect` or event handlers to keep SSR clean.
- **STT scope**: uses browser Web Speech API. Works in Chromium-based browsers; Safari/Firefox have partial/no support — a graceful fallback notice will appear when unavailable.
- **TTS scope**: per your "hybrid" choice, real ElevenLabs TTS is **not** wired. Browser `SpeechSynthesis` plays replies and drives the speaking-state visuals. Easy to upgrade later.
- **Responsive**: orb scales fluidly; transcript + metrics stack on mobile; settings becomes a bottom sheet under `md`.

### Out of scope (explicitly)

- Real ElevenLabs TTS audio
- Account/auth, history persistence beyond settings
- Multi-page navigation (single immersive page by design)

### Files to add/modify

```
src/styles.css                              (extend tokens)
src/routes/index.tsx                        (replace placeholder)
src/components/Orb.tsx
src/components/AmbientBackground.tsx
src/components/VoiceControls.tsx
src/components/Waveform.tsx
src/components/TranscriptPanel.tsx
src/components/StatusPill.tsx
src/components/PipelineMetrics.tsx
src/components/SettingsPanel.tsx
src/hooks/useVoiceSession.ts
src/lib/voxera.functions.ts                 (server fn → Lovable AI)
```
