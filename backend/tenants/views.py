import uuid
import secrets
import logging
from django.contrib.auth.models import User
from django.utils import timezone
from django.conf import settings
from django.core.mail import send_mail
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Tenant, TenantUser, TenantInvitation, UserProfile, UsageRecord
from .serializers import (
    TenantSerializer, TenantCreateSerializer, TenantUpdateSerializer,
    TenantUserSerializer, RegisterSerializer, UserProfileSerializer,
)
from .permissions import IsAdminOfTenant, IsEditorOrAdminOfTenant, HasReadAccessToTenant

logger = logging.getLogger(__name__)

try:
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token
    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False


def _jwt_response(user):
    """Return a standard JWT response dict for a user."""
    refresh = RefreshToken.for_user(user)
    memberships = TenantUser.objects.filter(user=user).select_related('tenant')
    tenants = [
        {
            'tenant': {'id': str(m.tenant.id), 'name': m.tenant.name, 'slug': m.tenant.slug},
            'role': m.role,
        }
        for m in memberships
    ]
    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
        },
        'tenants': tenants,
    }


class RegisterView(APIView):
    """
    POST /api/auth/register/
    Create a new user account. Optionally creates a starter tenant if
    newsroom_name and newsroom_subdomain are provided.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.save()

        newsroom_name = request.data.get('newsroom_name', '').strip()
        newsroom_subdomain = request.data.get('newsroom_subdomain', '').strip()
        tenant_data = None
        if newsroom_name and newsroom_subdomain:
            tc = TenantCreateSerializer(data={'name': newsroom_name, 'subdomain': newsroom_subdomain})
            if tc.is_valid():
                tenant = tc.save()
                TenantUser.objects.create(user=user, tenant=tenant, role='admin')
                tenant_data = {'id': str(tenant.id), 'name': tenant.name, 'slug': tenant.slug}

        resp = _jwt_response(user)
        if tenant_data:
            resp['created_tenant'] = tenant_data
        return Response(resp, status=status.HTTP_201_CREATED)


class UserProfileView(APIView):
    """
    GET  /api/auth/profile/   — return current user profile
    PATCH /api/auth/profile/  — update first_name, last_name, bio, avatar
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_or_create_profile(self, user):
        profile, _ = UserProfile.objects.get_or_create(user=user)
        return profile

    def get(self, request):
        profile = self._get_or_create_profile(request.user)
        serializer = UserProfileSerializer(profile, context={'request': request})
        return Response(serializer.data)

    def patch(self, request):
        profile = self._get_or_create_profile(request.user)
        serializer = UserProfileSerializer(
            profile, data=request.data, partial=True, context={'request': request}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data)


