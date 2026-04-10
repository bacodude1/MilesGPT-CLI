#!/usr/bin/env node

process.on('uncaughtException', (err) => console.error('Uncaught:', err));

import { createInterface } from "readline";
import figlet from "figlet";
import fetch, { RequestInit } from "node-fetch";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";

function executeBashCommand(command: string): Promise<string> {
  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      let output = "";
      if (stdout) output += stdout;
      if (stderr) output += stderr;
      resolve(output.trim());
    });
  });
}

async function processBashBlocks(response: string): Promise<string> {
  const bashRegex = /```(?:bash|sh)\n([\s\S]*?)```/g;
  let match;
  
  while ((match = bashRegex.exec(response)) !== null) {
    const command = match[1].trim();
    console.log(chalk.yellow(`\nCommand: ${command} Run this command? (y/n): `));
    
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question("", (ans) => {
        rl.close();
        resolve(ans.toLowerCase().trim());
      });
    });
    
    if (answer === "y") {
      console.log(chalk.dim(`\n> ${command}\n`));
      const output = await executeBashCommand(command);
      if (output) {
        console.log('Output:', chalk.green(output));
        response += `\n\n<command-output>\n${chalk.green(output)}\n</command-output>`;
      }
    } else {
      console.log(chalk.dim("Skipped."));
    }
  }
  
  return response;
}

async function processBashBlocksWithResponse(
  response: string, 
  messagesList: any[],
  config: Config,
  model_id: string
): Promise<{ processedResponse: string; updatedMessages: any[] }> {
  const bashRegex = /```(?:bash|sh)\n([\s\S]*?)```/g;
  let match;
  
  while ((match = bashRegex.exec(response)) !== null) {
    const command = match[1].trim();
    console.log(chalk.yellow(`\nCommand: ${command} Run this command? (y/n): `));
    
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question("", (ans) => {
        rl.close();
        resolve(ans.toLowerCase().trim());
      });
    });
    
    if (answer === "y") {
      console.log(chalk.dim(`\n> ${command}\n`));
      const output = await executeBashCommand(command);
      if (output) {
        console.log('Output:', chalk.green(output));
        
        messagesList.push({ role: "user", content: 'Command output:\n' + output });
        
        const result = await streamChat(config, model_id, messagesList);
        
        if (result.response) {
          console.log(chalk.bold("\n"));
          console.log(result.response);
          messagesList.push({ role: "assistant", content: result.response });
        }
      }
    } else {
      console.log(chalk.dim("Skipped."));
    }
  }
  
  return { processedResponse: response, updatedMessages: messagesList };
}


const CONFIG_DIR = path.join(os.homedir(), ".milesgpt");
const CONVERSATIONS_DIR = path.join(CONFIG_DIR, "conversations");
const HISTORY_FILE = path.join(CONFIG_DIR, "history.json");
const MEMORY_FILE = path.join(CONFIG_DIR, "memory.txt");

interface Config {
  server_url: string;
  token: string;
  model_id?: string;
}

function ensureDirs(): void {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(CONVERSATIONS_DIR)) 
    fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true });
}

function readConfig(): Config | null {
  const configFile = path.join(CONFIG_DIR, "config.json");
  if (!fs.existsSync(configFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(configFile, "utf-8"));
  } catch {
    return null;
  }
}

function saveConfig(config: Config): void {
  const configFile = path.join(CONFIG_DIR, "config.json");
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
}

