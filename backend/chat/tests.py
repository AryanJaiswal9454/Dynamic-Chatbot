from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import Conversation
from .services import sentiment
from .services.llm import LLMError

User = get_user_model()


class SentimentTests(APITestCase):
    def test_labels(self):
        self.assertEqual(sentiment.analyze("this is great, thanks"), "positive")
        self.assertEqual(sentiment.analyze("this is terrible and useless"), "negative")
        self.assertEqual(sentiment.analyze("not good"), "negative")
        self.assertEqual(sentiment.analyze("what time is it"), "neutral")


class ChatApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("alice", "a@x.com", "S3cure-pass-99")
        self.other = User.objects.create_user("bob", "b@x.com", "S3cure-pass-99")
        self.client.force_authenticate(self.user)

    def test_requires_auth(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/conversations/").status_code, 401)

    @patch("chat.views.generate_reply", return_value="Hello there")
    def test_send_message(self, _mock):
        conv = self.client.post("/api/conversations/", {}).data
        res = self.client.post(f"/api/conversations/{conv['id']}/send/", {"content": "Hi"})
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["assistant_message"]["content"], "Hello there")
        self.assertEqual(res.data["conversation"]["title"], "Hi")

    @patch("chat.views.generate_reply", side_effect=LLMError("boom"))
    def test_fallback_on_provider_failure(self, _mock):
        conv = Conversation.objects.create(user=self.user)
        res = self.client.post(f"/api/conversations/{conv.id}/send/", {"content": "Hi"})
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data["assistant_message"]["is_fallback"])

    def test_cannot_access_other_users_chat(self):
        conv = Conversation.objects.create(user=self.other)
        self.assertEqual(self.client.get(f"/api/conversations/{conv.id}/").status_code, 404)

    def test_analytics_staff_only(self):
        self.assertEqual(self.client.get("/api/analytics/").status_code, 403)
        self.user.is_staff = True
        self.user.save()
        self.assertEqual(self.client.get("/api/analytics/").status_code, 200)


class PreferencesTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("carol", "c@x.com", "S3cure-pass-99")
        self.other = User.objects.create_user("dave", "d@x.com", "S3cure-pass-99")
        self.client.force_authenticate(self.user)
        patcher = patch.dict("os.environ", {"GEMINI_API_KEY": "test-key", "OPENAI_API_KEY": ""})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_get_returns_friendly_models(self):
        res = self.client.get("/api/preferences/")
        self.assertEqual(res.status_code, 200)
        keys = [m["key"] for m in res.data["options"]["models"]]
        self.assertIn("gemini-flash", keys)
        self.assertNotIn("gpt-5-mini", keys)  # no OpenAI key configured, so it is hidden
        self.assertIn(res.data["current_model"]["key"], keys)
        self.assertNotIn("model_id", res.data["options"]["models"][0])  # technical name never exposed

    def test_update_and_isolation(self):
        res = self.client.patch(
            "/api/preferences/", {"tone": "playful", "assistant_name": " Mitra "}, format="json"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["preferences"]["assistant_name"], "Mitra")
        self.client.force_authenticate(self.other)
        other = self.client.get("/api/preferences/")
        self.assertEqual(other.data["preferences"]["tone"], "")

    def test_rejects_unavailable_model_and_bad_colour(self):
        self.assertEqual(
            self.client.patch("/api/preferences/", {"model_name": "gpt-5-mini"}, format="json").status_code, 400
        )
        self.assertEqual(
            self.client.patch("/api/preferences/", {"accent_color": "red"}, format="json").status_code, 400
        )

    def test_reset(self):
        self.client.patch("/api/preferences/", {"tone": "casual"}, format="json")
        res = self.client.delete("/api/preferences/")
        self.assertEqual(res.data["preferences"]["tone"], "")

    @patch("chat.views.generate_reply", return_value="ok")
    def test_chosen_model_is_used(self, mock):
        res = self.client.patch(
            "/api/preferences/", {"model_name": "gemini-flash-lite", "creativity": "precise"}, format="json"
        )
        self.assertEqual(res.status_code, 200)
        conv = Conversation.objects.create(user=self.user)
        self.client.post(f"/api/conversations/{conv.id}/send/", {"content": "hi"})
        self.assertEqual(mock.call_args.kwargs["model"], "gemini-flash-lite-latest")
        self.assertEqual(mock.call_args.kwargs["provider"], "gemini")
        self.assertEqual(mock.call_args.kwargs["temperature"], 0.2)


class AdminModelTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user("boss", "b@x.com", "S3cure-pass-99", is_staff=True)
        self.user = User.objects.create_user("eve", "e@x.com", "S3cure-pass-99")
        patcher = patch.dict("os.environ", {"GEMINI_API_KEY": "test-key", "OPENAI_API_KEY": ""})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_staff_only(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get("/api/admin/models/").status_code, 403)

    def test_manage_models(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get("/api/admin/models/")
        self.assertEqual(res.status_code, 200)
        first = res.data["models"][0]
        off = self.client.patch(f"/api/admin/models/{first['id']}/", {"enabled": False}, format="json")
        self.assertFalse(next(m for m in off.data["models"] if m["id"] == first["id"])["enabled"])
        add = self.client.post(
            "/api/admin/models/",
            {"label": "My Model", "provider": "gemini", "model_id": "gemini-3.5-flash", "tags": "Free"},
            format="json",
        )
        self.assertEqual(add.status_code, 201)
        self.assertTrue(any(m["key"] == "my-model" for m in add.data["models"]))