# PassKeeper - 智能账号管理与自动化登录插件

PassKeeper 是一款专为开发者和多账号用户打造的 Chrome 浏览器扩展。它集成了账号管理、安全加密、自动填充以及 **AI 驱动的验证码识别** 功能，旨在彻底简化登录流程。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Chrome](https://img.shields.io/badge/Chrome-Extension-green.svg)
![Ollama](https://img.shields.io/badge/AI-Ollama--Integrated-orange.svg)

## ✨ 核心特性

- 🤖 **AI 验证码识别**：集成 Ollama (如 qwen3-vl) 视觉大模型，自动识别并填充图片验证码。
- 🔐 **极致安全**：使用 Web Crypto API (AES-GCM) 对凭据进行本地加密存储。
- 👆 **生物识别验证**：支持 WebAuthn (Touch ID / Windows Hello) 保护，查看敏感信息前需进行身份验证。
- 🔄 **多账号切换**：支持同一域名下保存多个账号，一键快速切换登录。
- 🔗 **共享域名映射**：支持将多个测试域名（如 localhost, 127.0.0.1）映射到同一组账号配置。
- 🎨 **现代 UI 设计**：支持深色/浅色模式切换，流畅的微交互体验。

## 🚀 快速开始

### 1. 安装插件
1. 下载本项目代码到本地。
2. 打开 Chrome 浏览器，访问 `chrome://extensions/`。
3. 开启右上角的 **“开发者模式”**。
4. 点击 **“加载已解压的扩展程序”**，选择项目根目录。

### 2. 配置 AI 验证码识别 (可选)
PassKeeper 支持通过 Ollama 调用本地视觉模型识别验证码：
1. 安装 [Ollama](https://ollama.com/)。
2. 下载视觉模型，例如：`ollama run qwen3-vl:8b`。
3. 在插件设置中配置 Ollama 的 Base URL (默认 `http://localhost:11434`)。
4. 开启自动登录功能后，插件将自动寻找页面验证码并请求模型识别。

## 🛠️ 技术栈

- **Core**: Vanilla JavaScript, HTML5, CSS3
- **Storage**: `chrome.storage.local` (加密存储)
- **Security**: Web Crypto API (AES-GCM), WebAuthn API
- **AI Integration**: Ollama API (支持本地大模型)

## 📸 预览

*(在此处添加您的截图，例如 popup 界面和管理后台界面)*

## 🤝 贡献

欢迎提交 Issue 或 Pull Request。

## 📄 开源协议

本项目采用 [MIT](LICENSE) 协议开源。
