<?php
/**
 * Plugin Name:       Pavilion Article Generator
 * Plugin URI:        https://pavilionend.com
 * Description:       Generate faithful Malayalam sports articles with AI and drop them straight into your posts as drafts. Shows the exact API cost (₹) per article. Powered by the Pavilion Article API.
 * Version:           1.0.0
 * Author:            Pavilion
 * License:           GPL-2.0+
 * Text Domain:       pavilion-article-generator
 *
 * Independent, self-contained. Calls the Pavilion Article API server-to-server —
 * the API key is stored in wp_options and NEVER exposed to the browser.
 */

if (!defined('ABSPATH')) { exit; }

define('PAG_VERSION', '1.0.0');
define('PAG_OPT_BASE', 'pag_api_base');
define('PAG_OPT_KEY', 'pag_api_key');
define('PAG_OPT_LANG', 'pag_default_lang');

/* ------------------------------------------------------------------ menus */
add_action('admin_menu', function () {
    add_menu_page(
        'Article Generator', 'Article Generator', 'edit_posts',
        'pavilion-article-generator', 'pag_render_generator_page', 'dashicons-edit-large', 26
    );
    add_submenu_page(
        'pavilion-article-generator', 'Settings', 'Settings', 'manage_options',
        'pavilion-article-generator-settings', 'pag_render_settings_page'
    );
});

add_action('admin_init', function () {
    register_setting('pag_settings', PAG_OPT_BASE, ['sanitize_callback' => 'esc_url_raw']);
    register_setting('pag_settings', PAG_OPT_KEY, ['sanitize_callback' => 'sanitize_text_field']);
    register_setting('pag_settings', PAG_OPT_LANG, ['sanitize_callback' => 'sanitize_text_field']);
});

/* --------------------------------------------------------------- settings */
function pag_render_settings_page() {
    if (!current_user_can('manage_options')) { return; }
    $key = get_option(PAG_OPT_KEY, '');
    $masked = $key ? substr($key, 0, 8) . str_repeat('•', 6) : '';
    ?>
    <div class="wrap">
      <h1>Pavilion Article Generator — Settings</h1>
      <form method="post" action="options.php">
        <?php settings_fields('pag_settings'); ?>
        <table class="form-table" role="presentation">
          <tr>
            <th scope="row"><label for="pag_api_base">API Base URL</label></th>
            <td><input name="<?php echo PAG_OPT_BASE; ?>" id="pag_api_base" type="url" class="regular-text"
                       value="<?php echo esc_attr(get_option(PAG_OPT_BASE, '')); ?>"
                       placeholder="https://api.pavilionend.com" />
                <p class="description">Your Pavilion Article API endpoint (no trailing <code>/api/v1</code>).</p></td>
          </tr>
          <tr>
            <th scope="row"><label for="pag_api_key">API Key</label></th>
            <td><input name="<?php echo PAG_OPT_KEY; ?>" id="pag_api_key" type="password" class="regular-text"
                       value="<?php echo esc_attr($key); ?>" autocomplete="off"
                       placeholder="pvl_…" />
                <?php if ($masked): ?><p class="description">Current: <code><?php echo esc_html($masked); ?></code> — stored server-side, never sent to the browser.</p><?php endif; ?></td>
          </tr>
          <tr>
            <th scope="row"><label for="pag_default_lang">Default language</label></th>
            <td><select name="<?php echo PAG_OPT_LANG; ?>" id="pag_default_lang">
                  <?php $l = get_option(PAG_OPT_LANG, 'ml'); ?>
                  <option value="ml" <?php selected($l, 'ml'); ?>>Malayalam</option>
                  <option value="en" <?php selected($l, 'en'); ?>>English</option>
                </select></td>
          </tr>
        </table>
        <?php submit_button('Save settings'); ?>
      </form>
    </div>
    <?php
}

