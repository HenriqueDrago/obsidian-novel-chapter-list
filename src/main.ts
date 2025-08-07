import {
	Plugin,
	WorkspaceLeaf,
	Notice,
	ItemView,
	TFile,
	normalizePath,
	Modal,
	TextComponent,
	ButtonComponent,
	App,
  Menu,
} from "obsidian";
import {
	NovelChapterPluginSettingsTab,
	NovelChapterPluginSettings,
	DEFAULT_SETTINGS as EXTERNAL_DEFAULT_SETTINGS,
	NovelProject,
} from "./settings";

// Define the constant for the custom view type
const NOVEL_CHAPTER_VIEW_TYPE = "novel-chapter-view";

// Augment settings for internal use within main.ts
interface InternalNovelChapterPluginSettings
	extends NovelChapterPluginSettings {
	lastSelectedNovelId: string | null;
}

const DEFAULT_SETTINGS: InternalNovelChapterPluginSettings = {
	...EXTERNAL_DEFAULT_SETTINGS,
	lastSelectedNovelId: null,
	novelProjects:
		Array.isArray(EXTERNAL_DEFAULT_SETTINGS.novelProjects) &&
		EXTERNAL_DEFAULT_SETTINGS.novelProjects.length > 0
			? EXTERNAL_DEFAULT_SETTINGS.novelProjects
			: [
					{
						id: `default-${Date.now()}`,
						name: "My First Novel",
						path: "Novel/Chapters",
					},
			  ],
};

// Helper function to check if a file is within a specific folder path
function isFileInFolder(file: TFile, folderPath: string): boolean {
	if (!folderPath || folderPath.trim() === "") return false;
	const normalizedFilePath = normalizePath(file.path);
	let normalizedFolderPath = normalizePath(folderPath);

	if (!normalizedFolderPath.endsWith("/")) {
		normalizedFolderPath += "/";
	}
	return normalizedFilePath.startsWith(normalizedFolderPath);
}

// Helper function for sleep
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Generic Confirmation Modal
class ConfirmationModal extends Modal {
	constructor(
		app: App,
		private message: string,
		private onConfirm: () => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("confirm-modal");
		contentEl.createEl("p", { text: this.message });

		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container",
		});

		new ButtonComponent(buttonContainer)
			.setButtonText("Confirm")
			.setWarning() // or .setCta()
			.onClick(() => {
				this.onConfirm();
				this.close();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText("Cancel")
			.onClick(() => {
				this.close();
			});
	}

	onClose() {
		this.contentEl.empty();
	}
}

// Modal for getting chapter name (Can be used for create or rename)
class ChapterNameModal extends Modal {
	result: string | null = null;
	onSubmit: (result: string) => void;
	private initialValue: string;
	private modalTitle: string;
	private ctaButtonText: string;

	constructor(
		app: App,
		title: string,
		ctaText: string,
		initialValue: string,
		onSubmit: (result: string) => void
	) {
		super(app);
		this.modalTitle = title;
		this.ctaButtonText = ctaText;
		this.initialValue = initialValue;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: this.modalTitle });

		const inputContainer = contentEl.createDiv({
			cls: "modal-input-container",
		});
		const textInput = new TextComponent(inputContainer)
			.setPlaceholder("Chapter name")
			.setValue(this.initialValue);
		textInput.inputEl.addClass("modal-text-input");
		textInput.inputEl.focus();

		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container",
		});

		const submitButton = new ButtonComponent(buttonContainer)
			.setButtonText(this.ctaButtonText)
			.setCta();

		const doSubmit = () => {
			const chapterName = textInput.getValue().trim();
			if (chapterName) {
				this.result = chapterName;
				this.close();
				this.onSubmit(this.result);
			} else {
				new Notice("Chapter name cannot be empty.");
			}
		};

		submitButton.onClick(doSubmit);

		new ButtonComponent(buttonContainer)
			.setButtonText("Cancel")
			.onClick(() => this.close());

		textInput.inputEl.addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				doSubmit();
			}
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

