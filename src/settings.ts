import { App, PluginSettingTab, Setting } from "obsidian";
import NovelChapterPlugin from "./main";

// Interface for a single novel project configuration
export interface NovelProject {
	id: string;
	name: string;
	path: string;
}

// Define the plugin settings interface
export interface NovelChapterPluginSettings {
	novelProjects: NovelProject[]; // Array of novel projects
	propertyNameToChange: string; // The frontmatter property to change
	propertyColumnHeader: string; // Display name for the property column
	propertyOptions: string; // Comma-separated options for the dropdown
	chapterTemplatePath: string; // Path to the chapter template file
	otherGroupName: string; // Name for the "Other" group
	excludeOtherFromCount: boolean; // Whether to exclude "Other" from total count
}

// Define the default settings
export const DEFAULT_SETTINGS: NovelChapterPluginSettings = {
	novelProjects: [
		{
			id: `default-${Date.now()}`,
			name: "My First Novel",
			path: "Novel/Chapters",
		},
	], // Default to one example novel project
	propertyNameToChange: "status", // Default property to change
	propertyColumnHeader: "", // Default to empty, will use propertyNameToChange if empty
	propertyOptions: "To Do, Done, In Progress", // Default options for the dropdown
	chapterTemplatePath: "", // Default to no template
	otherGroupName: "Other", // Default name for the "Other" group
	excludeOtherFromCount: false, // Default to including "Other" in counts
};

// Helper to generate a unique ID
function generateId(): string {
	return `novel-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Create a setting tab for the plugin
export class NovelChapterPluginSettingsTab extends PluginSettingTab {
	plugin: NovelChapterPlugin;

	// Initialize with the app and plugin instance
	constructor(app: App, plugin: NovelChapterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// Display the settings UI
	display(): void {
		const { containerEl } = this; // Get the container element
		containerEl.empty(); // Clear existing content

		containerEl.createEl("h2", { text: "Novel Chapter Plugin Settings" }); // Title

		// Create setting for selecting the frontmatter property to change
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
							value.trim(); // Trim whitespace
						await this.plugin.saveSettings();
						this.plugin.refreshNovelChapterView(); // Refresh to update the column header if needed
					})
			);
		
		// Create setting for customizing the property column header display name
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
							value.trim(); // Trim whitespace
						await this.plugin.saveSettings();
						this.plugin.refreshNovelChapterView(); // Refresh to update the column header
					})
			);

		// Create setting for defining the dropdown options
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
						this.plugin.refreshNovelChapterView(); // Refresh to update the dropdown options
					})
			);

		// Create setting for specifying the chapter template file path
		new Setting(containerEl)
			.setName("Chapter Template File Path")
			.setDesc(
				'Path to a markdown file to use as a template for new chapters (e.g., "Templates/ChapterTemplate.md"). Leave empty to not use a template. Placeholders like {{title}} and {{date}} can be used in the template.'
			)
			.addText((text) =>
				text
					.setPlaceholder(
						DEFAULT_SETTINGS.chapterTemplatePath ||
							"e.g., Templates/ChapterTemplate.md"
					)
					.setValue(this.plugin.settings.chapterTemplatePath)
					.onChange(async (value) => {
						this.plugin.settings.chapterTemplatePath = value.trim();
						await this.plugin.saveSettings();
					})
			);
		
		// Create setting for naming the "Other" group
		new Setting(containerEl)
			.setName('Name for "Other" group')
			.setDesc(
				"Set a custom name for the group containing chapters not in a subfolder."
			)
			.addText((text) =>
				text
					.setPlaceholder("Other")
					.setValue(this.plugin.settings.otherGroupName)
					.onChange(async (value) => {
						this.plugin.settings.otherGroupName = value || "Other";
						await this.plugin.saveSettings();
					})
			);
		
		// Create setting for excluding the "Other" group from total chapter count
		new Setting(containerEl)
			.setName('Exclude "Other" group from total count')
			.setDesc(
				"If enabled, chapters in this group will not be included in the total chapter count at the top of the view."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.excludeOtherFromCount)
					.onChange(async (value) => {
						this.plugin.settings.excludeOtherFromCount = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("hr"); // Horizontal rule for separation

		// Section for managing Novel Projects
		containerEl.createEl("h3", { text: "Novel Projects" });
		const novelProjectsContainer = containerEl.createDiv({
			cls: "novel-projects-container",
		});

		// Initial render of the novel projects list
		this.renderNovelProjects(novelProjectsContainer);

		// Button to add a new novel project
		new Setting(containerEl)
			.setName("Add New Novel Project")
			.setDesc("Add a new novel to track.")
			.addButton((button) =>
				button
					.setButtonText("Add Novel")
					.setCta()
					.onClick(async () => {
						// Add a new novel project with a unique ID and default name
						this.plugin.settings.novelProjects.push({
							id: generateId(),
							name: `New Novel ${
								this.plugin.settings.novelProjects.length + 1
							}`,
							path: "",
						});
						await this.plugin.saveSettings();
						this.renderNovelProjects(novelProjectsContainer); // Re-render the list
						this.plugin.refreshNovelChapterView(true); // Refresh the view
					})
			);
	}

	// Renders the list of novel projects
	private renderNovelProjects(containerEl: HTMLElement): void {
		containerEl.empty(); // Clear existing content

		// If no projects, show a message
		if (this.plugin.settings.novelProjects.length === 0) {
			containerEl.createEl("p", {
				text: "No novel projects configured. Add one below.",
			});
		}

		// Render each novel project with its settings
		this.plugin.settings.novelProjects.forEach((project, index) => {
			// Create a setting for each novel project
			const projectSetting = new Setting(containerEl)
				.setName(`Novel ${index + 1}`)
				.setDesc(`Configuration for ${project.name || "this novel"}.`);

			// Text input for the novel name
			projectSetting.addText((text) =>
				text
					.setPlaceholder("Novel Name (e.g., My Epic Saga)")
					.setValue(project.name)
					.onChange(async (value) => {
						project.name = value.trim();
						await this.plugin.saveSettings();
						this.plugin.refreshNovelChapterView(true); // Refresh the view
					})
			);

			// Text input for the folder path
			projectSetting.addText((text) =>
				text
					.setPlaceholder(
						"Folder Path (e.g., Novels/MyEpicSaga/Chapters)"
					)
					.setValue(project.path)
					.onChange(async (value) => {
						project.path = value.trim();
						await this.plugin.saveSettings();
						this.plugin.refreshNovelChapterView(true); // Refresh the view
					})
			);

			// Button to remove the novel project
			projectSetting.addButton((button) =>
				button
					.setIcon("trash")
					.setTooltip("Remove this novel project")
					// Set up the click handler to remove the project
					.onClick(async () => {
						this.plugin.settings.novelProjects.splice(index, 1); // Remove this project from the array
						await this.plugin.saveSettings();
						this.renderNovelProjects(containerEl); // Re-render the list
						this.plugin.refreshNovelChapterView(true); // Refresh the view
					})
			);
		});
	}
}
