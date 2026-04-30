"""Token-based password reset using Django's built-in token generator."""
import logging
from django.contrib.auth.models import User
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.conf import settings
from django.core.mail import send_mail
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status

logger = logging.getLogger(__name__)
_token_generator = PasswordResetTokenGenerator()


class PasswordResetRequestView(APIView):
    """POST /api/auth/password-reset/ — send reset link to email."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        if not email:
            return Response({'error': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # Don't reveal whether the email exists
            return Response({'message': 'If an account exists, a reset link has been sent.'})

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = _token_generator.make_token(user)
        reset_url = f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}"

        try:
            send_mail(
                subject='Reset your Pavilion password',
                message=(
                    f"Hi {user.first_name or user.email},\n\n"
                    f"Click the link below to reset your password (expires in 1 hour):\n"
                    f"{reset_url}\n\n"
                    f"If you didn't request this, please ignore this email.\n\nPavilion Team"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=False,
            )
        except Exception as e:
            logger.error(f"Password reset email failed for {email}: {e}")
            return Response({'error': 'Failed to send reset email. Please try again.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({'message': 'If an account exists, a reset link has been sent.'})


class PasswordResetConfirmView(APIView):
    """POST /api/auth/password-reset/confirm/ — set new password using uid + token."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        uid = request.data.get('uid', '')
        token = request.data.get('token', '')
        new_password = request.data.get('new_password', '')

        if not uid or not token or not new_password:
            return Response({'error': 'uid, token, and new_password are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user_pk = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_pk)
        except (User.DoesNotExist, ValueError, TypeError):
            return Response({'error': 'Invalid reset link'}, status=status.HTTP_400_BAD_REQUEST)

        if not _token_generator.check_token(user, token):
            return Response({'error': 'Reset link is invalid or has expired'}, status=status.HTTP_400_BAD_REQUEST)

        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            validate_password(new_password, user)
        except DjangoValidationError as e:
            return Response({'error': list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()
        logger.info(f"Password reset successful for {user.email}")
        return Response({'message': 'Password reset successfully. You can now log in.'})
