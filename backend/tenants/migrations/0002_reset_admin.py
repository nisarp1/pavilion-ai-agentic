from django.db import migrations

def reset_admin_user(apps, schema_editor):
    from django.contrib.auth.models import User
    
    # Try to find user by username or email
    user = User.objects.filter(username='admin').first() or User.objects.filter(email='p88nisar@gmail.com').first()
    
    if user:
        user.username = 'admin'
        user.email = 'p88nisar@gmail.com'
        user.set_password('Bucyphalus')
        user.is_superuser = True
        user.is_staff = True
        user.is_active = True
        user.save()
    else:
        User.objects.create_superuser(
            username='admin',
            email='p88nisar@gmail.com',
            password='Bucyphalus'
        )

class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(reset_admin_user),
    ]
