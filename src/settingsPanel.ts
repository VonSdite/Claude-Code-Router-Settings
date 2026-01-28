import * as vscode from 'vscode';
import { ConfigManager, Provider, Router } from './configManager';
import { Logger } from './logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
const execAsync = promisify(exec);
type ConfigChangeCallback = () => void | Promise<void>;
export class SettingsPanel {
    public static currentPanel: SettingsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private configManager: ConfigManager;
    private configChangeCallback: ConfigChangeCallback | null = null;
    private logger: Logger;
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, configManager: ConfigManager, callback?: ConfigChangeCallback) {
        this._panel = panel;
        this.configManager = configManager;
        this.configChangeCallback = callback || null;
        this.logger = configManager.getLogger();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.onDidChangeViewState(() => {
            if (this._panel.visible) {
                this.refreshConfigInternal();
            }
        }, null, this._disposables);
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, extensionUri);
        this.initializeConfig();
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'getConfig':
                        const config = this.configManager.getConfig();
                        this._panel.webview.postMessage({
                            command: 'configLoaded',
                            config: config
                        });
                        break;
                    case 'addProvider':
                        await this.handleAddProvider(message.provider);
                        break;
                    case 'updateProvider':
                        await this.handleUpdateProvider(message.index, message.provider);
                        break;
                    case 'removeProvider':
                        await this.handleRemoveProvider(message.providerName);
                        break;
                    case 'updateRouter':
                        await this.handleUpdateRouter(message.key, message.value);
                        break;
                    case 'updateBasicConfig':
                        await this.handleUpdateBasicConfig(message.config);
                        break;
                    case 'refreshConfig':
                        await this.handleRefreshConfig();
                        break;
                    case 'restartCcr':
                        await this.handleRestartCcr();
                        break;
                    case 'openCCRConfig':
                        await this.handleOpenCCRConfig();
                        break;
                    case 'openCCSettings':
                        await this.handleOpenCCSettings();
                        break;
                    case 'fetchModels':
                        await this.handleFetchModels(message.apiBaseUrl, message.apiKey, message.fetchModelApi);
                        break;
                    case 'addTransformer':
                        await this.handleAddTransformer(message.transformer);
                        break;
                    case 'updateTransformer':
                        await this.handleUpdateTransformer(message.index, message.transformer);
                        break;
                    case 'removeTransformer':
                        await this.handleRemoveTransformer(message.index);
                        break;
                }
            },
            null,
            this._disposables
        );
    }
    private async initializeConfig(): Promise<void> {
        await this.configManager.loadConfig();
        const config = this.configManager.getConfig();
        if (config) {
            this._panel.webview.postMessage({
                command: 'configLoaded',
                config: config
            });
        }
    }
    public static createOrShow(extensionUri: vscode.Uri, configManager: ConfigManager, callback?: ConfigChangeCallback) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (SettingsPanel.currentPanel) {
            SettingsPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'claudeRouterSettings',
            'Claude Code Router Settings',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );
        SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri, configManager, callback);
    }
    public static notifyConfigChanged(): void {
        if (SettingsPanel.currentPanel) {
            SettingsPanel.currentPanel.refreshConfigInternal();
        }
    }
    private async refreshConfigInternal(): Promise<void> {
        await this.configManager.loadConfig();
        const config = this.configManager.getConfig();
        if (config) {
            this._panel.webview.postMessage({
                command: 'configLoaded',
                config: config
            });
        }
    }
    private async notifyConfigChange(): Promise<void> {
        if (this.configChangeCallback) {
            await this.configChangeCallback();
        }
    }
    public dispose() {
        SettingsPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    private async handleAddProvider(provider: Provider): Promise<void> {
        let config = this.configManager.getConfig();
        if (!config) {
            config = await this.configManager.loadConfig();
        }
        if (config) {
            const result = this.configManager.addProvider(provider);
            if (result.success) {
                const updatedConfig = this.configManager.getConfig();
                this._panel.webview.postMessage({
                    command: 'configLoaded',
                    config: updatedConfig
                });
                await this.configManager.saveConfig();
                vscode.window.showInformationMessage(result.message);
            } else {
                vscode.window.showErrorMessage(result.message);
            }
        }
    }
    private async handleUpdateProvider(index: number, provider: Provider): Promise<void> {
        let config = this.configManager.getConfig();
        if (!config) {
            config = await this.configManager.loadConfig();
        }
        if (config) {
            this.configManager.updateProvider(index, provider);
            const updatedConfig = this.configManager.getConfig();
            this._panel.webview.postMessage({
                command: 'configLoaded',
                config: updatedConfig
            });
            await this.configManager.saveConfig();
        }
    }
    private async handleRemoveProvider(providerName: string): Promise<void> {
        let config = this.configManager.getConfig();
        if (!config) {
            config = await this.configManager.loadConfig();
        }
        if (config) {
            this.configManager.removeProvider(providerName);
            const updatedConfig = this.configManager.getConfig();
            this._panel.webview.postMessage({
                command: 'configLoaded',
                config: updatedConfig
            });
            await this.configManager.saveConfig();
            vscode.window.showInformationMessage(`Provider "${providerName}" removed successfully!`);
        }
    }
    private async handleUpdateRouter(key: keyof Router, value: string): Promise<void> {
        let config = this.configManager.getConfig();
        if (!config) {
            config = await this.configManager.loadConfig();
        }
        if (config) {
            this.configManager.updateRouter(key, value);
            const updatedConfig = this.configManager.getConfig();
            this._panel.webview.postMessage({
                command: 'configLoaded',
                config: updatedConfig
            });
            await this.configManager.saveConfig();
            await this.notifyConfigChange();
        }
    }
    private async handleUpdateBasicConfig(updatedFields: any): Promise<void> {
        let config = this.configManager.getConfig();
        if (!config) {
            config = await this.configManager.loadConfig();
        }
        if (config) {
            config.LOG = updatedFields.LOG;
            config.LOG_LEVEL = updatedFields.LOG_LEVEL;
            config.HOST = updatedFields.HOST;
            config.PORT = updatedFields.PORT;
            config.APIKEY = updatedFields.APIKEY;
            config.API_TIMEOUT_MS = updatedFields.API_TIMEOUT_MS;
            config.PROXY_URL = updatedFields.PROXY_URL;
            config.CLAUDE_PATH = updatedFields.CLAUDE_PATH;
            await this.configManager.saveConfig();
            await this.notifyConfigChange();
            this._panel.webview.postMessage({
                command: 'configLoaded',
                config: config
            });
        }
    }
    public async refreshConfig(): Promise<void> {
        this._panel.webview.postMessage({
            command: 'refreshConfig'
        });
    }
    private async handleRefreshConfig(): Promise<void> {
        await this.configManager.loadConfig();
        const config = this.configManager.getConfig();
        if (config) {
            this._panel.webview.postMessage({
                command: 'configLoaded',
                config: config
            });
            vscode.window.showInformationMessage('Configuration refreshed!');
        }
    }
    private async handleRestartCcr(): Promise<void> {
        try {
            vscode.window.showInformationMessage('正在执行 ccr restart 命令...');
            const { stdout, stderr } = await execAsync('ccr restart', {
                cwd: process.cwd(),
                timeout: 30000, // 30秒超时
                windowsHide: true  // Windows下隐藏命令行窗口
            });
            if (stdout) {
                this.logger.info(`ccr restart stdout: ${stdout}`);
            }
            if (stderr) {
                this.logger.warn(`ccr restart stderr: ${stderr}`);
                vscode.window.showWarningMessage(`ccr restart 警告: ${stderr}`);
            }
            vscode.window.showInformationMessage('ccr restart 命令执行完成！');
        } catch (error: any) {
            this.logger.error('ccr restart error:', error);
            let errorMessage = '执行 ccr restart 失败';
            if (error.code === 'ENOTFOUND') {
                errorMessage = 'ccr 命令未找到，请确保 claude-code-router 已正确安装';
            } else if (error.code === 'ETIMEDOUT') {
                errorMessage = 'ccr restart 命令执行超时';
            } else if (error.message) {
                errorMessage = `ccr restart 失败: ${error.message}`;
            }
            vscode.window.showErrorMessage(errorMessage, '查看详情')
                .then(selection => {
                    if (selection === '查看详情') {
                        const outputChannel = vscode.window.createOutputChannel('CCR Restart Error');
                        outputChannel.show();
                        outputChannel.appendLine(`错误: ${error}`);
                        if (error.stdout) {
                            outputChannel.appendLine('\n标准输出:');
                            outputChannel.appendLine(error.stdout);
                        }
                        if (error.stderr) {
                            outputChannel.appendLine('\n错误输出:');
                            outputChannel.appendLine(error.stderr);
                        }
                    }
                });
        }
    }
    private async handleOpenCCRConfig(): Promise<void> {
        const configPath = this.configManager.getCCRConfigPath();
        try {
            if (!fs.existsSync(configPath)) {
                vscode.window.showErrorMessage(`CCR配置文件不存在: ${configPath}`);
                return;
            }
            const document = await vscode.workspace.openTextDocument(configPath);
            await vscode.window.showTextDocument(document);
        } catch (error: any) {
            vscode.window.showErrorMessage(`打开CCR配置文件失败: ${error.message}`);
        }
    }
    private async handleOpenCCSettings(): Promise<void> {
        const settingsPath = this.configManager.getCCSettingsPath();
        try {
            if (!fs.existsSync(settingsPath)) {
                vscode.window.showErrorMessage(`CC settings文件不存在: ${settingsPath}`);
                return;
            }
            const document = await vscode.workspace.openTextDocument(settingsPath);
            await vscode.window.showTextDocument(document);
        } catch (error: any) {
            vscode.window.showErrorMessage(`打开CC settings文件失败: ${error.message}`);
        }
    }
    private async handleFetchModels(apiBaseUrl: string, apiKey?: string, fetchModelApi?: string): Promise<void> {
        try {
            const models = await this.configManager.fetchModelsFromApi(apiBaseUrl, apiKey, fetchModelApi);
            this._panel.webview.postMessage({
                command: 'modelsFetched',
                models: models
            });
        } catch (error: any) {
            this._panel.webview.postMessage({
                command: 'fetchModelsError',
                error: error.message || '获取模型失败'
            });
            const result = await vscode.window.showErrorMessage(
                '获取模型失败：' + (error.message || '未知错误'),
                '查看详细日志',
                '关闭'
            );
            if (result === '查看详细日志') {
                this.configManager.getLogger().show(true);
            }
        }
    }
    private async handleAddTransformer(transformer: { path: string; options: { [key: string]: any } }): Promise<void> {
        if (transformer.path) {
            this.configManager.addTransformer(transformer);
            await this.configManager.saveConfig();
            const updatedConfig = this.configManager.getConfig();
            this._panel.webview.postMessage({
                command: 'configLoaded',
                config: updatedConfig
            });
        }
    }
    private async handleUpdateTransformer(index: number, transformer: { path: string; options: { [key: string]: any } }): Promise<void> {
        if (this.configManager.getConfig()) {
            this.configManager.updateTransformer(index, transformer);
            await this.configManager.saveConfig();
            const updatedConfig = this.configManager.getConfig();
            this._panel.webview.postMessage({
                command: 'configLoaded',
                config: updatedConfig
            });
        }
    }
    private async handleRemoveTransformer(index: number): Promise<void> {
        if (this.configManager.getConfig()) {
            this.configManager.removeTransformer(index);
            await this.configManager.saveConfig();
            const updatedConfig = this.configManager.getConfig();
            this._panel.webview.postMessage({
                command: 'configLoaded',
                config: updatedConfig
            });
        }
    }
    private _getHtmlForWebview(_webview: vscode.Webview, _extensionUri: vscode.Uri): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Router Settings</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
            line-height: 1.6;
        }
        h1, h2 {
            color: var(--vscode-editor-foreground);
        }
        .section {
            margin-bottom: 30px;
            padding: 15px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 5px;
            background-color: var(--vscode-editor-background);
        }
        .btn-restart {
            background-color: var(--vscode-errorForeground) !important;
            color: var(--vscode-button-foreground) !important;
        }
        .btn-restart:hover {
            background-color: var(--vscode-errorForeground) !important;
            opacity: 0.9;
        }
        .providers-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        .providers-table th,
        .providers-table td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .providers-table th {
            background-color: transparent;
            font-weight: bold;
            border-bottom: 2px solid var(--vscode-panel-border);
        }
        .provider-row {
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .provider-row:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .provider-details {
            display: none;
            background-color: transparent;
        }
        .provider-details.active {
            display: table-row;
        }
        .details-content {
            padding: 15px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }
        .detail-item {
            display: flex;
            flex-direction: column;
        }
        .detail-item label {
            margin-bottom: 5px;
            font-weight: bold;
        }
        .detail-item input,
        .detail-item select {
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
        }
        .models-list {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            margin-bottom: 10px;
        }
        .model-tag {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 0.9em;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
        .remove-model {
            cursor: pointer;
            font-weight: bold;
            margin-left: 5px;
        }
        .add-model {
            display: flex;
            gap: 5px;
        }
        .add-model input {
            flex: 1;
            padding: 5px;
        }
        .expand-icon {
            margin-right: 8px;
            transition: transform 0.2s;
            display: inline-block;
        }
        .collapse-all-btn {
            cursor: pointer;
            transition: transform 0.2s;
            display: inline-block;
            font-size: 1.1em;
        }
        .collapse-all-btn:hover {
            color: var(--vscode-button-foreground);
        }
        .action-buttons {
            display: flex;
            gap: 5px;
            align-items: center;
        }
        .btn-icon {
            background: none;
            border: none;
            cursor: pointer;
            padding: 5px;
            color: var(--vscode-icon-foreground);
        }
        .btn-icon:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
            border-radius: 3px;
        }
        .btn-icon.delete {
            color: var(--vscode-errorForeground);
        }
        .btn-add-row {
            cursor: pointer;
            text-align: center;
            padding: 10px 20px;
            border: 2px dashed var(--vscode-panel-border);
            color: var(--vscode-disabledForeground);
            transition: all 0.2s;
        }
        .btn-add-row:hover {
            border-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            background-color: var(--vscode-button-hoverBackground);
        }
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 1000;
        }
        .modal.active {
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .modal-content {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 5px;
            padding: 20px;
            width: 700px;
            max-width: 90%;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
        }
        .modal-header {
            margin-bottom: 20px;
            flex-shrink: 0;
        }
        .modal-body {
            display: flex;
            flex-direction: column;
            gap: 15px;
            overflow: visible;
        }
        .modal-footer {
            margin-top: 20px;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            flex-shrink: 0;
        }
        button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button:disabled {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: not-allowed;
            opacity: 0.6;
        }
        button.btn-primary {
            background-color: var(--vscode-button-background);
        }
        button.btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
        }
        button.btn-danger {
            background-color: var(--vscode-errorForeground);
        }
        .password-input {
            position: relative;
            display: flex;
            align-items: stretch;
            width: 100%;
        }
        .password-input input {
            flex: 1;
            padding-right: 40px;
            padding-top: 8px;
            padding-bottom: 8px;
            padding-left: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px 0 0 3px;
            border-right: none;
        }
        .password-input input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .toggle-password {
            position: absolute;
            right: 0;
            top: 0;
            bottom: 0;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-left: none;
            border-radius: 0 3px 3px 0;
            cursor: pointer;
            color: var(--vscode-icon-foreground);
            padding: 0 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 36px;
            font-size: 16px;
        }
        .toggle-password:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        .router-item {
            margin-bottom: 15px;
            padding: 10px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            background-color: var(--vscode-input-background);
        }
        .router-grid {
            display: flex;
            flex-direction: column;
            gap: 15px;
            margin-bottom: 15px;
        }
        .router-field {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 15px;
            padding: 10px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            background-color: var(--vscode-editor-background);
            transition: background-color 0.2s;
        }
        .router-field:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .router-field label {
            font-size: 0.9em;
            font-weight: 500;
            min-width: 100px;
            flex-shrink: 0;
            color: var(--vscode-foreground);
        }
        .router-field input:not(.router-model-input), .router-field select {
            padding: 5px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            flex: 1;
            max-width: 400px;
        }
        .router-model-select {
            width: 100%;
            max-width: 400px;
        }
        .router-field h3 {
            margin: 0 0 5px 0;
            font-size: 0.9em;
            font-weight: normal;
        }
        .router-threshold {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 15px;
            padding: 10px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            background-color: var(--vscode-editor-background);
            transition: background-color 0.2s;
        }
        .router-threshold:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .router-threshold label {
            font-size: 0.9em;
            font-weight: 500;
            min-width: 100px;
            flex-shrink: 0;
            color: var(--vscode-foreground);
        }
        .router-threshold input {
            padding: 5px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            flex: 1;
            max-width: 400px;
        }
        select {
            width: 100%;
            padding: 5px;
            margin-bottom: 10px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
        }
        .confirm-dialog {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 5px;
            padding: 20px;
        }
        .confirm-dialog h3 {
            margin-top: 0;
            color: var(--vscode-errorForeground);
        }
        .transformer-section {
            grid-column: 1 / -1;
            margin-top: 10px;
        }
        .transformer-item {
            display: flex;
            gap: 10px;
            margin-bottom: 10px;
            align-items: center;
        }
        .transformer-item label {
            flex-shrink: 0;
        }
        .transformer-input {
            padding: 5px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            min-width: 0;
        }
        .transformer-input[type="text"] {
            width: 100%;
            box-sizing: border-box;
        }
        .transformer-params {
            flex: 1;
            padding: 5px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            font-family: monospace;
            font-size: 0.9em;
            min-width: 200px;
        }
        .model-transformer {
            margin-left: 20px;
            margin-top: 10px;
            padding: 10px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            background-color: var(--vscode-editor-background);
        }
        .model-transformer h4 {
            margin: 0 0 10px 0;
            color: var(--vscode-editor-foreground);
        }
        .add-transformer {
            margin-top: 10px;
        }
        .modal-body::-webkit-scrollbar {
            width: 8px;
        }
        .modal-body::-webkit-scrollbar-track {
            background: var(--vscode-editor-background);
        }
        .modal-body::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 4px;
        }
        .modal-body::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }
        .modal-body::-webkit-scrollbar-thumb:active {
            background: var(--vscode-scrollbarSlider-activeBackground);
        }
        .transformers-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .transformer-item-card {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 5px;
            padding: 15px;
            background-color: var(--vscode-editor-background);
            transition: background-color 0.2s;
        }
        .transformer-item-card:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .transformer-item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .transformer-item-header h3 {
            margin: 0;
            font-size: 1em;
            color: var(--vscode-editor-foreground);
        }
        .transformer-item-body {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        .transformer-item-body .detail-item {
            display: flex;
            flex-direction: column;
            width: 100%;
        }
        .transformer-item-body textarea {
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            font-family: monospace;
            font-size: 0.85em;
            min-height: 150px;
            resize: vertical;
        }
        .model-search-container {
            margin-bottom: 15px;
        }
        .model-search-container input {
            width: 100%;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
        }
        .model-table-container {
            overflow-y: auto;
            max-height: 60vh;
        }
        .model-table-container::-webkit-scrollbar {
            width: 8px;
        }
        .model-table-container::-webkit-scrollbar-track {
            background: var(--vscode-editor-background);
        }
        .model-table-container::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 4px;
        }
        .model-table-container::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }
        .model-selection-table {
            width: 100%;
            border-collapse: collapse;
        }
        .model-selection-table th,
        .model-selection-table td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .model-selection-table th {
            background-color: var(--vscode-editor-background);
            font-weight: bold;
            border-bottom: 2px solid var(--vscode-panel-border);
            position: sticky;
            top: 0;
            z-index: 10;
        }
        .model-selection-table tr:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .model-checkbox {
            cursor: pointer;
        }
        .model-status {
            font-size: 0.9em;
        }
        .model-status.new {
            color: var(--vscode-icon-foreground);
        }
        .model-status.existing {
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h1 style="margin: 0;">claude-code-router 设置</h1>
        <div style="display: flex; gap: 10px;">
            <button onclick="restartCcr()" class="btn-restart">重启ccr</button>
            <button onclick="refreshConfig()">重新加载CCR配置</button>
            <button onclick="openCCRConfig()">打开CCR配置</button>
            <button onclick="openCCSettings()">打开CC Settings</button>
        </div>
    </div>
    <div class="section">
        <h2>服务提供商</h2>
        <table class="providers-table">
            <thead>
                <tr>
                    <th style="width: 30px;">
                        <span class="collapse-all-btn" onclick="toggleAllProviders()" title="全部折叠/展开">▼</span>
                    </th>
                    <th>提供商名称</th>
                    <th style="width: 100px;">操作</th>
                </tr>
            </thead>
            <tbody id="providersTableBody">
            </tbody>
            <tfoot>
                <tr id="addProviderRow">
                    <td colspan="3" class="btn-add-row" onclick="showAddProviderModal()">
                        + 添加新的提供商
                    </td>
                </tr>
            </tfoot>
        </table>
    </div>
    <div class="section">
        <h2>路由配置</h2>
        <div id="routerConfig"></div>
    </div>
    <div class="section">
        <h2>基础配置</h2>
        <div class="router-grid">
            <div class="router-field">
                <label for="config_LOG" title="是否启用日志">启用日志:</label>
                <select id="config_LOG" onchange="updateBasicConfig()">
                    <option value="true">是</option>
                    <option value="false">否</option>
                </select>
            </div>
            <div class="router-field">
                <label for="config_LOG_LEVEL" title="日志级别">日志级别:</label>
                <select id="config_LOG_LEVEL" onchange="updateBasicConfig()">
                    <option value="debug">debug</option>
                    <option value="info">info</option>
                    <option value="warn">warn</option>
                    <option value="error">error</option>
                </select>
            </div>
            <div class="router-field">
                <label for="config_HOST" title="服务器地址">服务器地址:</label>
                <input type="text" id="config_HOST" placeholder="127.0.0.1" onchange="updateBasicConfig()">
            </div>
            <div class="router-field">
                <label for="config_PORT" title="服务器端口">服务器端口:</label>
                <input type="number" id="config_PORT" placeholder="3456" onchange="updateBasicConfig()">
            </div>
            <div class="router-field">
                <label for="config_APIKEY" title="API密钥">API密钥:</label>
                <input type="text" id="config_APIKEY" placeholder="您的API密钥" onchange="updateBasicConfig()">
            </div>
            <div class="router-field">
                <label for="config_API_TIMEOUT_MS" title="API超时时间(毫秒)">API超时(ms):</label>
                <input type="text" id="config_API_TIMEOUT_MS" placeholder="600000" onchange="updateBasicConfig()">
            </div>
            <div class="router-field">
                <label for="config_PROXY_URL" title="代理URL">代理URL:</label>
                <input type="text" id="config_PROXY_URL" placeholder="可选" onchange="updateBasicConfig()">
            </div>
            <div class="router-field">
                <label for="config_CLAUDE_PATH" title="Claude路径">Claude路径:</label>
                <input type="text" id="config_CLAUDE_PATH" placeholder="可选" onchange="updateBasicConfig()">
            </div>
        </div>
    </div>
    <div class="section">
        <h2>Transformers 插件配置</h2>
        <div id="transformersContainer" class="transformers-list">
            <!-- Transformers will be rendered here -->
        </div>
        <div style="margin-top: 15px;">
            <div class="btn-add-row" onclick="addNewTransformerCard()">+ 添加 Transformer 插件</div>
        </div>
    </div>
    <!-- Add Provider Modal -->
    <div id="addProviderModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>添加新的提供商</h2>
            </div>
            <div class="modal-body">
                <div class="detail-item">
                    <label>名称:</label>
                    <input type="text" id="newProviderName" placeholder="例如: openai">
                </div>
                <div class="detail-item">
                    <label>API 基础地址:</label>
                    <input type="text" id="newProviderUrl" placeholder="例如: https://api.openai.com/v1/chat/completions" oninput="toggleFetchModelsButton()">
                </div>
                <div class="detail-item">
                    <label>API 密钥:</label>
                    <div class="password-input">
                        <input type="password" id="newProviderKey" placeholder="您的API密钥">
                        <button class="toggle-password" onclick="toggleNewProviderPassword()">👁</button>
                    </div>
                </div>
                <div class="detail-item">
                    <label>模型:</label>
                    <div class="models-list" id="newProviderModelsList">
                        <!-- Models will be added here dynamically -->
                    </div>
                    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <div class="add-model" style="flex: 1;">
                            <input type="text" id="newProviderModelInput" placeholder="填写模型名称，按Enter直接添加" onkeypress="if(event.key === 'Enter') addModelToNewProvider()">
                            <button onclick="addModelToNewProvider()">+</button>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <input type="text" id="newProviderFetchModelApi" placeholder="模型API接口，默认为 /v1/models" oninput="toggleFetchModelsButton()" style="width: 200px;">
                            <button id="fetchModelsBtn" onclick="fetchModelsForNewProvider()" disabled>获取模型</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" onclick="hideAddProviderModal()">取消</button>
                <button class="btn-primary" onclick="addNewProvider()">添加提供商</button>
            </div>
        </div>
    </div>
    <!-- Confirm Delete Modal -->
    <div id="confirmDeleteModal" class="modal">
        <div class="modal-content">
            <div class="confirm-dialog">
                <h3>确认删除</h3>
                <p>您确定要删除提供商 '<span id="deleteProviderName"></span>' 吗？</p>
                <p>此操作无法撤销。</p>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" onclick="hideConfirmDeleteModal()">取消</button>
                <button class="btn-danger" onclick="confirmDelete()">删除</button>
            </div>
        </div>
    </div>
    <!-- Add Transformer Modal -->
    <div id="addTransformerModal" class="modal">
        <div class="modal-content" style="width: 600px; max-height: 80vh; display: flex; flex-direction: column;">
            <div class="modal-header" style="flex-shrink: 0;">
                <h2>添加 Transformer 插件</h2>
            </div>
            <div class="modal-body" style="flex: 1; overflow-y: auto; padding-right: 15px; margin-right: -10px;">
                <div class="detail-item">
                    <label>插件路径:</label>
                    <input type="text" id="newTransformerPath" placeholder="例如: @ transformers/anthropic">
                </div>
                <div class="detail-item" style="margin-top: 15px;">
                    <label>配置选项 (JSON):</label>
                    <textarea id="newTransformerOptions" placeholder='例如: {"key": "value"}' style="background-color: var(--vscode-input-background); color: var(--vscode-input-foreground);"></textarea>
                </div>
                <p style="color: var(--vscode-descriptionForeground); font-size: 0.9em; margin-top: 10px;">
                    内置插件: Anthropic, gemini, vertex-gemini, vertex-claude, deepseek, tooluse, openrouter, OpenAI, maxtoken, groq, cleancache, enhancetool, reasoning, sampling, maxcompletiontokens, cerebras, streamoptions, customparams, vercel, openai-responses, forcereasoning
                </p>
            </div>
            <div class="modal-footer" style="flex-shrink: 0; margin-top: 20px;">
                <button class="btn-secondary" onclick="hideAddGlobalTransformerModal()">取消</button>
                <button class="btn-primary" onclick="saveNewTransformer()">添加</button>
            </div>
        </div>
    </div>
    <!-- Confirm Delete Transformer Modal -->
    <div id="confirmDeleteTransformerModal" class="modal">
        <div class="modal-content">
            <div class="confirm-dialog">
                <h3>确认删除</h3>
                <p>您确定要删除此 Transformer 插件吗？</p>
                <p>此操作无法撤销。</p>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" onclick="hideConfirmDeleteTransformerModal()">取消</button>
                <button class="btn-danger" onclick="confirmDeleteTransformer()">删除</button>
            </div>
        </div>
    </div>
    <!-- Transformer Configuration Modal -->
    <div id="transformerModal" class="modal">
        <div class="modal-content" style="width: 700px; max-height: 80vh; display: flex; flex-direction: column;">
            <div class="modal-header" style="flex-shrink: 0;">
                <h2>配置转换器</h2>
            </div>
            <div class="modal-body" style="flex: 1; overflow-y: auto; padding-right: 15px; margin-right: -10px;">
                <h3>全局转换器配置</h3>
                <div class="transformer-section" id="globalTransformers">
                    <!-- Global transformers will be added here -->
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <button onclick="addGlobalTransformer()">添加全局转换器</button>
                </div>
                <h3 style="margin-top: 20px;">模型特定转换器</h3>
                <div id="modelSpecificTransformers">
                    <!-- Model-specific transformers will be added here -->
                </div>
            </div>
            <div class="modal-footer" style="flex-shrink: 0; margin-top: 20px;">
                <button class="btn-secondary" onclick="hideTransformerModal()">取消</button>
                <button class="btn-primary" onclick="saveTransformerConfig()">保存</button>
            </div>
        </div>
    </div>
    <!-- Model Selection Modal -->
    <div id="modelSelectionModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>选择要添加的模型</h2>
            </div>
            <div class="modal-body">
                <div class="model-search-container">
                    <input type="text" id="modelSearchInput" placeholder="搜索模型..." oninput="filterModelTable()">
                </div>
                <div class="model-table-container">
                    <table class="model-selection-table">
                        <thead>
                            <tr>
                                <th style="width: 50px;">
                                    <input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAllModels()">
                                </th>
                                <th>模型名称</th>
                                <th style="width: 100px;">状态</th>
                            </tr>
                        </thead>
                        <tbody id="modelTableBody">
                            <!-- Models will be added here dynamically -->
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" onclick="hideModelSelectionModal()">取消</button>
                <button class="btn-primary" onclick="confirmModelSelection()">确定</button>
            </div>
        </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        // 使用 sessionStorage 保存展开状态，避免重新渲染时丢失
        const getExpandedProviders = () => {
            try {
                return JSON.parse(sessionStorage.getItem('expandedProviders') || '[]');
            } catch {
                return [];
            }
        };
        const saveExpandedProviders = (names) => {
            sessionStorage.setItem('expandedProviders', JSON.stringify(names));
        };
        let currentConfig = null;
        let providerToDelete = null;
        let newProviderModels = [];
        let currentFetchProviderIndexForSelection = -1;
        let availableModels = [];
        let selectedModels = new Set();
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'configLoaded':
                    currentConfig = message.config;
                    renderBasicConfig();
                    renderProviders();
                    renderRouter();
                    renderTransformers();
                    break;
                case 'modelsFetched':
                    handleModelsFetched(message.models);
                    break;
                case 'fetchModelsError':
                    handleFetchModelsError(message.error);
                    break;
                case 'refreshConfig':
                    // 重新加载配置
                    sendMessage('getConfig');
                    break;
            }
        });
        function sendMessage(command, data = {}) {
            vscode.postMessage({
                command,
                ...data
            });
        }
        function renderProviders() {
            const tbody = document.getElementById('providersTableBody');
            tbody.innerHTML = '';
            if (!currentConfig || !currentConfig.Providers) {
                return;
            }
            const expandedProviders = getExpandedProviders();
            // 更新全部折叠/展开按钮的状态
            const collapseAllBtn = document.querySelector('.collapse-all-btn');
            if (collapseAllBtn) {
                const hasExpanded = expandedProviders.length > 0;
                collapseAllBtn.textContent = hasExpanded ? '▼' : '▶';
            }
            currentConfig.Providers.forEach((provider, index) => {
                const isExpanded = expandedProviders.includes(provider.name);
                const mainRow = document.createElement('tr');
                mainRow.className = 'provider-row';
                mainRow.innerHTML = \`
                    <td>
                        <span class="expand-icon \${isExpanded ? 'expanded' : ''}" onclick="toggleProviderDetails(\${index})">\${isExpanded ? '▼' : '▶'}</span>
                    </td>
                    <td onclick="toggleProviderDetails(\${index})">\${provider.name}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon delete" onclick="showDeleteConfirmation(\${index}, '\${provider.name}')">✕</button>
                        </div>
                    </td>
                \`;
                tbody.appendChild(mainRow);
                const detailsRow = document.createElement('tr');
                detailsRow.className = \`provider-details \${isExpanded ? 'active' : ''}\`;
                detailsRow.id = \`details-\${index}\`;
                detailsRow.innerHTML = \`
                    <td colspan="3">
                        <div class="details-content">
                            <div class="detail-item">
                                <label>名称:</label>
                                <input type="text" id="name-\${index}" value="\${provider.name}" onchange="updateProvider(\${index})">
                            </div>
                            <div class="detail-item">
                                <label>API 基础地址:</label>
                                <input type="text" id="api_base_url-\${index}" value="\${provider.api_base_url}" onchange="updateProvider(\${index})">
                            </div>
                            <div class="detail-item">
                                <label>API 密钥:</label>
                                <div class="password-input">
                                    <input type="password" id="api_key-\${index}" value="\${provider.api_key}" onchange="updateProvider(\${index})">
                                    <button class="toggle-password" onclick="toggleProviderPassword(\${index})">👁</button>
                                </div>
                            </div>
                            <div class="detail-item">
                                <label>模型:</label>
                                <div class="models-list" id="models-list-\${index}">
                                    \${provider.models.map(model =>
                                        \`<span class="model-tag">\${model}<span class="remove-model" onclick="removeModel(\${index}, '\${model}')">×</span></span>\`
                                    ).join('')}
                                </div>
                                <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                                    <div class="add-model" style="flex: 1;">
                                    <input type="text" id="newModel-\${index}" placeholder="填写模型名称，按Enter直接添加"
                                           onkeypress="if(event.key === 'Enter') addModel(\${index})">
                                    <button onclick="addModel(\${index})">+</button>
                                </div>
                                    <div style="display: flex; align-items: center; gap: 10px;">
                                        <input type="text" id="fetch_model_api-\${index}" value="\${provider.fetch_model_api || ''}" placeholder="模型API接口，默认为 /v1/models" onchange="updateProvider(\${index})" style="width: 200px;">
                                        <button id="fetchModelsBtn-\${index}" onclick="fetchModelsForProvider(\${index})" \${provider.api_base_url ? '' : 'disabled'}>获取模型</button>
                                    </div>
                                </div>
                            </div>
                            <div class="transformer-section detail-item">
                                <div style="margin-bottom: 10px;">
                                    <label style="margin: 0; margin-right: 10px;">转换器配置:</label>
                                    <button onclick="showAddTransformerModal(\${index})" style="margin-left: 10px;">配置转换器</button>
                                </div>
                                <div id="transformer-config-\${index}">
                                    \${renderTransformerConfig(provider.transformer, index)}
                                </div>
                            </div>
                        </div>
                    </td>
                \`;
                tbody.appendChild(detailsRow);
            });
        }
        function toggleProviderDetails(index) {
            const detailsRow = document.getElementById(\`details-\${index}\`);
            const mainRow = detailsRow.previousElementSibling;
            const expandIcon = mainRow.querySelector('.expand-icon');
            const providerName = currentConfig.Providers[index].name;
            const expandedProviders = getExpandedProviders();

            if (detailsRow.classList.contains('active')) {
                detailsRow.classList.remove('active');
                expandIcon.classList.remove('expanded');
                expandIcon.textContent = '▶';
                // 从 sessionStorage 中移除
                const idx = expandedProviders.indexOf(providerName);
                if (idx > -1) {
                    expandedProviders.splice(idx, 1);
                }
            } else {
                detailsRow.classList.add('active');
                expandIcon.classList.add('expanded');
                expandIcon.textContent = '▼';
                // 添加到 sessionStorage
                if (!expandedProviders.includes(providerName)) {
                    expandedProviders.push(providerName);
                }
            }
            // 保存到 sessionStorage
            saveExpandedProviders(expandedProviders);
            // 更新全部折叠/展开按钮的状态
            updateCollapseAllButton();
        }
        function updateCollapseAllButton() {
            const collapseAllBtn = document.querySelector('.collapse-all-btn');
            if (!collapseAllBtn || !currentConfig || !currentConfig.Providers) return;
            const expandedProviders = getExpandedProviders();
            const hasExpanded = expandedProviders.length > 0;
            collapseAllBtn.textContent = hasExpanded ? '▼' : '▶';
        }
        function toggleAllProviders() {
            if (!currentConfig || !currentConfig.Providers) return;
            const expandedProviders = getExpandedProviders();
            const hasExpanded = expandedProviders.length > 0;

            if (hasExpanded) {
                // 全部折叠
                expandedProviders.length = 0;
                currentConfig.Providers.forEach((provider, index) => {
                    const detailsRow = document.getElementById(\`details-\${index}\`);
                    const mainRow = detailsRow?.previousElementSibling;
                    if (detailsRow && mainRow) {
                        detailsRow.classList.remove('active');
                        const expandIcon = mainRow.querySelector('.expand-icon');
                        if (expandIcon) {
                            expandIcon.classList.remove('expanded');
                            expandIcon.textContent = '▶';
                        }
                    }
                });
            } else {
                // 全部展开
                expandedProviders.length = 0;
                currentConfig.Providers.forEach((provider, index) => {
                    expandedProviders.push(provider.name);
                    // 更新每个提供商的展开状态
                    const detailsRow = document.getElementById(\`details-\${index}\`);
                    const mainRow = detailsRow?.previousElementSibling;
                    if (detailsRow && mainRow) {
                        detailsRow.classList.add('active');
                        const expandIcon = mainRow.querySelector('.expand-icon');
                        if (expandIcon) {
                            expandIcon.classList.add('expanded');
                            expandIcon.textContent = '▼';
                        }
                    }
                });
            }
            saveExpandedProviders(expandedProviders);
            updateCollapseAllButton();
        }
        function showAddProviderModal() {
            document.getElementById('addProviderModal').classList.add('active');
        }
        function hideAddProviderModal() {
            document.getElementById('addProviderModal').classList.remove('active');
            document.getElementById('newProviderName').value = '';
            document.getElementById('newProviderUrl').value = '';
            document.getElementById('newProviderFetchModelApi').value = '';
            document.getElementById('newProviderKey').value = '';
            document.getElementById('newProviderModelInput').value = '';
            newProviderModels = [];
            renderNewProviderModels();
            const fetchBtn = document.getElementById('fetchModelsBtn');
            if (fetchBtn) {
                fetchBtn.disabled = true;
            }
        }
        function toggleFetchModelsButton() {
            const urlInput = document.getElementById('newProviderUrl');
            const fetchBtn = document.getElementById('fetchModelsBtn');
            if (fetchBtn) {
                fetchBtn.disabled = !urlInput.value.trim();
            }
        }
        function addNewProvider() {
            const nameInput = document.getElementById('newProviderName');
            const urlInput = document.getElementById('newProviderUrl');
            const fetchModelApiInput = document.getElementById('newProviderFetchModelApi');
            const keyInput = document.getElementById('newProviderKey');
            const name = nameInput.value.trim();
            const url = urlInput.value.trim();
            const fetchModelApi = fetchModelApiInput.value.trim();
            const key = keyInput.value.trim();
            nameInput.style.borderColor = '';
            urlInput.style.borderColor = '';
            let hasError = false;
            if (!name) {
                nameInput.style.borderColor = 'var(--vscode-errorForeground)';
                hasError = true;
            }
            if (!url) {
                urlInput.style.borderColor = 'var(--vscode-errorForeground)';
                hasError = true;
            }
            if (hasError) {
                setTimeout(() => {
                    nameInput.style.borderColor = '';
                    urlInput.style.borderColor = '';
                }, 2000);
                return;
            }
            const newProvider = {
                name,
                api_base_url: url,
                api_key: key,
                ...(fetchModelApi && { fetch_model_api: fetchModelApi }),
                models: [...newProviderModels]
            };
            sendMessage('addProvider', { provider: newProvider });
            hideAddProviderModal();
        }
        function addModelToNewProvider() {
            const input = document.getElementById('newProviderModelInput');
            const modelName = input.value.trim();
            if (modelName && !newProviderModels.includes(modelName)) {
                newProviderModels.push(modelName);
                input.value = '';
                renderNewProviderModels();
                input.focus();
            }
        }
        function removeModelFromNewProvider(modelName) {
            newProviderModels = newProviderModels.filter(m => m !== modelName);
            renderNewProviderModels();
        }
        function renderNewProviderModels() {
            const container = document.getElementById('newProviderModelsList');
            container.innerHTML = newProviderModels.map(model =>
                \`<span class="model-tag">\${model}<span class="remove-model" onclick="removeModelFromNewProvider('\${model}')">×</span></span>\`
            ).join('');
        }
        function toggleProviderPassword(index) {
            const input = document.getElementById("api_key-" + index);
            const button = event.target;
            if (input.type === 'password') {
                input.type = 'text';
                button.textContent = '🙈';
            } else {
                input.type = 'password';
                button.textContent = '👁';
            }
        }
        function toggleNewProviderPassword() {
            const input = document.getElementById('newProviderKey');
            const button = event.target;
            if (input.type === 'password') {
                input.type = 'text';
                button.textContent = '🙈';
            } else {
                input.type = 'password';
                button.textContent = '👁';
            }
        }
        function showDeleteConfirmation(index, name) {
            providerToDelete = { index, name };
            document.getElementById('deleteProviderName').textContent = name;
            document.getElementById('confirmDeleteModal').classList.add('active');
        }
        function hideConfirmDeleteModal() {
            document.getElementById('confirmDeleteModal').classList.remove('active');
            providerToDelete = null;
        }
        function confirmDelete() {
            if (providerToDelete) {
                sendMessage('removeProvider', { providerName: providerToDelete.name });
                hideConfirmDeleteModal();
            }
        }
        function updateProvider(index) {
            if (!currentConfig || !currentConfig.Providers) return;
            const provider = currentConfig.Providers[index];
            provider.name = document.getElementById(\`name-\${index}\`).value;
            provider.api_base_url = document.getElementById(\`api_base_url-\${index}\`).value;
            provider.api_key = document.getElementById(\`api_key-\${index}\`).value;
            const fetchModelApi = document.getElementById(\`fetch_model_api-\${index}\`).value.trim();
            provider.fetch_model_api = fetchModelApi || undefined;
            sendMessage('updateProvider', { index, provider });
        }
        function addModel(providerIndex) {
            if (!currentConfig || !currentConfig.Providers) return;
            const input = document.getElementById(\`newModel-\${providerIndex}\`);
            const modelName = input.value.trim();
            if (modelName && !currentConfig.Providers[providerIndex].models.includes(modelName)) {
                currentConfig.Providers[providerIndex].models.push(modelName);
                input.value = '';
                updateProvider(providerIndex);
                input.focus();
            }
        }
        function removeModel(providerIndex, modelName) {
            if (!currentConfig || !currentConfig.Providers) return;
            const provider = currentConfig.Providers[providerIndex];
            provider.models = provider.models.filter(m => m !== modelName);
            updateProvider(providerIndex);
        }
        let currentFetchProviderIndex = -1;
        let currentFetchForNewProvider = false;
        function fetchModelsForProvider(providerIndex) {
            if (!currentConfig || !currentConfig.Providers[providerIndex]) return;
            currentFetchProviderIndex = providerIndex;
            currentFetchForNewProvider = false;
            const provider = currentConfig.Providers[providerIndex];
            const apiUrl = provider.api_base_url;
            const apiKey = provider.api_key;
            const fetchModelApi = provider.fetch_model_api;
            const btn = document.getElementById(\`fetchModelsBtn-\${providerIndex}\`);
            const originalText = btn.textContent;
            btn.textContent = '获取中...';
            btn.disabled = true;
            sendMessage('fetchModels', {
                apiBaseUrl: apiUrl,
                apiKey: apiKey,
                fetchModelApi: fetchModelApi
            });
        }
        function fetchModelsForNewProvider() {
            const urlInput = document.getElementById('newProviderUrl');
            const fetchModelApiInput = document.getElementById('newProviderFetchModelApi');
            const keyInput = document.getElementById('newProviderKey');
            const apiUrl = urlInput.value.trim();
            const fetchModelApi = fetchModelApiInput.value.trim();
            const apiKey = keyInput.value.trim();
            if (!apiUrl) {
                alert('请先填写API基础地址');
                return;
            }
            const btn = document.getElementById('fetchModelsBtn');
            const originalText = btn.textContent;
            btn.textContent = '获取中...';
            btn.disabled = true;
            currentFetchProviderIndex = -1;
            currentFetchForNewProvider = true;
            sendMessage('fetchModels', {
                apiBaseUrl: apiUrl,
                apiKey: apiKey,
                fetchModelApi: fetchModelApi
            });
        }
        function handleModelsFetched(models) {
            if (currentFetchForNewProvider) {
                const btn = document.getElementById('fetchModelsBtn');
                btn.textContent = '获取模型';
                btn.disabled = false;

                // 对于新服务提供商，也显示模型选择对话框
                currentFetchProviderIndexForSelection = -1; // 标记为新服务提供商
                availableModels = models;
                selectedModels.clear();

                // 预选已设置的模型（与当前 newProviderModels 取交集）
                newProviderModels.forEach(model => {
                    if (models.includes(model)) {
                        selectedModels.add(model);
                    }
                });

                showModelSelectionModal();
            } else if (currentFetchProviderIndex >= 0) {
                const btn = document.getElementById(\`fetchModelsBtn-\${currentFetchProviderIndex}\`);
                btn.textContent = '获取模型';
                btn.disabled = false;
                // 显示模型选择对话框
                currentFetchProviderIndexForSelection = currentFetchProviderIndex;
                availableModels = models;
                selectedModels.clear();

                // 预选已配置的模型（只预选在 availableModels 中的模型）
                const provider = currentConfig.Providers[currentFetchProviderIndex];
                provider.models.forEach(model => {
                    if (models.includes(model)) {
                        selectedModels.add(model);
                    }
                });

                showModelSelectionModal();
            }
        }
        function handleFetchModelsError(error) {
            if (currentFetchForNewProvider) {
                const btn = document.getElementById('fetchModelsBtn');
                btn.textContent = '获取模型';
                btn.disabled = false;
            } else if (currentFetchProviderIndex >= 0) {
                const btn = document.getElementById(\`fetchModelsBtn-\${currentFetchProviderIndex}\`);
                btn.textContent = '获取模型';
                btn.disabled = false;
            }
            alert(\`获取模型失败: \${error}\`);
        }
        function renderBasicConfig() {
            if (!currentConfig) return;
            document.getElementById('config_LOG').value = currentConfig.LOG ? 'true' : 'false';
            document.getElementById('config_LOG_LEVEL').value = currentConfig.LOG_LEVEL || 'warn';
            document.getElementById('config_HOST').value = currentConfig.HOST || '127.0.0.1';
            document.getElementById('config_PORT').value = currentConfig.PORT || 3456;
            document.getElementById('config_APIKEY').value = currentConfig.APIKEY || '';
            document.getElementById('config_API_TIMEOUT_MS').value = currentConfig.API_TIMEOUT_MS || '600000';
            document.getElementById('config_PROXY_URL').value = currentConfig.PROXY_URL || '';
            document.getElementById('config_CLAUDE_PATH').value = currentConfig.CLAUDE_PATH || '';
        }
        function updateBasicConfig() {
            if (!currentConfig) return;
            currentConfig.LOG = document.getElementById('config_LOG').value === 'true';
            currentConfig.LOG_LEVEL = document.getElementById('config_LOG_LEVEL').value;
            currentConfig.HOST = document.getElementById('config_HOST').value;
            currentConfig.PORT = parseInt(document.getElementById('config_PORT').value) || 3456;
            currentConfig.APIKEY = document.getElementById('config_APIKEY').value;
            currentConfig.API_TIMEOUT_MS = document.getElementById('config_API_TIMEOUT_MS').value;
            currentConfig.PROXY_URL = document.getElementById('config_PROXY_URL').value;
            currentConfig.CLAUDE_PATH = document.getElementById('config_CLAUDE_PATH').value;
            sendMessage('updateBasicConfig', { config: currentConfig });
        }
        function renderTransformers() {
            const container = document.getElementById('transformersContainer');
            if (!container) return;
            container.innerHTML = '';
            if (!currentConfig || !currentConfig.transformers) {
                return;
            }
            currentConfig.transformers.forEach(function(transformer, index) {
                const card = createTransformerCard(transformer, index);
                container.appendChild(card);
            });
        }
        function showModelSelectionModal() {
            const modal = document.getElementById('modelSelectionModal');
            const title = modal.querySelector('h2');
            if (currentFetchProviderIndexForSelection === -1) {
                title.textContent = '选择要添加到新服务提供商的模型';
            } else {
                title.textContent = '选择要添加的模型';
            }
            modal.classList.add('active');
            renderModelTable();
            document.getElementById('modelSearchInput').value = '';
        }
        function hideModelSelectionModal() {
            document.getElementById('modelSelectionModal').classList.remove('active');
            availableModels = [];
            selectedModels.clear();
        }
        function renderModelTable() {
            const tbody = document.getElementById('modelTableBody');
            if (!tbody) return;
            tbody.innerHTML = '';

            availableModels.forEach(model => {
                const tr = document.createElement('tr');
                const isSelected = selectedModels.has(model);

                // 对于现有服务提供商，检查是否已在配置中
                // 对于新服务提供商，检查是否已在 newProviderModels 中设置过
                const isExisting = currentFetchProviderIndexForSelection >= 0
                    ? currentConfig.Providers[currentFetchProviderIndexForSelection].models.includes(model)
                    : newProviderModels.includes(model);

                tr.innerHTML = \`<td>
                    <input type="checkbox"
                           class="model-checkbox"
                           \${isSelected ? 'checked' : ''}
                           onchange="toggleModelSelection('\${model}')">
                </td>
                <td>\${model}</td>
                <td>
                    <span class="model-status \${isExisting ? 'existing' : 'new'}">
                        \${isExisting ? '已配置' : '新模型'}
                    </span>
                </td>\`;
                tbody.appendChild(tr);
            });
            // 更新全选复选框的状态
            const selectAllCheckbox = document.getElementById('selectAllCheckbox');
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = selectedModels.size === availableModels.length && availableModels.length > 0;
            }
        }
        function toggleModelSelection(model) {
            if (selectedModels.has(model)) {
                selectedModels.delete(model);
            } else {
                selectedModels.add(model);
            }
            // 更新全选复选框的状态
            const selectAllCheckbox = document.getElementById('selectAllCheckbox');
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = selectedModels.size === availableModels.length && availableModels.length > 0;
            }
        }
        function toggleSelectAllModels() {
            const selectAllCheckbox = document.getElementById('selectAllCheckbox');
            if (!selectAllCheckbox) return;

            // 判断当前是全选还是取消全选
            if (selectedModels.size === availableModels.length) {
                // 全部已选中，取消全选
                selectedModels.clear();
                selectAllCheckbox.checked = false;
            } else {
                // 全选所有模型
                selectedModels.clear();
                availableModels.forEach(model => {
                    selectedModels.add(model);
                });
                selectAllCheckbox.checked = true;
            }
            renderModelTable();
        }
        function filterModelTable() {
            const searchTerm = document.getElementById('modelSearchInput').value.toLowerCase();
            const rows = document.querySelectorAll('#modelTableBody tr');

            rows.forEach(row => {
                const modelName = row.cells[1].textContent.toLowerCase();
                if (modelName.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        }
        function confirmModelSelection() {
            if (currentFetchProviderIndexForSelection >= 0) {
                // 现有服务提供商
                const provider = currentConfig.Providers[currentFetchProviderIndexForSelection];
                // 保留手动添加的自定义模型（不在 availableModels 中的模型）
                // 加上用户在对话框中选中的模型
                const customModels = provider.models.filter(m => !availableModels.includes(m));
                const selectedArray = Array.from(selectedModels);
                provider.models = [...customModels, ...selectedArray];
                updateProvider(currentFetchProviderIndexForSelection);
            } else {
                // 新服务提供商
                // 保留手动添加的自定义模型（不在 availableModels 中的模型）
                // 加上用户在对话框中选中的模型
                const customModels = newProviderModels.filter(m => !availableModels.includes(m));
                const selectedArray = Array.from(selectedModels);
                newProviderModels = [...customModels, ...selectedArray];
                renderNewProviderModels();
            }
            hideModelSelectionModal();
        }
        function createTransformerCard(transformer, index) {
            const card = document.createElement('div');
            card.className = 'transformer-item-card';
            const header = document.createElement('div');
            header.className = 'transformer-item-header';
            const title = document.createElement('h3');
            const pathParts = transformer.path.replace(/\\\\/g, '/').split('/');
            title.textContent = 'Transformer ' + (index + 1) + ': ' + (pathParts[pathParts.length - 1] || '未命名');
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-icon delete';
            deleteBtn.textContent = '✕';
            deleteBtn.title = '删除此 Transformer';
            deleteBtn.onclick = function() {
                showDeleteTransformerConfirmation(index);
            };
            header.appendChild(title);
            header.appendChild(deleteBtn);
            const body = document.createElement('div');
            body.className = 'transformer-item-body';
            const pathItem = document.createElement('div');
            pathItem.className = 'detail-item';
            const pathLabel = document.createElement('label');
            pathLabel.textContent = '插件路径:';
            const pathInput = document.createElement('input');
            pathInput.type = 'text';
            pathInput.value = transformer.path;
            pathInput.style.width = '100%';
            pathInput.onchange = function() {
                updateTransformerConfig(index, 'path', this.value);
            };
            pathItem.appendChild(pathLabel);
            pathItem.appendChild(pathInput);
            const optionsItem = document.createElement('div');
            optionsItem.className = 'detail-item';
            const optionsLabel = document.createElement('label');
            optionsLabel.textContent = '配置选项 (JSON):';
            const optionsTextarea = document.createElement('textarea');
            optionsTextarea.value = JSON.stringify(transformer.options, null, 2);
            optionsTextarea.onchange = function() {
                try {
                    const options = JSON.parse(this.value);
                    updateTransformerConfig(index, 'options', options);
                } catch (e) {
                    alert('JSON 格式错误: ' + e.message);
                    this.value = JSON.stringify(transformer.options, null, 2);
                }
            };
            optionsItem.appendChild(optionsLabel);
            optionsItem.appendChild(optionsTextarea);
            body.appendChild(pathItem);
            body.appendChild(optionsItem);
            card.appendChild(header);
            card.appendChild(body);
            return card;
        }
        function addNewTransformerCard() {
            showAddGlobalTransformerModal();
        }
        function showAddGlobalTransformerModal() {
            document.getElementById('newTransformerPath').value = '';
            document.getElementById('newTransformerOptions').value = '{}';
            document.getElementById('addTransformerModal').classList.add('active');
            document.getElementById('newTransformerPath').focus();
        }
        function hideAddGlobalTransformerModal() {
            document.getElementById('addTransformerModal').classList.remove('active');
        }
        function saveNewTransformer() {
            const pathInput = document.getElementById('newTransformerPath');
            const optionsInput = document.getElementById('newTransformerOptions');
            const path = pathInput.value.trim();
            let options = {};
            if (!path) {
                pathInput.style.borderColor = 'var(--vscode-errorForeground)';
                setTimeout(() => {
                    pathInput.style.borderColor = '';
                }, 2000);
                return;
            }
            const optionsText = optionsInput.value.trim();
            if (optionsText) {
                try {
                    options = JSON.parse(optionsText);
                } catch (e) {
                    optionsInput.style.borderColor = 'var(--vscode-errorForeground)';
                    setTimeout(() => {
                        optionsInput.style.borderColor = '';
                    }, 2000);
                    alert('JSON 格式错误: ' + e.message);
                    return;
                }
            }
            const newTransformer = {
                path: path,
                options: options
            };
            sendMessage('addTransformer', { transformer: newTransformer });
            hideAddGlobalTransformerModal();
        }
        let transformerToDelete = -1;
        function showDeleteTransformerConfirmation(index) {
            transformerToDelete = index;
            document.getElementById('confirmDeleteTransformerModal').classList.add('active');
        }
        function hideConfirmDeleteTransformerModal() {
            document.getElementById('confirmDeleteTransformerModal').classList.remove('active');
            transformerToDelete = -1;
        }
        function confirmDeleteTransformer() {
            if (transformerToDelete >= 0) {
                sendMessage('removeTransformer', { index: transformerToDelete });
                hideConfirmDeleteTransformerModal();
            }
        }
        function updateTransformerConfig(index, field, value) {
            if (!currentConfig || !currentConfig.transformers) return;
            const transformer = currentConfig.transformers[index];
            if (field === 'path') {
                transformer.path = value;
            } else if (field === 'options') {
                transformer.options = value;
            }
            sendMessage('updateTransformer', { index: index, transformer: transformer });
        }
        function renderRouter() {
            const routerConfig = document.getElementById('routerConfig');
            routerConfig.innerHTML = '';
            if (!currentConfig || !currentConfig.Router) {
                return;
            }
            const gridContainer = document.createElement('div');
            gridContainer.className = 'router-grid';
            const routerFields = [
                { key: 'default', label: '默认' },
                { key: 'background', label: '后台任务' },
                { key: 'think', label: '思考' },
                { key: 'longContext', label: '长上下文' },
                { key: 'webSearch', label: '网络搜索' },
                { key: 'image', label: '图像' }
            ];
            const providerOptions = currentConfig.Providers ?
                currentConfig.Providers.flatMap(p => p.models.map(m => \`\${p.name},\${m}\`)) : [];
            routerFields.forEach(field => {
                const routerDiv = document.createElement('div');
                routerDiv.className = 'router-field';
                const label = document.createElement('label');
                label.textContent = field.label;
                routerDiv.appendChild(label);
                const selectContainer = document.createElement('div');
                selectContainer.className = 'router-dropdown-container';
                selectContainer.style.position = 'relative';
                selectContainer.style.display = 'inline-block';
                selectContainer.style.width = '100%';
                selectContainer.style.maxWidth = '400px';
                const modelInput = document.createElement('input');
                modelInput.type = 'text';
                modelInput.className = 'router-dropdown-input';
                modelInput.id = \`router-\${field.key}-input\`;
                modelInput.placeholder = '选择模型...';
                modelInput.style.width = '100%';
                modelInput.style.padding = '5px';
                modelInput.style.backgroundColor = 'var(--vscode-input-background)';
                modelInput.style.color = 'var(--vscode-input-foreground)';
                modelInput.style.border = '1px solid var(--vscode-input-border)';
                modelInput.style.borderRadius = '3px';
                modelInput.style.cursor = 'pointer';
                modelInput.style.boxSizing = 'border-box';
                const currentValue = currentConfig.Router[field.key] || '';
                modelInput.value = currentValue;
                modelInput.setAttribute('data-selected-value', currentValue);
                const modelDropdown = document.createElement('div');
                modelDropdown.id = \`router-\${field.key}-dropdown\`;
                modelDropdown.className = 'router-dropdown';
                modelDropdown.style.position = 'absolute';
                modelDropdown.style.top = '100%';
                modelDropdown.style.left = '0';
                modelDropdown.style.width = '100%';
                modelDropdown.style.backgroundColor = 'var(--vscode-dropdown-background, var(--vscode-editor-background))';
                modelDropdown.style.border = '1px solid var(--vscode-dropdown-border, var(--vscode-input-border))';
                modelDropdown.style.borderRadius = '3px';
                modelDropdown.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                modelDropdown.style.maxHeight = '200px';
                modelDropdown.style.overflowY = 'auto';
                modelDropdown.style.zIndex = '99999';
                modelDropdown.style.display = 'none';
                modelDropdown.style.marginTop = '2px';
                modelDropdown.style.boxSizing = 'border-box';
                const searchInput = document.createElement('input');
                searchInput.type = 'text';
                searchInput.className = 'router-dropdown-search';
                searchInput.placeholder = '搜索模型...';
                searchInput.style.width = '100%';
                searchInput.style.padding = '5px';
                searchInput.style.border = 'none';
                searchInput.style.borderBottom = '1px solid var(--vscode-dropdown-border)';
                searchInput.style.outline = 'none';
                searchInput.style.backgroundColor = 'var(--vscode-input-background)';
                searchInput.style.color = 'var(--vscode-input-foreground)';
                searchInput.style.boxSizing = 'border-box';
                modelDropdown.appendChild(searchInput);
                const emptyOption = document.createElement('div');
                emptyOption.className = 'router-model-option';
                emptyOption.style.padding = '8px 12px';
                emptyOption.style.cursor = 'pointer';
                emptyOption.style.fontSize = '13px';
                emptyOption.style.color = 'var(--vscode-disabledForeground)';
                emptyOption.textContent = '不选择模型';
                emptyOption.setAttribute('data-value', '');
                emptyOption.addEventListener('mouseenter', function() {
                    this.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
                });
                emptyOption.addEventListener('mouseleave', function() {
                    this.style.backgroundColor = 'transparent';
                });
                modelDropdown.appendChild(emptyOption);
                providerOptions.forEach(option => {
                    const optionEl = document.createElement('div');
                    optionEl.className = 'router-model-option';
                    optionEl.style.padding = '8px 12px';
                    optionEl.style.cursor = 'pointer';
                    optionEl.style.fontSize = '13px';
                    optionEl.textContent = option;
                    optionEl.setAttribute('data-value', option);
                    if (currentValue === option) {
                        optionEl.style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
                        optionEl.style.color = 'var(--vscode-list-activeSelectionForeground)';
                    }
                    optionEl.addEventListener('mouseenter', function() {
                        this.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
                        this.style.color = 'var(--vscode-editor-foreground)';
                    });
                    optionEl.addEventListener('mouseleave', function() {
                        if (this.getAttribute('data-value') === currentValue) {
                            this.style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
                            this.style.color = 'var(--vscode-list-activeSelectionForeground)';
                        } else {
                            this.style.backgroundColor = 'transparent';
                            this.style.color = 'var(--vscode-editor-foreground)';
                        }
                    });
                    modelDropdown.appendChild(optionEl);
                });
                selectContainer.appendChild(modelInput);
                selectContainer.appendChild(modelDropdown);
                routerDiv.appendChild(selectContainer);
                gridContainer.appendChild(routerDiv);
                modelInput.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    document.querySelectorAll('.router-dropdown').forEach(d => {
                        if (d !== modelDropdown) {
                            d.style.display = 'none';
                        }
                    });
                    if (modelDropdown.style.display === 'block') {
                        modelDropdown.style.display = 'none';
                    } else {
                        modelDropdown.style.display = 'block';
                        searchInput.value = '';
                        searchInput.focus();
                        filterRouterOptions(field.key, '');
                    }
                });
                searchInput.addEventListener('click', function(e) {
                    e.stopPropagation();
                });
                function filterRouterOptions(routerKey, searchTerm) {
                    const dropdown = document.getElementById(\`router-\${routerKey}-dropdown\`);
                    if (!dropdown) return;
                    const options = dropdown.querySelectorAll('.router-model-option');
                    options.forEach(option => {
                        const text = option.textContent.toLowerCase();
                        if (text.includes(searchTerm.toLowerCase())) {
                            option.style.display = 'block';
                        } else {
                            option.style.display = 'none';
                        }
                    });
                }
                searchInput.addEventListener('input', function() {
                    filterRouterOptions(field.key, this.value);
                });
                modelDropdown.addEventListener('click', function(e) {
                    const option = e.target.closest('.router-model-option');
                    if (option) {
                        e.preventDefault();
                        e.stopPropagation();
                        const value = option.getAttribute('data-value');
                        const displayText = value === '' ? '不选择模型' : value;
                        modelInput.value = displayText;
                        modelInput.setAttribute('data-selected-value', value);
                        modelDropdown.style.display = 'none';
                        const allOptions = modelDropdown.querySelectorAll('.router-model-option');
                        allOptions.forEach(opt => {
                            if (opt.getAttribute('data-value') === value) {
                                opt.style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
                                opt.style.color = 'var(--vscode-list-activeSelectionForeground)';
                            } else {
                                opt.style.backgroundColor = 'transparent';
                                opt.style.color = 'var(--vscode-editor-foreground)';
                            }
                        });
                        currentConfig.Router[field.key] = value;
                        updateRouter(field.key, value);
                    }
                });
                searchInput.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const visibleOptions = Array.from(modelDropdown.querySelectorAll('.router-model-option')).filter(opt =>
                            opt.style.display !== 'none'
                        );
                        if (visibleOptions.length > 0) {
                            const firstOption = visibleOptions[0];
                            const value = firstOption.getAttribute('data-value');
                            const displayText = value === '' ? '不选择模型' : value;
                            modelInput.value = displayText;
                            modelInput.setAttribute('data-selected-value', value);
                            modelDropdown.style.display = 'none';
                            const allOptions = modelDropdown.querySelectorAll('.router-model-option');
                            allOptions.forEach(opt => {
                                if (opt.getAttribute('data-value') === value) {
                                    opt.style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
                                    opt.style.color = 'var(--vscode-list-activeSelectionForeground)';
                                } else {
                                    opt.style.backgroundColor = 'transparent';
                                    opt.style.color = 'var(--vscode-editor-foreground)';
                                }
                            });
                            currentConfig.Router[field.key] = value;
                            updateRouter(field.key, value);
                        }
                    } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const visibleOptions = Array.from(modelDropdown.querySelectorAll('.router-model-option')).filter(opt =>
                            opt.style.display !== 'none'
                        );
                        if (visibleOptions.length > 0) {
                            visibleOptions[0].focus();
                        }
                    } else if (e.key === 'Escape') {
                        modelDropdown.style.display = 'none';
                    }
                });
                const modelOptions = modelDropdown.querySelectorAll('.router-model-option');
                modelOptions.forEach((option, index) => {
                    option.setAttribute('tabindex', '-1');
                    option.addEventListener('keydown', function(e) {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            const value = this.getAttribute('data-value');
                            const displayText = value === '' ? '不选择模型' : value;
                            modelInput.value = displayText;
                            modelInput.setAttribute('data-selected-value', value);
                            modelDropdown.style.display = 'none';
                            const allOptions = modelDropdown.querySelectorAll('.router-model-option');
                            allOptions.forEach(opt => {
                                if (opt.getAttribute('data-value') === value) {
                                    opt.style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
                                    opt.style.color = 'var(--vscode-list-activeSelectionForeground)';
                                } else {
                                    opt.style.backgroundColor = 'transparent';
                                    opt.style.color = 'var(--vscode-editor-foreground)';
                                }
                            });
                            currentConfig.Router[field.key] = value;
                            updateRouter(field.key, value);
                        } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            const allOptions = Array.from(modelDropdown.querySelectorAll('.router-model-option'));
                            const visibleOptions = allOptions.filter(opt => opt.style.display !== 'none');
                            const currentIndex = visibleOptions.indexOf(this);
                            const nextIndex = currentIndex + 1;
                            if (nextIndex < visibleOptions.length) {
                                visibleOptions[nextIndex].focus();
                            }
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            const allOptions = Array.from(modelDropdown.querySelectorAll('.router-model-option'));
                            const visibleOptions = allOptions.filter(opt => opt.style.display !== 'none');
                            const currentIndex = visibleOptions.indexOf(this);
                            const prevIndex = currentIndex - 1;
                            if (prevIndex >= 0) {
                                visibleOptions[prevIndex].focus();
                            } else {
                                searchInput.focus();
                            }
                        } else if (e.key === 'Escape') {
                            modelDropdown.style.display = 'none';
                            searchInput.focus();
                        }
                    });
                });
                document.addEventListener('click', function handleClickOutside(e) {
                    if (!selectContainer.contains(e.target)) {
                        modelDropdown.style.display = 'none';
                    }
                });
            });
            routerConfig.appendChild(gridContainer);
            const thresholdDiv = document.createElement('div');
            thresholdDiv.className = 'router-threshold';
            thresholdDiv.innerHTML = \`
                <label for="router-longContextThreshold">长上下文阈值</label>
                <input type="number" id="router-longContextThreshold"
                       value="\${currentConfig.Router.longContextThreshold}"
                       onchange="updateRouter('longContextThreshold', this.value)">
            \`;
            routerConfig.appendChild(thresholdDiv);
        }
        function updateRouter(key, value) {
            sendMessage('updateRouter', { key, value });
        }
        function refreshConfig() {
            sendMessage('refreshConfig');
        }
        function restartCcr() {
            sendMessage('restartCcr');
        }
        function openCCRConfig() {
            sendMessage('openCCRConfig');
        }
        function openCCSettings() {
            sendMessage('openCCSettings');
        }
        let currentProviderIndex = -1;
        let currentTransformerConfig = {
            use: [], // Array<string | [string, any]>
            modelSpecific: {} // Model-specific transformer configurations
        };
        function renderTransformerConfig(transformer, index) {
            if (!transformer) {
                return '<p style="color: var(--vscode-disabledForeground);">未配置转换器</p>';
            }
            let html = '<div class="transformer-list">';
            if (transformer.use) {
                html += '<div><strong>全局:</strong> ';
                const transformers = formatTransformers(transformer.use);
                html += transformers.map(t =>
                    '<span class="model-tag">' + t.name + (t.params ? '(' + t.params + ')' : '') + '</span>'
                ).join(' ');
                html += '</div>';
            }
            Object.keys(transformer).forEach(function(key) {
                if (key !== 'use' && transformer[key].use) {
                    html += '<div style="margin-top: 5px;"><strong>' + key + ':</strong> ';
                    const transformers = formatTransformers(transformer[key].use);
                    html += transformers.map(t =>
                        '<span class="model-tag">' + t.name + (t.params ? '(' + t.params + ')' : '') + '</span>'
                    ).join(' ');
                    html += '</div>';
                }
            });
            html += '</div>';
            return html;
        }
        function formatTransformers(transformerUse) {
            return transformerUse.map(item => {
                if (typeof item === 'string') {
                    return { name: item, params: null };
                } else if (Array.isArray(item) && item.length === 2) {
                    const [name, params] = item;
                    return {
                        name: name,
                        params: params ? JSON.stringify(params, null, 2) : null
                    };
                }
                return null;
            }).filter(t => t && t.name);
        }
        function showAddTransformerModal(index) {
            currentProviderIndex = index;
            const provider = currentConfig.Providers[index];
            currentTransformerConfig = {
                use: [],
                modelSpecific: {}
            };
            if (provider.transformer) {
                if (provider.transformer.use) {
                    currentTransformerConfig.use = processTransformers(provider.transformer.use);
                }
                Object.keys(provider.transformer).forEach(key => {
                    if (key !== 'use') {
                        currentTransformerConfig.modelSpecific[key] = {
                            use: processTransformers(provider.transformer[key].use)
                        };
                    }
                });
            }
            document.getElementById('transformerModal').classList.add('active');
            renderTransformerModal();
        }
        function processTransformers(transformArray) {
            return transformArray;
        }
        function renderTransformerModal() {
            const globalContainer = document.getElementById('globalTransformers');
            globalContainer.innerHTML = '';
            currentTransformerConfig.use.forEach((item, index) => {
                const div = createTransformerItem(item, index, 'global');
                globalContainer.appendChild(div);
            });
            const modelContainer = document.getElementById('modelSpecificTransformers');
            modelContainer.innerHTML = '';
            Object.keys(currentTransformerConfig.modelSpecific).forEach(function(modelName) {
                const modelDiv = document.createElement('div');
                modelDiv.className = 'model-transformer';
                const h4 = document.createElement('h4');
                h4.textContent = modelName;
                modelDiv.appendChild(h4);
                const transformerDiv = document.createElement('div');
                transformerDiv.id = 'modelTransformers-' + modelName;
                currentTransformerConfig.modelSpecific[modelName].use.forEach((item, index) => {
                    const itemDiv = createTransformerItem(item, index, 'model', modelName);
                    transformerDiv.appendChild(itemDiv);
                });
                modelDiv.appendChild(transformerDiv);
                const addButton = document.createElement('button');
                addButton.textContent = '添加转换器';
                addButton.onclick = function() { addModelTransformer(modelName); };
                modelDiv.appendChild(addButton);
                modelContainer.appendChild(modelDiv);
            });
            const addModelDiv = document.createElement('div');
            addModelDiv.style.marginTop = '15px';
            addModelDiv.style.display = 'flex';
            addModelDiv.style.alignItems = 'center';
            addModelDiv.style.gap = '10px';
            const selectContainer = document.createElement('div');
            selectContainer.style.position = 'relative';
            selectContainer.style.display = 'inline-block';
            selectContainer.style.width = '200px';
            const modelInput = document.createElement('input');
            modelInput.type = 'text';
            modelInput.id = 'modelSelectInput';
            modelInput.placeholder = '选择模型...';
            modelInput.style.width = '100%';
            modelInput.style.padding = '5px';
            modelInput.style.backgroundColor = 'var(--vscode-input-background)';
            modelInput.style.color = 'var(--vscode-input-foreground)';
            modelInput.style.border = '1px solid var(--vscode-input-border)';
            modelInput.style.borderRadius = '3px';
            modelInput.style.cursor = 'pointer';
            modelInput.style.boxSizing = 'border-box';
            modelInput.readOnly = true;
            const modelDropdown = document.createElement('div');
            modelDropdown.id = 'modelSelectDropdown';
            modelDropdown.style.position = 'absolute';
            modelDropdown.style.top = '100%';
            modelDropdown.style.left = '0';
            modelDropdown.style.width = '100%';
            modelDropdown.style.backgroundColor = 'var(--vscode-dropdown-background, var(--vscode-editor-background))';
            modelDropdown.style.border = '1px solid var(--vscode-dropdown-border, var(--vscode-input-border))';
            modelDropdown.style.borderRadius = '3px';
            modelDropdown.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
            modelDropdown.style.maxHeight = '200px';
            modelDropdown.style.overflowY = 'auto';
            modelDropdown.style.zIndex = '99999';
            modelDropdown.style.display = 'none';
            modelDropdown.style.marginTop = '2px';
            modelDropdown.style.boxSizing = 'border-box';
            const modelSearchInput = document.createElement('input');
            modelSearchInput.type = 'text';
            modelSearchInput.placeholder = '搜索模型...';
            modelSearchInput.style.width = '100%';
            modelSearchInput.style.padding = '5px';
            modelSearchInput.style.border = 'none';
            modelSearchInput.style.borderBottom = '1px solid var(--vscode-dropdown-border)';
            modelSearchInput.style.outline = 'none';
            modelSearchInput.style.backgroundColor = 'var(--vscode-input-background)';
            modelSearchInput.style.color = 'var(--vscode-input-foreground)';
            modelSearchInput.style.boxSizing = 'border-box';
            modelDropdown.appendChild(modelSearchInput);
            const availableModels = currentConfig.Providers[currentProviderIndex].models.filter(model =>
                !currentTransformerConfig.modelSpecific[model]
            );
            availableModels.forEach(function(model) {
                const option = document.createElement('div');
                option.className = 'router-model-option';
                option.style.padding = '8px 12px';
                option.style.cursor = 'pointer';
                option.style.fontSize = '13px';
                option.textContent = model;
                option.setAttribute('data-value', model);
                option.addEventListener('mouseenter', function() {
                    this.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
                });
                option.addEventListener('mouseleave', function() {
                    this.style.backgroundColor = 'transparent';
                });
                modelDropdown.appendChild(option);
            });
            selectContainer.appendChild(modelInput);
            selectContainer.appendChild(modelDropdown);
            modelInput.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.router-model-dropdown').forEach(d => {
                    if (d !== modelDropdown) {
                        d.style.display = 'none';
                    }
                });
                if (modelDropdown.style.display === 'block') {
                    modelDropdown.style.display = 'none';
                } else {
                    modelDropdown.style.display = 'block';
                    modelSearchInput.value = '';
                    modelSearchInput.focus();
                    filterModelOptions('');
                    setTimeout(() => {
                        const transformerModal = document.getElementById('transformerModal');
                        if (transformerModal && transformerModal.classList.contains('active')) {
                            const modalBody = transformerModal.querySelector('.modal-body');
                            if (modalBody) {
                                const dropdownRect = modelDropdown.getBoundingClientRect();
                                const modalBodyRect = modalBody.getBoundingClientRect();
                                if (dropdownRect.bottom > modalBodyRect.bottom) {
                                    const scrollAmount = dropdownRect.bottom - modalBodyRect.bottom + 10;
                                    modalBody.scrollTop += scrollAmount;
                                }
                            }
                        }
                    }, 50);
                }
            });
            modelSearchInput.addEventListener('click', function(e) {
                e.stopPropagation();
            });
            function filterModelOptions(searchTerm) {
                const options = modelDropdown.querySelectorAll('.router-model-option');
                options.forEach(option => {
                    const text = option.textContent.toLowerCase();
                    if (text.includes(searchTerm.toLowerCase())) {
                        option.style.display = 'block';
                    } else {
                        option.style.display = 'none';
                    }
                });
            }
            modelSearchInput.addEventListener('input', function() {
                filterModelOptions(this.value);
            });
            modelDropdown.addEventListener('click', function(e) {
                const option = e.target.closest('.router-model-option');
                if (option) {
                    e.preventDefault();
                    e.stopPropagation();
                    const value = option.getAttribute('data-value');
                    modelInput.value = value;
                    modelInput.setAttribute('data-selected-value', value);
                    modelDropdown.style.display = 'none';
                }
            });
            modelSearchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const visibleOptions = Array.from(modelDropdown.querySelectorAll('.router-model-option')).filter(opt =>
                        opt.style.display !== 'none'
                    );
                    if (visibleOptions.length > 0) {
                        const firstOption = visibleOptions[0];
                        modelInput.value = firstOption.textContent;
                        modelInput.setAttribute('data-selected-value', firstOption.getAttribute('data-value'));
                        modelDropdown.style.display = 'none';
                    }
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const visibleOptions = Array.from(modelDropdown.querySelectorAll('.router-model-option')).filter(opt =>
                        opt.style.display !== 'none'
                    );
                    if (visibleOptions.length > 0) {
                        visibleOptions[0].focus();
                    }
                } else if (e.key === 'Escape') {
                    modelDropdown.style.display = 'none';
                }
            });
            const modelOptions = modelDropdown.querySelectorAll('.router-model-option');
            modelOptions.forEach((option, index) => {
                option.setAttribute('tabindex', '-1');
                option.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        modelInput.value = this.textContent;
                        modelInput.setAttribute('data-selected-value', this.getAttribute('data-value'));
                        modelDropdown.style.display = 'none';
                    } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const allOptions = Array.from(modelDropdown.querySelectorAll('.router-model-option'));
                        const visibleOptions = allOptions.filter(opt => opt.style.display !== 'none');
                        const currentIndex = visibleOptions.indexOf(this);
                        const nextIndex = currentIndex + 1;
                        if (nextIndex < visibleOptions.length) {
                            visibleOptions[nextIndex].focus();
                        }
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const allOptions = Array.from(modelDropdown.querySelectorAll('.router-model-option'));
                        const visibleOptions = allOptions.filter(opt => opt.style.display !== 'none');
                        const currentIndex = visibleOptions.indexOf(this);
                        const prevIndex = currentIndex - 1;
                        if (prevIndex >= 0) {
                            visibleOptions[prevIndex].focus();
                        } else {
                            modelSearchInput.focus();
                        }
                    } else if (e.key === 'Escape') {
                        modelDropdown.style.display = 'none';
                        modelSearchInput.focus();
                    }
                });
            });
            document.addEventListener('click', function handleClickOutside(e) {
                if (!selectContainer.contains(e.target)) {
                    modelDropdown.style.display = 'none';
                }
            });
            const addButton = document.createElement('button');
            addButton.textContent = '添加模型转换器';
            addButton.onclick = function() {
                const selectedValue = modelInput.getAttribute('data-selected-value') || modelInput.value;
                if (selectedValue) {
                    modelInput.style.borderColor = 'var(--vscode-input-border)';
                    const realSelect = document.createElement('select');
                    realSelect.id = 'modelSelect';
                    realSelect.value = selectedValue;
                    addModelSpecificTransformer.call({ value: selectedValue });
                    modelInput.value = '';
                    modelInput.removeAttribute('data-selected-value');
                } else {
                    modelInput.style.borderColor = 'var(--vscode-errorForeground)';
                    setTimeout(() => {
                        modelInput.style.borderColor = 'var(--vscode-input-border)';
                    }, 2000);
                }
            };
            modelInput.addEventListener('change', function() {
                modelInput.style.borderColor = 'var(--vscode-input-border)';
            });
            addModelDiv.appendChild(selectContainer);
            addModelDiv.appendChild(addButton);
            modelContainer.appendChild(addModelDiv);
        }
        function createTransformerItem(item, index, type, modelName) {
            const div = document.createElement('div');
            div.className = 'transformer-item';
            const isTransformerName = typeof item === 'string';
            const hasParams = Array.isArray(item) && item.length === 2;
            const transformerName = isTransformerName ? item : (hasParams ? item[0] : '');
            const params = hasParams ? item[1] : null;
            const uniqueId = 'transformer-' + type + '-' + (modelName || 'global') + '-' + index;
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'transformer-input';
            input.style.width = '100%';
            input.placeholder = '选择或输入转换器...';
            input.value = transformerName;
            const dropdownContainer = document.createElement('div');
            dropdownContainer.style.position = 'absolute';
            dropdownContainer.style.top = '100%';
            dropdownContainer.style.left = '0';
            dropdownContainer.style.width = '100%';
            dropdownContainer.style.backgroundColor = 'var(--vscode-dropdown-background, var(--vscode-editor-background))';
            dropdownContainer.style.border = '1px solid var(--vscode-dropdown-border, var(--vscode-input-border))';
            dropdownContainer.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
            dropdownContainer.style.borderRadius = '3px';
            dropdownContainer.style.maxHeight = '200px';
            dropdownContainer.style.overflowY = 'auto';
            dropdownContainer.style.zIndex = '99999';
            dropdownContainer.style.display = 'none';
            dropdownContainer.style.marginTop = '2px';
            dropdownContainer.style.boxSizing = 'border-box';
            const builtInTransformers = [
                'Anthropic', 'gemini', 'vertex-gemini', 'vertex-claude',
                'deepseek', 'tooluse', 'openrouter', 'OpenAI', 'maxtoken',
                'groq', 'cleancache', 'enhancetool', 'reasoning', 'sampling',
                'maxcompletiontokens', 'cerebras', 'streamoptions', 'customparams',
                'vercel', 'openai-responses', 'forcereasoning'
            ];
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = '搜索转换器...';
            searchInput.style.width = '100%';
            searchInput.style.padding = '5px';
            searchInput.style.border = 'none';
            searchInput.style.borderBottom = '1px solid var(--vscode-dropdown-border)';
            searchInput.style.outline = 'none';
            searchInput.style.backgroundColor = 'var(--vscode-input-background)';
            searchInput.style.color = 'var(--vscode-input-foreground)';
            searchInput.style.boxSizing = 'border-box';
            input.onfocus = null;
            searchInput.addEventListener('focus', function() {
            });
            searchInput.addEventListener('blur', function(e) {
                const relatedTarget = e.relatedTarget;
                if (!relatedTarget || !dropdownContainer.contains(relatedTarget)) {
                    setTimeout(function() {
                        if (!dropdownContainer.contains(document.activeElement) && document.activeElement !== input) {
                            dropdownContainer.style.display = 'none';
                        }
                    }, 100);
                }
            });
            dropdownContainer.appendChild(searchInput);
            builtInTransformers.forEach(transformer => {
                if (transformer === transformerName) {
                    return; // Skip if it's the current value
                }
                const option = document.createElement('div');
                option.style.padding = '8px 12px';
                option.style.cursor = 'pointer';
                option.style.fontSize = '13px';
                option.textContent = transformer;
                option.setAttribute('tabindex', '-1'); // Make focusable but not tabbable
                option.onmouseover = function() {
                    this.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
                };
                option.onmouseout = function() {
                    this.style.backgroundColor = 'transparent';
                };
                option.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        const transformer = this.getAttribute('data-transformer');
                        input.value = transformer;
                        updateTransformer(index, transformer, type, modelName || '');
                        dropdownContainer.style.display = 'none';
                    } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const allOptions = Array.from(dropdownContainer.querySelectorAll('div[data-transformer]'));
                        const currentIndex = allOptions.indexOf(this);
                        const nextIndex = currentIndex + 1;
                        if (nextIndex < allOptions.length) {
                            allOptions[nextIndex].focus();
                        }
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const allOptions = Array.from(dropdownContainer.querySelectorAll('div[data-transformer]'));
                        const currentIndex = allOptions.indexOf(this);
                        const prevIndex = currentIndex - 1;
                        if (prevIndex >= 0) {
                            allOptions[prevIndex].focus();
                        } else {
                            searchInput.focus();
                        }
                    }
                });
                option.setAttribute('data-transformer', transformer);
                dropdownContainer.appendChild(option);
            });
            input.onfocus = function() {
                dropdownContainer.style.display = 'block';
                searchInput.value = '';
                filterOptions('');
                setTimeout(() => {
                    const transformerModal = document.getElementById('transformerModal');
                    if (transformerModal && transformerModal.classList.contains('active')) {
                        const modalBody = transformerModal.querySelector('.modal-body');
                        if (modalBody) {
                            const dropdownRect = dropdownContainer.getBoundingClientRect();
                            const modalBodyRect = modalBody.getBoundingClientRect();
                            if (dropdownRect.bottom > modalBodyRect.bottom) {
                                const scrollAmount = dropdownRect.bottom - modalBodyRect.bottom + 10;
                                modalBody.scrollTop += scrollAmount;
                            }
                        }
                    }
                }, 50);
            };
            input.addEventListener('click', function() {
                if (dropdownContainer.style.display === 'none') {
                    dropdownContainer.style.display = 'block';
                    searchInput.value = '';
                    filterOptions('');
                    setTimeout(() => {
                        const transformerModal = document.getElementById('transformerModal');
                        if (transformerModal && transformerModal.classList.contains('active')) {
                            const modalBody = transformerModal.querySelector('.modal-body');
                            if (modalBody) {
                                const dropdownRect = dropdownContainer.getBoundingClientRect();
                                const modalBodyRect = modalBody.getBoundingClientRect();
                                if (dropdownRect.bottom > modalBodyRect.bottom) {
                                    const scrollAmount = dropdownRect.bottom - modalBodyRect.bottom + 10;
                                    modalBody.scrollTop += scrollAmount;
                                }
                            }
                        }
                    }, 50);
                }
            });
            input.onblur = function(e) {
                const relatedTarget = e.relatedTarget;
                if (relatedTarget && dropdownContainer.contains(relatedTarget)) {
                    return;
                }
                setTimeout(function() {
                    if (document.activeElement !== input && !dropdownContainer.contains(document.activeElement)) {
                        dropdownContainer.style.display = 'none';
                    }
                }, 200);
            };
            dropdownContainer.addEventListener('mousedown', function(e) {
                if (e.target === searchInput) {
                    return;
                }
                e.preventDefault();
            });
            dropdownContainer.addEventListener('click', function(e) {
                const option = e.target.closest('div[data-transformer]');
                if (option) {
                    const selectedTransformer = option.getAttribute('data-transformer');
                    input.value = selectedTransformer;
                    updateTransformer(index, selectedTransformer, type, modelName || '');
                    dropdownContainer.style.display = 'none';
                }
            });
            function filterOptions(searchTerm) {
                const options = dropdownContainer.querySelectorAll('div');
                options.forEach(function(opt, idx) {
                    if (opt === searchInput) return;
                    if (opt.textContent.toLowerCase().includes(searchTerm.toLowerCase())) {
                        opt.style.display = 'block';
                    } else {
                        opt.style.display = 'none';
                    }
                });
            }
            searchInput.oninput = function() {
                filterOptions(this.value);
            };
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const visibleOptions = Array.from(dropdownContainer.querySelectorAll('div')).filter(opt =>
                        opt !== searchInput && opt.style.display !== 'none'
                    );
                    if (visibleOptions.length > 0) {
                        const firstOption = visibleOptions[0];
                        const transformer = firstOption.getAttribute('data-transformer');
                        input.value = transformer;
                        updateTransformer(index, transformer, type, modelName || '');
                        dropdownContainer.style.display = 'none';
                    }
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const visibleOptions = Array.from(dropdownContainer.querySelectorAll('div')).filter(opt =>
                        opt !== searchInput && opt.style.display !== 'none'
                    );
                    if (visibleOptions.length > 0) {
                        visibleOptions[0].focus();
                    }
                }
            });
            input.oninput = function(e) {
                const matchingTransformer = builtInTransformers.find(t => t.toLowerCase() === this.value.toLowerCase());
                if (matchingTransformer) {
                    this.value = matchingTransformer;
                }
                if (isTransformerName) {
                    updateTransformer(index, this.value, type, modelName || '');
                } else if (hasParams) {
                    updateTransformer(index, [this.value, params], type, modelName || '');
                }
            };
            input.onchange = function() {
                if (isTransformerName) {
                    updateTransformer(index, this.value, type, modelName || '');
                } else if (hasParams) {
                    updateTransformer(index, [this.value, params], type, modelName || '');
                }
            };
            const paramInput = document.createElement('input');
            paramInput.type = 'text';
            paramInput.className = 'transformer-params';
            paramInput.placeholder = '参数 (JSON格式, 如: {"key": "value"})';
            if (hasParams) {
                paramInput.value = JSON.stringify(params);
                paramInput.onchange = function() {
                    if (this.value.trim()) {
                        try {
                            const newParams = JSON.parse(this.value);
                            updateTransformer(index, [input.value, newParams], type, modelName || '');
                        } catch (e) {
                            alert('参数格式错误，请使用有效的JSON格式，例如: {"key": "value"}');
                        }
                    } else {
                        updateTransformer(index, input.value, type, modelName || '');
                    }
                };
            } else if (isTransformerName) {
                paramInput.value = '';
                paramInput.onchange = function() {
                    if (this.value.trim()) {
                        try {
                            const newParams = JSON.parse(this.value);
                            updateTransformer(index, [input.value, newParams], type, modelName || '');
                            renderTransformerModal();
                        } catch (e) {
                            alert('参数格式错误，请使用有效的JSON格式，例如: {"key": "value"}');
                        }
                    }
                };
            } else {
                paramInput.disabled = true;
            }
            const button = document.createElement('button');
            button.className = 'btn-icon delete';
            button.textContent = '✕';
            button.onclick = function() {
                removeTransformer(index, type, modelName || '');
            };
            const label = document.createElement('label');
            label.style.width = '60px';
            label.style.fontSize = '0.9em';
            label.style.color = 'var(--vscode-descriptionForeground)';
            label.textContent = '转换器:';
            const inputContainer = document.createElement('div');
            inputContainer.style.position = 'relative';
            inputContainer.style.width = '200px';
            inputContainer.appendChild(input);
            inputContainer.appendChild(dropdownContainer);
            div.appendChild(label);
            div.appendChild(inputContainer);
            div.appendChild(paramInput);
            div.appendChild(button);
            return div;
        }
        function getNextItem(index, type, modelName) {
            const list = type === 'global' ?
                currentTransformerConfig.use :
                currentTransformerConfig.modelSpecific[modelName].use;
            return list[index + 1];
        }
        function addGlobalTransformer() {
            currentTransformerConfig.use.push('');
            renderTransformerModal();
        }
        function addModelTransformer(modelName) {
            currentTransformerConfig.modelSpecific[modelName].use.push('');
            renderTransformerModal();
        }
        function addModelSpecificTransformer() {
            const modelInput = document.getElementById('modelSelectInput');
            let modelName = '';
            if (modelInput) {
                modelName = modelInput.getAttribute('data-selected-value') || modelInput.value;
            } else {
                const select = document.getElementById('modelSelect');
                if (select) {
                    modelName = select.value;
                }
            }
            if (!modelName || currentTransformerConfig.modelSpecific[modelName]) {
                return;
            }
            currentTransformerConfig.modelSpecific[modelName] = { use: [''] };
            renderTransformerModal();
            setTimeout(() => {
                const transformerModal = document.getElementById('transformerModal');
                if (transformerModal && transformerModal.classList.contains('active')) {
                    const modalBody = transformerModal.querySelector('.modal-body');
                    if (modalBody) {
                        modalBody.scrollTop = modalBody.scrollHeight;
                    }
                }
            }, 50);
        }
        function updateTransformer(index, value, type, modelName) {
            if (type === 'global') {
                currentTransformerConfig.use[index] = value;
            } else {
                currentTransformerConfig.modelSpecific[modelName].use[index] = value;
            }
        }
        function removeTransformer(index, type, modelName) {
            if (type === 'global') {
                currentTransformerConfig.use.splice(index, 1);
            } else {
                const modelConfig = currentTransformerConfig.modelSpecific[modelName];
                modelConfig.use.splice(index, 1);
                if (modelConfig.use.length === 0) {
                    delete currentTransformerConfig.modelSpecific[modelName];
                }
            }
            renderTransformerModal();
        }
        function saveTransformerConfig() {
            const provider = currentConfig.Providers[currentProviderIndex];
            const transformer = { };
            const filteredGlobalUse = filterEmptyTransformers(currentTransformerConfig.use);
            if (filteredGlobalUse.length > 0) {
                transformer.use = filteredGlobalUse;
            }
            Object.keys(currentTransformerConfig.modelSpecific).forEach(modelName => {
                const filteredModelUse = filterEmptyTransformers(currentTransformerConfig.modelSpecific[modelName].use);
                if (filteredModelUse.length > 0) {
                    transformer[modelName] = {
                        use: filteredModelUse
                    };
                }
            });
            if (Object.keys(transformer).length > 0) {
                provider.transformer = transformer;
            } else {
                delete provider.transformer;
            }
            updateProvider(currentProviderIndex);
            hideTransformerModal();
        }
        function filterEmptyTransformers(transformerUse) {
            const filtered = [];
            for (let i = 0; i < transformerUse.length; i++) {
                const item = transformerUse[i];
                if (typeof item === 'string') {
                    if (item.trim() !== '') {
                        filtered.push(item);
                    }
                } else if (Array.isArray(item) && item.length === 2) {
                    const [transformerName, params] = item;
                    if (transformerName && transformerName.trim() !== '') {
                        filtered.push(item);
                    }
                }
            }
            return filtered;
        }
        function hideTransformerModal() {
            document.getElementById('transformerModal').classList.remove('active');
            currentProviderIndex = -1;
        }
        sendMessage('getConfig');
    <\/script>
</body>
</html>`;
    }
}
