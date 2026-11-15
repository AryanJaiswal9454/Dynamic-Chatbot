from django.urls import path

from .admin_views import AdminUserDetailView, AdminUserListView, AdminUserPasswordView

urlpatterns = [
    path("users/", AdminUserListView.as_view()),
    path("users/<int:pk>/", AdminUserDetailView.as_view()),
    path("users/<int:pk>/password/", AdminUserPasswordView.as_view()),
]