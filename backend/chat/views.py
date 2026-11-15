import logging
import os
import time
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from django.utils.text import slugify

from .catalog import (
    default_model, describe, ensure_seeded, provider_available, resolve_settings, usable_models,
)
from .models import (
    CREATIVITY, LENGTHS, TONES, BotSettings, ChatModel, Conversation, Message, UserPreferences,
)
from .serializers import (
    AdminBotSettingsSerializer,
    AdminChatModelSerializer,
    ConversationDetailSerializer,
    ConversationSerializer,
    FeedbackSerializer,
    MessageSerializer,
    PublicConfigSerializer,
    SendMessageSerializer,
    UserPreferencesSerializer,
)
from .services import sentiment as sentiment_service
from .services.llm import LLMError, build_system_prompt, generate_reply

log = logging.getLogger(__name__)


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def public_config(request):
    return Response(PublicConfigSerializer(BotSettings.load()).data)


class ChatRateThrottle(UserRateThrottle):
    scope = "chat"  # rate comes from settings (30/min)


class ConversationViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        # Users can only ever see their own conversations.
        return Conversation.objects.filter(user=self.request.user)

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ConversationDetailSerializer
        return ConversationSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"], throttle_classes=[ChatRateThrottle])
    def send(self, request, pk=None):
        conversation = self.get_object()
        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        content = serializer.validated_data["content"]
        cfg = BotSettings.load()

        sentiment = sentiment_service.analyze(content)
        user_msg = Message.objects.create(
            conversation=conversation, role="user", content=content, sentiment=sentiment
        )

        recent = (
            conversation.messages.filter(is_fallback=False)
            .order_by("-id")[: cfg.max_history]
        )
        history = list(reversed(list(recent)))

        prefs = UserPreferences.objects.filter(user=request.user).first()
        resolved = resolve_settings(cfg, prefs)
        system = build_system_prompt(cfg, sentiment, request.user, prefs)

        started = time.monotonic()
        try:
            reply = generate_reply(
                cfg, system, history,
                model=resolved.model_id, temperature=resolved.temperature, provider=resolved.provider,
            )
            fallback = False
        except LLMError:
            log.exception("AI provider failed")
            reply, fallback = cfg.fallback_message, True
        latency = int((time.monotonic() - started) * 1000)

        bot_msg = Message.objects.create(
            conversation=conversation,
            role="assistant",
            content=reply,
            latency_ms=latency,
            is_fallback=fallback,
        )

        if conversation.title == "New chat":
            conversation.title = content[:60]
        conversation.save()  # bumps updated_at so the chat rises to the top

        return Response(
            {
                "conversation": ConversationSerializer(conversation).data,
                "user_message": MessageSerializer(user_msg).data,
                "assistant_message": MessageSerializer(bot_msg).data,
            },
            status=status.HTTP_201_CREATED,
        )


def _choices(pairs):
    return [{"value": v, "label": l} for v, l in pairs]


