import re
from email.utils import formataddr, parseaddr
from html import escape

from .models import OTP_TTL_SECONDS

DEFAULT_COLOR = "#6C5CE7"


def _branding():
    """Bot name and brand colour from the admin's Bot settings (safe fallbacks if unavailable)."""
    try:
        from chat.models import BotSettings

        cfg = BotSettings.load()
        color = cfg.brand_color if re.fullmatch(r"#[0-9a-fA-F]{6}", cfg.brand_color or "") else DEFAULT_COLOR
        return cfg.bot_name or "Your assistant", color
    except Exception:  # never block signup because of a branding lookup
        return "Your assistant", DEFAULT_COLOR


def build_text(brand: str, code: str, first_name: str = "") -> str:
    minutes = OTP_TTL_SECONDS // 60
    hello = f"Hi {first_name}," if first_name else "Hi,"
    return (
        f"{hello}\n\n"
        f"You're one step away from joining {brand}.\n"
        f"Your verification code is:\n\n    {code}\n\n"
        f"It expires in {minutes} minutes. Never share this code with anyone.\n\n"
        f"Didn't try to sign up? You can safely ignore this email. No account will be created.\n"
    )


def build_html(brand: str, color: str, code: str, first_name: str = "") -> str:
    minutes = OTP_TTL_SECONDS // 60
    b = escape(brand)
    hello = f"Hi {escape(first_name)} 👋" if first_name else "Welcome 👋"
    initial = escape(brand[:1].upper() or "A")
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f3fb;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your {b} code is {code}. It expires in {minutes} minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3fb;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr><td style="background-color:{color};background-image:linear-gradient(135deg,{color},#ff6fb5);padding:28px 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:42px;height:42px;background:rgba(255,255,255,0.25);border-radius:12px;text-align:center;color:#ffffff;font-size:21px;font-weight:800;line-height:42px;">{initial}</td>
      <td style="padding-left:12px;color:#ffffff;font-size:21px;font-weight:800;">{b}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:34px 32px 6px;color:#1b1840;">
    <h1 style="margin:0 0 10px;font-size:26px;line-height:1.25;">{hello}</h1>
    <p style="margin:0;font-size:16px;line-height:1.65;color:#4a4770;">You're one step away from joining {b}. Enter this code to verify your email and finish creating your account.</p>
  </td></tr>
  <tr><td align="center" style="padding:24px 32px;">
    <div style="display:inline-block;padding:16px 26px 16px 36px;border:2px dashed {color};border-radius:16px;background:#f7f6ff;font-family:Consolas,Menlo,'Courier New',monospace;font-size:40px;font-weight:800;letter-spacing:10px;color:#1b1840;">{code}</div>
  </td></tr>
  <tr><td style="padding:0 32px 30px;text-align:center;color:#6a6790;font-size:14px;line-height:1.7;">
    This code expires in <b style="color:#1b1840;">{minutes} minutes</b>.<br>For your security, never share it with anyone.
  </td></tr>
  <tr><td style="padding:20px 32px;background:#f7f6ff;color:#8a87ad;font-size:12px;line-height:1.7;text-align:center;">
    Didn't try to sign up? You can safely ignore this email. No account will be created.<br>Sent by {b}
  </td></tr>
</table>
</td></tr></table>
</body></html>"""


def send_otp_email(email: str, code: str, first_name: str = ""):
    from django.conf import settings
    from django.core.mail import EmailMultiAlternatives

    brand, color = _branding()
    # Show the bot's name as the sender while keeping the configured address.
    address = parseaddr(settings.DEFAULT_FROM_EMAIL)[1] or settings.DEFAULT_FROM_EMAIL
    sender = formataddr((brand, address))

    msg = EmailMultiAlternatives(
        subject=f"{code} is your {brand} verification code",
        body=build_text(brand, code, first_name),
        from_email=sender,
        to=[email],
    )
    msg.attach_alternative(build_html(brand, color, code, first_name), "text/html")
    msg.send(fail_silently=False)