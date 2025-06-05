const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');

// 设置自定义用户数据目录，避免缓存权限问题
const userDataPath = path.join(os.homedir(), '.frpc-gui-client');
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}
app.setPath('userData', userDataPath);

// 完全禁用GPU和硬件加速
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('--disable-gpu');
app.commandLine.appendSwitch('--disable-gpu-sandbox'); 
app.commandLine.appendSwitch('--disable-software-rasterizer');
app.commandLine.appendSwitch('--disable-background-timer-throttling');
app.commandLine.appendSwitch('--disable-renderer-backgrounding');
app.commandLine.appendSwitch('--disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('--disable-features', 'VizDisplayCompositor,UseSkiaRenderer');
app.commandLine.appendSwitch('--disable-ipc-flooding-protection');
app.commandLine.appendSwitch('--disable-dev-shm-usage');
app.commandLine.appendSwitch('--no-sandbox');
app.commandLine.appendSwitch('--disable-setuid-sandbox');
app.commandLine.appendSwitch('--disable-accelerated-2d-canvas');
app.commandLine.appendSwitch('--disable-accelerated-jpeg-decoding');
app.commandLine.appendSwitch('--disable-accelerated-mjpeg-decode');
app.commandLine.appendSwitch('--disable-accelerated-video-decode');
app.commandLine.appendSwitch('--disable-accelerated-video-encode');
app.commandLine.appendSwitch('--disable-gpu-memory-buffer-compositor-resources');
app.commandLine.appendSwitch('--disable-gpu-memory-buffer-video-frames');
app.commandLine.appendSwitch('--disable-gpu-rasterization');
app.commandLine.appendSwitch('--use-gl=swiftshader');

let mainWindow;
let frpcProcess = null;

// 窗口状态
let windowState = {
  width: 1300,
  height: 850,
  x: undefined,
  y: undefined
};

// 更新配置
const UPDATE_CONFIG = {
  checkUrl: 'https://update-channel-frpcgui.cat.sd/version.json', // 替换为你的服务器地址
  checkInterval: 24 * 60 * 60 * 1000, // 24小时检查一次
  autoCheck: true
};

// 默认配置
const DEFAULT_SETTINGS = {
  serverListUrl: 'https://raw.githubusercontent.com/marvinli001/frpc-gui-client/main/remote-servers.json',
  fallbackUrls: [
    'https://gitee.com/marvinli001/frpc-gui-client/raw/main/remote-servers.json',
    'https://cdn.jsdelivr.net/gh/marvinli001/frpc-gui-client@main/remote-servers.json'
  ],
  timeout: 15000,
  retryAttempts: 3,
  cacheExpireDays: 7
};

// 在 DEFAULT_SETTINGS 后添加用户配置相关函数
const DEFAULT_USER_CONFIG = {
  localPort: 3389,
  remotePort: 6000,
  localIP: '127.0.0.1',
  type: 'tcp',
  serviceName: 'remote-desktop'
};

// 加载用户配置
function loadUserConfig() {
  try {
    const appDataPath = getAppDataPath();
    const configPath = path.join(appDataPath, 'user-config.json');
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...DEFAULT_USER_CONFIG, ...config };
    }
  } catch (error) {
    console.error('加载用户配置失败:', error);
  }
  
  return DEFAULT_USER_CONFIG;
}

// 保存用户配置
function saveUserConfig(config) {
  try {
    const appDataPath = getAppDataPath();
    const configPath = path.join(appDataPath, 'user-config.json');
    
    // 只保存需要缓存的字段
    const configToSave = {
      localPort: config.localPort || DEFAULT_USER_CONFIG.localPort,
      remotePort: config.remotePort || DEFAULT_USER_CONFIG.remotePort,
      localIP: config.localIP || DEFAULT_USER_CONFIG.localIP,
      type: config.type || DEFAULT_USER_CONFIG.type,
      serviceName: config.serviceName || DEFAULT_USER_CONFIG.serviceName,
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2));
    console.log('用户配置已保存:', configToSave);
    return { success: true };
  } catch (error) {
    console.error('保存用户配置失败:', error);
    return { success: false, error: error.message };
  }
}