// Define the custom view class
class NovelChapterView extends ItemView {
	plugin: NovelChapterPlugin;
	controlsContainer: HTMLDivElement;
	tableContainer: HTMLDivElement;
	selectedNovelProjectId: string | null = null;

	// State for filtering and searching
	private searchTerm = "";
	private filterValue = "all";

	constructor(leaf: WorkspaceLeaf, plugin: NovelChapterPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return NOVEL_CHAPTER_VIEW_TYPE;
	}

	getDisplayText(): string {
		const selectedProject = this.plugin.settings.novelProjects.find(
			(p) => p.id === this.selectedNovelProjectId
		);
		return selectedProject
			? `Chapters: ${selectedProject.name}`
			: "Novel Chapters";
	}

	getIcon(): string {
		return "list-ordered";
	}

	async onOpen(): Promise<void> {
		const contentEl = this.containerEl.children[1];
		contentEl.empty();
		contentEl.addClass("novel-chapter-view-container");

		this.controlsContainer = contentEl.createDiv({
			cls: "novel-chapter-controls",
		});
		this.tableContainer = contentEl.createDiv({
			cls: "novel-chapter-table-container",
		});

		await this.updateView(true);
	}

	async onClose(): Promise<void> {
		// Clean up
	}

	async updateView(settingsHaveChanged = false) {
		if (settingsHaveChanged) {
			await this.renderControls();
		}

		if (
			!this.selectedNovelProjectId ||
			!this.plugin.settings.novelProjects.find(
				(p) => p.id === this.selectedNovelProjectId
			)
		) {
			if (
				this.plugin.settings.lastSelectedNovelId &&
				this.plugin.settings.novelProjects.find(
					(p) => p.id === this.plugin.settings.lastSelectedNovelId
				)
			) {
				this.selectedNovelProjectId =
					this.plugin.settings.lastSelectedNovelId;
			} else if (this.plugin.settings.novelProjects.length > 0) {
				this.selectedNovelProjectId =
					this.plugin.settings.novelProjects[0].id;
			} else {
				this.selectedNovelProjectId = null;
			}

			const selectEl = this.controlsContainer.querySelector(
				"select.novel-project-selector"
			) as HTMLSelectElement | null;
			if (selectEl && this.selectedNovelProjectId) {
				selectEl.value = this.selectedNovelProjectId;
			} else if (
				selectEl &&
				!this.selectedNovelProjectId &&
				this.plugin.settings.novelProjects.length > 0
			) {
				selectEl.value = this.plugin.settings.novelProjects[0].id;
			}
		}

		this.updateLeafDisplayText();
		await this.renderChapterTable();
	}

	private updateLeafDisplayText() {
		if (this.leaf) {
			this.leaf.setViewState(this.leaf.getViewState());
		}
	}

