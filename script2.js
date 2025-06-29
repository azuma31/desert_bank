// UI管理とイベントハンドリング
class WaratUI {
    constructor() {
        this.currentUser = null;
        this.autoUpdateInterval = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkInitialIPBlock(); // 初期IPチェックを追加
        this.checkAutoLogin();
        // システム状態チェックをログイン画面では実行しない
    }

    // アプリ開始時のIPブロックチェック
    async checkInitialIPBlock() {
        try {
            await waratDB.checkIPBeforeOperation();
        } catch (error) {
            console.log('初期IPチェックでブロックされました:', error.message);
            // エラーが発生した場合、IPブロック画面が既に表示されている
            return;
        }
    }

    setupEventListeners() {
        // 画面切り替え
        document.getElementById('showRegister').addEventListener('click', (e) => {
            e.preventDefault();
            this.showScreen('registerScreen');
        });

        document.getElementById('showLogin').addEventListener('click', (e) => {
            e.preventDefault();
            this.showScreen('loginScreen');
        });

        // アカウントタイプ選択
        document.querySelectorAll('input[name="accountType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const specialContainer = document.getElementById('specialPasswordContainer');
                if (e.target.value !== 'general') {
                    specialContainer.classList.remove('hidden');
                } else {
                    specialContainer.classList.add('hidden');
                }
            });
        });

        // フォーム送信
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        document.getElementById('registerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegister();
        });

        document.getElementById('transferForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleTransfer();
        });

        document.getElementById('distributeForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleDistribute();
        });

        document.getElementById('adminDistributeForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAdminDistribute();
        });

        // ログアウト
        document.getElementById('generalLogout').addEventListener('click', () => this.logout());
        document.getElementById('financeLogout').addEventListener('click', () => this.logout());
        document.getElementById('adminLogout').addEventListener('click', () => this.logout());

        // 管理者機能
        document.getElementById('toggleSystem').addEventListener('click', () => this.handleToggleSystem());
        document.getElementById('freezeAccount').addEventListener('click', () => this.handleFreezeAccount());
        document.getElementById('deleteAccount').addEventListener('click', () => this.handleDeleteAccount());
        document.getElementById('updateBalance').addEventListener('click', () => this.handleUpdateBalance());

        // IPアドレス管理機能
        document.getElementById('blockIpAddress').addEventListener('click', () => this.handleBlockIP());
        document.getElementById('unblockIpAddress').addEventListener('click', () => this.handleUnblockIP());
        document.getElementById('viewBlockedIps').addEventListener('click', () => this.handleViewBlockedIPs());

        // ドロップダウン機能を設定
        this.setupDropdown('transferTo', 'transferToDropdown');
        this.setupDropdown('distributeTo', 'distributeToDropdown');
        this.setupDropdown('adminDistributeTo', 'adminDistributeToDropdown');
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });
        document.getElementById(screenId).classList.remove('hidden');
    }

    showMessage(message, type = 'error') {
        // 従来のメッセージ表示は削除し、トースト通知のみ使用
        this.showToast(message, type);
    }

    showToast(message, type = 'success', duration = 4000) {
        const toastContainer = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        // アイコンを設定
        let icon = '';
        switch (type) {
            case 'success':
                icon = '✓';
                break;
            case 'error':
                icon = '✕';
                break;
            case 'info':
                icon = 'ℹ';
                break;
            case 'warning':
                icon = '⚠';
                break;
            default:
                icon = '✓';
        }

        // 現在時刻を取得
        const now = new Date();
        const timeString = now.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        toast.innerHTML = `
            <div class="toast-icon">${icon}</div>
            <div class="toast-content">
                <div class="toast-message">${message}</div>
                <div class="toast-time">${timeString}</div>
            </div>
            <button class="toast-close">×</button>
        `;

        // 閉じるボタンのイベント
        const closeButton = toast.querySelector('.toast-close');
        closeButton.addEventListener('click', () => {
            this.removeToast(toast);
        });

        // トーストを追加
        toastContainer.appendChild(toast);

        // アニメーション表示
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        // 自動削除
        setTimeout(() => {
            this.removeToast(toast);
        }, duration);

        return toast;
    }

    removeToast(toast) {
        if (toast && toast.parentNode) {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }
    }

    async checkAutoLogin() {
        const autoLoginData = localStorage.getItem('warat_auto_login');
        if (autoLoginData) {
            const { username, password } = JSON.parse(autoLoginData);
            try {
                const user = await waratDB.login(username, password);
                this.currentUser = user;
                this.showDashboard(user.accountType);
                this.startAutoUpdate();
                this.setupRealtimeListeners();
                // 自動ログイン後にシステム状態をチェック
                await this.checkSystemStatus();
            } catch (error) {
                localStorage.removeItem('warat_auto_login');
            }
        }
    }

    setupDropdown(inputId, dropdownId) {
        const inputElement = document.getElementById(inputId);
        const dropdownElement = document.getElementById(dropdownId);

        if (!inputElement || !dropdownElement) return;

        // フォーカス時にドロップダウンを表示
        inputElement.addEventListener('focus', () => {
            this.showDropdown(inputId, dropdownId);
        });

        // 入力時にフィルタリング
        inputElement.addEventListener('input', () => {
            this.filterDropdown(inputId, dropdownId);
        });

        // フォーカスを失った時にドロップダウンを非表示（少し遅延させる）
        inputElement.addEventListener('blur', () => {
            setTimeout(() => {
                dropdownElement.classList.add('hidden');
            }, 200);
        });

        // 外部クリック時にドロップダウンを非表示
        document.addEventListener('click', (e) => {
            if (!inputElement.contains(e.target) && !dropdownElement.contains(e.target)) {
                dropdownElement.classList.add('hidden');
            }
        });
    }

    async showDropdown(inputId, dropdownId) {
        const inputElement = document.getElementById(inputId);
        const dropdownElement = document.getElementById(dropdownId);

        try {
            const users = await waratDB.getAllUsers();
            const currentUsername = this.currentUser ? this.currentUser.username : '';

            // 自分以外のユーザーをフィルタリング
            const filteredUsers = users.filter(user => user.username !== currentUsername);

            this.renderDropdown(dropdownElement, filteredUsers, inputElement);
            dropdownElement.classList.remove('hidden');
        } catch (error) {
            console.error('ユーザーリスト取得エラー:', error);
        }
    }

    async filterDropdown(inputId, dropdownId) {
        const inputElement = document.getElementById(inputId);
        const dropdownElement = document.getElementById(dropdownId);
        const inputValue = inputElement.value.toLowerCase();

        if (inputValue === '') {
            this.showDropdown(inputId, dropdownId);
            return;
        }

        try {
            const users = await waratDB.getAllUsers();
            const currentUsername = this.currentUser ? this.currentUser.username : '';

            // 自分以外のユーザーをフィルタリング + 入力値でフィルタリング
            const filteredUsers = users.filter(user =>
                user.username !== currentUsername &&
                user.username.toLowerCase().includes(inputValue)
            );

            this.renderDropdown(dropdownElement, filteredUsers, inputElement);
            dropdownElement.classList.remove('hidden');
        } catch (error) {
            console.error('ユーザーリスト取得エラー:', error);
        }
    }

    renderDropdown(dropdownElement, users, inputElement) {
        dropdownElement.innerHTML = '';

        if (users.length === 0) {
            const noResultItem = document.createElement('div');
            noResultItem.className = 'dropdown-item';
            noResultItem.innerHTML = '<span>該当するユーザーがいません</span>';
            dropdownElement.appendChild(noResultItem);
            return;
        }

        const accountTypeNames = {
            'general': '一般',
            'finance': '財務',
            'admin': '管理'
        };

        users.forEach(user => {
            const dropdownItem = document.createElement('div');
            dropdownItem.className = 'dropdown-item';

            dropdownItem.innerHTML = `
                <span class="user-name">${user.username}</span>
                <span class="user-type ${user.accountType}">${accountTypeNames[user.accountType]}</span>
            `;

            // クリックでユーザー名を選択
            dropdownItem.addEventListener('click', () => {
                inputElement.value = user.username;
                dropdownElement.classList.add('hidden');

                // 選択状態の表示
                document.querySelectorAll('.dropdown-item').forEach(item => {
                    item.classList.remove('selected');
                });
                dropdownItem.classList.add('selected');
            });

            // ホバー効果
            dropdownItem.addEventListener('mouseenter', () => {
                document.querySelectorAll('.dropdown-item').forEach(item => {
                    item.classList.remove('selected');
                });
                dropdownItem.classList.add('selected');
            });

            dropdownElement.appendChild(dropdownItem);
        });
    }

    async toggleUserList(displayId, contentId, inputId) {
        // この関数は削除（使用しない）
    }

    async checkSystemStatus() {
        try {
            const isActive = await waratDB.isSystemActive();
            if (!isActive) {
                // 完全管理アカウントでログインしている場合はシステム停止メッセージを表示しない
                if (this.currentUser && this.currentUser.accountType === 'admin') {
                    document.getElementById('systemMessage').classList.add('hidden');
                } else {
                    document.getElementById('systemMessage').classList.remove('hidden');
                }
            } else {
                document.getElementById('systemMessage').classList.add('hidden');
            }
        } catch (error) {
            console.error('システム状態確認エラー:', error);
        }
    }

    async handleLogin() {
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        const autoLogin = document.getElementById('autoLogin').checked;

        try {
            const user = await waratDB.login(username, password);
            this.currentUser = user;

            if (autoLogin) {
                localStorage.setItem('warat_auto_login', JSON.stringify({ username, password }));
            }

            this.showDashboard(user.accountType);
            this.startAutoUpdate();
            this.setupRealtimeListeners();
            this.showMessage('ログインしました', 'success');

            // ログイン成功後にシステム状態をチェック
            await this.checkSystemStatus();
        } catch (error) {
            this.showMessage(error.message);
        }
    }

    async handleRegister() {
        const username = document.getElementById('regUsername').value;
        const password = document.getElementById('regPassword').value;
        const accountType = document.querySelector('input[name="accountType"]:checked').value;
        const specialPassword = document.getElementById('specialPassword').value;

        try {
            await waratDB.registerUser(username, password, accountType, specialPassword);
            this.showMessage('登録が完了しました', 'success');
            setTimeout(() => {
                this.showScreen('loginScreen');
            }, 1500);
        } catch (error) {
            this.showMessage(error.message);
        }
    }

    async handleTransfer() {
        const to = document.getElementById('transferTo').value;
        const amount = parseInt(document.getElementById('transferAmount').value);

        if (!to || isNaN(amount) || amount <= 0) {
            this.showMessage('正しい送金先と金額を入力してください', 'error');
            return;
        }

        try {
            await waratDB.transfer(this.currentUser.username, to, amount);
            this.showMessage(`${to}に${amount} Wを送金しました`, 'success');
            document.getElementById('transferForm').reset();
        } catch (error) {
            this.showMessage(error.message, 'error');
        }
    }

    async handleBlockIP() {
        const ipAddress = document.getElementById('manageIpAddress').value.trim();
        if (!ipAddress) {
            this.showMessage('IPアドレスを入力してください', 'warning');
            return;
        }

        // 簡単なIPアドレス形式チェック
        const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
        if (!ipRegex.test(ipAddress)) {
            this.showMessage('正しいIPアドレス形式で入力してください', 'warning');
            return;
        }

        try {
            await waratDB.blockIP(this.currentUser.username, ipAddress);
            this.showMessage(`IPアドレス ${ipAddress} をブロックしました`, 'info');
            document.getElementById('manageIpAddress').value = '';
        } catch (error) {
            this.showMessage(error.message, 'error');
        }
    }

    async handleUnblockIP() {
        const ipAddress = document.getElementById('manageIpAddress').value.trim();
        if (!ipAddress) {
            this.showMessage('IPアドレスを入力してください', 'warning');
            return;
        }

        try {
            await waratDB.unblockIP(this.currentUser.username, ipAddress);
            this.showMessage(`IPアドレス ${ipAddress} のブロックを解除しました`, 'info');
            document.getElementById('manageIpAddress').value = '';

            // ブロックリストが表示されている場合は更新
            const blockedList = document.getElementById('blockedIpsList');
            if (!blockedList.classList.contains('hidden')) {
                this.handleViewBlockedIPs();
            }
        } catch (error) {
            this.showMessage(error.message, 'error');
        }
    }

    async handleViewBlockedIPs() {
        const blockedList = document.getElementById('blockedIpsList');

        if (blockedList.classList.contains('hidden')) {
            // リストを表示
            try {
                const blockedIPs = await waratDB.getBlockedIPs();
                this.renderBlockedIPsList(blockedIPs);
                blockedList.classList.remove('hidden');
                document.getElementById('viewBlockedIps').textContent = 'ブロック一覧を非表示';
            } catch (error) {
                this.showMessage('ブロックリストの取得に失敗しました', 'error');
            }
        } else {
            // リストを非表示
            blockedList.classList.add('hidden');
            document.getElementById('viewBlockedIps').textContent = 'ブロック中のIP一覧';
        }
    }

    renderBlockedIPsList(blockedIPs) {
        const container = document.getElementById('blockedIpsList');
        container.innerHTML = '';

        if (blockedIPs.length === 0) {
            container.innerHTML = '<p>ブロックされているIPアドレスはありません</p>';
            return;
        }

        blockedIPs.forEach(ip => {
            const item = document.createElement('div');
            item.className = 'blocked-ip-item';

            item.innerHTML = `
                <div class="blocked-ip-info">
                    <div class="blocked-ip-address">${ip}</div>
                    <div class="blocked-ip-date">ブロック日時は管理履歴を確認してください</div>
                </div>
                <button class="unblock-btn" onclick="waratUI.quickUnblockIP('${ip}')">
                    解除
                </button>
            `;

            container.appendChild(item);
        });
    }

    async quickUnblockIP(ipAddress) {
        if (confirm(`IPアドレス ${ipAddress} のブロックを解除しますか？`)) {
            try {
                await waratDB.unblockIP(this.currentUser.username, ipAddress);
                this.showMessage(`IPアドレス ${ipAddress} のブロックを解除しました`, 'info');

                // リストを更新
                const blockedIPs = await waratDB.getBlockedIPs();
                this.renderBlockedIPsList(blockedIPs);
            } catch (error) {
                this.showMessage(error.message, 'error');
            }
        }
    }

    async handleDistribute() {
        const to = document.getElementById('distributeTo').value;
        const amount = parseInt(document.getElementById('distributeAmount').value);

        if (!to || isNaN(amount) || amount <= 0) {
            this.showMessage('正しい配布先と金額を入力してください', 'error');
            return;
        }

        try {
            await waratDB.distribute(this.currentUser.username, to, amount);
            this.showMessage(`${to}に${amount} Wを配布しました`, 'success');
            document.getElementById('distributeForm').reset();
        } catch (error) {
            this.showMessage(error.message, 'error');
        }
    }

    async handleAdminDistribute() {
        const to = document.getElementById('adminDistributeTo').value;
        const amount = parseInt(document.getElementById('adminDistributeAmount').value);

        if (!to || isNaN(amount) || amount <= 0) {
            this.showMessage('正しい配布先と金額を入力してください', 'error');
            return;
        }

        try {
            await waratDB.distribute(this.currentUser.username, to, amount);
            this.showMessage(`${to}に${amount} Wを配布しました`, 'success');
            document.getElementById('adminDistributeForm').reset();
        } catch (error) {
            this.showMessage(error.message, 'error');
        }
    }

    async handleToggleSystem() {
        try {
            const isActive = await waratDB.toggleSystem(this.currentUser.username);
            const status = isActive ? '稼働中' : '停止中';
            document.getElementById('systemStatus').textContent = `システム状態: ${status}`;
            this.showMessage(`システムを${isActive ? '開始' : '停止'}しました`, 'info');
            await this.checkSystemStatus();
        } catch (error) {
            this.showMessage(error.message, 'error');
        }
    }

    async handleFreezeAccount() {
        const targetUsername = document.getElementById('manageUsername').value;
        if (!targetUsername) {
            this.showMessage('ユーザー名を入力してください', 'warning');
            return;
        }

        try {
            const isFrozen = await waratDB.toggleFreeze(this.currentUser.username, targetUsername);
            this.showMessage(`${targetUsername}のアカウントを${isFrozen ? '凍結' : '解除'}しました`, 'info');
        } catch (error) {
            this.showMessage(error.message, 'error');
        }
    }

    async handleDeleteAccount() {
        const targetUsername = document.getElementById('manageUsername').value;
        if (!targetUsername) {
            this.showMessage('ユーザー名を入力してください', 'warning');
            return;
        }

        if (confirm(`本当に${targetUsername}のアカウントを削除しますか？`)) {
            try {
                await waratDB.deleteAccount(this.currentUser.username, targetUsername);
                this.showMessage(`${targetUsername}のアカウントを削除しました`, 'info');
                document.getElementById('manageUsername').value = '';
            } catch (error) {
                this.showMessage(error.message, 'error');
            }
        }
    }

    async handleUpdateBalance() {
        const targetUsername = document.getElementById('manageUsername').value;
        const newBalance = parseInt(document.getElementById('newBalance').value);

        if (!targetUsername) {
            this.showMessage('ユーザー名を入力してください', 'warning');
            return;
        }
        if (isNaN(newBalance)) {
            this.showMessage('正しい残高を入力してください', 'warning');
            return;
        }

        try {
            await waratDB.updateBalance(this.currentUser.username, targetUsername, newBalance);
            this.showMessage(`${targetUsername}の残高を${newBalance} Wに変更しました`, 'info');
            document.getElementById('newBalance').value = '';
        } catch (error) {
            this.showMessage(error.message, 'error');
        }
    }

    showDashboard(accountType) {
        const dashboards = {
            'general': 'generalDashboard',
            'finance': 'financeDashboard',
            'admin': 'adminDashboard'
        };

        this.showScreen(dashboards[accountType]);
        this.updateDashboard();
    }

    async updateDashboard() {
        // 現在のユーザー情報を最新に更新
        await waratDB.refreshCurrentUser();
        this.currentUser = waratDB.currentUser;

        if (this.currentUser.accountType === 'general') {
            await this.updateGeneralDashboard();
        } else if (this.currentUser.accountType === 'finance') {
            await this.updateFinanceDashboard();
        } else if (this.currentUser.accountType === 'admin') {
            await this.updateAdminDashboard();
        }
    }

    async updateGeneralDashboard() {
        document.getElementById('generalUsername').textContent = this.currentUser.username;
        document.getElementById('generalBalance').textContent = `${this.currentUser.balance} W`;

        // 送金履歴表示
        try {
            const history = await waratDB.getUserTransactions(this.currentUser.username);
            const historyContainer = document.getElementById('transferHistory');
            historyContainer.innerHTML = '';

            if (history.length === 0) {
                historyContainer.innerHTML = '<p>送金履歴がありません</p>';
            } else {
                history.forEach(transaction => {
                    const div = document.createElement('div');
                    div.className = 'history-item';

                    if (transaction.from === this.currentUser.username) {
                        div.classList.add('sent');
                        div.innerHTML = `
                            <span>${transaction.to}に送金</span>
                            <span>-${transaction.amount} W</span>
                        `;
                    } else {
                        div.classList.add('received');
                        div.innerHTML = `
                            <span>${transaction.from}から${transaction.type === 'distribute' ? '配布' : '受取'}</span>
                            <span>+${transaction.amount} W</span>
                        `;
                    }

                    const time = document.createElement('small');
                    if (transaction.timestamp && transaction.timestamp.seconds) {
                        time.textContent = new Date(transaction.timestamp.seconds * 1000).toLocaleString('ja-JP');
                    } else {
                        time.textContent = '処理中...';
                    }
                    div.appendChild(time);

                    historyContainer.appendChild(div);
                });
            }
        } catch (error) {
            console.error('送金履歴取得エラー:', error);
        }
    }

    async updateFinanceDashboard() {
        document.getElementById('financeUsername').textContent = this.currentUser.username;

        // 配布履歴表示
        try {
            const history = await waratDB.getUserTransactions(this.currentUser.username);
            const historyContainer = document.getElementById('distributeHistory');
            historyContainer.innerHTML = '';

            const distributeHistory = history.filter(t => t.type === 'distribute' && t.from === this.currentUser.username);

            if (distributeHistory.length === 0) {
                historyContainer.innerHTML = '<p>配布履歴がありません</p>';
            } else {
                distributeHistory.forEach(transaction => {
                    const div = document.createElement('div');
                    div.className = 'history-item';
                    div.innerHTML = `
                        <span>${transaction.to}に配布</span>
                        <span>${transaction.amount} W</span>
                    `;

                    const time = document.createElement('small');
                    if (transaction.timestamp && transaction.timestamp.seconds) {
                        time.textContent = new Date(transaction.timestamp.seconds * 1000).toLocaleString('ja-JP');
                    } else {
                        time.textContent = '処理中...';
                    }
                    div.appendChild(time);

                    historyContainer.appendChild(div);
                });
            }
        } catch (error) {
            console.error('配布履歴取得エラー:', error);
        }
    }

    async updateAdminDashboard() {
        document.getElementById('adminUsername').textContent = this.currentUser.username;

        // システム状態更新
        try {
            const isActive = await waratDB.isSystemActive();
            document.getElementById('systemStatus').textContent = `システム状態: ${isActive ? '稼働中' : '停止中'}`;
        } catch (error) {
            console.error('システム状態取得エラー:', error);
        }

        // 現在のIPアドレスを表示
        try {
            const currentIP = await waratDB.getClientIP();
            document.getElementById('currentIpDisplay').textContent = currentIP;
        } catch (error) {
            document.getElementById('currentIpDisplay').textContent = '取得失敗';
        }

        // 全アカウント情報表示
        await this.updateAllAccountsDisplay();

        // 管理履歴表示
        await this.updateAdminHistoryDisplay();
    }

    async updateAllAccountsDisplay() {
        try {
            const allUsers = await waratDB.getAllUsers();
            const container = document.getElementById('allAccounts');
            container.innerHTML = '';

            if (allUsers.length === 0) {
                container.innerHTML = '<p>ユーザーが見つかりません</p>';
                return;
            }

            allUsers.forEach(user => {
                const div = document.createElement('div');
                div.className = `account-info ${user.frozen ? 'frozen' : ''}`;

                const accountTypeNames = {
                    'general': '一般',
                    'finance': '財務',
                    'admin': '管理'
                };

                div.innerHTML = `
                    <h4>${user.username} (${accountTypeNames[user.accountType]})</h4>
                    <p>残高: ${user.balance === Infinity ? '∞' : user.balance} W</p>
                    <p>状態: ${user.frozen ? '凍結' : '正常'}</p>
                    <p>最終ログイン: ${user.lastLogin ? new Date(user.lastLogin.seconds * 1000).toLocaleString('ja-JP') : 'なし'}</p>
                    <p>IPアドレス: ${user.ipAddress || '不明'}</p>
                    <p>作成日: ${user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleString('ja-JP') : '不明'}</p>
                `;
                container.appendChild(div);
            });
        } catch (error) {
            console.error('アカウント情報取得エラー:', error);
        }
    }

    async updateAdminHistoryDisplay() {
        try {
            const history = await waratDB.getAdminHistory();
            const container = document.getElementById('adminHistory');
            container.innerHTML = '';

            if (history.length === 0) {
                container.innerHTML = '<p>管理履歴がありません</p>';
            } else {
                history.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'history-item';

                    let description = '';
                    switch (item.type) {
                        case 'freeze':
                            description = `${item.target}を凍結`;
                            break;
                        case 'unfreeze':
                            description = `${item.target}の凍結解除`;
                            break;
                        case 'delete':
                            description = `${item.target}を削除`;
                            break;
                        case 'balance_update':
                            description = `${item.target}の残高を${item.oldBalance}から${item.newBalance}に変更`;
                            break;
                        case 'system_stop':
                            description = 'システムを停止';
                            break;
                        case 'system_start':
                            description = 'システムを開始';
                            break;
                        case 'ip_block':
                            description = `IPアドレス ${item.target} をブロック`;
                            if (item.adminIP) {
                                description += ` (管理者IP: ${item.adminIP})`;
                            }
                            break;
                        case 'ip_unblock':
                            description = `IPアドレス ${item.target} のブロック解除`;
                            if (item.adminIP) {
                                description += ` (管理者IP: ${item.adminIP})`;
                            }
                            break;
                        default:
                            description = '不明な操作';
                    }

                    div.innerHTML = `
                        <span>${description}</span>
                        <span>管理者: ${item.admin}</span>
                    `;

                    const time = document.createElement('small');
                    if (item.timestamp && item.timestamp.seconds) {
                        time.textContent = new Date(item.timestamp.seconds * 1000).toLocaleString('ja-JP');
                    } else {
                        time.textContent = '処理中...';
                    }
                    div.appendChild(time);

                    container.appendChild(div);
                });
            }
        } catch (error) {
            console.error('管理履歴取得エラー:', error);
        }
    }

    setupRealtimeListeners() {
        if (!this.currentUser) return;

        // 既存のリスナーをクリア
        waratDB.clearListeners();

        // ユーザー情報のリアルタイム更新
        waratDB.setupUserListener(this.currentUser.username, (userData) => {
            this.currentUser = userData;
            this.updateDashboard();
        });

        // トランザクションのリアルタイム更新
        waratDB.setupTransactionListener(this.currentUser.username, () => {
            this.updateDashboard();
        });
    }

    startAutoUpdate() {
        if (this.autoUpdateInterval) {
            clearInterval(this.autoUpdateInterval);
        }

        this.autoUpdateInterval = setInterval(async () => {
            try {
                // 定期的にIPチェックを実行
                await waratDB.checkIPBeforeOperation();

                await this.updateDashboard();
                await this.checkSystemStatus();
            } catch (error) {
                console.log('定期チェックでIPブロックが検出されました:', error.message);
                // IPブロックされた場合、インターバルを停止
                clearInterval(this.autoUpdateInterval);
            }
        }, 10000); // 10秒ごと
    }

    logout() {
        localStorage.removeItem('warat_auto_login');
        this.currentUser = null;

        // リスナーとインターバルをクリア
        waratDB.clearListeners();
        if (this.autoUpdateInterval) {
            clearInterval(this.autoUpdateInterval);
            this.autoUpdateInterval = null;
        }

        // システム停止メッセージを非表示にしてからログイン画面へ
        document.getElementById('systemMessage').classList.add('hidden');
        this.showScreen('loginScreen');

        // フォームリセット
        document.getElementById('loginForm').reset();
        this.showMessage('ログアウトしました', 'success');
    }
}

// UIインスタンス作成
let waratUI; // グローバル変数として宣言
document.addEventListener('DOMContentLoaded', () => {
    waratUI = new WaratUI();
});