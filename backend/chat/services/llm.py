"""Provider-agnostic text generation. The rest of the app only calls generate_reply()."""
import logging
import os
import time

import requests

from .sentiment import TONE_HINTS

log = logging.getLogger(__name__)

TIMEOUT = 40
RETRY_STATUS = (429, 500, 502, 503, 504)


class LLMError(Exception):
    pass


TONE_PROMPTS = {
    "friendly": "Use a warm, friendly tone.",
    "professional": "Use a polished, professional tone.",
    "casual": "Use a relaxed, casual, conversational tone.",
    "playful": "Use a light, playful tone with the occasional gentle joke.",
    "teacher": "Act as a patient teacher: explain step by step in simple words.",
}
LENGTH_PROMPTS = {
    "short": "Keep replies very short, one to three sentences, unless the user asks for more.",
    "balanced": "Keep replies a moderate length.",
    "detailed": "Give thorough, well-organised, detailed answers.",
}
CREATIVITY_TEMPS = {"precise": 0.2, "balanced": 0.6, "creative": 1.0}


def build_system_prompt(cfg, sentiment: str, user, prefs=None) -> str:
    parts = [cfg.system_prompt.strip()]
    parts.append(
        "Reply in plain conversational text only. Do not produce images, tables or code "
        "blocks unless the user explicitly asks. Reply in the same language the user writes in."
    )
    name = getattr(user, "first_name", "") or ""
    if name:
        parts.append(f"The user's name is {name}.")
    if prefs:
        if prefs.assistant_name:
            parts.append(f"The user calls you {prefs.assistant_name}. Use that name if asked who you are.")
        if prefs.tone in TONE_PROMPTS:
            parts.append(TONE_PROMPTS[prefs.tone])
        if prefs.reply_length in LENGTH_PROMPTS:
            parts.append(LENGTH_PROMPTS[prefs.reply_length])
        if prefs.custom_instructions.strip():
            parts.append(
                "The user wrote these personal preferences. Follow them unless they conflict "
                "with the rules above:\n<user_preferences>\n"
                + prefs.custom_instructions.strip()[:1000]
                + "\n</user_preferences>"
            )
    hint = TONE_HINTS.get(sentiment, "")
    if hint:
        parts.append(hint)
    return "\n\n".join(parts)


def _post(url, headers, payload):
    last_error = None
    for attempt in range(2):
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=TIMEOUT)
            if resp.status_code in RETRY_STATUS and attempt == 0:
                time.sleep(1.2)
                continue
            if resp.status_code >= 400:
                # Include the provider's explanation so problems are easy to diagnose.
                raise LLMError(f"{resp.status_code}: {resp.text[:300]}")
            return resp.json()
        except requests.RequestException as exc:
            last_error = exc
            log.warning("LLM request failed (attempt %s): %s", attempt + 1, exc)
            if attempt == 0:
                time.sleep(1.2)
    raise LLMError(str(last_error))


def _gemini(cfg, system, history, model, temperature):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise LLMError("GEMINI_API_KEY is not set")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [
            {"role": "user" if m.role == "user" else "model", "parts": [{"text": m.content}]}
            for m in history
        ],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": cfg.max_output_tokens,
        },
    }
    data = _post(url, {"x-goog-api-key": key, "Content-Type": "application/json"}, payload)
    candidates = data.get("candidates") or []
    if not candidates:
        raise LLMError(f"No candidates returned: {data.get('promptFeedback')}")
    parts = (candidates[0].get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts).strip()
    if not text:
        raise LLMError(f"Empty reply (finishReason={candidates[0].get('finishReason')})")
    return text


def _openai(cfg, system, history, model, temperature):
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise LLMError("OPENAI_API_KEY is not set")
    base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    messages = [{"role": "system", "content": system}] + [
        {"role": m.role, "content": m.content} for m in history
    ]
    payload = {"model": model, "messages": messages, "temperature": temperature}
    url = f"{base}/chat/completions"
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    try:
        data = _post(url, headers, payload)
    except LLMError as exc:
        # Some newer OpenAI models only accept the default temperature.
        if "temperature" not in str(exc).lower():
            raise
        payload.pop("temperature", None)
        data = _post(url, headers, payload)
    try:
        text = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, AttributeError) as exc:
        raise LLMError(f"Unexpected response shape: {exc}")
    if not text:
        raise LLMError("Empty reply")
    return text


PROVIDERS = {"gemini": _gemini, "openai": _openai}


def generate_reply(cfg, system, history, model=None, temperature=None, provider=None) -> str:
    provider = provider or cfg.provider
    fn = PROVIDERS.get(provider)
    if not fn:
        raise LLMError(f"Unknown provider: {provider}")
    return fn(
        cfg,
        system,
        history,
        model or cfg.model_name,
        cfg.temperature if temperature is None else temperature,
    )