import { Plugin, WorkspaceLeaf, Notice, ItemView, TFile, normalizePath, Modal, TextComponent, ButtonComponent, App } from "obsidian"; 
import { NovelChapterPluginSettingsTab, NovelChapterPluginSettings, DEFAULT_SETTINGS as EXTERNAL_DEFAULT_SETTINGS, NovelProject } from "./settings"; 

// Define the constant for the custom view type
const NOVEL_CHAPTER_VIEW_TYPE = 'novel-chapter-view';

// Augment settings for internal use within main.ts
interface InternalNovelChapterPluginSettings extends NovelChapterPluginSettings {
  lastSelectedNovelId: string | null;
}

const DEFAULT_SETTINGS: InternalNovelChapterPluginSettings = {
  ...EXTERNAL_DEFAULT_SETTINGS, 
  lastSelectedNovelId: null,
  novelProjects: Array.isArray(EXTERNAL_DEFAULT_SETTINGS.novelProjects) && EXTERNAL_DEFAULT_SETTINGS.novelProjects.length > 0 
    ? EXTERNAL_DEFAULT_SETTINGS.novelProjects 
    : [{ id: `default-${Date.now()}`, name: "My First Novel", path: "Novel/Chapters" }],
};

// Helper function to check if a file is within a specific folder path
function isFileInFolder(file: TFile, folderPath: string): boolean {
  if (!folderPath || folderPath.trim() === "") return false;
  const normalizedFilePath = normalizePath(file.path); 
  let normalizedFolderPath = normalizePath(folderPath); 

  if (!normalizedFolderPath.endsWith('/')) {
    normalizedFolderPath += '/';
  }
  return normalizedFilePath.startsWith(normalizedFolderPath);
}

// Helper function for sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Modal for getting chapter name
class ChapterNameModal extends Modal {
    result: string | null = null;
    onSubmit: (result: string) => void;

