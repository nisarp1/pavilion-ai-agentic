# Pavilion Social Post — Template Guide

This is the single source of truth for every registered Canva template.
Edit this file to change how the AI writes for a specific template, then
re-read it to the agent via `_build_slot_brief` or paste the relevant section
into a prompt when something looks wrong.

---

## Writing Philosophy

### The Golden Rule
**Do NOT translate English into Malayalam word-for-word.**
Write the way a Kerala sports journalist speaks on social media.

| ❌ Literal translation | ✅ Natural Malayalam sports media |
|---|---|
| 2025 ഏഷ്യ കപ്പിൽ ഇന്ത്യ അക്കൗണ്ടഡ് ഫോർ ബീയിംഗ് | 2025 ഏഷ്യ കപ്പിൽ ഇന്ത്യ 'തോൽവി അംഗീകരിക്കാത്തവർ'! |
| കോഹ്ലി ഒരു സ്പെഷ്യൽ പ്ലെയർ ആണ് | കോഹ്ലി ഒരു വലിയ കളിക്കാരൻ തന്നെ |
| ഇന്ത്യ won the toss and elected to bat | ഇന്ത്യ ടോസ് ജയിച്ച് ബാറ്റ് ചെയ്യാൻ തീരുമാനിച്ചു |

### Tone per Content Type
| Content Type | Tone |
|---|---|
| `hero_headline` | Bold, punchy, 3–5-word punch lines. Think newspaper poster. |
| `ticker` | Urgent, present tense. "ഇതാ!", "അറിയിപ്പ്!" type openers. |
| `quote_card` | Respectful, direct. Let the quote breathe. No filler words. |
| `fact_check` | Journalistic gravitas. State the claim, then the verdict firmly. |
| `stat_comparison` | Numbers-first. Let stats speak. Short commentary beneath each stat. |
| `playing_xi` / `predicted_xi` | Team-fan energy. Excitement in the lineup reveal. |
| `match_result` | Decisive, past tense. Winners celebrated or losers analysed. |

### Social Media Caption Rules (applies to every template)
- 2–4 sentences in Malayalam. Reads like a real page post, not a subtitle.
- No filler like "ഈ ഒരു ചിത്രം…" or "ഇവിടെ നിങ്ങൾക്ക് കാണാം…"
- End with 3–5 hashtags: mix Malayalam and English (e.g. `#IndianCricket #IPL2025 #ക്രിക്കറ്റ്`)
- For quote posts: open with the punchiest part of the quote, attribute at the end.
- For fact-check posts: open with the claim ("X പറഞ്ഞതായി ആരോപണം"), close with verdict ("ഇത് വ്യാജം").

---

## Templates

---

### 1. Breaking News Vertical — Match Update
**Canva ID:** `DAG2P9MUfkU`
**Content type:** `ticker`
**Auto-select signals:** "breaking", "just in", "alert", "update", "confirmed", "official"

**Visual layout:**
Top banner strip → teal subheadline bar → large black main headline → square primary image (bottom half).

**When to use:**
Live match updates, squad announcements, injury news, official confirmations. Quick-hit news with a single image.

**Slots:**

| Slot key | What to write | Max words | Example |
|---|---|---|---|
| `Headline_Malayalam` | The main breaking fact. Bold, declarative. Start with the most important word. | 15 | "സഞ്ജു സാംസൺ ടീം ഇന്ത്യയിൽ നിന്ന് പുറത്ത്!" |
| `Subtext` | Context line — who, where, when. | 10 | "അഫ്ഗാൻ പരമ്പര ടീം പ്രഖ്യാപിച്ചു" |
| `Primary_Image` | *(image search query)* Specific player/event photo | — | "Sanju Samson batting action IPL" |

**Caption style:**
Start with "🚨" or "⚡" emoji (optional), state the breaking news, add context sentence, close with hashtags.
> Example: "ടീം ഇന്ത്യ ഷോക്ക്! സഞ്ജു സാംസണ് അഫ്ഗാൻ പരമ്പരയിൽ ഇടം ഇല്ല. തിരഞ്ഞെടുപ്പ് കമ്മിറ്റിയുടെ ഞെട്ടിക്കുന്ന തീരുമാനം. #TeamIndia #SanjuSamson #Cricket"

---

