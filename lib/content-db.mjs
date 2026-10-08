import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import YAML from "yaml";

export const projectStatuses = ["planned", "in-progress", "completed", "archived"];
export const contentKinds = ["posts", "projects", "logs", "spec"];

const root = fileURLToPath(new URL("../", import.meta.url));
const legacyContentRoot = join(root, "src", "content");
const legacySettingsPath = join(root, "src", "data", "site-settings.json");
const generatedRoot = join(root, ".generated");
const schemaSql = `
CREATE SCHEMA IF NOT EXISTS blog;
CREATE TABLE IF NOT EXISTS blog.content_entries (
  kind text NOT NULL,
  slug text NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  frontmatter jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, slug)
);
CREATE TABLE IF NOT EXISTS blog.site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS blog.project_categories (
  name text PRIMARY KEY,
  position integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS blog.migration_runs (
  id bigserial PRIMARY KEY,
  source_hash text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS blog.admin_users (
  id bigserial PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  credential_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

let pool;

export function getDatabaseUrl() {
	return process.env.DATABASE_URL || "";
}

export function hasDatabase() {
	return Boolean(getDatabaseUrl());
}

export function getRoot() {
	return root;
}

export function getGeneratedRoot() {
	return generatedRoot;
}

export function getPool() {
	if (!hasDatabase()) throw new Error("DATABASE_URL 未配置");
	pool ??= new Pool({ connectionString: getDatabaseUrl(), max: 5 });
	return pool;
}

export async function closePool() {
	if (pool) await pool.end();
	pool = undefined;
}

export async function ensureSchema(client = getPool()) {
	await client.query(schemaSql);
}

export function parseFrontmatter(source) {
	const match = String(source).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) return { data: {}, body: String(source) };
	const data = YAML.parse(match[1]) || {};
	for (const [key, value] of Object.entries(data)) {
		if (value instanceof Date) data[key] = value.toISOString().slice(0, 10);
	}
	return { data, body: match[2] || "" };
}

export function serializeFrontmatter(data, body = "") {
	const lines = ["---"];
	for (const [key, value] of Object.entries(data || {})) {
		if (Array.isArray(value)) {
			if (!value.length) {
				lines.push(`${key}: []`);
				continue;
			}
			lines.push(`${key}:`);
			for (const item of value)
				lines.push(`  - ${typeof item === "string" ? JSON.stringify(item) : String(item)}`);
		} else if (typeof value === "string") lines.push(`${key}: ${JSON.stringify(value)}`);
		else if (value === null) lines.push(`${key}: null`);
		else lines.push(`${key}: ${String(value)}`);
	}
	const header = lines.join("\n");
	return `${header}\n---\n${String(body).replace(/^\n+/, "")}\n`;
}

export function canonicalize(value) {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [key, canonicalize(value[key])]),
		);
	return value;
}

export function hashEntry(entry) {
	return createHash("sha256")
		.update(
			JSON.stringify(
				canonicalize({ kind: entry.kind, slug: entry.slug, data: entry.data, body: entry.body }),
			),
		)
		.digest("hex");
}

async function readLegacyEntries(kind) {
	const dir = join(legacyContentRoot, kind);
	if (!existsSync(dir)) return [];
	const names = (await readdir(dir, { withFileTypes: true }))
		.filter((entry) => entry.isFile() && /\.(md|mdx)$/.test(entry.name))
		.map((entry) => entry.name.replace(/\.(md|mdx)$/, ""));
	const entries = [];
	for (const slug of names) {
		const file = join(dir, `${slug}.md`);
		const parsed = parseFrontmatter(await readFile(file, "utf8"));
		entries.push({ kind, slug, data: parsed.data, body: parsed.body });
	}
	return entries;
}

export async function readLegacySnapshot() {
	const entries = [];
	for (const kind of contentKinds) entries.push(...(await readLegacyEntries(kind)));
	const settings = existsSync(legacySettingsPath)
		? JSON.parse(await readFile(legacySettingsPath, "utf8"))
		: {};
	return { entries, settings };
}

export async function readDatabaseSnapshot(client = getPool()) {
	await ensureSchema(client);
	const entries = (
		await client.query(
			`SELECT kind, slug, title, body, frontmatter, sort_order FROM blog.content_entries ORDER BY kind, sort_order, slug`,
		)
	).rows.map((row) => ({
		kind: row.kind,
		slug: row.slug,
		data: row.frontmatter || {},
		body: row.body || "",
		sortOrder: row.sort_order || 0,
	}));
	const settingsRows = (await client.query(`SELECT key, value FROM blog.site_settings`)).rows;
	const settings = {};
	for (const row of settingsRows) settings[row.key] = row.value;
	const categories = (
		await client.query(`SELECT name FROM blog.project_categories ORDER BY position, name`)
	).rows.map((row) => row.name);
	settings.projects = { ...(settings.projects || {}), categories };
	return { entries, settings };
}

export async function importSnapshot(snapshot, client = getPool()) {
	await ensureSchema(client);
	await client.query("BEGIN");
	try {
		for (const entry of snapshot.entries) {
			await client.query(
				`INSERT INTO blog.content_entries (kind, slug, title, body, frontmatter, sort_order)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (kind, slug) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body,
         frontmatter = EXCLUDED.frontmatter, sort_order = EXCLUDED.sort_order, updated_at = now()`,
				[
					entry.kind,
					entry.slug,
					String(entry.data.title || ""),
					entry.body || "",
					JSON.stringify(entry.data || {}),
					Number(entry.data.order || entry.sortOrder || 0),
				],
			);
		}
		for (const [key, value] of Object.entries(snapshot.settings || {})) {
			await client.query(
				`INSERT INTO blog.site_settings (key, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
				[key, JSON.stringify(value)],
			);
		}
		const categories = Array.isArray(snapshot.settings?.projects?.categories)
			? snapshot.settings.projects.categories
			: [];
		await client.query(`DELETE FROM blog.project_categories`);
		for (const [position, name] of categories.entries()) {
			await client.query(`INSERT INTO blog.project_categories (name, position) VALUES ($1, $2)`, [
				String(name),
				position,
			]);
		}
		const sourceHash = createHash("sha256")
			.update(
				JSON.stringify(snapshot, (_, value) =>
					value instanceof Date ? value.toISOString() : value,
				),
			)
			.digest("hex");
		await client.query(`INSERT INTO blog.migration_runs (source_hash) VALUES ($1)`, [sourceHash]);
		await client.query("COMMIT");
		return { sourceHash, entries: snapshot.entries.length };
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	}
}

