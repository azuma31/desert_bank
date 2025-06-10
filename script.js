// グローバル状態
let currentUser = null;
let transactions = [];
let updateInterval = null;
let loadingTimeout = null;

// ローカルストレージキー
const STORAGE_KEYS = {
    AUTO_LOGIN: 'wWallet_autoLogin',
    USERNAME: 'wWallet_username',
    PASSWORD: 'wWallet_password'
};

// API呼び出し関数
async function callApi(action, data, showLoadingIndicator = true) {
    try {
        if (showLoadingIndicator) {
            showLoading();
        }

        const formData = new URLSearchParams();
        formData.append('action', action);
        formData.append('data', JSON.stringify(data));

        const response = await fetch(API_URL, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || '予期せぬエラーが発生しました');
        }
        return result.data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    } finally {
        if (showLoadingIndicator) {
            // 統一されたローディング表示時間（管理者・通常アカウント共通）
            const minDisplayTime = 300;
            if (loadingTimeout) {
                clearTimeout(loadingTimeout);
            }
            loadingTimeout = setTimeout(() => {
                hideLoading();
            }, minDisplayTime);
        }
    }
}

// UI制御関数
function showLoading() {
    if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = null;
    }
    document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function showMessage(message, isError = false) {
    const messageEl = document.getElementById('message');
    const messageText = document.getElementById('message-text');
    const messageIcon = document.getElementById('message-icon');

    messageEl.classList.remove('hidden', 'error', 'success');
    messageEl.classList.add(isError ? 'error' : 'success');

    messageIcon.className = isError ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
    messageText.textContent = message;

    setTimeout(() => {
        messageEl.classList.add('hidden');
    }, 4000);
}

// 画面表示制御
function showLogin() {
    stopAutoUpdate();
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('dashboard').classList.add('hidden');

    // 自動ログイン設定の状態を復元
    restoreAutoLoginSettings();
}

function showRegister() {
    stopAutoUpdate();
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
}

function showDashboard() {
    // 画面切り替え
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');

    // ダッシュボード更新
    updateDashboard();
    updateNavButtons();
    startAutoUpdate();

    // ローディング非表示のタイミングはcallApiのfinallyブロックに統一
}

// アカウント管理
async function handleRegister(event) {
    event.preventDefault();
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    const isAdmin = document.getElementById('admin-mode').checked;
    const adminPassword = document.getElementById('admin-password').value;

    try {
        if (password !== confirmPassword) {
            throw new Error('パスワードが一致しません');
        }

        if (isAdmin && adminPassword !== 'uneiaco') {
            throw new Error('管理者パスワードが正しくありません');
        }

        const result = await callApi('register', {
            username,
            password,
            isAdmin: isAdmin
        });

        showMessage('アカウントが作成されました。ログインしてください。');
        showLogin();
        event.target.reset();
        document.getElementById('admin-password-group').classList.add('hidden');
    } catch (error) {
        showMessage(error.message, true);
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const rememberMe = document.getElementById('remember-me')?.checked || false;

    try {
        // ローディング表示
        showLoading();

        const userData = await callApi('login', { username, password }, false);
        currentUser = { ...userData, password };

        // 自動ログイン設定の保存
        if (rememberMe) {
            saveAutoLoginSettings(username, password);
        } else {
            clearAutoLoginSettings();
        }

        // 通常アカウントの場合のみ取引履歴を取得
        if (!currentUser.isAdmin) {
            transactions = await callApi('getTransactions', {
                accountId: currentUser.accountId
            }, false);
        }

        // ダッシュボード表示
        showDashboard();
        event.target.reset();
        showMessage(`ようこそ、${username}さん`);

        // 統一されたローディング非表示処理
        const minDisplayTime = 300;
        setTimeout(() => {
            hideLoading();
        }, minDisplayTime);

    } catch (error) {
        hideLoading();
        showMessage(error.message, true);
    }
}

function handleLogout() {
    stopAutoUpdate();
    currentUser = null;
    transactions = [];

    // 自動ログイン設定をクリア
    clearAutoLoginSettings();

    showLogin();
    updateNavButtons();
    showMessage('ログアウトしました');
}

// 自動更新機能
function startAutoUpdate() {
    stopAutoUpdate();
    updateInterval = setInterval(async () => {
        if (currentUser) {
            try {
                const userData = await callApi('login', {
                    username: currentUser.username,
                    password: currentUser.password
                }, false);
                currentUser = { ...userData, password: currentUser.password };

                if (!currentUser.isAdmin) {
                    transactions = await callApi('getTransactions', {
                        accountId: currentUser.accountId
                    }, false);
                }
                updateDashboard(true);
            } catch (error) {
                console.error('Auto-update error:', error);
            }
        }
    }, 10000);
}

function stopAutoUpdate() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
}

