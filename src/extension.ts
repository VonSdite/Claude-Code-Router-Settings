import * as vscode from 'vscode';
import { App } from './app';
import { Router } from './configManager';
import { SettingsPanel } from './settingsPanel';
import * as fs from 'fs';

export async function activate(context: vscode.ExtensionContext) {
    const app = await App.initialize(context.extensionUri, context);
    const configManager = app.configManager;

    const quickSwitchCommand = vscode.commands.registerCommand('ccr.quickSwitch', async () => {
        await configManager.loadConfig();
        const config = configManager.getConfig();
        if (!config) {
            vscode.window.showWarningMessage('Config 对象为空??');
            return;
        }
        // 一次修改四个主要路由：默认、后台任务、思考、长上下文
        const multiRouterTypes: (keyof Router)[] = ['default', 'background', 'think', 'longContext'];

        // 直接选择模型，然后将该模型应用到所有四个路由
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

        const selectedModel = await vscode.window.showQuickPick(
            modelOptions,
            {
                placeHolder: '选择要应用到"默认、后台任务、思考、长上下文"四个路由的模型',
                matchOnDescription: true
            }
        );

        if (!selectedModel) {
            return;
        }

        const selectedModelValue = selectedModel.detail || '';
        // 将选择的模型应用到所有四个路由
        for (const routerType of multiRouterTypes) {
            configManager.setRouterModel(routerType, selectedModelValue);
        }
        const modelName = selectedModelValue ? selectedModelValue.replace(/,/g, ': ') : '空';
        await configManager.saveConfig();
        SettingsPanel.notifyConfigChanged();
        vscode.window.showInformationMessage(`正在重启 ccr... 已更新模型路由: ${modelName}`);
        const result = await configManager.restartCcr();
        if (result.success) {
            vscode.window.showInformationMessage(result.message);
        } else {
            vscode.window.showErrorMessage(result.message);
        }
    });
    const openSettingsCommand = vscode.commands.registerCommand('ccr.openSettingsPanel', async () => {
        app.openSettingsPanel();
    });
    const openCCSettingsCommand = vscode.commands.registerCommand('ccr.openCCSettingsFile', async () => {
        try {
            const settingsPath = configManager.getCCSettingsPath();
            if (!fs.existsSync(settingsPath)) {
                vscode.window.showErrorMessage(`CC settings文件不存在: ${settingsPath}`);
                return;
            }
            const document = await vscode.workspace.openTextDocument(settingsPath);
            await vscode.window.showTextDocument(document);
        } catch (error: any) {
            vscode.window.showErrorMessage(`打开CC settings文件失败: ${error.message}`);
        }
    });
    const openCCRConfigCommand = vscode.commands.registerCommand('ccr.openCCRConfigFile', async () => {
        try {
            const configPath = configManager.getCCRConfigPath();
            if (!fs.existsSync(configPath)) {
                vscode.window.showErrorMessage(`CCR配置文件不存在: ${configPath}`);
                return;
            }
            const document = await vscode.workspace.openTextDocument(configPath);
            await vscode.window.showTextDocument(document);
        } catch (error: any) {
            vscode.window.showErrorMessage(`打开CCR配置文件失败: ${error.message}`);
        }
    });
    const restartCCRCommand = vscode.commands.registerCommand('ccr.restartCCR', async () => {
        try {
            const result = await configManager.restartCcr();
            if (result.success) {
                vscode.window.showInformationMessage(result.message);
            } else {
                vscode.window.showErrorMessage(result.message);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`重启CCR失败: ${error.message}`);
        }
    });
    async function quickSwitchModel(routerType: keyof Router) {
        await configManager.loadConfig();
        const config = configManager.getConfig();
        const routerInfo = configManager.getRouterInfo();
        if (!config) {
            vscode.window.showWarningMessage('Config 对象为空??');
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
                    description: isCurrent ? `${provider.name} (当前使用)` : provider.name,
                    detail: modelValue,
                    // 依然可以保留 picked，但在单选里它没啥视觉作用
                    picked: isCurrent
                };

                if (isCurrent) {
                    modelOptions.unshift(option); // 置顶
                } else {
                    modelOptions.push(option); // 按顺序添加
                }
            });
        });
        const selectedModel = await vscode.window.showQuickPick(
            modelOptions,
            {
                placeHolder: `选择${configManager.getRouterDisplayName(routerType)}使用的模型`,
                matchOnDescription: true
            }
        );
        if (!selectedModel) {
            return;
        }
        const modelValue = selectedModel.detail || '';
        configManager.setRouterModel(routerType, modelValue);
        await configManager.saveConfig();
        SettingsPanel.notifyConfigChanged();
        const routeName = configManager.getRouterDisplayName(routerType);
        const modelName = modelValue ? modelValue.replace(/,/g, ': ') : '空';
        vscode.window.showInformationMessage(`正在重启 ccr... ${routeName} 模型路由已更新为: ${modelName}`);
        const result = await configManager.restartCcr();
        if (result.success) {
            vscode.window.showInformationMessage(result.message);
        } else {
            vscode.window.showErrorMessage(result.message);
        }
    }
    const quickSwitchDefaultCommand = vscode.commands.registerCommand('ccr.quickSwitchDefault', async () => {
        await quickSwitchModel('default');
    });
    const quickSwitchThinkCommand = vscode.commands.registerCommand('ccr.quickSwitchThink', async () => {
        await quickSwitchModel('think');
    });
    const quickSwitchLongContextCommand = vscode.commands.registerCommand('ccr.quickSwitchLongContext', async () => {
        await quickSwitchModel('longContext');
    });
    const quickSwitchBackgroundCommand = vscode.commands.registerCommand('ccr.quickSwitchBackground', async () => {
        await quickSwitchModel('background');
    });
    const quickSwitchWebSearchCommand = vscode.commands.registerCommand('ccr.quickSwitchWebSearch', async () => {
        await quickSwitchModel('webSearch');
    });
    const quickSwitchImageCommand = vscode.commands.registerCommand('ccr.quickSwitchImage', async () => {
        await quickSwitchModel('image');
    });
    const configWatcher = vscode.workspace.createFileSystemWatcher(
        configManager.getCCRConfigPath()
    );
    configWatcher.onDidChange(() => {
        if (SettingsPanel.currentPanel) {
            // 如果配置面板打开，触发重新加载
            SettingsPanel.currentPanel.refreshConfig();
        }
    });
    context.subscriptions.push(
        openSettingsCommand,
        openCCRConfigCommand,
        openCCSettingsCommand,
        restartCCRCommand,
        quickSwitchCommand,
        quickSwitchDefaultCommand,
        quickSwitchThinkCommand,
        quickSwitchLongContextCommand,
        quickSwitchBackgroundCommand,
        quickSwitchWebSearchCommand,
        quickSwitchImageCommand,
        configWatcher,
        {
            dispose: () => app.dispose()
        }
    );
}

export function deactivate() {
    // App 的 dispose 会通过 context.subscriptions 中的 disposable 被调用
}
