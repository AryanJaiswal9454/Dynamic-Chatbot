from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AdminBotSettingsView, AdminModelDetailView, AdminModelListView, AnalyticsView, ConversationViewSet, FeedbackView, PreferencesView, public_config

router = DefaultRouter()
router.register("conversations", ConversationViewSet, basename="conversation")

urlpatterns = [
    path("config/", public_config),
    path("analytics/", AnalyticsView.as_view()),
    path("preferences/", PreferencesView.as_view()),
    path("admin/bot-settings/", AdminBotSettingsView.as_view()),
    path("admin/models/", AdminModelListView.as_view()),
    path("admin/models/<int:pk>/", AdminModelDetailView.as_view()),
    path("messages/<int:pk>/feedback/", FeedbackView.as_view()),
    path("", include(router.urls)),
]