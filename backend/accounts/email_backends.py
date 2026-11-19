import os
from email.utils import parseaddr

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail.backends.base import BaseEmailBackend

BREVO_URL = "https://api.brevo.com/v3/smtp/email"


class BrevoEmailBackend(BaseEmailBackend):
    """Send mail through Brevo's HTTP API (works where SMTP ports are blocked).

    The sender address must be verified in your Brevo account. Set BREVO_SENDER_EMAIL if it
    differs from DEFAULT_FROM_EMAIL.
    """

    def send_messages(self, email_messages):
        key = os.environ.get("BREVO_API_KEY")
        if not key:
            if self.fail_silently:
                return 0
            raise ImproperlyConfigured("BREVO_API_KEY is not set")

        sent = 0
        for message in email_messages:
            name, address = parseaddr(message.from_email or settings.DEFAULT_FROM_EMAIL)
            payload = {
                "sender": {"name": name or "Assistant", "email": os.environ.get("BREVO_SENDER_EMAIL") or address},
                "to": [{"email": recipient} for recipient in message.to],
                "subject": message.subject,
                "textContent": message.body,
            }
            for content, mimetype in getattr(message, "alternatives", []):
                if mimetype == "text/html":
                    payload["htmlContent"] = content
            try:
                resp = requests.post(
                    BREVO_URL,
                    headers={"api-key": key, "accept": "application/json", "content-type": "application/json"},
                    json=payload,
                    timeout=20,
                )
                try:
                    resp.raise_for_status()
                except requests.HTTPError as exc:
                    raise RuntimeError(f"Brevo error {resp.status_code}: {resp.text[:200]}") from exc
                sent += 1
            except Exception:
                if not self.fail_silently:
                    raise
        return sent