// 工具函数
const getAppDataPath = () => {
  return app.getPath('userData');
};

const getResourcePath = (relativePath) => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, relativePath);
  } else {
    return path.join(__dirname, relativePath);
  }
};

// 加载应用设置
function loadAppSettings() {
  try {
    const appDataPath = getAppDataPath();
    const settingsPath = path.join(appDataPath, 'settings.json');
    
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return { ...DEFAULT_SETTINGS, ...settings };
    }
  } catch (error) {
    console.error('加载设置失败:', error);
  }
  
  return DEFAULT_SETTINGS;
}

// 保存应用设置
function saveAppSettings(settings) {
  try {
    const appDataPath = getAppDataPath();
    const settingsPath = path.join(appDataPath, 'settings.json');
    
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return true;
  } catch (error) {
    console.error('保存设置失败:', error);
    return false;
  }
}

// 修复版本比较函数
function compareVersions(version1, version2) {
  // 移除版本号前的 'v' 字符（如果有的话）
  const v1 = version1.replace(/^v/, '');
  const v2 = version2.replace(/^v/, '');
  
  const v1parts = v1.split('.').map(num => parseInt(num, 10) || 0);
  const v2parts = v2.split('.').map(num => parseInt(num, 10) || 0);
  
  // 确保两个版本号都有相同的长度
  const maxLength = Math.max(v1parts.length, v2parts.length);
  
  for (let i = 0; i < maxLength; i++) {
    const v1part = v1parts[i] || 0;
    const v2part = v2parts[i] || 0;
    
    console.log(`比较版本段 ${i}: ${v1part} vs ${v2part}`);
    
    if (v1part < v2part) {
      console.log(`版本 ${version1} < ${version2}`);
      return -1;
    }
    if (v1part > v2part) {
      console.log(`版本 ${version1} > ${version2}`);
      return 1;
    }
  }
  
  console.log(`版本 ${version1} = ${version2}`);
  return 0;
}

// 带超时的fetch函数
function fetchWithTimeout(url, timeout) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.setTimeout(timeout, () => {
      req.abort();
      reject(new Error('请求超时'));
    });
  });
}

// 修复获取远程版本信息函数
function fetchRemoteVersion() {
  return new Promise((resolve, reject) => {
    console.log('获取远程版本信息，URL:', UPDATE_CONFIG.checkUrl);
    
    const urlObj = new URL(UPDATE_CONFIG.checkUrl);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.get(UPDATE_CONFIG.checkUrl, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          console.log('收到远程版本响应，状态码:', res.statusCode);
          console.log('响应数据:', data.substring(0, 200) + '...');
          
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            return;
          }
          
          const versionInfo = JSON.parse(data);
          console.log('解析后的版本信息:', versionInfo);
          
          // 验证必要字段
          if (!versionInfo.version) {
            reject(new Error('版本信息格式错误：缺少version字段'));
            return;
          }
          
          resolve(versionInfo);
        } catch (error) {
          console.error('解析版本信息失败:', error);
          reject(new Error('解析版本信息失败: ' + error.message));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('请求版本信息失败:', error);
      reject(new Error('获取版本信息失败: ' + error.message));
    });
    
    req.setTimeout(15000, () => {
      req.abort();
      reject(new Error('获取版本信息超时'));
    });
  });
}