### 2. Hero Headline with Main Cutout
**Canva ID:** `DAHKI4MTArU`
**Content type:** `hero_headline`
**Auto-select signals:** default for general news posts — player announcements, milestones, transfers, records, selection news

**Visual layout:**
Left-aligned text column: RED bold headline (top layer) + BLACK supporting subheading (middle layer) + body text block. Large player cutout bleeds in from the right foreground.

**When to use:**
The default "general news" template. A player is dropped, a record is broken, a transfer is confirmed — anything that doesn't fall into a more specific category. Has a headline + subheading + body text structure.

**Slots:**

| Slot key | What to write | Max words | Example |
|---|---|---|---|
| `main_headline_top` | The single eyeball-catching punch line. Red text. 3–5 words that make you stop scrolling. | 5 | "സഞ്ജുവിനെ തഴഞ്ഞു!!!" |
| `main_headline_middle` | **DIFFERENT from top.** Supporting subheading in black. Completes the story or adds the "why". NOT a repeat. | 5 | "അഫ്ഗാൻ ടൂർ ടീം ഔട്ട്" |
| `body_text` | Narrative context. Full sentence. Who, what, where. | 15 | "അഫ്ഗാൻ T20 പരമ്പരയ്ക്കായി BCCI ടീം ഇന്ത്യ പ്രഖ്യാപിച്ചു; സഞ്ജുവിന് ഇടം നൽകിയില്ല." |
| `main_hero_player` | *(image search query)* Player cutout photo — background will be removed | — | "Sanju Samson portrait cricket whites" |
| `top_banner_bg` | *(hex color)* Color of the red top banner — use team/match accent color | — | `#CC0000` |
| `middle_banner_bg` | *(hex color)* Color behind the black subheading — usually white or dark | — | `#FFFFFF` |

**⚠ Duplicate caption rule:**
`main_headline_top` and `main_headline_middle` MUST convey different things.
- Top = the hook / shock / main fact (RED, bigger)
- Middle = the qualifier / context / team/event name (BLACK, smaller)

**Caption style:**
Natural narration. 2–3 sentences. Open with the news, add reaction/context, close with hashtags.
> Example: "ടീം ഇന്ത്യ BCCI-യുടെ ഞെട്ടിക്കുന്ന തീരുമാനം! അഫ്ഗാൻ T20 പരമ്പരയ്ക്ക് സഞ്ജു സാംസണ് ടീമിൽ ഇടം ലഭിച്ചില്ല. നിങ്ങൾ എന്ത് കരുതുന്നു? #SanjuSamson #TeamIndia #ക്രിക്കറ്റ്"

---

### 3. Three Players Quote (Stat Comparison)
**Canva ID:** `DAHKIzRwn5U`
**Content type:** `stat_comparison`
**Auto-select signals:** "vs", "head to head", "comparison", "three players", "stats"

**Visual layout:**
Three horizontal rows, each with a circular player photo, the player name, and a quote/stat sentence. Large featured player cutout on the right foreground. Main headline banner at top with repeating marquee text beneath.

**When to use:**
Three-way player comparisons, "who said it" attribution posts, or ranking/analysis posts featuring three subjects.

**Slots:**

| Slot key | What to write | Max words | Example |
|---|---|---|---|
| `main_heading` | Main title banner — upper case, 3–5 words. The overarching theme. | 5 | "പ്രതീക്ഷ കാക്കുമോ?" |
| `sub_heading_marquee` | Repeating marquee — same text repeated 3× is fine (design loops it). | 15 | "പ്രതീക്ഷ കാക്കുമോ? • പ്രതീക്ഷ കാക്കുമോ? •" |
| `row_1_quote` | Quote or stat for player 1. Full sentence. | 12 | "കോഹ്ലി ആ ബിഗ് ഇന്നിംഗ്സ് ഫൈനലിനായി കാത്തിരിക്കുകയാണ്" |
| `row_1_name` | Player 1 name. Prefix with dash. | 3 | "— രോഹിത് ശർമ്മ" |
| `row_2_quote` | Quote or stat for player 2. | 12 | "സ്പെഷ്യൽ കളിക്കാരൻ.. ഫൈനലിൽ കാത്തിരുന്നു കാണാം" |
| `row_2_name` | Player 2 name. | 3 | "— ക്രിസ് ഗെയ്ൽ" |
| `row_3_quote` | Quote or stat for player 3. | 12 | "വലിയ മത്സരങ്ങളിൽ പേടിക്കേണ്ടാത്ത താരം" |
| `row_3_name` | Player 3 name. | 3 | "— നാസർ ഹുസൈൻ" |
| `footer_branding` | Always: "PAVILION END" (static) | 2 | `PAVILION END` |
| `main_hero_player` | *(image search)* Central featured player, cutout | — | "Virat Kohli batting celebration" |
| `row_1_avatar` | *(image search)* Player 1 portrait | — | "Rohit Sharma portrait smiling" |
| `row_2_avatar` | *(image search)* Player 2 portrait | — | "Chris Gayle portrait cricket" |
| `row_3_avatar` | *(image search)* Player 3 portrait | — | "Nasser Hussain portrait" |
| `row_accent_bg` | *(hex color)* Row highlight background | — | `#1A2E6B` |

