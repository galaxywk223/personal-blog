<script lang="ts">
  import { api, waitForBuild } from "../lib/api";

  const {
    kind,
    items,
    navigate,
    reload,
  }: {
    kind: "posts" | "projects" | "logs";
    items: unknown[];
    navigate: (v: string, item?: unknown) => void;
    reload: () => Promise<void>;
  } = $props();

  type Post = { id: string; title: string; draft?: boolean; published?: string; updated?: string; category?: string };
  type Project = { id: string; title: string; category?: string; status?: string; published?: string; updated?: string };
  type Log = { id: string; date: string; title: string };

  const statusLabels: Record<string, string> = {
    planned: "计划中", "in-progress": "进行中", active: "进行中",
    completed: "已完成", archived: "已归档",
  };

  let error = $state("");

  async function editItem(id: string) {
    try {
      const item = await api(`/api/admin/${kind}/${encodeURIComponent(id)}`);
      navigate(`${kind.replace(/s$/, "")}-editor`, item);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("确认删除？文件会先移动到回收目录。")) return;
    try {
      const result = await api<{ build?: { id?: string; status?: string } }>(
        `/api/admin/${kind}/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      await waitForBuild(result.build ?? null);
      await reload();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function moveLog(id: string, direction: "up" | "down") {
    try {
      const result = await api<{ build?: { id?: string; status?: string } }>(
        "/api/admin/logs/reorder",
        { method: "POST", body: JSON.stringify({ id, direction }) }
      );
      await waitForBuild(result.build ?? null);
      await reload();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  const editorView = $derived(
    kind === "posts" ? "post-editor" :
    kind === "projects" ? "project-editor" : "log-editor"
  );

  const newLabel = $derived(
    kind === "posts" ? "新建文章" :
    kind === "projects" ? "新建项目" : "新建日志"
  );

  const titleLabel = $derived(
    kind === "posts" ? "文章" :
    kind === "projects" ? "项目" : "日志"
  );
</script>

<div class="view">
  <div class="view-header">
    <h1 class="page-title">{titleLabel}列表</h1>
    <button class="button primary" onclick={() => navigate(editorView, null)}>
      {newLabel}
    </button>
  </div>

  {#if error}
    <div class="alert error">{error}</div>
  {/if}

  <div class="table-wrap">
    <table>
      {#if kind === "logs"}
        <thead>
          <tr>
            <th>日期</th>
            <th>标题</th>
            <th>排序</th>
            <th class="actions-col">操作</th>
          </tr>
        </thead>
        <tbody>
          {#each items as item, index}
            {@const log = item as Log}
            {@const logs = items as Log[]}
            <tr>
              <td class="mono">{log.date}</td>
              <td>
                <strong>{log.title}</strong>
                <small class="item-id">{log.id}</small>
              </td>
              <td class="reorder-cell">
                <button
                  class="text-btn"
                  onclick={() => moveLog(log.id, "up")}
                  disabled={index === 0 || log.date !== logs[index - 1]?.date}
                >上移</button>
                <button
                  class="text-btn"
                  onclick={() => moveLog(log.id, "down")}
                  disabled={index === items.length - 1 || log.date !== logs[index + 1]?.date}
                >下移</button>
              </td>
              <td class="actions-cell">
                <button class="text-btn" onclick={() => editItem(log.id)}>编辑</button>
                <button class="text-btn danger" onclick={() => deleteItem(log.id)}>删除</button>
              </td>
            </tr>
          {/each}
          {#if items.length === 0}
            <tr><td colspan="4" class="empty">暂无日志</td></tr>
          {/if}
        </tbody>
      {:else if kind === "posts"}
        <thead>
          <tr>
            <th>标题</th>
            <th>状态</th>
            <th>更新时间</th>
            <th class="actions-col">操作</th>
          </tr>
        </thead>
        <tbody>
          {#each items as item}
            {@const post = item as Post}
            <tr>
              <td>
                <strong>{post.title}</strong>
                <small class="item-id">{post.id}</small>
              </td>
              <td>
                <span class="status-tag" class:draft={post.draft}>
                  {post.draft ? "草稿" : "已发布"}
                </span>
              </td>
              <td class="mono muted">{post.updated ?? post.published ?? ""}</td>
              <td class="actions-cell">
                <button class="text-btn" onclick={() => editItem(post.id)}>编辑</button>
                <button class="text-btn danger" onclick={() => deleteItem(post.id)}>删除</button>
              </td>
            </tr>
          {/each}
          {#if items.length === 0}
            <tr><td colspan="4" class="empty">暂无文章</td></tr>
          {/if}
        </tbody>
      {:else}
        <thead>
          <tr>
            <th>标题</th>
            <th>分类</th>
            <th>进度</th>
            <th>更新时间</th>
            <th class="actions-col">操作</th>
          </tr>
        </thead>
        <tbody>
          {#each items as item}
            {@const proj = item as Project}
            <tr>
              <td>
                <strong>{proj.title}</strong>
                <small class="item-id">{proj.id}</small>
              </td>
              <td class="muted">{proj.category ?? "未分类"}</td>
              <td>
                <span class="status-tag" data-status={proj.status ?? "planned"}>
                  {statusLabels[proj.status ?? ""] ?? "未知"}
                </span>
              </td>
              <td class="mono muted">{proj.updated ?? proj.published ?? ""}</td>
              <td class="actions-cell">
                <button class="text-btn" onclick={() => editItem(proj.id)}>编辑</button>
                <button class="text-btn danger" onclick={() => deleteItem(proj.id)}>删除</button>
              </td>
            </tr>
          {/each}
          {#if items.length === 0}
            <tr><td colspan="5" class="empty">暂无项目</td></tr>
          {/if}
        </tbody>
      {/if}
    </table>
  </div>
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
    white-space: nowrap;
    transition: background 0.12s, border-color 0.12s;
  }

  .button.primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-accent-text);
  }

  .button.primary:hover { filter: brightness(1.06); }

  .alert {
    padding: 0.6rem 0.75rem;
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
  }

  .alert.error {
    background: var(--color-danger-tint);
    color: var(--color-danger);
  }

  .table-wrap {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  thead {
    position: sticky;
    top: 0;
    background: var(--color-surface-raised);
    z-index: 1;
  }

  th {
    padding: 0.7rem 1rem;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-muted);
    font-size: 0.8rem;
    font-weight: 600;
    text-align: left;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border-muted);
    color: var(--color-text);
    vertical-align: middle;
  }

  tr:last-child td { border-bottom: none; }
  tr:hover td { background: color-mix(in oklch, var(--color-accent) 4%, transparent); }

  strong { display: block; font-weight: 600; color: var(--color-text-heading); }

  small.item-id {
    display: block;
    margin-top: 2px;
    color: var(--color-text-muted);
    font-size: 0.75rem;
    font-weight: 400;
  }

  .mono { font-variant-numeric: tabular-nums; font-size: 0.8125rem; }
  .muted { color: var(--color-text-muted); }

  .status-tag {
    display: inline-flex;
    padding: 0.15rem 0.5rem;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 600;
    background: var(--color-accent-muted);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .status-tag.draft {
    background: var(--color-warning-tint);
    color: var(--color-warning);
  }

  .status-tag[data-status="in-progress"],
  .status-tag[data-status="active"] {
    background: color-mix(in oklch, var(--color-accent) 16%, var(--color-surface-raised));
    color: var(--color-accent);
  }

  .status-tag[data-status="completed"] {
    background: var(--color-success-tint);
    color: var(--color-success);
  }

  .actions-col { width: 9rem; }

  .actions-cell {
    display: flex;
    gap: 0.5rem;
    white-space: nowrap;
  }

  .reorder-cell {
    display: flex;
    gap: 0.4rem;
    white-space: nowrap;
  }

  .text-btn {
    background: none;
    border: none;
    color: var(--color-accent);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    padding: 0.15rem 0.25rem;
    border-radius: 3px;
    transition: background 0.1s, color 0.1s;
  }

  .text-btn:hover { background: var(--color-accent-muted); }
  .text-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .text-btn.danger { color: var(--color-danger); }
  .text-btn.danger:hover { background: var(--color-danger-tint); }

  .empty {
    padding: 2rem;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    text-align: center;
  }
</style>
