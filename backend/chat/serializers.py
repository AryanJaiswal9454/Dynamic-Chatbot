import re

from rest_framework import serializers

from .models import BotSettings, ChatModel, Conversation, Message, UserPreferences


class PublicConfigSerializer(serializers.ModelSerializer):
    """Only what the browser needs. Never expose prompts, keys or model names."""

    class Meta:
        model = BotSettings
        fields = ("bot_name", "welcome_message", "brand_color", "logo_url", "voice_enabled")


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ("id", "role", "content", "sentiment", "is_fallback", "feedback", "created_at")
        read_only_fields = fields


class ConversationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Conversation
        fields = ("id", "title", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class ConversationDetailSerializer(ConversationSerializer):
    messages = MessageSerializer(many=True, read_only=True)

    class Meta(ConversationSerializer.Meta):
        fields = ConversationSerializer.Meta.fields + ("messages",)


class SendMessageSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=4000, trim_whitespace=True)


class FeedbackSerializer(serializers.Serializer):
    value = serializers.ChoiceField(choices=[-1, 0, 1])


class UserPreferencesSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserPreferences
        fields = (
            "assistant_name",
            "tone",
            "reply_length",
            "creativity",
            "custom_instructions",
            "model_name",
            "accent_color",
        )
        extra_kwargs = {
            "assistant_name": {"required": False, "allow_blank": True},
            "custom_instructions": {"required": False, "allow_blank": True},
            "model_name": {"required": False, "allow_blank": True},
            "accent_color": {"required": False, "allow_blank": True},
        }

    def validate_assistant_name(self, value):
        return value.strip()

    def validate_custom_instructions(self, value):
        if len(value) > 1000:
            raise serializers.ValidationError("Keep your instructions under 1000 characters.")
        return value

    def validate_model_name(self, value):
        from .catalog import usable_models

        if value and value not in {m.key for m in usable_models()}:
            raise serializers.ValidationError("That model is not available.")
        return value

    def validate_accent_color(self, value):
        if value and not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise serializers.ValidationError("Use a colour like #6C5CE7.")
        return value


class AdminBotSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = BotSettings
        fields = (
            "bot_name", "welcome_message", "system_prompt", "brand_color", "logo_url",
            "temperature", "max_history", "max_output_tokens", "voice_enabled", "fallback_message",
        )
        extra_kwargs = {"logo_url": {"required": False, "allow_blank": True}}

    def validate_bot_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Give the bot a name.")
        return value

    def validate_brand_color(self, value):
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise serializers.ValidationError("Use a colour like #6C5CE7.")
        return value

    def validate_temperature(self, value):
        if not 0 <= value <= 2:
            raise serializers.ValidationError("Choose a value between 0 and 2.")
        return value

    def validate_max_history(self, value):
        if not 1 <= value <= 100:
            raise serializers.ValidationError("Choose a value between 1 and 100.")
        return value

    def validate_max_output_tokens(self, value):
        if not 64 <= value <= 8192:
            raise serializers.ValidationError("Choose a value between 64 and 8192.")
        return value


class AdminChatModelSerializer(serializers.ModelSerializer):
    is_default = serializers.SerializerMethodField()
    available = serializers.SerializerMethodField()

    class Meta:
        model = ChatModel
        fields = (
            "id", "key", "label", "provider", "model_id", "description", "tags",
            "enabled", "sort_order", "is_default", "available",
        )
        read_only_fields = ("id", "key", "is_default", "available")

    def get_is_default(self, obj):
        return self.context.get("default_pk") == obj.pk

    def get_available(self, obj):
        from .catalog import provider_available

        return provider_available(obj.provider)

    def validate_label(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Give the model a friendly name.")
        return value

    def validate_model_id(self, value):
        value = value.strip()
        if not value or " " in value:
            raise serializers.ValidationError("Enter the technical model name without spaces.")
        return value