	async renderControls(): Promise<void> {
		this.controlsContainer.empty();
		const projects = this.plugin.settings.novelProjects;

		if (projects.length === 0) {
			this.controlsContainer.setText(
				"No novel projects configured. Please add one in plugin settings."
			);
			this.selectedNovelProjectId = null;
			return;
		}

		const controlsLine1 = this.controlsContainer.createDiv({
			cls: "novel-chapter-controls-line",
		});
		const controlsLine2 = this.controlsContainer.createDiv({
			cls: "novel-chapter-controls-line",
		});

		// Line 1: Project Selector and Action Buttons
		const selectEl = controlsLine1.createEl("select");
		selectEl.addClass("novel-project-selector");
		projects.forEach((project) => {
			selectEl.createEl("option", {
				text: project.name || "Unnamed Novel",
				value: project.id,
			});
		});

		if (
			this.selectedNovelProjectId &&
			projects.find((p) => p.id === this.selectedNovelProjectId)
		) {
			selectEl.value = this.selectedNovelProjectId;
		} else if (projects.length > 0) {
			this.selectedNovelProjectId = projects[0].id;
			selectEl.value = this.selectedNovelProjectId;
		}

		selectEl.addEventListener("change", async (event) => {
			this.selectedNovelProjectId = (
				event.target as HTMLSelectElement
			).value;
			this.plugin.settings.lastSelectedNovelId =
				this.selectedNovelProjectId;
			await this.plugin.saveSettings();
			this.updateLeafDisplayText();
			await this.renderChapterTable();
		});

		// Previous Chapter Button
		new ButtonComponent(controlsLine1)
			.setIcon("chevron-left")
			.setTooltip("Previous Chapter")
			.onClick(() => {
				const currentFile = this.app.workspace.getActiveFile();
				if (!currentFile) {
					new Notice("Open a chapter file to use navigation.");
					return;
				}
				const project = this.plugin.findProjectForFile(currentFile);
				if (!project || project.id !== this.selectedNovelProjectId) {
					new Notice(
						"The active chapter doesn't belong to the selected project."
					);
					return;
				}
				const chapters = this.plugin.getProjectChapters(project.path);
				const currentIndex = chapters.findIndex(
					(chap) => chap.path === currentFile.path
				);
				if (currentIndex > 0) {
					this.app.workspace.openLinkText(
						chapters[currentIndex - 1].path,
						"",
						false
					);
				} else {
					new Notice("This is the first chapter.");
				}
			});

		// Next Chapter Button
		new ButtonComponent(controlsLine1)
			.setIcon("chevron-right")
			.setTooltip("Next Chapter")
			.onClick(() => {
				const currentFile = this.app.workspace.getActiveFile();
				if (!currentFile) {
					new Notice("Open a chapter file to use navigation.");
					return;
				}
				const project = this.plugin.findProjectForFile(currentFile);
				if (!project || project.id !== this.selectedNovelProjectId) {
					new Notice(
						"The active chapter doesn't belong to the selected project."
					);
					return;
				}
				const chapters = this.plugin.getProjectChapters(project.path);
				const currentIndex = chapters.findIndex(
					(chap) => chap.path === currentFile.path
				);
				if (
					currentIndex !== -1 &&
					currentIndex < chapters.length - 1
				) {
					this.app.workspace.openLinkText(
						chapters[currentIndex + 1].path,
						"",
						false
					);
				} else {
					new Notice("This is the last chapter.");
				}
			});

		// New Chapter button changed to '+' icon
		new ButtonComponent(controlsLine1)
			.setIcon("plus")
			.setTooltip("New Chapter")
			.setClass("novel-chapter-new-button")
			.onClick(async () => {
				await this.plugin.promptAndCreateNewChapter(
					this.selectedNovelProjectId
				);
			});

		// Line 2: Search and Filter
		new TextComponent(controlsLine2)
			.setPlaceholder("Search chapters...")
			.setValue(this.searchTerm)
			.onChange((value) => {
				this.searchTerm = value;
				this.renderChapterTable();
			})
			.inputEl.addClass("novel-chapter-search-input");

		// Property Filter Dropdown
		const { propertyOptions } = this.plugin.settings;
		const optionsArray = propertyOptions
			.split(",")
			.map((opt) => opt.trim())
			.filter((opt) => opt.length > 0);
		if (optionsArray.length > 0) {
			const filterSelect = controlsLine2.createEl("select");
			filterSelect.addClass("novel-chapter-filter-select");
			filterSelect.createEl("option", {
				text: "Filter by property...",
				value: "all",
			});
			optionsArray.forEach((option) => {
				filterSelect.createEl("option", {
					text: option,
					value: option,
				});
			});
			filterSelect.value = this.filterValue;
			filterSelect.addEventListener("change", (event) => {
				this.filterValue = (event.target as HTMLSelectElement).value;
				this.renderChapterTable();
			});
		}
	}