// 取引機能
async function handleTransfer(event) {
    event.preventDefault();
    const toIdentifier = document.getElementById('transfer-to').value;
    const amount = parseInt(document.getElementById('transfer-amount').value);

    try {
        if (!currentUser) {
            throw new Error('ログインが必要です');
        }

        if (!toIdentifier.trim()) {
            throw new Error('送金先を入力してください');
        }

        if (toIdentifier === currentUser.accountId || toIdentifier === currentUser.username) {
            throw new Error('自分自身には送金できません');
        }

        if (amount <= 0) {
            throw new Error('金額は1W以上を指定してください');
        }

        // 一般アカウントの場合のみ残高チェック
        if (!currentUser.isAdmin && amount > currentUser.balance) {
            throw new Error('残高が不足しています');
        }

        console.log('Sending transfer request:', {
            fromAccountId: currentUser.accountId,
            toIdentifier,
            amount,
            isAdmin: currentUser.isAdmin
        });

        const result = await callApi('transfer', {
            fromAccountId: currentUser.accountId,
            toIdentifier: toIdentifier.trim(),
            amount,
            isAdmin: currentUser.isAdmin
        }, true);

        currentUser.balance = result.newBalance;

        if (!currentUser.isAdmin) {
            transactions = await callApi('getTransactions', {
                accountId: currentUser.accountId
            }, false);
        }

        updateDashboard();
        event.target.reset();

        const actionText = currentUser.isAdmin ? '配布' : '送金';
        showMessage(`${actionText}が完了しました`);
    } catch (error) {
        showMessage(error.message, true);
    }
}

// ダッシュボード更新
function updateDashboard(isAutoUpdate = false) {
    if (!currentUser) return;

    // アカウント情報の更新
    document.getElementById('balance').textContent =
        currentUser.balance.toLocaleString();
    document.getElementById('account-id').textContent =
        currentUser.accountId;
    document.getElementById('username').textContent =
        currentUser.username;

    // アカウント種別表示
    const accountType = document.getElementById('account-type');
    const accountTypeDisplay = document.getElementById('account-type-display');

    if (currentUser.isAdmin) {
        accountType.textContent = '運営アカウント';
        accountType.className = 'account-type admin';
        accountTypeDisplay.classList.remove('hidden');

        // 送金フォームを配布フォームに変更
        document.getElementById('transfer-title').innerHTML = '<i class="fas fa-gift"></i> 配布';
        document.getElementById('transfer-to-label').textContent = '配布先（アカウントID）';
        document.getElementById('transfer-btn-text').textContent = '配布する';

        // 管理者用のグリッドレイアウト
        document.getElementById('dashboard-grid').className = 'dashboard-grid admin-layout';
        document.getElementById('transfer-card').classList.remove('hidden');
    } else {
        accountType.textContent = '一般アカウント';
        accountType.className = 'account-type user';
        accountTypeDisplay.classList.remove('hidden');

        // 通常ユーザー用の単一カードレイアウト
        document.getElementById('dashboard-grid').className = 'dashboard-grid user-layout';
        document.getElementById('transfer-card').classList.add('hidden');
    }
}

