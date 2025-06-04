class FrpcGuiApp {
    constructor() {
        this.isConnected = false;
        this.currentUpdateInfo = null;
        this.remoteServersData = null;
        this.selectedRemoteServer = null;
        this.serversLoaded = false;
        this.appSettings = null;
        this.currentServer = null; // 添加当前选中的服务器
        this.userConfig = null; // 新增：用户配置
        this.configSaveTimeout = null; // 新增：配置保存定时器
        this.init();
    }

    async init() {
        console.log('FrpcGuiApp 初始化开始');
        this.bindEvents();
        this.updateStatus();
        this.setupLogListeners();
        this.addManagementButtons();
        await this.checkFrpcFile();
        await this.initializeVersion();
        await this.loadAppSettings();
        await this.loadUserConfig(); // 新增：加载用户配置
        this.setupUpdateListeners();
        this.setupRemoteServersListeners();
        this.setupSettingsListeners();
        this.setupUserConfigListeners(); // 新增：设置用户配置监听
        console.log('FrpcGuiApp 初始化完成');
        
        // 启动时自动获取服务器列表
        // await this.autoLoadServers(); // 暂时注释掉自动加载，手动测试
    }

        // 启动时自动加载服务器列表 - 添加预置密码说明
    async autoLoadServers() {
        try {
            this.addLogEntry('info', '正在获取服务器列表...');
            
            const result = await window.electronAPI.autoFetchServers();
            
            if (result.success) {
                this.serversLoaded = true;
                this.populateServerSelect(result.data.servers);
                this.setDefaultSettings(result.data.defaultSettings);
                
                // 统计预置密码服务器数量
                const presetPasswordCount = result.data.servers.filter(server => 
                    server.auth && server.auth.presetToken
                ).length;
                
                if (result.warning) {
                    this.addLogEntry('warning', result.warning);
                } else {
                    this.addLogEntry('info', 
                        `成功加载 ${result.data.servers.length} 个服务器 (来源: ${result.source})，` +
                        `其中 ${presetPasswordCount} 个支持自动登录`
                    );
                }
                
                // 显示使用提示
                if (presetPasswordCount > 0) {
                    this.addLogEntry('info', 
                        `💡 提示: 带有 🔑 图标的服务器支持自动登录，选择后会自动填充密码`
                    );
                }
                
                // 如果没有服务器，显示提示
                if (!result.data.servers || result.data.servers.length === 0) {
                    this.addLogEntry('warning', '未找到可用的服务器，请点击"获取服务器列表"按钮手动获取');
                }
            } else {
                this.addLogEntry('error', '获取服务器列表失败: ' + result.error);
                this.addLogEntry('info', '请点击"获取服务器列表"按钮手动获取');
            }
        } catch (error) {
            this.addLogEntry('error', '自动获取服务器列表失败: ' + error.message);
            this.addLogEntry('info', '请点击"获取服务器列表"按钮手动获取');
        }
    }

    // 新增：加载用户配置
    async loadUserConfig() {
        try {
            console.log('开始加载用户配置');
            this.userConfig = await window.electronAPI.loadUserConfig();
            console.log('加载的用户配置:', this.userConfig);
            
            // 应用配置到表单
            this.applyUserConfigToForm();
            this.addLogEntry('info', '已加载上次的配置设置');
        } catch (error) {
            console.error('加载用户配置失败:', error);
            // 使用默认配置
            this.userConfig = {
                localPort: 3389,
                remotePort: 6000,
                localIP: '127.0.0.1',
                type: 'tcp',
                serviceName: 'remote-desktop'
            };
        }
    }

    // 新增：将用户配置应用到表单
    applyUserConfigToForm() {
        if (!this.userConfig) return;
        
        const fields = [
            { id: 'local-ip', value: this.userConfig.localIP },
            { id: 'local-port', value: this.userConfig.localPort },
            { id: 'remote-port', value: this.userConfig.remotePort },
            { id: 'type', value: this.userConfig.type },
            { id: 'service-name', value: this.userConfig.serviceName }
        ];
        
        fields.forEach(field => {
            const element = document.getElementById(field.id);
            if (element && field.value && !element.value) {
                element.value = field.value;
                console.log(`恢复字段 ${field.id}: ${field.value}`);
            }
        });
    }

    // 新增：保存用户配置（防抖）
    saveUserConfigDebounced() {
        // 清除之前的定时器
        if (this.configSaveTimeout) {
            clearTimeout(this.configSaveTimeout);
        }
        
        // 设置新的定时器，1秒后保存
        this.configSaveTimeout = setTimeout(() => {
            this.saveUserConfig();
        }, 1000);
    }

    // 新增：立即保存用户配置
    async saveUserConfig() {
        try {
            const config = this.getUserConfigFromForm();
            console.log('保存用户配置:', config);
            
            const result = await window.electronAPI.saveUserConfig(config);
            if (result.success) {
                this.userConfig = config;
                console.log('用户配置保存成功');
            } else {
                console.error('保存用户配置失败:', result.error);
            }
        } catch (error) {
            console.error('保存用户配置异常:', error);
        }
    }

    // 新增：从表单获取用户配置
    getUserConfigFromForm() {
        return {
            localIP: document.getElementById('local-ip').value.trim() || '127.0.0.1',
            localPort: parseInt(document.getElementById('local-port').value) || 3389,
            remotePort: parseInt(document.getElementById('remote-port').value) || 6000,
            type: document.getElementById('type').value || 'tcp',
            serviceName: document.getElementById('service-name').value.trim() || 'remote-desktop'
        };
    }

    // 新增：设置用户配置相关事件监听
    setupUserConfigListeners() {
        console.log('设置用户配置监听器');
        
        // 监听配置字段变化
        const configFields = ['local-ip', 'local-port', 'remote-port', 'type', 'service-name'];
        
        configFields.forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) {
                // 监听输入变化
                element.addEventListener('input', () => {
                    this.saveUserConfigDebounced();
                });
                
                // 监听选择变化（针对select元素）
                element.addEventListener('change', () => {
                    this.saveUserConfigDebounced();
                });
                
                console.log(`已绑定配置监听器: ${fieldId}`);
            } else {
                console.warn(`未找到配置字段: ${fieldId}`);
            }
        });
    }

    // 加载应用设置
    async loadAppSettings() {
        try {
            console.log('开始加载应用设置');
            this.appSettings = await window.electronAPI.loadAppSettings();
            console.log('加载的应用设置:', this.appSettings);
        } catch (error) {
            console.error('加载应用设置失败:', error);
            // 使用默认设置
            this.appSettings = {
                serverListUrl: 'https://raw.githubusercontent.com/marvinli001/frpc-gui-client/main/remote-servers.json',
                timeout: 15000,
                retryAttempts: 3
            };
        }
    }

    // 设置相关事件监听
    setupSettingsListeners() {
        console.log('设置相关事件监听器');
        
        // 设置按钮
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            console.log('找到设置按钮，绑定事件');
            settingsBtn.addEventListener('click', (e) => {
                console.log('设置按钮被点击');
                e.preventDefault();
                this.showSettingsModal();
            });
        } else {
            console.error('未找到设置按钮 #settings-btn');
        }

        // 设置对话框关闭
        const closeSettingsBtn = document.querySelector('.modal-close-settings');
        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', () => {
                this.hideSettingsModal();
            });
        }

        // 测试URL按钮
        const testUrlBtn = document.getElementById('test-url-btn');
        if (testUrlBtn) {
            testUrlBtn.addEventListener('click', () => {
                this.testServerListUrl();
            });
        }

        // 建议链接按钮
        document.querySelectorAll('.btn-suggestion').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = e.target.dataset.url;
                const urlInput = document.getElementById('server-list-url');
                if (urlInput) {
                    urlInput.value = url;
                }
            });
        });

        // 清空缓存按钮
        const clearCacheBtn = document.getElementById('clear-cache-btn');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
                this.clearCache();
            });
        }

        // 保存设置按钮
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', () => {
                this.saveSettings();
            });
        }

        // 取消设置按钮
        const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
        if (cancelSettingsBtn) {
            cancelSettingsBtn.addEventListener('click', () => {
                this.hideSettingsModal();
            });
        }

        // 点击模态框外部关闭
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target.id === 'settings-modal') {
                    this.hideSettingsModal();
                }
            });
        }
    }

    // 设置远程服务器相关事件监听
    setupRemoteServersListeners() {
        console.log('设置远程服务器事件监听器');
        
        // 获取服务器列表按钮
        const fetchBtn = document.getElementById('fetch-servers-btn');
        if (fetchBtn) {
            console.log('找到获取服务器按钮，绑定事件');
            fetchBtn.addEventListener('click', (e) => {
                console.log('获取服务器按钮被点击');
                e.preventDefault();
                this.fetchRemoteServers();
            });
        } else {
            console.error('未找到获取服务器按钮 #fetch-servers-btn');
        }

        // 服务器列表对话框事件
        const closeServersBtn = document.querySelector('.modal-close-servers');
        if (closeServersBtn) {
            closeServersBtn.addEventListener('click', () => {
                this.hideServersModal();
            });
        }

        const applyBtn = document.getElementById('apply-servers-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.applyRemoteServers();
            });
        }

        const cancelBtn = document.getElementById('cancel-servers-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.hideServersModal();
            });
        }

        // 点击模态框外部关闭
        const serversModal = document.getElementById('servers-modal');
        if (serversModal) {
            serversModal.addEventListener('click', (e) => {
                if (e.target.id === 'servers-modal') {
                    this.hideServersModal();
                }
            });
        }
    }

    // 显示设置对话框
    async showSettingsModal() {
        console.log('显示设置对话框');
        
        try {
            // 填充当前设置
            const urlInput = document.getElementById('server-list-url');
            if (urlInput && this.appSettings) {
                urlInput.value = this.appSettings.serverListUrl || '';
                console.log('填充URL:', urlInput.value);
            }

            // 更新缓存状态
            await this.updateCacheStatus();

            // 显示对话框
            const modal = document.getElementById('settings-modal');
            if (modal) {
                modal.style.display = 'flex';
                console.log('设置对话框已显示');
            } else {
                console.error('未找到设置对话框');
            }

            // 清空测试结果
            const testResult = document.getElementById('test-result');
            if (testResult) {
                testResult.style.display = 'none';
            }
        } catch (error) {
            console.error('显示设置对话框失败:', error);
            this.addLogEntry('error', '显示设置对话框失败: ' + error.message);
        }
    }

    // 隐藏设置对话框
    hideSettingsModal() {
        console.log('隐藏设置对话框');
        const modal = document.getElementById('settings-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // 手动获取远程服务器列表
    async fetchRemoteServers() {
        console.log('开始手动获取远程服务器列表');
        
        try {
            this.setFetchServersButtonState(true);
            this.addLogEntry('info', '正在获取远程服务器列表...');
            
            // 检查API是否存在
            if (!window.electronAPI || !window.electronAPI.fetchRemoteServers) {
                throw new Error('fetchRemoteServers API 不可用');
            }
            
            console.log('调用 fetchRemoteServers API');
            const result = await window.electronAPI.fetchRemoteServers();
            console.log('获取服务器列表结果:', result);
            
            if (result.success) {
                this.remoteServersData = result.data;
                this.showServersModal(result);
                
                if (result.warning) {
                    this.addLogEntry('warning', result.warning);
                } else {
                    this.addLogEntry('info', `成功获取服务器列表 (来源: ${result.source})`);
                }
            } else {
                this.addLogEntry('error', '获取服务器列表失败: ' + result.error);
            }
        } catch (error) {
            console.error('获取服务器列表异常:', error);
            this.addLogEntry('error', '获取服务器列表失败: ' + error.message);
        } finally {
            this.setFetchServersButtonState(false);
        }
    }

    // 更新缓存状态
    async updateCacheStatus() {
        try {
            console.log('更新缓存状态');
            
            if (!window.electronAPI.getCacheStatus) {
                console.error('getCacheStatus API 不可用');
                return;
            }
            
            const cacheStatus = await window.electronAPI.getCacheStatus();
            console.log('缓存状态:', cacheStatus);
            
            const statusEl = document.getElementById('cache-status');
            const timeEl = document.getElementById('cache-time');
            
            if (cacheStatus.exists) {
                if (statusEl) {
                    const statusText = cacheStatus.isExpired ? 
                        `已过期 (${cacheStatus.serverCount} 个服务器)` : 
                        `有效 (${cacheStatus.serverCount} 个服务器)`;
                    statusEl.textContent = statusText;
                    statusEl.className = cacheStatus.isExpired ? 'status-offline' : 'status-online';
                }
                
                if (timeEl) {
                    timeEl.textContent = `${cacheStatus.cacheTime} (${cacheStatus.daysSinceCache} 天前)`;
                }
            } else {
                if (statusEl) {
                    statusEl.textContent = cacheStatus.error || '无缓存';
                    statusEl.className = '';
                }
                if (timeEl) {
                    timeEl.textContent = '-';
                }
            }
        } catch (error) {
            console.error('更新缓存状态失败:', error);
        }
    }

    // 测试服务器列表URL
    async testServerListUrl() {
        console.log('测试服务器列表URL');
        
        const urlInput = document.getElementById('server-list-url');
        const testBtn = document.getElementById('test-url-btn');
        const testResult = document.getElementById('test-result');
        
        if (!urlInput || !testBtn || !testResult) {
            console.error('找不到必要的DOM元素');
            return;
        }
        
        const url = urlInput.value.trim();
        
        if (!url) {
            this.showTestResult('error', '请输入服务器列表URL');
            return;
        }
        
        try {
            // 设置加载状态
            testBtn.disabled = true;
            testBtn.textContent = '🔄 测试中...';
            this.showTestResult('loading', '正在测试连接...');
            
            if (!window.electronAPI.testServerListUrl) {
                throw new Error('testServerListUrl API 不可用');
            }
            
            const result = await window.electronAPI.testServerListUrl(url);
            console.log('URL测试结果:', result);
            
            if (result.success) {
                const message = `${result.message}\n` +
                    `版本: ${result.details.version}\n` +
                    `更新时间: ${result.details.lastUpdated}\n` +
                    `服务器数量: ${result.details.serverCount}`;
                
                this.showTestResult('success', message);
                this.addLogEntry('info', `URL测试成功: ${url}`);
            } else {
                this.showTestResult('error', `连接失败: ${result.error}`);
                this.addLogEntry('error', `URL测试失败: ${result.error}`);
            }
        } catch (error) {
            console.error('URL测试异常:', error);
            this.showTestResult('error', `测试失败: ${error.message}`);
            this.addLogEntry('error', `URL测试异常: ${error.message}`);
        } finally {
            testBtn.disabled = false;
            testBtn.textContent = '🔍 测试连接';
        }
    }

    // 显示测试结果
    showTestResult(type, message) {
        const testResult = document.getElementById('test-result');
        if (!testResult) return;
        
        testResult.className = `test-result ${type}`;
        testResult.textContent = message;
        testResult.style.display = 'block';
    }

    // 清空缓存
    async clearCache() {
        try {
            console.log('清空缓存');
            
            if (!window.electronAPI.clearCache) {
                throw new Error('clearCache API 不可用');
            }
            
            const result = await window.electronAPI.clearCache();
            console.log('清空缓存结果:', result);
            
            if (result.success) {
                this.addLogEntry('info', result.message);
                await this.updateCacheStatus();
            } else {
                this.addLogEntry('error', result.error || result.message);
            }
        } catch (error) {
            console.error('清空缓存失败:', error);
            this.addLogEntry('error', '清空缓存失败: ' + error.message);
        }
    }

    // 保存设置
    async saveSettings() {
        try {
            console.log('保存设置');
            
            const urlInput = document.getElementById('server-list-url');
            if (!urlInput) {
                console.error('找不到URL输入框');
                return;
            }
            
            const newUrl = urlInput.value.trim();
            
            if (!newUrl) {
                this.addLogEntry('error', '请输入有效的服务器列表URL');
                return;
            }
            
            if (!window.electronAPI.saveAppSettings) {
                throw new Error('saveAppSettings API 不可用');
            }
            
            // 更新设置
            const newSettings = {
                ...this.appSettings,
                serverListUrl: newUrl
            };
            
            console.log('保存新设置:', newSettings);
            const result = await window.electronAPI.saveAppSettings(newSettings);
            console.log('保存设置结果:', result);
            
            if (result.success) {
                this.appSettings = newSettings;
                this.addLogEntry('info', '设置已保存');
                this.hideSettingsModal();
                
                // 提示用户重新获取服务器列表
                this.addLogEntry('info', '请重新获取服务器列表以应用新设置');
            } else {
                this.addLogEntry('error', '保存设置失败');
            }
        } catch (error) {
            console.error('保存设置失败:', error);
            this.addLogEntry('error', '保存设置失败: ' + error.message);
        }
    }

    // 显示服务器列表对话框
    showServersModal(result) {
        console.log('显示服务器列表对话框', result);
        
        const data = result.data;
        
        // 更新信息
        const versionEl = document.getElementById('servers-version');
        const updatedEl = document.getElementById('servers-updated');
        const sourceEl = document.getElementById('servers-source');
        
        if (versionEl) versionEl.textContent = data.version || '-';
        if (updatedEl) updatedEl.textContent = 
            data.lastUpdated ? new Date(data.lastUpdated).toLocaleString('zh-CN') : '-';
        if (sourceEl) sourceEl.textContent = result.source === 'cache' ? '本地缓存' : '远程服务器';
        
        // 显示通知
        if (data.notice) {
            const noticeEl = document.getElementById('servers-notice');
            if (noticeEl) {
                noticeEl.textContent = data.notice;
                noticeEl.style.display = 'block';
            }
        }
        
        // 生成服务器列表
        this.renderServersList(data.servers);
        
        const modal = document.getElementById('servers-modal');
        if (modal) {
            modal.style.display = 'flex';
        } else {
            console.error('未找到服务器模态框');
        }
    }

    // 更新渲染服务器列表 - 显示密码状态
    renderServersList(servers) {
        console.log('渲染服务器列表', servers);
        
        const container = document.getElementById('servers-list-container');
        if (!container) {
            console.error('未找到服务器列表容器');
            return;
        }
        
        container.innerHTML = '';
        
        servers.forEach(server => {
            const serverItem = document.createElement('div');
            serverItem.className = 'server-item';
            serverItem.dataset.serverId = server.id;
            
            const statusClass = server.status === 'online' ? 'status-online' : 
                               server.status === 'maintenance' ? 'status-maintenance' : 'status-offline';
            
            const statusText = server.status === 'online' ? '在线' :
                              server.status === 'maintenance' ? '维护中' : '离线';
            
            const usersInfo = server.status === 'online' ? 
                `${server.currentUsers || 0}/${server.maxUsers || '∞'}` : '-';
            
            // 密码状态
            const hasPresetPassword = server.auth && server.auth.presetToken;
            const passwordStatus = hasPresetPassword ? '🔑 自动登录' : '🔓 需要密码';
            const passwordClass = hasPresetPassword ? 'preset-password' : 'manual-password';
            
            serverItem.innerHTML = `
                <div class="server-item-header">
                    <span class="server-name">${server.name}</span>
                    <div class="server-status-group">
                        <span class="server-status ${statusClass}">${statusText}</span>
                        <span class="password-status ${passwordClass}">${passwordStatus}</span>
                    </div>
                </div>
                <div class="server-details">
                    <div><strong>地区:</strong> ${server.region || '-'}</div>
                    <div><strong>用户:</strong> ${usersInfo}</div>
                    <div><strong>地址:</strong> ${server.serverAddr}:${server.serverPort}</div>
                    <div><strong>类型:</strong> ${(server.supportedTypes || []).join(', ')}</div>
                </div>
                <div class="server-description">${server.description || ''}</div>
            `;
            
            // 点击选择服务器
            serverItem.addEventListener('click', () => {
                // 移除其他选中状态
                container.querySelectorAll('.server-item').forEach(item => {
                    item.classList.remove('selected');
                });
                
                // 选中当前服务器
                serverItem.classList.add('selected');
                this.selectedRemoteServer = server;
            });
            
            container.appendChild(serverItem);
        });
    }

    // 应用远程服务器列表 - 统计预置密码服务器
    async applyRemoteServers() {
        try {
            if (!this.remoteServersData) {
                this.addLogEntry('error', '没有可用的服务器数据');
                return;
            }
            
            this.addLogEntry('info', '正在应用服务器列表...');
            
            // 直接使用远程数据
            this.populateServerSelect(this.remoteServersData.servers);
            this.setDefaultSettings(this.remoteServersData.defaultSettings);
            this.serversLoaded = true;
            
            // 统计预置密码服务器数量
            const presetPasswordCount = this.remoteServersData.servers.filter(server => 
                server.auth && server.auth.presetToken
            ).length;
            
            this.addLogEntry('info', 
                `成功应用服务器列表，共 ${this.remoteServersData.servers.length} 个服务器，` +
                `其中 ${presetPasswordCount} 个支持自动登录`
            );
            
            // 如果有选中的服务器，自动选择它
            if (this.selectedRemoteServer) {
                const select = document.getElementById('server-select');
                select.value = this.selectedRemoteServer.id;
                this.onServerSelect(this.selectedRemoteServer.id);
            }
            
            this.hideServersModal();
        } catch (error) {
            this.addLogEntry('error', '应用服务器列表失败: ' + error.message);
        }
    }

    // 开始连接 - 添加预置密码日志
    async startConnection() {
        try {
            const config = this.getConnectionConfig();
            if (!this.validateConfig(config)) {
                return;
            }

            // 记录连接信息
            if (this.currentServer && this.currentServer.auth && this.currentServer.auth.presetToken) {
                this.addLogEntry('info', `🔑 使用预置密码连接到: ${this.currentServer.name}`);
            } else {
                this.addLogEntry('info', `🔓 使用手动输入密码连接到: ${config.serverAddr}`);
            }

            const result = await window.electronAPI.startFrpc(config);
            
            if (result.success) {
                this.addLogEntry('info', result.stopConnectionessage);
                this.updateStatus();
            } else {
                this.addLogEntry('error', result.message);
            }
        } catch (error) {
            this.addLogEntry('error', '启动连接失败: ' + error.message);
        }
    }

        // 新增：重置配置到默认值
    resetConfigToDefault() {
        const defaultConfig = {
            localIP: '127.0.0.1',
            localPort: 3389,
            remotePort: 6000,
            type: 'tcp',
            serviceName: 'remote-desktop'
        };
        
        Object.keys(defaultConfig).forEach(key => {
            const fieldId = key.replace(/([A-Z])/g, '-$1').toLowerCase();
            const element = document.getElementById(fieldId);
            if (element) {
                element.value = defaultConfig[key];
            }
        });
        
        this.saveUserConfig();
        this.addLogEntry('info', '配置已重置为默认值');
    }

    // 隐藏服务器列表对话框
    hideServersModal() {
        const modal = document.getElementById('servers-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        this.remoteServersData = null;
        this.selectedRemoteServer = null;
    }

    // 设置获取服务器按钮状态
    setFetchServersButtonState(fetching) {
        const btn = document.getElementById('fetch-servers-btn');
        if (btn) {
            if (fetching) {
                btn.disabled = true;
                btn.innerHTML = '🔄 获取中...';
            } else {
                btn.disabled = false;
                btn.innerHTML = '🌐 获取服务器列表';
            }
        }
    }

    // 处理令牌字段
    handleTokenField(server) {
        const tokenField = document.getElementById('token');
        const tokenContainer = document.getElementById('token-container');
        
        if (server.auth && server.auth.presetToken) {
            // 如果有预置密码，自动填充并设为只读
            tokenField.value = server.auth.presetToken;
            tokenField.readOnly = true;
            tokenField.type = 'text'; // 改为文本类型以显示预置状态
            tokenField.dataset.preset = 'true';
            tokenContainer.className = 'token-status-indicator preset';
            
            // 特殊样式
            tokenField.style.backgroundColor = '#f8f9fa';
            tokenField.style.color = '#28a745';
            tokenField.style.borderColor = '#28a745';
            tokenField.placeholder = '✓ 已使用预置密码';
            
            this.addLogEntry('info', `✓ 已选择服务器: ${server.name} (使用预置密码)`);
            this.showTokenStatus('preset', '密码已预置，无需手动输入');
            
        } else {
            // 没有预置密码，需要用户输入
            tokenField.value = '';
            tokenField.readOnly = false;
            tokenField.type = 'password'; // 恢复密码类型
            tokenField.dataset.preset = 'false';
            tokenContainer.className = 'token-status-indicator manual';
            
            // 恢复默认样式
            tokenField.style.backgroundColor = '';
            tokenField.style.color = '';
            tokenField.style.borderColor = '';
            
            if (server.auth && server.auth.tokenHint) {
                tokenField.placeholder = server.auth.tokenHint;
            } else {
                tokenField.placeholder = '请联系管理员获取令牌';
            }
            
            this.addLogEntry('info', `⚠ 已选择服务器: ${server.name} (需要手动输入密码)`);
            this.showTokenStatus('manual', '请手动输入访问令牌');
        }
    }

    // 显示令牌状态
    showTokenStatus(type, message) {
        const statusText = document.getElementById('token-status-text');
        if (statusText) {
            statusText.textContent = message;
            statusText.className = `token-status-text ${type}`;
            statusText.style.display = 'block';
            
            // 3秒后自动隐藏
            setTimeout(() => {
                statusText.style.display = 'none';
            }, 3000);
        }
    }

    // 清空服务器选择
    clearServerSelection() {
        this.currentServer = null;
        
        document.getElementById('server-addr').value = '';
        document.getElementById('server-port').value = '';
        
        const tokenField = document.getElementById('token');
        const tokenContainer = document.getElementById('token-container');
        
        tokenField.value = '';
        tokenField.readOnly = false;
        tokenField.type = 'password';
        tokenField.dataset.preset = 'false';
        tokenField.style.backgroundColor = '';
        tokenField.style.color = '';
        tokenField.style.borderColor = '';
        tokenField.placeholder = '请联系管理员获取令牌';
        
        tokenContainer.className = 'token-status-indicator';
        
        this.hideServerInfo();
    }

    // 更新服务器下拉列表填充函数 - 显示密码状态
    populateServerSelect(servers) {
        const select = document.getElementById('server-select');
        if (!select) return;
        
        select.innerHTML = '<option value="">请选择服务器...</option>';
        
        if (!servers || servers.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '暂无可用服务器，请获取服务器列表';
            option.disabled = true;
            select.appendChild(option);
            return;
        }
        
        servers.forEach(server => {
            const option = document.createElement('option');
            option.value = server.id;
            
            const statusEmoji = server.status === 'online' ? '🟢' :
                               server.status === 'maintenance' ? '🟡' : '🔴';
            
            // 添加密码状态标识
            const passwordEmoji = (server.auth && server.auth.presetToken) ? '🔑' : '🔓';
            
            option.textContent = `${statusEmoji}${passwordEmoji} ${server.name} (${server.serverAddr})`;
            option.dataset.server = JSON.stringify(server);
            select.appendChild(option);
        });
    }

    // 设置默认配置
    setDefaultSettings(defaultSettings) {
        if (!defaultSettings) return;
        
        const localIpEl = document.getElementById('local-ip');
        const localPortEl = document.getElementById('local-port');
        const remotePortEl = document.getElementById('remote-port');
        const typeEl = document.getElementById('type');
        
        // 优先使用用户配置，如果没有则使用远程默认设置
        if (localIpEl && !localIpEl.value) {
            localIpEl.value = this.userConfig?.localIP || defaultSettings.localIP || '127.0.0.1';
        }
        if (localPortEl && !localPortEl.value) {
            localPortEl.value = this.userConfig?.localPort || defaultSettings.localPort || 3389;
        }
        if (remotePortEl && !remotePortEl.value) {
            remotePortEl.value = this.userConfig?.remotePort || defaultSettings.remotePort || 6000;
        }
        if (typeEl && !typeEl.value) {
            typeEl.value = this.userConfig?.type || defaultSettings.type || 'tcp';
        }
    }

    // 更新服务器选择处理函数 - 支持预置密码
    onServerSelect(serverId) {
        const select = document.getElementById('server-select');
        const selectedOption = select.querySelector(`option[value="${serverId}"]`);
        
        if (selectedOption && selectedOption.dataset.server) {
            const server = JSON.parse(selectedOption.dataset.server);
            this.currentServer = server;
            
            // 自动填充服务器信息
            document.getElementById('server-addr').value = server.serverAddr;
            document.getElementById('server-port').value = server.serverPort;
            
            // 显示服务器详细信息
            this.showServerInfo(server);
            
            // 处理令牌字段 - 支持预置密码
            this.handleTokenField(server);
            
        } else {
            // 清空字段
            this.clearServerSelection();
        }
    }

    // 更新显示服务器信息 - 包含密码状态
    showServerInfo(server) {
        const infoEl = document.getElementById('server-info');
        if (!infoEl) return;
        
        const regionEl = document.getElementById('server-region');
        const statusEl = document.getElementById('server-status');
        const usersEl = document.getElementById('server-users');
        const descEl = document.getElementById('server-description');
        
        if (regionEl) regionEl.textContent = server.region || '-';
        
        if (statusEl) {
            const statusText = server.status === 'online' ? '在线' :
                              server.status === 'maintenance' ? '维护中' : '离线';
            const statusClass = server.status === 'online' ? 'status-online' :
                               server.status === 'maintenance' ? 'status-maintenance' : 'status-offline';
            
            statusEl.textContent = statusText;
            statusEl.className = statusClass;
        }
        
        if (usersEl) {
            const usersInfo = server.status === 'online' ? 
                `${server.currentUsers || 0}/${server.maxUsers || '∞'}` : '-';
            usersEl.textContent = usersInfo;
        }
        
        if (descEl) {
            let description = server.description || '-';
            // 添加密码状态说明
            if (server.auth && server.auth.presetToken) {
                description += ' (支持自动登录)';
            }
            descEl.textContent = description;
        }
        
        // 添加自动登录指示器
        if (server.auth && server.auth.presetToken) {
            if (!infoEl.querySelector('.auto-login-indicator')) {
                const indicator = document.createElement('div');
                indicator.className = 'auto-login-indicator';
                indicator.textContent = '🔑 自动登录';
                infoEl.appendChild(indicator);
            }
        } else {
            const indicator = infoEl.querySelector('.auto-login-indicator');
            if (indicator) {
                indicator.remove();
            }
        }
        
        infoEl.style.display = 'block';
    }

    // 隐藏服务器信息
    hideServerInfo() {
        const infoEl = document.getElementById('server-info');
        if (infoEl) {
            infoEl.style.display = 'none';
        }
    }

    // 绑定基础事件
    bindEvents() {
        console.log('绑定基础事件');
        
        // 服务器选择事件
        const serverSelect = document.getElementById('server-select');
        if (serverSelect) {
            serverSelect.addEventListener('change', (e) => {
                this.onServerSelect(e.target.value);
            });
        }

        // 按钮事件
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.startConnection();
            });
        }

        const stopBtn = document.getElementById('stop-btn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                this.stopConnection();
            });
        }

        const clearLogBtn = document.getElementById('clear-log-btn');
        if (clearLogBtn) {
            clearLogBtn.addEventListener('click', () => {
                this.clearLog();
            });
        }
    }

    // 初始化版本信息
    async initializeVersion() {
        try {
            const version = await window.electronAPI.getAppVersion();
            const versionEl = document.getElementById('version-info');
            if (versionEl) {
                versionEl.textContent = `v${version}`;
            }
        } catch (error) {
            console.error('获取版本信息失败:', error);
        }
    }

    // 修复下载更新
    async downloadUpdate(downloadUrl) {
        try {
            console.log('下载更新:', downloadUrl);
            this.addLogEntry('info', '正在打开下载链接...');
            
            const result = await window.electronAPI.downloadUpdate(downloadUrl);
            
            if (result.success) {
                this.addLogEntry('info', '下载链接已在浏览器中打开');
                this.hideUpdateModal();
            } else {
                this.addLogEntry('error', '打开下载链接失败: ' + result.error);
            }
        } catch (error) {
            console.error('下载更新失败:', error);
            this.addLogEntry('error', '下载更新失败: ' + error.message);
        }
    }

    // 修复设置更新相关事件监听
    setupUpdateListeners() {
        console.log('设置更新相关事件监听器');
        
        // 检查更新按钮
        const checkUpdateBtn = document.getElementById('check-update-btn');
        if (checkUpdateBtn) {
            console.log('找到检查更新按钮，绑定事件');
            checkUpdateBtn.addEventListener('click', (e) => {
                console.log('检查更新按钮被点击');
                e.preventDefault();
                this.checkForUpdates(true);
            });
        } else {
            console.error('未找到检查更新按钮 #check-update-btn');
        }

        // 更新对话框事件 
        const modalClose = document.querySelector('.modal-close');
        if (modalClose) {
            modalClose.addEventListener('click', () => {
                this.hideUpdateModal();
            });
        }

        const downloadInstallerBtn = document.getElementById('download-installer-btn');
        if (downloadInstallerBtn) {
            downloadInstallerBtn.addEventListener('click', () => {
                if (this.currentUpdateInfo?.downloadUrl) {
                    this.downloadUpdate(this.currentUpdateInfo.downloadUrl);
                }
            });
        }

        const downloadPortableBtn = document.getElementById('download-portable-btn');
        if (downloadPortableBtn) {
            downloadPortableBtn.addEventListener('click', () => {
                if (this.currentUpdateInfo?.portableUrl) {
                    this.downloadUpdate(this.currentUpdateInfo.portableUrl);
                }
            });
        }

        const cancelUpdateBtn = document.getElementById('cancel-update-btn');
        if (cancelUpdateBtn) {
            cancelUpdateBtn.addEventListener('click', () => {
                this.hideUpdateModal();
            });
        }

        // 监听主进程的更新事件
        if (window.electronAPI.onUpdateResult) {
            window.electronAPI.onUpdateResult((event, result) => {
                console.log('收到更新检查结果:', result);
                this.handleUpdateResult(result);
            });
        }

        if (window.electronAPI.onShowUpdateDialog) {
            window.electronAPI.onShowUpdateDialog((event, updateInfo) => {
                console.log('收到显示更新对话框请求:', updateInfo);
                this.showUpdateModal(updateInfo);
                this.setUpdateButtonState(false); // 重置按钮状态
            });
        }

        // 点击模态框外部关闭更新对话框
        const updateModal = document.getElementById('update-modal');
        if (updateModal) {
            updateModal.addEventListener('click', (e) => {
                if (e.target.id === 'update-modal') {
                    this.hideUpdateModal();
                }
            });
        }
    }
        // 新增：处理更新结果
    handleUpdateResult(result) {
        console.log('处理更新结果:', result);
        
        // 重置按钮状态
        this.setUpdateButtonState(false);
        
        if (result.error) {
            this.addLogEntry('error', result.error);
        } else if (!result.hasUpdate) {
            if (result.message) {
                this.addLogEntry('info', result.message);
            }
            
            // 显示版本信息
            if (result.currentVersion && result.remoteVersion) {
                this.addLogEntry('info', `当前版本: v${result.currentVersion}, 最新版本: v${result.remoteVersion}`);
            }
        }
    }
    
    // 修复隐藏更新对话框
    hideUpdateModal() {
        console.log('隐藏更新对话框');
        
        const updateModal = document.getElementById('update-modal');
        if (updateModal) {
            updateModal.style.display = 'none';
        }
        this.currentUpdateInfo = null;
        
        // 确保按钮状态重置
        this.setUpdateButtonState(false);
    }

    // 修复检查更新方法
    async checkForUpdates(manual = false) {
        console.log('开始检查更新, manual =', manual);
        
        try {
            this.setUpdateButtonState(true);
            this.addLogEntry('info', '正在检查更新...');
            
            // 检查API可用性
            if (!window.electronAPI.checkForUpdates) {
                throw new Error('checkForUpdates API 不可用');
            }
            
            const updateInfo = await window.electronAPI.checkForUpdates(manual);
            console.log('检查更新返回结果:', updateInfo);
            
            // 注意：主进程会直接处理结果并发送事件，这里不需要重复处理
            if (!updateInfo.hasUpdate && !manual) {
                // 如果是自动检查且无更新，静默处理
                this.setUpdateButtonState(false);
            }
            
        } catch (error) {
            console.error('检查更新异常:', error);
            this.addLogEntry('error', '检查更新失败: ' + error.message);
            this.setUpdateButtonState(false);
        }
        
    }
    // 修复设置更新按钮状态
    setUpdateButtonState(checking) {
        const btn = document.getElementById('check-update-btn');
        if (btn) {
            console.log('设置更新按钮状态:', checking ? '检查中' : '正常');
            
            if (checking) {
                btn.disabled = true;
                btn.innerHTML = '🔄 检查中...';
                btn.classList.add('checking');
            } else {
                btn.disabled = false;
                btn.innerHTML = '🔄 检查更新';
                btn.classList.remove('checking');
            }
        }
    }
    // 修复显示更新对话框
    showUpdateModal(updateInfo) {
        console.log('显示更新对话框:', updateInfo);
        
        this.currentUpdateInfo = updateInfo;
        
        const currentVersionEl = document.getElementById('current-version');
        const latestVersionEl = document.getElementById('latest-version');
        
        if (currentVersionEl) currentVersionEl.textContent = `v${updateInfo.currentVersion}`;
        if (latestVersionEl) latestVersionEl.textContent = `v${updateInfo.remoteVersion}`;
        
        const releaseNotesList = document.getElementById('release-notes-list');
        if (releaseNotesList) {
            releaseNotesList.innerHTML = '';
            
            if (updateInfo.releaseNotes && updateInfo.releaseNotes.length > 0) {
                updateInfo.releaseNotes.forEach(note => {
                    const li = document.createElement('li');
                    li.textContent = note;
                    releaseNotesList.appendChild(li);
                });
            } else {
                const li = document.createElement('li');
                li.textContent = '暂无更新说明';
                releaseNotesList.appendChild(li);
            }
        }
        
        // 根据是否有便携版链接决定按钮显示
        const portableBtn = document.getElementById('download-portable-btn');
        if (portableBtn) {
            if (updateInfo.portableUrl) {
                portableBtn.style.display = 'inline-block';
            } else {
                portableBtn.style.display = 'none';
            }
        }
        
        const updateModal = document.getElementById('update-modal');
        if (updateModal) {
            updateModal.style.display = 'flex';
        }
        
        this.addLogEntry('info', `发现新版本 v${updateInfo.remoteVersion}`);
    }
    // 添加日志条目
    addLogEntry(type, message) {
        const container = document.getElementById('log-container');
        if (!container) return;

        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        
        const timestamp = document.createElement('span');
        timestamp.className = 'timestamp';
        timestamp.textContent = `[${new Date().toLocaleString()}]`;
        
        const messageSpan = document.createElement('span');
        messageSpan.className = 'message';
        messageSpan.textContent = message;
        
        entry.appendChild(timestamp);
        entry.appendChild(messageSpan);
        
        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;
    }

    // 清空日志
    clearLog() {
        const container = document.getElementById('log-container');
        if (container) {
            container.innerHTML = '';
            this.addLogEntry('info', '日志已清空');
        }
    }

    // 更新状态
    async updateStatus() {
        try {
            const status = await window.electronAPI.getFrpcStatus();
            this.isConnected = status.isRunning;
            
            const statusDot = document.getElementById('status-dot');
            const statusText = document.getElementById('status-text');
            const startBtn = document.getElementById('start-btn');
            const stopBtn = document.getElementById('stop-btn');
            
            if (this.isConnected) {
                if (statusDot) {
                    statusDot.className = 'status-dot running';
                }
                if (statusText) {
                    statusText.textContent = '已连接';
                }
                if (startBtn) {
                    startBtn.disabled = true;
                }
                if (stopBtn) {
                    stopBtn.disabled = false;
                }
            } else {
                if (statusDot) {
                    statusDot.className = 'status-dot stopped';
                }
                if (statusText) {
                    statusText.textContent = '未连接';
                }
                if (startBtn) {
                    startBtn.disabled = false;
                }
                if (stopBtn) {
                    stopBtn.disabled = true;
                }
            }
        } catch (error) {
            console.error('更新状态失败:', error);
        }
    }

    // 设置日志监听器
    setupLogListeners() {
        if (window.electronAPI.onFrpcLog) {
            window.electronAPI.onFrpcLog((event, data) => {
                this.addLogEntry('info', data);
            });
        }

        if (window.electronAPI.onFrpcError) {
            window.electronAPI.onFrpcError((event, data) => {
                this.addLogEntry('error', data);
            });
        }

        if (window.electronAPI.onFrpcStatus) {
            window.electronAPI.onFrpcStatus((event, status) => {
                if (status.status === 'started') {
                    this.addLogEntry('info', 'FRP客户端启动成功');
                } else if (status.status === 'stopped') {
                    this.addLogEntry('info', `FRP客户端已停止 (退出码: ${status.code || 'unknown'})`);
                }
                this.updateStatus();
            });
        }
    }

    // 添加管理按钮
    addManagementButtons() {
        const buttonGroup = document.querySelector('.button-group');
        if (!buttonGroup) return;
        
        // 检查是否已经添加过按钮
        if (buttonGroup.querySelector('#open-logs-btn')) {
            return;
        }
        
        const logsBtn = document.createElement('button');
        logsBtn.id = 'open-logs-btn';
        logsBtn.className = 'btn btn-secondary';
        logsBtn.innerHTML = '📋 日志文件夹';
        logsBtn.addEventListener('click', () => {
            window.electronAPI.openLogsFolder();
        });

        const diagBtn = document.createElement('button');
        diagBtn.id = 'diagnose-btn';
        diagBtn.className = 'btn btn-secondary';
        diagBtn.innerHTML = '🔍 诊断';
        diagBtn.addEventListener('click', () => {
            this.checkFrpcFile();
        });
        
        buttonGroup.appendChild(logsBtn);
        buttonGroup.appendChild(diagBtn);
    }

    // 检查frpc文件
    async checkFrpcFile() {
        try {
            const result = await window.electronAPI.checkFrpc();
            
            this.addLogEntry('info', `frpc.exe 路径: ${result.path}`);
            this.addLogEntry('info', `文件存在: ${result.exists ? '是' : '否'}`);
            this.addLogEntry('info', `是否打包: ${result.isPackaged ? '是' : '否'}`);
            
            if (result.exists && result.fileInfo) {
                this.addLogEntry('info', `文件大小: ${Math.round(result.fileInfo.size / 1024)} KB`);
                this.addLogEntry('info', `是否为文件: ${result.fileInfo.isFile ? '是' : '否'}`);
            }
            
            if (!result.exists) {
                this.addLogEntry('error', 'frpc.exe 文件未找到！请确保文件存在于 bin 目录中');
            }
        } catch (error) {
            this.addLogEntry('error', '诊断失败: ' + error.message);
        }
    }

    // 停止连接
    async stopConnection() {
        try {
            const result = await window.electronAPI.stopFrpc();
            
            if (result.success) {
                this.addLogEntry('info', result.message);
            } else {
                this.addLogEntry('error', result.message);
            }
            
            this.updateStatus();
        } catch (error) {
            this.addLogEntry('error', '停止连接失败: ' + error.message);
        }
    }

    // 获取连接配置
    getConnectionConfig() {
        return {
            serverAddr: document.getElementById('server-addr').value.trim(),
            serverPort: parseInt(document.getElementById('server-port').value) || 7000,
            token: document.getElementById('token').value.trim(),
            serviceName: document.getElementById('service-name').value.trim() || 'default',
            localIP: document.getElementById('local-ip').value.trim() || '127.0.0.1',
            localPort: parseInt(document.getElementById('local-port').value) || 3389,
            remotePort: parseInt(document.getElementById('remote-port').value) || 6000,
            type: document.getElementById('type').value || 'tcp'
        };
    }

    // 验证配置 - 考虑预置密码
    validateConfig(config) {
        if (!config.serverAddr) {
            this.addLogEntry('error', '请选择或输入服务器地址');
            return false;
        }
        
        if (!config.token) {
            this.addLogEntry('error', '请输入访问令牌或选择带预置密码的服务器');
            return false;
        }
        
        if (!config.localPort || config.localPort <= 0 || config.localPort > 65535) {
            this.addLogEntry('error', '请输入有效的本地端口 (1-65535)');
            return false;
        }
        
        if (!config.remotePort || config.remotePort <= 0 || config.remotePort > 65535) {
            this.addLogEntry('error', '请输入有效的远程端口 (1-65535)');
            return false;
        }
        
        return true;
    }
}
// 应用初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM加载完成，初始化应用');
    
    // 添加全局错误处理
    window.addEventListener('error', (e) => {
        console.error('全局错误:', e.error);
    });
    
    window.addEventListener('unhandledrejection', (e) => {
        console.error('未处理的Promise拒绝:', e.reason);
    });
    
    // 检查必要的DOM元素
    const requiredElements = [
        'settings-btn',
        'fetch-servers-btn',
        'settings-modal',
        'servers-modal',
        'log-container'
    ];
    
    const missingElements = requiredElements.filter(id => !document.getElementById(id));
    if (missingElements.length > 0) {
        console.error('缺少必要的DOM元素:', missingElements);
    }
    
    // 检查API可用性
    if (!window.electronAPI) {
        console.error('electronAPI 不可用');
        return;
    }
    
    console.log('可用的 electronAPI 方法:', Object.keys(window.electronAPI));
    
    // 初始化应用
    new FrpcGuiApp();
});