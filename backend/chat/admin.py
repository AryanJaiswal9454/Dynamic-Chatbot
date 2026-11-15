from django.contrib import admin

from .models import BotSettings, ChatModel, Conversation, Message, UserPreferences


@admin.register(BotSettings)
class BotSettingsAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return not BotSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    readonly_fields = ("role", "content", "sentiment", "latency_ms", "is_fallback", "feedback", "created_at")
    can_delete = False


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "created_at", "updated_at")
    search_fields = ("title", "user__username")
    inlines = [MessageInline]


@admin.register(UserPreferences)
class UserPreferencesAdmin(admin.ModelAdmin):
    list_display = ("user", "assistant_name", "tone", "reply_length", "model_name", "updated_at")
    search_fields = ("user__username",)


@admin.register(ChatModel)
class ChatModelAdmin(admin.ModelAdmin):
    list_display = ("label", "provider", "model_id", "tags", "enabled", "sort_order")
    list_editable = ("enabled", "sort_order")