	async renderChapterTable(): Promise<void> {
		this.tableContainer.empty();

		if (!this.selectedNovelProjectId) return;

		const currentNovelProject = this.plugin.settings.novelProjects.find(
			(p) => p.id === this.selectedNovelProjectId
		);
		if (!currentNovelProject) {
			this.tableContainer.setText("Selected novel project not found.");
			return;
		}

		const { path: chaptersFolderPath } = currentNovelProject;
		const { propertyNameToChange, propertyColumnHeader, propertyOptions } =
			this.plugin.settings;
		const optionsArray = propertyOptions
			.split(",")
			.map((opt) => opt.trim())
			.filter((opt) => opt.length > 0);

		if (!chaptersFolderPath || chaptersFolderPath.trim() === "") {
			this.tableContainer.setText(
				`Project "${currentNovelProject.name}" has no folder path configured.`
			);
			return;
		}

		const files = this.app.vault.getMarkdownFiles();
		let chapterFiles = files.filter((file) =>
			isFileInFolder(file, chaptersFolderPath)
		);

		// Apply Filters
		if (this.filterValue !== "all") {
			chapterFiles = chapterFiles.filter((file) => {
				const fileCache = this.app.metadataCache.getFileCache(file);
				const propValue =
					fileCache?.frontmatter?.[propertyNameToChange];
				return propValue === this.filterValue;
			});
		}
		if (this.searchTerm) {
			chapterFiles = chapterFiles.filter((file) =>
				file.basename
					.toLowerCase()
					.includes(this.searchTerm.toLowerCase())
			);
		}

		chapterFiles.sort((a, b) => a.path.localeCompare(b.path));

		if (chapterFiles.length === 0) {
			this.tableContainer.setText(
				`No chapters found in "${chaptersFolderPath}" matching your criteria.`
			);
			return;
		}

		const table = this.tableContainer.createEl("table", {
			cls: "novel-chapter-table",
		});
		const headerRow = table.createEl("thead").createEl("tr");

		headerRow.createEl("th", { text: `Chapter (${chapterFiles.length})` });
		if (propertyNameToChange && optionsArray.length > 0) {
			const propertyHeader =
				propertyColumnHeader.trim() || propertyNameToChange;
			headerRow.createEl("th", { text: propertyHeader });
		}
		// The "Actions" header column has been removed.

		const tbody = table.createEl("tbody");
		for (const file of chapterFiles) {
			const row = tbody.createEl("tr");
			const chapterCell = row.createEl("td");
			const chapterLink = chapterCell.createEl("a", {
				text: file.basename,
				href: "#",
				cls: "internal-link",
			});

			chapterLink.addEventListener("click", (ev) => {
				ev.preventDefault();
				this.app.workspace.openLinkText(file.path, "", false);
			});

			// --- CONTEXT MENU ---
			chapterLink.addEventListener("contextmenu", (ev: MouseEvent) => {
				ev.preventDefault();
				const menu = new Menu();

				menu.addItem((item) =>
					item
						.setTitle("Rename")
						.setIcon("pencil")
						.onClick(() => {
							this.plugin.promptAndRenameChapter(file);
						})
				);

				menu.addItem((item) =>
					item
						.setTitle("Delete")
						.setIcon("trash")
						.onClick(() => {
							this.plugin.promptAndDeleteChapter(file);
						})
				);

				menu.showAtMouseEvent(ev);
			});

			if (propertyNameToChange && optionsArray.length > 0) {
				const propertyCell = row.createEl("td");
				const selectEl = propertyCell.createEl("select");
				const fileCache = this.app.metadataCache.getFileCache(file);
				const currentPropertyValue =
					fileCache?.frontmatter?.[propertyNameToChange] || "";

				const defaultOption = selectEl.createEl("option", {
					text: "--- Select ---",
					value: "",
				});
				if (!currentPropertyValue) defaultOption.selected = true;

				optionsArray.forEach((option) => {
					const optionEl = selectEl.createEl("option", {
						text: option,
						value: option,
					});
					if (option === currentPropertyValue)
						optionEl.selected = true;
				});

				selectEl.addEventListener("change", async (event) => {
					const newValue = (event.target as HTMLSelectElement).value;
					await this.plugin.updateChapterProperty(
						file,
						propertyNameToChange,
						newValue
					);
				});
			}
		}
	}
}

