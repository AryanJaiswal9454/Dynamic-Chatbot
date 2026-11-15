from django.urls import path

from .views import LoginView, MeView, RefreshView, RegisterView, ResendOtpView, VerifyOtpView

urlpatterns = [
    path("register/", RegisterView.as_view()),
    path("verify-otp/", VerifyOtpView.as_view()),
    path("resend-otp/", ResendOtpView.as_view()),
    path("login/", LoginView.as_view()),
    path("refresh/", RefreshView.as_view()),
    path("me/", MeView.as_view()),
]