function readHistory(): any {
  if (!fs.existsSync(HISTORY_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function saveMemory(fact: string): void {
  ensureDirs();
  if (fs.existsSync(MEMORY_FILE)) {
    fs.appendFileSync(MEMORY_FILE, "\n" + fact);
  } else {
    fs.writeFileSync(MEMORY_FILE, fact);
  }
}

function displayMemories(): void {
  const memory = readMemory();
  if (!memory) {
    console.log(chalk.yellow("No memories saved yet."));
    return;
  }
  console.log(memory);
}

function readMemory(): string | null {
  if (!fs.existsSync(MEMORY_FILE)) return null;
  try {
    return fs.readFileSync(MEMORY_FILE, "utf-8").trim();
  } catch {
    return null;
  }
}

async function fetchDefaultModel(config: Config): Promise<string | null> {
  try {
    const baseUrl = config.server_url.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/api/models`, {
      headers: { "Authorization": `Bearer ${config.token}` }
    });
    
    if (response.status === 200) {
      const data = await response.json();
      const models = Array.isArray((data as any).data) ? (data as any).data : [];
      
      if (models.length > 0) {
        return (models[0] as any)?.id || null;
      } else {
        console.log(chalk.yellow("No models available."));
      }
    } else {
      console.log(chalk.yellow(`Failed to fetch models: ${response.status}`));
    }
  } catch (e) {
    console.log(chalk.red(`Error fetching models: ${(e as Error).message}`));
  }
  
  return null;
}

async function displayModels(config: Config): Promise<void> {
  try {
    const baseUrl = config.server_url.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/api/models`, {
      headers: { "Authorization": `Bearer ${config.token}` }
    });
    
    if (response.status === 200) {
      const data = await response.json();
      const models = Array.isArray((data as any).data) ? (data as any).data : [];
      
      console.log(chalk.bold("\nAvailable Models:\n"));
      models.forEach((model: any, i: number) => {
        console.log(`  ${i + 1}. ${chalk.cyan(model.id)} - ${(model.name || "No name")}`);
      });
    } else {
      console.log(chalk.yellow(`Failed to fetch models: ${response.status}`));
    }
  } catch (e) {
    console.log(chalk.red(`Error fetching models: ${(e as Error).message}`));
  }
}

async function streamChat(
  config: Config, 
  model_id: string, 
  messages: any[]
): Promise<{ response: string | null }> {
  try {
    console.log("Thinking...");
    
    const body: RequestInit = {
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
    const response = await fetch(`${baseUrl}/api/v1/chat/completions`, body);
    
    if (response.status !== 200) {
      console.log(chalk.red(`✗ Error: ${response.status}`));
      return { response: null };
    }
    
    let fullResponse = "";
    const decoder = new TextDecoder();
    
    if (response.body) {
      response.body.on('data', (chunk: Buffer) => {
        const line = decoder.decode(chunk);
        
        for (const l of line.split('\n')) {
          if (!l || l === "data: [DONE]") continue;
          
          if (l.startsWith("data: ")) {
            try {
              const json = JSON.parse(l.slice(6));
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
              }
            } catch {}
          }
        }
      });
      
      await new Promise((resolve) => response.body!.on('end', resolve));
    }
    
    process.stdout.write("\r".padEnd(15));
    console.log();
    
    fullResponse = fullResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    
    return { response: fullResponse };
  } catch (err) {
    console.error('Streaming error:', err);
    throw err;
  }
}

async function startChat(config: Config, context: any[], model_id?: string): Promise<void> {
  ensureDirs();

  const history = readHistory();

  if (history?.context) {
    console.log(chalk.yellow("✓ Resumed session from " + new Date(history.last_session).toLocaleString()));
    context = history.context;
    model_id = (history as any).model_id || model_id;
  }
  
  const systemPrompt = "You are MilesGPT, an AI assistant with full access to this machine. When you need to read a file or directory, write a bash code block with the command (e.g. ls, cat, find) and it will be executed automatically and the output fed back to you. Do not claim you cannot access files — use bash commands to access them.";
  
  let messagesList: any[] = [];
  
  console.log(chalk.dim("--- Type /help for commands ---"));
  
  async function question(query: string): Promise<string> {
    const rl = createInterface({
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
  
  async function chatLoop(): Promise<void> {
    try {
      let input = await question(chalk.green("> "));
      
      while (input.trim()) {
        const parts = input.split(" ");
        const cmd = parts[0].trim().toLowerCase();
        const args = (parts.slice(1).join(" ").trim() || "") as string;
        
        switch (cmd) {
          case "/help":
            console.log(chalk.bold("\nAvailable Commands:"));
            console.log(chalk.yellow("  /login    - Login to OpenWebUI server"));
            console.log(chalk.yellow("  /model    - Switch to a different model"));
            console.log(chalk.yellow("  /save     - Save current conversation"));
            console.log(chalk.yellow("  /load     - Load a saved conversation"));
            console.log(chalk.yellow("  /clear    - Clear conversation history"));
            console.log(chalk.yellow("  /memory   - View/save memories"));
            console.log(chalk.yellow("  /quit     - Exit the program"));
            break;
            
          case "/model":
  const baseUrl = config.server_url.replace(/\/$/, '');
  const modelResponse = await fetch(`${baseUrl}/api/models`, {
    headers: { "Authorization": `Bearer ${config.token}` }
  });
  
  if (modelResponse.status === 200) {
    const data = await modelResponse.json();
    const models = Array.isArray((data as any).data) ? (data as any).data : [];
    
    if (models.length === 0) {
      console.log(chalk.yellow("No models available."));
      break;
    }
    
    console.log(chalk.bold("\nAvailable Models:\n"));
    models.forEach((model: any, i: number) => {
      const num = chalk.cyan(`${i + 1}.`);
      const id = chalk.green(model.id);
      const name = model.name ? ` - ${chalk.dim(model.name)}` : '';
      console.log(`  ${num} ${id}${name}`);
    });
    
    const choice = await question("\nSelect a model number: ");
    const idx = parseInt(choice.trim()) - 1;
    
    if (idx >= 0 && idx < models.length) {
      const selectedModel = models[idx];
      model_id = (selectedModel as any).id || null;
      console.log(chalk.green(`✓ Switched to: ${model_id}`));
      
      if (!model_id) {
        console.log(chalk.yellow("Warning: Selected model has no ID."));
      }
    } else {
      console.log(chalk.yellow("Invalid selection. No change made."));
    }
  } else {
    console.log(chalk.yellow(`Failed to fetch models: ${modelResponse.status}`));
  }
  break;
            
          case "/save":
            ensureDirs();
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filename = `conversation-${timestamp}.json`;
            fs.writeFileSync(path.join(CONVERSATIONS_DIR, filename), 
              JSON.stringify({ model: model_id, messagesList }, null, 2));
            console.log(chalk.green(`✓ Saved to ${filename}`));
            break;
            
          case "/load":
            ensureDirs();
            const files = fs.readdirSync(CONVERSATIONS_DIR).filter(f => f.endsWith(".json")).slice(-5);
            if (files.length === 0) {
              console.log(chalk.yellow("No saved conversations."));
            } else {
              for (let i = 0; i < files.length; i++) {
                console.log(`  ${i+1}. ${files[i]}`);
              }
              const choice = await question("Select: ");
              const idx = parseInt(choice) - 1;
              if (idx >= 0 && idx < files.length) {
                try {
                  const data = JSON.parse(fs.readFileSync(path.join(CONVERSATIONS_DIR, files[idx]), "utf-8"));
                  messagesList = (data as any).messages || [];
                  console.log(chalk.green("✓ Loaded conversation"));
                } catch {}
              }
            }
            break;
            
          case "/clear":
            messagesList = [{ role: "system", content: systemPrompt }];
            console.log(chalk.yellow("Conversation cleared."));
            break;
            
          case "/memory":
            if (args) {
              saveMemory(args);
              console.log(chalk.green(`✓ Remembered: ${args}`));
            } else {
              displayMemories();
            }
            break;
            
case "/login":
            const rl = createInterface({ input: process.stdin, output: process.stdout });
            
            console.log("\n" + chalk.cyan("━".repeat(20)));
            console.log(chalk.cyan("  MilesGPT Login"));
            console.log(chalk.cyan("━".repeat(20)) + "\n");
            
            const loginQuestion = (query: string): Promise<string> => {
              return new Promise((resolve) => {
                rl.question(query, (ans) => resolve(ans));
              });
            };
            
            console.log(chalk.dim("Tip: Set MILESGPT_SERVER_URL and MILESGPT_TOKEN env vars to skip login\n"));
            
            let serverUrl = await loginQuestion(chalk.gray("  Server: [https://ai.huntermilesdesign.work]: "));
            if (!serverUrl) serverUrl = "https://ai.huntermilesdesign.work";
            if (!serverUrl.endsWith("/")) serverUrl += "/";
            
            const username = await loginQuestion(chalk.gray("  Email: ") + chalk.yellow("Email: "));
            
            console.log();
            
            let password = "";
            const originalStdoutWrite = process.stdout.write.bind(process.stdout);
            process.stdout.write = (str) => {
              if (str !== "\r" && str !== "\n") return true;
              return originalStdoutWrite(str);
            };
            password = await loginQuestion(chalk.gray("  Password: ") + chalk.yellow("[hidden]: "));
            // Mask password in input
            process.stdout.write = originalStdoutWrite;
            
            console.log("\n" + chalk.dim("  Authenticating..."));
            let spinnerChar = 0;
            const spinnerChars = ["|", "/", "-", "\\"];
            const spinnerInterval = setInterval(() => {
              process.stdout.write(`\r${chalk.gray("  ")} ${spinnerChars[spinnerChar % 4]} `);
              spinnerChar++;
            }, 100);
            
            try {
              const baseUrl = serverUrl.replace(/\/$/, '');
              const response = await fetch(`${baseUrl}/api/v1/auths/signin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: username, password })
              });
              
              clearInterval(spinnerInterval);
              process.stdout.write("\r                          \r");
              
              if (response.status === 200) {
                const data = await response.json();
                const token = ((data as any).token || (data as any).access_token) as string;
                const name = ((data as any).name || username) as string;
                
                saveConfig({ server_url: serverUrl, token });
                console.log(chalk.green(`  ✓ Welcome, ${name}!`));
              } else {
                console.log(chalk.red("  ✗ Login failed"));
              }
            } catch (e: any) {
              clearInterval(spinnerInterval);
              process.stdout.write("\r                          \r");
              console.log(chalk.red(`  ✗ Cannot connect to server: ${e.message}`));
            } finally {
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
              console.log(chalk.bold("\n"));
              console.log(result.response);
              
              const { processedResponse, updatedMessages } = await processBashBlocksWithResponse(
                result.response, 
                messagesList,
                config,
                model_id || "default-model"
              );
              messagesList = updatedMessages;
            } else {
              console.log(chalk.red("Could not get response."));
            }
        }
        
        input = await question(chalk.green("> "));
      }
    } catch (e) {
      console.log(chalk.yellow("\nSession ended."));
    }
  }
  
  chatLoop().catch(console.error);
}

async function login(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, (ans) => resolve(ans));
    });
  };

  ensureDirs();

  let serverUrl = await question("OpenWebUI Server URL [https://ai.huntermilesdesign.work]: ") || "https://ai.huntermilesdesign.work";
  if (!serverUrl.endsWith("/")) serverUrl += "/";

  const username = await question("Email: ");
  const password = await question("Password: ");

  try {
    const baseUrl = serverUrl.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/api/v1/auths/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: username, password })
    });

    if (response.status === 200) {
      const data = await response.json();
      const token = ((data as any).token || (data as any).access_token) as string;
      const name = ((data as any).name || username) as string;

      saveConfig({ server_url: serverUrl, token });
      console.log(chalk.green(`✓ Welcome, ${name}!`));
    } else {
      console.log(chalk.red("✗ Login failed"));
    }
  } catch (e: any) {
    console.log(chalk.red(`✗ Cannot connect to server: ${e.message}`));
  } finally {
    rl.close();
  }
}

function logout(): void {
  const configFile = path.join(CONFIG_DIR, "config.json");
  if (fs.existsSync(configFile)) {
    fs.unlinkSync(configFile);
    console.log(chalk.green("✓ Logged out successfully!"));
  } else {
    console.log(chalk.yellow("No saved credentials found."));
  }
}

async function showModels(): Promise<void> {
  const config = readConfig();
  if (!config) {
    console.log(chalk.red("Not logged in. Please run 'milesgpt login' first."));
    return;
  }
  
  await displayModels(config);
}

async function main(): Promise<void> {
  const config = readConfig();

  if (!config || !config.token) {
    console.log(chalk.bold.blue("MilesGPT Login"));
    console.log(chalk.dim("\nNot logged in. Please run 'milesgpt login' first."));
    process.exit(1);
  }

  ensureDirs();

  const banner = figlet.textSync("MilesGPT", { font: "3x5" });
  console.log("\n" + banner.split('\n').map(line => chalk.cyan(line)).join('\n'));
  console.log(chalk.dim("your local AI, your rules\n"));

  const history = readHistory();
  let context: any[] = [];
  let model_id = config.model_id;
  
  if (history?.context) {
    console.log(chalk.yellow("✓ Resumed session from " + new Date(history.last_session).toLocaleString()));
    context = history.context;
    model_id = (history as any).model_id || model_id;
  } else if (!model_id) {
    const defaultModel = await fetchDefaultModel(config);
    if (defaultModel) {
      model_id = defaultModel;
    }
  }
  
  startChat(config, context, model_id);
}

// CLI entry point
const args: string[] = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(chalk.bold("\nMilesGPT - Modern terminal chat for OpenWebUI\n"));
  console.log("Usage: milesgpt [command]");
  console.log("\nCommands:");
  console.log("  login     Login to OpenWebUI and save token");
  console.log("  logout    Clear saved credentials");
  console.log("  models    List available models");
  process.exit(0);
} else if (args.includes("login")) {
  login().catch(console.error);
} else if (args.includes("logout")) {
  logout();
} else if (args.includes("models") || args.includes("-l")) {
  showModels().catch(console.error);
} else {
  main();
}
