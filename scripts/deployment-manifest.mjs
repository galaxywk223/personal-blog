import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import {
	closePool,
	getPool,
	getRoot,
	readDatabaseSnapshot,
	canonicalize,
	hashEntry,
} from "../lib/content-db.mjs";

const digest = (value) =>
	createHash("sha256")
		.update(JSON.stringify(canonicalize(value)))
		.digest("hex");
async function mediaHashes(dir, base = dir) {
	const files = [];
	for (const entry of await readdir(dir, { withFileTypes: true }).catch((error) => {
		if (error.code === "ENOENT") return [];
		throw error;
	})) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...(await mediaHashes(path, base)));
		else if (entry.isFile())
			files.push({
				path: relative(base, path).replaceAll("\\", "/"),
				sha256: createHash("sha256")
					.update(await readFile(path))
					.digest("hex"),
			});
	}
	return files.sort((a, b) => a.path.localeCompare(b.path));
}
try {
	const snapshot = await readDatabaseSnapshot();
	const users = (
		await getPool().query(
			"SELECT id, username, password_hash, enabled, credential_version FROM blog.admin_users ORDER BY id",
		)
	).rows;
	console.log(
		JSON.stringify(
			{
				entries: snapshot.entries.length,
				contentHash: digest(snapshot.entries.map(hashEntry).sort()),
				settingsHash: digest(snapshot.settings),
				admins: users.length,
				credentialsHash: digest(users),
				media: await mediaHashes(join(getRoot(), "public", "images", "uploads")),
			},
			null,
			2,
		),
	);
} finally {
	await closePool();
}