class PreferencesView(APIView):
    """Every signed-in user can personalise their own chatbot (never anyone else's)."""

    def _payload(self, user):
        cfg = BotSettings.load()
        prefs, _ = UserPreferences.objects.get_or_create(user=user)
        resolved = resolve_settings(cfg, prefs)
        return {
            "preferences": UserPreferencesSerializer(prefs).data,
            "current_model": describe(resolved.model),
            "options": {
                "tones": _choices(TONES),
                "lengths": _choices(LENGTHS),
                "creativity": _choices(CREATIVITY),
                "models": [describe(m) for m in usable_models()],
                "default_model": describe(default_model(cfg)),
                "default_bot_name": cfg.bot_name,
                "default_color": cfg.brand_color,
            },
        }

    def get(self, request):
        return Response(self._payload(request.user))

    def patch(self, request):
        prefs, _ = UserPreferences.objects.get_or_create(user=request.user)
        serializer = UserPreferencesSerializer(prefs, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(self._payload(request.user))

    def delete(self, request):
        """Reset everything back to the defaults."""
        UserPreferences.objects.filter(user=request.user).delete()
        return Response(self._payload(request.user))


class AdminBotSettingsView(APIView):
    """Global bot configuration, editable by admins from the in-app Admin panel."""

    permission_classes = [permissions.IsAdminUser]

    def _payload(self):
        cfg = BotSettings.load()
        return {
            "settings": AdminBotSettingsSerializer(cfg).data,
            "keys": {
                "gemini": bool(os.environ.get("GEMINI_API_KEY")),
                "openai": bool(os.environ.get("OPENAI_API_KEY")),
            },
        }

    def get(self, request):
        return Response(self._payload())

    def patch(self, request):
        serializer = AdminBotSettingsSerializer(BotSettings.load(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(self._payload())


class AdminModelListView(APIView):
    """Admins decide which models appear in everyone's model picker."""

    permission_classes = [permissions.IsAdminUser]

    def _payload(self):
        ensure_seeded()
        cfg = BotSettings.load()
        effective = default_model(cfg)
        ctx = {"default_pk": effective.pk if effective else None}
        return {
            "models": AdminChatModelSerializer(ChatModel.objects.all(), many=True, context=ctx).data,
            "providers": _choices(BotSettings.PROVIDERS),
            "keys": {"gemini": provider_available("gemini"), "openai": provider_available("openai")},
        }

    def get(self, request):
        return Response(self._payload())

    def post(self, request):
        serializer = AdminChatModelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        base = slugify(serializer.validated_data["label"]) or "model"
        key, n = base, 2
        while ChatModel.objects.filter(key=key).exists():
            key, n = f"{base}-{n}", n + 1
        serializer.save(key=key, sort_order=request.data.get("sort_order", 200))
        return Response(self._payload(), status=201)


class AdminModelDetailView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def patch(self, request, pk):
        obj = get_object_or_404(ChatModel, pk=pk)
        serializer = AdminChatModelSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        obj = serializer.save()
        if request.data.get("is_default") is True:
            if not obj.enabled:
                return Response({"detail": "Enable the model before making it the default."}, status=400)
            cfg = BotSettings.load()
            cfg.default_model = obj
            cfg.save()
        return Response(AdminModelListView()._payload())

    def delete(self, request, pk):
        get_object_or_404(ChatModel, pk=pk).delete()
        return Response(AdminModelListView()._payload())


class FeedbackView(APIView):
    def post(self, request, pk):
        msg = get_object_or_404(
            Message, pk=pk, role="assistant", conversation__user=request.user
        )
        serializer = FeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        msg.feedback = serializer.validated_data["value"]
        msg.save(update_fields=["feedback"])
        return Response({"id": msg.id, "feedback": msg.feedback})


class AnalyticsView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        since = today_start - timedelta(days=13)

        msgs = Message.objects.all()
        bot_msgs = msgs.filter(role="assistant")
        user_msgs = msgs.filter(role="user")
        total_bot = bot_msgs.count()

        sentiment_rows = user_msgs.exclude(sentiment="").values("sentiment").annotate(n=Count("id"))
        sentiment = {"positive": 0, "neutral": 0, "negative": 0}
        for row in sentiment_rows:
            sentiment[row["sentiment"]] = row["n"]

        daily_rows = (
            user_msgs.filter(created_at__gte=since)
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(n=Count("id"))
        )
        by_day = {r["day"]: r["n"] for r in daily_rows}
        daily = []
        for i in range(14):
            d = (since + timedelta(days=i)).date()
            daily.append({"date": d.isoformat(), "messages": by_day.get(d, 0)})

        fb = bot_msgs.aggregate(
            up=Count("id", filter=Q(feedback=1)), down=Count("id", filter=Q(feedback=-1))
        )
        avg_latency = bot_msgs.filter(is_fallback=False).aggregate(a=Avg("latency_ms"))["a"]

        return Response(
            {
                "users": get_user_model().objects.count(),
                "conversations": Conversation.objects.count(),
                "messages": msgs.count(),
                "messages_today": user_msgs.filter(created_at__gte=today_start).count(),
                "avg_response_ms": int(avg_latency) if avg_latency else 0,
                "fallback_rate": round(bot_msgs.filter(is_fallback=True).count() / total_bot * 100, 1)
                if total_bot
                else 0,
                "helpful": fb["up"],
                "not_helpful": fb["down"],
                "sentiment": sentiment,
                "daily": daily,
            }
        )