// 获取远程服务器列表
async function fetchRemoteServersList(attempt = 1) {
  const settings = loadAppSettings();
  const urls = [settings.serverListUrl, ...settings.fallbackUrls];
  
  for (let i = 0; i < urls.length; i++) {
    try {
      const url = urls[i];
      console.log(`尝试从 ${url} 获取服务器列表 (第${attempt}次尝试)`);
      
      const response = await fetchWithTimeout(url, settings.timeout);
      const serversList = JSON.parse(response);
      
      // 验证数据格式
      if (!serversList.servers || !Array.isArray(serversList.servers)) {
        throw new Error('服务器列表格式无效');
      }
      
      // 保存到本地缓存
      await saveServersListCache(serversList);
      
      return {
        success: true,
        data: serversList,
        source: url
      };
    } catch (error) {
      console.error(`从 ${urls[i]} 获取服务器列表失败:`, error.message);
      
      // 如果不是最后一个URL，继续尝试下一个
      if (i < urls.length - 1) {
        continue;
      }
      
      // 如果所有URL都失败了，且还有重试次数
      if (attempt < settings.retryAttempts) {
        console.log(`所有URL都失败，${attempt * 2}秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        return fetchRemoteServersList(attempt + 1);
      }
    }
  }
  
  // 所有尝试都失败，返回缓存的数据
  console.log('尝试使用本地缓存的服务器列表');
  const cachedData = await loadServersListCache();
  
  if (cachedData) {
    return {
      success: true,
      data: cachedData,
      source: 'cache',
      warning: '无法连接到远程服务器，使用本地缓存数据'
    };
  }
  
  return {
    success: false,
    error: '无法获取服务器列表，且没有可用的缓存数据'
  };
}

// 测试URL连接
async function testServerListUrl(url) {
  try {
    console.log(`测试URL: ${url}`);
    
    const response = await fetchWithTimeout(url, 10000); // 10秒超时
    const serversList = JSON.parse(response);
    
    // 验证数据格式
    if (!serversList.servers || !Array.isArray(serversList.servers)) {
      throw new Error('数据格式无效：缺少servers数组');
    }
    
    if (serversList.servers.length === 0) {
      throw new Error('服务器列表为空');
    }
    
    // 验证服务器数据结构
    const requiredFields = ['id', 'name', 'serverAddr', 'serverPort'];
    const firstServer = serversList.servers[0];
    const missingFields = requiredFields.filter(field => !firstServer[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`服务器数据缺少必要字段: ${missingFields.join(', ')}`);
    }
    
    return {
      success: true,
      data: serversList,
      message: `成功！找到 ${serversList.servers.length} 个服务器`,
      details: {
        version: serversList.version || '未知',
        lastUpdated: serversList.lastUpdated || '未知',
        serverCount: serversList.servers.length
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      details: {
        url: url,
        timestamp: new Date().toISOString()
      }
    };
  }
}

// 保存服务器列表缓存
async function saveServersListCache(serversList) {
  try {
    const appDataPath = getAppDataPath();
    const cacheDir = path.join(appDataPath, 'cache');
    
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    const cachePath = path.join(cacheDir, 'remote-servers.json');
    const cacheData = {
      ...serversList,
      cacheTime: new Date().toISOString()
    };
    
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
    console.log('服务器列表已缓存到本地');
  } catch (error) {
    console.error('保存服务器列表缓存失败:', error);
  }
}

// 加载服务器列表缓存
async function loadServersListCache() {
  try {
    const appDataPath = getAppDataPath();
    const cachePath = path.join(appDataPath, 'cache', 'remote-servers.json');
    
    if (!fs.existsSync(cachePath)) {
      return null;
    }
    
    const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    
    // 检查缓存是否过期（7天）
    const cacheTime = new Date(cacheData.cacheTime);
    const now = new Date();
    const daysDiff = (now - cacheTime) / (1000 * 60 * 60 * 24);
    
    if (daysDiff > 7) {
      console.log('缓存已过期');
      return null;
    }
    
    return cacheData;
  } catch (error) {
    console.error('加载服务器列表缓存失败:', error);
    return null;
  }
}

// 获取缓存状态
function getCacheStatus() {
  try {
    const appDataPath = getAppDataPath();
    const cachePath = path.join(appDataPath, 'cache', 'remote-servers.json');
    
    if (!fs.existsSync(cachePath)) {
      return {
        exists: false,
        message: '无缓存'
      };
    }
    
    const stats = fs.statSync(cachePath);
    const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    
    const cacheTime = new Date(cacheData.cacheTime);
    const now = new Date();
    const daysDiff = (now - cacheTime) / (1000 * 60 * 60 * 24);
    
    return {
      exists: true,
      cacheTime: cacheTime.toLocaleString('zh-CN'),
      isExpired: daysDiff > 7,
      daysSinceCache: Math.floor(daysDiff),
      size: Math.round(stats.size / 1024) + ' KB',
      serverCount: cacheData.servers ? cacheData.servers.length : 0
    };
  } catch (error) {
    return {
      exists: false,
      error: error.message
    };
  }
}

// 清空缓存
function clearCache() {
  try {
    const appDataPath = getAppDataPath();
    const cachePath = path.join(appDataPath, 'cache', 'remote-servers.json');
    
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
      return { success: true, message: '缓存已清空' };
    } else {
      return { success: false, message: '缓存文件不存在' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 修复检查更新函数
async function checkForUpdates(showNoUpdateMessage = false) {
  try {
    const currentVersion = app.getVersion();
    console.log('开始检查更新...');
    console.log('当前版本:', currentVersion);
    
    // 检查更新配置URL是否有效
    if (!UPDATE_CONFIG.checkUrl || UPDATE_CONFIG.checkUrl.includes('yourserver.com')) {
      const errorMsg = '更新检查未配置或使用默认配置，请设置有效的更新服务器';
      console.log(errorMsg);
      
      if (showNoUpdateMessage && mainWindow) {
        mainWindow.webContents.send('update-result', {
          hasUpdate: false,
          error: errorMsg
        });
      }
      return { hasUpdate: false, error: errorMsg };
    }
    
    const remoteVersionInfo = await fetchRemoteVersion();
    console.log('远程版本信息:', remoteVersionInfo);
    
    if (!remoteVersionInfo.version) {
      throw new Error('远程版本信息格式错误：缺少version字段');
    }
    
    const comparison = compareVersions(currentVersion, remoteVersionInfo.version);
    console.log('版本比较结果:', comparison);
    
    if (comparison < 0) {
      // 有新版本
      console.log('发现新版本');
      const updateInfo = {
        hasUpdate: true,
        currentVersion,
        remoteVersion: remoteVersionInfo.version,
        downloadUrl: remoteVersionInfo.downloadUrl,
        portableUrl: remoteVersionInfo.portableUrl,
        releaseNotes: remoteVersionInfo.releaseNotes || [],
        forceUpdate: remoteVersionInfo.forceUpdate || false
      };
      
      return updateInfo;
    } else {
      // 已是最新版本或版本更高
      console.log('当前已是最新版本');
      if (showNoUpdateMessage && mainWindow) {
        mainWindow.webContents.send('update-result', {
          hasUpdate: false,
          message: '当前已是最新版本！',
          currentVersion: currentVersion,
          remoteVersion: remoteVersionInfo.version
        });
      }
      return { 
        hasUpdate: false, 
        currentVersion: currentVersion,
        remoteVersion: remoteVersionInfo.version
      };
    }
  } catch (error) {
    console.error('检查更新失败:', error);
    const errorMsg = `检查更新失败: ${error.message}`;
    
    if (showNoUpdateMessage && mainWindow) {
      mainWindow.webContents.send('update-result', {
        hasUpdate: false,
        error: errorMsg
      });
    }
    return { hasUpdate: false, error: errorMsg };
  }
}

// 显示更新对话框
function showUpdateDialog(updateInfo) {
  if (!mainWindow) return;
  
  mainWindow.webContents.send('show-update-dialog', updateInfo);
}

// 改进的 frpc.exe 路径查找函数
function getFrpcPath() {
  const possiblePaths = [];
  
  if (app.isPackaged) {
    // 打包后的可能路径
    possiblePaths.push(
      path.join(process.resourcesPath, 'bin', 'frpc.exe'),
      path.join(process.resourcesPath, 'frpc.exe'),
      path.join(path.dirname(process.execPath), 'resources', 'bin', 'frpc.exe'),
      path.join(path.dirname(process.execPath), 'bin', 'frpc.exe'),
      path.join(path.dirname(process.execPath), 'frpc.exe')
    );
  } else {
    // 开发环境路径
    possiblePaths.push(
      path.join(__dirname, 'bin', 'frpc.exe'),
      path.join(__dirname, '..', 'bin', 'frpc.exe')
    );
  }
  
  // 查找第一个存在的文件
  for (const frpcPath of possiblePaths) {
    if (fs.existsSync(frpcPath)) {
      console.log(`Found frpc.exe at: ${frpcPath}`);
      return frpcPath;
    }
  }
  
  // 如果都找不到，返回第一个路径用于错误报告
  console.log(`frpc.exe not found. Searched paths:`, possiblePaths);
  return possiblePaths[0];
}

function createWindow() {
  // 尝试从配置文件加载窗口状态
  try {
    const configPath = path.join(app.getPath('userData'), 'window-state.json');
    if (fs.existsSync(configPath)) {
      windowState = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    console.log('Could not load window state:', error);
  }

  mainWindow = new BrowserWindow({
    width: windowState.width || 1300,
    height: windowState.height || 850,
    x: windowState.x,
    y: windowState.y,
    minWidth: 1200,
    minHeight: 750,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      cache: false,
      hardwareAcceleration: false,
      backgroundThrottling: false,
      enableRemoteModule: false,
      spellcheck: false
    },
    title: 'FRP Client GUI',
    show: false,
    autoHideMenuBar: true,
    resizable: true,
    maximizable: true
  });

  // 禁用所有缓存
  mainWindow.webContents.session.clearCache();
  mainWindow.webContents.session.clearStorageData();

  // 保存窗口状态
  mainWindow.on('close', () => {
    const bounds = mainWindow.getBounds();
    windowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y
    };
    
    try {
      const configPath = path.join(app.getPath('userData'), 'window-state.json');
      fs.writeFileSync(configPath, JSON.stringify(windowState));
    } catch (error) {
      console.log('Could not save window state:', error);
    }
  });

  mainWindow.loadFile('index.html');
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // 如果窗口太小，则设置为默认大小并居中
    if (windowState.width < 1200 || windowState.height < 750) {
      mainWindow.setSize(1300, 850);
      mainWindow.center();
    }
  });
  
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  initializeDirectories();
  createWindow();
  
  // 延迟5秒后自动检查更新，避免影响启动速度
  if (UPDATE_CONFIG.autoCheck) {
    setTimeout(() => {
      checkForUpdates(false);
    }, 5000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (frpcProcess) {
    try {
      frpcProcess.kill('SIGTERM');
    } catch (error) {
      console.error('Error killing frpc process:', error);
    }
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function initializeDirectories() {
  const appDataPath = getAppDataPath();
  const logsDir = path.join(appDataPath, 'logs');
  const cacheDir = path.join(appDataPath, 'cache');
  
  // 只创建logs和cache目录
  [logsDir, cacheDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

function generateFrpcConfig(config) {
  return `[common]
server_addr = ${config.serverAddr}
server_port = ${config.serverPort}
token = ${config.token}

[${config.serviceName || 'default'}]
type = ${config.type || 'tcp'}
local_ip = ${config.localIP}
local_port = ${config.localPort}
remote_port = ${config.remotePort}
`;
}

// ===========================================
// IPC 处理器 - 所有处理器都在这里统一注册，确保不重复
// ===========================================

// 在重新注册之前，先清除这些特定处理器已有的监听器
ipcMain.removeAllListeners('load-app-settings');
ipcMain.removeAllListeners('save-app-settings');
ipcMain.removeAllListeners('test-server-list-url');
ipcMain.removeAllListeners('get-cache-status');
ipcMain.removeAllListeners('clear-cache');
ipcMain.removeAllListeners('fetch-remote-servers');
ipcMain.removeAllListeners('check-frpc');
ipcMain.removeAllListeners('get-frpc-status');
ipcMain.removeAllListeners('start-frpc');
ipcMain.removeAllListeners('stop-frpc');
ipcMain.removeAllListeners('check-for-updates');
ipcMain.removeAllListeners('download-update');
ipcMain.removeAllListeners('get-app-version');
ipcMain.removeAllListeners('open-logs-folder');

// 设置相关处理器
ipcMain.handle('load-app-settings', async () => {
  console.log('主进程: 收到 load-app-settings 请求');
  const settings = loadAppSettings();
  console.log('主进程: 返回设置:', settings);
  return settings;
});

// 在其他 ipcMain.handle 后添加用户配置相关处理器
ipcMain.handle('load-user-config', async () => {
  console.log('主进程: 收到 load-user-config 请求');
  const config = loadUserConfig();
  console.log('主进程: 返回用户配置:', config);
  return config;
});

ipcMain.handle('save-user-config', async (event, config) => {
  console.log('主进程: 收到 save-user-config 请求:', config);
  const result = saveUserConfig(config);
  console.log('主进程: 保存用户配置结果:', result);
  return result;
});

ipcMain.handle('save-app-settings', async (event, settings) => {
  console.log('主进程: 收到 save-app-settings 请求:', settings);
  const success = saveAppSettings(settings);
  console.log('主进程: 保存结果:', success);
  return { success };
});

ipcMain.handle('test-server-list-url', async (event, url) => {
  console.log('主进程: 收到 test-server-list-url 请求:', url);
  const result = await testServerListUrl(url);
  console.log('主进程: 测试结果:', result);
  return result;
});

ipcMain.handle('get-cache-status', async () => {
  console.log('主进程: 收到 get-cache-status 请求');
  const status = getCacheStatus();
  console.log('主进程: 缓存状态:', status);
  return status;
});

ipcMain.handle('clear-cache', async () => {
  console.log('主进程: 收到 clear-cache 请求');
  const result = clearCache();
  console.log('主进程: 清空缓存结果:', result);
  return result;
});

// 服务器列表相关处理器
ipcMain.handle('fetch-remote-servers', async () => {
  console.log('主进程: 收到 fetch-remote-servers 请求');
  try {
    const result = await fetchRemoteServersList();
    console.log('主进程: fetchRemoteServersList 结果:', result);
    return result;
  } catch (error) {
    console.error('主进程: fetchRemoteServersList 错误:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// 检查 frpc.exe 文件
ipcMain.handle('check-frpc', async () => {
  const frpcPath = getFrpcPath();
  const exists = fs.existsSync(frpcPath);
  
  let fileInfo = null;
  if (exists) {
    try {
      const stats = fs.statSync(frpcPath);
      fileInfo = {
        size: stats.size,
        isFile: stats.isFile(),
        permissions: stats.mode
      };
    } catch (error) {
      fileInfo = { error: error.message };
    }
  }
  
  return {
    path: frpcPath,
    exists: exists,
    fileInfo: fileInfo,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    execPath: process.execPath
  };
});

// 获取 frpc 状态
ipcMain.handle('get-frpc-status', async () => {
  return {
    isRunning: frpcProcess !== null,
    pid: frpcProcess ? frpcProcess.pid : null
  };
});

// 启动 frpc
ipcMain.handle('start-frpc', async (event, config) => {
  try {
    // 停止现有进程
    if (frpcProcess) {
      try {
        frpcProcess.kill();
      } catch (error) {
        console.log('Error killing existing process:', error);
      }
      frpcProcess = null;
    }

    // 检查 frpc.exe 文件
    const frpcPath = getFrpcPath();
    
    if (!fs.existsSync(frpcPath)) {
      const diagnosticInfo = {
        frpcPath: frpcPath,
        isPackaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        execPath: process.execPath,
        dirname: __dirname,
        cwd: process.cwd()
      };
      
      throw new Error(`frpc.exe 文件未找到！\n` +
        `查找路径: ${frpcPath}\n` +
        `诊断信息: ${JSON.stringify(diagnosticInfo, null, 2)}`);
    }

    // 检查文件是否可执行
    try {
      fs.accessSync(frpcPath, fs.constants.F_OK | fs.constants.R_OK);
    } catch (error) {
      throw new Error(`frpc.exe 文件无法访问: ${error.message}`);
    }

    // 创建配置文件
    const appDataPath = getAppDataPath();
    const configContent = generateFrpcConfig(config);
    const configPath = path.join(appDataPath, 'temp_frpc.ini');
    fs.writeFileSync(configPath, configContent);

    console.log(`Starting frpc from: ${frpcPath}`);
    console.log(`Config file: ${configPath}`);
    console.log(`Working directory: ${appDataPath}`);

    // 启动 frpc 进程
    frpcProcess = spawn(frpcPath, ['-c', configPath], {
      cwd: appDataPath,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // 设置超时检查
    const startTimeout = setTimeout(() => {
      if (frpcProcess) {
        frpcProcess.kill();
        frpcProcess = null;
        if (mainWindow) {
          mainWindow.webContents.send('frpc-error', '启动超时，请检查配置或网络连接');
        }
      }
    }, 10000); // 10秒超时

    frpcProcess.stdout.on('data', (data) => {
      clearTimeout(startTimeout);
      const logMessage = data.toString().trim();
      if (logMessage && mainWindow) {
        mainWindow.webContents.send('frpc-log', logMessage);
        
        try {
          const logPath = path.join(appDataPath, 'logs', 'frpc.log');
          const timestamp = new Date().toISOString();
          fs.appendFileSync(logPath, `${timestamp}: ${logMessage}\n`);
        } catch (logError) {
          console.error('Failed to write log:', logError);
        }
      }
    });

    frpcProcess.stderr.on('data', (data) => {
      clearTimeout(startTimeout);
      const errorMessage = data.toString().trim();
      if (errorMessage && mainWindow) {
        mainWindow.webContents.send('frpc-error', errorMessage);
        
        try {
          const logPath = path.join(appDataPath, 'logs', 'frpc.log');
          const timestamp = new Date().toISOString();
          fs.appendFileSync(logPath, `${timestamp}: ERROR: ${errorMessage}\n`);
        } catch (logError) {
          console.error('Failed to write error log:', logError);
        }
      }
    });

    frpcProcess.on('close', (code) => {
      clearTimeout(startTimeout);
      if (mainWindow) {
        mainWindow.webContents.send('frpc-status', { 
          status: 'stopped', 
          code: code 
        });
      }
      frpcProcess = null;
      
      // 清理配置文件
      try {
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
        }
      } catch (error) {
        console.error('Failed to cleanup config file:', error);
      }
    });

    frpcProcess.on('error', (error) => {
      clearTimeout(startTimeout);
      console.error('frpc process error:', error);
      
      let errorMessage = `进程启动失败: ${error.message}`;
      if (error.code === 'ENOENT') {
        errorMessage += '\nfrpc.exe 文件不存在或无法执行';
      } else if (error.code === 'EACCES') {
        errorMessage += '\n没有执行权限';
      }
      
      if (mainWindow) {
        mainWindow.webContents.send('frpc-error', errorMessage);
      }
      frpcProcess = null;
    });

    if (mainWindow) {
      mainWindow.webContents.send('frpc-status', { 
        status: 'started' 
      });
    }

    return { success: true, message: 'FRP客户端启动成功' };
  } catch (error) {
    console.error('Failed to start frpc:', error);
    return { success: false, message: error.message };
  }
});

// 停止 frpc
ipcMain.handle('stop-frpc', async () => {
  try {
    if (frpcProcess) {
      frpcProcess.kill();
      frpcProcess = null;
      return { success: true, message: 'FRP客户端已停止' };
    }
    return { success: false, message: 'FRP客户端未运行' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// 修复更新相关处理器
ipcMain.handle('check-for-updates', async (event, manual = false) => {
  console.log('主进程: 收到检查更新请求, manual =', manual);
  
  try {
    const updateInfo = await checkForUpdates(manual);
    console.log('主进程: 检查更新结果:', updateInfo);
    
    if (updateInfo.hasUpdate) {
      // 发现新版本，显示更新对话框
      showUpdateDialog(updateInfo);
    } else if (manual) {
      // 手动检查且无更新，发送结果给渲染进程
      if (mainWindow) {
        mainWindow.webContents.send('update-result', {
          hasUpdate: false,
          message: updateInfo.error || '当前已是最新版本！',
          currentVersion: updateInfo.currentVersion,
          remoteVersion: updateInfo.remoteVersion
        });
      }
    }
    
    return updateInfo;
  } catch (error) {
    console.error('主进程: 检查更新异常:', error);
    const errorResult = {
      hasUpdate: false,
      error: error.message
    };
    
    if (manual && mainWindow) {
      mainWindow.webContents.send('update-result', errorResult);
    }
    
    return errorResult;
  }
});

ipcMain.handle('download-update', async (event, downloadUrl) => {
  try {
    await shell.openExternal(downloadUrl);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// 文件夹打开处理器
ipcMain.handle('open-logs-folder', async () => {
  const appDataPath = getAppDataPath();
  const { shell } = require('electron');
  await shell.openPath(path.join(appDataPath, 'logs'));
});