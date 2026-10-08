import { closePool, hasDatabase, loadSnapshot } from "../lib/content-db.mjs";
import { writeFile } from "node:fs/promises";

if (!hasDatabase()) {
	console.error("DATABASE_URL 未配置。请先配置目标 PostgreSQL 数据库。");
	process.exitCode = 1;
} else {
	try {
		const output = process.argv[2] || "db-export.json";
		const snapshot = await loadSnapshot({ allowLegacy: false });
		await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
		console.log(`Exported ${snapshot.entries.length} content entries to ${output}`);
	} finally {
		await closePool();
	}
}
