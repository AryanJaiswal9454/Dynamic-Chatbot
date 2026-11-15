from django.contrib import admin

from .models import PendingSignup


@admin.register(PendingSignup)
class PendingSignupAdmin(admin.ModelAdmin):
    list_display = ("email", "username", "attempts", "expires_at", "created_at")
    readonly_fields = ("password_hash", "code_hash")