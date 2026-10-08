# KaiLog

KaiLog 是一个基于 Astro、Svelte 和 PostgreSQL 的个人技术与项目记录站点。公开页面保留文章、日志、项目、关于和搜索入口；管理端只提供这些公开内容所需的编辑能力。

## 数据模型

PostgreSQL 是内容源。博客使用独立的 `blog` schema，与 Waline 评论数据隔离。

- `blog.content_entries`：文章、项目、日志和关于内容的 Markdown 正文与 Frontmatter。
- `blog.site_settings`：站点标题、首页文字、页脚署名等公开资料。
- `blog.project_categories`：项目筛选分类及显示顺序。
- `blog.migration_runs`：迁移来源哈希和执行记录。

图片不进入管理端数据模型。现有 Logo 和项目封面继续作为静态资源保留，数据库只保存内容中的资源路径。

## 开发环境

```powershell
npm install
Copy-Item .env.example .env
npm run db:migrate
npm run dev
```

`DATABASE_URL` 指向 PostgreSQL 数据库。首次迁移读取现有 `src/content/` 和 `src/data/site-settings.json`，以幂等方式写入数据库。管理端写入和本地启动脚本均要求配置 `DATABASE_URL`。

构建流程会把数据库内容生成到 `.generated/`，再交给 Astro 内容集合和 Pagefind。`.generated/` 是构建产物，不应提交到 Git。

本地服务地址：

- 博客：`http://127.0.0.1:4321/`
- 管理端：`http://127.0.0.1:4322/admin/`

也可以使用根目录的 `启动博客.cmd` 和 `停止博客.cmd`。

## 管理端

管理端使用 PostgreSQL 多管理员账号登录，所有管理员权限相同。`ADMIN_SESSION_SECRET` 用于会话，首次初始化需要 `ADMIN_INITIAL_USERNAME` 和 `ADMIN_PASSWORD_HASH`，已有账号不会被环境配置覆盖。

```powershell
npm run admin:users
```

账号名支持 3–32 位英文字母、数字、下划线、点和连字符，自动转为小写。新增和重置密码至少 12 个字符。初始化直接复用密码哈希；账号不包含在内容快照、静态站点或 `db:export` 中。

账号管理支持新增、启用、停用和重置其他管理员密码；修改自己的密码需要原密码。账号停用或密码变更立即使既有会话失效，不能停用当前账号或最后一个有效管理员。不开放注册，不支持账号重命名或删除。

功能范围如下：

- 文章编辑、发布、草稿和删除
- 项目编辑、状态、链接和删除
- 日志编辑、删除和同日期排序
- 项目分类新增、重命名、排序和删除
- 公开站点资料编辑
- 管理员账号管理与修改密码

保存内容后会在后台排队执行静态构建。管理端不提供概览统计、构建历史、手动构建、媒体库、上传图片或首页封面管理。

## Docker

复制 `.env.example` 为 `.env`，填写数据库密码、Waline 配置和管理员认证后运行：

```powershell
docker compose up -d --build
```

生产环境使用 `docker/compose.prod.yml`。站点容器提供静态文件和 Waline 反向代理，管理端容器连接同一 PostgreSQL 实例中的 `blog` schema。

### 已有主机级 Caddy

`docker/compose.host.yml` 适用于已有主机 HTTPS 入口的部署。`docker/host.env.example` 包含所需配置，实际配置保存在根目录 `.env`。站点仅暴露回环 HTTP 端口，主机 Caddy 反向代理该端口并负责证书；管理端、数据库和评论服务不映射公网端口。

首次部署必须在启动管理端前恢复真实数据库或显式导入示例内容。PostgreSQL 18 数据卷挂载到 `/var/lib/postgresql`。容器启动只初始化结构、检查初始账号和构建，不重新导入 Markdown，因此重启不会覆盖数据库编辑。

`scripts/backup-production.sh` 备份博客与评论数据库、配置及媒体。默认备份目录为 `/opt/backups/personal-blog`，文件采用限制权限，保留最近七天。完整备份包含管理员密码哈希，不进入 Git 或公开存储。

## 数据迁移与备份

```powershell
npm run db:migrate
npm run db:sync
npm run db:export -- backup.json
```

迁移脚本会对文章、项目、日志和设置执行幂等写入，并检查数据库记录数量。正式迁移前应备份 PostgreSQL 数据库；Waline 备份脚本仍为 `scripts/backup-waline.ps1`。

## 检查

```powershell
npm run check
npm run admin:build
npm run build
npm run format:check
git diff --check
```

仓库不应提交 `.env`、构建目录、`.generated/`、运行日志或管理员密码。
