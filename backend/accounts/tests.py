import re
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.mail import send_mail
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import PendingSignup

User = get_user_model()

FORM = {"username": "newbie", "email": "newbie@example.com", "first_name": "Neo", "password": "Str0ng-Pass-77"}


class SignupOtpTests(APITestCase):
    def _register(self):
        res = self.client.post("/api/auth/register/", FORM, format="json")
        self.assertEqual(res.status_code, 202)
        return re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)

    def test_full_flow(self):
        code = self._register()
        self.assertFalse(User.objects.filter(username="newbie").exists())  # not created yet

        wrong = "000000" if code != "000000" else "111111"
        bad = self.client.post("/api/auth/verify-otp/", {"email": FORM["email"], "code": wrong}, format="json")
        self.assertEqual(bad.status_code, 400)

        ok = self.client.post("/api/auth/verify-otp/", {"email": FORM["email"], "code": code}, format="json")
        self.assertEqual(ok.status_code, 200)
        self.assertIn("access", ok.data)
        user = User.objects.get(username="newbie")
        self.assertTrue(user.check_password(FORM["password"]))
        self.assertFalse(PendingSignup.objects.exists())

    def test_resend_cooldown(self):
        self._register()
        res = self.client.post("/api/auth/resend-otp/", {"email": FORM["email"]}, format="json")
        self.assertEqual(res.status_code, 429)


class AdminUserTests(APITestCase):
    def setUp(self):
        self.root = User.objects.create_superuser("root", "r@x.com", "S3cure-pass-99")
        self.admin = User.objects.create_user("boss", "b@x.com", "S3cure-pass-99", is_staff=True)
        self.user = User.objects.create_user("eve", "e@x.com", "S3cure-pass-99")

    def test_requires_staff(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get("/api/admin/users/").status_code, 403)

    def test_list_and_search(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/admin/users/?search=eve")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 1)

    def test_disable_user_and_guards(self):
        self.client.force_authenticate(self.admin)
        res = self.client.patch(f"/api/admin/users/{self.user.id}/", {"is_active": False}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["is_active"])
        self.assertEqual(self.client.patch(f"/api/admin/users/{self.admin.id}/", {"is_active": False}, format="json").status_code, 403)
        self.assertEqual(self.client.delete(f"/api/admin/users/{self.root.id}/").status_code, 403)
        # a normal admin cannot hand out admin rights
        self.assertEqual(self.client.patch(f"/api/admin/users/{self.user.id}/", {"is_staff": True}, format="json").status_code, 403)

    def test_superuser_can_promote_reset_password_and_delete(self):
        self.client.force_authenticate(self.root)
        self.assertEqual(self.client.patch(f"/api/admin/users/{self.user.id}/", {"is_staff": True}, format="json").status_code, 200)
        res = self.client.post(f"/api/admin/users/{self.user.id}/password/", {"password": "An0ther-Pass-55"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("An0ther-Pass-55"))
        self.assertEqual(self.client.delete(f"/api/admin/users/{self.user.id}/").status_code, 204)

    def test_bot_settings_api(self):
        self.client.force_authenticate(self.admin)
        res = self.client.patch("/api/admin/bot-settings/", {"bot_name": "Mitra", "brand_color": "#112233"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["settings"]["bot_name"], "Mitra")
        bad = self.client.patch("/api/admin/bot-settings/", {"brand_color": "blue"}, format="json")
        self.assertEqual(bad.status_code, 400)


@override_settings(EMAIL_BACKEND="accounts.email_backends.BrevoEmailBackend", DEFAULT_FROM_EMAIL="me@example.com")
class BrevoBackendTests(APITestCase):
    @patch("accounts.email_backends.requests.post")
    def test_posts_to_brevo(self, post):
        with patch.dict("os.environ", {"BREVO_API_KEY": "secret-key"}):
            sent = send_mail("Hello", "Body text", "Aria <me@example.com>", ["user@example.com"])
        self.assertEqual(sent, 1)
        self.assertEqual(post.call_args.kwargs["headers"]["api-key"], "secret-key")
        payload = post.call_args.kwargs["json"]
        self.assertEqual(payload["to"][0]["email"], "user@example.com")
        self.assertEqual(payload["sender"]["name"], "Aria")