    constructor(app: App, onSubmit: (result: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty(); 

        contentEl.createEl("h2", { text: "Enter New Chapter Name" });

        const inputContainer = contentEl.createDiv({ cls: 'modal-input-container' });
        const textInput = new TextComponent(inputContainer)
            .setPlaceholder("Chapter name");
        textInput.inputEl.addClass('modal-text-input'); 
        textInput.inputEl.focus(); 

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

        new ButtonComponent(buttonContainer)
            .setButtonText("Create Chapter")
            .setCta() 
            .onClick(() => {
                const chapterName = textInput.getValue().trim();
                if (chapterName) {
                    this.result = chapterName;
                    this.close();
                    this.onSubmit(this.result);
                } else {
                    new Notice("Chapter name cannot be empty.");
                }
            });
        
        new ButtonComponent(buttonContainer)
            .setButtonText("Cancel")
            .onClick(() => {
                this.close();
            });

        textInput.inputEl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                const chapterName = textInput.getValue().trim();
                 if (chapterName) {
                    this.result = chapterName;
                    this.close();
                    this.onSubmit(this.result);
                } else {
                    new Notice("Chapter name cannot be empty.");
                }
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}


// Define the custom view class
class NovelChapterView extends ItemView {
  plugin: NovelChapterPlugin;
  controlsContainer: HTMLDivElement;
  tableContainer: HTMLDivElement;
  selectedNovelProjectId: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: NovelChapterPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return NOVEL_CHAPTER_VIEW_TYPE;
  }

  getDisplayText(): string {
    const selectedProject = this.plugin.settings.novelProjects.find(p => p.id === this.selectedNovelProjectId);
    return selectedProject ? `Chapters: ${selectedProject.name}` : "Novel Chapters";
  }

  getIcon(): string {
    return 'list-ordered';
  }

  async onOpen(): Promise<void> {
    const contentEl = this.containerEl.children[1];
    contentEl.empty();
    contentEl.addClass('novel-chapter-view-container');

    this.controlsContainer = contentEl.createDiv({ cls: 'novel-chapter-controls' });
    this.tableContainer = contentEl.createDiv({ cls: 'novel-chapter-table-container' });

    await this.updateView(true);
  }

  async onClose(): Promise<void> {
    // Clean up
  }

  async updateView(settingsHaveChanged = false) {
    if (settingsHaveChanged) {
      await this.renderControls(); 
    }
    
    if (!this.selectedNovelProjectId || !this.plugin.settings.novelProjects.find(p => p.id === this.selectedNovelProjectId)) {
      if (this.plugin.settings.lastSelectedNovelId && this.plugin.settings.novelProjects.find(p => p.id === this.plugin.settings.lastSelectedNovelId)) {
        this.selectedNovelProjectId = this.plugin.settings.lastSelectedNovelId;
      } else if (this.plugin.settings.novelProjects.length > 0) {
        this.selectedNovelProjectId = this.plugin.settings.novelProjects[0].id;
      } else {
        this.selectedNovelProjectId = null;
      }
      
      const selectEl = this.controlsContainer.querySelector('select.novel-project-selector') as HTMLSelectElement | null; 
      if (selectEl && this.selectedNovelProjectId) {
         selectEl.value = this.selectedNovelProjectId;
      } else if (selectEl && !this.selectedNovelProjectId && this.plugin.settings.novelProjects.length > 0) {
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
      this.controlsContainer.setText('No novel projects configured. Please add one in plugin settings.');
      this.selectedNovelProjectId = null;
      return;
    }

    const controlsLine = this.controlsContainer.createDiv({ cls: 'novel-chapter-controls-line' });

    const selectEl = controlsLine.createEl('select');
    selectEl.addClass('novel-project-selector');
    projects.forEach(project => {
      selectEl.createEl('option', {
        text: project.name || 'Unnamed Novel',
        value: project.id
      });
    });

    if (this.selectedNovelProjectId && projects.find(p => p.id === this.selectedNovelProjectId)) {
      selectEl.value = this.selectedNovelProjectId;
    } else if (projects.length > 0) {
      this.selectedNovelProjectId = projects[0].id; 
      selectEl.value = this.selectedNovelProjectId;
    }

    selectEl.addEventListener('change', async (event) => {
      this.selectedNovelProjectId = (event.target as HTMLSelectElement).value;
      this.plugin.settings.lastSelectedNovelId = this.selectedNovelProjectId;
      await this.plugin.saveSettings(); 
      this.updateLeafDisplayText(); 
      await this.renderChapterTable();
    });

    const newChapterButton = controlsLine.createEl('button', {
        text: '+ New Chapter',
        cls: 'novel-chapter-new-button'
    });
    newChapterButton.addEventListener('click', async () => {
        // Call the plugin's method for creating a chapter
        await this.plugin.promptAndCreateNewChapter(this.selectedNovelProjectId);
    });
  }

  // handleNewChapterClick is now moved to the plugin class

  async renderChapterTable(): Promise<void> {
    this.tableContainer.empty();

    if (!this.selectedNovelProjectId) {
      return; 
    }

    const currentNovelProject = this.plugin.settings.novelProjects.find(p => p.id === this.selectedNovelProjectId);

    if (!currentNovelProject) {
      this.tableContainer.setText('Selected novel project not found. It might have been deleted.');
      return;
    }

    const { path: chaptersFolderPath } = currentNovelProject;
    const { propertyNameToChange, propertyColumnHeader, propertyOptions } = this.plugin.settings;
    const optionsArray = propertyOptions.split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);

    if (!chaptersFolderPath || chaptersFolderPath.trim() === "") {
      this.tableContainer.setText(`The selected novel project "${currentNovelProject.name || 'Unnamed Novel'}" does not have a folder path configured.`);
      return;
    }

    const files = this.app.vault.getMarkdownFiles();
    const chapterFiles = files.filter(file => isFileInFolder(file, chaptersFolderPath));

    if (chapterFiles.length === 0) {
      this.tableContainer.setText(`No chapters found in "${chaptersFolderPath}" for novel "${currentNovelProject.name || 'Unnamed Novel'}".`);
      return;
    }
    
    chapterFiles.sort((a, b) => a.path.localeCompare(b.path));

    const table = this.tableContainer.createEl('table', { cls: 'novel-chapter-table' });
    const headerRow = table.createEl('thead').createEl('tr');
    
    headerRow.createEl('th', { text: `Chapter (${chapterFiles.length})` }); 
    
    if (propertyNameToChange && optionsArray.length > 0) { 
        const propertyHeader = propertyColumnHeader && propertyColumnHeader.trim() !== "" ? propertyColumnHeader : propertyNameToChange;
        headerRow.createEl('th', { text: propertyHeader });
    }


    const tbody = table.createEl('tbody');

    for (const file of chapterFiles) {
      const row = tbody.createEl('tr');
      const chapterCell = row.createEl('td');
      const chapterLink = chapterCell.createEl('a', {
        text: file.basename,
        href: '#',
        cls: 'internal-link',
      });
      chapterLink.addEventListener('click', (ev) => {
        ev.preventDefault();
        this.app.workspace.openLinkText(file.path, '', false); 
      });

      if (propertyNameToChange && optionsArray.length > 0) { 
          const propertyCell = row.createEl('td');
          const selectEl = propertyCell.createEl('select');
          const fileCache = this.app.metadataCache.getFileCache(file);
          const currentPropertyValue = fileCache?.frontmatter?.[propertyNameToChange] || '';

          const defaultOption = selectEl.createEl('option', { text: "--- Select ---", value: ""});
          if (!currentPropertyValue) defaultOption.selected = true;

          optionsArray.forEach(option => {
            const optionEl = selectEl.createEl('option', { text: option, value: option });
            if (option === currentPropertyValue) optionEl.selected = true;
          });
          
          selectEl.addEventListener('change', async (event) => {
            const newValue = (event.target as HTMLSelectElement).value;
            try {
              await this.app.fileManager.processFrontMatter(file, (fm) => {
                if (newValue === "") delete fm[propertyNameToChange];
                else fm[propertyNameToChange] = newValue;
              });
              new Notice(`Chapter '${file.basename}' ${propertyNameToChange} updated to '${newValue === "" ? "cleared" : newValue}'.`);
            } catch (error) {
              console.error(`Error updating frontmatter for ${file.path}:`, error);
              new Notice(`Failed to update ${propertyNameToChange} for ${file.basename}.`);
            }
          });
        }
    }
  }
}

export default class NovelChapterPlugin extends Plugin {
  settings: InternalNovelChapterPluginSettings;