function groupedEntries(snapshot) {
	const grouped = Object.fromEntries(contentKinds.map((kind) => [kind, []]));
	for (const entry of snapshot.entries) if (grouped[entry.kind]) grouped[entry.kind].push(entry);
	return grouped;
}

export async function writeGeneratedSnapshot(snapshot) {
	await rm(generatedRoot, { recursive: true, force: true });
	const grouped = groupedEntries(snapshot);
	for (const kind of contentKinds) {
		const dir = join(generatedRoot, "content", kind);
		await mkdir(dir, { recursive: true });
		for (const entry of grouped[kind]) {
			await writeFile(
				join(dir, `${entry.slug}.md`),
				serializeFrontmatter(entry.data, entry.body),
				"utf8",
			);
		}
	}
	await writeFile(
		join(generatedRoot, "site-settings.json"),
		`${JSON.stringify(snapshot.settings || {}, null, 2)}\n`,
		"utf8",
	);
	return generatedRoot;
}

export async function loadSnapshot({ allowLegacy = true } = {}) {
	if (hasDatabase()) return readDatabaseSnapshot();
	if (!allowLegacy) throw new Error("DATABASE_URL 未配置");
	return readLegacySnapshot();
}

export function relativeRootPath(file) {
	return relative(root, file).split(sep).join("/");
}
