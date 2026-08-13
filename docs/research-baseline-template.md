# Research Baseline Evaluation Template

## Conditions

| Condition | Description |
| --- | --- |
| Static manual | PDF/manual with the same device procedure and safety notes |
| Pre-recorded video | Fixed tutorial video with no interaction or visual feedback |
| Generic multimodal LLM | Camera-capable model asked for next-step advice without structured procedures or verification gates |
| Proposed state-aware tutor | Structured procedure + expected step tracking + visual verification + continuous voice/camera guidance |

## Primary Metrics

| Metric | Static manual | Video | Generic AI | Proposed tutor |
| --- | ---: | ---: | ---: | ---: |
| Completion rate (%) |  |  |  |  |
| Mean task time (min) |  |  |  |  |
| Physical errors (count) |  |  |  |  |
| Wrong-step attempts (count) |  |  |  |  |
| Clarification turns (count) |  |  |  |  |
| Safety interventions (count) |  |  |  |  |
| Unresolved failures (count) |  |  |  |  |
| User confidence (1–7) |  |  |  |  |

## Verification Metrics

- Step recognition accuracy: expected step versus observed step.
- Action verification precision: verified actions that were actually complete.
- Action verification recall: complete actions correctly accepted.
- Unsafe-action detection rate.
- False-warning rate.
- Mean verification latency.
- Number of unnecessary reversions to an earlier step.

## Trial Protocol

Use the same device, task, tools, lighting guidance, and safety exclusions across conditions. Randomize condition order when possible. Record screen, camera view, transcript, timestamps, expected step, observed step, verification result, and intervention reason. Exclude live mains work, opened power-supply units, damaged lithium batteries, and other hazardous procedures from participant trials.

The central hypothesis is that the proposed tutor reduces wrong-step attempts and unsafe actions because it gates progression on visual evidence instead of relying on unconstrained next-step generation.