function updateNavButtons() {
    const navButtons = document.getElementById('nav-buttons');
    if (currentUser) {
        const userTypeIcon = currentUser.isAdmin ? 'fas fa-crown' : 'fas fa-user';
        navButtons.innerHTML = `
            <div class="user-info">
                <i class="${userTypeIcon}"></i>
                <span class="username-display">${currentUser.username}</span>
            </div>
            <button class="btn btn-outline" onclick="handleLogout()">
                <i class="fas fa-sign-out-alt"></i>
                ログアウト
            </button>
        `;
    } else {
        navButtons.innerHTML = `
            <button class="btn btn-outline" onclick="showLogin()">
                <i class="fas fa-sign-in-alt"></i>
                ログイン
            </button>
            <button class="btn btn-primary" onclick="showRegister()">
                <i class="fas fa-user-plus"></i>
                新規登録
            </button>
        `;
    }
}

// アカウントID関連
function copyAccountId() {
    const accountId = document.getElementById('account-id').textContent;
    navigator.clipboard.writeText(accountId)
        .then(() => showMessage('アカウントIDをコピーしました'))
        .catch(() => showMessage('コピーに失敗しました', true));
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    // 自動ログインの確認
    checkAutoLogin();
});

// 自動ログイン関連の関数
function saveAutoLoginSettings(username, password) {
    try {
        localStorage.setItem(STORAGE_KEYS.AUTO_LOGIN, 'true');
        localStorage.setItem(STORAGE_KEYS.USERNAME, username);
        localStorage.setItem(STORAGE_KEYS.PASSWORD, password);
    } catch (error) {
        console.error('Failed to save auto-login settings:', error);
    }
}

function clearAutoLoginSettings() {
    try {
        localStorage.removeItem(STORAGE_KEYS.AUTO_LOGIN);
        localStorage.removeItem(STORAGE_KEYS.USERNAME);
        localStorage.removeItem(STORAGE_KEYS.PASSWORD);
    } catch (error) {
        console.error('Failed to clear auto-login settings:', error);
    }
}

function restoreAutoLoginSettings() {
    try {
        const autoLogin = localStorage.getItem(STORAGE_KEYS.AUTO_LOGIN);
        const username = localStorage.getItem(STORAGE_KEYS.USERNAME);

        if (autoLogin === 'true' && username) {
            const usernameInput = document.getElementById('login-username');
            const rememberCheckbox = document.getElementById('remember-me');

            if (usernameInput) {
                usernameInput.value = username;
            }
            if (rememberCheckbox) {
                rememberCheckbox.checked = true;
            }
        }
    } catch (error) {
        console.error('Failed to restore auto-login settings:', error);
    }
}

async function checkAutoLogin() {
    try {
        const autoLogin = localStorage.getItem(STORAGE_KEYS.AUTO_LOGIN);
        const username = localStorage.getItem(STORAGE_KEYS.USERNAME);
        const password = localStorage.getItem(STORAGE_KEYS.PASSWORD);

        if (autoLogin === 'true' && username && password) {
            console.log('Attempting auto-login for:', username);

            showLoading();

            try {
                const userData = await callApi('login', { username, password }, false);
                currentUser = { ...userData, password };

                // 通常アカウントの場合のみ取引履歴を取得
                if (!currentUser.isAdmin) {
                    transactions = await callApi('getTransactions', {
                        accountId: currentUser.accountId
                    }, false);
                }

                showDashboard();
                showMessage(`自動ログインしました - ${username}さん`);

                setTimeout(() => {
                    hideLoading();
                }, 300);

            } catch (error) {
                console.error('Auto-login failed:', error);
                clearAutoLoginSettings();
                showLogin();
                hideLoading();
            }
        } else {
            showLogin();
        }
    } catch (error) {
        console.error('Error during auto-login check:', error);
        showLogin();
    }
}

// グローバルエラーハンドリング
window.addEventListener('unhandledrejection', event => {
    console.error('Unhandled promise rejection:', event.reason);
    showMessage('エラーが発生しました', true);
    hideLoading();
});

window.onerror = function (message, source, line, column, error) {
    console.error('Global error:', { message, source, line, column, error });
    showMessage('エラーが発生しました', true);
    hideLoading();
    return false;
};
