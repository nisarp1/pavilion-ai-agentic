"""
URL patterns for the agents / reel pipeline app.
Mounted at: /api/pipeline/
"""
from django.urls import path
from . import views

urlpatterns = [
    path("generate/",          views.generate_reel,   name="pipeline-generate"),
    path("status/<int:article_id>/", views.pipeline_status, name="pipeline-status"),
]
