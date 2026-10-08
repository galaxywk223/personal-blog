<script lang="ts">
  import { api } from "../lib/api";
  const { currentId }: { currentId: string } = $props();
  type User = {id: string; username: string; enabled: boolean};
  let users = $state<User[]>([]);
  let username = $state("");
  let password = $state("");
  let error = $state("");
  let status = $state("");
  let busy = $state(false);
  let resetId = $state("");
  let resetPassword = $state("");
  async function reload() { users = await api<User[]>("/api/admin/users"); }
  $effect(() => { reload().catch(e => { error = e.message; }); });
  async function run(action: () => Promise<void>) {
    busy = true; error = ""; status = "";
    try { await action(); await reload(); status = "已保存"; }
    catch (e) { error = (e as Error).message; } finally { busy = false; }
  }
  function create(event: SubmitEvent) {
    event.preventDefault();
    return run(async () => { await api("/api/admin/users", {method:"POST", body:JSON.stringify({username,password})}); username=""; password=""; });
  }
  function toggle(user: User) {
    if (!confirm(`确认${user.enabled ? "停用" : "启用"}账号「${user.username}」？`)) return;
    return run(async () => { await api(`/api/admin/users/${user.id}/status`, {method:"PUT",body:JSON.stringify({enabled:!user.enabled})}); });
  }
  function reset(event: SubmitEvent) {
    event.preventDefault();
    if (!confirm("确认重置该账号密码？其现有登录会话将失效。")) return;
    return run(async () => { await api(`/api/admin/users/${resetId}/password`, {method:"PUT",body:JSON.stringify({password:resetPassword})}); resetId=""; resetPassword=""; });
  }
</script>

<section class="accounts-view">
  <h1>账号管理</h1>
  <p class="muted">所有管理员权限相同。当前账号不能停用。</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if status}<p role="status">{status}</p>{/if}
  <div class="account-table-wrap">
    <table><thead><tr><th>账号</th><th>状态</th><th>操作</th></tr></thead><tbody>
      {#each users as user (user.id)}
        <tr><td>{user.username}{user.id === currentId ? "（当前）" : ""}</td><td>{user.enabled ? "启用" : "停用"}</td><td>
          <button disabled={busy || user.id === currentId} onclick={() => toggle(user)}>{user.enabled ? "停用" : "启用"}</button>
          <button disabled={busy || user.id === currentId} onclick={() => { resetId=user.id; resetPassword=""; }}>重置密码</button>
        </td></tr>
      {/each}
    </tbody></table>
  </div>
  <form onsubmit={create} class="account-form">
    <h2>新增管理员</h2>
    <label>账号<input autocomplete="off" bind:value={username} required minlength="3" maxlength="32" pattern={"[A-Za-z0-9_.\\-]{3,32}"} /></label>
    <label>密码<input type="password" autocomplete="new-password" bind:value={password} required minlength="12" /></label>
    <button type="submit" disabled={busy}>创建账号</button>
  </form>
  {#if resetId}
    <form onsubmit={reset} class="account-form">
      <h2>重置 {users.find(user => user.id === resetId)?.username} 的密码</h2>
      <label>新密码<input type="password" autocomplete="new-password" bind:value={resetPassword} required minlength="12" /></label>
      <div><button type="submit" disabled={busy}>确认重置</button><button type="button" disabled={busy} onclick={() => { resetId=""; resetPassword=""; }}>取消</button></div>
    </form>
  {/if}
</section>
