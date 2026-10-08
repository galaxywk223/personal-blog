import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { loginAttempt } from "../lib/login-limit.mjs";
import {
	closePool,
	getPool,
	hasDatabase,
	readDatabaseSnapshot,
	readLegacySnapshot,
	ensureSchema,
	serializeFrontmatter,
} from "../lib/content-db.mjs";

const root = process.env.BLOG_ROOT ? normalize(process.env.BLOG_ROOT) : process.cwd();
const adminRoot = fileURLToPath(new URL("./public", import.meta.url));
const publicRoot = join(root, "public");
const contentRoot = join(root, "src", "content");
const settingsPath = join(root, "src", "data", "site-settings.json");
const port = Number(process.env.ADMIN_PORT || 4322);
const sessionSecret = process.env.ADMIN_SESSION_SECRET;
const sessions = new Map();
const loginAttempts = new Map();
const builds = new Map();
let buildPromise = null;
const projectStatuses = ["planned", "in-progress", "completed", "archived"];
const usernamePattern = /^[a-z0-9_.-]{3,32}$/;
const send = (res, status, payload, headers = {}) => {
	const body = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
	res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
	res.end(body);
};

function safeSlug(value) {
	return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : null;
}
function passwordHash(password, salt = randomBytes(16).toString("hex")) {
	return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}
function normalizeUsername(value) {
	return String(value || "")
		.trim()
		.toLowerCase();
}
function verifyPassword(password, configured) {
	if (typeof configured !== "string" || !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(configured))
		return false;
	const [, salt, digest] = configured.split("$");
	if (!salt || !digest) return false;
	const actual = scryptSync(password, salt, 64);
	const expected = Buffer.from(digest, "hex");
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function validatePassword(password, allowExisting = false) {
	return (
		typeof password === "string" && (allowExisting ? password.length > 0 : password.length >= 12)
	);
}
function cookieValue(req, name) {
	for (const cookie of String(req.headers.cookie || "").split(";")) {
		const [key, ...parts] = cookie.trim().split("=");
		if (key === name) return decodeURIComponent(parts.join("="));
	}
	return "";
}
async function sessionFrom(req) {
	const token = cookieValue(req, "blog_admin_session");
	const session = sessions.get(token);
	if (!session || session.expires < Date.now()) {
		if (token) sessions.delete(token);
		return null;
	}
	if (hasDatabase()) {
		const result = await getPool().query(
			"SELECT id, username, enabled, credential_version FROM blog.admin_users WHERE id = $1",
			[session.userId],
		);
		const user = result.rows[0];
		if (!user || !user.enabled || user.credential_version !== session.credentialVersion) {
			sessions.delete(token);
			return null;
		}
		return { token, ...session, user };
	}
	return { token, ...session };
}
async function requireSession(req, res) {
	const session = await sessionFrom(req);
	if (!session) {
		send(res, 401, { error: "未登录" });
		return null;
	}
	if (
		req.method !== "GET" &&
		req.method !== "HEAD" &&
		req.headers["x-csrf-token"] !== session.csrf
	) {
		send(res, 403, { error: "CSRF 校验失败" });
		return null;
	}
	return session;
}
async function requestJson(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > 2 * 1024 * 1024) {
			const error = new Error("请求体过大");
			error.status = 413;
			throw error;
		}
		chunks.push(chunk);
	}
	const body = Buffer.concat(chunks);
	try {
		const input = body.length ? JSON.parse(body.toString("utf8")) : {};
		if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
		return input;
	} catch {
		const error = new Error("请求格式无效");
		error.status = 400;
		throw error;
	}
}
function requireDatabase(res) {
	if (hasDatabase()) return true;
	send(res, 503, { error: "管理端写入需要配置 DATABASE_URL" });
	return false;
}

