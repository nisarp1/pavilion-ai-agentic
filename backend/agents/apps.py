import time as _time
from django.apps import AppConfig


class AgentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "agents"
    verbose_name = "AI Agents"

    def ready(self):
        _t = _time.monotonic()
        def _ts(label):
            print(f'[AGENTS_READY] +{_time.monotonic()-_t:.1f}s {label}', flush=True)
        _ts('start')
        import agents.tasks         # noqa: F401
        _ts('after agents.tasks')
        import agents.social_tasks  # noqa: F401
        _ts('after agents.social_tasks')
