from django.core.management.base import BaseCommand
from cms.models_canva import CanvaTemplate
from tenants.models import Tenant


TEMPLATES = [
    {
        "name": "Breaking News Vertical - Match Update",
        "canva_template_id": "DAG2P9MUfkU",
        "content_type": "hero_headline",
        "description": (
            "Urgent breaking news layout with a top banner, a teal subheadline, "
            "a large black main headline, and a square primary image in the lower half."
        ),
        "slots": {
            "text": [
                {"key": "Headline_Malayalam", "canva_name": "Headline_Malayalam", "max_words": 15},
                {"key": "Subtext",            "canva_name": "Subtext",            "max_words": 10},
            ],
            "image": [
                {"key": "Primary_Image", "canva_name": "Primary_Image", "needs_cutout": False},
            ],
            "color": [],
        },
        "team_colors": {},
        "google_sheet_id": "https://docs.google.com/spreadsheets/d/1_uuQOzITuaCMw9anfU26wmH0UL_GJDTg99mWp9fPwCI/edit?usp=sharing",
        "sheet_tab_name": "Sheet1",
    },
    {
        "name": "Predicted XI",
        "canva_template_id": "DAG2JjJhGSI",
        "content_type": "predicted_xi",
        "description": (
            "Cricket Predicted XI graphic. Featured player cutout on the right foreground. "
            "Playing XI list in Malayalam on the left panel. Match header (number, venue, date) "
            "at top. Two team logos flanking the teams line. Substitutes/impact players listed "
            "at the bottom in smaller text."
        ),
        "slots": {
            "text": [
                {
                    "key": "Match_Header",
                    "canva_name": "Match Header",
                    "hint": "Match number, venue, and date. E.g.: 1ST T20I, CANBERRA | OCT 29, 2025",
                    "max_words": 10,
                },
                {
                    "key": "Match_Teams",
                    "canva_name": "Match Teams",
                    "hint": "Two team names separated by VS. E.g.: AUSTRALIA VS INDIA",
                    "max_words": 5,
                },
                {
                    "key": "Section_Title",
                    "canva_name": "Section Title",
                    "hint": "Always fixed as PREDICTED XI in English. Never translate or modify.",
                    "static": True,
                    "default": "PREDICTED XI",
                    "max_words": 3,
                },
                {
                    "key": "Squad_List",
                    "canva_name": "Squad List",
                    "hint": (
                        "Playing XI in Malayalam script. Each player name on its own single line — "
                        "one name per line, no commas, no wrapping. Append (C) for captain, "
                        "(WK) for wicketkeeper on the same line as the name. "
                        "Use standard Malayalam sports editorial spelling for all names. Example:\n"
                        "രോഹിത് ശർമ്മ (C)\nശുഭ്മാൻ ഗിൽ\nവിരാട് കോഹ്ലി"
                    ),
                    "max_words": 55,
                },
                {
                    "key": "Substitutes_List",
                    "canva_name": "Substitutes List",
                    "hint": (
                        "Impact/bench players in Malayalam script. Each name on its own single line — "
                        "one name per line, no commas. Max 4-5 players."
                    ),
                    "max_words": 25,
                },
            ],
            "image": [
                {
                    "key": "Player_Cutout",
                    "canva_name": "Player Overlay 1",
                    "hint": "Featured player full-body photo. Background removed automatically.",
                    "needs_cutout": True,
                },
                {
                    "key": "Team_Logo_Left",
                    "canva_name": "Team Logo Left",
                    "hint": "Away team badge/logo (PNG with transparency preferred).",
                    "needs_cutout": False,
                },
                {
                    "key": "Team_Logo_Right",
                    "canva_name": "Team Logo Right",
                    "hint": "Home team badge/logo (PNG with transparency preferred).",
                    "needs_cutout": False,
                },
            ],
            "color": [],
        },
        "team_colors": {
            "IND": "#0033A0",
            "AUS": "#FFD700",
            "ENG": "#CF142B",
            "PAK": "#01411C",
            "SA":  "#007A4D",
            "NZ":  "#000000",
            "WI":  "#7B0041",
            "SL":  "#003478",
        },
        "google_sheet_id": "10k7WUikaYdb-6a4t440glV8TSnnoTTzm031lkZmXtJU",
        "sheet_tab_name": "Sheet1",
    },
]


class Command(BaseCommand):
    help = "Seed Canva templates into the database (idempotent — safe to run multiple times)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant",
            type=str,
            default=None,
            help="Tenant name to assign templates to (default: first active tenant)",
        )

    def handle(self, *args, **options):
        tenant = self._resolve_tenant(options["tenant"])
        if tenant:
            self.stdout.write(f"Using tenant: {tenant.name}")
        else:
            self.stdout.write(self.style.WARNING("No tenant found — templates will be created without a tenant"))

        for data in TEMPLATES:
            obj, created = CanvaTemplate.objects.update_or_create(
                canva_template_id=data["canva_template_id"],
                defaults={
                    "name":             data["name"],
                    "tenant":           tenant,
                    "content_type":     data["content_type"],
                    "description":      data["description"],
                    "slots":            data["slots"],
                    "team_colors":      data["team_colors"],
                    "google_sheet_id":  data["google_sheet_id"],
                    "sheet_tab_name":   data["sheet_tab_name"],
                    "is_active":        True,
                },
            )
            verb = "Created" if created else "Updated"
            self.stdout.write(self.style.SUCCESS(f"  {verb}: {obj.name} ({obj.canva_template_id})"))

        self.stdout.write(self.style.SUCCESS(f"\nDone. {len(TEMPLATES)} template(s) seeded."))

    def _resolve_tenant(self, name):
        try:
            if name:
                return Tenant.objects.get(name=name)
            return Tenant.objects.filter(is_active=True).first()
        except Tenant.DoesNotExist:
            return None
