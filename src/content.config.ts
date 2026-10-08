import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const contentRoot = "./.generated/content";

const posts = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: `${contentRoot}/posts` }),
	schema: z.object({
		title: z.string(),
		published: z.coerce.date(),
		updated: z.coerce.date().optional(),
		draft: z.boolean().optional().default(false),
		description: z.string().optional().default(""),
		image: z.string().optional().default(""),
		tags: z.array(z.string()).optional().default([]),
		category: z.string().optional().nullable().default(""),
		lang: z.string().optional().default("zh_CN"),
		prevTitle: z.string().default(""),
		prevSlug: z.string().default(""),
		nextTitle: z.string().default(""),
		nextSlug: z.string().default(""),
	}),
});

const spec = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: `${contentRoot}/spec` }),
	schema: z.object({}),
});

const projects = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: `${contentRoot}/projects` }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		published: z.coerce.date(),
		updated: z.coerce.date().optional(),
		tags: z.array(z.string()).default([]),
		image: z.string().optional().default(""),
		category: z.string().default("项目"),
		status: z
			.enum(["planned", "active", "in-progress", "completed", "archived"])
			.default("in-progress"),
		url: z.string().url().optional(),
		repository: z.string().url().optional(),
	}),
});

const logs = defineCollection({
	loader: glob({ pattern: "**/*.md", base: `${contentRoot}/logs` }),
	schema: z.object({
		title: z.string(),
		date: z.string().regex(/^\d{4}(?:-\d{2})?(?:-\d{2})?$/),
		order: z.number().default(0),
	}),
});

export const collections = { posts, spec, projects, logs };
