from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
import uuid
from .models import Tenant, TenantUser, TenantInvitation
from .serializers import TenantSerializer, TenantUserSerializer

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
