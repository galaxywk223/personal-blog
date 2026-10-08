import { closePool, getPool, hasDatabase, ensureSchema } from "../lib/content-db.mjs";

const username = String(process.env.ADMIN_INITIAL_USERNAME || "admin")
	.trim()
	.toLowerCase();
const passwordHash = process.env.ADMIN_PASSWORD_HASH || "";
const usernamePattern = /^[a-z0-9_.-]{3,32}$/;

if (!hasDatabase()) throw new Error("DATABASE_URL 未配置");
if (!usernamePattern.test(username)) throw new Error("ADMIN_INITIAL_USERNAME 格式无效");

try {
	const pool = getPool();
	await ensureSchema(pool);
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		await client.query("LOCK TABLE blog.admin_users IN EXCLUSIVE MODE");
		const existing = await client.query("SELECT id FROM blog.admin_users LIMIT 1");
		if (existing.rowCount > 0) {
			console.log("管理员账号已初始化，未覆盖现有账号或密码。");
		} else {
			if (!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(passwordHash))
				throw new Error("ADMIN_PASSWORD_HASH 未配置或格式无效");
			await client.query("INSERT INTO blog.admin_users (username, password_hash) VALUES ($1, $2)", [
				username,
				passwordHash,
			]);
			console.log(`已创建初始管理员账号：${username}`);
		}
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
} finally {
	await closePool();
}
