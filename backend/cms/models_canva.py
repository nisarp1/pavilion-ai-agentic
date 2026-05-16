from django.db import models
from tenants.models import Tenant

CONTENT_TYPE_CHOICES = [
    ('stat_comparison', 'Stat Comparison'),
    ('player_card',     'Player Card'),
    ('hero_headline',   'Hero Headline'),
    ('quote_card',      'Quote Card'),
    ('match_result',    'Match Result'),
    ('ticker',          'Ticker / Breaking'),
    ('predicted_xi',    'Predicted XI'),
]


class CanvaTemplate(models.Model):
    """
    Represents a single Canva template already created in the Canva workspace.

    The `slots` JSONField is the source of truth for what the agents must generate
    and what the CSV exporter uses for column headers. Structure:

        {
          "text": [
            {"key": "Headline",       "canva_name": "Title Box 1",     "max_words": 10},
            {"key": "Bullet_1",       "canva_name": "Point 1",         "max_words": 10},
            ...
          ],
          "image": [
            {"key": "Background_Image", "canva_name": "BG Photo",        "needs_cutout": false},
            {"key": "Player_Cutout_1",  "canva_name": "Player Overlay 1","needs_cutout": true},
          ],
          "color": [
            {"key": "Accent_Color", "canva_name": "Accent Bar Color"}
          ]
        }

    Repeatable elements (6 bullets, 2 player cutouts) are modelled as individual
    slots with distinct keys (Bullet_1 … Bullet_6, Player_Cutout_1 / _2).
    """

    name              = models.CharField(max_length=100)
    tenant            = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='canva_templates',
        null=True,
        blank=True,
    )
    content_type      = models.CharField(
        max_length=30,
        choices=CONTENT_TYPE_CHOICES,
        default='hero_headline',
    )
    canva_template_id = models.CharField(
        max_length=255,
        blank=True,
        help_text="Canva template ID used in bulk-create uploads",
    )
    description       = models.TextField(
        blank=True,
        help_text=(
            "Plain-English description of the visual layout shown to the agent. "
            "E.g.: 'Two player cutouts side by side, headline at top, two stat boxes "
            "below, six bullet points, accent colour bar at bottom.'"
        ),
    )
    slots             = models.JSONField(
        default=dict,
        help_text="Structured slot schema — see class docstring for full format.",
    )
    # Default team-colour overrides keyed by team name.
    # e.g. {"CSK": "#FDB913", "MI": "#005DA0", "RCB": "#E32023"}
    team_colors       = models.JSONField(default=dict)

    # Google Sheets integration
    # Paste the full sheet URL or just the sheet ID (between /d/ and /edit in the URL).
    # Share the sheet with the GCP service account email as Editor.
    # Headers in the sheet must match the slot key names exactly.
    google_sheet_id   = models.CharField(
        max_length=255,
        blank=True,
        help_text=(
            'Google Sheet ID or full URL. '
            'Share the sheet with the GCP service account (Editor). '
            'Column headers must match slot key names.'
        ),
    )
    sheet_tab_name    = models.CharField(
        max_length=100,
        blank=True,
        default='Sheet1',
        help_text='Worksheet tab name (default: Sheet1)',
    )

    is_active         = models.BooleanField(default=True)
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    # ── Slot accessors ────────────────────────────────────────────────────────

    def text_slots(self):
        return self.slots.get('text', [])

    def image_slots(self):
        return self.slots.get('image', [])

    def color_slots(self):
        return self.slots.get('color', [])

    def all_slots_flat(self):
        """All slots in declaration order: text → image → color. Used for CSV columns."""
        return self.text_slots() + self.image_slots() + self.color_slots()

    def all_slot_keys(self):
        """All slot key strings — used to validate agent output."""
        return [s['key'] for s in self.all_slots_flat()]

    def __str__(self):
        return f"{self.name} ({self.get_content_type_display()})"

    class Meta:
        ordering = ['content_type', 'name']
