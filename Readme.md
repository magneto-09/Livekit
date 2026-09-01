# LiveKit AI Voice Interviewer

An AI voice interviewer built with LiveKit Agents (Node.js/TypeScript). A candidate joins a
LiveKit room, an AI agent joins the same room, and the two hold a structured voice interview:
the agent asks a fixed set of questions, the candidate answers by voice, and the interview
produces a transcript, an audio recording, and a result page.

## Setup

### Prerequisites

- Node.js 20+
- npm (backend) and pnpm (agent) — each project keeps its own lockfile/package manager
- A LiveKit Cloud project (or self-hosted LiveKit) with an API key/secret
- Deepgram/inference credentials are not needed separately — STT/LLM/TTS run through
  LiveKit's `inference` gateway, authenticated with the same `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`

### Installation

```bash
cd backend && npm install
cd ../agent && pnpm install
cd ../frontend && npm install
```

### Environment variables

`backend/.env` (copy from `backend/.env.example`):
```
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_AGENT_NAME=interviewer-agent
ALLOWED_ORIGINS=http://localhost:3000
```

`agent/.env` (copy from `agent/.env.example`):
```
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_AGENT_NAME=interviewer-agent
BACKEND_URL=http://localhost:8000
```
`BACKEND_URL` is how the Agent (a separate Node process) reports the final transcript/status
back to the backend when an interview finishes — see [Transcript](#transcript) below.

`frontend/.env` (copy from `frontend/.env.example`):
```
VITE_API_BASE_URL=http://localhost:8000
VITE_LIVEKIT_URL=
```

`LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` must be the same LiveKit project in both
`backend/.env` and `agent/.env`, and `LIVEKIT_AGENT_NAME` must match in both so the backend's
dispatch actually reaches the running agent worker.

### Running the project

Start all three in order (the agent worker needs a few seconds to register before it can
accept a dispatch):

```bash
cd agent && npm run dev      # wait for the "registered worker" log line
cd backend && npm run dev    # http://localhost:8000
cd frontend && npm run dev   # http://localhost:3000
```

## Architecture

```
Frontend (React)
   │  POST /api/connect/start-interview  { candidateName, jobTitle, questions }
   ▼
Backend (Express)
   │  1. validates the request
   │  2. generates a unique room name + candidate access token
   │  3. dispatches the interviewer-agent to that room (LiveKit Agent Dispatch)
   │  4. creates an in-memory interview record (status: in-progress)
   │  5. returns { roomName, accessToken }
   ▼
LiveKit Room
   ├── Candidate (browser, joins with the returned token)
   └── AI Agent (Node worker, joins via dispatch)
          │
          AgentSession: STT → LLM → TTS (LiveKit inference gateway)
          │
          InterviewController: asks questions in order, processes answers,
          tracks status/answers/transcript
```

The frontend's existing `/get-token`-style flow from earlier parts (`connect.services.ts` →
`useRoomTokenStore` → `LiveKitProvider`) is unchanged — Part E only adds what happens *after*
the interview ends.

## Transcript

**Model** (`agent/interview-state.ts`):
```ts
interface TranscriptMessage {
  speaker: "ai" | "candidate"
  text: string
  timestamp: string
}
```
`InterviewState.transcript: TranscriptMessage[]` sits alongside the existing `answers` array
(which the controller already used to gate question progression) — the transcript is a pure
conversation log and doesn't affect interview control flow.

**Capture**: the transcript only contains the actual interview questions and the candidate's
answers to them — not the greeting, acknowledgements, or closing remarks. `InterviewController`
pushes an `"ai"` entry itself in `askCurrentQuestion()` (the only place a real question is
spoken) and a `"candidate"` entry in `processCandidateAnswer()` for each non-empty answer, both
timestamped at push time. This is deliberately explicit rather than capturing every chat item
the SDK's `ConversationItemAdded` event would otherwise surface (which includes the greeting,
LLM-generated acknowledgements, and the closing message) — the result page's "Conversation"
section should read as the actual Q&A, not the full chit-chat.

