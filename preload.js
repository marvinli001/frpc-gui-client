const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // FRP相关
  startFrpc: (config) => ipcRenderer.invoke('start-frpc', config),
  stopFrpc: () => ipcRenderer.invoke('stop-frpc'),
  getFrpcStatus: () => ipcRenderer.invoke('get-frpc-status'),
  checkFrpc: () => ipcRenderer.invoke('check-frpc'),
  
  // 远程服务器列表相关
  fetchRemoteServers: () => {
    console.log('preload: 调用 fetchRemoteServers');
    return ipcRenderer.invoke('fetch-remote-servers');
  },
  autoFetchServers: () => {
    console.log('preload: 调用 autoFetchServers');
    return ipcRenderer.invoke('auto-fetch-servers');
  },
  
  // 设置相关
  loadAppSettings: () => ipcRenderer.invoke('load-app-settings'),
  saveAppSettings: (settings) => ipcRenderer.invoke('save-app-settings', settings),
  testServerListUrl: (url) => ipcRenderer.invoke('test-server-list-url', url),
  getCacheStatus: () => ipcRenderer.invoke('get-cache-status'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),

  // 用户配置相关 - 新增
  loadUserConfig: () => ipcRenderer.invoke('load-user-config'),
  saveUserConfig: (config) => ipcRenderer.invoke('save-user-config', config),
  
  // TCP Ping 状态检测相关 - 新增
  pingServer: (serverAddr, serverPort, timeout) => ipcRenderer.invoke('ping-server', serverAddr, serverPort, timeout),
  checkServersStatus: (servers, options) => ipcRenderer.invoke('check-servers-status', servers, options),
  
  // 更新相关API
  checkForUpdates: (manual) => ipcRenderer.invoke('check-for-updates', manual),
  downloadUpdate: (url) => ipcRenderer.invoke('download-update', url),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // 文件夹操作
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  
  // 监听事件
  onFrpcLog: (callback) => ipcRenderer.on('frpc-log', callback),
  onFrpcError: (callback) => ipcRenderer.on('frpc-error', callback),
  onFrpcStatus: (callback) => ipcRenderer.on('frpc-status', callback),
  onUpdateResult: (callback) => ipcRenderer.on('update-result', callback),
  onShowUpdateDialog: (callback) => ipcRenderer.on('show-update-dialog', callback),
  onServerStatusProgress: (callback) => ipcRenderer.on('server-status-progress', callback),
  
  // 移除监听器
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});

console.log('preload.js 已加载');