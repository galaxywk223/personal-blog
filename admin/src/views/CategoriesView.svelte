<script lang="ts">
  import { api } from "../lib/api";

  const {
    categories,
    categoryUsage,
    reload,
  }: {
    categories: string[];
    categoryUsage: Record<string, number>;
    reload: () => Promise<void>;
  } = $props();

  let newName = $state("");
  let addStatus = $state("");
  let addError = $state("");
  let error = $state("");

  async function addCategory(e: SubmitEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    addError = "";
    addStatus = "";
    try {
      await api("/api/admin/project-categories", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      newName = "";
      addStatus = "已添加";
      await reload();
    } catch (e) {
      addError = (e as Error).message;
    }
  }

  async function moveCategory(name: string, direction: "up" | "down") {
    try {
      await api("/api/admin/project-categories/reorder", {
        method: "POST",
        body: JSON.stringify({ name, direction }),
      });
      await reload();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function renameCategory(from: string) {
    const to = prompt(`将分类「${from}」重命名为`, from);
    if (!to) return;
    const trimmed = to.trim();
    if (!trimmed || trimmed === from) return;
    try {
      const result = await api<{ updatedProjects?: number }>(
        "/api/admin/project-categories/rename",
        { method: "POST", body: JSON.stringify({ from, to: trimmed }) }
      );
      await reload();
      if (result.updatedProjects) {
        alert(`已同步更新 ${result.updatedProjects} 个项目。`);
      }
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function deleteCategory(name: string) {
    if (!confirm(`确认删除分类「${name}」？`)) return;
    try {
      await api("/api/admin/project-categories/delete", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      await reload();
    } catch (e) {
      error = (e as Error).message;
    }
  }
</script>

<div class="view">
  <h1 class="page-title">项目分类</h1>
  <p class="page-desc">分类用于项目页的横向筛选导航，顺序即显示顺序。最长 24 个字符。</p>

  {#if error}
    <div class="alert error">{error}</div>
  {/if}

  <div class="category-list">
    {#if categories.length > 0}
      {#each categories as cat, index}
        <div class="category-row">
          <span class="category-name">
            <strong>{cat}</strong>
            <small>{categoryUsage[cat] ?? 0} 个项目</small>
          </span>
          <span class="category-actions">
            <button
              class="text-btn"
              onclick={() => moveCategory(cat, "up")}
              disabled={index === 0}
            >上移</button>
            <button
              class="text-btn"
              onclick={() => moveCategory(cat, "down")}
              disabled={index === categories.length - 1}
            >下移</button>
            <button class="text-btn" onclick={() => renameCategory(cat)}>重命名</button>
            <button
              class="text-btn danger"
              onclick={() => deleteCategory(cat)}
              disabled={(categoryUsage[cat] ?? 0) > 0}
              title={(categoryUsage[cat] ?? 0) > 0 ? "有项目使用此分类，无法删除" : undefined}
            >删除</button>
          </span>
        </div>
      {/each}
    {:else}
      <p class="empty">还没有分类，先添加一个。</p>
    {/if}
  </div>

  <form class="add-form" onsubmit={addCategory}>
    <div class="add-row">
      <label class="field grow">
        <span>新分类名称</span>
        <input bind:value={newName} maxlength="24" placeholder="例如：Web、工具、研究" required />
      </label>
      <button class="button primary add-btn" type="submit">添加</button>
    </div>
    {#if addStatus}
      <span class="status-msg success">{addStatus}</span>
    {/if}
    {#if addError}
      <span class="status-msg error">{addError}</span>
    {/if}
  </form>
</div>

<style>
  .view { display: flex; flex-direction: column; gap: 1.5rem; }

  .page-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text-heading);
  }

  .page-desc {
    margin: -1rem 0 0;
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .alert {
    padding: 0.6rem 0.75rem;
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
    background: var(--color-danger-tint);
    color: var(--color-danger);
  }

  .category-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .category-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem 1rem;
    border-bottom: 1px solid var(--color-border-muted);
    background: var(--color-surface-raised);
    transition: background 0.1s;
  }

  .category-row:last-child { border-bottom: none; }
  .category-row:hover { background: color-mix(in oklch, var(--color-accent) 4%, var(--color-surface-raised)); }

  .category-name {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .category-name strong {
    font-size: 0.9375rem;
    color: var(--color-text-heading);
  }

  .category-name small {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .category-actions {
    display: flex;
    gap: 0.4rem;
    flex-shrink: 0;
  }

  .text-btn {
    background: none;
    border: none;
    color: var(--color-accent);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    padding: 0.2rem 0.35rem;
    border-radius: var(--radius-sm);
    transition: background 0.1s;
  }

  .text-btn:hover:not(:disabled) { background: var(--color-accent-muted); }
  .text-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .text-btn.danger { color: var(--color-danger); }
  .text-btn.danger:hover:not(:disabled) { background: var(--color-danger-tint); }

  .empty {
    padding: 1.5rem 1rem;
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .add-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.25rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-raised);
  }

  .add-row {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
  }

  .field.grow { flex: 1; }

  .field > span {
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
    font-size: 0.9375rem;
  }

  .field input:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
    border-color: var(--color-accent);
  }

  .button {
    padding: 0.55rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface-base);
    color: var(--color-text);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .button.primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-accent-text);
  }

  .button.primary:hover { filter: brightness(1.06); }

  .add-btn { align-self: flex-end; }

  .status-msg { font-size: 0.8125rem; }
  .status-msg.success { color: var(--color-success); }
  .status-msg.error { color: var(--color-danger); }
</style>
