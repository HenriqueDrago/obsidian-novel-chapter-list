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
	setIcon,
	TFolder,
	MenuItem,
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

// Default settings with internal properties
const DEFAULT_SETTINGS: InternalNovelChapterPluginSettings = {
	...EXTERNAL_DEFAULT_SETTINGS, // Spread the external default settings
	lastSelectedNovelId: null, // Initialize last selected novel ID to null
	// Ensure novelProjects is initialized properly
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
	if (!folderPath || folderPath.trim() === "") return false; // If no folder path is provided, return false
	const normalizedFilePath = normalizePath(file.path); // Normalize the file path
	let normalizedFolderPath = normalizePath(folderPath); // Normalize the folder path

	// Ensure the folder path ends with a slash for accurate comparison
	if (!normalizedFolderPath.endsWith("/")) {
		normalizedFolderPath += "/";
	}
	return normalizedFilePath.startsWith(normalizedFolderPath); // Check if the file path starts with the folder path
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

	// When opened, display the modal with confirmation message and buttons
	onOpen() {
		const { contentEl } = this;
		contentEl.empty(); // Clear existing content
		contentEl.addClass("confirm-modal");
		contentEl.createEl("p", { text: this.message });

		// Create a button container for the modal
		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container",
		});

		// Create Confirm button
		new ButtonComponent(buttonContainer)
			.setButtonText("Confirm")
			.setWarning()
			.onClick(() => {
				this.onConfirm(); // Call the confirm callback
				this.close(); // Call close to hide the modal
			});

		// Create Cancel button
		new ButtonComponent(buttonContainer)
			.setButtonText("Cancel")
			.onClick(() => {
				this.close(); // Call close to hide the modal
			});
	}

	// When closed, clear the content
	onClose() {
		this.contentEl.empty();
	}
}

// Modal for getting chapter name (Used for creating and renaming chapters)
class ChapterNameModal extends Modal {
	result: string | null = null; // Result to store the chapter name
	onSubmit: (result: string) => void; // Callback to execute on submit
	private initialValue: string; // Initial value for the input field
	private modalTitle: string; // Title of the modal
	private ctaButtonText: string; // Text for the call-to-action button

	// Constructor to initialize the modal with title, button text, initial value, and submit callback
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

	// When opened, display the modal with input field and buttons
	onOpen() {
		const { contentEl } = this; // Get the content element of the modal
		contentEl.empty(); // Clear existing content

		contentEl.createEl("h2", { text: this.modalTitle }); // Set the modal title

		// Create a container for the input field
		const inputContainer = contentEl.createDiv({
			cls: "modal-input-container",
		});
		// Create a text input field for the chapter name
		const textInput = new TextComponent(inputContainer)
			.setPlaceholder("Chapter name")
			.setValue(this.initialValue);
		textInput.inputEl.addClass("modal-text-input");
		textInput.inputEl.focus(); // Focus the input field when the modal opens

		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container",
		});

		// Create a submit button with the provided text
		const submitButton = new ButtonComponent(buttonContainer)
			.setButtonText(this.ctaButtonText)
			.setCta(); // Set the button as a call-to-action

		// Function to handle the submit action
		const doSubmit = () => {
			const chapterName = textInput.getValue().trim(); // Get the trimmed value from the input field
			// Validate the chapter name
			// If the chapter name is not empty, set the result and close the modal
			if (chapterName) {
				this.result = chapterName;
				this.close();
				this.onSubmit(this.result);
			} else {
				new Notice("Chapter name cannot be empty.");
			}
		};

		submitButton.onClick(doSubmit); // Attach the submit function to the button click event

		// Add a Cancel button to close the modal without submitting
		new ButtonComponent(buttonContainer)
			.setButtonText("Cancel")
			.onClick(() => this.close());

		// Add an event listener to handle Enter key press for submitting
		textInput.inputEl.addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				doSubmit();
			}
		});
	}

	// When closed, clear the content of the modal
	onClose() {
		this.contentEl.empty();
	}
}

// Modal for creating a new chapter, with folder selection
class NewChapterModal extends Modal {
	onSubmit: (folderPath: string, chapterName: string) => void; // Callback to execute on submit
	private folderOptions: { name: string; path: string }[]; // List of options for the folder selector
	private modalTitle: string; // Title of the Modal
	private ctaButtonText: string; // Text of the call-to-action button

	constructor(
		app: App,
		title: string,
		ctaText: string,
		folderOptions: { name: string; path: string }[],
		onSubmit: (folderPath: string, chapterName: string) => void
	) {
		super(app);
		this.modalTitle = title;
		this.ctaButtonText = ctaText;
		this.folderOptions = folderOptions;
		this.onSubmit = onSubmit;
	}

