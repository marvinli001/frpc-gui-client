# FRP Client GUI

🚀 一个现代化的 FRP（Fast Reverse Proxy）客户端图形界面管理工具，基于 Electron 构建。

![FRP Client GUI](https://img.shields.io/badge/version-1.0.7-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## 🌟 主要特性

### 🎯 核心功能
- **可视化配置** - 直观的图形界面，告别命令行配置
- **服务器管理** - 支持远程服务器列表获取和管理
- **一键连接** - 简单几步即可建立 FRP 连接
- **实时日志** - 连接状态和日志实时显示
- **配置保存** - 自动保存用户配置，下次启动自动加载

### 🔐 高级特性
- **预置密码** - 支持服务器预置令牌，实现自动登录
- **多源获取** - GitHub/Gitee/CDN 多源服务器列表获取
- **缓存机制** - 智能缓存系统，离线也能使用历史数据
- **自动更新** - 内置更新检查和下载功能
- **连接诊断** - 内置 frpc.exe 检查和连接诊断工具

### 💻 用户体验
- **现代界面** - 毛玻璃效果和渐变设计
- **响应式布局** - 适配不同屏幕尺寸
- **状态指示** - 清晰的连接状态显示
- **操作反馈** - 详细的操作日志和状态提示

## 📸 界面预览
![alt text](https://github.com/marvinli001/frpc-gui-client/blob/main/%E6%97%A0%E6%A0%87%E9%A2%982.png?raw=true)

### 主界面
- 左侧：服务器配置面板
- 右侧：实时连接日志
- 顶部：状态栏和更新检查

### 功能模块
- **服务器列表** - 支持在线获取和本地管理
- **设置面板** - 服务器源配置和缓存管理
- **更新对话框** - 版本检查和更新下载

## 🚀 快速开始

### 系统要求
- Windows 10/11 (x64)
- .NET Framework 4.7.2 或更高版本

### 安装方式

#### 方式一：下载预编译版本
1. 前往 [Releases](https://github.com/marvinli001/frpc-gui-client/releases) 页面
2. 下载最新版本：
   - `FRP-Client-GUI-x.x.x-Setup.exe` - 安装版
   - `FRP-Client-GUI-x.x.x-Portable.exe` - 便携版

#### 方式二：从源码构建
```bash
# 克隆仓库
git clone https://github.com/marvinli001/frpc-gui-client.git
cd frpc-gui-client

# 安装依赖
npm install

# 开发运行
npm start

# 构建应用
npm run build-all
```

### 使用步骤

#### 1. 获取服务器列表
```
点击 "🌐 获取服务器列表" → 选择服务器 → 应用列表
```

#### 2. 配置连接参数
```
选择服务器 → 输入令牌（如需要） → 配置本地端口
```

#### 3. 建立连接
```
点击 "🚀 开始连接" → 查看连接日志 → 使用服务
```

## ⚙️ 配置说明

### 基本配置
- **服务器地址** - FRP 服务器 IP 或域名
- **服务器端口** - FRP 服务器端口（通常是 7000）
- **访问令牌** - 服务器认证令牌
- **本地端口** - 要映射的本地服务端口
- **远程端口** - 服务器分配的外网端口

### 高级配置
- **连接类型** - TCP/UDP/HTTP/HTTPS
- **本地 IP** - 本地服务绑定 IP（默认 127.0.0.1）
- **服务名称** - FRP 配置中的服务标识

### 服务器列表设置
- **主要源** - GitHub Raw（默认）
- **备用源** - Gitee、jsDelivr CDN
- **缓存时间** - 7天（可配置）
- **自动重试** - 支持多源自动切换

## 🔧 开发说明

### 技术栈
- **Electron** - 跨平台桌面应用框架
- **Node.js** - 后端运行时
- **HTML/CSS/JavaScript** - 前端界面
- **FRP** - 内网穿透核心工具

### 项目结构
```
frpc-gui-client/
├── main.js              # 主进程入口
├── renderer.js          # 渲染进程逻辑
├── preload.js           # 预加载脚本
├── index.html           # 主界面
├── style.css            # 样式文件
├── package.json         # 项目配置
├── electron-builder.json # 构建配置
└── bin/                 # FRP 可执行文件
    └── frpc.exe
```

### 开发环境搭建
```bash
# 安装 Node.js (推荐 v16+)
# 克隆项目
git clone https://github.com/marvinli001/frpc-gui-client.git
cd frpc-gui-client

# 安装依赖
npm install

# 下载 frpc.exe (可选)
npm run download-frpc

# 启动开发模式
npm start
```

### 构建脚本
```bash
# 构建便携版
npm run build-portable

# 构建安装版
npm run build-installer

# 构建所有版本
npm run build-all

# 清理构建目录
npm run clean
```

## 📝 版本历史

### v1.0.6 (当前版本)
- ✨ 新增用户配置自动保存功能
- 🔧 优化界面响应性和用户体验
- 🐛 修复连接状态显示问题
- 📦 改进构建和打包流程

### v1.0.5
- 🔐 支持服务器预置密码功能
- 🌐 多源服务器列表获取
- 💾 智能缓存机制
- 🔄 自动更新检查

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 提交 Issue
- 描述问题的具体表现
- 提供操作系统和版本信息
- 附上相关错误日志

### 提交 PR
- Fork 项目并创建功能分支
- 确保代码风格一致
- 添加必要的测试和文档
- 提交前运行 `npm run build-all` 确保构建正常

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源协议。

## 🙏 致谢

- [FRP](https://github.com/fatedier/frp) - 优秀的内网穿透工具
- [Electron](https://www.electronjs.org/) - 强大的桌面应用开发框架
- 所有贡献者和用户的支持


⭐ 如果这个项目对你有帮助，请考虑给个 Star！
