import * as vscode from 'vscode';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

/**
 * 统一的日志工具类，封装VSCode OutputChannel
 */
export class Logger {
    private outputChannel: vscode.OutputChannel;
    private logLevel: LogLevel;

    constructor(name: string, logLevel: LogLevel = 'info') {
        this.outputChannel = vscode.window.createOutputChannel(name);
        this.logLevel = logLevel;
    }

    private shouldLog(level: LogLevel): boolean {
        return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.logLevel];
    }

    private formatMessage(level: LogLevel, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${level.toUpperCase()}] ${timestamp} - ${message}`;
    }

    debug(message: string): void {
        if (this.shouldLog('debug')) {
            this.outputChannel.appendLine(this.formatMessage('debug', message));
        }
    }

    info(message: string): void {
        if (this.shouldLog('info')) {
            this.outputChannel.appendLine(this.formatMessage('info', message));
        }
    }

    warn(message: string): void {
        if (this.shouldLog('warn')) {
            this.outputChannel.appendLine(this.formatMessage('warn', message));
        }
    }

    error(message: string, error?: any): void {
        if (this.shouldLog('error')) {
            this.outputChannel.appendLine(this.formatMessage('error', message));
            if (error) {
                const errorDetails = error.stack || error.message || JSON.stringify(error);
                this.outputChannel.appendLine(`  ${errorDetails}`);
            }
        }
    }

    show(preserveFocus?: boolean): void {
        this.outputChannel.show(preserveFocus);
    }

    hide(): void {
        this.outputChannel.hide();
    }

    clear(): void {
        this.outputChannel.clear();
    }

    getOutputChannel(): vscode.OutputChannel {
        return this.outputChannel;
    }

    setLogLevel(level: LogLevel): void {
        this.logLevel = level;
    }

    getLogLevel(): LogLevel {
        return this.logLevel;
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
