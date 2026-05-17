from django.db import migrations, models
import django.db.models.deletion

DEFAULT_CONTENT = """\
# Malayalam Sports Journalism — Editorial Style Guide

This guide is injected into every article generation prompt.
Edit the rules here in plain English or Malayalam; Gemini will follow them strictly.

---

## Core Principle
All article body text must be fluent, natural Malayalam. No mid-sentence English words.
Only exceptions: player names, team abbreviations (when used after first full mention),
tournament names (IPL, ICC, FIFA), venues, and scorelines.

---

## Numbers
- Write 1–10 as Malayalam words: ഒന്ന്, രണ്ട്, മൂന്ന്, നാല്, അഞ്ച്, ആറ്, ഏഴ്, എട്ട്, ഒൻപത്, പത്ത്
- Write 11 and above as numerals: 11, 24, 100, 182
- NEVER write "1-run win" — always spell out: "ഒരു റണ്ണിന്റെ ജയം"
- NEVER write "6 wickets" in English — always: "ആറ് വിക്കറ്റ്"

---

## Cricket Terminology (always render in Malayalam)
| English          | Malayalam              |
|------------------|------------------------|
| run / runs       | റൺ (singular & plural) |
| wicket           | വിക്കറ്റ്             |
| over / overs     | ഓവർ / ഓവറുകൾ          |
| ball / balls     | പന്ത് / പന്തുകൾ       |
| century          | സെഞ്ചുറി              |
| half-century     | അർദ്ധ സെഞ്ചുറി        |
| boundary         | ബൗണ്ടറി               |
| six              | സിക്‌സ്               |
| four             | ഫോർ                   |
| hat-trick        | ഹാട്ട്രിക്            |
| batting          | ബാറ്റിംഗ്             |
| bowling          | ബൗളിംഗ്               |
| fielding         | ഫീൽഡിംഗ്              |
| innings          | ഇന്നിംഗ്‌സ്           |
| toss             | ടോസ്                  |
| powerplay        | പവർ പ്ലേ              |
| death overs      | ഡെത്ത് ഓവറുകൾ         |
| playoff          | പ്ലേഓഫ്               |
| qualifier        | ക്വാളിഫയർ             |
| eliminator       | എലിമിനേറ്റർ           |
| final            | ഫൈനൽ                  |
| run out          | റൺ ഔട്ട്              |
| catch            | ക്യാച്ച്              |

---

## Football Terminology
| English      | Malayalam    |
|--------------|--------------|
| goal / goals | ഗോൾ          |
| penalty      | പെനാൽറ്റി    |
| offside      | ഓഫ്‌സൈഡ്    |

---

## IPL Team Names
First mention: full Malayalam name + abbreviation in brackets.
Subsequent mentions: abbreviation only is acceptable.

| Abbreviation | Full Malayalam Name                  |
|--------------|--------------------------------------|
| KKR          | കൊൽക്കത്ത നൈറ്റ് റൈഡേഴ്‌സ്         |
| CSK          | ചെന്നൈ സൂപ്പർ കിങ്‌സ്              |
| MI           | മുംബൈ ഇന്ത്യൻസ്                     |
| RCB          | റോയൽ ചലഞ്ചേഴ്‌സ് ബെംഗളൂരു         |
| DC           | ഡൽഹി ക്യാപിറ്റൽസ്                  |
| RR           | രാജസ്ഥാൻ റോയൽസ്                     |
| SRH          | സൺറൈസേഴ്‌സ് ഹൈദരാബാദ്              |
| LSG          | ലഖ്‌നൗ സൂപ്പർ ജയന്റ്‌സ്            |
| GT           | ഗുജറാത്ത് ടൈറ്റൻസ്                 |
| PBKS         | പഞ്ചാബ് കിങ്‌സ്                     |

---

## Score & Performance Formats
- Score: "[Team] [runs] റൺ [wickets] വിക്കറ്റ്"
  Correct: "KKR 181 റൺ 4 വിക്കറ്റ്" — WRONG: "KKR 181/4" or "KKR 181 runs"
- Win by runs: "[runs] റണ്ണിന് ജയിച്ചു"
  For 1 run: "ഒരു റണ്ണിന് ജയിച്ചു" — WRONG: "1-run-ന്"
- Win by wickets: "[wickets] വിക്കറ്റിന് ജയിച്ചു"
- Batter performance: "[Name] [balls] പന്തിൽ [runs] റൺ നേടി"
  Correct: "Mukul Choudhary 27 പന്തിൽ 54 റൺ നേടി"
- Bowler performance: "[Name] [overs] ഓവറിൽ [runs] റൺ വഴങ്ങി [wickets] വിക്കറ്റ് നേടി"

---

## Journalism Writing Style
- Lead with the key fact (inverted pyramid). Do NOT start the article with "ഇന്ന്..." (today).
- Use active voice: "LSG ജയിച്ചു" — NOT "LSG-ൽ ജയം ലഭിച്ചു"
- Win/loss words: ജയം (win), പരാജയം (loss), സമനില (tie), വിജയം (victory)
- Fully Malayalamise all hybrid phrases: "ഒരു റണ്ണിന്" NOT "1-run-ന്"; "ഹാട്ട്രിക്കിൽ" NOT "hat-trick-ൽ"
- Player quotes: keep in English inside <blockquote> tags
- Vary sentence structure across paragraphs — avoid repetition
"""


def seed_default_style_guide(apps, schema_editor):
    StyleGuide = apps.get_model('rss_fetcher', 'StyleGuide')
    if not StyleGuide.objects.filter(tenant__isnull=True).exists():
        StyleGuide.objects.create(tenant=None, content=DEFAULT_CONTENT)


def delete_default_style_guide(apps, schema_editor):
    StyleGuide = apps.get_model('rss_fetcher', 'StyleGuide')
    StyleGuide.objects.filter(tenant__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('rss_fetcher', '0002_rssfeed_tenant'),
        ('tenants', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='StyleGuide',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('content', models.TextField(
                    help_text='Natural-language rules for Gemini. Markdown formatting is supported.',
                )),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('tenant', models.OneToOneField(
                    blank=True,
                    help_text='Leave blank for the global default style guide.',
                    null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='style_guide',
                    to='tenants.tenant',
                )),
            ],
            options={
                'verbose_name': 'Style Guide',
                'verbose_name_plural': 'Style Guides',
            },
        ),
        migrations.RunPython(seed_default_style_guide, delete_default_style_guide),
    ]
