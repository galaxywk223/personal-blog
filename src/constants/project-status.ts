export type ProjectStatusOption = {
	value: string;
	label: string;
};

export const projectStatuses: ProjectStatusOption[] = [
	{ value: "planned", label: "计划中" },
	{ value: "in-progress", label: "进行中" },
	{ value: "completed", label: "已完成" },
	{ value: "archived", label: "已归档" },
];

export const projectStatusLabels: Record<string, string> = Object.fromEntries(
	projectStatuses.map((status) => [status.value, status.label]),
);

// "active" predates the five-value list and is kept only so old files still render.
projectStatusLabels.active = "进行中";

export function projectStatusLabel(status?: string | null): string {
	if (!status) return "未标注";
	return projectStatusLabels[status] || "未标注";
}
