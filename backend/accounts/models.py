import hashlib
import hmac
import math
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

OTP_TTL_SECONDS = 600       # a code is valid for 10 minutes
RESEND_COOLDOWN = 60        # seconds before a new code may be requested
MAX_ATTEMPTS = 5            # wrong guesses before the signup must be restarted


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


class PendingSignup(models.Model):
    """A signup that is waiting for the emailed code. The real user is only created after it is verified."""

    email = models.EmailField(unique=True)
    username = models.CharField(max_length=150)
    first_name = models.CharField(max_length=150, blank=True)
    password_hash = models.CharField(max_length=255)
    code_hash = models.CharField(max_length=64)
    attempts = models.PositiveSmallIntegerField(default=0)
    expires_at = models.DateTimeField()
    last_sent_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Pending signup for {self.email}"

    @staticmethod
    def hash_code(email: str, code: str) -> str:
        msg = f"{email.lower()}:{code}".encode()
        return hmac.new(settings.SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()

    def set_code(self, code: str):
        now = timezone.now()
        self.code_hash = self.hash_code(self.email, code)
        self.attempts = 0
        self.last_sent_at = now
        self.expires_at = now + timedelta(seconds=OTP_TTL_SECONDS)

    def check_code(self, code: str) -> bool:
        return hmac.compare_digest(self.code_hash, self.hash_code(self.email, code))

    @property
    def expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def seconds_until_resend(self) -> int:
        wait = RESEND_COOLDOWN - (timezone.now() - self.last_sent_at).total_seconds()
        return max(0, math.ceil(wait))