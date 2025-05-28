import { App, PluginSettingTab, Setting } from "obsidian";
import NovelChapterPlugin from "./main"; // Adjusted import path

// Interface for a single novel project configuration
export interface NovelProject {
	id: string; // Unique ID for React-style keying if ever needed, and for stable identify
	name: string;
	path: string;
}

// Define the plugin settings interface
export interface NovelChapterPluginSettings {
	novelProjects: NovelProject[];
	propertyNameToChange: string;
	propertyColumnHeader: string;
	propertyOptions: string; // Comma-separated string
	// showInStatusBar: boolean; // Removed as per original file, can be re-added if needed
}

// Define the default settings
export const DEFAULT_SETTINGS: NovelChapterPluginSettings = {
	novelProjects: [
		{
			id: `default-${Date.now()}`,
			name: "My First Novel",
			path: "Novel/Chapters",
		},
	],
	propertyNameToChange: "status",
	propertyColumnHeader: "",
	propertyOptions: "To Do,In Progress,Drafted,Revised,Done",
	// showInStatusBar: false,
};

// Helper to generate a unique ID
function generateId(): string {
	return `novel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Create a setting tab for the plugin
export class NovelChapterPluginSettingsTab extends PluginSettingTab {
	plugin: NovelChapterPlugin;

	constructor(app: App, plugin: NovelChapterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Novel Chapter Plugin Settings" });

		containerEl.createEl("h3", { text: "Chapter Properties" });

		new Setting(containerEl)
			.setName("Target Property Name")
			.setDesc(
				'The actual frontmatter key to update (e.g., "status", "outlineLevel"). This is case-sensitive.'
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.propertyNameToChange)
					.setValue(this.plugin.settings.propertyNameToChange)
					.onChange(async (value) => {
						this.plugin.settings.propertyNameToChange =
							value.trim();
						await this.plugin.saveSettings();
						this.plugin.refreshNovelChapterView();
					})
			);

		new Setting(containerEl)
			.setName("Property Column Header Display Name")
			.setDesc(
				'What title to display for the property column in the view (e.g., "Current Status"). If empty, it will use the "Target Property Name".'
			)
			.addText((text) =>
				text
					.setPlaceholder("e.g., Status (optional)")
					.setValue(this.plugin.settings.propertyColumnHeader)
					.onChange(async (value) => {
						this.plugin.settings.propertyColumnHeader =
							value.trim();
						await this.plugin.saveSettings();
						this.plugin.refreshNovelChapterView();
					})
			);

		new Setting(containerEl)
			.setName("Property Options")
			.setDesc(
				'Enter a comma-separated list of options for the dropdown (e.g., "To Do,In Progress,Complete").'
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.propertyOptions)
					.setValue(this.plugin.settings.propertyOptions)
					.onChange(async (value) => {
						this.plugin.settings.propertyOptions = value;
						await this.plugin.saveSettings();
						this.plugin.refreshNovelChapterView();
					})
			);
      
		containerEl.createEl("hr");

		// Section for managing Novel Projects
		containerEl.createEl("h3", { text: "Novel Projects" });
		const novelProjectsContainer = containerEl.createDiv({
			cls: "novel-projects-container",
		});

		this.renderNovelProjects(novelProjectsContainer);

		new Setting(containerEl)
			.setName("Add New Novel Project")
			.setDesc("Add a new novel to track.")
			.addButton((button) =>
				button
					.setButtonText("Add Novel")
					.setCta()
					.onClick(async () => {
						this.plugin.settings.novelProjects.push({
							id: generateId(),
							name: `New Novel ${
								this.plugin.settings.novelProjects.length + 1
							}`,
							path: "",
						});
						await this.plugin.saveSettings();
						this.renderNovelProjects(novelProjectsContainer); // Re-render the list
						this.plugin.refreshNovelChapterView(); // Refresh the main view
					})
			);
	}

	// Renders the list of novel projects
	private renderNovelProjects(containerEl: HTMLElement): void {
		containerEl.empty(); // Clear previous entries

		if (this.plugin.settings.novelProjects.length === 0) {
			containerEl.createEl("p", {
				text: "No novel projects configured. Add one below.",
			});
		}

		this.plugin.settings.novelProjects.forEach((project, index) => {
			const projectSetting = new Setting(containerEl)
				.setName(`Novel ${index + 1}`)
				.setDesc(`Configuration for ${project.name || "this novel"}.`);

			projectSetting.addText((text) =>
				text
					.setPlaceholder("Novel Name (e.g., My Epic Saga)")
					.setValue(project.name)
					.onChange(async (value) => {
						project.name = value.trim();
						await this.plugin.saveSettings();
						// No need to re-render all projects here, just save.
						// However, if names are used elsewhere dynamically, a full refresh might be needed.
						// For now, let's assume direct edit is fine.
						this.plugin.refreshNovelChapterView(); // Refresh main view as novel name might be in dropdown
					})
			);

			projectSetting.addText((text) =>
				text
					.setPlaceholder(
						"Folder Path (e.g., Novels/MyEpicSaga/Chapters)"
					)
					.setValue(project.path)
					.onChange(async (value) => {
						project.path = value.trim();
						await this.plugin.saveSettings();
						this.plugin.refreshNovelChapterView(); // Path change definitely needs view refresh
					})
			);

			projectSetting.addButton((button) =>
				button
					.setIcon("trash")
					.setTooltip("Remove this novel project")
					.onClick(async () => {
						this.plugin.settings.novelProjects.splice(index, 1);
						await this.plugin.saveSettings();
						this.renderNovelProjects(containerEl); // Re-render the list of projects
						this.plugin.refreshNovelChapterView(); // Refresh main view
					})
			);
		});
	}
}
