import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { Logger } from './logger';
import { SettingsPanel } from './settingsPanel';

/**
 * App 主类，负责依赖注入、对象创建、初始化和销毁
 *
 * 职责：
 * 1. 创建和管理所有核心服务（Logger、ConfigManager 等）
 * 2. 控制依赖注入顺序
 * 3. 管理生命周期（初始化、激活、停用）
 * 4. 提供统一的服务访问接口
 */
export class App {
    private static instance: App | null = null;
    private _logger: Logger;
    private _configManager: ConfigManager;
    private _extensionUri: vscode.Uri;
    private _context: vscode.ExtensionContext;
    private _isDisposed = false;

    private constructor(extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._extensionUri = extensionUri;
        this._context = context;

        // 1. 首先创建 Logger（不依赖其他服务）
        this._logger = new Logger('Claude Code Router Settings', 'info');
        this._logger.info('App 正在初始化...');

        // 2. 创建 ConfigManager（依赖 Logger）
        this._configManager = new ConfigManager(this._logger);

        this._logger.info('App 初始化完成');
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
     * 打开设置面板
     */
    public openSettingsPanel(): void {
        this.checkNotDisposed();
        SettingsPanel.createOrShow(this._extensionUri, this._configManager);
    }

    /**
     * 销毁 App 及其管理的所有资源
     */
    public dispose(): void {
        if (this._isDisposed) {
            return;
        }

        this._logger.info('App 正在销毁...');

        // 逆序销毁（先销毁依赖方，再销毁被依赖方）
        // SettingsPanel 会自动处理自己的销毁
        // ConfigManager 不持有需要显式销毁的资源
        this._logger.dispose();

        this._isDisposed = true;
        App.instance = null;

        this._logger.info('App 已销毁');
    }

    private checkNotDisposed(): void {
        if (this._isDisposed) {
            throw new Error('App 已被销毁');
        }
    }
}
