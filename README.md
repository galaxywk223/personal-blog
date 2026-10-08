# KaiLog

KaiLog 是一个基于 Astro、Svelte 和 PostgreSQL 的个人博客示例项目。公开仓库只包含通用代码、脱敏示例内容和开发配置。

## 数据与隐私

PostgreSQL 是运行时内容源。生产环境的个人文章、日志、站点设置、媒体文件和数据库备份不进入 Git，也不随公开仓库发布。仓库内 `src/content/` 与 `src/data/site-settings.json` 仅为演示数据。

不要提交 `.env`、真实 `DATABASE_URL`、管理员密码、Session Secret、数据库导出文件、运行日志或生产媒体文件。

## 开发

```powershell
npm install
Copy-Item .env.example .env
npm run db:migrate
npm run dev
```

本地地址：

- 博客：`http://127.0.0.1:4321/`
- 管理端：`http://127.0.0.1:4322/admin/`

## 管理端功能

管理端只提供文章、项目、日志、项目分类和公开站点资料管理。媒体库、个人封面、构建历史和手动构建入口不属于公开项目功能。

## 检查

```powershell
npm run check
npm run admin:build
npm run build
npm run format:check
```

## 许可

代码使用 MIT License。生产内容和个人媒体不属于公开仓库授权范围。
