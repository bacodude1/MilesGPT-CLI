#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
process.on('uncaughtException', (err) => console.error('Uncaught:', err));
const readline_1 = require("readline");
const figlet_1 = __importDefault(require("figlet"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const TIMEOUT = 120000;
async function timeoutFetch(url, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
    try {
        return await (0, node_fetch_1.default)(url, { ...options, signal: controller.signal });
    }
    finally {
        clearTimeout(timeoutId);
    }
}
const chalk_1 = __importDefault(require("chalk"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
function executeBashCommand(command) {
    return new Promise((resolve) => {
        (0, child_process_1.exec)(command, (error, stdout, stderr) => {
            let output = "";
            if (stdout)
                output += stdout;
            if (stderr)
                output += stderr;
            resolve(output.trim());
        });
    });
}
async function executeBashCommandWithRetry(command) {
    let execResult;
    const tryExec = (cmd, password) => {
        return new Promise((resolve) => {
            if (password) {
                const sudoProc = require('child_process').spawn('sudo', ['-S']);
                let stdout = '';
                let stderr = '';
                sudoProc.stdout.on('data', (data) => { stdout += data.toString(); });
                sudoProc.stderr.on('data', (data) => { stderr += data.toString(); });
                sudoProc.stdin.write(password + '\n');
                sudoProc.stdin.end(cmd + '\n');
                sudoProc.on('close', () => {
                    resolve({ stdout, stderr, exitCode: 0 });
                });
            }
            else {
                (0, child_process_1.exec)(cmd, (error, stdOut, stdErr) => {
                    resolve({
                        stdout: stdOut || '',
                        stderr: stdErr || '',
                        exitCode: error?.code ?? 0
                    });
                });
            }
        });
    };
    execResult = await tryExec(command);
    if (execResult.stderr.toLowerCase().includes("permission denied") || execResult.stderr.includes("EACCES")) {
        const rl = (0, readline_1.createInterface)({ input: process.stdin, output: process.stdout });
        let originalStdoutWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = (str) => {
            if (str !== "\r" && str !== "\n")
                return true;
            return originalStdoutWrite(str);
        };
        console.log(chalk_1.default.yellow("\nThis command needs sudo. Enter password: "));
        const password = await new Promise((resolve) => {
            rl.question("", (ans) => {
                process.stdout.write = originalStdoutWrite;
                rl.close();
                resolve(ans);
            });
        });
        execResult = await tryExec(command, password);
    }
    let output = "";
    if (execResult.stdout)
        output += execResult.stdout;
    if (execResult.stderr)
        output += execResult.stderr;
    console.log(output.trim());
    return output.trim();
}
async function processBashBlocks(response) {
    const bashRegex = /```(?:bash|sh)\n([\s\S]*?)```/g;
    let match;
    while ((match = bashRegex.exec(response)) !== null) {
        const command = match[1].trim();
        console.log(chalk_1.default.yellow(`\nCommand: ${command} Run this command? (y/n): `));
        const rl = (0, readline_1.createInterface)({ input: process.stdin, output: process.stdout });
        const answer = await new Promise((resolve) => {
            rl.question("", (ans) => {
                rl.close();
                resolve(ans.toLowerCase().trim());
            });
        });
        if (answer === "y") {
            console.log(chalk_1.default.dim(`\n> ${command}\n`));
            const output = await executeBashCommandWithRetry(command);
            response += `\n\n<command-output>\n${chalk_1.default.green(output)}\n</command-output>`;
        }
        else {
            console.log(chalk_1.default.dim("Skipped."));
        }
    }
    return response;
}
async function processBashBlocksWithResponse(response, messagesList, config, model_id) {
    const bashRegex = /```(?:bash|sh)\n([\s\S]*?)```/g;
    let match;
    while ((match = bashRegex.exec(response)) !== null) {
        const command = match[1].trim();
        console.log(chalk_1.default.yellow(`\nCommand: ${command} Run this command? (y/n): `));
        const rl = (0, readline_1.createInterface)({ input: process.stdin, output: process.stdout });
        const answer = await new Promise((resolve) => {
            rl.question("", (ans) => {
                rl.close();
                resolve(ans.toLowerCase().trim());
            });
        });
        if (answer === "y") {
            console.log(chalk_1.default.dim(`\n> ${command}\n`));
            const output = await executeBashCommandWithRetry(command);
            messagesList.push({ role: "user", content: 'Command output:\n' + output });
            const result = await streamChat(config, model_id, messagesList);
            if (result.response) {
                console.log(chalk_1.default.bold("\n"));
                console.log(result.response);
                messagesList.push({ role: "assistant", content: result.response });
            }
        }
        else {
            console.log(chalk_1.default.dim("Skipped."));
        }
    }
    return { processedResponse: response, updatedMessages: messagesList };
}
const CONFIG_DIR = path.join(os.homedir(), ".milesgpt");
const CONVERSATIONS_DIR = path.join(CONFIG_DIR, "conversations");
const HISTORY_FILE = path.join(CONFIG_DIR, "history.json");
const MEMORY_FILE = path.join(CONFIG_DIR, "memory.txt");
function ensureDirs() {
    if (!fs.existsSync(CONFIG_DIR))
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    if (!fs.existsSync(CONVERSATIONS_DIR))
        fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true });
}
function readConfig() {
    const configFile = path.join(CONFIG_DIR, "config.json");
    if (!fs.existsSync(configFile))
        return null;
    try {
        return JSON.parse(fs.readFileSync(configFile, "utf-8"));
    }
    catch {
        return null;
    }
}
function saveConfig(config) {
    const configFile = path.join(CONFIG_DIR, "config.json");
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
}
function readHistory() {
    if (!fs.existsSync(HISTORY_FILE))
        return null;
    try {
        return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    }
    catch {
        return null;
    }
}
function saveMemory(fact) {
    ensureDirs();
    if (fs.existsSync(MEMORY_FILE)) {
        fs.appendFileSync(MEMORY_FILE, "\n" + fact);
    }
    else {
        fs.writeFileSync(MEMORY_FILE, fact);
    }
}
function displayMemories() {
    const memory = readMemory();
    if (!memory) {
        console.log(chalk_1.default.yellow("No memories saved yet."));
        return;
    }
    console.log(memory);
}
function readMemory() {
    if (!fs.existsSync(MEMORY_FILE))
        return null;
    try {
        return fs.readFileSync(MEMORY_FILE, "utf-8").trim();
    }
    catch {
        return null;
    }
}
async function fetchDefaultModel(config) {
    try {
        const baseUrl = config.server_url.replace(/\/$/, '');
        const response = await (0, node_fetch_1.default)(`${baseUrl}/api/models`, {
            headers: { "Authorization": `Bearer ${config.token}` }
        });
        if (response.status === 200) {
            const data = await response.json();
            const models = Array.isArray(data.data) ? data.data : [];
            if (models.length > 0) {
                return models[0]?.id || null;
            }
            else {
                console.log(chalk_1.default.yellow("No models available."));
            }
        }
        else {
            console.log(chalk_1.default.yellow(`Failed to fetch models: ${response.status}`));
        }
    }
    catch (e) {
        console.log(chalk_1.default.red(`Error fetching models: ${e.message}`));
    }
    return null;
}
async function displayModels(config) {
    try {
        const baseUrl = config.server_url.replace(/\/$/, '');
        const response = await (0, node_fetch_1.default)(`${baseUrl}/api/models`, {
            headers: { "Authorization": `Bearer ${config.token}` }
        });
        if (response.status === 200) {
            const data = await response.json();
            const models = Array.isArray(data.data) ? data.data : [];
            console.log(chalk_1.default.bold("\nAvailable Models:\n"));
            models.forEach((model, i) => {
                console.log(`  ${i + 1}. ${chalk_1.default.cyan(model.id)} - ${(model.name || "No name")}`);
            });
        }
        else {
            console.log(chalk_1.default.yellow(`Failed to fetch models: ${response.status}`));
        }
    }
    catch (e) {
        console.log(chalk_1.default.red(`Error fetching models: ${e.message}`));
    }
}
async function streamChat(config, model_id, messages) {
    try {
        console.log("Thinking...");
        const body = {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${config.token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: model_id,
                messages,
                stream: true
            })
        };
        const baseUrl = config.server_url.replace(/\/$/, '');
        const response = await timeoutFetch(`${baseUrl}/api/v1/chat/completions`, body);
        if (response.status !== 200) {
            let errorMsg = `✗ Error: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMsg += `\n${JSON.stringify(errorData, null, 2)}`;
            }
            catch { }
            console.log(chalk_1.default.red(errorMsg));
            return { response: null };
        }
        let fullResponse = "";
        const decoder = new TextDecoder();
        if (response.body) {
            for await (const chunk of response.body) {
                const line = decoder.decode(chunk, { stream: true });
                for (const l of line.split('\n')) {
                    if (!l || l === "data: [DONE]")
                        continue;
                    if (l.startsWith("data: ")) {
                        try {
                            const json = JSON.parse(l.slice(6));
                            const content = json.choices?.[0]?.delta?.content;
                            if (content) {
                                fullResponse += content;
                            }
                        }
                        catch { }
                    }
                }
            }
        }
        process.stdout.write("\r".padEnd(15));
        console.log();
        fullResponse = fullResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        return { response: fullResponse };
    }
    catch (err) {
        console.error('Streaming error:', err);
        throw err;
    }
}
async function startChat(config, context, model_id) {
    ensureDirs();
    const history = readHistory();
    if (history?.context) {
        console.log(chalk_1.default.yellow("✓ Resumed session from " + new Date(history.last_session).toLocaleString()));
        context = history.context;
        model_id = history.model_id || model_id;
    }
    const systemPrompt = "You are MilesGPT, an AI assistant with full access to this machine. When you need to read a file or directory, write a bash code block with the command (e.g. ls, cat, find) and it will be executed automatically and the output fed back to you. Do not claim you cannot access files — use bash commands to access them.";
    let messagesList = [];
    console.log(chalk_1.default.dim("--- Type /help for commands ---"));
    async function question(query) {
        const rl = (0, readline_1.createInterface)({
            input: process.stdin,
            output: process.stdout
        });
        return new Promise((resolve) => {
            rl.question(query, (ans) => {
                rl.close();
                resolve(ans);
            });
        });
    }
    async function chatLoop() {
        try {
            let input = await question(chalk_1.default.green("> "));
            while (input.trim()) {
                const parts = input.split(" ");
                const cmd = parts[0].trim().toLowerCase();
                const args = (parts.slice(1).join(" ").trim() || "");
                switch (cmd) {
                    case "/help":
                        console.log(chalk_1.default.bold("\nAvailable Commands:"));
                        console.log(chalk_1.default.yellow("  /login    - Login to OpenWebUI server"));
                        console.log(chalk_1.default.yellow("  /model    - Switch to a different model"));
                        console.log(chalk_1.default.yellow("  /save     - Save current conversation"));
                        console.log(chalk_1.default.yellow("  /load     - Load a saved conversation"));
                        console.log(chalk_1.default.yellow("  /clear    - Clear conversation history"));
                        console.log(chalk_1.default.yellow("  /memory   - View/save memories"));
                        console.log(chalk_1.default.yellow("  /quit     - Exit the program"));
                        break;
                    case "/model":
                        const baseUrl = config.server_url.replace(/\/$/, '');
                        const modelResponse = await (0, node_fetch_1.default)(`${baseUrl}/api/models`, {
                            headers: { "Authorization": `Bearer ${config.token}` }
                        });
                        if (modelResponse.status === 200) {
                            const data = await modelResponse.json();
                            const models = Array.isArray(data.data) ? data.data : [];
                            if (models.length === 0) {
                                console.log(chalk_1.default.yellow("No models available."));
                                break;
                            }
                            console.log(chalk_1.default.bold("\nAvailable Models:\n"));
                            models.forEach((model, i) => {
                                const num = chalk_1.default.cyan(`${i + 1}.`);
                                const id = chalk_1.default.green(model.id);
                                const name = model.name ? ` - ${chalk_1.default.dim(model.name)}` : '';
                                console.log(`  ${num} ${id}${name}`);
                            });
                            const choice = await question("\nSelect a model number: ");
                            const idx = parseInt(choice.trim()) - 1;
                            if (idx >= 0 && idx < models.length) {
                                const selectedModel = models[idx];
                                model_id = selectedModel.id || null;
                                console.log(chalk_1.default.green(`✓ Switched to: ${model_id}`));
                                if (!model_id) {
                                    console.log(chalk_1.default.yellow("Warning: Selected model has no ID."));
                                }
                            }
                            else {
                                console.log(chalk_1.default.yellow("Invalid selection. No change made."));
                            }
                        }
                        else {
                            console.log(chalk_1.default.yellow(`Failed to fetch models: ${modelResponse.status}`));
                        }
                        break;
                    case "/save":
                        ensureDirs();
                        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                        const filename = `conversation-${timestamp}.json`;
                        fs.writeFileSync(path.join(CONVERSATIONS_DIR, filename), JSON.stringify({ model: model_id, messagesList }, null, 2));
                        console.log(chalk_1.default.green(`✓ Saved to ${filename}`));
                        break;
                    case "/load":
                        ensureDirs();
                        const files = fs.readdirSync(CONVERSATIONS_DIR).filter(f => f.endsWith(".json")).slice(-5);
                        if (files.length === 0) {
                            console.log(chalk_1.default.yellow("No saved conversations."));
                        }
                        else {
                            for (let i = 0; i < files.length; i++) {
                                console.log(`  ${i + 1}. ${files[i]}`);
                            }
                            const choice = await question("Select: ");
                            const idx = parseInt(choice) - 1;
                            if (idx >= 0 && idx < files.length) {
                                try {
                                    const data = JSON.parse(fs.readFileSync(path.join(CONVERSATIONS_DIR, files[idx]), "utf-8"));
                                    messagesList = data.messages || [];
                                    console.log(chalk_1.default.green("✓ Loaded conversation"));
                                }
                                catch { }
                            }
                        }
                        break;
                    case "/clear":
                        messagesList = [{ role: "system", content: systemPrompt }];
                        console.log(chalk_1.default.yellow("Conversation cleared."));
                        break;
                    case "/memory":
                        if (args) {
                            saveMemory(args);
                            console.log(chalk_1.default.green(`✓ Remembered: ${args}`));
                        }
                        else {
                            displayMemories();
                        }
                        break;
                    case "/login":
                        const rl = (0, readline_1.createInterface)({ input: process.stdin, output: process.stdout });
                        console.log("\n" + chalk_1.default.cyan("━".repeat(20)));
                        console.log(chalk_1.default.cyan("  MilesGPT Login"));
                        console.log(chalk_1.default.cyan("━".repeat(20)) + "\n");
                        const loginQuestion = (query) => {
                            return new Promise((resolve) => {
                                rl.question(query, (ans) => resolve(ans));
                            });
                        };
                        console.log(chalk_1.default.dim("Tip: Set MILESGPT_SERVER_URL and MILESGPT_TOKEN env vars to skip login\n"));
                        let serverUrl = await loginQuestion(chalk_1.default.gray("  Server: [https://ai.huntermilesdesign.work]: "));
                        if (!serverUrl)
                            serverUrl = "https://ai.huntermilesdesign.work";
                        if (!serverUrl.endsWith("/"))
                            serverUrl += "/";
                        const username = await loginQuestion(chalk_1.default.gray("  Email: ") + chalk_1.default.yellow("Email: "));
                        console.log();
                        let password = "";
                        const originalStdoutWrite = process.stdout.write.bind(process.stdout);
                        process.stdout.write = (str) => {
                            if (str !== "\r" && str !== "\n")
                                return true;
                            return originalStdoutWrite(str);
                        };
                        password = await loginQuestion(chalk_1.default.gray("  Password: ") + chalk_1.default.yellow("[hidden]: "));
                        // Mask password in input
                        process.stdout.write = originalStdoutWrite;
                        console.log("\n" + chalk_1.default.dim("  Authenticating..."));
                        let spinnerChar = 0;
                        const spinnerChars = ["|", "/", "-", "\\"];
                        const spinnerInterval = setInterval(() => {
                            process.stdout.write(`\r${chalk_1.default.gray("  ")} ${spinnerChars[spinnerChar % 4]} `);
                            spinnerChar++;
                        }, 100);
                        try {
                            const baseUrl = serverUrl.replace(/\/$/, '');
                            const response = await (0, node_fetch_1.default)(`${baseUrl}/api/v1/auths/signin`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ email: username, password })
                            });
                            clearInterval(spinnerInterval);
                            process.stdout.write("\r                          \r");
                            if (response.status === 200) {
                                const data = await response.json();
                                const token = (data.token || data.access_token);
                                const name = (data.name || username);
                                saveConfig({ server_url: serverUrl, token });
                                console.log(chalk_1.default.green(`  ✓ Welcome, ${name}!`));
                            }
                            else {
                                console.log(chalk_1.default.red("  ✗ Login failed"));
                            }
                        }
                        catch (e) {
                            clearInterval(spinnerInterval);
                            process.stdout.write("\r                          \r");
                            console.log(chalk_1.default.red(`  ✗ Cannot connect to server: ${e.message}`));
                        }
                        finally {
                            rl.close();
                        }
                        break;
                    case "/exit":
                    case "/quit":
                        process.exit(0);
                    default:
                        messagesList = [{ role: "system", content: systemPrompt }, ...messagesList, { role: "user", content: input }];
                        const result = await streamChat(config, model_id || "default-model", messagesList);
                        if (result.response) {
                            console.log(chalk_1.default.bold("\n"));
                            console.log(result.response);
                            const { processedResponse, updatedMessages } = await processBashBlocksWithResponse(result.response, messagesList, config, model_id || "default-model");
                            messagesList = updatedMessages;
                        }
                        else {
                            console.log(chalk_1.default.yellow("Try again or check if your model is loaded in LM Studio."));
                        }
                }
                input = await question(chalk_1.default.green("> "));
            }
        }
        catch (e) {
            console.log(chalk_1.default.yellow("\nSession ended."));
        }
    }
    chatLoop().catch(console.error);
}
async function login() {
    const rl = (0, readline_1.createInterface)({ input: process.stdin, output: process.stdout });
    const question = (query) => {
        return new Promise((resolve) => {
            rl.question(query, (ans) => resolve(ans));
        });
    };
    ensureDirs();
    let serverUrl = await question("OpenWebUI Server URL [https://ai.huntermilesdesign.work]: ") || "https://ai.huntermilesdesign.work";
    if (!serverUrl.endsWith("/"))
        serverUrl += "/";
    const username = await question("Email: ");
    const password = await question("Password: ");
    try {
        const baseUrl = serverUrl.replace(/\/$/, '');
        const response = await (0, node_fetch_1.default)(`${baseUrl}/api/v1/auths/signin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: username, password })
        });
        if (response.status === 200) {
            const data = await response.json();
            const token = (data.token || data.access_token);
            const name = (data.name || username);
            saveConfig({ server_url: serverUrl, token });
            console.log(chalk_1.default.green(`✓ Welcome, ${name}!`));
        }
        else {
            console.log(chalk_1.default.red("✗ Login failed"));
        }
    }
    catch (e) {
        console.log(chalk_1.default.red(`✗ Cannot connect to server: ${e.message}`));
    }
    finally {
        rl.close();
    }
}
function logout() {
    const configFile = path.join(CONFIG_DIR, "config.json");
    if (fs.existsSync(configFile)) {
        fs.unlinkSync(configFile);
        console.log(chalk_1.default.green("✓ Logged out successfully!"));
    }
    else {
        console.log(chalk_1.default.yellow("No saved credentials found."));
    }
}
async function showModels() {
    const config = readConfig();
    if (!config) {
        console.log(chalk_1.default.red("Not logged in. Please run 'milesgpt login' first."));
        return;
    }
    await displayModels(config);
}
async function main() {
    const config = readConfig();
    if (!config || !config.token) {
        console.log(chalk_1.default.bold.blue("MilesGPT Login"));
        console.log(chalk_1.default.dim("\nNot logged in. Please run 'milesgpt login' first."));
        process.exit(1);
    }
    ensureDirs();
    const banner = figlet_1.default.textSync("MilesGPT", { font: "3x5" });
    console.log("\n" + banner.split('\n').map(line => chalk_1.default.cyan(line)).join('\n'));
    console.log(chalk_1.default.dim("your local AI, your rules\n"));
    const history = readHistory();
    let context = [];
    let model_id = config.model_id;
    if (history?.context) {
        console.log(chalk_1.default.yellow("✓ Resumed session from " + new Date(history.last_session).toLocaleString()));
        context = history.context;
        model_id = history.model_id || model_id;
    }
    else if (!model_id) {
        const defaultModel = await fetchDefaultModel(config);
        if (defaultModel) {
            model_id = defaultModel;
        }
    }
    startChat(config, context, model_id);
}
// CLI entry point
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
    console.log(chalk_1.default.bold("\nMilesGPT - Modern terminal chat for OpenWebUI\n"));
    console.log("Usage: milesgpt [command]");
    console.log("\nCommands:");
    console.log("  login     Login to OpenWebUI and save token");
    console.log("  logout    Clear saved credentials");
    console.log("  models    List available models");
    process.exit(0);
}
else if (args.includes("login")) {
    login().catch(console.error);
}
else if (args.includes("logout")) {
    logout();
}
else if (args.includes("models") || args.includes("-l")) {
    showModels().catch(console.error);
}
else {
    main();
}
//# sourceMappingURL=cli.js.map