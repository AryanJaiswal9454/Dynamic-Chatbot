import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework import generics
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .models import MAX_ATTEMPTS, OTP_TTL_SECONDS, RESEND_COOLDOWN, PendingSignup, generate_code
from .otp import send_otp_email
from .serializers import RegisterSerializer, UserSerializer

User = get_user_model()
log = logging.getLogger(__name__)


class AuthThrottledView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


def _deliver(pending, code):
    """Send the code. Returns an error Response, or None when it was sent."""
    try:
        send_otp_email(pending.email, code, pending.first_name)
        return None
    except Exception:
        log.exception("Could not send OTP email")
        return Response(
            {"detail": "We could not send the verification email. Please try again in a moment."},
            status=503,
        )


class RegisterView(AuthThrottledView):
    """Step 1: validate the form, store a pending signup and email a 6-digit code."""

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        PendingSignup.objects.filter(expires_at__lt=timezone.now()).delete()
        pending, _ = PendingSignup.objects.get_or_create(
            email=data["email"],
            defaults={
                "username": data["username"],
                "password_hash": "",
                "code_hash": "",
                "expires_at": timezone.now(),
                "last_sent_at": timezone.now(),
            },
        )
        pending.username = data["username"]
        pending.first_name = data.get("first_name", "")
        pending.password_hash = make_password(data["password"])
        code = generate_code()
        pending.set_code(code)
        pending.save()

        failure = _deliver(pending, code)
        if failure:
            return failure
        return Response(
            {"email": pending.email, "expires_in": OTP_TTL_SECONDS, "resend_in": RESEND_COOLDOWN},
            status=202,
        )


class VerifyOtpView(AuthThrottledView):
    """Step 2: check the code, create the real account and sign the user in."""

    def post(self, request):
        email = str(request.data.get("email", "")).strip().lower()
        code = str(request.data.get("code", "")).strip()
        pending = PendingSignup.objects.filter(email=email).first()

        if not pending:
            return Response({"detail": "No signup is in progress for this email. Please start again."}, status=400)
        if pending.expired:
            return Response({"detail": "That code has expired. Request a new one."}, status=400)

        if not pending.check_code(code):
            pending.attempts += 1
            if pending.attempts >= MAX_ATTEMPTS:
                pending.delete()
                return Response({"detail": "Too many wrong attempts. Please sign up again."}, status=400)
            pending.save(update_fields=["attempts"])
            left = MAX_ATTEMPTS - pending.attempts
            return Response({"detail": f"Incorrect code. {left} attempt{'s' if left != 1 else ''} left."}, status=400)

        with transaction.atomic():
            if User.objects.filter(username__iexact=pending.username).exists() or \
               User.objects.filter(email__iexact=pending.email).exists():
                pending.delete()
                return Response({"detail": "That username or email was just taken. Please sign up again."}, status=400)
            user = User(username=pending.username, email=pending.email, first_name=pending.first_name)
            user.password = pending.password_hash  # already hashed
            user.save()
            pending.delete()

        refresh = RefreshToken.for_user(user)
        return Response(
            {"user": UserSerializer(user).data, "access": str(refresh.access_token), "refresh": str(refresh)},
            status=200,
        )


class ResendOtpView(AuthThrottledView):
    def post(self, request):
        email = str(request.data.get("email", "")).strip().lower()
        pending = PendingSignup.objects.filter(email=email).first()
        if not pending:
            return Response({"detail": "No signup is in progress for this email. Please start again."}, status=400)

        wait = pending.seconds_until_resend
        if wait > 0:
            return Response({"detail": f"Please wait {wait} seconds before requesting another code.", "retry_in": wait}, status=429)

        code = generate_code()
        pending.set_code(code)
        pending.save()
        failure = _deliver(pending, code)
        if failure:
            return failure
        return Response({"email": pending.email, "expires_in": OTP_TTL_SECONDS, "resend_in": RESEND_COOLDOWN})


class LoginView(TokenObtainPairView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class RefreshView(TokenRefreshView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user