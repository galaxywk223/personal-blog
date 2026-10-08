<script lang="ts">
	import { onMount } from "svelte";

	const UNCATEGORIZED = "未分类";
	const ALL = "";

	interface GalleryProject {
		id: string;
		title: string;
		description: string;
		image: string;
		category: string;
		status: string;
		statusLabel: string;
		url?: string;
		repository?: string;
		published: string;
	}

	interface Filter {
		label: string;
		value: string;
		count: number;
	}

	export let projects: GalleryProject[] = [];
	export let categories: string[] = [];

	function categoryOf(project: GalleryProject): string {
		return (project.category ?? "").trim() || UNCATEGORIZED;
	}

	function buildFilters(): Filter[] {
		const counts = new Map<string, number>();
		for (const project of projects) {
			const name = categoryOf(project);
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}

		const registered = categories.map((name) => name.trim()).filter(Boolean);
		const extra = [...counts.keys()]
			.filter((name) => name !== UNCATEGORIZED && !registered.includes(name))
			.sort((a, b) => a.localeCompare(b, "zh-CN"));

		const names = [...registered, ...extra];
		if (counts.has(UNCATEGORIZED)) names.push(UNCATEGORIZED);

		return [
			{ label: "全部", value: ALL, count: projects.length },
			...names.map((name) => ({ label: name, value: name, count: counts.get(name) ?? 0 })),
		];
	}

	// Built during init so the served HTML already contains the filter links.
	let filters: Filter[] = buildFilters();
	let active = ALL;
	let visible = projects;

	function applyFilter(value: string) {
		active = filters.some((filter) => filter.value === value) ? value : ALL;
		visible = active === ALL ? projects : projects.filter((project) => categoryOf(project) === active);
	}

	function filterHref(value: string): string {
		if (!value || value === ALL) return "/projects/";
		return `/projects/?category=${encodeURIComponent(value)}`;
	}

	function select(event: MouseEvent, value: string) {
		// Let modified clicks (new tab, new window) behave like normal links.
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
		event.preventDefault();
		applyFilter(value);
		const url = filterHref(value);
		if (window.location.pathname + window.location.search !== url)
			history.replaceState(null, "", url);
	}

	onMount(() => {
		const requested = new URLSearchParams(window.location.search).get("category");
		applyFilter(requested ? requested.trim() : ALL);
	});
</script>

<div class="project-gallery">
	<nav class="project-filter" aria-label="项目分类">
		{#each filters as filter (filter.label)}
			<a
				href={filterHref(filter.value)}
				aria-current={active === filter.value ? "true" : undefined}
				on:click={(event) => select(event, filter.value)}
			>
				<span>{filter.label}</span>
				<small>{filter.count}</small>
			</a>
		{/each}
	</nav>

	<div class="home-project-grid">
		{#each visible as project (project.id)}
			<article class="home-project-card">
				<a class="project-cover" href={`/projects/${project.id}/`} aria-label={project.title}>
					{#if project.image}
						<img src={project.image} alt="" loading="lazy" />
					{:else}
						<span aria-hidden="true"></span>
					{/if}
				</a>
				<div class="home-project-copy">
					<div class="project-card-header">
						<div class="project-meta">
							<span>{project.category?.trim() ? project.category : UNCATEGORIZED}</span>
							<span aria-hidden="true">·</span>
							<span>{project.published.slice(0, 4)}</span>
						</div>
						<span class="home-chip project-status" data-status={project.status}>{project.statusLabel}</span>
					</div>
					<h3><a href={`/projects/${project.id}/`}>{project.title}</a></h3>
					<p>{project.description}</p>
					<div class="project-links">
						<a href={`/projects/${project.id}/`}>查看详情 →</a>
						{#if project.repository}
							<a href={project.repository} target="_blank" rel="noreferrer">代码仓库</a>
						{/if}
						{#if project.url}
							<a href={project.url} target="_blank" rel="noreferrer">项目主页</a>
						{/if}
					</div>
				</div>
			</article>
		{/each}

		{#if visible.length === 0}
			<div class="home-empty-row">
				{projects.length === 0 ? "暂无项目。" : "该分类暂无项目。"}
			</div>
		{/if}
	</div>
</div>
