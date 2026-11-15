"""The list of models users can pick from, and how a chat decides which one to use."""
import os
from collections import namedtuple

from .models import BotSettings, ChatModel
from .services.llm import CREATIVITY_TEMPS

# Gemini's Flash / Flash-Lite models have a real free tier. OpenAI's API has no free tier
# (prepaid, per token), so those are labelled "Paid" and only appear once an OpenAI key is set.
DEFAULT_MODELS = [
    dict(key="gemini-flash", label="Gemini Flash", provider="gemini", model_id="gemini-flash-latest",
         description="Fast, smart and free. Best for everyday questions.", tags="Free,Fast", sort_order=10),
    dict(key="gemini-flash-lite", label="Gemini Flash-Lite", provider="gemini", model_id="gemini-flash-lite-latest",
         description="The lightest and quickest. Great for short answers.", tags="Free,Fastest", sort_order=20),
    dict(key="gemini-3-8-flash", label="Gemini 3.8 Flash", provider="gemini", model_id="gemini-3.8-flash",
         description="A newer Flash model with stronger reasoning.", tags="Free,Newest", sort_order=30),
    dict(key="gemini-2-5-pro", label="Gemini 2.5 Pro", provider="gemini", model_id="gemini-2.5-pro",
         description="Deep thinking for hard problems. Slower, and free limits are tight.", tags="Limited free,Smartest",
         sort_order=40, enabled=False),
    dict(key="gpt-5-mini", label="GPT-5 mini", provider="openai", model_id="gpt-5-mini",
         description="Balanced and capable. Needs an OpenAI key with credit.", tags="Paid,Smart", sort_order=50),
    dict(key="gpt-5-nano", label="GPT-5 nano", provider="openai", model_id="gpt-5-nano",
         description="OpenAI's fastest, lowest-cost model.", tags="Paid,Fast", sort_order=60),
]

Resolved = namedtuple("Resolved", "provider model_id temperature model")


def ensure_seeded():
    if not ChatModel.objects.exists():
        ChatModel.objects.bulk_create([ChatModel(**d) for d in DEFAULT_MODELS])


def provider_available(provider: str) -> bool:
    env = {"gemini": "GEMINI_API_KEY", "openai": "OPENAI_API_KEY"}.get(provider)
    return bool(env and os.environ.get(env))


def usable_models():
    """Enabled models whose provider has an API key configured on the server."""
    ensure_seeded()
    return [m for m in ChatModel.objects.filter(enabled=True) if provider_available(m.provider)]


def default_model(cfg):
    usable = usable_models()
    if cfg.default_model_id:
        for m in usable:
            if m.pk == cfg.default_model_id:
                return m
    return usable[0] if usable else None


def resolve_settings(cfg, prefs):
    """Pick provider, model id and temperature for a chat, applying the user's own choices."""
    usable = usable_models()
    chosen = None
    if prefs and prefs.model_name:
        chosen = next((m for m in usable if m.key == prefs.model_name), None)
    chosen = chosen or default_model(cfg)

    if chosen:
        provider, model_id = chosen.provider, chosen.model_id
    else:  # nothing configured: fall back to the legacy single-model settings
        provider, model_id = cfg.provider, cfg.model_name

    temperature = cfg.temperature
    if prefs and prefs.creativity in CREATIVITY_TEMPS:
        temperature = CREATIVITY_TEMPS[prefs.creativity]
    return Resolved(provider, model_id, temperature, chosen)


def describe(m, provider_labels=None):
    if m is None:
        return None
    return {
        "key": m.key,
        "label": m.label,
        "provider": m.provider,
        "provider_label": m.get_provider_display(),
        "description": m.description,
        "tags": m.tag_list(),
    }