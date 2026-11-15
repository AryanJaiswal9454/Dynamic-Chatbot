import re

from django.conf import settings
from django.db import models

TONES = [
    ("", "Default"),
    ("friendly", "Friendly"),
    ("professional", "Professional"),
    ("casual", "Casual"),
    ("playful", "Playful"),
    ("teacher", "Patient teacher"),
]
LENGTHS = [("", "Default"), ("short", "Short"), ("balanced", "Balanced"), ("detailed", "Detailed")]
CREATIVITY = [("", "Default"), ("precise", "Precise"), ("balanced", "Balanced"), ("creative", "Creative")]


class BotSettings(models.Model):
    """Single-row table. Edit it in Django admin to white-label the bot per client."""

    PROVIDERS = [
        ("gemini", "Google Gemini"),
        ("openai", "OpenAI-compatible (OpenAI, Groq, OpenRouter, etc.)"),
    ]

    bot_name = models.CharField(max_length=80, default="Aria")
    welcome_message = models.TextField(
        default="Hi, I'm Aria. Ask me anything and I'll answer right here in the chat."
    )
    system_prompt = models.TextField(
        default=(
            "You are a friendly, knowledgeable assistant. Answer clearly and accurately. "
            "Keep answers concise unless the user asks for detail. If you are unsure, say so "
            "instead of guessing."
        ),
        help_text="Core instructions. Add the client's business details, tone and rules here.",
    )
    brand_color = models.CharField(max_length=7, default="#0E7C66", help_text="Hex, e.g. #0E7C66")
    logo_url = models.URLField(blank=True)
    provider = models.CharField(max_length=20, choices=PROVIDERS, default="gemini")
    model_name = models.CharField(max_length=100, default="gemini-2.5-flash")
    temperature = models.FloatField(default=0.6)
    max_history = models.PositiveSmallIntegerField(
        default=20, help_text="How many recent messages the bot remembers in a chat."
    )
    max_output_tokens = models.PositiveIntegerField(default=2048)
    voice_enabled = models.BooleanField(default=True, help_text="Show the microphone button.")
    fallback_message = models.TextField(
        default="Sorry, I couldn't get an answer just now. Please try again in a moment."
    )

    default_model = models.ForeignKey(
        "ChatModel", null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
        help_text="Model used for users who have not picked one. Manage the list in the in-app Admin panel.",
    )
    allowed_models = models.TextField(
        default="gemini-flash-latest\ngemini-3.5-flash\ngemini-3.1-flash-lite",
        help_text="Models users may pick in their Bot settings, one per line. The default model is always included.",
    )

    class Meta:
        verbose_name = "Bot settings"
        verbose_name_plural = "Bot settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def allowed_model_list(self):
        names = [n.strip() for n in re.split(r"[\n,]+", self.allowed_models or "") if n.strip()]
        out = [self.model_name]
        for n in names:
            if n not in out:
                out.append(n)
        return out

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return f"Bot settings ({self.bot_name})"


class Conversation(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="conversations"
    )
    title = models.CharField(max_length=120, default="New chat")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.title} ({self.user})"


class Message(models.Model):
    ROLE_CHOICES = [("user", "User"), ("assistant", "Assistant")]
    SENTIMENTS = [("positive", "Positive"), ("neutral", "Neutral"), ("negative", "Negative")]

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    sentiment = models.CharField(max_length=10, choices=SENTIMENTS, blank=True)
    latency_ms = models.PositiveIntegerField(null=True, blank=True)
    is_fallback = models.BooleanField(default=False)
    feedback = models.SmallIntegerField(default=0)  # -1 down, 0 none, 1 up
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["created_at"])]

    def __str__(self):
        return f"{self.role}: {self.content[:40]}"


class UserPreferences(models.Model):
    """Per-user customisation. Empty values mean "use the default set by the admin"."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bot_preferences"
    )
    assistant_name = models.CharField(max_length=40, blank=True)
    tone = models.CharField(max_length=20, choices=TONES, blank=True, default="")
    reply_length = models.CharField(max_length=20, choices=LENGTHS, blank=True, default="")
    creativity = models.CharField(max_length=20, choices=CREATIVITY, blank=True, default="")
    custom_instructions = models.TextField(blank=True, max_length=1000)
    model_name = models.CharField(max_length=100, blank=True)
    accent_color = models.CharField(max_length=7, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "User preferences"

    def __str__(self):
        return f"Preferences of {self.user}"


class ChatModel(models.Model):
    """A model users can choose from in the chat box. Users see the friendly label, never the model id."""

    key = models.SlugField(max_length=60, unique=True)
    label = models.CharField(max_length=80)
    provider = models.CharField(max_length=20, choices=BotSettings.PROVIDERS)
    model_id = models.CharField(max_length=100, help_text="The provider's technical model name.")
    description = models.CharField(max_length=160, blank=True)
    tags = models.CharField(max_length=80, blank=True, help_text="Comma separated, e.g. Free, Fast")
    enabled = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=100)

    class Meta:
        ordering = ["sort_order", "label"]

    def tag_list(self):
        return [t.strip() for t in self.tags.split(",") if t.strip()]

    def __str__(self):
        return f"{self.label} ({self.get_provider_display()})"