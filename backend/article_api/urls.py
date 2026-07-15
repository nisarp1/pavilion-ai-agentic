"""Productized article API — mounted at /api/v1/."""
from django.urls import path

from . import views

urlpatterns = [
    path("generate/", views.generate_view, name="v1-generate"),
    path("usage/", views.usage_view, name="v1-usage"),
    path("estimate/", views.estimate_view, name="v1-estimate"),
    path("styles/", views.styles_view, name="v1-styles"),
    path("demo/generate/", views.demo_generate_view, name="v1-demo-generate"),
]
