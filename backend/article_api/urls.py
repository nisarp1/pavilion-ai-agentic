"""Productized article API — mounted at /api/v1/."""
from django.urls import path

from . import views

urlpatterns = [
    path("generate/", views.generate_view, name="v1-generate"),
    path("usage/", views.usage_view, name="v1-usage"),
    path("estimate/", views.estimate_view, name="v1-estimate"),
    path("styles/", views.styles_view, name="v1-styles"),
    path("demo/", views.demo_page_view, name="v1-demo-page"),
    path("demo/generate/", views.demo_generate_view, name="v1-demo-generate"),
    path("demo/usage/", views.demo_usage_view, name="v1-demo-usage"),
]
