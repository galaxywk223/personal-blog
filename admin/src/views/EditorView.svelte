<script lang="ts">
  import { api, waitForBuild } from "../lib/api";

  const {
    kind,
    item,
    navigate,
    reload,
    categories,
  }: {
    kind: "posts" | "projects" | "logs";
    item: Record<string, unknown> | null;
    navigate: (v: string) => void;
    reload: () => Promise<void>;
    categories: string[];
  } = $props();

  const projectStatuses = [
    { value: "planned", label: "计划中" },
    { value: "in-progress", label: "进行中" },
    { value: "completed", label: "已完成" },
    { value: "archived", label: "已归档" },
  ];

  const backView = $derived(
    kind === "posts" ? "posts" :
    kind === "projects" ? "projects" : "logs"
  );

  const editingLabel = $derived(item?.id ? "编辑" : "新建");
  const kindLabel = $derived(
    kind === "posts" ? "文章" :
    kind === "projects" ? "项目" : "日志"
  );

  // Form fields
  let id = $state(String(item?.id ?? ""));
  let title = $state(String(item?.title ?? ""));
  let published = $state(String(item?.published ?? new Date().toISOString().slice(0, 10)));
  let description = $state(String(item?.description ?? ""));
  let tags = $state((item?.tags as string[] | undefined)?.join(", ") ?? "");
  let category = $state(String(item?.category ?? (kind === "projects" ? categories[0] ?? "" : "未分类")));
  let status = $state(String(item?.status ?? "in-progress"));
  let url = $state(String(item?.url ?? ""));
  let repository = $state(String(item?.repository ?? ""));
  let body = $state(String(item?.body ?? ""));
  let draft = $state(Boolean(item?.draft));
  let date = $state(String(item?.date ?? ""));

  let saving = $state(false);
  let statusMsg = $state("");
  let error = $state("");

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    saving = true;
    statusMsg = "";
    error = "";

    let data: Record<string, unknown>;
    if (kind === "logs") {
      data = { id, title, date };
    } else {
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
      if (kind === "posts") {
        data = { id, title, published, description, tags: tagList, category, body, draft };
      } else {
        data = { id, title, published, description, tags: tagList, category, status, url, repository, body };
      }
    }

    try {
      const endpoint = `/api/admin/${kind}${item?.id ? `/${encodeURIComponent(item.id as string)}` : ""}`;
      const result = await api<{ build?: { id?: string; status?: string } }>(endpoint, {
        method: item?.id ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      await waitForBuild(result.build ?? null);
      statusMsg = "保存成功";
      navigate(backView);
      await reload();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  async function handleDelete() {
    if (!item?.id || !confirm("确认删除？文件会先移动到回收目录。")) return;
    try {
      const result = await api<{ build?: { id?: string; status?: string } }>(
        `/api/admin/${kind}/${encodeURIComponent(item.id as string)}`,
        { method: "DELETE" }
      );
      await waitForBuild(result.build ?? null);
      navigate(backView);
      await reload();
    } catch (e) {
      error = (e as Error).message;
    }
  }

</script>

<div class="view">
  <div class="view-header">
    <h1 class="page-title">{editingLabel}{kindLabel}</h1>
    <button class="button" onclick={() => navigate(backView)}>← 返回列表</button>
  </div>

  {#if error}
    <div class="alert error">{error}</div>
  {/if}

  <form class="editor-form" onsubmit={handleSubmit}>
    {#if kind === "logs"}
      <div class="form-grid">
        <label class="field">
          <span>页面标识</span>
          <input bind:value={id} name="id" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            readonly={Boolean(item?.id)} placeholder="kebab-case" />
        </label>
        <label class="field">
          <span>日期</span>
          <input bind:value={date} name="date" required
            placeholder="YYYY、YYYY-MM 或 YYYY-MM-DD"
            pattern="\d{4}(?:-\d{2})?(?:-\d{2})?" />
        </label>
        <label class="field wide">
          <span>标题</span>
          <input bind:value={title} name="title" required />
        </label>
      </div>
    {:else}
      <div class="form-grid">
        <label class="field">
          <span>页面标识</span>
          <input bind:value={id} name="id" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            readonly={Boolean(item?.id)} placeholder="kebab-case" />
        </label>
        <label class="field">
          <span>标题</span>
          <input bind:value={title} name="title" required />
        </label>
        <label class="field">
          <span>发布日期</span>
          <input bind:value={published} name="published" type="date" required />
        </label>
        {#if kind === "posts"}
          <label class="field">
            <span>分类</span>
            <input bind:value={category} name="category" />
          </label>
        {:else}
          <label class="field">
            <span>分类</span>
            <select bind:value={category} name="category">
              {#each categories as cat}
                <option value={cat}>{cat}</option>
              {/each}
            </select>
          </label>
          <label class="field">
            <span>进度</span>
            <select bind:value={status} name="status">
              {#each projectStatuses as s}
                <option value={s.value}>{s.label}</option>
              {/each}
            </select>
          </label>
          <label class="field">
            <span>项目链接</span>
            <input bind:value={url} name="url" type="url" placeholder="https://" />
          </label>
          <label class="field">
            <span>代码仓库链接</span>
            <input bind:value={repository} name="repository" type="url" placeholder="https://github.com/..." />
          </label>
        {/if}
        <label class="field wide">
          <span>简介</span>
          <input bind:value={description} name="description" />
        </label>
        <label class="field wide">
          <span>标签 <small>（逗号分隔）</small></span>
          <input bind:value={tags} name="tags" placeholder="tag1, tag2, tag3" />
        </label>
        {#if kind === "posts"}
          <label class="field wide check-field">
            <input type="checkbox" bind:checked={draft} name="draft" />
            <span>保存为草稿</span>
          </label>
        {/if}
      </div>

      <label class="field body-field">
        <span>正文内容</span>
        <textarea bind:value={body} name="body" rows="20" spellcheck="false"></textarea>
      </label>
    {/if}

    <div class="form-actions">
      <button class="button primary" type="submit" disabled={saving}>
        {saving ? "保存中…" : "保存并构建"}
      </button>
      {#if item?.id}
        <button class="button danger" type="button" onclick={handleDelete}>删除</button>
      {/if}
      {#if statusMsg}
        <span class="status-msg">{statusMsg}</span>
      {/if}
    </div>
  </form>
</div>

<style>
  .view { display: flex; flex-direction: column; gap: 1.5rem; }

  .view-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .page-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text-heading);
  }

  .button {
    padding: 0.5rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface-base);
    color: var(--color-text);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
    white-space: nowrap;
  }

  .button:hover:not(:disabled) {
    background: var(--color-accent-muted);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .button.primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-accent-text);
  }

  .button.primary:hover:not(:disabled) { filter: brightness(1.06); }
  .button.danger {
    border-color: var(--color-danger);
    color: var(--color-danger);
  }

  .button.danger:hover:not(:disabled) {
    background: var(--color-danger-tint);
  }

  .button:disabled { opacity: 0.55; cursor: not-allowed; }

  .alert {
    padding: 0.6rem 0.75rem;
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
  }

  .alert.error {
    background: var(--color-danger-tint);
    color: var(--color-danger);
  }

  .editor-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
  }

  .field > span,

  .field small { font-weight: 400; opacity: 0.8; }

  .field input,
  .field select,
  .field textarea {
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface-raised);
    color: var(--color-text);
    font-size: 0.9375rem;
    transition: border-color 0.12s;
  }

  .field input:focus-visible,
  .field select:focus-visible,
  .field textarea:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
    border-color: var(--color-accent);
  }

  .field input[readonly] {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .wide { grid-column: 1 / -1; }

  .check-field {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  .check-field input[type="checkbox"] {
    width: 1rem;
    height: 1rem;
    padding: 0;
    accent-color: var(--color-accent);
  }

  .body-field textarea {
    resize: vertical;
    font-family: "JetBrains Mono Variable", ui-monospace, monospace;
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .form-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .status-msg {
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

</style>
