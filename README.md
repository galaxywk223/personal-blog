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

## 管理员账号

管理端使用 PostgreSQL 多管理员账号，所有管理员权限相同，不开放注册。首次配置 `.env` 的 `ADMIN_INITIAL_USERNAME` 和 `ADMIN_PASSWORD_HASH` 后执行：

```powershell
npm run admin:users
```

初始化仅在账号表为空时创建首个账号，重复执行不会覆盖密码。已有账号的登录认证来自数据库，环境变量不作为登录后备凭据。账号名为 3–32 位英文字母、数字、点、下划线或连字符，统一小写。新增和重置密码至少 12 个字符。

账号管理支持创建、启用、停用和重置其他管理员密码；修改自己的密码需要原密码。当前账号和最后一个有效管理员不能被停用。停用和密码变更立即使既有 Session 失效，账号操作不触发博客构建。

账号和密码哈希不进入内容导出、静态快照或公开仓库。完整数据库备份应私密保存。

## 认证集成测试

`AUTH_TEST_DATABASE_URL` 必须指向没有 `blog` 表的隔离 PostgreSQL 数据库。测试只创建测试账号，不接触正式配置。

```powershell
$env:AUTH_TEST_DATABASE_URL = 'postgresql://test-user:test-password@127.0.0.1:5432/kailog_auth_test'
node tests/admin-auth.mjs
```
