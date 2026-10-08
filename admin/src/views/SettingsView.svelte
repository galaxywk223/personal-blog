<script lang="ts">
  import { api, waitForBuild } from "../lib/api";

  const { settings, reload }: { settings: Record<string, unknown>; reload: () => Promise<void> } = $props();
  type Site = { title?: string; navbarTitle?: string; subtitle?: string };
  type Home = { eyebrow?: string; title?: string; description?: string; quote?: string };
  type Footer = { copyrightName?: string };
  const site = $derived((settings.site ?? {}) as Site);
  const home = $derived((settings.home ?? {}) as Home);
  const footer = $derived((settings.footer ?? {}) as Footer);
  let saving = $state(false);
  let statusMsg = $state("");
  let error = $state("");

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault(); saving = true; statusMsg = ""; error = "";
    const raw = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement));
    const data: Record<string, Record<string, string>> = {};
    for (const [key, value] of Object.entries(raw)) { const [section, field] = key.split("."); (data[section] ||= {})[field] = String(value); }
    try { const result = await api<{ build?: { id?: string } }>("/api/admin/settings", { method: "PUT", body: JSON.stringify(data) }); await waitForBuild(result.build ?? null); statusMsg = "已保存"; await reload(); }
    catch (e) { error = (e as Error).message; }
    finally { saving = false; }
  }
</script>

<div class="view">
  <h1 class="page-title">站点资料</h1>
  <p class="page-desc">管理公开页面实际使用的站点名称、首页文字和页脚署名。</p>
  {#if error}<div class="alert error">{error}</div>{/if}
  <form class="settings-form" onsubmit={handleSubmit}>
    <fieldset class="settings-group">
      <legend>站点信息</legend>
      <div class="form-grid">
        <label class="field"><span>导航栏名称</span><input name="site.navbarTitle" value={site.navbarTitle ?? ""} required /></label>
        <label class="field"><span>站点标题</span><input name="site.title" value={site.title ?? ""} required /></label>
        <label class="field wide"><span>站点副标题</span><input name="site.subtitle" value={site.subtitle ?? ""} /></label>
      </div>
    </fieldset>
    <fieldset class="settings-group">
      <legend>首页文字</legend>
      <div class="form-grid">
        <label class="field"><span>眉题</span><input name="home.eyebrow" value={home.eyebrow ?? ""} /></label>
        <label class="field"><span>主标题</span><input name="home.title" value={home.title ?? ""} required /></label>
        <label class="field wide"><span>首页描述</span><textarea name="home.description" rows="3">{home.description ?? ""}</textarea></label>
        <label class="field wide"><span>页脚引语</span><input name="home.quote" value={home.quote ?? ""} /></label>
      </div>
    </fieldset>
    <fieldset class="settings-group">
      <legend>页脚信息</legend>
      <label class="field"><span>版权署名</span><input name="footer.copyrightName" value={footer.copyrightName ?? ""} required /></label>
    </fieldset>
    <div class="form-actions"><button class="button primary" type="submit" disabled={saving}>{saving ? "保存中…" : "保存并构建"}</button>{#if statusMsg}<span class="status-msg">{statusMsg}</span>{/if}</div>
  </form>
</div>

<style>
  .view { display:flex; flex-direction:column; gap:1.5rem; } .page-title { margin:0; font-size:1.5rem; color:var(--color-text-heading); } .page-desc { margin:-1rem 0 0; color:var(--color-text-muted); }
  .alert { padding:.6rem .75rem; border-radius:var(--radius-sm); font-size:.875rem; } .alert.error { background:var(--color-danger-tint); color:var(--color-danger); }
  .settings-form { display:flex; flex-direction:column; gap:1.25rem; } .settings-group { border:1px solid var(--color-border); border-radius:var(--radius-md); padding:1.25rem; background:var(--color-surface-raised); margin:0; } .settings-group legend { padding:0 .5rem; font-size:.8125rem; font-weight:700; color:var(--color-text-muted); letter-spacing:.06em; } .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-top:.75rem; } .field { display:flex; flex-direction:column; gap:.3rem; min-width:0; } .field > span { font-size:.8125rem; font-weight:600; color:var(--color-text-muted); } .field input,.field textarea { padding:.55rem .7rem; border:1px solid var(--color-border); border-radius:var(--radius-sm); background:var(--color-surface-base); color:var(--color-text); } .field textarea { resize:vertical; } .wide { grid-column:1 / -1; } .form-actions { display:flex; align-items:center; gap:.75rem; } .button { padding:.5rem 1rem; border:1px solid var(--color-border); border-radius:var(--radius-sm); background:var(--color-surface-base); color:var(--color-text); font-weight:500; } .button.primary { background:var(--color-accent); border-color:var(--color-accent); color:var(--color-accent-text); } .button:disabled { opacity:.55; } .status-msg { color:var(--color-success); font-size:.875rem; }
  @media (max-width:640px) { .form-grid { grid-template-columns:1fr; } }
</style>
