from django.apps import AppConfig


class AgentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "agents"
    verbose_name = "AI Agents"

    def ready(self):
        import agents.tasks         # noqa: F401
        import agents.social_tasks  # noqa: F401
