import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { Logger } from './logger';
import { SettingsPanel } from './settingsPanel';
import { registerCommands } from './commands';

/**
 * App 主类，负责依赖注入、对象创建、初始化和销毁
 *
 * 职责：
 * 1. 创建和管理所有核心服务（Logger、ConfigManager、SettingsPanel 等）
 * 2. 控制依赖注入顺序
 * 3. 管理生命周期（初始化、激活、停用）
 * 4. 提供统一的服务访问接口
 */
export class App {
    private static instance: App | null = null;
    private _logger: Logger;
    private _configManager: ConfigManager;
    private _settingsPanel: SettingsPanel | null = null;
    private _extensionUri: vscode.Uri;
    private _context: vscode.ExtensionContext;
    private _isDisposed = false;
    private _disposables: vscode.Disposable[] = [];

    private constructor(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._extensionUri = extensionUri;
        this._context = context;
        this._logger = new Logger('Claude Code Router Settings', 'info');
        this._configManager = new ConfigManager(this._logger);

        this._initCommands();
        this._initConfigWatcher();

        this._logger.info('Init ok.');
    }

    /**
     * 获取 App 单例实例
     */
    public static getInstance(): App {
        if (!App.instance) {
            throw new Error('App 未初始化，请先调用 initialize()');
        }
        return App.instance;
    }

    /**
     * 初始化 App（单例模式）
     */
    public static async initialize(extensionUri: vscode.Uri, context: vscode.ExtensionContext): Promise<App> {
        if (App.instance) {
            throw new Error('App 已经初始化过了');
        }
        App.instance = new App(extensionUri, context);
        return App.instance;
    }

    /**
     * 获取 Logger 实例
     */
    public get logger(): Logger {
        this.checkNotDisposed();
        return this._logger;
    }

    /**
     * 获取 ConfigManager 实例
     */
    public get configManager(): ConfigManager {
        this.checkNotDisposed();
        return this._configManager;
    }

    /**
     * 获取 SettingsPanel 实例（可能为 null）
     */
    public get settingsPanel(): SettingsPanel | null {
        this.checkNotDisposed();
        return this._settingsPanel;
    }

    /**
     * 获取扩展 Uri
     */
    public get extensionUri(): vscode.Uri {
        this.checkNotDisposed();
        return this._extensionUri;
    }

    /**
     * 获取扩展上下文
     */
    public get context(): vscode.ExtensionContext {
        this.checkNotDisposed();
        return this._context;
    }

    /**
     * 打开或显示设置面板
     */
    public openSettingsPanel(): void {
        this.checkNotDisposed();
        if (this._settingsPanel) {
            this._settingsPanel.show();
        } else {
            this._settingsPanel = SettingsPanel.create(this._extensionUri, this._configManager);
            // 当面板被关闭时，清除引用
            this._settingsPanel.onDidDispose(() => {
                this._settingsPanel = null;
            });
        }
    }

    /**
     * 通知配置已更改（刷新设置面板）
     */
    public async notifyConfigChanged(): Promise<void> {
        this.checkNotDisposed();
        if (this._settingsPanel) {
            this._settingsPanel.refreshConfig();
        }
    }

    /**
     * 销毁 App 及其管理的所有资源
     */
    public dispose(): void {
        if (this._isDisposed) {
            return;
        }

        this._logger.info("Exit.");

        // 逆序销毁（先销毁依赖方，再销毁被依赖方）
        if (this._settingsPanel) {
            this._settingsPanel.dispose();
            this._settingsPanel = null;
        }

        // 销毁所有注册的 disposables（命令、监听器等）
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];

        this._logger.dispose();

        this._isDisposed = true;
        App.instance = null;
    }

    /**
     * 初始化所有命令
     */
    private _initCommands(): void {
        const commands = registerCommands(this);
        this._disposables.push(...commands);
    }

    /**
     * 初始化配置文件监听器
     */
    private _initConfigWatcher(): void {
        const configWatcher = vscode.workspace.createFileSystemWatcher(
            this._configManager.getCCRConfigPath()
        );
        configWatcher.onDidChange(() => {
            this.notifyConfigChanged();
        });
        this._disposables.push(configWatcher);
    }

    private checkNotDisposed(): void {
        if (this._isDisposed) {
            throw new Error('App 已被销毁');
        }
    }
}