**Caption style:**
Question-led or opinion-led. Invite engagement.
> Example: "മൂന്ന് ക്രിക്കറ്റ് ഇതിഹാസങ്ങൾ കോഹ്ലിയെ കുറിച്ച് ഇങ്ങനെ പറഞ്ഞു — നിങ്ങൾ യോജിക്കുന്നുണ്ടോ? 🤔 #Kohli #Cricket #ICTFinal"

---

### 4. Player Quote Card with Diagonal Split Background
**Canva ID:** `DAHKI6029Zg`
**Content type:** `quote_card`
**Auto-select signals:** "quote", "said", "stated", "comments", "reacts", "'" (opening quote mark)

**Visual layout:**
Left-aligned text: context headline above the quote block with a large decorative quotation mark, quote body text, author attribution. Right side: two-layer player image composition over a diagonal split background.

**When to use:**
A player, coach, or pundit made a notable statement. Use the exact quote (translated to Malayalam). Never paraphrase into third person — keep it first person.

**Slots:**

| Slot key | What to write | Max words | Example |
|---|---|---|---|
| `context_headline` | What the quote is about. Sets the scene. NOT the quote itself. | 15 | "ഏഷ്യ കപ്പ് പ്രകടനം: ഇന്ത്യ 'തോൽവി ഉൾക്കൊള്ളാത്ത ടീം'" |
| `quote_body` | The actual quote in Malayalam. First person. Natural Malayalam, not literal translation. | 20 | "ഈ ടീം ഒരിക്കലും തോൽവി ഉൾക്കൊള്ളില്ല — അതാണ് ഈ ടീമിന്റെ ശക്തിയും ദൗർബ്ബല്യവും." |
| `quote_author` | Person's name in Malayalam script. | 4 | "— റിക്കി പോണ്ടിംഗ്" |
| `footer_branding` | Always: "PAVILION END" (static) | 2 | `PAVILION END` |
| `footer_url` | Always: "www.pavilionend.in" (static) | 3 | `www.pavilionend.in` |
| `foreground_player_cutout` | *(image search)* Main subject player, full body, cutout | — | "Virat Kohli batting celebration side view" |
| `background_player_blend` | *(image search)* Secondary/background player, cutout | — | "Virat Kohli portrait blur background" |
| `diagonal_bg_color` | *(hex color)* Background split color — use team color | — | `#003478` |

**⚠ Quote rules:**
- `quote_body` MUST be a first-person quote, not a paraphrase.
- `context_headline` provides context. `quote_body` is the voice of the person.
- Write Malayalam that sounds like the person said it, not how an English subtitle would describe it.

**Caption style:**
Lead with the most provocative line from the quote, then attribute it.
> Example: "'ഇന്ത്യ ഒരിക്കലും തോൽവി ഉൾക്കൊള്ളില്ല' — റിക്കി പോണ്ടിംഗ് ഇന്ത്യൻ ക്രിക്കറ്റിനെ ഇങ്ങനെ വിശേഷിപ്പിക്കുന്നു. നിങ്ങൾ ഇതിനോട് യോജിക്കുന്നുണ്ടോ? #AsiaCup2025 #IndianCricket #RickyPonting"

---

### 5. Quote About Player V2 — Right Text Layout
**Canva ID:** `DAHKI5FQGa4`
**Content type:** `quote_card`
**Auto-select signals:** same as template 4 (quote_card)

