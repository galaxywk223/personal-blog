<script lang="ts">
  import "./styles/global.css";
  import { api, setCsrf } from "./lib/api";
  import Sidebar from "./components/Sidebar.svelte";
  import PostsView from "./views/PostsView.svelte";
  import EditorView from "./views/EditorView.svelte";
  import CategoriesView from "./views/CategoriesView.svelte";
  import SettingsView from "./views/SettingsView.svelte";
  import LoginView from "./views/LoginView.svelte";
  import UsersView from "./views/UsersView.svelte";
  import PasswordView from "./views/PasswordView.svelte";

  type View = "posts" | "projects" | "logs" | "post-editor" | "project-editor" | "log-editor" | "categories" | "settings" | "users" | "password";

  let loggedIn = $state(false);
  let currentUser = $state<{id: string; username: string} | null>(null);
  let view = $state<View>("posts");
  let editingItem = $state<Record<string, unknown> | null>(null);

  let posts = $state<unknown[]>([]);
  let projects = $state<unknown[]>([]);
  let logs = $state<unknown[]>([]);
  let settings = $state<Record<string, unknown>>({});
  let categories = $state<string[]>([]);
  let categoryUsage = $state<Record<string, number>>({});

  async function onLogin(csrf: string) {
    setCsrf(csrf);
    const me = await api<{user: {id: string; username: string}}>("/api/admin/me");
    currentUser = me.user;
    await loadAll();
    loggedIn = true;
  }

  async function loadAll() {
    const [p, pr, l, s, tax] = await Promise.all([
      api<unknown[]>("/api/admin/posts"),
      api<unknown[]>("/api/admin/projects"),
      api<unknown[]>("/api/admin/logs"),
      api<Record<string, unknown>>("/api/admin/settings"),
      api<{ categories?: string[]; usage?: Record<string, number> }>("/api/admin/project-categories"),
    ]);
    posts = p;
    projects = pr;
    logs = l;
    settings = s;
    categories = tax.categories ?? [];
    categoryUsage = tax.usage ?? {};
  }

  function navigate(v: View, item: Record<string, unknown> | null = null) {
    view = v;
    editingItem = item;
  }

  // Check session on mount
  $effect(() => {
    api<{ csrf?: string; user: {id: string; username: string} }>("/api/admin/me")
      .then((r) => {
        if (r.csrf) setCsrf(r.csrf);
        currentUser = r.user;
        return loadAll();
      })
      .then(() => { loggedIn = true; })
      .catch(() => { loggedIn = false; });
  });
</script>

{#if !loggedIn}
  <LoginView {onLogin} />
{:else}
  <div class="admin-layout">
    <Sidebar {view} {navigate} username={currentUser?.username ?? ""} />
    <main class="admin-main">
      {#if view === "posts"}
        <PostsView kind="posts" items={posts} {navigate} reload={loadAll} />
      {:else if view === "projects"}
        <PostsView kind="projects" items={projects} {navigate} reload={loadAll} />
      {:else if view === "logs"}
        <PostsView kind="logs" items={logs} {navigate} reload={loadAll} />
      {:else if view === "post-editor"}
        <EditorView kind="posts" item={editingItem} {navigate} reload={loadAll} {categories} />
      {:else if view === "project-editor"}
        <EditorView kind="projects" item={editingItem} {navigate} reload={loadAll} {categories} />
      {:else if view === "log-editor"}
        <EditorView kind="logs" item={editingItem} {navigate} reload={loadAll} {categories} />
      {:else if view === "categories"}
        <CategoriesView {categories} {categoryUsage} reload={loadAll} />
      {:else if view === "settings"}
        <SettingsView {settings} reload={loadAll} />
      {:else if view === "users"}
        <UsersView currentId={currentUser?.id ?? ""} />
      {:else if view === "password"}
        <PasswordView onChanged={() => { setCsrf(""); currentUser = null; loggedIn = false; view = "posts"; }} />
      {/if}
    </main>
  </div>
{/if}

<style>
  .admin-layout {
    display: flex;
    min-height: 100dvh;
  }

  .admin-main {
    flex: 1 1 0;
    min-width: 0;
    padding: 2rem 2.5rem;
    overflow-y: auto;
  }

  @media (max-width: 768px) {
    .admin-layout {
      flex-direction: column;
    }

    .admin-main {
      padding: 1.25rem 1rem;
    }
  }
</style>
