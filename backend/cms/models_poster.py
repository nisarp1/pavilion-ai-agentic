
from django.db import models

class PosterTemplate(models.Model):
    """Template for generating social media posters."""
    
    name = models.CharField(max_length=100)
    background_image = models.ImageField(upload_to='templates/posters/')
    
    # Configuration for text overlay
    # Structure: {"text_fields": [{"name": "headline", "x": 100, "y": 100, "font_size": 40, "color": "#FFFFFF", "max_width": 500, "align": "center"}]}
    text_config = models.JSONField(default=dict, help_text="JSON configuration for text placement")
    
    # Configuration for image overlay (e.g., article featured image)
    # Structure: {"image_fields": [{"name": "featured_image", "x": 50, "y": 50, "width": 200, "height": 200, "shape": "rectangle"}]}
    image_config = models.JSONField(default=dict, help_text="JSON configuration for image placement")
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name
