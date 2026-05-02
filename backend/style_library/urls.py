"""
URL patterns for the Style Library app.
Mounted at: /api/style-library/
"""
from django.urls import path
from . import views

urlpatterns = [
    # Templates
    path("templates/",                views.template_list,    name="style-template-list"),
    path("templates/<uuid:pk>/",      views.template_detail,  name="style-template-detail"),

    # Analyze a reference reel
    path("analyze/",                  views.analyze_reel,     name="style-analyze"),

    # Style DNA analyses
    path("analyses/",                 views.analysis_list,    name="style-analysis-list"),
    path("analyses/<uuid:pk>/",       views.analysis_detail,  name="style-analysis-detail"),

    # Presets
    path("presets/",                  views.preset_list,      name="style-preset-list"),
    path("presets/<uuid:pk>/",        views.preset_detail,    name="style-preset-detail"),
    path("presets/<uuid:pk>/apply/",  views.apply_preset,     name="style-preset-apply"),

    # Full catalog (hardcoded + library)
    path("catalog/",                  views.full_catalog,     name="style-catalog"),
]
