from django.core.management.base import BaseCommand
from cms.models_canva import CanvaTemplate
from tenants.models import Tenant


TEMPLATES = [
    {
        "name": "Breaking News Vertical - Match Update",
        "canva_template_id": "DAG2P9MUfkU",
        "content_type": "ticker",
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
    {
        "name": "Three Players Quote",
        "canva_template_id": "DAHKIzRwn5U",
        "content_type": "stat_comparison",
        "description": (
            "Three horizontal rows featuring dynamic player circles, names, and description quotes, "
            "balanced by a prominent cut-out player on the right foreground."
        ),
        "slots": {
            "text": [
                {
                    "key": "main_heading",
                    "canva_name": "ആർ ഏറ്റവും മികച്ചത്?",
                    "max_words": 5,
                    "hint": "Main large uppercase title banner text",
                },
                {
                    "key": "sub_heading_marquee",
                    "canva_name": "ആർ ഏറ്റവും മികച്ചത്? • ആർ ഏറ്റവും മികച്ചത്? • ആർ ഏറ്റവും മികച്ചത്? •",
                    "max_words": 15,
                    "hint": "Repeating marquee text element beneath the main headline",
                },
                {
                    "key": "row_1_quote",
                    "canva_name": "കോഹ്ലി ഈ ജനറേഷനിലെ ഏറ്റവും ക്ലച്ച് ബാറ്റ്സ്മാൻ — ഗ്രേറ്റ് ഗെയ്‌മിൽ ഇദ്ദേഹം ജ്വലിക്കും",
                    "max_words": 12,
                    "hint": "Malayalam translation of the FIRST speaker's quote from the input. Extract the exact meaning — do NOT reuse the canva_name value.",
                },
                {
                    "key": "row_1_name",
                    "canva_name": "— ബ്രയൻ ലാറ",
                    "max_words": 3,
                    "hint": "FIRST speaker's name from the input with a leading dash (e.g. '— Rohit Sharma' → '— രോഹിത് ശർമ്മ'). Extract from input, do NOT reuse the canva_name.",
                },
                {
                    "key": "row_2_quote",
                    "canva_name": "ICC ട്രോഫി ഉയർത്തുന്ന ദിവസം ഞാൻ കണ്ടിരിക്കും — ഇതൊരു ഒഴിഞ്ഞ സ്ഥലം അല്ല",
                    "max_words": 12,
                    "hint": "Malayalam translation of the SECOND speaker's quote from the input. Extract the exact meaning — do NOT reuse the canva_name value.",
                },
                {
                    "key": "row_2_name",
                    "canva_name": "— ആദം ഗില്ക്രിസ്റ്റ്",
                    "max_words": 3,
                    "hint": "SECOND speaker's name from the input with a leading dash. Extract from input, do NOT reuse the canva_name.",
                },
                {
                    "key": "row_3_quote",
                    "canva_name": "ലോകത്ത് ഇദ്ദേഹത്തെക്കാൾ കൺസിസ്റ്റൻ്റായ ബാറ്റ്സ്മാൻ ഇന്ന് ഇല്ല",
                    "max_words": 12,
                    "hint": "Malayalam translation of the THIRD speaker's quote from the input. Extract the exact meaning — do NOT reuse the canva_name value.",
                },
                {
                    "key": "row_3_name",
                    "canva_name": "— ഹർഷ ഭോഗ്ലെ",
                    "max_words": 3,
                    "hint": "THIRD speaker's name from the input with a leading dash. Extract from input, do NOT reuse the canva_name.",
                },
                {
                    "key": "footer_branding",
                    "canva_name": "PAVILION END",
                    "max_words": 2,
                    "static": True,
                    "default": "PAVILION END",
                },
            ],
            "image": [
                {
                    "key": "main_hero_player",
                    "canva_name": "Virat_Kohli_Cutout",
                    "needs_cutout": True,
                },
                {
                    "key": "row_1_avatar",
                    "canva_name": "Rohit_Sharma_Circle",
                    "needs_cutout": False,
                },
                {
                    "key": "row_2_avatar",
                    "canva_name": "Chris_Gayle_Circle",
                    "needs_cutout": False,
                },
                {
                    "key": "row_3_avatar",
                    "canva_name": "Nasser_Hussain_Circle",
                    "needs_cutout": False,
                },
            ],
            "color": [
                {
                    "key": "row_accent_bg",
                    "canva_name": "Row Highlight Background Layer",
                },
            ],
        },
        "team_colors": {},
        "google_sheet_id": "",
        "sheet_tab_name": "Sheet1",
    },
    {
        "name": "Hero Headline with Main Cutout",
        "canva_template_id": "DAHKI4MTArU",
        "content_type": "hero_headline",
        "description": (
            "Bold headline template with a large main cutout player on the right foreground, "
            "a massive dual-layered background header, and a left-aligned body text description block."
        ),
        "slots": {
            "text": [
                {
                    "key": "main_headline_top",
                    "canva_name": "ബുമ്രയ്ക്ക് വിശ്രമം!",
                    "max_words": 5,
                    "hint": (
                        "The single eyeball-catching punch line displayed in RED at the top. "
                        "3–5 bold words that make you stop scrolling. "
                        "This is the HOOK — the most shocking or exciting fact. "
                        "Example: 'ഷോക്ക് കൊടുത്ത് BCCI!' or 'കോഹ്ലി ഔട്ട്!'"
                    ),
                },
                {
                    "key": "main_headline_middle",
                    "canva_name": "ഇംഗ്ലണ്ട് ടൂർ ടീം ഔട്ട്",
                    "max_words": 5,
                    "hint": (
                        "Supporting subheading displayed in BLACK under the red main headline. "
                        "MUST be a DIFFERENT phrase — NOT a repeat of main_headline_top. "
                        "Adds the qualifier, team name, or 'why'. Completes the story. "
                        "Example: if top says 'ബുമ്രയ്ക്ക് വിശ്രമം!', middle should say 'ഇംഗ്ലണ്ട് ടൂർ ടീം ഔട്ട്'. "
                        "Never use the same words as main_headline_top."
                    ),
                },
                {
                    "key": "body_text",
                    "canva_name": "ഇംഗ്ലണ്ടിനെതിരായ T20 പരമ്പരയ്ക്ക് BCCI ടീം ഇന്ത്യ പ്രഖ്യാപിച്ചു; ബുമ്രയ്ക്ക് വിശ്രമം.",
                    "max_words": 15,
                    "hint": (
                        "Full narrative sentence giving who, what, where context. "
                        "This is the body copy below the headline pair. "
                        "Write a natural Malayalam sentence — not a headline. "
                        "Example: 'ഇംഗ്ലണ്ട് T20 പരമ്പരയ്ക്കായി BCCI ടീം ഇന്ത്യ പ്രഖ്യാപിച്ചു; ബുമ്ര വിശ്രമത്തിൽ.'"
                    ),
                },
                {
                    "key": "footer_branding",
                    "canva_name": "PAVILION END",
                    "max_words": 2,
                    "static": True,
                    "default": "PAVILION END",
                },
                {
                    "key": "footer_url",
                    "canva_name": "www.pavilionend.in",
                    "max_words": 3,
                    "static": True,
                    "default": "www.pavilionend.in",
                },
            ],
            "image": [
                {
                    "key": "main_hero_player",
                    "canva_name": "Virat_Kohli_Cutout_Front",
                    "needs_cutout": True,
                },
            ],
            "color": [
                {
                    "key": "top_banner_bg",
                    "canva_name": "Red Gradient Background Layer",
                },
                {
                    "key": "middle_banner_bg",
                    "canva_name": "White Text Container Shape",
                },
            ],
        },
        "team_colors": {},
        "google_sheet_id": "",
        "sheet_tab_name": "Sheet1",
    },
    {
        "name": "Player Quote Card with Diagonal Split Background",
        "canva_template_id": "DAHKI6029Zg",
        "content_type": "quote_card",
        "description": (
            "Quote card featuring a left-aligned header and main quote block, a prominent graphic "
            "quotation mark, and a layered dual-player image composition on the right side over a "
            "split diagonal background."
        ),
        "slots": {
            "text": [
                {
                    "key": "context_headline",
                    "canva_name": "ഇന്ത്യൻ ക്രിക്കറ്റ്: കോഹ്ലി ഒരിക്കലും ഇല്ലാതാകില്ല",
                    "max_words": 15,
                    "hint": "Introductory or context headline above the quote block",
                },
                {
                    "key": "quote_body",
                    "canva_name": "ഞാൻ ഈ ടീമിനെ വിശ്വസിക്കുന്നു — ഏത് മൈദാനത്തും, ഏത് ഫോർമാറ്റിലും ഇവർ ജയിക്കും.",
                    "max_words": 20,
                    "hint": "The main block of quoted statement text",
                },
                {
                    "key": "quote_author",
                    "canva_name": "— രോഹിത് ശർമ്മ",
                    "max_words": 4,
                    "hint": "Name of the person being quoted",
                },
                {
                    "key": "footer_branding",
                    "canva_name": "PAVILION END",
                    "max_words": 2,
                    "static": True,
                    "default": "PAVILION END",
                },
                {
                    "key": "footer_url",
                    "canva_name": "www.pavilionend.in",
                    "max_words": 3,
                    "static": True,
                    "default": "www.pavilionend.in",
                },
            ],
            "image": [
                {
                    "key": "foreground_player_cutout",
                    "canva_name": "Virat_Kohli_Foreground",
                    "needs_cutout": True,
                },
                {
                    "key": "background_player_blend",
                    "canva_name": "Virat_Kohli_Background_Watermark",
                    "needs_cutout": True,
                },
            ],
            "color": [
                {
                    "key": "diagonal_bg_color",
                    "canva_name": "Blue Diagonal Solid Background Layer",
                },
            ],
        },
        "team_colors": {},
        "google_sheet_id": "",
        "sheet_tab_name": "Sheet1",
    },
    {
        "name": "Quote About Player V2 - Right Text Layout",
        "canva_template_id": "DAHKI5FQGa4",
        "content_type": "quote_card",
        "description": (
            "Quote card layout featuring right-aligned text blocks (context headline, quote body, "
            "and author attribution) paired with a dual-player stacked graphic on the left foreground."
        ),
        "slots": {
            "text": [
                {
                    "key": "context_headline",
                    "canva_name": "IPL 2025: 'ഈ സീസൺ കോഹ്ലിയുടേതാണ്'",
                    "max_words": 15,
                    "hint": "Introductory or context headline above the quote block on the right",
                },
                {
                    "key": "quote_body",
                    "canva_name": "ഈ ഫോമിൽ ഇദ്ദേഹത്തെ ആർക്കും തടയാൻ കഴിയില്ല — IPL ചരിത്രം കുറിക്കാൻ കോഹ്ലി ഒരുങ്ങുന്നു.",
                    "max_words": 20,
                    "hint": "The main block of right-aligned quoted statement text",
                },
                {
                    "key": "quote_author",
                    "canva_name": "— രോഹിത് ശർമ്മ",
                    "max_words": 4,
                    "hint": "Name of the person being quoted",
                },
                {
                    "key": "footer_branding",
                    "canva_name": "PAVILION END",
                    "max_words": 2,
                    "static": True,
                    "default": "PAVILION END",
                },
                {
                    "key": "footer_url",
                    "canva_name": "www.pavilionend.in",
                    "max_words": 3,
                    "static": True,
                    "default": "www.pavilionend.in",
                },
            ],
            "image": [
                {
                    "key": "foreground_player_cutout",
                    "canva_name": "Virat_Kohli_Foreground_Left",
                    "needs_cutout": True,
                },
                {
                    "key": "background_player_blend",
                    "canva_name": "Virat_Kohli_Background_Watermark_Left",
                    "needs_cutout": True,
                },
            ],
            "color": [
                {
                    "key": "diagonal_bg_color",
                    "canva_name": "Blue Diagonal Solid Background Layer Left",
                },
            ],
        },
        "team_colors": {},
        "google_sheet_id": "",
        "sheet_tab_name": "Sheet1",
    },
    {
        "name": "Fact Check Split Card",
        "canva_template_id": "DAHKJD8VdOA",
        "content_type": "fact_check",
        "description": (
            "Fact-checking template featuring an upper dark section for the initial claim/context "
            "and a lower light section for the counter-statement, divided by a diagonal split with "
            "a central floating badge."
        ),
        "slots": {
            "text": [
                {
                    "key": "claim_headline",
                    "canva_name": "2025 ഏഷ്യ കപ്പ്: 'ഇന്ത്യ ഒരിക്കലും തോൽവി ഉൾക്കൊള്ളില്ല' — ആരോപണം",
                    "max_words": 15,
                    "hint": "The initial statement or claim being evaluated, placed in the top dark section",
                },
                {
                    "key": "claim_author",
                    "canva_name": "— റിക്കി പോണ്ടിംഗ്",
                    "max_words": 4,
                    "hint": "Name or source responsible for the top statement",
                },
                {
                    "key": "verdict_body",
                    "canva_name": "വസ്തുതാ പരിശോധന: ഈ പ്രസ്താവന വ്യാജമാണ്. അദ്ദേഹം ഇങ്ങനെ പറഞ്ഞിട്ടില്ല.",
                    "max_words": 20,
                    "hint": (
                        "ALWAYS start with 'വസ്തുതാ പരിശോധന: ' (meaning 'Fact Check:') then state "
                        "the verdict — TRUE / FALSE / MISLEADING — in plain Malayalam. "
                        "Add one supporting sentence. No editorializing. "
                        "Example: 'വസ്തുതാ പരിശോധന: ഈ പ്രസ്താവന വ്യാജമാണ്. "
                        "അദ്ദേഹം ഇങ്ങനെ പറഞ്ഞിട്ടില്ല — ഇത് AI-generated ക്ലിപ്പ് ആണ്.'"
                    ),
                },
                {
                    "key": "footer_branding",
                    "canva_name": "PAVILION END",
                    "max_words": 2,
                    "static": True,
                    "default": "PAVILION END",
                },
                {
                    "key": "footer_url",
                    "canva_name": "www.pavilionend.in",
                    "max_words": 3,
                    "static": True,
                    "default": "www.pavilionend.in",
                },
            ],
            "image": [
                {
                    "key": "top_player_cutout",
                    "canva_name": "Virat_Kohli_Top_Right",
                    "needs_cutout": True,
                },
                {
                    "key": "bottom_player_cutout",
                    "canva_name": "Virat_Kohli_Bottom_Left",
                    "needs_cutout": True,
                },
            ],
            "color": [
                {
                    "key": "top_background_color",
                    "canva_name": "Dark Red Upper Solid Background Layer",
                },
                {
                    "key": "bottom_background_color",
                    "canva_name": "Light Gray Lower Background Texture",
                },
            ],
        },
        "team_colors": {},
        "google_sheet_id": "",
        "sheet_tab_name": "Sheet1",
    },
    {
        "name": "Two Players Quote – Fact Check Split Card",
        "canva_template_id": "DAHKJADxxWc",
        "content_type": "fact_check",
        "description": (
            "A vertically split dual-player quote card. The upper dark zone carries the initial claim "
            "headline (white) with an author attribution (yellow) and a yellow quotation mark icon, "
            "anchored by a top-right player cutout. A diagonal polygon divide separates it from the "
            "lower cream/light zone, which holds the verdict body text (red, right-aligned) plus a "
            "second attribution line, anchored by a bottom-left player cutout that bleeds across the "
            "diagonal. A fixed dark footer bar runs full-width at the bottom."
        ),
        "slots": {
            "text": [
                {
                    "key": "claim_headline",
                    "canva_name": "2025 ഏഷ്യ കപ്പ്: 'ഇന്ത്യ തോൽക്കാത്ത ടീം' — ആരോപണം",
                    "max_words": 15,
                    "hint": "The initial claim or context statement in the upper dark section",
                },
                {
                    "key": "claim_author",
                    "canva_name": "— റിക്കി പോണ്ടിംഗ്",
                    "max_words": 4,
                    "hint": "Name or source attributed to the upper claim, displayed in yellow",
                },
                {
                    "key": "verdict_body",
                    "canva_name": "വസ്തുതാ പരിശോധന: ഈ ക്ലിപ്പ് AI-generated ആണ്. പോണ്ടിംഗ് ഇങ്ങനെ പറഞ്ഞതിന് യാതൊരു തെളിവും ഇല്ല.",
                    "max_words": 20,
                    "hint": "The counter-statement or verdict narrative in the lower cream section, red right-aligned",
                },
                {
                    "key": "verdict_author",
                    "canva_name": "Pavilion FactBank",
                    "max_words": 4,
                    "hint": (
                        "Source of the fact-check verdict, displayed in yellow. "
                        "Use 'Pavilion FactBank' if this is Pavilion's own fact-check. "
                        "Otherwise use the name of the credible source that debunks the claim."
                    ),
                },
                {
                    "key": "footer_branding",
                    "canva_name": "PAVILION END",
                    "max_words": 2,
                    "static": True,
                    "default": "PAVILION END",
                },
                {
                    "key": "footer_url",
                    "canva_name": "www.pavilionend.in",
                    "max_words": 3,
                    "static": True,
                    "default": "www.pavilionend.in",
                },
            ],
            "image": [
                {
                    "key": "top_player_cutout",
                    "canva_name": "Virat_Kohli_Top_Right",
                    "needs_cutout": True,
                    "hint": "Player cutout anchored to the right edge of the upper dark zone",
                },
                {
                    "key": "bottom_player_cutout",
                    "canva_name": "Virat_Kohli_Bottom_Left",
                    "needs_cutout": True,
                    "hint": "Player cutout anchored to the left edge of the lower zone, bleeds ~30px across the diagonal",
                },
            ],
            "color": [
                {
                    "key": "top_background_color",
                    "canva_name": "Dark Red Upper Solid Background Layer",
                },
                {
                    "key": "bottom_background_color",
                    "canva_name": "Light Gray Lower Background Texture",
                },
                {
                    "key": "footer_background_color",
                    "canva_name": "Footer Dark Bar Background",
                },
            ],
        },
        "team_colors": {},
        "google_sheet_id": "",
        "sheet_tab_name": "Sheet1",
    },
    {
        "name": "Playing Eleven Right",
        "canva_template_id": "DAHKJGbdmBc",
        "content_type": "playing_xi",
        "description": (
            "A vertically split cricket Playing XI card. The left zone holds a full-bleed player "
            "cutout on a teal/green gradient background. The right dark zone carries the 'PLAYING XI' "
            "hero title block, match subtitle (team vs team), toss result line, a numbered 11-player "
            "lineup list, an IMPACT PLAYERS label badge, and an impact players list. A fixed dark "
            "footer bar with branding runs full-width at the bottom."
        ),
        "slots": {
            "text": [
                {
                    "key": "team1_name",
                    "canva_name": "RR",
                    "max_words": 2,
                    "hint": "First team abbreviation displayed in gold under the PLAYING XI title",
                },
                {
                    "key": "team2_name",
                    "canva_name": "LSG",
                    "max_words": 2,
                    "hint": "Second team abbreviation displayed in white next to team1_name",
                },
                {
                    "key": "toss_result",
                    "canva_name": "RR ബൗളിംഗ് തിരഞ്ഞെടുത്തു",
                    "max_words": 10,
                    "hint": "Toss result line in teal highlighted bar, e.g. 'RR won the toss and elected to bowl'",
                },
                {
                    "key": "player_1",
                    "canva_name": "(C) രോഹിത് ശർമ്മ",
                    "max_words": 5,
                    "hint": "Player 1 name. Prefix with (C), (WK), or (C/WK) if applicable.",
                },
                {
                    "key": "player_2",
                    "canva_name": "ശുഭ്മാൻ ഗിൽ",
                    "max_words": 5,
                    "hint": "Player 2 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_3",
                    "canva_name": "വിരാട് കോഹ്ലി",
                    "max_words": 5,
                    "hint": "Player 3 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_4",
                    "canva_name": "ഋഷഭ് പന്ത് (WK)",
                    "max_words": 5,
                    "hint": "Player 4 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_5",
                    "canva_name": "ഹാർദിക് പാണ്ഡ്യ",
                    "max_words": 5,
                    "hint": "Player 5 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_6",
                    "canva_name": "ആക്സർ പടേൽ",
                    "max_words": 5,
                    "hint": "Player 6 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_7",
                    "canva_name": "ഷിവം ദൂബേ",
                    "max_words": 5,
                    "hint": "Player 7 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_8",
                    "canva_name": "കുൽദീപ് യാദവ്",
                    "max_words": 5,
                    "hint": "Player 8 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_9",
                    "canva_name": "ജസ്പ്രീത് ബുമ്രാ",
                    "max_words": 5,
                    "hint": "Player 9 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_10",
                    "canva_name": "മൊഹമ്മദ് സിരാജ്",
                    "max_words": 5,
                    "hint": "Player 10 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_11",
                    "canva_name": "അർഷദീപ് സിംഗ്",
                    "max_words": 5,
                    "hint": "Player 11 name. Add role prefix if applicable.",
                },
                {
                    "key": "impact_players_list",
                    "canva_name": "വൈഭവ് സൂര്യവംശി, യുദ്ധ്വീർ സിംഗ്, അമൻ റാവു, റവി ബിഷ്നോയ്, റിയാൻ പരാഗ്",
                    "max_words": 25,
                    "hint": "Comma-separated list of impact player names below the IMPACT PLAYERS badge. Typically 3-5 names.",
                },
                {
                    "key": "footer_branding",
                    "canva_name": "PAVILION END",
                    "max_words": 2,
                    "static": True,
                    "default": "PAVILION END",
                },
                {
                    "key": "footer_url",
                    "canva_name": "www.pavilionend.in",
                    "max_words": 3,
                    "static": True,
                    "default": "www.pavilionend.in",
                },
            ],
            "image": [
                {
                    "key": "player_hero_cutout",
                    "canva_name": "Player_Hero_Left_Panel",
                    "needs_cutout": True,
                    "hint": "Full-height background-removed player cutout filling the entire left panel",
                },
            ],
            "color": [
                {
                    "key": "left_panel_background_color",
                    "canva_name": "Teal Green Left Panel Background",
                },
                {
                    "key": "right_panel_background_color",
                    "canva_name": "Dark Right Panel Background",
                },
                {
                    "key": "toss_bar_color",
                    "canva_name": "Teal Toss Result Bar",
                },
                {
                    "key": "impact_badge_color",
                    "canva_name": "Impact Players Badge Background",
                },
                {
                    "key": "footer_background_color",
                    "canva_name": "Footer Dark Bar Background",
                },
            ],
        },
        "team_colors": {},
        "google_sheet_id": "",
        "sheet_tab_name": "Sheet1",
    },
    {
        "name": "Playing Eleven Left",
        "canva_template_id": "DAHKJFAaUgc",
        "content_type": "playing_xi",
        "description": (
            "Horizontally mirrored variant of Playing Eleven Right. The left zone carries the teal "
            "background with the 'PLAYING XI' hero title, matchup line, toss result bar, 11-player "
            "lineup list, IMPACT PLAYERS badge and names. The right zone holds a full-bleed player "
            "cutout on a dark/bokeh background that bleeds leftward across the divider. A fixed dark "
            "footer bar runs full-width at the bottom."
        ),
        "slots": {
            "text": [
                {
                    "key": "team1_name",
                    "canva_name": "RR",
                    "max_words": 2,
                    "hint": "First team abbreviation displayed in gold under the PLAYING XI title",
                },
                {
                    "key": "team2_name",
                    "canva_name": "LSG",
                    "max_words": 2,
                    "hint": "Second team abbreviation displayed in white next to team1_name",
                },
                {
                    "key": "toss_result",
                    "canva_name": "RR ബൗളിംഗ് തിരഞ്ഞെടുത്തു",
                    "max_words": 10,
                    "hint": "Toss result line in dark highlighted bar on the left content panel",
                },
                {
                    "key": "player_1",
                    "canva_name": "(C) രോഹിത് ശർമ്മ",
                    "max_words": 5,
                    "hint": "Player 1 name. Prefix with (C), (WK), or (C/WK) if applicable.",
                },
                {
                    "key": "player_2",
                    "canva_name": "ശുഭ്മാൻ ഗിൽ",
                    "max_words": 5,
                    "hint": "Player 2 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_3",
                    "canva_name": "വിരാട് കോഹ്ലി",
                    "max_words": 5,
                    "hint": "Player 3 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_4",
                    "canva_name": "ഋഷഭ് പന്ത് (WK)",
                    "max_words": 5,
                    "hint": "Player 4 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_5",
                    "canva_name": "ഹാർദിക് പാണ്ഡ്യ",
                    "max_words": 5,
                    "hint": "Player 5 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_6",
                    "canva_name": "ആക്സർ പടേൽ",
                    "max_words": 5,
                    "hint": "Player 6 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_7",
                    "canva_name": "ഷിവം ദൂബേ",
                    "max_words": 5,
                    "hint": "Player 7 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_8",
                    "canva_name": "കുൽദീപ് യാദവ്",
                    "max_words": 5,
                    "hint": "Player 8 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_9",
                    "canva_name": "ജസ്പ്രീത് ബുമ്രാ",
                    "max_words": 5,
                    "hint": "Player 9 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_10",
                    "canva_name": "മൊഹമ്മദ് സിരാജ്",
                    "max_words": 5,
                    "hint": "Player 10 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_11",
                    "canva_name": "അർഷദീപ് സിംഗ്",
                    "max_words": 5,
                    "hint": "Player 11 name. Add role prefix if applicable.",
                },
                {
                    "key": "impact_players_list",
                    "canva_name": "വൈഭവ് സൂര്യവംശി, യുദ്ധ്വീർ സിംഗ്, അമൻ റാവു, റവി ബിഷ്നോയ്, റിയാൻ പരാഗ്",
                    "max_words": 25,
                    "hint": "Comma-separated list of impact player names below the IMPACT PLAYERS badge. Typically 3-5 names.",
                },
                {
                    "key": "footer_branding",
                    "canva_name": "PAVILION END",
                    "max_words": 2,
                    "static": True,
                    "default": "PAVILION END",
                },
                {
                    "key": "footer_url",
                    "canva_name": "www.pavilionend.in",
                    "max_words": 3,
                    "static": True,
                    "default": "www.pavilionend.in",
                },
            ],
            "image": [
                {
                    "key": "player_hero_cutout",
                    "canva_name": "Player_Hero_Right_Panel",
                    "needs_cutout": True,
                    "hint": "Full-height background-removed player cutout filling the right panel, bleeds leftward across the divider",
                },
            ],
            "color": [
                {
                    "key": "left_panel_background_color",
                    "canva_name": "Teal Green Left Content Panel Background",
                },
                {
                    "key": "right_panel_background_color",
                    "canva_name": "Dark Bokeh Right Panel Background",
                },
                {
                    "key": "toss_bar_color",
                    "canva_name": "Dark Toss Result Bar",
                },
                {
                    "key": "impact_badge_color",
                    "canva_name": "Impact Players Badge Background",
                },
                {
                    "key": "footer_background_color",
                    "canva_name": "Footer Dark Bar Background",
                },
            ],
        },
        "team_colors": {},
        "google_sheet_id": "",
        "sheet_tab_name": "Sheet1",
    },
    {
        "name": "Predicted Eleven Left",
        "canva_template_id": "DAHKJONmQ_8",
        "content_type": "predicted_xi",
        "description": (
            "Predicted XI variant of the Playing Eleven Left layout. Left teal content panel carries "
            "the 'PREDICTED XI' hero title, matchup line, toss/context bar, 11-player lineup list, "
            "IMPACT PLAYERS badge and names. Right dark panel holds a full-bleed player cutout on "
            "bokeh background that bleeds leftward over the divider. Fixed dark footer bar full-width "
            "at bottom. Identical slots to Playing Eleven Left — only the baked hero title differs."
        ),
        "slots": {
            "text": [
                {
                    "key": "team1_name",
                    "canva_name": "RR",
                    "max_words": 2,
                    "hint": "First team abbreviation in gold under the PREDICTED XI title",
                },
                {
                    "key": "team2_name",
                    "canva_name": "LSG",
                    "max_words": 2,
                    "hint": "Second team abbreviation in white next to team1_name",
                },
                {
                    "key": "toss_result",
                    "canva_name": "RR ബൗളിംഗ് തിരഞ്ഞെടുത്തു",
                    "max_words": 10,
                    "hint": "Toss/context line in dark highlighted bar. For predicted XI may be repurposed as a match context label.",
                },
                {
                    "key": "player_1",
                    "canva_name": "(C) രോഹിത് ശർമ്മ",
                    "max_words": 5,
                    "hint": "Player 1 name. Prefix with (C), (WK), or (C/WK) if applicable.",
                },
                {
                    "key": "player_2",
                    "canva_name": "ശുഭ്മാൻ ഗിൽ",
                    "max_words": 5,
                    "hint": "Player 2 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_3",
                    "canva_name": "വിരാട് കോഹ്ലി",
                    "max_words": 5,
                    "hint": "Player 3 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_4",
                    "canva_name": "ഋഷഭ് പന്ത്? (WK)",
                    "max_words": 5,
                    "hint": "Player 4 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_5",
                    "canva_name": "ഹാർദിക് പാണ്ഡ്യ",
                    "max_words": 5,
                    "hint": "Player 5 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_6",
                    "canva_name": "ആക്സർ പടേൽ",
                    "max_words": 5,
                    "hint": "Player 6 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_7",
                    "canva_name": "ഷിവം ദൂബേ",
                    "max_words": 5,
                    "hint": "Player 7 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_8",
                    "canva_name": "കുൽദീപ് യാദവ്",
                    "max_words": 5,
                    "hint": "Player 8 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_9",
                    "canva_name": "ജസ്പ്രീത് ബുമ്രാ",
                    "max_words": 5,
                    "hint": "Player 9 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_10",
                    "canva_name": "മൊഹമ്മദ് സിരാജ്",
                    "max_words": 5,
                    "hint": "Player 10 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_11",
                    "canva_name": "അർഷദീപ് സിംഗ്",
                    "max_words": 5,
                    "hint": "Player 11 name. Add role prefix if applicable.",
                },
                {
                    "key": "impact_players_list",
                    "canva_name": "വൈഭവ് സൂര്യവംശി, യുദ്ധ്വീർ സിംഗ്, അമൻ റാവു, റവി ബിഷ്നോയ്, റിയാൻ പരാഗ്",
                    "max_words": 25,
                    "hint": "Comma-separated list of predicted impact players below the IMPACT PLAYERS badge. Typically 3-5 names.",
                },
                {
                    "key": "footer_branding",
                    "canva_name": "PAVILION END",
                    "max_words": 2,
                    "static": True,
                    "default": "PAVILION END",
                },
                {
                    "key": "footer_url",
                    "canva_name": "www.pavilionend.in",
                    "max_words": 3,
                    "static": True,
                    "default": "www.pavilionend.in",
                },
            ],
            "image": [
                {
                    "key": "player_hero_cutout",
                    "canva_name": "Player_Hero_Right_Panel",
                    "needs_cutout": True,
                    "hint": "Full-height background-removed player cutout in the right panel, bleeds leftward over the divider",
                },
            ],
            "color": [
                {
                    "key": "left_panel_background_color",
                    "canva_name": "Teal Green Left Content Panel Background",
                },
                {
                    "key": "right_panel_background_color",
                    "canva_name": "Dark Bokeh Right Panel Background",
                },
                {
                    "key": "toss_bar_color",
                    "canva_name": "Dark Toss Result Bar",
                },
                {
                    "key": "impact_badge_color",
                    "canva_name": "Impact Players Badge Background",
                },
                {
                    "key": "footer_background_color",
                    "canva_name": "Footer Dark Bar Background",
                },
            ],
        },
        "team_colors": {},
        "google_sheet_id": "",
        "sheet_tab_name": "Sheet1",
    },
    {
        "name": "Predicted Eleven Right",
        "canva_template_id": "DAHKJDVc3o4",
        "content_type": "predicted_xi",
        "description": (
            "Predicted XI card with player cutout on the LEFT teal panel and text content on the "
            "RIGHT dark panel. Hero title reads 'PREDICTED XI'. No toss result bar — the player "
            "lineup list begins immediately beneath the matchup line. Fixed dark footer bar "
            "full-width at bottom."
        ),
        "slots": {
            "text": [
                {
                    "key": "team1_name",
                    "canva_name": "RR",
                    "max_words": 2,
                    "hint": "First team abbreviation in gold under the PREDICTED XI title",
                },
                {
                    "key": "team2_name",
                    "canva_name": "LSG",
                    "max_words": 2,
                    "hint": "Second team abbreviation in white next to team1_name",
                },
                {
                    "key": "player_1",
                    "canva_name": "(C) രോഹിത് ശർമ്മ",
                    "max_words": 5,
                    "hint": "Player 1 name. Starts immediately below the matchup line — no toss bar. Prefix: (C), (WK), or (C/WK).",
                },
                {
                    "key": "player_2",
                    "canva_name": "ശുഭ്മാൻ ഗിൽ",
                    "max_words": 5,
                    "hint": "Player 2 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_3",
                    "canva_name": "വിരാട് കോഹ്ലി",
                    "max_words": 5,
                    "hint": "Player 3 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_4",
                    "canva_name": "ഋഷഭ് പന്ത്? (WK)",
                    "max_words": 5,
                    "hint": "Player 4 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_5",
                    "canva_name": "ഹാർദിക് പാണ്ഡ്യ",
                    "max_words": 5,
                    "hint": "Player 5 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_6",
                    "canva_name": "ആക്സർ പടേൽ",
                    "max_words": 5,
                    "hint": "Player 6 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_7",
                    "canva_name": "ഷിവം ദൂബേ",
                    "max_words": 5,
                    "hint": "Player 7 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_8",
                    "canva_name": "കുൽദീപ് യാദവ്",
                    "max_words": 5,
                    "hint": "Player 8 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_9",
                    "canva_name": "ജസ്പ്രീത് ബുമ്രാ",
                    "max_words": 5,
                    "hint": "Player 9 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_10",
                    "canva_name": "മൊഹമ്മദ് സിരാജ്",
                    "max_words": 5,
                    "hint": "Player 10 name. Add role prefix if applicable.",
                },
                {
                    "key": "player_11",
                    "canva_name": "അർഷദീപ് സിംഗ്",
                    "max_words": 5,
                    "hint": "Player 11 name. Add role prefix if applicable.",
                },
                {
                    "key": "impact_players_list",
                    "canva_name": "വൈഭവ് സൂര്യവംശി, യുദ്ധ്വീർ സിംഗ്, അമൻ റാവു, റവി ബിഷ്നോയ്, റിയാൻ പരാഗ്",
                    "max_words": 25,
                    "hint": "Comma-separated list of predicted impact players below the IMPACT PLAYERS badge. Typically 3-5 names.",
                },
                {
                    "key": "footer_branding",
                    "canva_name": "PAVILION END",
                    "max_words": 2,
                    "static": True,
                    "default": "PAVILION END",
                },
                {
                    "key": "footer_url",
                    "canva_name": "www.pavilionend.in",
                    "max_words": 3,
                    "static": True,
                    "default": "www.pavilionend.in",
                },
            ],
            "image": [
                {
                    "key": "player_hero_cutout",
                    "canva_name": "Player_Hero_Left_Panel",
                    "needs_cutout": True,
                    "hint": "Full-height background-removed player cutout on teal left panel, bleeds rightward over the divider",
                },
            ],
            "color": [
                {
                    "key": "left_panel_background_color",
                    "canva_name": "Teal Green Left Panel Background",
                },
                {
                    "key": "right_panel_background_color",
                    "canva_name": "Dark Right Content Panel Background",
                },
                {
                    "key": "impact_badge_color",
                    "canva_name": "Impact Players Badge Background",
                },
                {
                    "key": "footer_background_color",
                    "canva_name": "Footer Dark Bar Background",
                },
            ],
        },
        "team_colors": {},
        "google_sheet_id": "",
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