  // Helper to get sorted chapters for a given project path
  private getProjectChapters(projectPath: string): TFile[] {
    if (!projectPath || projectPath.trim() === "") {
        return [];
    }
    const allMarkdownFiles = this.app.vault.getMarkdownFiles();
    const chapterFiles = allMarkdownFiles.filter(file => isFileInFolder(file, projectPath));
    chapterFiles.sort((a, b) => a.path.localeCompare(b.path)); 
    return chapterFiles;
  }

  // Helper to find which project a file belongs to
  private findProjectForFile(file: TFile): NovelProject | null {
    if (!file) return null;
    for (const project of this.settings.novelProjects) {
        if (project.path && isFileInFolder(file, project.path)) {
            return project;
        }
    }
    return null;
  }

  // Refactored method to prompt for chapter name and create the chapter
  public async promptAndCreateNewChapter(projectId: string | null): Promise<void> {
    console.log("promptAndCreateNewChapter called with projectId:", projectId);

    if (!projectId) {
        console.log("No project ID provided. Aborting chapter creation.");
        new Notice('Please select a novel project first (e.g., in the Novel Chapters view).');
        return;
    }

    const currentNovelProject = this.settings.novelProjects.find(p => p.id === projectId);
    if (!currentNovelProject || !currentNovelProject.path || currentNovelProject.path.trim() === "") {
        console.log("Target novel project is invalid or has no path. Aborting.", currentNovelProject);
        new Notice('The target novel project does not have a valid folder path configured.');
        return;
    }
    console.log("Target Novel Project for new chapter:", currentNovelProject);

    new ChapterNameModal(this.app, async (chapterName) => {
        console.log("Chapter name from modal for plugin method:", chapterName);

        if (!chapterName || chapterName.trim() === '') {
            console.log("Chapter name is empty after modal. Aborting.");
            return;
        }

        const sanitizedFileName = chapterName.replace(/[\\/:*?"<>|]/g, '').trim();
        console.log("Sanitized file name:", sanitizedFileName);

        if (sanitizedFileName === '') {
            console.log("Sanitized file name is empty. Aborting.");
            new Notice('Invalid chapter name (results in empty filename after sanitization).');
            return;
        }

        const folderPath = normalizePath(currentNovelProject.path);
        console.log("Normalized folder path:", folderPath);
        try {
            const folderExists = await this.app.vault.adapter.exists(folderPath);
            console.log("Does folder exist?", folderExists);
            if (!folderExists) {
                 console.log("Folder does not exist. Aborting.");
                 new Notice(`Novel project folder "${folderPath}" does not exist. Please create it or check settings.`);
                 return;
            }
        } catch (e) {
            console.error("Error checking project folder:", e);
            new Notice(`Error checking project folder: ${(e as Error).message}`);
            return;
        }

        const filePath = normalizePath(`${folderPath}/${sanitizedFileName}.md`);
        console.log("Full file path for new chapter:", filePath);

        const fileExists = await this.app.vault.adapter.exists(filePath);
        console.log("Does file already exist?", fileExists);
        if (fileExists) {
            console.log("File already exists. Aborting.");
            new Notice(`A chapter named "${sanitizedFileName}.md" already exists in this novel.`);
            return;
        }

        let fileContent = "";
        const templatePath = this.settings.chapterTemplatePath;
        console.log("Chapter template path from settings:", templatePath);

        if (templatePath && templatePath.trim() !== "") {
            const normalizedTemplatePath = normalizePath(templatePath);
            console.log("Normalized template path:", normalizedTemplatePath);
            try {
                const templateFile = this.app.vault.getAbstractFileByPath(normalizedTemplatePath);
                if (templateFile instanceof TFile) {
                    console.log("Template file found:", templateFile.path);
                    fileContent = await this.app.vault.read(templateFile);
                    console.log("Raw template content read.");
                    
                    fileContent = fileContent.replace(/\{\{title\}\}/gi, chapterName);
                    fileContent = fileContent.replace(/\{\{TITLE\}\}/gi, chapterName);
                    
                    const today = new Date();
                    const year = today.getFullYear();
                    const month = String(today.getMonth() + 1).padStart(2, '0');
                    const day = String(today.getDate()).padStart(2, '0');
                    const formattedDate = `${year}-${month}-${day}`;
                    fileContent = fileContent.replace(/\{\{date\}\}/gi, formattedDate);
                    fileContent = fileContent.replace(/\{\{DATE\}\}/gi, formattedDate);
                    console.log("Template content after placeholder replacement.");
                } else {
                    console.log("Template file not found or is not a TFile at path:", normalizedTemplatePath);
                    new Notice(`Chapter template file not found at "${normalizedTemplatePath}". Creating a default chapter.`);
                }
            } catch (err) {
                console.error("Error reading chapter template:", err);
                new Notice(`Error reading template. Creating a default chapter. Check console.`);
            }
        }

        if (fileContent === "") {
            console.log("No template content, creating default chapter content.");
            const { propertyNameToChange } = this.settings;
            const defaultPropertyValue = "";

            fileContent = `---\n`;
            fileContent += `title: ${chapterName}\n`;
            if (propertyNameToChange) {
                fileContent += `${propertyNameToChange}: "${defaultPropertyValue}"\n`;
            }
            fileContent += `---\n\n# ${chapterName}\n\n`;
        }
        
        console.log("Final content for new file:", fileContent);

        try {
            console.log("Attempting to create file...");
            await this.app.vault.create(filePath, fileContent);
            console.log("File creation successful.");
            new Notice(`Chapter "${chapterName}" created successfully.`);
        } catch (error) {
            console.error("Error creating new chapter in vault.create:", error);
            new Notice('Failed to create new chapter. Check console for details.');
        }
        console.log("Async operation inside modal callback finished.");
    }).open();

    console.log("promptAndCreateNewChapter finished (modal has been opened).");
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
      id: 'open-novel-chapter-view',
      name: 'Open Novel Chapter View',
      callback: () => this.activateView()
    });

    // --- Add New Chapter Command ---
    this.addCommand({
        id: 'add-new-chapter-to-project',
        name: 'Novel Chapters: Create New Chapter in Project',
        callback: () => {
            // Attempt to use the last selected novel ID from settings.
            // If the view is open and has a selection, that would be more current,
            // but for a command, lastSelectedNovelId is a reasonable fallback.
            let targetProjectId = this.settings.lastSelectedNovelId;

            // If no last selected ID, and there's only one project, use that.
            if (!targetProjectId && this.settings.novelProjects.length === 1) {
                targetProjectId = this.settings.novelProjects[0].id;
            }
            
            if (!targetProjectId && this.settings.novelProjects.length > 1) {
                new Notice("Multiple novel projects exist. Please open the Novel Chapters view to select a project first, or ensure one was recently active.");
                // Optionally, could open the view here: this.activateView();
                return;
            }
            if (!targetProjectId && this.settings.novelProjects.length === 0) {
                new Notice("No novel projects configured. Please add one in plugin settings.");
                return;
            }

            this.promptAndCreateNewChapter(targetProjectId);
        }
    });


    // --- Add Next Chapter Command ---
    this.addCommand({
        id: 'open-next-chapter-in-project',
        name: 'Novel Chapters: Open Next Chapter in Current Project',
        checkCallback: (checking: boolean) => {
            const currentFile = this.app.workspace.getActiveFile();
            if (!currentFile) return false;

            const project = this.findProjectForFile(currentFile);
            if (!project) return false;
            
            if (checking) return true;

            const chapters = this.getProjectChapters(project.path);
            const currentIndex = chapters.findIndex(chap => chap.path === currentFile.path);

            if (currentIndex !== -1 && currentIndex < chapters.length - 1) {
                this.app.workspace.openLinkText(chapters[currentIndex + 1].path, '', false);
            } else if (currentIndex === chapters.length -1) {
                new Notice('This is the last chapter in the project.');
            } else {
                new Notice('Could not determine current chapter position.');
            }
            return true; 
        }
    });

    // --- Add Previous Chapter Command ---
    this.addCommand({
        id: 'open-previous-chapter-in-project',
        name: 'Novel Chapters: Open Previous Chapter in Current Project',
        checkCallback: (checking: boolean) => {
            const currentFile = this.app.workspace.getActiveFile();
            if (!currentFile) return false;

            const project = this.findProjectForFile(currentFile);
            if (!project) return false;

            if (checking) return true;

            const chapters = this.getProjectChapters(project.path);
            const currentIndex = chapters.findIndex(chap => chap.path === currentFile.path);

            if (currentIndex !== -1 && currentIndex > 0) {
                this.app.workspace.openLinkText(chapters[currentIndex - 1].path, '', false);
            } else if (currentIndex === 0) {
                new Notice('This is the first chapter in the project.');
            } else {
                 new Notice('Could not determine current chapter position.');
            }
            return true;
        }
    });


    this.addRibbonIcon(this.getIcon(), 'Open Novel Chapter View', () => this.activateView());

    this.registerEvent(this.app.vault.on('create', (file) => this.handleFileChange(file as TFile)));
    this.registerEvent(this.app.vault.on('modify', (file) => this.handleFileChange(file as TFile)));
    this.registerEvent(this.app.vault.on('delete', (file) => this.handleFileChange(file as TFile)));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.handleFileChange(file as TFile, oldPath)));
  }

  getIcon(): string {
    return 'list-ordered';
  }

  onunload() {
    console.log("Novel Chapter Plugin unloaded");
    this.app.workspace.detachLeavesOfType(NOVEL_CHAPTER_VIEW_TYPE);
  }

  async loadSettings() {
    const loadedData = await this.loadData();
    this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); 
    Object.assign(this.settings, loadedData); 

    if (!Array.isArray(this.settings.novelProjects) || this.settings.novelProjects.length === 0) {
        this.settings.novelProjects = Array.isArray(EXTERNAL_DEFAULT_SETTINGS.novelProjects) && EXTERNAL_DEFAULT_SETTINGS.novelProjects.length > 0
            ? JSON.parse(JSON.stringify(EXTERNAL_DEFAULT_SETTINGS.novelProjects)) 
            : [{ id: `default-load-${Date.now()}`, name: "Default Novel", path: "" }]; 
    }
    
    this.settings.novelProjects = this.settings.novelProjects.map((p: Partial<NovelProject>): NovelProject => ({ 
        id: p.id || `generated-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: p.name || "Unnamed Novel",
        path: p.path || ""
    }));


    if (this.settings.lastSelectedNovelId && !this.settings.novelProjects.find(p => p.id === this.settings.lastSelectedNovelId)) {
        this.settings.lastSelectedNovelId = null; 
    }
    if (!this.settings.lastSelectedNovelId && this.settings.novelProjects.length > 0) {
        this.settings.lastSelectedNovelId = this.settings.novelProjects[0].id; 
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.refreshNovelChapterView(true); 
  }
  
  refreshNovelChapterView(settingsChanged = false) { 
    this.app.workspace.getLeavesOfType(NOVEL_CHAPTER_VIEW_TYPE).forEach(leaf => {
      if (leaf.view instanceof NovelChapterView) {
        leaf.view.updateView(settingsChanged);
      }
    });
  }

  private async handleFileChange(file: TFile, oldPath?: string) {
    if (!(file instanceof TFile) || (file.extension && file.extension !== 'md')) {
        return;
    }

    const isRelevantChange = this.settings.novelProjects.some(project => {
        if (!project.path || project.path.trim() === "") return false;
        
        const projectPathNormalized = normalizePath(project.path);
        const filePathNormalized = normalizePath(file.path);
        const oldFilePathNormalized = oldPath ? normalizePath(oldPath) : null;

        const inCurrentPath = filePathNormalized.startsWith(projectPathNormalized + (projectPathNormalized.endsWith('/') ? '' : '/'));
        const inOldPath = oldFilePathNormalized ? oldFilePathNormalized.startsWith(projectPathNormalized + (projectPathNormalized.endsWith('/') ? '' : '/')) : false;
        
        return inCurrentPath || inOldPath;
    });

    if (isRelevantChange) {
        await sleep(100); 
        this.refreshNovelChapterView(false); 
    }
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(NOVEL_CHAPTER_VIEW_TYPE)[0];

    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf('split', 'vertical');
      await leaf.setViewState({ type: NOVEL_CHAPTER_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }
}
