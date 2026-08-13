# Live Tutor Research Guide

## Purpose

This implementation is a browser-based, multimodal assembly and disassembly tutor. A learner selects a device category, chooses assembly or disassembly, grants camera and microphone access, and receives continuous AI guidance while showing the object and its parts. The research mode now uses a closed-loop state-aware controller: a structured procedure defines the expected step, Gemini verifies the camera evidence, and progression is gated on the verification result.

The implemented categories are:

- Computer mouse
- Mobile phone
- CPU or desktop computer
- A custom product entered by the learner

The tutor is designed to inspect the camera feed continuously, identify only what it can see, guide one physical action at a time, and stop for safety checks before risky or irreversible actions.

## Architecture

| Layer | Technology | Responsibility |
| --- | --- | --- |
| User interface | React, TypeScript, Vite | Product selection, assembly/disassembly controls, camera preview, microphone controls, transcripts |
| Browser media | MediaDevices, Web Audio API, Canvas | Captures microphone PCM audio and periodic JPEG camera frames |
| Streaming transport | WebSocket | Sends audio, image frames, product context, stages, and text between browser and backend |
| Backend | FastAPI, Python | Authenticates the socket, validates payloads, manages session state, forwards streams |
| AI runtime | Google ADK and Gemini Live API | Processes multimodal input and returns real-time voice/text guidance |
| Verification service | FastAPI + Gemini vision | Compares the current camera frame with the expected procedure step |
| Session service | ADK InMemorySessionService | Holds short-lived local session state |
| Local mode | Local token and unlimited local entitlement | Allows development without Firebase sign-in or Firestore budgets |

## Execution Flow

1. The learner opens the Live Tutor screen.
2. The learner selects Mouse, Phone, CPU, or Add new.
3. The learner selects either Assemble or Disassemble.
4. The frontend creates a WebSocket connection to `/ws/{user_id}/{session_id}`.
5. The browser sends an authentication frame. In local development this is `local-dev-token`.
6. The browser sends `product_context`, for example:

```json
{
  "type": "product_context",
  "product": "Mobile phone",
  "productId": "phone",
  "action": "disassemble",
  "stage": "disassemble"
}
```

7. The browser sends microphone audio as 16 kHz, 16-bit, mono PCM binary frames.
8. The browser samples the camera and sends JPEG frames as base64 WebSocket messages.
9. The FastAPI bridge validates each message, builds Gemini content objects, and inserts the product/action/stage context into the agent conversation.
10. The frontend displays the current ground-truth procedure step and offers `Verify current action`.
11. The browser captures a higher-resolution still and posts it to `/v1/verify-action`.
12. The verifier compares expected action, required objects, and expected state with visible evidence. It returns `verified`, `incomplete`, `incorrect`, `unclear`, or `unsafe`.
13. The UI advances to the next structured step only when the result is `verified`; otherwise it shows the observed action and corrective instruction.
14. Gemini Live continues the conversational voice/camera guidance until the user ends the session.

## Product Context Protocol

The backend procedure source of truth is `backend/live-bridge/app/procedures.py`. It contains device-specific ordered steps for mouse, phone, and desktop computer assembly and disassembly. Each step includes an action, instruction, required objects, and expected state. Custom devices remain inspect-first and are guided conversationally until a procedure is authored.

The new repair workflow uses four stages:

| Stage | Tutor behavior |
| --- | --- |
| `inspect` | Identify visible seams, screws, clips, ports, cables, batteries, and risks |
| `disassemble` | Direct one teardown step at a time and wait for the learner to show progress |
| `assemble` | Guide reverse-order reassembly and verify connectors, cable routing, and screw placement |
| `validate` | Check the device is closed safely, no tools or loose screws remain, and power-on is appropriate |

The backend preserves the current product, task, and stage for the WebSocket session. Text messages are prefixed with structured context, for example:

```text
[stage=disassemble] [product=Mobile phone] [action=disassemble] What should I remove next?
```

The visual verification request is a separate closed-loop transaction:

```text
Expected: step 2, separate_top_shell, bottom_screws_removed
Observed: one screw still visible; shell appears closed
Result: incomplete
Action: remove the remaining screw before separating the shell
```

## Safety Design

The system prompt tells the tutor to:

- Ask for a closer camera view instead of guessing about unseen parts.
- Guide only one physical action at a time.
- Require external power removal before work begins.
- Treat phones and lithium batteries conservatively; no puncturing, bending, heating, or bypassing battery protection.
- Never instruct users to open a power supply unit or touch mains-powered internals/capacitors.
- Stop when a battery is swollen, hot, damaged, or smells unusual.
- Confirm connector orientation, cable routing, screw organization, and enclosure fit during reassembly.

## Main Source Files

| File | What it contributes |
| --- | --- |
| `frontend/components/ohmlet/views/LiveTutorView.tsx` | Product cards, task toggle, custom device input, stage controls, camera interface, chat prompts |
| `frontend/hooks/useLiveBridge.ts` | WebSocket lifecycle, local auth frame, microphone capture, camera snapshots, audio playback, transcript handling |
| `backend/live-bridge/app/main.py` | FastAPI WebSocket bridge, product context handling, Gemini Live runner, audio/image forwarding |
| `backend/live-bridge/app/ohmlet_live_agent/agent.py` | Tutor persona, device assembly/disassembly behavior, safety rules, hardware stages |
| `backend/live-bridge/app/procedures.py` | Ground-truth ordered procedures for mouse, phone, and desktop computer |
| `backend/live-bridge/app/visual_verification.py` | Gemini vision comparison of a camera frame against the expected step |
| `frontend/services/assemblyTutor.ts` | Procedure loading and visual-verification API client |
| `backend/live-bridge/app/validation.py` | Input-size limits and allowed stage validation |
| `backend/live-bridge/app/auth.py` | Firebase verification with a local development token bypass |
| `backend/live-bridge/app/entitlements.py` | Local unlimited-live-session mode and production usage limits |
| `backend/live-bridge/app/ohmlet_live_agent/tools.py` | Supporting AI tools for code, debugging, explanations, and component identification |
| `scripts/start-live-tutor.sh` | Local startup script for backend and frontend |
| `Makefile` | `make live-tutor`, `make stop-live-tutor`, and `make restart-live-tutor` commands |

## Recommended Research Paper Framing

Suggested title:

> A Real-Time Multimodal AI Tutor for Guided Consumer-Device Assembly and Disassembly

Suggested research questions:

1. Can a multimodal, voice-based tutor reduce errors during physical disassembly and reassembly?
2. How does continuous visual monitoring compare with static repair manuals or prerecorded video tutorials?
3. Which safety interventions are most important when tutoring phone, computer, and battery-adjacent repairs?
4. How does the quality of camera angle, lighting, and frame cadence affect guidance accuracy?
5. How do users perceive confidence, trust, and cognitive load when an AI asks for visual confirmation before each physical step?
6. Does gating step progression on visual verification reduce wrong-step attempts compared with unconstrained multimodal next-step generation?

Suggested methodology:

- Recruit participants with beginner and intermediate repair experience.
- Assign device tasks such as mouse teardown, PC RAM replacement, or phone external inspection.
- Compare a static instruction condition with the live-tutor condition.
- Measure task completion, time, errors, unsafe actions prevented, number of clarifying turns, and user confidence.
- Exclude dangerous procedures such as internal power-supply repair and damaged lithium-battery handling.

## Prompt for ChatGPT

Upload the `live-tutor-source.zip` file together with this document, then use this prompt:

```text
You are helping me write a research paper about a real-time multimodal AI tutor for physical product assembly and disassembly. Read the attached source-code bundle and research guide. Explain the system architecture, browser-to-backend data flow, WebSocket protocol, Gemini Live integration, safety design, local-development mode, and product-context design. Then produce a research-paper outline with abstract, introduction, related work topics, methodology, evaluation metrics, limitations, ethics/safety discussion, and conclusion. Do not invent experimental results; label proposed evaluation plans as proposals.
```

## Running Locally

From the repository root:

```bash
make live-tutor
```

Open `http://127.0.0.1:5173/ohmlet-app` and select a product card before starting the session.

## Security Note

The source bundle intentionally excludes `backend/live-bridge/.env` because it contains the Gemini API key. Keep API keys out of research papers, screenshots, uploads, and public repositories. If a key has been pasted or shown in logs, rotate it in Google AI Studio.