/* ------------------------------------------------------------- generator */
function pag_render_generator_page() {
    if (!current_user_can('edit_posts')) { return; }
    $base = rtrim(get_option(PAG_OPT_BASE, ''), '/');
    $key  = get_option(PAG_OPT_KEY, '');
    $result = null; $error = null;

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['pag_nonce'])
        && wp_verify_nonce($_POST['pag_nonce'], 'pag_generate')) {
        $topic = sanitize_text_field($_POST['pag_topic'] ?? '');
        $lang  = sanitize_text_field($_POST['pag_lang'] ?? get_option(PAG_OPT_LANG, 'ml'));
        if (!$base || !$key) {
            $error = 'Set your API Base URL and API Key in Settings first.';
        } elseif (!$topic) {
            $error = 'Please enter a topic.';
        } else {
            $result = pag_generate_and_draft($base, $key, $topic, $lang);
            if (isset($result['error'])) { $error = $result['error']; $result = null; }
        }
    }

    $usage = ($base && $key) ? pag_fetch_usage($base, $key) : null;
    ?>
    <div class="wrap">
      <h1>Pavilion Article Generator</h1>
      <?php if (!$base || !$key): ?>
        <div class="notice notice-warning"><p>Configure your API endpoint and key in
          <a href="<?php echo esc_url(admin_url('admin.php?page=pavilion-article-generator-settings')); ?>">Settings</a>.</p></div>
      <?php endif; ?>

      <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start">
        <div style="flex:2;min-width:420px">
          <form method="post">
            <?php wp_nonce_field('pag_generate', 'pag_nonce'); ?>
            <table class="form-table" role="presentation">
              <tr><th><label for="pag_topic">Topic</label></th>
                  <td><input name="pag_topic" id="pag_topic" type="text" class="large-text"
                             value="<?php echo esc_attr($_POST['pag_topic'] ?? ''); ?>"
                             placeholder="e.g. India beat Australia to win the Border-Gavaskar Trophy" /></td></tr>
              <tr><th><label for="pag_lang">Language</label></th>
                  <td><select name="pag_lang" id="pag_lang">
                      <option value="ml">Malayalam</option><option value="en">English</option></select></td></tr>
            </table>
            <?php submit_button('Generate &amp; save as draft'); ?>
          </form>

          <?php if ($error): ?>
            <div class="notice notice-error"><p><?php echo esc_html($error); ?></p></div>
          <?php endif; ?>

          <?php if ($result): ?>
            <div class="notice notice-success">
              <p>✅ Draft created:
                <a href="<?php echo esc_url($result['edit_link']); ?>"><strong><?php echo esc_html($result['title']); ?></strong></a>
                &nbsp;·&nbsp; cost <strong>₹<?php echo esc_html(number_format($result['cost_inr'], 3)); ?></strong>
                (<?php echo intval($result['input_tokens']); ?> in / <?php echo intval($result['output_tokens']); ?> out tokens,
                <?php echo esc_html($result['model']); ?>).</p>
            </div>
            <div style="background:#fff;border:1px solid #dcdcde;border-radius:8px;padding:18px;margin-top:8px">
              <h2 style="margin-top:0"><?php echo esc_html($result['title']); ?></h2>
              <div style="font-size:16px;line-height:1.9"><?php echo wp_kses_post($result['body']); ?></div>
            </div>
          <?php endif; ?>
        </div>

        <div style="flex:1;min-width:260px">
          <div style="background:#fff;border:1px solid #dcdcde;border-radius:8px;padding:16px">
            <h2 style="margin-top:0;font-size:15px">Usage &amp; cost</h2>
            <?php if ($usage && !isset($usage['error'])): ?>
              <p style="font-size:26px;font-weight:700;margin:6px 0">₹<?php echo esc_html(number_format($usage['cost_inr'] ?? 0, 2)); ?></p>
              <p style="color:#646970;margin:0"><?php echo intval($usage['total_articles'] ?? 0); ?> articles ·
                 <?php echo intval($usage['input_tokens'] ?? 0); ?> in / <?php echo intval($usage['output_tokens'] ?? 0); ?> out tokens</p>
              <p style="color:#646970;margin-top:12px;font-size:12px">Typical ~₹0.30 / article. Server-to-server; key never leaves WordPress.</p>
            <?php else: ?>
              <p style="color:#646970">Connect the API to see usage.</p>
            <?php endif; ?>
          </div>
        </div>
      </div>
    </div>
    <?php
}

/* --------------------------------------------------------------- API glue */
function pag_generate_and_draft($base, $key, $topic, $lang) {
    $resp = wp_remote_post($base . '/api/v1/generate/', [
        'timeout' => 90,
        'headers' => ['Authorization' => 'Api-Key ' . $key, 'Content-Type' => 'application/json'],
        'body'    => wp_json_encode(['topic' => $topic, 'language' => $lang]),
    ]);
    if (is_wp_error($resp)) { return ['error' => 'API request failed: ' . $resp->get_error_message()]; }
    $code = wp_remote_retrieve_response_code($resp);
    $data = json_decode(wp_remote_retrieve_body($resp), true);
    if ($code !== 200 || !is_array($data)) {
        $msg = is_array($data) && isset($data['error']) ? (is_string($data['error']) ? $data['error'] : 'error') : ('HTTP ' . $code);
        return ['error' => 'Generation failed: ' . $msg];
    }
    $title = $data['title'] ?: $topic;
    $body  = $data['body'] ?: '';
    $post_id = wp_insert_post([
        'post_title'   => wp_strip_all_tags($title),
        'post_content' => wp_kses_post($body),
        'post_status'  => 'draft',
        'post_type'    => 'post',
        'post_excerpt' => sanitize_text_field($data['summary'] ?? ''),
    ], true);
    if (is_wp_error($post_id)) { return ['error' => 'Draft insert failed: ' . $post_id->get_error_message()]; }
    $u = $data['usage'] ?? [];
    return [
        'title' => $title, 'body' => $body,
        'edit_link' => get_edit_post_link($post_id, 'raw'),
        'cost_inr' => floatval($u['cost_inr'] ?? 0),
        'input_tokens' => intval($u['input_tokens'] ?? 0),
        'output_tokens' => intval($u['output_tokens'] ?? 0),
        'model' => $u['model'] ?? 'gemini-2.5-flash',
    ];
}

function pag_fetch_usage($base, $key) {
    $resp = wp_remote_get($base . '/api/v1/usage/', [
        'timeout' => 20,
        'headers' => ['Authorization' => 'Api-Key ' . $key],
    ]);
    if (is_wp_error($resp)) { return ['error' => $resp->get_error_message()]; }
    $data = json_decode(wp_remote_retrieve_body($resp), true);
    return is_array($data) ? $data : ['error' => 'bad response'];
}