function normalizeSettings(settings = {}) {
	const source = settings && typeof settings === "object" ? settings : {};
	const site = source.site || {};
	const profile = source.profile || {};
	const home = source.home || {};
	const footer = source.footer || {};
	const projects = source.projects || {};
	const categories = Array.isArray(projects.categories)
		? [...new Set(projects.categories.map((value) => String(value).trim()).filter(Boolean))]
		: [];
	return {
		site: {
			...site,
			title: site.title || "KaiLog",
			navbarTitle: site.navbarTitle || "KaiLog",
			subtitle: String(site.subtitle || ""),
		},
		profile: {
			...profile,
			name: profile.name || "",
			bio: String(profile.bio || ""),
			links: Array.isArray(profile.links) ? profile.links : [],
		},
		home: {
			...home,
			eyebrow: String(home.eyebrow || ""),
			title: home.title || "",
			description: String(home.description || ""),
			quote: String(home.quote || ""),
		},
		footer: { ...footer, copyrightName: footer.copyrightName || "" },
		projects: { ...projects, categories },
	};
}
async function loadSnapshot() {
	return hasDatabase() ? readDatabaseSnapshot() : readLegacySnapshot();
}
async function listContent(kind) {
	const snapshot = await loadSnapshot();
	return snapshot.entries
		.filter((entry) => entry.kind === kind)
		.map((entry) => ({ id: entry.slug, ...entry.data, body: entry.body }))
		.sort(
			(a, b) =>
				String(b.published || b.date || "").localeCompare(String(a.published || a.date || "")) ||
				Number(a.order || 0) - Number(b.order || 0),
		);
}
async function getEntry(kind, slug) {
	const snapshot = await loadSnapshot();
	const entry = snapshot.entries.find((item) => item.kind === kind && item.slug === slug);
	return entry ? { id: entry.slug, ...entry.data, body: entry.body } : null;
}
async function writeLegacyEntry(kind, slug, data, body) {
	const dir = join(contentRoot, kind);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, `${slug}.md`), serializeFrontmatter(data, body), "utf8");
}
async function writeEntry(kind, slug, data, body) {
	if (!hasDatabase()) return writeLegacyEntry(kind, slug, data, body);
	await getPool().query(
		`INSERT INTO blog.content_entries (kind, slug, title, body, frontmatter, sort_order) VALUES ($1, $2, $3, $4, $5::jsonb, $6) ON CONFLICT (kind, slug) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, frontmatter = EXCLUDED.frontmatter, sort_order = EXCLUDED.sort_order, updated_at = now()`,
		[
			kind,
			slug,
			String(data.title || ""),
			body || "",
			JSON.stringify(data),
			Number(data.order || 0),
		],
	);
}
async function deleteEntry(kind, slug) {
	if (!hasDatabase()) {
		const file = join(contentRoot, kind, `${slug}.md`);
		if (!existsSync(file)) return false;
		await rename(file, `${file}.deleted-${Date.now()}`);
		return true;
	}
	return (
		(
			await getPool().query(`DELETE FROM blog.content_entries WHERE kind = $1 AND slug = $2`, [
				kind,
				slug,
			])
		).rowCount > 0
	);
}
async function loadSettings() {
	return normalizeSettings((await loadSnapshot()).settings);
}
async function saveSettings(settings) {
	const normalized = normalizeSettings(settings);
	if (!hasDatabase()) {
		await mkdir(join(settingsPath, ".."), { recursive: true });
		await writeFile(settingsPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
		return normalized;
	}
	const pool = getPool();
	for (const [key, value] of Object.entries(normalized))
		if (key !== "projects")
			await pool.query(
				`INSERT INTO blog.site_settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
				[key, JSON.stringify(value)],
			);
	await pool.query(`DELETE FROM blog.project_categories`);
	for (const [position, name] of normalized.projects.categories.entries())
		await pool.query(`INSERT INTO blog.project_categories (name, position) VALUES ($1, $2)`, [
			name,
			position,
		]);
	return normalized;
}
async function queueBuild(reason = "内容更新") {
	const id = randomBytes(8).toString("hex");
	const record = { id, reason, status: "queued", startedAt: null, finishedAt: null, error: null };
	builds.set(id, record);
	const run = async () => {
		record.status = "running";
		record.startedAt = new Date().toISOString();
		try {
			const npm = process.platform === "win32" ? "npm.cmd" : "npm";
			await new Promise((resolve, reject) => {
				const child = spawn(npm, ["run", "build"], {
					cwd: root,
					env: process.env,
					stdio: "pipe",
					shell: process.platform === "win32",
				});
				let output = "";
				child.stdout.on("data", (chunk) => {
					output += chunk;
				});
				child.stderr.on("data", (chunk) => {
					output += chunk;
				});
				child.on("error", reject);
				child.on("close", (code) =>
					code === 0 ? resolve() : reject(new Error(output.slice(-4000))),
				);
			});
			record.status = "success";
		} catch (error) {
			record.status = "failed";
			record.error = error.message;
		} finally {
			record.finishedAt = new Date().toISOString();
		}
	};
	buildPromise = buildPromise ? buildPromise.then(run, run) : run();
	buildPromise.catch(() => {});
	return record;
}
async function changedResponse(kind, slug, reason) {
	return {
		...(await getEntry(kind, slug)),
		build: await queueBuild(reason),
		commit: {
			committed: false,
			changed: true,
			source: hasDatabase() ? "database" : "legacy-bootstrap",
		},
	};
}

function invalidateUserSessions(userId) {
	for (const [token, session] of sessions)
		if (String(session.userId) === String(userId)) sessions.delete(token);
}

async function handleUsers(req, res, url, session) {
	if (url.pathname === "/api/admin/users" && req.method === "GET") {
		const result = await getPool().query(
			"SELECT id, username, enabled, created_at, updated_at FROM blog.admin_users ORDER BY id",
		);
		return send(res, 200, result.rows);
	}
	if (url.pathname === "/api/admin/users" && req.method === "POST") {
		const { username: rawUsername, password } = await requestJson(req);
		const username = normalizeUsername(rawUsername);
		if (!usernamePattern.test(username) || !validatePassword(password))
			return send(res, 400, {
				error: "账号为 3–32 位英文字母、数字、点、下划线或连字符；密码至少 12 个字符",
			});
		try {
			const result = await getPool().query(
				"INSERT INTO blog.admin_users (username, password_hash) VALUES ($1, $2) RETURNING id, username, enabled",
				[username, passwordHash(password)],
			);
			return send(res, 201, result.rows[0]);
		} catch (error) {
			if (error.code === "23505") return send(res, 409, { error: "账号已存在" });
			throw error;
		}
	}
	if (url.pathname === "/api/admin/password" && req.method === "PUT") {
		const { oldPassword, password } = await requestJson(req);
		if (!validatePassword(password) || !validatePassword(oldPassword, true))
			return send(res, 400, { error: "请输入原密码，新密码至少 12 个字符" });
		const client = await getPool().connect();
		try {
			await client.query("BEGIN");
			const { rows } = await client.query(
				"SELECT password_hash FROM blog.admin_users WHERE id = $1 FOR UPDATE",
				[session.user.id],
			);
			if (!verifyPassword(oldPassword, rows[0].password_hash)) {
				await client.query("ROLLBACK");
				return send(res, 400, { error: "原密码错误" });
			}
			await client.query(
				"UPDATE blog.admin_users SET password_hash = $1, credential_version = credential_version + 1, updated_at = now() WHERE id = $2",
				[passwordHash(password), session.user.id],
			);
			await client.query("COMMIT");
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
		invalidateUserSessions(session.user.id);
		return send(res, 200, { ok: true });
	}
	const match = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/(status|password)$/);
	if (match && req.method === "PUT") {
		const id = match[1];
		const action = match[2];
		const input = await requestJson(req);
		if (action === "password") {
			if (String(session.user.id) === id)
				return send(res, 400, { error: "请通过修改密码入口更改自己的密码" });
			if (!validatePassword(input.password))
				return send(res, 400, { error: "新密码至少 12 个字符" });
			const result = await getPool().query(
				"UPDATE blog.admin_users SET password_hash = $1, credential_version = credential_version + 1, updated_at = now() WHERE id = $2 RETURNING id",
				[passwordHash(input.password), id],
			);
			if (!result.rowCount) return send(res, 404, { error: "账号不存在" });
		} else {
			if (typeof input.enabled !== "boolean") return send(res, 400, { error: "启用状态无效" });
			if (!input.enabled && String(session.user.id) === id)
				return send(res, 400, { error: "不能停用当前账号" });
			const client = await getPool().connect();
			try {
				await client.query("BEGIN");
				await client.query("LOCK TABLE blog.admin_users IN EXCLUSIVE MODE");
				const { rows } = await client.query(
					"SELECT id, enabled FROM blog.admin_users WHERE id = $1",
					[id],
				);
				if (!rows.length) {
					await client.query("ROLLBACK");
					return send(res, 404, { error: "账号不存在" });
				}
				const count = await client.query(
					"SELECT count(*)::int AS count FROM blog.admin_users WHERE enabled",
				);
				if (!input.enabled && rows[0].enabled && count.rows[0].count <= 1) {
					await client.query("ROLLBACK");
					return send(res, 400, { error: "不能停用最后一个有效管理员" });
				}
				await client.query(
					"UPDATE blog.admin_users SET enabled = $1, credential_version = credential_version + 1, updated_at = now() WHERE id = $2",
					[input.enabled, id],
				);
				await client.query("COMMIT");
			} catch (error) {
				await client.query("ROLLBACK");
				throw error;
			} finally {
				client.release();
			}
		}
		invalidateUserSessions(id);
		return send(res, 200, { ok: true });
	}
	return send(res, 404, { error: "接口不存在" });
}

async function handleApi(req, res, url) {
	if (url.pathname === "/api/admin/login" && req.method === "POST") {
		const ip = req.socket.remoteAddress || "unknown";
		const attempt = loginAttempt(loginAttempts, ip);
		if (attempt.count >= 5) return send(res, 429, { error: "登录尝试过于频繁" });
		const { username: rawUsername, password } = await requestJson(req);
		const username = normalizeUsername(rawUsername);
		if (!hasDatabase()) return send(res, 503, { error: "管理员登录需要数据库" });
		const result = await getPool().query(
			"SELECT id, username, password_hash, enabled, credential_version FROM blog.admin_users WHERE username = $1",
			[username],
		);
		const user = result.rows[0];
		if (
			!usernamePattern.test(username) ||
			!validatePassword(password, true) ||
			!user ||
			!user.enabled ||
			!verifyPassword(password, user.password_hash)
		) {
			attempt.count += 1;
			loginAttempts.set(ip, attempt);
			return send(res, 401, { error: "账号或密码错误" });
		}
		loginAttempts.delete(ip);
		if (!sessionSecret) return send(res, 500, { error: "ADMIN_SESSION_SECRET 未配置" });
		const token = randomBytes(32).toString("hex");
		const csrf = createHmac("sha256", sessionSecret).update(token).digest("hex");
		sessions.set(token, {
			csrf,
			expires: Date.now() + 8 * 60 * 60 * 1000,
			userId: user.id,
			credentialVersion: user.credential_version,
		});
		return send(
			res,
			200,
			{ csrf, user: { id: user.id, username: user.username } },
			{
				"set-cookie": `blog_admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
			},
		);
	}
	if (url.pathname === "/api/admin/session" && req.method === "DELETE") {
		const session = await requireSession(req, res);
		if (!session) return;
		if (session) sessions.delete(session.token);
		return send(
			res,
			200,
			{ ok: true },
			{ "set-cookie": "blog_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" },
		);
	}
	const session = await requireSession(req, res);
	if (!session) return;
	if (!hasDatabase() && !["GET", "HEAD"].includes(req.method)) return requireDatabase(res);
	if (url.pathname.startsWith("/api/admin/users") || url.pathname === "/api/admin/password")
		return handleUsers(req, res, url, session);
	if (url.pathname === "/api/admin/me" && req.method === "GET")
		return send(res, 200, {
			ok: true,
			csrf: session.csrf,
			user: { id: session.user.id, username: session.user.username },
		});
	if (url.pathname.startsWith("/api/admin/builds/") && req.method === "GET") {
		const build = builds.get(url.pathname.split("/").pop());
		return build ? send(res, 200, build) : send(res, 404, { error: "构建任务不存在" });
	}
	if (url.pathname === "/api/admin/posts" && req.method === "GET")
		return send(res, 200, await listContent("posts"));
	if (url.pathname === "/api/admin/projects" && req.method === "GET")
		return send(res, 200, await listContent("projects"));
	if (url.pathname === "/api/admin/logs" && req.method === "GET")
		return send(res, 200, await listContent("logs"));
	if (url.pathname === "/api/admin/settings" && req.method === "GET")
		return send(res, 200, await loadSettings());
	if (url.pathname === "/api/admin/project-categories" && req.method === "GET") {
		const settings = await loadSettings();
		const projects = await listContent("projects");
		const usage = {};
		for (const project of projects)
			if (project.category) usage[project.category] = (usage[project.category] || 0) + 1;
		return send(res, 200, {
			categories: settings.projects.categories,
			statuses: projectStatuses,
			usage,
		});
	}
	if (url.pathname === "/api/admin/project-categories" && req.method === "POST") {
		const { name } = await requestJson(req);
		const value = String(name || "").trim();
		const settings = await loadSettings();
		if (!value || value.length > 24)
			return send(res, 400, { error: "分类名称不能为空，且不超过 24 个字符" });
		if (settings.projects.categories.includes(value))
			return send(res, 409, { error: "分类已存在" });
		settings.projects.categories.push(value);
		await saveSettings(settings);
		return send(res, 201, { categories: settings.projects.categories, usage: {} });
	}
	if (url.pathname.startsWith("/api/admin/project-categories/") && req.method === "POST") {
		const action = url.pathname.split("/").pop();
		const input = await requestJson(req);
		const settings = await loadSettings();
		let updatedProjects = 0;
		if (action === "rename") {
			const from = String(input.from || "").trim();
			const to = String(input.to || "").trim();
			if (
				!settings.projects.categories.includes(from) ||
				!to ||
				settings.projects.categories.includes(to)
			)
				return send(res, 400, { error: "分类名称无效" });
			settings.projects.categories = settings.projects.categories.map((name) =>
				name === from ? to : name,
			);
			for (const project of await listContent("projects"))
				if (project.category === from) {
					const { id, body, ...data } = project;
					data.category = to;
					await writeEntry("projects", id, data, body);
					updatedProjects += 1;
				}
		} else if (action === "reorder") {
			const index = settings.projects.categories.indexOf(String(input.name || ""));
			const target = input.direction === "up" ? index - 1 : index + 1;
			if (index < 0 || target < 0 || target >= settings.projects.categories.length)
				return send(res, 400, { error: "分类已无法继续移动" });
			[settings.projects.categories[index], settings.projects.categories[target]] = [
				settings.projects.categories[target],
				settings.projects.categories[index],
			];
		} else if (action === "delete") {
			const name = String(input.name || "");
			if ((await listContent("projects")).some((project) => project.category === name))
				return send(res, 409, { error: "该分类下仍有项目" });
			settings.projects.categories = settings.projects.categories.filter((entry) => entry !== name);
		} else return send(res, 404, { error: "接口不存在" });
		await saveSettings(settings);
		return send(res, 200, { categories: settings.projects.categories, usage: {}, updatedProjects });
	}
	if (url.pathname === "/api/admin/settings" && req.method === "PUT") {
		const settings = await loadSettings();
		const patch = await requestJson(req);
		for (const [key, value] of Object.entries(patch))
			settings[key] = { ...(settings[key] || {}), ...(value || {}) };
		await saveSettings(settings);
		return send(res, 200, {
			settings: await loadSettings(),
			build: await queueBuild("站点设置更新"),
		});
	}
	if (url.pathname === "/api/admin/logs/reorder" && req.method === "POST") {
		const { id, direction } = await requestJson(req);
		const target = await getEntry("logs", safeSlug(id));
		if (!target || !["up", "down"].includes(direction))
			return send(res, 400, { error: "排序参数无效" });
		const logs = (await listContent("logs")).filter((log) => log.date === target.date);
		const index = logs.findIndex((log) => log.id === id);
		const next = direction === "up" ? index - 1 : index + 1;
		if (next < 0 || next >= logs.length)
			return send(res, 200, { logs: await listContent("logs"), build: null });
		[logs[index], logs[next]] = [logs[next], logs[index]];
		for (const [order, log] of logs.entries()) {
			const { id: slug, body, ...data } = log;
			data.order = order;
			await writeEntry("logs", slug, data, body);
		}
		return send(res, 200, { logs: await listContent("logs"), build: await queueBuild("日志排序") });
	}
	const match = url.pathname.match(/^\/api\/admin\/(posts|projects|logs)(?:\/([^/]+))?$/);
	if (match) {
		const kind = match[1];
		const id = match[2] ? safeSlug(decodeURIComponent(match[2])) : null;
		if (match[2] && !id) return send(res, 400, { error: "slug 只能使用小写字母、数字和连字符" });
		if (req.method === "GET" && id) {
			const entry = await getEntry(kind, id);
			return entry ? send(res, 200, entry) : send(res, 404, { error: "内容不存在" });
		}
		if (req.method === "DELETE" && id) {
			if (!(await deleteEntry(kind, id))) return send(res, 404, { error: "内容不存在" });
			return send(res, 200, { ok: true, build: await queueBuild(`${kind} 删除`) });
		}
		if (req.method === "POST" || req.method === "PUT") {
			const input = await requestJson(req);
			const existing = id ? await getEntry(kind, id) : null;
			const targetId = id || safeSlug(input.id || input.slug);
			if (!targetId || (req.method === "PUT" && !id))
				return send(res, 400, { error: "slug 无效或缺失" });
			if (req.method === "POST" && existing) return send(res, 409, { error: "slug 已存在" });
			const data = { ...(existing || {}), ...input };
			delete data.id;
			delete data.slug;
			delete data.body;
			if (kind === "posts") {
				data.tags = Array.isArray(data.tags) ? data.tags : [];
				data.draft = Boolean(data.draft);
				data.lang ||= "zh_CN";
			}
			if (kind === "projects") {
				if (data.status === "active") data.status = "in-progress";
				if (!projectStatuses.includes(data.status || "in-progress"))
					return send(res, 400, { error: "项目状态无效" });
				data.status ||= "in-progress";
			}
			await writeEntry(kind, targetId, data, input.body ?? existing?.body ?? "");
			return send(res, 200, await changedResponse(kind, targetId, `${kind} 更新`));
		}
	}
	return send(res, 404, { error: "接口不存在" });
}

