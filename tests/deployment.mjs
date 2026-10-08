import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes, scryptSync } from "node:crypto";
import { join } from "node:path";
import { Pool } from "pg";
import { ensureSchema, importSnapshot } from "../lib/content-db.mjs";

// Run inside a disposable runtime container, without production output/media mounts.
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
assert.ok(databaseUrl, "AUTH_TEST_DATABASE_URL is required");
assert.notEqual(databaseUrl, process.env.DATABASE_URL, "Production database must not be used");
const pool = new Pool({ connectionString: databaseUrl });
const username = "deployment-test";
const password = randomBytes(16).toString("hex");
const salt = randomBytes(16).toString("hex");
const hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
const env = {
	...process.env,
	DATABASE_URL: databaseUrl,
	ADMIN_INITIAL_USERNAME: username,
	ADMIN_PASSWORD_HASH: hash,
	ADMIN_SESSION_SECRET: randomBytes(32).toString("hex"),
	ADMIN_PORT: "45435",
	NODE_ENV: "development",
};
const outputRoot = env.BLOG_BUILD_ROOT;
assert.ok(outputRoot && outputRoot.endsWith("/test-build"), "Isolated output root is required");
let server;
let output = "";
async function stopServer() {
	if (server && server.exitCode === null) {
		const exit = once(server, "exit");
		server.kill();
		await exit;
	}
}
try {
	assert.equal(
		(await pool.query("SELECT 1 FROM information_schema.tables WHERE table_schema='blog'"))
			.rowCount,
		0,
	);
	await ensureSchema(pool);
	await importSnapshot(
		{
			entries: [
				{
					kind: "posts",
					slug: "deploy-fixture",
					data: {
						title: "Deployment fixture",
						published: "2026-01-01",
						description: "Integration fixture",
						tags: [],
						category: "example",
						draft: false,
					},
					body: "Initial database body",
				},
			],
			settings: {
				site: { title: "Fixture", navbarTitle: "Fixture", subtitle: "Fixture" },
				profile: { name: "Fixture", avatar: "", bio: "Fixture", links: [] },
				home: {
					title: "Fixture",
					eyebrow: "Fixture",
					description: "Fixture",
					quote: "Fixture",
					heroImage: "",
				},
				footer: { copyrightName: "Fixture" },
				projects: { categories: [] },
			},
		},
		pool,
	);
	await mkdir("src/content/posts", { recursive: true });
	await writeFile(
		"src/content/posts/deploy-fixture.md",
		"---\ntitle: Stale legacy fixture\npublished: 2026-01-01\n---\nLegacy body must never be imported\n",
	);
	execFileSync(process.execPath, ["scripts/admin-users.mjs"], { env, stdio: "pipe" });
	server = spawn(process.execPath, ["admin/server.mjs"], {
		env,
		stdio: ["ignore", "pipe", "pipe"],
	});
	server.stdout.on("data", (chunk) => {
		output += chunk;
	});
	server.stderr.on("data", (chunk) => {
		output += chunk;
	});
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch("http://127.0.0.1:45435/admin/")).ok) break;
		} catch {}
		if (server.exitCode !== null) throw new Error(output);
		await new Promise((r) => setTimeout(r, 100));
	}
	const login = await fetch("http://127.0.0.1:45435/api/admin/login", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ username, password }),
	});
	assert.equal(login.status, 200);
	const cookie = login.headers.get("set-cookie").split(";")[0];
	const { csrf } = await login.json();
	const headers = { "content-type": "application/json", cookie, "x-csrf-token": csrf };
	const save = await fetch("http://127.0.0.1:45435/api/admin/posts/deploy-fixture", {
		method: "PUT",
		headers,
		body: JSON.stringify({ body: "deployment-saved-body" }),
	});
	assert.equal(save.status, 200);
	let { build } = await save.json();
	const deadline = Date.now() + 240000;
	while (["queued", "running"].includes(build.status)) {
		assert.ok(Date.now() < deadline, "Build timed out");
		await new Promise((r) => setTimeout(r, 1000));
		build = await (
			await fetch(`http://127.0.0.1:45435/api/admin/builds/${build.id}`, { headers })
		).json();
	}
	assert.equal(build.status, "success", build.error);
	assert.ok(
		(await readFile(join(outputRoot, "dist/blog/deploy-fixture/index.html"), "utf8")).includes(
			"deployment-saved-body",
		),
	);
	await stopServer();
	execFileSync(process.execPath, ["scripts/admin-users.mjs"], { env, stdio: "pipe" });
	execFileSync(process.execPath, ["scripts/build.mjs"], { env, stdio: "pipe", timeout: 240000 });
	assert.equal(
		(
			await pool.query(
				"SELECT body FROM blog.content_entries WHERE kind='posts' AND slug='deploy-fixture'",
			)
		).rows[0].body,
		"deployment-saved-body",
	);
	assert.ok(
		(await readFile(join(outputRoot, "dist/blog/deploy-fixture/index.html"), "utf8")).includes(
			"deployment-saved-body",
		),
	);
	console.log(
		"PASS: authenticated save rebuilds the isolated site; restart preserves database edits despite stale legacy Markdown.",
	);
} finally {
	await stopServer();
	await pool.end();
}
