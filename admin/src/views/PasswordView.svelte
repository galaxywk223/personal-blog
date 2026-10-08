<script lang="ts">
  import { api } from "../lib/api";
  const { onChanged }: {onChanged: () => void} = $props();
  let oldPassword = $state("");
  let password = $state("");
  let confirmation = $state("");
  let error = $state("");
  let busy = $state(false);
  async function submit(event: SubmitEvent) {
    event.preventDefault(); error="";
    if (password !== confirmation) { error="两次新密码不一致"; return; }
    busy=true;
    try { await api("/api/admin/password", {method:"PUT",body:JSON.stringify({oldPassword,password})}); oldPassword=""; password=""; confirmation=""; onChanged(); }
    catch(e) { error=(e as Error).message; } finally { busy=false; }
  }
</script>
<section class="accounts-view">
  <h1>修改密码</h1>
  <p class="muted">新密码至少 12 个字符，保存后需要重新登录。</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <form onsubmit={submit} class="account-form">
    <label>原密码<input type="password" autocomplete="current-password" bind:value={oldPassword} required /></label>
    <label>新密码<input type="password" autocomplete="new-password" bind:value={password} required minlength="12" /></label>
    <label>确认新密码<input type="password" autocomplete="new-password" bind:value={confirmation} required minlength="12" /></label>
    <button type="submit" disabled={busy}>{busy ? "保存中…" : "保存密码"}</button>
  </form>
</section>
