import {
	closePool,
	canonicalize,
	hashEntry,
	hasDatabase,
	importSnapshot,
	loadSnapshot,
	readLegacySnapshot,
} from "../lib/content-db.mjs";

if (!hasDatabase()) {
	console.error("DATABASE_URL 未配置。请先配置目标 PostgreSQL 数据库。");
	process.exitCode = 1;
} else {
	try {
		const snapshot = await readLegacySnapshot();
		const result = await importSnapshot(snapshot);
		console.log(`Imported ${result.entries} content entries. source_hash=${result.sourceHash}`);
		const stored = await loadSnapshot({ allowLegacy: false });
		const sourceHashes = snapshot.entries.map(hashEntry).sort();
		const storedHashes = stored.entries.map(hashEntry).sort();
		if (JSON.stringify(sourceHashes) !== JSON.stringify(storedHashes))
			throw new Error(
				`迁移校验失败：源记录 ${snapshot.entries.length}，数据库记录 ${stored.entries.length}`,
			);
		if (
			JSON.stringify(canonicalize(stored.settings)) !==
			JSON.stringify(canonicalize(snapshot.settings))
		)
			throw new Error("迁移校验失败：站点设置不一致");
		console.log("Migration verification passed.");
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	} finally {
		await closePool();
	}
}
