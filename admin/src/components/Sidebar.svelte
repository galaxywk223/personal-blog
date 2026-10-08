<script lang="ts">
  import { api } from "../lib/api";

  const {
    view,
    navigate,
    username,
  }: {
    view: string;
    navigate: (v: string) => void;
    username: string;
  } = $props();

  const navItems = [
    { id: "posts", label: "文章", icon: "✍" },
    { id: "projects", label: "项目", icon: "◈" },
    { id: "logs", label: "日志", icon: "◎" },
    { id: "categories", label: "项目分类", icon: "⊞" },
    { id: "settings", label: "站点设置", icon: "⚙" },
    { id: "users", label: "账号管理", icon: "♙" },
    { id: "password", label: "修改密码", icon: "⌘" },
  ];

  const activeSection = $derived(
    view === "post-editor" ? "posts" :
    view === "project-editor" ? "projects" :
    view === "log-editor" ? "logs" :
    view
  );

  async function logout() {
    await api("/api/admin/session", { method: "DELETE" });
    window.location.reload();
  }

  // Theme toggle
  const themes = ["auto", "light", "dark"] as const;
  type Theme = typeof themes[number];
  const themeLabels: Record<Theme, string> = { auto: "跟随系统", light: "浅色", dark: "深色" };

  function getTheme(): Theme {
    const t = localStorage.getItem("theme") as Theme | null;
    return themes.includes(t!) ? t! : "auto";
  }

  let currentTheme = $state<Theme>(getTheme());

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

<aside class="sidebar">
  <div class="sidebar-header">
    <a href="/" class="sidebar-brand" target="_blank" rel="noopener">
      <img src="/images/branding/k-logo.png" alt="" aria-hidden="true" width="24" height="24" />
      <span>KaiLog</span>
    </a>
  </div>

  <nav class="sidebar-nav" aria-label="管理导航">
    {#each navItems as item}
      <button
        type="button"
        class="sidebar-nav-item"
        class:active={activeSection === item.id}
        aria-current={activeSection === item.id ? "page" : undefined}
        onclick={() => navigate(item.id)}
      >
        <span class="nav-icon" aria-hidden="true">{item.icon}</span>
        <span>{item.label}</span>
      </button>
    {/each}
  </nav>

  <div class="sidebar-footer">
    <span class="sidebar-user">{username}</span>
    <div class="sidebar-bottom">
      <button type="button" class="sidebar-meta-btn" onclick={cycleTheme}>
        {themeLabels[currentTheme]}
      </button>
      <button type="button" class="sidebar-meta-btn danger" onclick={logout}>
        退出
      </button>
    </div>
  </div>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    width: var(--sidebar-width);
    flex-shrink: 0;
    min-height: 100dvh;
    border-right: 1px solid var(--color-border);
    background: var(--color-surface-raised);
  }

  .sidebar-header {
    padding: 1.1rem 1rem 0.9rem;
    border-bottom: 1px solid var(--color-border-muted);
  }

  .sidebar-brand {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-text-heading);
    text-decoration: none;
    letter-spacing: 0.02em;
  }

  .sidebar-brand:hover {
    color: var(--color-accent);
  }

  .sidebar-brand img {
    border-radius: var(--radius-sm);
  }

  .sidebar-nav {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0.75rem 0.5rem;
  }

  .sidebar-nav-item {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    font-size: 0.9rem;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
  }

  .sidebar-nav-item:hover {
    background: var(--color-accent-muted);
    color: var(--color-text);
  }

  .sidebar-nav-item.active {
    background: color-mix(in oklch, var(--color-accent) 14%, var(--color-surface-raised));
    color: var(--color-accent);
    font-weight: 600;
  }

  .sidebar-nav-item:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }

  .nav-icon {
    font-size: 1rem;
    line-height: 1;
    width: 1.25rem;
    text-align: center;
    flex-shrink: 0;
  }

  .sidebar-footer {
    padding: 0.75rem 0.5rem 1rem;
    border-top: 1px solid var(--color-border-muted);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .sidebar-bottom {
    display: flex;
    gap: 0.35rem;
  }

  .sidebar-meta-btn {
    flex: 1;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--color-border-muted);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    font-size: 0.8rem;
    cursor: pointer;
    transition: color 0.12s ease, background 0.12s ease;
  }

  .sidebar-meta-btn:hover {
    background: var(--color-accent-muted);
    color: var(--color-text);
  }

  .sidebar-meta-btn.danger:hover {
    background: var(--color-danger-tint);
    color: var(--color-danger);
    border-color: var(--color-danger);
  }

  @media (max-width: 768px) {
    .sidebar {
      width: 100%;
      min-height: unset;
      border-right: none;
      border-bottom: 1px solid var(--color-border);
    }

    .sidebar-nav {
      flex-direction: row;
      flex-wrap: nowrap;
      overflow-x: auto;
      padding: 0.4rem 0.5rem;
      gap: 2px;
      scrollbar-width: none;
    }

    .sidebar-nav::-webkit-scrollbar {
      display: none;
    }

    .sidebar-nav-item {
      flex-shrink: 0;
      padding: 0.5rem 0.75rem;
    }

    .nav-icon {
      display: none;
    }

    .sidebar-footer {
      display: none;
    }
  }
</style>
