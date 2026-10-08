import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { randomBytes, scryptSync } from "node:crypto";
import { Pool } from "pg";
import { loginAttempt } from "../lib/login-limit.mjs";
import { ensureSchema, readDatabaseSnapshot, canonicalize } from "../lib/content-db.mjs";

// AUTH_TEST_DATABASE_URL must point to a disposable database with no blog schema.
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
assert.ok(databaseUrl, "AUTH_TEST_DATABASE_URL is required");
const pool = new Pool({ connectionString: databaseUrl });
const password = "test-password-1234";
const salt = randomBytes(16).toString("hex");
const hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
let server;
try {
	const tables = await pool.query(
		"SELECT 1 FROM information_schema.tables WHERE table_schema='blog'",
	);
	assert.equal(tables.rowCount, 0, "Test database must have no existing blog schema");
	await ensureSchema(pool);
	const before = canonicalize(await readDatabaseSnapshot(pool));
	const env = {
		...process.env,
		DATABASE_URL: databaseUrl,
		ADMIN_INITIAL_USERNAME: "tester",
		ADMIN_PASSWORD_HASH: hash,
		ADMIN_SESSION_SECRET: randomBytes(32).toString("hex"),
		ADMIN_PORT: "45434",
	};
	execFileSync(process.execPath, ["scripts/admin-users.mjs"], { env, stdio: "pipe" });
	const initial = (await pool.query("SELECT id, password_hash FROM blog.admin_users")).rows[0];
	execFileSync(process.execPath, ["scripts/admin-users.mjs"], {
		env: { ...env, ADMIN_PASSWORD_HASH: "invalid" },
		stdio: "pipe",
	});
	assert.equal(
		(await pool.query("SELECT password_hash FROM blog.admin_users")).rows[0].password_hash,
		initial.password_hash,
	);
	server = spawn(process.execPath, ["admin/server.mjs"], {
		env,
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	server.stdout.on("data", (chunk) => {
		output += chunk;
	});
	server.stderr.on("data", (chunk) => {
		output += chunk;
	});
	for (let tries = 0; tries < 100; tries++) {
		try {
			const response = await fetch("http://127.0.0.1:45434/admin/");
			if (response.ok) break;
		} catch {}
		if (server.exitCode !== null) throw new Error(output);
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	async function call(path, method = "GET", body, auth, csrf = true) {
		const response = await fetch(`http://127.0.0.1:45434/api/admin${path}`, {
			method,
			headers: {
				"content-type": "application/json",
				...(auth ? { cookie: auth.cookie } : {}),
				...(auth && csrf ? { "x-csrf-token": auth.csrf } : {}),
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
		const payload = await response.json();
		return {
			status: response.status,
			payload,
			cookie: response.headers.get("set-cookie")?.split(";")[0],
		};
	}
	async function login(username, secret = password) {
		const r = await call("/login", "POST", { username, password: secret });
		assert.equal(r.status, 200);
		return { cookie: r.cookie, csrf: r.payload.csrf, user: r.payload.user };
	}
	assert.equal((await call("/me")).status, 401);
	assert.equal((await call("/login", "POST", { password })).status, 401);
	assert.equal(
		(await call("/login", "POST", { username: "unknown", password })).payload.error,
		"账号或密码错误",
	);
	assert.equal(
		(await call("/login", "POST", { username: "tester", password: "wrong" })).status,
		401,
	);
	const admin = await login(" TESTER ");
	assert.equal(admin.user.username, "tester");
	assert.equal(
		(await call("/users", "POST", { username: "other", password }, admin, false)).status,
		403,
	);
	assert.equal((await call("/users", "POST", { username: "xy", password }, admin)).status, 400);
	assert.equal(
		(await call("/users", "POST", { username: "other", password: "short" }, admin)).status,
		400,
	);
	const created = await call("/users", "POST", { username: "Other", password }, admin);
	assert.equal(created.status, 201);
	const otherId = created.payload.id;
	assert.equal((await call("/users", "POST", { username: "OTHER", password }, admin)).status, 409);
	const list = await call("/users", "GET", undefined, admin);
	assert.equal(list.payload.length, 2);
	assert.ok(!JSON.stringify(list.payload).includes("password_hash"));
	assert.equal(
		(await call(`/users/${admin.user.id}/status`, "PUT", { enabled: false }, admin)).status,
		400,
	);
	const other = await login("other");
	assert.equal(
		(await call(`/users/${otherId}/status`, "PUT", { enabled: false }, admin)).status,
		200,
	);
	assert.equal((await call("/me", "GET", undefined, other)).status, 401);
	assert.equal((await call("/login", "POST", { username: "other", password })).status, 401);
	assert.equal(
		(await call(`/users/${otherId}/status`, "PUT", { enabled: true }, admin)).status,
		200,
	);
	const other2 = await login("other");
	const replacement = "replacement-password-123";
	assert.equal(
		(await call(`/users/${otherId}/password`, "PUT", { password: replacement }, admin)).status,
		200,
	);
	assert.equal((await call("/me", "GET", undefined, other2)).status, 401);
	await login("other", replacement);
	assert.equal(
		(await call("/password", "PUT", { oldPassword: "wrong", password: replacement }, admin)).status,
		400,
	);
	assert.equal(
		(await call("/password", "PUT", { oldPassword: password, password: replacement }, admin))
			.status,
		200,
	);
	assert.equal((await call("/me", "GET", undefined, admin)).status, 401);
	const admin2 = await login("tester", replacement);
	const ownReset = await call(`/users/${admin2.user.id}/password`, "PUT", { password }, admin2);
	assert.equal(ownReset.status, 400);
	assert.equal((await call("/session", "DELETE", undefined, admin2, false)).status, 403);
	const other3 = await login("other", replacement);
	const concurrent = await Promise.all([
		call(`/users/${otherId}/status`, "PUT", { enabled: false }, admin2),
		call(`/users/${admin2.user.id}/status`, "PUT", { enabled: false }, other3),
	]);
	assert.equal(concurrent.filter((r) => r.status === 200).length, 1);
	assert.equal(
		(await pool.query("SELECT count(*)::int AS count FROM blog.admin_users WHERE enabled")).rows[0]
			.count,
		1,
	);
	const testerEnabled = (
		await pool.query("SELECT enabled FROM blog.admin_users WHERE id=$1", [admin2.user.id])
	).rows[0].enabled;
	const survivor = testerEnabled ? admin2 : other3;
	const disabledId = testerEnabled ? otherId : admin2.user.id;
	assert.equal(
		(await call(`/users/${disabledId}/status`, "PUT", { enabled: true }, survivor)).status,
		200,
	);
	const admin3 = await login("tester", replacement);
	assert.equal((await call("/session", "DELETE", undefined, admin3)).status, 200);
	assert.equal((await call("/me", "GET", undefined, admin3)).status, 401);
	for (let i = 0; i < 5; i++)
		assert.equal(
			(await call("/login", "POST", { username: "tester", password: "wrong" })).status,
			401,
		);
	assert.equal(
		(await call("/login", "POST", { username: "tester", password: replacement })).status,
		429,
	);
	const attempts = new Map([["ip", { count: 5, at: 1000 }]]);
	assert.equal(loginAttempt(attempts, "ip", 60999).count, 5);
	assert.deepEqual(loginAttempt(attempts, "ip", 61000), { count: 0, at: 61000 });
	assert.deepEqual(canonicalize(await readDatabaseSnapshot(pool)), before);
	console.log(
		"PASS: initialization, duplicate initialization, login, validation, rate window, CSRF, users, session revocation, password reset/change, content isolation",
	);
} finally {
	if (server && server.exitCode === null) {
		const exited = once(server, "exit");
		server.kill();
		await exited;
	}
	await pool.end();
}