**Visual layout:**
Mirror of template 4 — text blocks are right-aligned, player image pair is on the left foreground. Identical slot schema.

Same rules as template 4 apply. Use this variant when the art director prefers right-aligned text composition.

---

### 6. Fact Check Split Card
**Canva ID:** `DAHKJD8VdOA`
**Content type:** `fact_check`
**Auto-select signals:** "fact check", "fact-check", "factcheck", "verdict", "claim", "debunk", "myth", "hoax", "viral"

**Visual layout:**
Upper dark zone: the claim/statement (white text) + author/source label. Diagonal divider with a central badge. Lower light zone: the fact-check verdict (coloured text, right-aligned) with two player cutouts anchored to opposite corners.

**When to use:**
A viral claim, a misquoted statement, or debunking content. The upper section presents the claim; the lower section delivers the verdict.

**Slots:**

| Slot key | What to write | Max words | Example |
|---|---|---|---|
| `claim_headline` | The claim being checked. State it clearly as a claim, not a fact. Use quotes or "X alleged that..." phrasing in Malayalam. | 15 | "2025 ഏഷ്യ കപ്പിൽ ഇന്ത്യ 'തോൽവി അംഗീകരിക്കാത്ത' ടീം — ആരോപണം" |
| `claim_author` | Name of the person/source making the claim. | 4 | "റിക്കി പോണ്ടിംഗ്" |
| `verdict_body` | **ALWAYS begin with "വസ്തുതാ പരിശോധന: "** then state the finding clearly. Was the claim true, false, misleading? Give one or two supporting facts. | 20 | "വസ്തുതാ പരിശോധന: ഈ പ്രസ്താവന വ്യാജമാണ്. അദ്ദേഹം ഇങ്ങനെ പറഞ്ഞിട്ടില്ല — ഇത് AI-generated ക്ലിപ്പ് ആണ്." |
| `footer_branding` | Always: "PAVILION END" (static) | 2 | `PAVILION END` |
| `footer_url` | Always: "www.pavilionend.in" (static) | 3 | `www.pavilionend.in` |
| `top_player_cutout` | *(image search)* Person making the claim — cutout | — | "Ricky Ponting portrait coaching" |
| `bottom_player_cutout` | *(image search)* Subject of the claim (the player being talked about) — cutout | — | "Virat Kohli batting action" |
| `top_background_color` | *(hex color)* Upper dark zone color | — | `#8B0000` |
| `bottom_background_color` | *(hex color)* Lower light zone color | — | `#F5F5F0` |

**⚠ Verdict body rules:**
- ALWAYS start with **"വസ്തുതാ പരിശോധന: "** — this is the "FACT CHECK:" label of the card.
- State whether the claim is TRUE / FALSE / MISLEADING in plain Malayalam.
- Give one short supporting sentence. Do not editorialize.

**Caption style:**
State the allegation, then the verdict. Invite the audience to share.
> Example: "2025 ഏഷ്യ കപ്പ് ഹൈലൈറ്റ്സ്: 'ഇന്ത്യ തോൽവി ഉൾക്കൊള്ളില്ല' എന്ന് റിക്കി പോണ്ടിംഗ് പറഞ്ഞോ? ഞങ്ങൾ പരിശോധിച്ചു. 🔍 #FactCheck #IndianCricket #AsiaCup2025"

---

### 7. Two Players Quote — Fact Check Split Card
**Canva ID:** `DAHKJADxxWc`
**Content type:** `fact_check`
**Auto-select signals:** same as template 6

**Visual layout:**
Same diagonal split structure as template 6 but with two distinct player cutouts and an extra attribution line in each zone. Upper dark zone: claim headline (white) + claim author (yellow) + yellow quotation mark icon + top-right player cutout. Lower cream zone: verdict body (red, right-aligned) + verdict author + bottom-left player cutout.

**When to use:**
Fact-check posts where two people are involved — the claimant and the subject (two named parties). Richer visual than template 6.

**Slots:**

