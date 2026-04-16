from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.views import APIView
import uuid
import json
from django.contrib.auth.models import User
from django.views.decorators.http import csrf_exempt
from django.utils.decorators import method_decorator
from .models import Tenant, TenantUser, TenantInvitation
from .serializers import TenantSerializer, TenantUserSerializer
from .permissions import IsAdminOfTenant, IsEditorOrAdminOfTenant, HasReadAccessToTenant

# Try to import google-auth, fallback gracefully if not installed
try:
    from google.auth.transport import requests
    from google.oauth2 import id_token
    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False

class TenantViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint that allows users to see their associated tenants.
    """
    serializer_class = TenantSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Return all tenants where the user is a member
        user = self.request.user
        if user.is_staff:
            return Tenant.objects.all()
        
        tenant_ids = TenantUser.objects.filter(user=user).values_list('tenant_id', flat=True)
        return Tenant.objects.filter(id__in=tenant_ids)

    @action(detail=False, methods=['get'])
    def my_tenants(self, request):
        """
        Get all tenants associated with the current user, including role info.
        """
        user = request.user
        memberships = TenantUser.objects.filter(user=user)
        serializer = TenantUserSerializer(memberships, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def invite_user(self, request, pk=None):
        """
        Invite a user to the tenant.
        """
        tenant = self.get_object()
        email = request.data.get('email')
        role = request.data.get('role', 'editor')

        if not email:
            return Response({'error': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Check if user is already a member
        if TenantUser.objects.filter(tenant=tenant, user__email=email).exists():
            return Response({'error': 'User is already a member of this tenant'}, status=status.HTTP_400_BAD_REQUEST)

        # Create or update invitation
        token = str(uuid.uuid4())
        invitation, created = TenantInvitation.objects.update_or_create(
            tenant=tenant,
            email=email,
            defaults={
                'role': role,
                'token': token,
                'invited_by': request.user,
                'is_active': True
            }
        )

        # In a real app, send an email here
        # send_invitation_email(email, tenant, token)

        return Response({
            'message': f'Invitation sent to {email}',
            'token': token # Return token for testing purposes in this demo
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def accept_invitation(self, request):
        """
        Accept an invitation using a token.
        """
        token = request.data.get('token')
        if not token:
            return Response({'error': 'Token is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            invitation = TenantInvitation.objects.get(token=token, is_active=True)
        except TenantInvitation.DoesNotExist:
            return Response({'error': 'Invalid or expired invitation token'}, status=status.HTTP_404_NOT_FOUND)

        # Check if user email matches invitation email
        if invitation.email != request.user.email:
            return Response({'error': 'This invitation was sent to a different email address'}, status=status.HTTP_403_FORBIDDEN)

        # Create TenantUser membership
        membership, created = TenantUser.objects.get_or_create(
            tenant=invitation.tenant,
            user=request.user,
            defaults={'role': invitation.role}
        )

        # Mark invitation as accepted
        from django.utils import timezone
        invitation.accepted_at = timezone.now()
        invitation.is_active = False
        invitation.save()

        return Response({
            'message': f'Successfully joined {invitation.tenant.name}',
            'tenant': TenantSerializer(invitation.tenant).data
        })

    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def branding(self, request):
        """
        Get branding configuration for a tenant by slug, subdomain, or domain.
        Public endpoint - no authentication required.
        Query params: ?slug=acme OR ?domain=acme.app.com OR ?subdomain=acme
        """
        slug = request.query_params.get('slug')
        domain = request.query_params.get('domain')
        subdomain = request.query_params.get('subdomain')

        tenant = None

        if slug:
            tenant = Tenant.objects.filter(slug=slug).first()
        elif domain:
            # Try custom domain first, then extract subdomain
            tenant = Tenant.objects.filter(custom_domain=domain).first()
            if not tenant and '.' in domain:
                # Extract subdomain from domain like "acme.app.example.com"
                subdomain_part = domain.split('.')[0]
                tenant = Tenant.objects.filter(subdomain=subdomain_part).first()
        elif subdomain:
            tenant = Tenant.objects.filter(subdomain=subdomain).first()

        if not tenant:
            return Response(
                {'error': 'Tenant not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        branding = tenant.branding or {}
        return Response({
            'id': tenant.id,
            'name': tenant.name,
            'slug': tenant.slug,
            'branding': branding
        })

    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def lookup(self, request):
        """
        Lookup tenant by domain or subdomain.
        Used by frontend to identify tenant on mount.
        Query params: ?domain=customer.com OR ?subdomain=acme
        """
        domain = request.query_params.get('domain')
        subdomain = request.query_params.get('subdomain')

        tenant = None

        if domain:
            # Try custom domain first
            tenant = Tenant.objects.filter(custom_domain=domain).first()
            if not tenant and '.' in domain:
                # Extract subdomain from full domain
                subdomain_part = domain.split('.')[0]
                tenant = Tenant.objects.filter(subdomain=subdomain_part).first()
        elif subdomain:
            tenant = Tenant.objects.filter(subdomain=subdomain).first()

        if not tenant or not tenant.is_active:
            return Response(
                {'error': 'Tenant not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        return Response({
            'id': tenant.id,
            'name': tenant.name,
            'slug': tenant.slug,
            'subdomain': tenant.subdomain,
            'custom_domain': tenant.custom_domain
        })

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def me_config(self, request):
        """
        Get the current user's tenant configuration (API keys, custom domain, etc.)
        This is private and requires authentication.
        User's tenant is determined by X-Tenant-ID header set by TenantMiddleware.
        """
        if not hasattr(request, 'tenant') or not request.tenant:
            return Response(
                {'error': 'No tenant context found'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verify user is member of this tenant
        if not TenantUser.objects.filter(user=request.user, tenant=request.tenant).exists():
            return Response(
                {'error': 'You are not a member of this tenant'},
                status=status.HTTP_403_FORBIDDEN
            )

        return Response({
            'tenant_id': request.tenant.id,
            'name': request.tenant.name,
            'slug': request.tenant.slug,
            'api_keys': request.tenant.api_keys or {},
            'custom_domain': request.tenant.custom_domain,
            'subscription_tier': request.tenant.subscription_tier,
            'max_users': request.tenant.max_users
        })


class GoogleOAuthCallbackView(APIView):
    """
    Google OAuth 2.0 callback endpoint.
    Frontend sends Google ID token, backend exchanges it for JWT tokens.

    Request:
        POST /api/auth/google/callback/
        {
            "credential": "<Google ID Token>",
            "tenant_id": "<UUID>" (optional, from X-Tenant-ID header if not provided)
        }

    Response:
        {
            "access": "<JWT Access Token>",
            "refresh": "<JWT Refresh Token>",
            "user": {
                "id": 123,
                "username": "user@example.com",
                "email": "user@example.com",
                "first_name": "John",
                "last_name": "Doe"
            },
            "tenant": {
                "id": "uuid",
                "name": "Acme Corp",
                "slug": "acme"
            }
        }
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        if not GOOGLE_AUTH_AVAILABLE:
            return Response(
                {'error': 'Google authentication not configured. Install google-auth.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        credential = request.data.get('credential')
        if not credential:
            return Response(
                {'error': 'credential is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        google_client_id = None  # Load from settings.py
        if hasattr(request, 'tenant') and request.tenant:
            tenant_id = request.tenant.id
        else:
            tenant_id = request.data.get('tenant_id')
            if not tenant_id:
                return Response(
                    {'error': 'tenant_id is required or X-Tenant-ID header must be set'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        try:
            # Verify the token signature
            # NOTE: In production, fetch google_client_id from GCP Secret Manager
            idinfo = id_token.verify_oauth2_token(credential, requests.Request(), google_client_id)

            email = idinfo.get('email')
            if not email:
                return Response(
                    {'error': 'Email not found in token'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Get or create user
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    'username': email,
                    'first_name': idinfo.get('given_name', ''),
                    'last_name': idinfo.get('family_name', ''),
                }
            )

            # Get tenant
            try:
                tenant = Tenant.objects.get(id=tenant_id)
            except Tenant.DoesNotExist:
                return Response(
                    {'error': f'Tenant {tenant_id} not found'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Get or create tenant membership
            # First user becomes admin, others become editors
            existing_members = TenantUser.objects.filter(tenant=tenant).count()
            role = 'admin' if existing_members == 0 else 'editor'

            tenant_user, created = TenantUser.objects.get_or_create(
                user=user,
                tenant=tenant,
                defaults={'role': role}
            )

            # Generate JWT tokens
            from rest_framework_simplejwt.tokens import RefreshToken
            refresh = RefreshToken.for_user(user)

            return Response({
                'access': str(refresh.access_token),
                'refresh': str(refresh),
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'first_name': user.first_name,
                    'last_name': user.last_name,
                },
                'tenant': {
                    'id': str(tenant.id),
                    'name': tenant.name,
                    'slug': tenant.slug,
                    'role': tenant_user.role
                }
            }, status=status.HTTP_200_OK)

        except ValueError as e:
            # Invalid token signature
            return Response(
                {'error': f'Invalid token: {str(e)}'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        except Exception as e:
            return Response(
                {'error': f'Authentication failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
