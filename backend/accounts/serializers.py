from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "is_staff", "is_superuser")
        read_only_fields = fields


class RegisterSerializer(serializers.ModelSerializer):
    """Validates the signup form. The account itself is created only after email verification."""

    password = serializers.CharField(write_only=True, min_length=8)
    email = serializers.EmailField(required=True)

    class Meta:
        model = User
        fields = ("username", "email", "first_name", "password")

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value.lower()

    def validate(self, attrs):
        candidate = User(username=attrs.get("username"), email=attrs.get("email"))
        validate_password(attrs["password"], candidate)
        return attrs