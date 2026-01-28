import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from './logger';
const execAsync = promisify(exec);
export interface Model {
    name: string;
}
export interface Transformer {
    use: Array<string | [string, { [key: string]: any }]>;
    [key: string]: any;
}
export interface TransformerConfig {
    path: string;
    options: { [key: string]: any };
}
export interface Provider {
    name: string;
    api_base_url: string;
    api_key: string;
    fetch_model_api?: string;
    models: string[];
    transformer?: Transformer;
}
export interface Router {
    default: string;
    background: string;
    think: string;
    longContext: string;
    longContextThreshold: number;
    webSearch: string;
    image: string;
}
export interface Config {
    LOG: boolean;
    LOG_LEVEL: string;
    CLAUDE_PATH: string;
    HOST: string;
    PORT: number;
    APIKEY: string;
    API_TIMEOUT_MS: string;
    PROXY_URL: string;
    transformers: TransformerConfig[];
    Providers: Provider[];
    StatusLine: any;
    Router: Router;
    CUSTOM_ROUTER_PATH: string;
}
export class ConfigManager {
    private config: Config | null = null;
    private ccrConfigPath: string | null = null;
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
        this.logger.info('ConfigManager 初始化');
    }
    async loadConfig(): Promise<Config | null> {
        this.ccrConfigPath = this.getCCRConfigPath();
        if (!this.ccrConfigPath) {
            vscode.window.showErrorMessage('Unable to determine config path');
            return null;
        }
        try {
            const content = fs.readFileSync(this.ccrConfigPath, 'utf8');
            this.config = JSON.parse(content);
            return this.config;
        } catch (error) {
            if (fs.existsSync(this.ccrConfigPath)) {
                vscode.window.showErrorMessage(`Failed to load config file: ${error}`);
                return null;
            } else {
                this.config = this.getDefaultConfig();
                await this.saveConfig();
                return this.config;
            }
        }
    }
    public getLogger(): Logger {
        return this.logger;
    }
    async saveConfig(): Promise<boolean> {
        if (!this.config || !this.ccrConfigPath) {
            return false;
        }
        try {
            const dir = path.dirname(this.ccrConfigPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const content = JSON.stringify(this.config, null, 4);
            fs.writeFileSync(this.ccrConfigPath, content, 'utf8');
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save config file: ${error}`);
            return false;
        }
    }
    getConfig(): Config | null {
        return this.config;
    }
    updateConfig(config: Partial<Config>): void {
        if (this.config) {
            this.config = { ...this.config, ...config };
        }
    }
    addProvider(provider: Provider): { success: boolean; message: string } {
        if (!this.config) {
            return { success: false, message: 'No config loaded' };
        }
        const existingIndex = this.config.Providers.findIndex(p => p.name === provider.name);
        if (existingIndex >= 0) {
            return { success: false, message: `Provider "${provider.name}" already exists` };
        } else {
            this.config.Providers.push(provider);
            return { success: true, message: `Provider "${provider.name}" added successfully` };
        }
    }
    updateProvider(index: number, provider: Provider): void {
        if (this.config && this.config.Providers[index]) {
            this.config.Providers[index] = provider;
        }
    }
    removeProvider(providerName: string): void {
        if (this.config) {
            this.config.Providers = this.config.Providers.filter(p => p.name !== providerName);
        }
    }
    getProviderOptions(): string[] {
        if (!this.config) {
            return [];
        }
        return this.config.Providers.flatMap(provider =>
            provider.models.map(model => `${provider.name},${model}`)
        );
    }
    updateRouter(routerKey: keyof Router, value: string): void {
        if (this.config && routerKey in this.config.Router) {
            (this.config.Router as any)[routerKey] = value;
        }
    }
    getRouterInfo(): Router {
        if (!this.config) {
            return {
                default: '',
                background: '',
                think: '',
                longContext: '',
                longContextThreshold: 60000,
                webSearch: '',
                image: ''
            };
        }
        return this.config.Router;
    }
    getRouterDisplayName(routerKey: keyof Router): string {
        const names: { [key in keyof Router]: string } = {
            default: '默认',
            background: '后台任务',
            think: '思考',
            longContext: '长上下文',
            longContextThreshold: '长上下文阈值',
            webSearch: '网络搜索',
            image: '图像'
        };
        return names[routerKey] || routerKey;
    }
    setRouterModel(routerKey: keyof Router, model: string): void {
        if (this.config && routerKey in this.config.Router) {
            (this.config.Router as any)[routerKey] = model;
        }
    }
    addTransformer(transformer: TransformerConfig): void {
        if (this.config) {
            this.config.transformers.push(transformer);
        }
    }
    updateTransformer(index: number, transformer: TransformerConfig): void {
        if (this.config && this.config.transformers[index] !== undefined) {
            this.config.transformers[index] = transformer;
        }
    }
    removeTransformer(index: number): void {
        if (this.config) {
            this.config.transformers.splice(index, 1);
        }
    }
    getCCRConfigPath(): string {
        const configSetting = vscode.workspace.getConfiguration('ccr').get<string>('ccrConfigPath');
        if (configSetting && configSetting.trim()) {
            return configSetting.trim();
        }
        return this.getCCRDefaultConfigPath();
    }
    getCCRDefaultConfigPath(): string {
        if (process.platform === "win32") {
            const userProfile = process.env.USERPROFILE || "";
            return path.join(userProfile, '.claude-code-router', 'config.json');
        }
        return "/root/.claude-code-router/config.json";
    }
    getCCSettingsPath(): string {
        const config = vscode.workspace.getConfiguration('ccr');
        const customPath = config.get<string>('ccSettingsPath', '');
        if (customPath && customPath.trim()) {
            return customPath.trim();
        }
        return this.getCCDefaultSettingsPath();
    }
    getCCDefaultSettingsPath(): string {
        if (process.platform === "win32") {
            const userProfile = process.env.USERPROFILE || "";
            return path.join(userProfile, '.claude', 'settings.json');
        }
        return "/root/.claude/settings.json";
    }
    async fetchModelsFromApi(apiBaseUrl: string, apiKey?: string, fetchModelApi?: string): Promise<string[]> {
        if (!apiBaseUrl) {
            throw new Error('API基础地址不能为空');
        }
        this.logger.info('=== 开始获取模型 ===');
        let url: URL;
        try {
            if (fetchModelApi && fetchModelApi.trim()) {
                // 使用用户指定的API接口路径，需要拼接上根域名
                const customPath = fetchModelApi.trim().replace(/^\/+|\/+$/g, ''); // 移除首尾的斜杠
                if (apiBaseUrl.startsWith('http')) {
                    const base = new URL(apiBaseUrl);
                    url = new URL(`/${customPath}`, base.origin);
                } else {
                    const cleanBase = apiBaseUrl.replace(/\/+$/, '');
                    url = new URL(`${cleanBase.startsWith('http') ? '' : 'https://'}${cleanBase}/${customPath}`);
                }
            } else {
                // 默认使用 /v1/models
                if (apiBaseUrl.startsWith('http')) {
                    const base = new URL(apiBaseUrl);
                    url = new URL('/v1/models', base.origin);
                } else {
                    const cleanBase = apiBaseUrl.replace(/\/+$/, '').replace(/\/v1\/.*$/, '');
                    url = new URL(`${cleanBase.startsWith('http') ? '' : 'https://'}${cleanBase}/v1/models`);
                }
            }
            this.logger.info(`使用接口: ${url.toString()}`);
        } catch (e) {
            throw new Error(`无效的API接口地址: ${e}`);
        }
        return new Promise((resolve, reject) => {
            const client = url.protocol === 'https:' ? https : http;
            const headers: any = {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname + url.search,
                method: 'GET',
                headers: headers
            };
            const req = client.request(options, (res) => {
                let data = '';
                this.logger.info(`请求响应状态: ${res.statusCode} ${res.statusMessage}`);
                for (const [key, value] of Object.entries(res.headers)) {
                    this.logger.info(`  ${key}: ${value}`);
                }
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        if (res.statusCode === 200) {
                            const response = JSON.parse(data);
                            if (response.data && Array.isArray(response.data)) {
                                const models = response.data.map((model: any) => model.id).filter((id: string) => id);
                                this.logger.info(`✓ 成功获取 ${models.length} 个模型`);
                                models.forEach((model: string, index: number) => {
                                    this.logger.info(`  ${index + 1}. ${model}`);
                                });
                                resolve(models);
                            } else {
                                this.logger.info('✗ API返回的模型格式不正确');
                                this.logger.info('响应内容:');
                                this.logger.info(data);
                                this.logger.show(true);
                                reject(new Error('API返回的模型格式不正确'));
                            }
                        } else {
                            this.logger.info('✗ 请求失败');
                            this.logger.info('错误响应:');
                            this.logger.info(data);
                            this.logger.show(true);
                            reject(new Error(`API请求失败: ${res.statusCode} ${res.statusMessage}`));
                        }
                    } catch (error) {
                        this.logger.info('✗ 解析响应失败');
                        this.logger.info(`错误信息: ${error}`);
                        this.logger.info('原始响应:');
                        this.logger.info(data);
                        this.logger.show(true);
                        reject(new Error('解析API响应失败: ' + error));
                    }
                });
            });
            req.on('error', (error) => {
                this.logger.info('✗ 请求出错');
                this.logger.info(`错误信息: ${error.message}`);
                this.logger.show(true);
                reject(new Error('请求API失败: ' + error.message));
            });
            req.setTimeout(5000, () => {
                req.destroy();
                this.logger.info('✗ 请求超时');
                this.logger.info('请求超过10秒未响应');
                this.logger.show(true);
                reject(new Error('请求超时'));
            });
            req.end();
        });
    }
    async restartCcr(): Promise<{ success: boolean; message: string }> {
        try {
            const { stdout, stderr } = await execAsync('ccr restart', {
                cwd: process.cwd(),
                timeout: 30000,
                windowsHide: true
            });
            if (stdout) {
                this.logger.info('ccr restart stdout: ' + stdout);
            }
            if (stderr) {
                this.logger.info('ccr restart stderr: ' + stderr);
            }
            return { success: true, message: 'ccr restart 命令执行完成' };
        } catch (error: any) {
            this.logger.info('ccr restart error: ' + error);
            let errorMessage = '执行 ccr restart 失败';
            if (error.code === 'ENOTFOUND') {
                errorMessage = 'ccr 命令未找到，请确保 claude-code-router 已正确安装';
            } else if (error.code === 'ETIMEDOUT') {
                errorMessage = 'ccr restart 命令执行超时';
            } else if (error.message) {
                errorMessage = `ccr restart 失败: ${error.message}`;
            }
            return { success: false, message: errorMessage };
        }
    }
    private getDefaultConfig(): Config {
        return {
            LOG: true,
            LOG_LEVEL: "warn",
            CLAUDE_PATH: "",
            HOST: "127.0.0.1",
            PORT: 3456,
            APIKEY: "",
            API_TIMEOUT_MS: "600000",
            PROXY_URL: "",
            transformers: [],
            Providers: [],
            StatusLine: {
                enabled: false,
                currentStyle: "default",
                default: { modules: [] },
                powerline: { modules: [] }
            },
            Router: {
                default: "",
                background: "",
                think: "",
                longContext: "",
                longContextThreshold: 60000,
                webSearch: "",
                image: ""
            },
            CUSTOM_ROUTER_PATH: ""
        };
    }
}