export default class NovelChapterPlugin extends Plugin {
	settings: InternalNovelChapterPluginSettings;

	// Helper to get sorted chapters for a given project path
	public getProjectChapters(projectPath: string): TFile[] {
		if (!projectPath || projectPath.trim() === "") return [];
		const allMarkdownFiles = this.app.vault.getMarkdownFiles();
		const chapterFiles = allMarkdownFiles.filter((file) =>
			isFileInFolder(file, projectPath)
		);
		chapterFiles.sort((a, b) => a.path.localeCompare(b.path));
		return chapterFiles;
	}

	// Helper to find which project a file belongs to
	public findProjectForFile(file: TFile): NovelProject | null {
		if (!file) return null;
		return (
			this.settings.novelProjects.find(
				(p) => p.path && isFileInFolder(file, p.path)
			) || null
		);
	}

	// Method to update a chapter's frontmatter property
	public async updateChapterProperty(
		file: TFile,
		propertyName: string,
		newValue: string
	): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				if (newValue === "") delete fm[propertyName];
				else fm[propertyName] = newValue;
			});
			new Notice(`Chapter '${file.basename}' ${propertyName} updated.`);
		} catch (error) {
			console.error(
				`Error updating frontmatter for ${file.path}:`,
				error
			);
			new Notice(
				`Failed to update ${propertyName} for ${file.basename}.`
			);
		}
	}

	// Method to prompt for renaming a chapter
	public async promptAndRenameChapter(file: TFile): Promise<void> {
		const currentName = file.basename;
		new ChapterNameModal(
			this.app,
			"Rename Chapter",
			"Rename",
			currentName,
			async (newName) => {
				if (newName && newName !== currentName) {
					await this.renameChapter(file, newName);
				}
			}
		).open();
	}

	// Actual logic to rename the chapter file
	private async renameChapter(file: TFile, newName: string): Promise<void> {
		const sanitizedFileName = newName.replace(/[\\/:*?"<>|]/g, "").trim();
		if (sanitizedFileName === "") {
			new Notice("Invalid chapter name provided.");
			return;
		}
		if (!file.parent) {
			new Notice("Cannot rename file: No parent folder found.");
			console.error("Could not find parent for file:", file.path);
			return;
		}
		const newPath = `${file.parent.path}/${sanitizedFileName}.md`;
		if (await this.app.vault.adapter.exists(normalizePath(newPath))) {
			new Notice(
				`A chapter named "${sanitizedFileName}.md" already exists.`
			);
			return;
		}
		try {
			await this.app.fileManager.renameFile(file, newPath);
			new Notice(`Chapter renamed to "${sanitizedFileName}".`);
		} catch (error) {
			console.error("Error renaming file:", error);
			new Notice("Failed to rename chapter. See console for details.");
		}
	}

	// Method to prompt for chapter deletion
	public async promptAndDeleteChapter(file: TFile): Promise<void> {
		new ConfirmationModal(
			this.app,
			`Are you sure you want to delete "${file.basename}"? This will move the file to the trash.`,
			async () => await this.deleteChapter(file)
		).open();
	}

	// Actual logic to delete the chapter file
	private async deleteChapter(file: TFile): Promise<void> {
		try {
			await this.app.vault.trash(file, true);
			new Notice(`Chapter "${file.basename}" moved to trash.`);
		} catch (error) {
			console.error("Error deleting file:", error);
			new Notice("Failed to delete chapter. See console for details.");
		}
	}

	// Refactored method to prompt for chapter name and create the chapter
	public async promptAndCreateNewChapter(
		projectId: string | null
	): Promise<void> {
		if (!projectId) {
			new Notice("Please select a novel project first.");
			return;
		}
		const currentNovelProject = this.settings.novelProjects.find(
			(p) => p.id === projectId
		);
		if (!currentNovelProject || !currentNovelProject.path?.trim()) {
			new Notice(
				"The selected project does not have a valid folder path configured."
			);
			return;
		}

		new ChapterNameModal(
			this.app,
			"Enter New Chapter Name",
			"Create Chapter",
			"",
			async (chapterName) => {
				const sanitizedFileName = chapterName
					.replace(/[\\/:*?"<>|]/g, "")
					.trim();
				if (sanitizedFileName === "") {
					new Notice("Invalid chapter name.");
					return;
				}

				const folderPath = normalizePath(currentNovelProject.path);
				if (!(await this.app.vault.adapter.exists(folderPath))) {
					new Notice(
						`Project folder "${folderPath}" does not exist.`
					);
					return;
				}

				const filePath = normalizePath(
					`${folderPath}/${sanitizedFileName}.md`
				);
				if (await this.app.vault.adapter.exists(filePath)) {
					new Notice(
						`A chapter named "${sanitizedFileName}.md" already exists.`
					);
					return;
				}

				let fileContent = "";
				const templatePath = this.settings.chapterTemplatePath?.trim();
				if (templatePath) {
					const normalizedTemplatePath = normalizePath(templatePath);
					const templateFile = this.app.vault.getAbstractFileByPath(
						normalizedTemplatePath
					);
					if (templateFile instanceof TFile) {
						fileContent = await this.app.vault.read(templateFile);
						const today = new Date();
						const formattedDate = `${today.getFullYear()}-${String(
							today.getMonth() + 1
						).padStart(2, "0")}-${String(today.getDate()).padStart(
							2,
							"0"
						)}`;
						fileContent = fileContent.replace(
							/\{\{title\}\}/gi,
							chapterName
						);
						fileContent = fileContent.replace(
							/\{\{date\}\}/gi,
							formattedDate
						);
					} else {
						new Notice(
							`Template file not found at "${templatePath}". Creating a default chapter.`
						);
					}
				}

				if (fileContent === "") {
					const { propertyNameToChange } = this.settings;
					fileContent = `---\ntitle: ${chapterName}\n`;
					if (propertyNameToChange)
						fileContent += `${propertyNameToChange}: ""\n`;
					fileContent += `---\n\n# ${chapterName}\n\n`;
				}

				try {
					await this.app.vault.create(filePath, fileContent);
					new Notice(
						`Chapter "${chapterName}" created successfully.`
					);
				} catch (error) {
					console.error("Error creating new chapter:", error);
					new Notice(
						"Failed to create new chapter. Check console for details."
					);
				}
			}
		).open();
	}

	async onload() {
		console.log("Novel Chapter Plugin loaded");

		await this.loadSettings();
		this.addSettingTab(new NovelChapterPluginSettingsTab(this.app, this));

		this.registerView(
			NOVEL_CHAPTER_VIEW_TYPE,
			(leaf) => new NovelChapterView(leaf, this)
		);

		this.addCommand({
			id: "open-novel-chapter-view",
			name: "Open Novel Chapter View",
			callback: () => this.activateView(),
		});

		// --- Add New Chapter Command ---
		this.addCommand({
			id: "add-new-chapter-to-project",
			name: "Novel Chapters: Create New Chapter in Project",
			callback: () => {
				let targetProjectId = this.settings.lastSelectedNovelId;
				if (
					!targetProjectId &&
					this.settings.novelProjects.length === 1
				) {
					targetProjectId = this.settings.novelProjects[0].id;
				}
				if (!targetProjectId) {
					new Notice(
						"Cannot determine project. Please select a project in the Novel Chapters view."
					);
					return;
				}
				this.promptAndCreateNewChapter(targetProjectId);
			},
		});

		// --- Navigation Commands ---
		this.addCommand({
			id: "open-next-chapter-in-project",
			name: "Novel Chapters: Open Next Chapter",
			checkCallback: (checking: boolean) => {
				const currentFile = this.app.workspace.getActiveFile();
				if (!currentFile) return false;
				const project = this.findProjectForFile(currentFile);
				if (!project) return false;
				if (checking) return true;
				const chapters = this.getProjectChapters(project.path);
				const currentIndex = chapters.findIndex(
					(chap) => chap.path === currentFile.path
				);
				if (currentIndex !== -1 && currentIndex < chapters.length - 1) {
					this.app.workspace.openLinkText(
						chapters[currentIndex + 1].path,
						"",
						false
					);
				} else {
					new Notice("This is the last chapter.");
				}
			},
		});

		this.addCommand({
			id: "open-previous-chapter-in-project",
			name: "Novel Chapters: Open Previous Chapter",
			checkCallback: (checking: boolean) => {
				const currentFile = this.app.workspace.getActiveFile();
				if (!currentFile) return false;
				const project = this.findProjectForFile(currentFile);
				if (!project) return false;
				if (checking) return true;
				const chapters = this.getProjectChapters(project.path);
				const currentIndex = chapters.findIndex(
					(chap) => chap.path === currentFile.path
				);
				if (currentIndex > 0) {
					this.app.workspace.openLinkText(
						chapters[currentIndex - 1].path,
						"",
						false
					);
				} else {
					new Notice("This is the first chapter.");
				}
			},
		});

		this.addRibbonIcon("list-ordered", "Open Novel Chapter View", () =>
			this.activateView()
		);

		this.registerEvent(
			this.app.vault.on("create", (file) =>
				this.handleFileChange(file as TFile)
			)
		);
		this.registerEvent(
			this.app.vault.on("modify", (file) =>
				this.handleFileChange(file as TFile)
			)
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) =>
				this.handleFileChange(file as TFile)
			)
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) =>
				this.handleFileChange(file as TFile, oldPath)
			)
		);
	}

	onunload() {
		console.log("Novel Chapter Plugin unloaded");
		this.app.workspace.detachLeavesOfType(NOVEL_CHAPTER_VIEW_TYPE);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);

		// Data integrity checks
		if (
			!Array.isArray(this.settings.novelProjects) ||
			this.settings.novelProjects.length === 0
		) {
			this.settings.novelProjects = [
				{
					id: `default-load-${Date.now()}`,
					name: "Default Novel",
					path: "",
				},
			];
		}
		this.settings.novelProjects = this.settings.novelProjects.map(
			(p: Partial<NovelProject>): NovelProject => ({
				id: p.id || `generated-${Date.now()}`,
				name: p.name || "Unnamed Novel",
				path: p.path || "",
			})
		);

		if (
			this.settings.lastSelectedNovelId &&
			!this.settings.novelProjects.find(
				(p) => p.id === this.settings.lastSelectedNovelId
			)
		) {
			this.settings.lastSelectedNovelId =
				this.settings.novelProjects.length > 0
					? this.settings.novelProjects[0].id
					: null;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.refreshNovelChapterView(true);
	}

	refreshNovelChapterView(settingsChanged = false) {
		this.app.workspace
			.getLeavesOfType(NOVEL_CHAPTER_VIEW_TYPE)
			.forEach((leaf) => {
				if (leaf.view instanceof NovelChapterView) {
					leaf.view.updateView(settingsChanged);
				}
			});
	}

	private async handleFileChange(file: TFile, oldPath?: string) {
		if (!(file instanceof TFile) || file.extension !== "md") return;

		const isRelevantChange = this.settings.novelProjects.some((project) => {
			if (!project.path) return false;
			const projectPath = normalizePath(project.path);
			const inCurrentPath = normalizePath(file.path).startsWith(
				projectPath + "/"
			);
			const inOldPath = oldPath
				? normalizePath(oldPath).startsWith(projectPath + "/")
				: false;
			return inCurrentPath || inOldPath;
		});

		if (isRelevantChange) {
			await sleep(150); // Small delay to allow cache to update
			this.refreshNovelChapterView(false);
		}
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(
			NOVEL_CHAPTER_VIEW_TYPE
		)[0];
		if (!leaf) {
			leaf =
				workspace.getRightLeaf(false) ??
				workspace.getLeaf("split", "vertical");
			await leaf.setViewState({
				type: NOVEL_CHAPTER_VIEW_TYPE,
				active: true,
			});
		}
		workspace.revealLeaf(leaf);
	}
}
