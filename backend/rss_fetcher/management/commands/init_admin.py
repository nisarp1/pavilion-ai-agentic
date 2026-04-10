from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
import os

class Command(BaseCommand):
    help = 'Creates a superuser from environment variables if it does not exist'

    def handle(self, *args, **options):
        User = get_user_model()
        username = os.environ.get('DJANGO_SUPERUSER_USERNAME')
        email = os.environ.get('DJANGO_SUPERUSER_EMAIL')
        password = os.environ.get('DJANGO_SUPERUSER_PASSWORD')

        if not all([username, email, password]):
            self.stdout.write('DJANGO_SUPERUSER_USERNAME, EMAIL, or PASSWORD not set. Skipping.')
            return

        try:
            if not User.objects.filter(username=username).exists():
                self.stdout.write(f'Creating superuser "{username}"...')
                User.objects.create_superuser(username=username, email=email, password=password)
                self.stdout.write(self.style.SUCCESS(f'Superuser "{username}" created!'))
            else:
                self.stdout.write(f'User "{username}" exists. Updating password...')
                u = User.objects.get(username=username)
                u.set_password(password)
                u.save()
                self.stdout.write(self.style.SUCCESS(f'Password updated for "{username}".'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error: {e}'))