**Storage**: transcript messages accumulate on `InterviewState.transcript` in the agent
process for the life of the interview. When the interview finishes (completed or aborted),
the Agent POSTs the final `{status, endedAt, transcript}` to the backend
(`POST /api/connect/interviews/:interviewId/result`), which merges it into its own in-memory
`Map<interviewId, InterviewRecord>` (`backend/store/interviews.ts`). No database — this is
explicitly out of scope for the assignment, and the Map survives for the life of the backend
process (lost on restart, same as everything else in-memory here).

## Audio Recording

**Decision**: recording is done **client-side**, not via LiveKit Egress. This project runs on
LiveKit Cloud, and Egress runs in LiveKit's own cloud infrastructure — it has no local disk to
write to and can only upload to external storage (S3/GCS/Azure). Since the goal was a truly
local recording with no cloud storage account, Egress was skipped in favor of capturing the
room's actual mixed audio in the browser.

**Mechanism** (`frontend/src/hooks/use-interview-recorder.ts`): a Web Audio
`MediaStreamAudioDestinationNode` is used as a mixer. Every audio track that gets
published/subscribed in the room — the candidate's own mic *and* the agent's TTS output track —
is routed into that one destination via `AudioContext.createMediaStreamSource(...).connect(destination)`.
A single `MediaRecorder` records `destination.stream`, so the resulting file is the actual
two-way conversation, not just the candidate's local mic (which the assignment explicitly
warns against).

