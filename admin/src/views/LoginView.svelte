<script lang="ts">
  import { api, setCsrf } from "../lib/api";

  const { onLogin } = $props<{ onLogin: (csrf: string) => Promise<void> }>();

  let username = $state("");
  let password = $state("");
  let error = $state("");
  let submitting = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitting = true;
    error = "";
    try {
      const result = await api<{ csrf: string }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setCsrf(result.csrf);
      await onLogin(result.csrf);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      submitting = false;
    }
  }

  // Theme toggle (lightweight inline)
  const themes = ["auto", "light", "dark"] as const;
  type Theme = typeof themes[number];
  const themeLabels: Record<Theme, string> = { auto: "跟随系统", light: "浅色", dark: "深色" };
  let currentTheme = $state<Theme>((localStorage.getItem("theme") as Theme) || "auto");

  function cycleTheme() {
    const next = themes[(themes.indexOf(currentTheme) + 1) % themes.length];
    currentTheme = next;
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle(
      "dark",
      next === "dark" || (next === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches)
    );
  }
</script>

<main class="auth-shell">
  <section class="auth-card">
    <img src="/images/branding/k-logo.png" alt="" aria-hidden="true" width="40" height="40" class="auth-logo" />
    <p class="page-kicker">KaiLog</p>
    <h1>管理后台</h1>
    <p class="muted">管理文章、项目、日志和公开站点资料。</p>

    {#if error}
      <div class="alert error">{error}</div>
    {/if}

    <form onsubmit={submit}>
      <label class="field">
        <span>管理员账号</span>
        <input name="username" autocomplete="username" bind:value={username} required minlength="3" maxlength="32" />
      </label>
      <label class="field">
        <span>管理员密码</span>
        <input
          name="password"
          type="password"
          autocomplete="current-password"
          bind:value={password}
          required
        />
      </label>
      <button class="button primary" type="submit" disabled={submitting}>
        {submitting ? "登录中…" : "登录管理后台"}
      </button>
    </form>

    <div class="auth-actions">
      <a href="/">返回博客</a>
      <button type="button" class="text-button" onclick={cycleTheme}>
        {themeLabels[currentTheme]}
      </button>
    </div>
  </section>
</main>

<style>
  .auth-shell {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    background: var(--color-surface-base);
  }

  .auth-card {
    width: min(100%, 22rem);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: 2.5rem 2rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface-raised);
    text-align: center;
  }

  .auth-logo {
    border-radius: var(--radius-sm);
    margin-bottom: 0.5rem;
  }

  .page-kicker {
    margin: 0;
    color: var(--color-accent);
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text-heading);
  }

  .muted {
    margin: 0.25rem 0 1.25rem;
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    text-align: left;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .field input {
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface-base);
    color: var(--color-text);
    font-size: 0.95rem;
    font-weight: 400;
  }

  .field input:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
    border-color: var(--color-accent);
  }

  .button {
    width: 100%;
    padding: 0.6rem 0.9rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface-base);
    color: var(--color-text);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease;
  }

  .button.primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-accent-text);
  }

  .button.primary:hover:not(:disabled) {
    filter: brightness(1.05);
  }

  .button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .alert {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border-radius: var(--radius-sm);
    font-size: 0.85rem;
    text-align: left;
  }

  .alert.error {
    background: var(--color-danger-tint);
    color: var(--color-danger);
    border: 1px solid color-mix(in oklch, var(--color-danger) 30%, transparent);
  }

  .auth-actions {
    margin-top: 1rem;
    display: flex;
    gap: 1rem;
    font-size: 0.8125rem;
  }

  .auth-actions a {
    color: var(--color-text-muted);
    text-decoration: none;
  }

  .auth-actions a:hover {
    color: var(--color-accent);
  }

  .text-button {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 0.8125rem;
    cursor: pointer;
    padding: 0;
  }

  .text-button:hover {
    color: var(--color-accent);
  }
</style>