class ChangePasswordView(APIView):
    """POST /api/auth/change-password/"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        old_password = request.data.get('old_password', '')
        new_password = request.data.get('new_password', '')
        if not old_password or not new_password:
            return Response(
                {'error': 'old_password and new_password are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not request.user.check_password(old_password):
            return Response({'error': 'Current password is incorrect'}, status=status.HTTP_400_BAD_REQUEST)
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            validate_password(new_password, request.user)
        except DjangoValidationError as e:
            return Response({'error': list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)
        request.user.set_password(new_password)
        request.user.save()
        return Response({'message': 'Password changed successfully'})


class TenantViewSet(viewsets.ModelViewSet):
    """
    Full CRUD for tenants. Users see only their own tenants.
    Creating a tenant auto-assigns the creator as admin.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'create':
            return TenantCreateSerializer
        if self.action in ('update', 'partial_update', 'update_settings'):
            return TenantUpdateSerializer
        return TenantSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return Tenant.objects.all()
        tenant_ids = TenantUser.objects.filter(user=user).values_list('tenant_id', flat=True)
        return Tenant.objects.filter(id__in=tenant_ids)

    def get_permissions(self):
        if self.action in ('lookup', 'branding'):
            return [permissions.AllowAny()]
        if self.action in ('update', 'partial_update', 'destroy', 'update_settings', 'manage_api_keys'):
            return [permissions.IsAuthenticated(), IsAdminOfTenant()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        tenant = serializer.save()
        TenantUser.objects.create(user=self.request.user, tenant=tenant, role='admin')
        logger.info(f"Tenant '{tenant.name}' created by {self.request.user.email}")

    @action(detail=False, methods=['get'])
    def my_tenants(self, request):
        """All tenants where the current user is a member, including role."""
        memberships = TenantUser.objects.filter(user=request.user).select_related('tenant')
        serializer = TenantUserSerializer(memberships, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated, IsAdminOfTenant])
    def invite_user(self, request, pk=None):
        tenant = self.get_object()
        email = request.data.get('email', '').strip().lower()
        role = request.data.get('role', 'editor')

        if not email:
            return Response({'error': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)
        if role not in ('admin', 'editor', 'viewer'):
            return Response({'error': 'Invalid role. Choose: admin, editor, viewer'}, status=status.HTTP_400_BAD_REQUEST)
        if TenantUser.objects.filter(tenant=tenant, user__email=email).exists():
            return Response({'error': 'User is already a member of this newsroom'}, status=status.HTTP_400_BAD_REQUEST)

        token = str(uuid.uuid4())
        TenantInvitation.objects.update_or_create(
            tenant=tenant,
            email=email,
            defaults={'role': role, 'token': token, 'invited_by': request.user, 'is_active': True},
        )

        accept_url = f"{settings.FRONTEND_URL}/accept-invite/{token}"
        try:
            send_mail(
                subject=f"You're invited to join {tenant.name} on Pavilion",
                message=(
                    f"Hi,\n\n{request.user.get_full_name() or request.user.email} has invited you "
                    f"to join {tenant.name} as {role}.\n\nAccept your invitation:\n{accept_url}\n\n"
                    f"If you don't have an account yet, you'll be prompted to create one.\n\nPavilion Team"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[email],
                fail_silently=True,
            )
        except Exception as e:
            logger.warning(f"Invitation email failed for {email}: {e}")

        return Response({'message': f'Invitation sent to {email}', 'token': token}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def accept_invitation(self, request):
        token = request.data.get('token', '').strip()
        if not token:
            return Response({'error': 'Token is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            invitation = TenantInvitation.objects.get(token=token, is_active=True)
        except TenantInvitation.DoesNotExist:
            return Response({'error': 'Invalid or expired invitation token'}, status=status.HTTP_404_NOT_FOUND)
        if invitation.email != request.user.email:
            return Response(
                {'error': 'This invitation was sent to a different email address'},
                status=status.HTTP_403_FORBIDDEN,
            )
        TenantUser.objects.get_or_create(
            tenant=invitation.tenant, user=request.user, defaults={'role': invitation.role}
        )
        invitation.accepted_at = timezone.now()
        invitation.is_active = False
        invitation.save()
        if invitation.invited_by:
            try:
                send_mail(
                    subject=f"{request.user.email} accepted your invitation to {invitation.tenant.name}",
                    message=f"{request.user.get_full_name() or request.user.email} has joined {invitation.tenant.name}.",
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[invitation.invited_by.email],
                    fail_silently=True,
                )
            except Exception as e:
                logger.warning(f"Invite-accepted notification failed: {e}")
        return Response({
            'message': f'Successfully joined {invitation.tenant.name}',
            'tenant': TenantSerializer(invitation.tenant).data,
        })

    @action(detail=True, methods=['patch'], permission_classes=[permissions.IsAuthenticated, IsAdminOfTenant])
    def update_settings(self, request, pk=None):
        """PATCH /api/tenants/{id}/update_settings/ — update name, subdomain, branding."""
        tenant = self.get_object()
        serializer = TenantUpdateSerializer(tenant, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(TenantSerializer(tenant).data)

    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def branding(self, request):
        """Public: branding config by slug, subdomain, or domain."""
        slug = request.query_params.get('slug')
        domain = request.query_params.get('domain')
        subdomain = request.query_params.get('subdomain')
        tenant = None
        if slug:
            tenant = Tenant.objects.filter(slug=slug).first()
        elif domain:
            tenant = Tenant.objects.filter(custom_domain=domain).first()
            if not tenant and '.' in domain:
                tenant = Tenant.objects.filter(subdomain=domain.split('.')[0]).first()
        elif subdomain:
            tenant = Tenant.objects.filter(subdomain=subdomain).first()
        if not tenant:
            return Response({'error': 'Tenant not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'id': tenant.id, 'name': tenant.name, 'slug': tenant.slug, 'branding': tenant.branding or {}})

    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def lookup(self, request):
        """Public: lookup tenant by domain or subdomain."""
        domain = request.query_params.get('domain')
        subdomain = request.query_params.get('subdomain')
        tenant = None
        if domain:
            tenant = Tenant.objects.filter(custom_domain=domain).first()
            if not tenant and '.' in domain:
                tenant = Tenant.objects.filter(subdomain=domain.split('.')[0]).first()
        elif subdomain:
            tenant = Tenant.objects.filter(subdomain=subdomain).first()
        if not tenant or not tenant.is_active:
            return Response({'error': 'Tenant not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            'id': tenant.id, 'name': tenant.name, 'slug': tenant.slug,
            'subdomain': tenant.subdomain, 'custom_domain': tenant.custom_domain,
        })

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def me_config(self, request):
        """Private: current user's tenant config."""
        if not hasattr(request, 'tenant') or not request.tenant:
            return Response({'error': 'No tenant context found'}, status=status.HTTP_400_BAD_REQUEST)
        if not TenantUser.objects.filter(user=request.user, tenant=request.tenant).exists():
            return Response({'error': 'You are not a member of this tenant'}, status=status.HTTP_403_FORBIDDEN)
        return Response({
            'tenant_id': request.tenant.id,
            'name': request.tenant.name,
            'slug': request.tenant.slug,
            'api_keys': request.tenant.api_keys or {},
            'custom_domain': request.tenant.custom_domain,
            'subscription_tier': request.tenant.subscription_tier,
            'max_users': request.tenant.max_users,
        })

    @action(detail=True, methods=['post', 'delete'], permission_classes=[permissions.IsAuthenticated, IsAdminOfTenant])
    def manage_api_keys(self, request, pk=None):
        """POST — generate new key. DELETE — revoke key by name."""
        tenant = self.get_object()
        api_keys = dict(tenant.api_keys or {})

        if request.method == 'POST':
            key_name = request.data.get('name', 'default')
            raw_key = f"pvl_{secrets.token_urlsafe(32)}"
            api_keys[key_name] = {
                'prefix': raw_key[:12],
                'created_at': timezone.now().isoformat(),
                'created_by': request.user.email,
            }
            tenant.api_keys = api_keys
            tenant.save(update_fields=['api_keys'])
            return Response({'key': raw_key, 'name': key_name, 'prefix': raw_key[:12]}, status=status.HTTP_201_CREATED)

        key_name = request.data.get('name')
        if key_name and key_name in api_keys:
            del api_keys[key_name]
            tenant.api_keys = api_keys
            tenant.save(update_fields=['api_keys'])
            return Response({'message': f'Key "{key_name}" revoked'})
        return Response({'error': 'Key not found'}, status=status.HTTP_404_NOT_FOUND)


class GoogleOAuthCallbackView(APIView):
    """POST /api/auth/google/callback/ — Verify Google ID token, return JWT + tenants."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        if not GOOGLE_AUTH_AVAILABLE:
            return Response(
                {'error': 'Google authentication not configured. Install google-auth.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        credential = request.data.get('credential')
        if not credential:
            return Response({'error': 'credential is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            idinfo = id_token.verify_oauth2_token(credential, google_requests.Request(), None)
            email = idinfo.get('email')
            if not email:
                return Response({'error': 'Email not found in Google token'}, status=status.HTTP_400_BAD_REQUEST)
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    'username': email,
                    'first_name': idinfo.get('given_name', ''),
                    'last_name': idinfo.get('family_name', ''),
                },
            )
            if created:
                logger.info(f"New user created via Google OAuth: {email}")
            tenant_id = (
                request.data.get('tenant_id') or
                (str(request.tenant.id) if hasattr(request, 'tenant') and request.tenant else None)
            )
            if tenant_id:
                try:
                    tenant = Tenant.objects.get(id=tenant_id)
                    existing = TenantUser.objects.filter(tenant=tenant).count()
                    TenantUser.objects.get_or_create(
                        user=user, tenant=tenant,
                        defaults={'role': 'admin' if existing == 0 else 'editor'},
                    )
                except Tenant.DoesNotExist:
                    pass
            return Response(_jwt_response(user), status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({'error': f'Invalid Google token: {str(e)}'}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception as e:
            logger.error(f"Google OAuth error: {e}", exc_info=True)
            return Response({'error': f'Authentication failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