**Lifecycle**:
- Starts as soon as `InterviewRoom` mounts (i.e. once the candidate has joined the room).
- Stops when the interview ends. The Agent detects completion/abort in
  `InterviewController.finish()` and broadcasts a LiveKit data message
  (`{ type: "interview-completed", status }`) to the room *before* shutting down, so the
  closing message is still part of the recording. The frontend listens for that message,
  stops the recorder, uploads the resulting blob, disconnects, and navigates to the result
  page. Manually clicking "End Interview" runs the same finalize path directly (treated as
  `aborted`, matching what the Agent's own disconnect handling will record).

**Storage**: `POST /api/connect/interviews/:interviewId/recording` (raw binary body) writes
the file to `backend/recordings/<interviewId>.webm` (gitignored). `GET
/api/connect/interviews/:interviewId/recording` serves it back.

**Frontend access**: the result record's `recordingUrl` is that GET path; the result page
renders `<audio controls src="{VITE_API_BASE_URL}{recordingUrl}">`.

**Recording failure handling**: if mixing a track fails, or the upload fails, it's logged and
the interview/navigation continues regardless — `recordingUrl` simply stays unset and the
result page shows "Recording not available" instead of blocking anything.

## Result Page

Route: `/interview/result/:roomName` (`frontend/src/pages/result/ResultPage.tsx`).

- Fetches `GET /api/connect/interviews/:interviewId` on mount.
- Displays candidate name, job title, status (`In Progress`/`Completed`/`Aborted`), duration,
  the full transcript (speaker label always shown as text, not just color, per the assignment),
  and an audio player if a recording is available.
- **Duration**: the backend computes `duration = endedAt - startedAt` in seconds
  (`backend/routes/interviews.ts`, `computeDuration`), formatted client-side as `mm:ss`.
  `startedAt` is set by the backend when the interview record is created (at dispatch time);
  `endedAt` is set when the Agent's result callback lands.
- Because the Agent's `POST .../result` call and the frontend's own navigation both fire off
  the same "interview completed" moment but travel independently (agent → backend HTTP vs.
  candidate browser → backend HTTP), there's a small window where the result page could load
  before the Agent's report has landed. Rather than building a polling loop, the page does one
  extra fetch ~1.5s after the first if the status still reads `in-progress` — good enough for
  this assignment's scope without adding real polling infrastructure.

## Failure Handling

- **STT failure**: `AgentSessionEventTypes.Error` is a single event covering STT/LLM/TTS
  errors uniformly (`{type: 'stt_error'|'llm_error'|'tts_error', error, recoverable}`). On
  `stt_error`, the agent logs it and calls the same `requestRepeat()` path already used for
  `UserTranscriptionTimeout` — the question is never advanced, nothing is stored.
- **Empty STT result**: unchanged from the existing behavior — `processCandidateAnswer` treats
  a blank/whitespace transcript the same as a failure: `requestRepeat()`, no answer stored, no
  question advance.
- **LLM failure**: see [Problem-Solving Question](#problem-solving-question) below.
- **TTS failure**: `session.say(...)` calls are wrapped in a small `withRetry` helper (retry
  once, then give up gracefully) inside a private `InterviewController.say()`. On failure after
  retry, it's logged and the interview state is left exactly as it was — the agent doesn't
  crash and doesn't silently advance the question index.
- **Candidate disconnect**: unchanged — `agent.ts`'s existing `participantDisconnected`
  listener calls `controller.abort()`, which sets `status = "aborted"` (only if it wasn't
  already `completed`/`aborted`) and now also reports the final transcript/status to the
  backend before shutting the session down.
- **Recording failure**: logged, never blocks the interview or navigation (see above).
- **Agent/session failure**: `AgentSessionEventTypes.Close` fires whenever the session ends for
  *any* reason, including ones our own code didn't trigger (a crash, an unrecoverable error).
  `InterviewController.finalizeIfUnreported()` is wired to that event: if the interview hasn't
  already been reported as completed/aborted, it force-marks it `aborted` and reports it, so an
  interview can never get stuck `in-progress` forever in the backend's store.

### Problem-Solving Question

*Candidate is answering Question 2, but the LLM request fails.*

1. **The interview stays on Question 2.** `currentQuestionIndex` is only ever incremented after
   `generateReply()` succeeds (`interview-controller.ts`, `processCandidateAnswer`) — a failure
   returns early before that line runs.
2. **The candidate's answer isn't lost.** The answer is pushed to `state.answers` *before* the
   LLM call is attempted, and is guarded against duplicate pushes on the next attempt
   (`!state.answers.some(item => item.question === question)`).
3. **The Agent retries once.** `withRetry()` re-invokes `generateReply()` a single time before
   giving up — no complex retry/backoff framework, per the assignment's scope.
4. **On repeated failure, a graceful fallback re-asks the same question** (`askCurrentQuestion()`)
   rather than leaving the candidate met with silence, still without touching
   `currentQuestionIndex` or duplicating the stored answer.
5. **Interview state (`InterviewState`) is independent of the LLM** — it's a plain object owned
   by `InterviewController`, mutated only by the controller's own methods. An LLM outage can
   never corrupt or bypass it; the state machine only moves forward on confirmed success.

## Assumptions & Limitations

- All interview state (backend `Map` + agent `InterviewState`) is in-memory — it does not
  survive a backend restart (`nodemon` will drop live interview records on every file save,
  same limitation the assignment explicitly accepts for a POC).
- `duration` is measured backend-side from dispatch time to the Agent's completion report, not
  from the exact moment the candidate started speaking — close enough for this assignment.
- If a candidate manually clicks "End Interview" and the browser tab closes quickly afterward,
  there's a small window where the backend's `aborted` status (reported by the Agent's own
  disconnect handling) hasn't landed yet when the result page's first fetch happens — the
  page's one-shot refetch (above) covers this in practice.
- Recording requires the browser tab to stay open until the interview finishes; a hard tab
  close mid-interview loses the client-side in-progress recording buffer (this is inherent to
  doing recording client-side instead of via server-side Egress).

## What's Next (Part F, not implemented)

Candidate scoring/evaluation, authentication, a dashboard listing past interviews, persistence
beyond in-memory storage, and any deployment/CI infrastructure are all explicitly out of scope
for this assignment and were not implemented.
