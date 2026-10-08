import type {
	ExpressiveCodeConfig,
	HomeConfig,
	LicenseConfig,
	NavBarConfig,
	ProfileConfig,
	FooterConfig,
	ProjectSettingsConfig,
	SiteConfig,
} from "./types/config";
import editableSettings from "../.generated/site-settings.json";

const settings = editableSettings as {
	site?: Partial<SiteConfig>;
	profile?: Partial<ProfileConfig>;
	home?: Partial<HomeConfig>;
	footer?: Partial<FooterConfig>;
	projects?: Partial<ProjectSettingsConfig>;
};

function normalizeCategories(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const categories: string[] = [];
	for (const entry of value) {
		const name = String(entry ?? "").trim();
		if (name && !categories.includes(name)) categories.push(name);
	}
	return categories;
}

export const projectCategoriesConfig: ProjectSettingsConfig = {
	categories: normalizeCategories(settings.projects?.categories),
};

export const siteConfig: SiteConfig = {
	title: settings.site?.title || "KaiLog",
	navbarTitle: settings.site?.navbarTitle || settings.home?.title || "KaiLog",
	subtitle: settings.site?.subtitle || "",
	lang: "zh_CN",
	themeColor: {
		hue: 160,
		fixed: false,
	},
	banner: {
		enable: false,
		src: "",
		position: "center",
		credit: {
			enable: false, // Display the credit text of the banner image
			text: "", // Credit text to be displayed
			url: "", // (Optional) URL link to the original artwork or artist's page
		},
	},
	toc: {
		enable: true, // Display the table of contents on the right side of the post
		depth: 2, // Maximum heading depth to show in the table, from 1 to 3
	},
	favicon: [
		{ src: "/images/branding/k-logo-192.png", sizes: "192x192" },
		{ src: "/images/branding/k-logo-32.png", sizes: "32x32" },
	],
};

export const navBarConfig: NavBarConfig = {
	links: [
		{ name: "首页", url: "/" },
		{ name: "文章", url: "/blog/" },
		{ name: "日志", url: "/archive/" },
		{ name: "项目", url: "/projects/" },
		{ name: "关于", url: "/about/" },
	],
};

export const profileConfig: ProfileConfig = {
	avatar: settings.profile?.avatar || "",
	name: settings.profile?.name || "",
	bio: settings.profile?.bio || "",
	links: settings.profile?.links || [],
};

export const licenseConfig: LicenseConfig = {
	enable: false,
	name: "",
	url: "",
};

export const footerConfig: FooterConfig = {
	copyrightName: settings.footer?.copyrightName || "",
};

export const expressiveCodeConfig: ExpressiveCodeConfig = {
	// Note: Some styles (such as background color) are being overridden, see the astro.config.mjs file.
	// Please select a dark theme, as this blog theme currently only supports dark background color
	theme: "github-dark",
};

export const homeConfig: HomeConfig = {
	eyebrow: settings.home?.eyebrow || "",
	title: settings.home?.title || "",
	description: settings.home?.description || "",
	heroImage: settings.home?.heroImage || "",
	quote: settings.home?.quote || "",
};
