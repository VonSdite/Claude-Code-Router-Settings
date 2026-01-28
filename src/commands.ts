import * as vscode from 'vscode';
import * as fs from 'fs';
import { App } from './app';
import { Router } from './configManager';

export function registerCommands(app: App): vscode.Disposable[] {
    const configManager = app.configManager;
    const disposables: vscode.Disposable[] = [];

    disposables.push(
        vscode.commands.registerCommand('ccr.quickSwitch', async () => handleQuickSwitch(app)),
        vscode.commands.registerCommand('ccr.openSettingsPanel', () => app.openSettingsPanel()),
        vscode.commands.registerCommand('ccr.openCCSettingsFile', () => handleOpenCCSettingsFile(configManager)),
        vscode.commands.registerCommand('ccr.openCCRConfigFile', () => handleOpenCCRConfigFile(configManager)),
        vscode.commands.registerCommand('ccr.restartCCR', () => handleRestartCCR(configManager))
    );

    // 批量注册路由切换命令
    const routerTypes: (keyof Router)[] = ['default', 'think', 'longContext', 'background', 'webSearch', 'image'];
    routerTypes.forEach(routerType => {
        disposables.push(
            vscode.commands.registerCommand(`ccr.quickSwitch${capitalize(routerType)}`, () => handleQuickSwitchModel(app, routerType))
        );
    });

    return disposables;
}

async function handleQuickSwitch(app: App): Promise<void> {
    const configManager = app.configManager;
    app.logger.info('Executing quick switch command');
    await configManager.loadConfig();
    const config = configManager.getConfig();
    if (!config) {
        app.logger.warn('Config object is null after load');
        return;
    }

    const multiRouterTypes: (keyof Router)[] = ['default', 'background', 'think', 'longContext'];
    const modelOptions: vscode.QuickPickItem[] = [
        {
            label: '$(circle-slash) 不选择模型',
            description: '清空默认、后台任务、思考、长上下文路由配置',
            picked: false
        }
    ];

    config.Providers.forEach(provider => {
        provider.models.forEach(model => {
            const modelValue = `${provider.name},${model}`;
            modelOptions.push({
                label: model,
                description: provider.name,
                detail: modelValue,
                picked: false
            });
        });
    });

    const selectedModel = await vscode.window.showQuickPick(modelOptions, {
        placeHolder: '选择要应用到"默认、后台任务、思考、长上下文"四个路由的模型',
        matchOnDescription: true
    });

    if (!selectedModel) return;

    const selectedModelValue = selectedModel.detail || '';
    for (const routerType of multiRouterTypes) {
        configManager.updateRouter(routerType, selectedModelValue);
    }

    const modelName = selectedModelValue ? selectedModelValue.replace(/,/g, ': ') : '空';
    app.logger.info(`Updating router models to: ${modelName}`);
    await configManager.saveConfig();
    app.notifyConfigChanged();
    vscode.window.showInformationMessage(`Restarting CCR... Model routing updated: ${modelName}`);

    const result = await configManager.restartCcr();
    if (result.success) {
        vscode.window.showInformationMessage(result.message);
    } else {
        vscode.window.showErrorMessage(result.message);
    }
}

async function handleOpenCCSettingsFile(configManager: App['configManager']): Promise<void> {
    try {
        configManager.getLogger().info('Opening CC settings file');
        const settingsPath = configManager.getCCSettingsPath();
        if (!fs.existsSync(settingsPath)) {
            vscode.window.showErrorMessage(`CC settings file not found: ${settingsPath}`);
            return;
        }
        const document = await vscode.workspace.openTextDocument(settingsPath);
        await vscode.window.showTextDocument(document);
    } catch (error: any) {
        configManager.getLogger().error(`Failed to open CC settings file: ${error.message}`);
    }
}

async function handleOpenCCRConfigFile(configManager: App['configManager']): Promise<void> {
    try {
        configManager.getLogger().info('Opening CCR config file');
        const configPath = configManager.getCCRConfigPath();
        if (!fs.existsSync(configPath)) {
            vscode.window.showErrorMessage(`CCR config file not found: ${configPath}`);
            return;
        }
        const document = await vscode.workspace.openTextDocument(configPath);
        await vscode.window.showTextDocument(document);
    } catch (error: any) {
        configManager.getLogger().error(`Failed to open CCR config file: ${error.message}`);
    }
}

async function handleRestartCCR(configManager: App['configManager']): Promise<void> {
    try {
        configManager.getLogger().info('Executing ccr restart command');
        const result = await configManager.restartCcr();
        if (result.success) {
            vscode.window.showInformationMessage(result.message);
        } else {
            vscode.window.showErrorMessage(result.message);
        }
    } catch (error: any) {
        configManager.getLogger().error(`Failed to restart CCR: ${error.message}`);
    }
}

async function handleQuickSwitchModel(app: App, routerType: keyof Router): Promise<void> {
    const configManager = app.configManager;
    app.logger.info(`Executing quick switch for router: ${routerType}`);
    await configManager.loadConfig();
    const config = configManager.getConfig();
    const routerInfo = configManager.getRouterInfo();
    if (!config) {
        app.logger.warn('Config object is null after load');
        return;
    }

    const modelOptions: vscode.QuickPickItem[] = [
        {
            label: '$(circle-slash) 不选择模型',
            description: '清空该路由配置',
            picked: false
        }
    ];

    config.Providers.forEach(provider => {
        provider.models.forEach(model => {
            const modelValue = `${provider.name},${model}`;
            const isCurrent = routerInfo[routerType] === modelValue;

            const option = {
                label: model,
                description: isCurrent ? `${provider.name} (Current)` : provider.name,
                detail: modelValue,
                picked: isCurrent
            };

            if (isCurrent) {
                modelOptions.unshift(option);
            } else {
                modelOptions.push(option);
            }
        });
    });

    const selectedModel = await vscode.window.showQuickPick(modelOptions, {
        placeHolder: `选择'${configManager.getRouterDisplayName(routerType)}'使用的模型`,
        matchOnDescription: true
    });

    if (!selectedModel) return;

    const modelValue = selectedModel.detail || '';
    app.logger.info(`Updating router ${routerType} to model: ${modelValue}`);
    configManager.updateRouter(routerType, modelValue);
    await configManager.saveConfig();
    app.notifyConfigChanged();

    const routeName = configManager.getRouterDisplayName(routerType);
    const modelName = modelValue ? modelValue.replace(/,/g, ': ') : '空';
    vscode.window.showInformationMessage(`Restarting CCR... '${routeName}' Model routing updated: ${modelName}`);

    const result = await configManager.restartCcr();
    if (result.success) {
        vscode.window.showInformationMessage(result.message);
    } else {
        vscode.window.showErrorMessage(result.message);
    }
}

function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