	// Execute on open
	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: this.modalTitle });

		// Text input for the new chapter name
		const textInput = new TextComponent(contentEl)
			.setPlaceholder("Chapter name");
		textInput.inputEl.addClass("modal-text-input");
		textInput.inputEl.focus(); // Focus on the name input first

		// Dropdown for folder selection
		const folderSelectContainer = contentEl.createDiv({ cls: "modal-folder-select-container" });
		folderSelectContainer.createEl("label", { text: "Create in folder: "});
		const folderSelectEl = folderSelectContainer.createEl("select");
		
		// Set the options for the dropdown
		this.folderOptions.forEach(opt => {
			folderSelectEl.createEl("option", {
				text: opt.name,
				value: opt.path
			});
		});

		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container",
		});

		// OnSubmit action (confirm button)
		const doSubmit = () => {
			const chapterName = textInput.getValue().trim(); // Get chapter name
			const selectedFolderPath = folderSelectEl.value; // Get selected folder

			// Check if there's a chapter name selected
			if (chapterName) {
				this.close();
				this.onSubmit(selectedFolderPath, chapterName);
			} else {
				new Notice("Chapter name cannot be empty.");
			}
		};

		new ButtonComponent(buttonContainer)
			.setButtonText(this.ctaButtonText)
			.setCta()
			.onClick(doSubmit);

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
	plugin: NovelChapterPlugin; // Reference to the plugin instance
	controlsContainer: HTMLDivElement; // Container for controls (like buttons and selectors)
	tableContainer: HTMLDivElement; // Container for the chapter table
	selectedNovelProjectId: string | null = null; // ID of the currently selected novel project

	// State for filtering and searching
	private searchTerm = "";
	private filterValue = "all";

	constructor(leaf: WorkspaceLeaf, plugin: NovelChapterPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	// Returns the view type for this custom view
	getViewType(): string {
		return NOVEL_CHAPTER_VIEW_TYPE;
	}

	// Returns the display text for the view, which is shown in the sidebar
	getDisplayText(): string {
		const selectedProject = this.plugin.settings.novelProjects.find(
			(p) => p.id === this.selectedNovelProjectId
		);
		return selectedProject
			? `Chapters: ${selectedProject.name}`
			: "Novel Chapters";
	}

	// Returns the icon for the view, which is shown in the sidebar
	getIcon(): string {
		return "list-ordered";
	}

	// Called when the view is opened
	async onOpen(): Promise<void> {
		const contentEl = this.containerEl.children[1]; // Get the content element of the view
		contentEl.empty(); // Clear existing content
		contentEl.addClass("novel-chapter-view-container");

		// Create containers for controls and the chapter table
		this.controlsContainer = contentEl.createDiv({
			cls: "novel-chapter-controls",
		});
		this.tableContainer = contentEl.createDiv({
			cls: "novel-chapter-table-container",
		});

		await this.updateView(true); // Initial render of the view
	}

	// Called when the view is closed
	async onClose(): Promise<void> {
		// Nothing to clean up
	}

	// Renders the controls and settings for the plugin
	async updateView(settingsHaveChanged = false) {
		// If settings have changed, re-render the controls
		if (settingsHaveChanged) {
			await this.renderControls();
		}

		// Render the chapter table
		// Check if a novel project is selected
		if ( 
			!this.selectedNovelProjectId ||
			!this.plugin.settings.novelProjects.find(
				(p) => p.id === this.selectedNovelProjectId
			)
		) {
			// Check if the last selected novel ID is set and valid
			if (
				this.plugin.settings.lastSelectedNovelId &&
				this.plugin.settings.novelProjects.find(
					(p) => p.id === this.plugin.settings.lastSelectedNovelId
				)
			) {
				// If valid, set it as the selected project ID
				this.selectedNovelProjectId =
					this.plugin.settings.lastSelectedNovelId;
			
			// If no valid last selected novel ID, default to the first project if available
			} else if (this.plugin.settings.novelProjects.length > 0) {
				this.selectedNovelProjectId =
					this.plugin.settings.novelProjects[0].id;
			} else {
				// If no projects are available, reset the selected project ID to null
				this.selectedNovelProjectId = null;
			}

			// Update the select element to reflect the current selection
			const selectEl = this.controlsContainer.querySelector(
				"select.novel-project-selector"
			) as HTMLSelectElement | null;
			// If the select element exists, set its value to the selected project ID
			if (selectEl && this.selectedNovelProjectId) {
				selectEl.value = this.selectedNovelProjectId;
			} else if (
				// If no project is selected and the select element exists, set it to the first project
				selectEl &&
				!this.selectedNovelProjectId &&
				this.plugin.settings.novelProjects.length > 0
			) {
				selectEl.value = this.plugin.settings.novelProjects[0].id;
			}
		}

		this.updateLeafDisplayText(); // Update the leaf display text based on the selected project
		await this.renderChapterTable(); // Render the chapter table based on the selected project
	}

	// Updates the leaf display text to reflect the current project
	private updateLeafDisplayText() {
		if (this.leaf) {
			this.leaf.setViewState(this.leaf.getViewState());
		}
	}

	// Renders the controls for managing novel projects
	async renderControls(): Promise<void> {
		this.controlsContainer.empty(); // Clear existing controls
		const projects = this.plugin.settings.novelProjects; // Get the list of novel projects

		// If no projects are available, show a message
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

		// Project Selector Dropdown
		const selectEl = controlsLine1.createEl("select");
		selectEl.addClass("novel-project-selector");
		// Create an option for each project
		projects.forEach((project) => {
			selectEl.createEl("option", {
				text: project.name || "Unnamed Novel", // Fallback for unnamed projects
				value: project.id, // Use project ID as the value
			});
		});

		// Set the selected project based on the current selection
		if (
			this.selectedNovelProjectId &&
			projects.find((p) => p.id === this.selectedNovelProjectId)
		) {
			selectEl.value = this.selectedNovelProjectId;
		// If no project is selected, default to the first project
		} else if (projects.length > 0) {
			this.selectedNovelProjectId = projects[0].id;
			selectEl.value = this.selectedNovelProjectId;
		}

		// Event listener for when the selected project changes
		selectEl.addEventListener("change", async (event) => {
			// Update the selected project ID based on the dropdown selection
			this.selectedNovelProjectId = (
				event.target as HTMLSelectElement
			).value;
			this.plugin.settings.lastSelectedNovelId =
				this.selectedNovelProjectId;
			await this.plugin.saveSettings(); // Save the settings with the new selected project ID
			this.updateLeafDisplayText(); // Update the leaf display text
			await this.renderChapterTable(); // Re-render the chapter table for the selected project
		});

		new ButtonComponent(controlsLine1)
			.setIcon("file-symlink")
			.setTooltip("Open Template Folder")
			.onClick(() => {
				// Get the template path
				const templatePath = this.plugin.settings.chapterTemplatePath;

				// Check if template path exist
				if(!templatePath || templatePath.trim() === "") {
					new Notice("Chapter template path is not configured in settings.");
            		return;
				}

				// Get current open file
				const currentFile = this.app.workspace.getActiveFile();

				this.app.workspace.openLinkText(
						templatePath,
						"",
						!currentFile
					);
			});

		// Previous Chapter Button
		new ButtonComponent(controlsLine1)
			.setIcon("chevron-left")
			.setTooltip("Previous Chapter")
			.onClick(() => {
				// Get the currently active file in the workspace
				const currentFile = this.app.workspace.getActiveFile();
				// If no file is open, show a notice
				if (!currentFile) {
					new Notice("Open a chapter file to use navigation.");
					return;
				}
				// Find the project for the current file
				const project = this.plugin.findProjectForFile(currentFile);
				// If the project is not found or doesn't match the selected project, show a notice
				if (!project || project.id !== this.selectedNovelProjectId) {
					new Notice(
						"The active chapter doesn't belong to the selected project."
					);
					return;
				}
				// Get the chapters for the current project
				const chapters = this.plugin.getProjectChapters(project.path);
				// Find the index of the current chapter
				const currentIndex = chapters.findIndex(
					(chap) => chap.path === currentFile.path
				);
				// If the current chapter is found and is not the first one, open the previous chapter
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
				// Get the currently active file in the workspace
				const currentFile = this.app.workspace.getActiveFile();
				// If no file is open, show a notice
				if (!currentFile) {
					new Notice("Open a chapter file to use navigation.");
					return;
				}
				// Find the project for the current file
				const project = this.plugin.findProjectForFile(currentFile);
				if (!project || project.id !== this.selectedNovelProjectId) {
					new Notice(
						"The active chapter doesn't belong to the selected project."
					);
					return;
				}
				// Get the chapters for the current project
				const chapters = this.plugin.getProjectChapters(project.path);
				// Find the index of the current chapter
				const currentIndex = chapters.findIndex(
					(chap) => chap.path === currentFile.path
				);
				// If the current chapter is found and is not the last one, open the next chapter
				if (currentIndex !== -1 && currentIndex < chapters.length - 1) {
					this.app.workspace.openLinkText(
						chapters[currentIndex + 1].path,
						"",
						false
					);
				} else {
					new Notice("This is the last chapter.");
				}
			});

			// New Chapter Button
			new ButtonComponent(controlsLine1)
			.setIcon("plus")
			.setTooltip("New Chapter")
			.setClass("novel-chapter-new-button")
			.onClick(async () => {
				// Prompt the user to create a new chapter in the selected project
				await this.plugin.promptAndCreateNewChapter(
					this.selectedNovelProjectId
				);
			});

		// Search Input
		new TextComponent(controlsLine2)
			.setPlaceholder("Search chapters...")
			.setValue(this.searchTerm)
			.onChange((value) => {
				this.searchTerm = value;
				this.renderChapterTable(); // Re-render the chapter table with the new search term
			})
			.inputEl.addClass("novel-chapter-search-input");

		// Property Filter Dropdown
		const { propertyOptions } = this.plugin.settings;
		// If there are property options defined, create a filter dropdown
		const optionsArray = propertyOptions
			.split(",")
			.map((opt) => opt.trim())
			.filter((opt) => opt.length > 0);
		// If there are options to filter by, create a select element
		if (optionsArray.length > 0) {
			const filterSelect = controlsLine2.createEl("select");
			filterSelect.addClass("novel-chapter-filter-select");
			filterSelect.createEl("option", {
				text: "Filter by property...",
				value: "all",
			});
			// Create an option for each property in the options array
			optionsArray.forEach((option) => {
				filterSelect.createEl("option", {
					text: option,
					value: option,
				});
			});
			// Set the current filter value
			filterSelect.value = this.filterValue;
			// Event listener for when the filter value changes
			filterSelect.addEventListener("change", (event) => {
				this.filterValue = (event.target as HTMLSelectElement).value;
				this.renderChapterTable(); // Re-render the chapter table with the new filter value
			});
		}
	}

	// Renders the chapter table based on the selected novel project
	async renderChapterTable(): Promise<void> {
		this.tableContainer.empty(); // Clear existing table content

		if (!this.selectedNovelProjectId) return; // If no project is selected, do nothing

		// Find the current novel project based on the selected ID
		const currentNovelProject = this.plugin.settings.novelProjects.find(
			(p) => p.id === this.selectedNovelProjectId
		);
		// If the project is not found, show an error message
		if (!currentNovelProject) {
			this.tableContainer.setText("Selected novel project not found.");
			return;
		}

		// Get the chapters folder path for the current project
		const { path: chaptersFolderPath } = currentNovelProject;
		// Get the property settings for filtering
		const { propertyNameToChange, propertyColumnHeader, propertyOptions } =
			this.plugin.settings;
		// Split the property options into an array
		const optionsArray = propertyOptions
			.split(",")
			.map((opt) => opt.trim())
			.filter((opt) => opt.length > 0);

		// If no chapters folder path is configured, show a message
		if (!chaptersFolderPath || chaptersFolderPath.trim() === "") {
			this.tableContainer.setText(
				`Project "${currentNovelProject.name}" has no folder path configured.`
			);
			return;
		}

		// Normalize the chapters folder path and get all markdown files in it
		const normalizedChaptersFolderPath = normalizePath(chaptersFolderPath);
		const files = this.app.vault.getMarkdownFiles();
		let chapterFiles = files.filter((file) =>
			isFileInFolder(file, normalizedChaptersFolderPath)
		);

		// Apply Property Filter
		if (this.filterValue !== "all") {
			chapterFiles = chapterFiles.filter((file) => {
				const fileCache = this.app.metadataCache.getFileCache(file);
				const propValue =
					fileCache?.frontmatter?.[propertyNameToChange];
				return propValue === this.filterValue;
			});
		}
		// Apply Search Term Filter
		if (this.searchTerm) {
			chapterFiles = chapterFiles.filter((file) =>
				file.basename
					.toLowerCase()
					.includes(this.searchTerm.toLowerCase())
			);
		}

		// If no chapters are found, show a message
		if (chapterFiles.length === 0) {
			this.tableContainer.setText(
				`No chapters found in "${normalizedChaptersFolderPath}" matching your criteria.`
			);
			return;
		}

		const OTHER_GROUP_NAME = this.plugin.settings.otherGroupName || "Other"; // Default name for the "Other" group
		const groupedChapters = new Map<string, TFile[]>(); // Map to group chapters by their folder name

		// Group chapters by their folder name
		for (const file of chapterFiles) {
			// Normalize the file path and extract the relative path
			const folderPathWithSlash = normalizedChaptersFolderPath.endsWith("/")
				? normalizedChaptersFolderPath
				: `${normalizedChaptersFolderPath}/`;
			const relativePath = normalizePath(file.path).substring(
				folderPathWithSlash.length
			);
			const pathParts = relativePath.split("/");

			// Use the first part of the path as the group name, or "Other" if no group is specified
			let groupName = OTHER_GROUP_NAME;
			// If the path has more than one part, use the first part as the group name
			if (pathParts.length > 1) {
				groupName = pathParts[0];
			}

			// If the group name is empty (that means, it has one part), use "Other"
			if (!groupedChapters.has(groupName)) {
				groupedChapters.set(groupName, []);
			}
			// Add the file to the corresponding group
			groupedChapters.get(groupName)?.push(file);
		}

		// Sort the groups and their files
		for (const filesInGroup of groupedChapters.values()) {
			filesInGroup.sort((a, b) => a.path.localeCompare(b.path));
		}

		// Sort the group names, ensuring "Other" is always at the end
		const sortedGroupNames = Array.from(groupedChapters.keys()).sort((a, b) => {
			if (a === OTHER_GROUP_NAME) return 1;
			if (b === OTHER_GROUP_NAME) return -1;
			return a.localeCompare(b);
		});

		// Calculate the total count of chapters, excluding "Other" group if configured
		let totalCount = chapterFiles.length;
		if (
			this.plugin.settings.excludeOtherFromCount &&
			groupedChapters.has(OTHER_GROUP_NAME)
		) {
			totalCount -= groupedChapters.get(OTHER_GROUP_NAME)!.length;
		}

		const table = this.tableContainer.createEl("table", {
			cls: "novel-chapter-table",
		});

		// Calculate the number of columns based on whether a property is being changed
		const numColumns =
			1 + (propertyNameToChange && optionsArray.length > 0 ? 1 : 0);

		// Render Table Header with new total count
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: `Chapter (${totalCount})` });
		if (propertyNameToChange && optionsArray.length > 0) {
			const propertyHeader =
				propertyColumnHeader.trim() || propertyNameToChange;
			headerRow.createEl("th", { text: propertyHeader });
		}

		// Render Table Body with grouped chapters
		const tbody = table.createEl("tbody");
		for (const groupName of sortedGroupNames) {
			// Create a header row for each group
			const groupFiles = groupedChapters.get(groupName)!;
			// Generate a unique ID for the group based on its name
			const groupId = `group-${groupName.replace(/[^a-zA-Z0-9]/g, "-")}`;

			const groupHeaderRow = tbody.createEl("tr", {
				cls: "chapter-group-header",
			});

			// Create a header cell that spans all columns
			const groupHeaderCell = groupHeaderRow.createEl("td");
			groupHeaderCell.colSpan = numColumns;

			// Create a toggle icon for expanding/collapsing the group
			const iconEl = groupHeaderCell.createSpan({ cls: "group-toggle-icon" });
			setIcon(iconEl, "chevron-down");

			// Create a span for the group name and count
			groupHeaderCell.createSpan({
				text: ` ${groupName} (${groupFiles.length})`,
			});

			// Add an event listener to toggle the visibility of the group rows
			groupHeaderRow.addEventListener("click", () => {
				const isCollapsed = groupHeaderRow.classList.toggle("collapsed");
				setIcon(iconEl, isCollapsed ? "chevron-right" : "chevron-down");

				const chapterRows = tbody.querySelectorAll<HTMLElement>(
					`tr.chapter-data-row[data-group-id="${groupId}"]`
				);
				chapterRows.forEach((row) => {
					row.style.display = isCollapsed ? "none" : "";
				});
			});

			// For each file in the group, create a row in the table
			for (const file of groupFiles) {
				const row = tbody.createEl("tr", { cls: "chapter-data-row" });
				row.dataset.groupId = groupId;

				const chapterCell = row.createEl("td");
				const chapterLink = chapterCell.createEl("a", {
					text: file.basename,
					href: "#",
					cls: "internal-link",
				});

				// Set the icon for the chapter link
				chapterLink.addEventListener("click", (ev) => {
					ev.preventDefault();
					this.app.workspace.openLinkText(file.path, "", false);
				});

				// Add a context menu for the chapter link
				// This allows for actions like renaming, deleting, and moving chapters
				chapterLink.addEventListener("contextmenu", (ev: MouseEvent) => {
					ev.preventDefault();
					const menu = new Menu();

					// Rename Action
					menu.addItem((item: MenuItem) =>
						item
							.setTitle("Rename")
							.setIcon("pencil")
							.onClick(() => {
								this.plugin.promptAndRenameChapter(file); // Prompt the user to rename the chapter
							})
					);

					// Delete Action
					menu.addItem((item: MenuItem) =>
						item
							.setTitle("Delete")
							.setIcon("trash")
							.onClick(() => {
								this.plugin.promptAndDeleteChapter(file); // Prompt the user to confirm deletion of the chapter
							})
					);

					menu.addSeparator();

					// Move Action - Opens a new menu onClick
					menu.addItem((item: MenuItem) => {
						item
							.setTitle("Move to...")
							.setIcon("folder-move")
							.onClick(() => {
								// Create a new menu that acts as the submenu
								const folderMenu = new Menu();

								// Get all subfolders in the chapters folder
								const projectSubfolders: string[] = [];
								const projectFolder = this.app.vault.getAbstractFileByPath(
									normalizedChaptersFolderPath
								);
								// If the project folder exists and is a TFolder, iterate through its children
								// and collect subfolders
								if (projectFolder instanceof TFolder) {
									for (const child of projectFolder.children) {
										if (child instanceof TFolder) {
											projectSubfolders.push(child.path);
										}
									}
								}
								// Sort the subfolders alphabetically
								projectSubfolders.sort();

								// Get the name for the "Other" group from settings or use default
								const OTHER_GROUP_NAME = this.plugin.settings.otherGroupName || "Other";
								// Get the current file's parent path to determine if it is already in the chapters folder
								const currentFileParentPath = file.parent?.path || "";

								// Add "Other" folder option to the new menu
								folderMenu.addItem((subitem: MenuItem) => {
									subitem
										.setTitle(OTHER_GROUP_NAME)
										.setIcon("folder-up")
										.onClick(() => {
											this.plugin.moveChapter(file, normalizedChaptersFolderPath);
										});
									
									// Disable the "Other" option if the current file is already in the chapters folder
									if (currentFileParentPath === normalizedChaptersFolderPath) {
										subitem.setDisabled(true);
									}
								});

								// Add a separator if there are subfolders to avoid clutter
								if (projectSubfolders.length > 0) {
									folderMenu.addSeparator();
								}

								// Add actual subfolders to the new menu
								projectSubfolders.forEach((folderPath) => {
									const folderName = folderPath.split("/").pop() || folderPath;
									folderMenu.addItem((subitem: MenuItem) => {
										subitem
											.setTitle(folderName)
											.setIcon("folder")
											.onClick(() => {
												this.plugin.moveChapter(file, folderPath);
											});
										
										// Disable the option if the current file is already in that folder
										if (currentFileParentPath === normalizePath(folderPath)) {
											subitem.setDisabled(true);
										}
									});
								});

								// Show the new menu at the location of the original click
								folderMenu.showAtMouseEvent(ev);
							});
					});

					// Show the context menu at the mouse event location
					menu.showAtMouseEvent(ev);
				});
				
				// If a property is defined to change, create a select element for it
				if (propertyNameToChange && optionsArray.length > 0) {
					const propertyCell = row.createEl("td");
					const selectEl = propertyCell.createEl("select");
					const fileCache = this.app.metadataCache.getFileCache(file);
					const currentPropertyValue =
						fileCache?.frontmatter?.[propertyNameToChange] || "";

					// Create a default option for the select element
					const defaultOption = selectEl.createEl("option", {
						text: "--- Select ---",
						value: "",
					});
					// If the current property value is empty, set the default option as selected
					if (!currentPropertyValue) defaultOption.selected = true;

					// Create an option for each property in the options array
					optionsArray.forEach((option) => {
						const optionEl = selectEl.createEl("option", {
							text: option,
							value: option,
						});
						if (option === currentPropertyValue)
							optionEl.selected = true;
					});

					// Add an event listener to handle changes in the select element
					selectEl.addEventListener("change", async (event) => {
						const newValue = (event.target as HTMLSelectElement).value;
						// Update the chapter property with the new value
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
}

// Main plugin class
export default class NovelChapterPlugin extends Plugin {
	settings: InternalNovelChapterPluginSettings; // Plugin settings

	// Helper to get sorted chapters for a given project path
	public getProjectChapters(projectPath: string): TFile[] {
		// If the project path is empty or invalid, return an empty array	
		if (!projectPath || projectPath.trim() === "") return [];

		const allMarkdownFiles = this.app.vault.getMarkdownFiles(); // Get all markdown files in the vault
		// Filter the files to only include those in the specified project path
		const chapterFiles = allMarkdownFiles.filter((file) =>
			isFileInFolder(file, projectPath)
		);
		// Sort the chapter files by their path to maintain order
		chapterFiles.sort((a, b) => a.path.localeCompare(b.path));
		return chapterFiles;
	}

	// Method to move a chapter file to a new folder
	public async moveChapter(fileToMove: TFile, destinationFolderPath: string): Promise<void> {
		// Create the new path for the file in the destination folder
		const newPath = normalizePath(`${destinationFolderPath}/${fileToMove.name}`);

		// Check if the file is already in the destination folder
		if (fileToMove.path === newPath) {
			new Notice("Chapter is already in that folder.");
			return;
		}

		// Check if the destination folder exists
		if (await this.app.vault.adapter.exists(newPath)) {
			new Notice(`A file named "${fileToMove.name}" already exists in the destination.`);
			return;
		}

		// Attempt to rename (move) the file to the new path
		try {
			await this.app.fileManager.renameFile(fileToMove, newPath);
			new Notice(`Moved "${fileToMove.basename}" successfully.`);
		} catch (error) {
			console.error("Error moving chapter:", error);
			new Notice("Failed to move chapter. See console for details.");
		}
	}

	// Helper to find which project a file belongs to
	public findProjectForFile(file: TFile): NovelProject | null {
		if (!file) return null; // If no file is provided, return null
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
			// Process the frontmatter of the file to update the specified property
			// If the new value is empty, delete the property from frontmatter
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
		const currentName = file.basename; // Get the current chapter name

		// Create and open a modal to prompt the user for a new chapter name
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

	// Logic to rename a chapter file
	private async renameChapter(file: TFile, newName: string): Promise<void> {
		// Sanitize the new chapter name to remove invalid characters
		const sanitizedFileName = newName.replace(/[\\/:*?"<>|]/g, "").trim();

		// Check if the sanitized name is empty
		if (sanitizedFileName === "") {
			new Notice("Invalid chapter name provided.");
			return;
		}

		// Check if the file has a parent folder
		// If not, show an error message and return
		if (!file.parent) {
			new Notice("Cannot rename file: No parent folder found.");
			console.error("Could not find parent for file:", file.path);
			return;
		}

		// Create the new path for the renamed file
		const newPath = `${file.parent.path}/${sanitizedFileName}.md`;

		// Check if a file with the new name already exists
		// If it does, show a notice and return
		if (await this.app.vault.adapter.exists(normalizePath(newPath))) {
			new Notice(
				`A chapter named "${sanitizedFileName}.md" already exists.`
			);
			return;
		}

		// Attempt to rename the file using the file manager
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
		// Create and open a confirmation modal to ask the user if they want to delete the chapter
		new ConfirmationModal(
			this.app,
			`Are you sure you want to delete "${file.basename}"? This will move the file to the trash.`,
			async () => await this.deleteChapter(file)
		).open();
	}

	// Logic to delete the chapter file
	private async deleteChapter(file: TFile): Promise<void> {
		// Try to move the file to the trash
		try {
			await this.app.vault.trash(file, true);
			new Notice(`Chapter "${file.basename}" moved to trash.`);
		} catch (error) {
			console.error("Error deleting file:", error);
			new Notice("Failed to delete chapter. See console for details.");
		}
	}

	// Method to prompt for creating a new chapter
	public async promptAndCreateNewChapter(
		projectId: string | null
	): Promise<void> {

		// Check if a project ID is provided
		if (!projectId) {
			new Notice("Please select a novel project first.");
			return;
		}
		
		// Find the current novel project based on the provided ID
		const currentNovelProject = this.settings.novelProjects.find(
			(p) => p.id === projectId
		);

		// If the project is not found or does not have a valid path, show an error message
		if (!currentNovelProject || !currentNovelProject.path?.trim()) {
			new Notice(
				"The selected project does not have a valid folder path configured."
			);
			return;
		}

		const projectRootPath = normalizePath(currentNovelProject.path);
		const projectFolder = this.app.vault.getAbstractFileByPath(projectRootPath);
	
		// Create a list to hold the folder choices for the dropdown.
		const folderOptions: { name: string; path: string }[] = [];
	
		// The first option is always the project's root folder (other group)
		folderOptions.push({
			name: this.settings.otherGroupName || "Other",
			path: projectRootPath,
		});
		
		// If the project folder exists, look for subfolders inside it.
		if (projectFolder instanceof TFolder) {
			for (const child of projectFolder.children) {
				if (child instanceof TFolder) {
					// Add each subfolder to our list of options.
					folderOptions.push({
						name: child.name,
						path: child.path,
					});
				}
			}
		}

		// Create and open a modal to prompt the user for a new chapter name
		new NewChapterModal(
			this.app,
			"Enter New Chapter Name",
			"Create Chapter",
			folderOptions,
			async (selectedFolderPath, chapterName) => {

				// Sanitize the chapter name to remove invalid characters
				const sanitizedFileName = chapterName
					.replace(/[\\/:*?"<>|]/g, "")
					.trim();
				if (sanitizedFileName === "") {
					new Notice("Invalid chapter name.");
					return;
				}

				// Check if the selected folder exists
				if (!(await this.app.vault.adapter.exists(selectedFolderPath))) {
					new Notice(
						`Project folder "${selectedFolderPath}" does not exist.`
					);
					return;
				}

				// Create the full file path for the new chapter
				const filePath = normalizePath(
					`${selectedFolderPath}/${sanitizedFileName}.md`
				);

				// Check if a file with the same name already exists
				if (await this.app.vault.adapter.exists(filePath)) {
					new Notice(
						`A chapter named "${sanitizedFileName}.md" already exists.`
					);
					return;
				}

				// Prepare the content for the new chapter file
				let fileContent = "";

				// If a chapter template path is configured, read the template file
				const templatePath = this.settings.chapterTemplatePath?.trim();
				if (templatePath) {
					// Normalize the template path to ensure it is valid
					const normalizedTemplatePath = normalizePath(templatePath);
					
					// Get the template file from the vault
					// This will return an AbstractFile, which we check if it's a TFile
					const templateFile = this.app.vault.getAbstractFileByPath(
						normalizedTemplatePath
					);

					// Check if the template file exists and is a TFile
					if (templateFile instanceof TFile) {
						// Read the content of the template file
						fileContent = await this.app.vault.read(templateFile);
						
						// Replace placeholders in the template with the chapter name and current date
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

				// If no template is provided or the template is empty, create a default chapter structure
				if (fileContent === "") {
					const { propertyNameToChange } = this.settings;
					fileContent = `---\ntitle: ${chapterName}\n`;
					if (propertyNameToChange)
						fileContent += `${propertyNameToChange}: ""\n`;
					fileContent += `---\n\n# ${chapterName}\n\n`;
				}

				// Attempt to create the new chapter file in the vault
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

	// Method to activate the Novel Chapter view
	async onload() {
		console.log("Novel Chapter Plugin loaded");

		await this.loadSettings(); // Load plugin settings
		this.addSettingTab(new NovelChapterPluginSettingsTab(this.app, this)); // Add settings tab to the plugin

		// Register the Novel Chapter view type
		this.registerView(
			NOVEL_CHAPTER_VIEW_TYPE,
			(leaf) => new NovelChapterView(leaf, this)
		);

		// Add a command to open the Novel Chapter view
		this.addCommand({
			id: "open-novel-chapter-view",
			name: "Open Novel Chapter View",
			callback: () => this.activateView(),
		});

		// Add a command to create a new chapter in the last selected project
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

		// Add commands for navigating between chapters
		this.addCommand({
			id: "open-next-chapter-in-project",
			name: "Novel Chapters: Open Next Chapter",
			checkCallback: (checking: boolean) => {
				const currentFile = this.app.workspace.getActiveFile(); // Get the currently active file in the workspace
				if (!currentFile) return false; // If no file is open, return false
				const project = this.findProjectForFile(currentFile); // Find the project for the current file
				if (!project) return false; // If no project is found, return false
				if (checking) return true; // If checking, return true to indicate the command can be executed
				const chapters = this.getProjectChapters(project.path); // Get the chapters for the current project

				// Find the index of the current chapter in the chapters array
				const currentIndex = chapters.findIndex(
					(chap) => chap.path === currentFile.path
				);

				// If the current chapter is found and is not the last one, open the next chapter
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
				const currentFile = this.app.workspace.getActiveFile(); // Get the currently active file in the workspace
				if (!currentFile) return false; // If no file is open, return false
				const project = this.findProjectForFile(currentFile); // Find the project for the current file
				if (!project) return false; // If no project is found, return false
				if (checking) return true; // If checking, return true to indicate the command can be executed
				const chapters = this.getProjectChapters(project.path); // Get the chapters for the current project

				// Find the index of the current chapter in the chapters array
				const currentIndex = chapters.findIndex(
					(chap) => chap.path === currentFile.path
				);

				// If the current chapter is found and is not the first one, open the previous chapter
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

		// Add a ribbon icon to open the Novel Chapter view
		this.addRibbonIcon("list-ordered", "Open Novel Chapter View", () =>
			this.activateView()
		);

		// Register event listeners for file changes
		this.registerEvent(
			this.app.vault.on("create", (file) =>
				this.handleFileChange(file as TFile)
			)
		);

		// Register event listeners for file modifications, deletions, and renames
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

	// Method to unload the plugin
	onunload() {
		console.log("Novel Chapter Plugin unloaded");
		this.app.workspace.detachLeavesOfType(NOVEL_CHAPTER_VIEW_TYPE); // Detach all leaves of the Novel Chapter view type
	}

	// Loads the plugin settings from storage
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

	// Saves the plugin settings to storage
	async saveSettings() {
		await this.saveData(this.settings);
		this.refreshNovelChapterView(true);
	}

	// Refreshes all Novel Chapter views in the workspace
	refreshNovelChapterView(settingsChanged = false) {
		this.app.workspace
			.getLeavesOfType(NOVEL_CHAPTER_VIEW_TYPE) // Get all leaves of the Novel Chapter view type
			// Iterate through each leaf to update its view
			.forEach((leaf) => {
				if (leaf.view instanceof NovelChapterView) {
					leaf.view.updateView(settingsChanged);
				}
			});
	}

	// Handles file changes (creation, modification, deletion, renaming)
	private async handleFileChange(file: TFile, oldPath?: string) {
		if (!(file instanceof TFile) || file.extension !== "md") return; // Ignore non-markdown files

		// Check if the file change is relevant to any novel project
		const isRelevantChange = this.settings.novelProjects.some((project) => {
			if (!project.path) return false; // If no path is set for the project, skip it
			const projectPath = normalizePath(project.path); // Normalize the project path
			// Check if the file is in the current project path
			const inCurrentPath = normalizePath(file.path).startsWith(
				projectPath + "/"
			);
			// Check if the old path (if provided) is in the current project path
			const inOldPath = oldPath
				? normalizePath(oldPath).startsWith(projectPath + "/")
				: false;
			return inCurrentPath || inOldPath;
		});

		// If the change is relevant, refresh the Novel Chapter view
		if (isRelevantChange) {
			await sleep(150); // Small delay to allow cache to update
			this.refreshNovelChapterView(false); // Refresh the view to reflect changes
		}
	}

	// Activates the Novel Chapter view
	async activateView() {
		const { workspace } = this.app; // Get the workspace instance

		// If the Novel Chapter view is already open, reveal it
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(
			NOVEL_CHAPTER_VIEW_TYPE
		)[0];

		// If the view is not open, create a new leaf for it
		if (!leaf) {
			// Priority is given to the right leaf, otherwise a new vertical split leaf is created
			leaf =
				workspace.getRightLeaf(false) ??
				workspace.getLeaf("split", "vertical");
			await leaf.setViewState({
				type: NOVEL_CHAPTER_VIEW_TYPE,
				active: true,
			});
		}
		workspace.revealLeaf(leaf); // Reveal the leaf in the workspace
	}
}