| Slot key | What to write | Max words | Example |
|---|---|---|---|
| `claim_headline` | The claim. State clearly as an allegation. | 15 | "2025 ഏഷ്യ കപ്പ്: ഇന്ത്യ 'തോൽക്കാത്ത' ടീം — ആരോപണം" |
| `claim_author` | Claimant name (yellow text in upper zone) | 4 | "— റിക്കി പോണ്ടിംഗ്" |
| `verdict_body` | **ALWAYS begin with "വസ്തുതാ പരിശോധന: "** — then the verdict. | 20 | "വസ്തുതാ പരിശോധന: ഈ ക്ലിപ്പ് AI-generated ആണ്. പോണ്ടിംഗ് ഇങ്ങനെ പറഞ്ഞിട്ടില്ല." |
| `verdict_author` | Source of the verdict fact-check label | 4 | "— Pavilion FactBank" |
| `footer_branding` | Always: "PAVILION END" (static) | 2 | `PAVILION END` |
| `footer_url` | Always: "www.pavilionend.in" (static) | 3 | `www.pavilionend.in` |
| `top_player_cutout` | *(image search)* The claimant (upper-right zone) | — | "Ricky Ponting portrait coaching" |
| `bottom_player_cutout` | *(image search)* The subject of the claim (lower-left zone) | — | "Virat Kohli batting celebration" |
| `top_background_color` | *(hex color)* Upper zone color | — | `#8B0000` |
| `bottom_background_color` | *(hex color)* Lower zone color | — | `#F5F5F0` |
| `footer_background_color` | *(hex color)* Footer bar color | — | `#111111` |

**⚠ If Pavilion's own FactBank is the source:**
`verdict_author` should be "— Pavilion FactBank" and the verdict body should be more emphatic:
> "വസ്തുതാ പരിശോധന: ഞങ്ങളുടെ FactBank ഇത് വ്യാജം ആണെന്ന് സ്ഥിരീകരിക്കുന്നു."

**Caption style:**
Same as template 6. Lead with the allegation, confirm the verdict, tag both names.

---

### 8. Playing Eleven Right
**Canva ID:** `DAHKJGbdmBc`
**Content type:** `playing_xi`
**Auto-select signals:** "playing xi", "playing 11", "playing eleven", "toss result", "lineup", "line-up", "final xi"

**Visual layout:**
Split card. Left: full-height player cutout on teal/green gradient. Right dark zone: PLAYING XI hero title → team matchup (Team1 vs Team2) → toss result bar → numbered 11-player list → IMPACT PLAYERS badge → impact player names. Fixed dark footer.

**When to use:**
Official playing XI announcement after the toss. All 11 players known.

**Slots:**

| Slot key | What to write | Max words | Example |
|---|---|---|---|
| `team1_name` | First team abbreviation (gold text) | 2 | "RR" |
| `team2_name` | Second team abbreviation (white text) | 2 | "LSG" |
| `toss_result` | Toss result in Malayalam. E.g. "RR ടോസ് ജയിച്ച് ഫീൽഡ് ചെയ്യാൻ തീരുമാനിച്ചു" | 10 | "RR ബൗളിംഗ് തിരഞ്ഞെടുത്തു" |
| `player_1` to `player_11` | Each player's name in Malayalam script. Prefix: (C) captain, (WK) keeper, (C/WK) both. One player per slot. | 5 each | "(C) യശസ്വി ജയ്‌സ്വാൾ" |
| `impact_players_list` | Impact/substitute players. Comma-separated, Malayalam script. | 25 | "വൈഭവ് സൂര്യവംശി, അമൻ ഖാൻ, റിയാൻ പരാഗ്" |
| `footer_branding` | Always: "PAVILION END" (static) | 2 | `PAVILION END` |
| `footer_url` | Always: "www.pavilionend.in" (static) | 3 | `www.pavilionend.in` |
| `player_hero_cutout` | *(image search)* Key player full-body for left panel | — | "Yashasvi Jaiswal batting IPL 2024" |
| `left_panel_background_color` | *(hex)* Teal/team color for left player panel | — | `#00695C` |
| `right_panel_background_color` | *(hex)* Dark color for right text panel | — | `#0D0D0D` |
| `toss_bar_color` | *(hex)* Toss result bar color | — | `#00897B` |
| `impact_badge_color` | *(hex)* Impact Players badge background | — | `#FF6D00` |
| `footer_background_color` | *(hex)* Footer bar | — | `#111111` |

**Caption style:**
Lineup reveal energy. Fans want to discuss.
> Example: "ഇതാ RR-ന്റെ ഫൈനൽ XI! യശസ്വി ഒടുക്കം ഇട്ടോ? ഈ ടീം ജയിക്കുമോ? 💬 #IPL2025 #RR #PlayingXI"

