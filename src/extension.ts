import * as vscode from 'vscode';
import { App } from './app';

export async function activate(context: vscode.ExtensionContext) {
    const app = await App.initialize(context.extensionUri, context);

    context.subscriptions.push({
        dispose: () => app.dispose()
    });
}

export function deactivate() {
}
