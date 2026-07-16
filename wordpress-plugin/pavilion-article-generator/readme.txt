=== Pavilion Article Generator ===
Contributors: pavilion
Tags: ai, malayalam, sports, article generator, gemini
Requires at least: 6.0
Requires PHP: 7.4
Tested up to: 6.6
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Generate faithful Malayalam sports articles with AI and save them as drafts — with the exact API cost (₹) shown per article.

== Description ==
Enter a topic. The plugin calls the Pavilion Article API server-to-server (your API key
never leaves WordPress), writes a Malayalam article, and creates a WordPress draft post you
can review and publish as usual. Each generation shows its exact API cost in ₹ and tokens,
plus your cumulative usage.

* Faithful Malayalam sports journalism (Gemini-powered)
* One-click draft — keeps your existing WordPress workflow
* Realtime cost/usage indicator (₹ per article)
* Secure: API key stored server-side; server-to-server calls only; nonce + capability checks

== Installation ==
1. Plugins → Add New → Upload Plugin → choose `pavilion-article-generator.zip` → Install Now → Activate.
2. Article Generator → Settings: enter your **API Base URL** and **API Key**.
3. Article Generator: type a topic → **Generate & save as draft**. Review the draft, then Publish.

== Changelog ==
= 1.0.0 =
* Initial release: topic → Malayalam draft, per-article ₹ cost, cumulative usage.
