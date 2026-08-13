"""Gemini vision verification for one structured physical action."""

from __future__ import annotations

import json
import os
from typing import Any

from google import genai
from google.genai import types


def _client() -> genai.Client:
    return genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))


def verify_action(frame: bytes, product: str, action: dict[str, Any], previous_state: str | None = None) -> dict[str, Any]:
    prompt = f"""You are a strict visual verifier in a physical assembly/disassembly experiment.
Product: {product}
Expected step: {action.get('id')}
Expected action: {action.get('action')}
Expected state: {action.get('expected_state')}
Required objects: {json.dumps(action.get('required_objects', []))}
Previous state: {previous_state or 'unknown'}

Inspect only what is visible in the image. Determine whether the expected action is visibly complete.
Also determine whether the user appears to be attempting a later or different action.
Return ONLY valid JSON with this exact shape:
{{
  "status": "verified" | "incomplete" | "incorrect" | "unclear" | "unsafe",
  "expected_step": {action.get('id')},
  "observed_action": "short description",
  "observed_state": "short description",
  "evidence": ["visible evidence"],
  "missing": ["missing objects or conditions"],
  "next_instruction": "one safe instruction",
  "confidence": 0.0
}}
Do not infer hidden actions. Use unclear when the camera cannot prove completion."""
    response = _client().models.generate_content(
        model=os.getenv("OHMLET_FLASH_MODEL", "gemini-2.5-flash"),
        contents=[types.Part.from_bytes(data=frame, mime_type="image/jpeg"), prompt],
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    try:
        result = json.loads(response.text or "{}")
    except json.JSONDecodeError:
        result = {}
    result.setdefault("status", "unclear")
    result.setdefault("expected_step", action.get("id"))
    result.setdefault("observed_action", "Unable to determine")
    result.setdefault("observed_state", "Unable to determine")
    result.setdefault("evidence", [])
    result.setdefault("missing", [])
    result.setdefault("next_instruction", "Adjust the camera so the action is clearly visible.")
    result.setdefault("confidence", 0.0)
    return result
