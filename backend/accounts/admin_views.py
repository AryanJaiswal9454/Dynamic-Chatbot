from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

User = get_user_model()
PAGE_SIZE = 15


def annotated():
    return User.objects.annotate(
        chat_count=Count("conversations", distinct=True),
        message_count=Count("conversations__messages", distinct=True),
    )


class AdminUserSerializer(serializers.ModelSerializer):
    chat_count = serializers.IntegerField(read_only=True)
    message_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id", "username", "email", "first_name", "is_active", "is_staff", "is_superuser",
            "date_joined", "last_login", "chat_count", "message_count",
        )
        read_only_fields = ("id", "username", "email", "is_superuser", "date_joined", "last_login")


def blocked(request, target):
    """Return an error message if this admin may not change the target account."""
    if target.pk == request.user.pk:
        return "You can't change your own account here."
    if target.is_superuser:
        return "Superuser accounts can only be changed from the Django admin."
    if target.is_staff and not request.user.is_superuser:
        return "Only a superuser can change another admin."
    return None


class AdminUserListView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        qs = annotated().order_by("-date_joined")
        q = request.query_params.get("search", "").strip()
        if q:
            qs = qs.filter(Q(username__icontains=q) | Q(email__icontains=q) | Q(first_name__icontains=q))
        role = request.query_params.get("role", "")
        if role == "admin":
            qs = qs.filter(Q(is_staff=True) | Q(is_superuser=True))
        elif role == "inactive":
            qs = qs.filter(is_active=False)

        try:
            page = max(int(request.query_params.get("page", 1)), 1)
        except ValueError:
            page = 1
        total = qs.count()
        rows = qs[(page - 1) * PAGE_SIZE : page * PAGE_SIZE]
        return Response(
            {
                "count": total,
                "page": page,
                "pages": max(1, -(-total // PAGE_SIZE)),
                "results": AdminUserSerializer(rows, many=True).data,
            }
        )


class AdminUserDetailView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def patch(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        problem = blocked(request, target)
        if problem:
            return Response({"detail": problem}, status=403)
        if "is_staff" in request.data and not request.user.is_superuser:
            return Response({"detail": "Only a superuser can grant or remove admin access."}, status=403)

        serializer = AdminUserSerializer(target, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(AdminUserSerializer(get_object_or_404(annotated(), pk=pk)).data)

    def delete(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        problem = blocked(request, target)
        if problem:
            return Response({"detail": problem}, status=403)
        target.delete()
        return Response(status=204)


class AdminUserPasswordView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        target = get_object_or_404(User, pk=pk)
        problem = blocked(request, target)
        if problem:
            return Response({"detail": problem}, status=403)
        password = str(request.data.get("password", ""))
        try:
            validate_password(password, target)
        except DjangoValidationError as exc:
            return Response({"detail": " ".join(exc.messages)}, status=400)
        target.set_password(password)
        target.save(update_fields=["password"])
        return Response({"detail": "Password updated."})