async function serveStatic(req, res, url) {
	const isImage = url.pathname.startsWith("/images/");
	let file;
	if (url.pathname === "/favicon.svg") file = join(publicRoot, "favicon.svg");
	else if (isImage) {
		file = normalize(join(publicRoot, decodeURIComponent(url.pathname.slice(1))));
		if (!file.startsWith(`${normalize(publicRoot)}${sep}`))
			return send(res, 404, { error: "资源不存在" });
	} else if (url.pathname.startsWith("/admin"))
		file = join(adminRoot, url.pathname.replace(/^\/admin\/?/, "") || "index.html");
	else return send(res, 404, { error: "Not found" });
	try {
		const info = await stat(file);
		if (!info.isFile()) throw new Error("not file");
		const type = file.endsWith(".css")
			? "text/css"
			: file.endsWith(".js")
				? "text/javascript"
				: file.endsWith(".svg")
					? "image/svg+xml"
					: file.endsWith(".png")
						? "image/png"
						: file.endsWith(".jpg") || file.endsWith(".jpeg")
							? "image/jpeg"
							: "text/html";
		res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
		createReadStream(file).pipe(res);
	} catch {
		if (isImage) return send(res, 404, { error: "资源不存在" });
		res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
		createReadStream(join(adminRoot, "index.html")).pipe(res);
	}
}

const server = createServer(async (req, res) => {
	try {
		const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
		if (url.pathname.startsWith("/api/admin/")) await handleApi(req, res, url);
		else if (
			url.pathname === "/favicon.svg" ||
			url.pathname.startsWith("/admin") ||
			url.pathname.startsWith("/images/")
		)
			await serveStatic(req, res, url);
		else send(res, 404, { error: "Not found" });
	} catch (error) {
		console.error(error);
		send(res, error.status || 500, { error: error.message || "服务器错误" });
	}
});
if (hasDatabase()) await ensureSchema();
server.listen(port, "0.0.0.0", () =>
	console.log(
		`KaiLog admin listening on http://127.0.0.1:${port}/admin/ (${hasDatabase() ? "database" : "legacy bootstrap"})`,
	),
);
process.on("SIGINT", async () => {
	await closePool();
	server.close();
});
process.on("SIGTERM", async () => {
	await closePool();
	server.close();
});
export { passwordHash };
