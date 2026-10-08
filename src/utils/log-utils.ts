import type { CollectionEntry } from "astro:content";

export type LogEntry = CollectionEntry<"logs">;

export function logDateKey(date: string): string {
	const value = String(date).trim();
	if (/^\d{4}$/.test(value)) return `${value}-01-01`;
	if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
	return value;
}

export function sortLogs<T extends { data: { date: string; order: number } }>(logs: T[]): T[] {
	return [...logs].sort((a, b) => {
		const dateOrder = logDateKey(b.data.date).localeCompare(logDateKey(a.data.date));
		return dateOrder || a.data.order - b.data.order;
	});
}