---

### 9. Playing Eleven Left
**Canva ID:** `DAHKJFAaUgc`
**Content type:** `playing_xi`
**Auto-select signals:** same as template 8

Horizontally mirrored version of Playing Eleven Right. Left teal zone holds the text content (PLAYING XI title, lineup, toss, impact players). Right dark zone holds the player cutout. Use when the featured player image looks better on the right side of the frame.

Same slot schema as template 8. All rules and examples apply.

---

### 10. Predicted Eleven Left
**Canva ID:** `DAHKJONmQ_8`
**Content type:** `predicted_xi`
**Auto-select signals:** "predicted xi", "predicted 11", "predicted eleven", "squad prediction", "expected xi"

**Visual layout:**
Same layout as Playing Eleven Left but the hero title baked into the Canva design reads "PREDICTED XI" instead of "PLAYING XI". Left content panel + right player cutout.

**When to use:**
Pre-match predicted lineup posts — before the toss. Players are speculative.

**Key difference from playing_xi:**
- `toss_result` slot should be repurposed as a match context bar: e.g. "1st T20I • Wankhede • 7:30 PM"
- Player names may include question marks or "?" if uncertain: "ഋഷഭ് പന്ത്? (WK)"

All other rules identical to Playing Eleven templates.

---

### 11. Predicted Eleven Right
**Canva ID:** `DAHKJDVc3o4`
**Content type:** `predicted_xi`
**Auto-select signals:** same as template 10

Mirror of Predicted Eleven Left — player cutout on the left teal panel, text content on the right dark panel. No `toss_result` slot in this variant (lineup list starts immediately below the matchup line).

---

### 12. Predicted XI (Original)
**Canva ID:** `DAG2JjJhGSI`
**Content type:** `predicted_xi`
**Auto-select signals:** same as template 10

**Visual layout:**
Featured player cutout right foreground. Playing XI list left panel. Match header (number, venue, date) at top. Two team logos flanking the teams line. Substitutes/impact players at bottom.

**Slots (multi-line):**

| Slot key | Format | Example |
|---|---|---|
| `Match_Header` | 2 lines: `MATCH LABEL, VENUE\nDATE` (English, caps) | `1ST T20I, CANBERRA\nOCT 29, 2025` |
| `Match_Teams` | 2 lines: `TEAM1\nVS TEAM2` (English, caps) | `AUSTRALIA\nVS INDIA` |
| `Section_Title` | Fixed: "PREDICTED XI" (do not change) | `PREDICTED XI` |
| `Squad_List` | 11 players, one per line, Malayalam script. (C) and (WK) suffixes. | `മിച്ചൽ മാർഷ് (C)\nട്രാവിസ് ഹെഡ്\n...` |
| `Substitutes_List` | Comma-separated bench players, Malayalam script | "ജോഷ് ഇൻഗ്ലിസ്, ആരോൺ ഹാർഡി" |

---

## Auto-Selection Signal Map

This table is used by `_select_template()` in `social_tasks.py`:

| Keywords in content hint | Content type selected |
|---|---|
| "predicted xi", "predicted 11", "predicted eleven", "expected lineup", "squad prediction" | `predicted_xi` |
| "playing xi", "playing 11", "playing eleven", "toss result", "final xi", "lineup" | `playing_xi` |
| "fact check", "fact-check", "factcheck", "verdict", "debunk", "myth", "hoax", "claim" | `fact_check` |
| "vs ", " vs.", "head to head", "comparison" | `stat_comparison` |
| `"`, `"`, "quote", "said", "stated", "commented", "reacts" | `quote_card` |
| "result", "won", "lost", "beat", "defeated", "victory", "win by" | `match_result` |
| "breaking", "just in", "alert", "confirmed", "official announcement" | `ticker` |
| *(default / everything else)* | `hero_headline` → Hero Headline with Main Cutout |

---

## Editing This Guide

To change how the AI writes for a specific template:
1. Edit the relevant slot's **"What to write"** column or **"⚠ rules"** section above
2. The `hint` field in `seed_canva_templates.py` drives what the journalist agent sees per slot
3. The `_build_slot_brief()` function in `social_post_crew.py` renders the brief the agents receive
4. After changing the seed data, run: `python manage.py seed_canva_templates`
