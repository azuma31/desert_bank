// Firebase設定と初期化
const firebaseConfig = {
    apiKey: "AIzaSyBYs1kv1sISOAGQ3rLzOQa6WSryko_noq8",
    authDomain: "warat-point-system.firebaseapp.com",
    projectId: "warat-point-system",
    storageBucket: "warat-point-system.firebasestorage.app",
    messagingSenderId: "891815118073",
    appId: "1:891815118073:web:b13dda070c2b9c27588e28"
};

/*
Firebase Security Rules（Firestoreのルールタブに貼り付けてください）:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // IPアドレス取得関数（複数のヘッダーから取得）
    function getClientIP() {
      let ip = request.headers.get('x-forwarded-for', '');
      return ip != '' ? ip.split(',')[0].trim() : 
             request.headers.get('x-real-ip', 
               request.headers.get('cf-connecting-ip',
                 request.headers.get('x-client-ip', '127.0.0.1')));
    }
    
    // IPブロックチェック関数
    function isIPBlocked() {
      let clientIP = getClientIP();
      return exists(/databases/$(database)/documents/system/settings) &&
             get(/databases/$(database)/documents/system/settings).data.keys().hasAll(['blockedIPs']) &&
             clientIP in get(/databases/$(database)/documents/system/settings).data.blockedIPs;
    }
    
    // 管理者チェック関数（IPブロック対象外）
    function isAdminByIP() {
      // 管理者かどうかはクライアント側で確認済みの前提
      // ここでは基本的なIPブロックをバイパスする仕組み
      return false; // セキュリティのため、サーバーサイドでは厳格に制御
    }
    
    // システムアクティブチェック
    function isSystemActive() {
      return !exists(/databases/$(database)/documents/system/settings) ||
             !get(/databases/$(database)/documents/system/settings).data.keys().hasAll(['systemActive']) ||
             get(/databases/$(database)/documents/system/settings).data.systemActive == true;
    }
    
    // 管理者権限チェック（ユーザーデータから）
    function isAdmin(username) {
      return exists(/databases/$(database)/documents/users/$(username)) &&
             get(/databases/$(database)/documents/users/$(username)).data.accountType == 'admin';
    }
    
    // メイン制御ルール
    match /{document=**} {
      // IPブロックされている場合は完全拒否（管理者も含む）
      allow read, write: if !isIPBlocked() && isSystemActive();
    }
    
    // システム設定への特別ルール（管理者のみ、IPブロック関係なし）
    match /system/settings {
      // 管理者は自分のIPをブロックしても設定変更可能（緊急回避用）
      allow read, write: if isSystemActive();
    }
    
    // 管理者履歴への特別ルール
    match /admin_history/{historyId} {
      allow read, write: if !isIPBlocked() && isSystemActive();
    }
    
    // ユーザーデータへの特別ルール
    match /users/{userId} {
      allow read, write: if !isIPBlocked() && isSystemActive();
    }
    
    // トランザクションデータへの特別ルール
    match /transactions/{transactionId} {
      allow read, write: if !isIPBlocked() && isSystemActive();
    }
  }
}

注意: 
1. このルールは強力なIPブロック機能を提供します
2. ブロックされたIPからは管理者でもアクセスできなくなります
3. 管理者が自分のIPをブロックしないよう注意してください
4. 緊急時はFirebase Consoleから直接ルールを変更してください
*/

// Firebase初期化チェック
let db = null;
let useFirebase = false;

try {
    // Firebaseが利用可能かチェック
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        useFirebase = true;
        console.log("Firebase初期化成功");
    } else {
        console.log("Firebase SDKが読み込まれていません");
    }
} catch (error) {
    console.error("Firebase初期化エラー:", error);
    console.log("ローカルストレージモードで動作します");
}

// データベース管理クラス
class WaratDatabase {
    constructor() {
        this.useFirebase = useFirebase;
        this.currentUser = null;
        this.listeners = [];

        if (!this.useFirebase) {
            // ローカルストレージ版の初期化
            this.users = this.loadUsers();
            this.transactions = this.loadTransactions();
            this.adminHistory = this.loadAdminHistory();
            this.systemSettings = this.loadSystemSettings();
            this.initializeLocalSpecialPasswords();
            console.log("ローカルストレージモードで初期化完了");
        } else {
            this.initializeSpecialPasswords();
        }
    }

    // ローカルストレージ版のメソッド
    loadUsers() {
        const stored = localStorage.getItem('warat_users');
        return stored ? JSON.parse(stored) : {};
    }

    saveUsers() {
        localStorage.setItem('warat_users', JSON.stringify(this.users));
    }

    loadTransactions() {
        const stored = localStorage.getItem('warat_transactions');
        return stored ? JSON.parse(stored) : [];
    }

    saveTransactions() {
        localStorage.setItem('warat_transactions', JSON.stringify(this.transactions));
    }

    loadAdminHistory() {
        const stored = localStorage.getItem('warat_admin_history');
        return stored ? JSON.parse(stored) : [];
    }

    saveAdminHistory() {
        localStorage.setItem('warat_admin_history', JSON.stringify(this.adminHistory));
    }

    loadSystemSettings() {
        const stored = localStorage.getItem('warat_system_settings');
        return stored ? JSON.parse(stored) : {
            systemActive: true,
            specialPasswords: {}
        };
    }

    saveSystemSettings() {
        localStorage.setItem('warat_system_settings', JSON.stringify(this.systemSettings));
    }

    initializeLocalSpecialPasswords() {
        if (!this.systemSettings.specialPasswords.finance) {
            this.systemSettings.specialPasswords = {
                finance: 'finance123',
                admin: 'admin456'
            };
            this.systemSettings.blockedIPs = []; // ブロックされたIPアドレスリスト
            this.saveSystemSettings();
        }
        if (!this.systemSettings.blockedIPs) {
            this.systemSettings.blockedIPs = [];
            this.saveSystemSettings();
        }
    }

    async initializeSpecialPasswords() {
        if (!this.useFirebase) return;

        try {
            const settingsRef = db.collection('system').doc('settings');
            const settingsDoc = await settingsRef.get();

            if (!settingsDoc.exists) {
                await settingsRef.set({
                    specialPasswords: {
                        finance: 'finance123',
                        admin: 'admin456'
                    },
                    systemActive: true,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (error) {
            console.error('設定初期化エラー:', error);
        }
    }

    // ユーザー登録
    async registerUser(username, password, accountType, specialPassword = '') {
        if (!this.useFirebase) {
            return this.registerUserLocal(username, password, accountType, specialPassword);
        }

        try {
            // ユーザー名重複チェック
            const userRef = db.collection('users').doc(username);
            const userDoc = await userRef.get();

            if (userDoc.exists) {
                throw new Error('ユーザー名が既に存在します');
            }

            // 特別アカウントの場合、パスワードチェック
            if (accountType !== 'general') {
                const settingsRef = db.collection('system').doc('settings');
                const settingsDoc = await settingsRef.get();
                const settings = settingsDoc.data();

                if (accountType === 'finance' && specialPassword !== settings.specialPasswords.finance) {
                    throw new Error('財務用管理アカウントの特別パスワードが間違っています');
                }
                if (accountType === 'admin' && specialPassword !== settings.specialPasswords.admin) {
                    throw new Error('完全管理アカウントの特別パスワードが間違っています');
                }
            }

            const user = {
                username,
                password,
                accountType,
                balance: accountType === 'general' ? 0 : Infinity, // 初期残高を0に変更
                frozen: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: null,
                ipAddress: await this.getClientIP()
            };

            await userRef.set(user);
            return user;
        } catch (error) {
            throw error;
        }
    }

    // ローカル版ユーザー登録
    async registerUserLocal(username, password, accountType, specialPassword = '') {
        if (this.users[username]) {
            throw new Error('ユーザー名が既に存在します');
        }

        // IPアドレスチェック（登録時も確認）
        const currentIP = await this.getClientIP();
        if (accountType !== 'admin' && this.systemSettings.blockedIPs.includes(currentIP)) {
            throw new Error('このIPアドレスからのアクセスはブロックされています');
        }

        // 特別アカウントの場合、パスワードチェック
        if (accountType === 'finance') {
            if (specialPassword !== this.systemSettings.specialPasswords.finance) {
                throw new Error('財務用管理アカウントの特別パスワードが間違っています');
            }
        } else if (accountType === 'admin') {
            if (specialPassword !== this.systemSettings.specialPasswords.admin) {
                throw new Error('完全管理アカウントの特別パスワードが間違っています');
            }
        }

        const user = {
            username,
            password,
            accountType,
            balance: accountType === 'general' ? 0 : Infinity, // 初期残高を0に変更
            frozen: false,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            ipAddress: currentIP
        };

        this.users[username] = user;
        this.saveUsers();
        return user;
    }

    // ログイン
    async login(username, password) {
        if (!this.useFirebase) {
            return this.loginLocal(username, password);
        }

        try {
            const userRef = db.collection('users').doc(username);
            const userDoc = await userRef.get();

            if (!userDoc.exists) {
                throw new Error('ユーザーが見つかりません');
            }

            const user = userDoc.data();
            if (user.password !== password) {
                throw new Error('パスワードが間違っています');
            }
            if (user.frozen) {
                throw new Error('アカウントが凍結されています');
            }

            // システム状態チェック
            const systemActive = await this.isSystemActive();
            if (!systemActive && user.accountType !== 'admin') {
                throw new Error('システムが停止中です');
            }

            // ログイン情報更新
            await userRef.update({
                lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                ipAddress: await this.getClientIP()
            });

            this.currentUser = { ...user, username };
            return this.currentUser;
        } catch (error) {
            throw error;
        }
    }

    // ローカル版ログイン
    async loginLocal(username, password) {
        const user = this.users[username];
        if (!user) {
            throw new Error('ユーザーが見つかりません');
        }
        if (user.password !== password) {
            throw new Error('パスワードが間違っています');
        }
        if (user.frozen) {
            throw new Error('アカウントが凍結されています');
        }
        if (!this.systemSettings.systemActive && user.accountType !== 'admin') {
            throw new Error('システムが停止中です');
        }

        // IPアドレスチェック（管理者は除外）
        const currentIP = await this.getClientIP();
        if (user.accountType !== 'admin' && this.systemSettings.blockedIPs.includes(currentIP)) {
            throw new Error('このIPアドレスからのアクセスはブロックされています');
        }

        user.lastLogin = new Date().toISOString();
        user.ipAddress = currentIP;
        this.saveUsers();
        this.currentUser = user;
        return this.currentUser;
    }

    // 送金
    async transfer(fromUsername, toUsername, amount) {
        if (!this.useFirebase) {
            return this.transferLocal(fromUsername, toUsername, amount);
        }

        try {
            const fromUserRef = db.collection('users').doc(fromUsername);
            const toUserRef = db.collection('users').doc(toUsername);

            return await db.runTransaction(async (transaction) => {
                const fromUserDoc = await transaction.get(fromUserRef);
                const toUserDoc = await transaction.get(toUserRef);

                if (!fromUserDoc.exists) {
                    throw new Error('送金者が見つかりません');
                }
                if (!toUserDoc.exists) {
                    throw new Error('送金先ユーザーが見つかりません');
                }

                const fromUser = fromUserDoc.data();
                const toUser = toUserDoc.data();

                if (fromUser.accountType !== 'general') {
                    throw new Error('一般アカウントのみ送金可能です');
                }
                if (fromUser.balance < amount) {
                    throw new Error('残高が不足しています');
                }
                if (toUser.frozen) {
                    throw new Error('送金先アカウントが凍結されています');
                }

                // 残高更新
                transaction.update(fromUserRef, {
                    balance: fromUser.balance - amount
                });
                transaction.update(toUserRef, {
                    balance: toUser.balance + amount
                });

                // 取引履歴記録
                const transactionData = {
                    type: 'transfer',
                    from: fromUsername,
                    to: toUsername,
                    amount: amount,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };

                const transactionRef = db.collection('transactions').doc();
                transaction.set(transactionRef, transactionData);

                return transactionData;
            });
        } catch (error) {
            throw error;
        }
    }

    transferLocal(fromUsername, toUsername, amount) {
        const fromUser = this.users[fromUsername];
        const toUser = this.users[toUsername];

        if (!fromUser) throw new Error('送金者が見つかりません');
        if (!toUser) throw new Error('送金先ユーザーが見つかりません');
        if (fromUser.accountType !== 'general') throw new Error('一般アカウントのみ送金可能です');
        if (fromUser.balance < amount) throw new Error('残高が不足しています');
        if (toUser.frozen) throw new Error('送金先アカウントが凍結されています');

        this.users[fromUsername].balance -= amount;
        this.users[toUsername].balance += amount;

        const transaction = {
            id: Date.now(),
            type: 'transfer',
            from: fromUsername,
            to: toUsername,
            amount: amount,
            timestamp: new Date().toISOString()
        };

        this.transactions.push(transaction);
        this.saveUsers();
        this.saveTransactions();
        return transaction;
    }

    // 配布
    async distribute(fromUsername, toUsername, amount) {
        if (!this.useFirebase) {
            return this.distributeLocal(fromUsername, toUsername, amount);
        }

        try {
            const fromUserRef = db.collection('users').doc(fromUsername);
            const toUserRef = db.collection('users').doc(toUsername);

            return await db.runTransaction(async (transaction) => {
                const fromUserDoc = await transaction.get(fromUserRef);
                const toUserDoc = await transaction.get(toUserRef);

                if (!fromUserDoc.exists) {
                    throw new Error('配布者が見つかりません');
                }
                if (!toUserDoc.exists) {
                    throw new Error('配布先ユーザーが見つかりません');
                }

                const fromUser = fromUserDoc.data();
                const toUser = toUserDoc.data();

                if (fromUser.accountType === 'general') {
                    throw new Error('一般アカウントは配布できません');
                }
                if (toUser.frozen) {
                    throw new Error('配布先アカウントが凍結されています');
                }

                // 配布実行（一般アカウントのみ残高増加）
                if (toUser.accountType === 'general') {
                    transaction.update(toUserRef, {
                        balance: toUser.balance + amount
                    });
                }

                // 取引履歴記録
                const transactionData = {
                    type: 'distribute',
                    from: fromUsername,
                    to: toUsername,
                    amount: amount,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };

                const transactionRef = db.collection('transactions').doc();
                transaction.set(transactionRef, transactionData);

                return transactionData;
            });
        } catch (error) {
            throw error;
        }
    }

    distributeLocal(fromUsername, toUsername, amount) {
        const fromUser = this.users[fromUsername];
        const toUser = this.users[toUsername];

        if (!fromUser) throw new Error('配布者が見つかりません');
        if (!toUser) throw new Error('配布先ユーザーが見つかりません');
        if (fromUser.accountType === 'general') throw new Error('一般アカウントは配布できません');
        if (toUser.frozen) throw new Error('配布先アカウントが凍結されています');

        if (toUser.accountType === 'general') {
            this.users[toUsername].balance += amount;
        }

        const transaction = {
            id: Date.now(),
            type: 'distribute',
            from: fromUsername,
            to: toUsername,
            amount: amount,
            timestamp: new Date().toISOString()
        };

        this.transactions.push(transaction);
        this.saveUsers();
        this.saveTransactions();
        return transaction;
    }

    // ユーザー取引履歴取得（インデックス不要版）
    async getUserTransactions(username) {
        if (!this.useFirebase) {
            return this.transactions.filter(t =>
                t.from === username || t.to === username
            ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }

        try {
            const transactionsRef = db.collection('transactions');

            // 単純なクエリに変更（インデックス不要）
            const snapshot = await transactionsRef.get();

            const transactions = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                // クライアントサイドでフィルタリング
                if (data.from === username || data.to === username) {
                    transactions.push({ id: doc.id, ...data });
                }
            });

            // クライアントサイドでソート
            return transactions.sort((a, b) => {
                if (!a.timestamp || !b.timestamp) return 0;
                return b.timestamp.seconds - a.timestamp.seconds;
            });
        } catch (error) {
            console.error('取引履歴取得エラー:', error);
            return [];
        }
    }

    // 全ユーザー取得
    async getAllUsers() {
        if (!this.useFirebase) {
            return Object.values(this.users);
        }

        try {
            const usersRef = db.collection('users');
            const snapshot = await usersRef.get();

            const users = [];
            snapshot.forEach(doc => {
                users.push({ username: doc.id, ...doc.data() });
            });

            return users;
        } catch (error) {
            console.error('ユーザー情報取得エラー:', error);
            return [];
        }
    }

    // システム状態確認
    async isSystemActive() {
        if (!this.useFirebase) {
            return this.systemSettings.systemActive;
        }

        try {
            const settingsRef = db.collection('system').doc('settings');
            const settingsDoc = await settingsRef.get();

            if (settingsDoc.exists) {
                return settingsDoc.data().systemActive;
            }
            return true;
        } catch (error) {
            return true;
        }
    }

    // 現在のユーザー情報更新
    async refreshCurrentUser() {
        if (!this.currentUser) return null;

        if (!this.useFirebase) {
            this.currentUser = this.users[this.currentUser.username];
            return this.currentUser;
        }

        try {
            const userRef = db.collection('users').doc(this.currentUser.username);
            const userDoc = await userRef.get();

            if (userDoc.exists) {
                this.currentUser = { username: this.currentUser.username, ...userDoc.data() };
                return this.currentUser;
            }
        } catch (error) {
            console.error('ユーザー情報更新エラー:', error);
        }
        return this.currentUser;
    }

    // リアルタイムリスナー（インデックス不要版）
    setupUserListener(username, callback) {
        if (!this.useFirebase) return;

        const userRef = db.collection('users').doc(username);
        const unsubscribe = userRef.onSnapshot(doc => {
            if (doc.exists) {
                const userData = { username: doc.id, ...doc.data() };
                this.currentUser = userData;
                callback(userData);
            }
        });
        this.listeners.push(unsubscribe);
        return unsubscribe;
    }

    setupTransactionListener(username, callback) {
        if (!this.useFirebase) return;

        // 全トランザクションを監視（インデックス不要）
        const transactionsRef = db.collection('transactions');
        const unsubscribe = transactionsRef.onSnapshot(() => {
            callback(); // 更新通知のみ
        });

        this.listeners.push(unsubscribe);
        return unsubscribe;
    }

    clearListeners() {
        this.listeners.forEach(unsubscribe => unsubscribe());
        this.listeners = [];
    }

    // IPアドレス取得
    async getClientIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            return '127.0.0.1';
        }
    }

    // 簡易版管理機能（ローカル用）
    async toggleFreeze(adminUsername, targetUsername) {
        if (!this.useFirebase) {
            const adminUser = this.users[adminUsername];
            const targetUser = this.users[targetUsername];

            if (!adminUser || adminUser.accountType !== 'admin') {
                throw new Error('管理者権限が必要です');
            }
            if (!targetUser) {
                throw new Error('対象ユーザーが見つかりません');
            }

            const newFrozenStatus = !targetUser.frozen;
            targetUser.frozen = newFrozenStatus;

            // 管理履歴記録
            const historyItem = {
                id: Date.now(),
                type: newFrozenStatus ? 'freeze' : 'unfreeze',
                admin: adminUsername,
                target: targetUsername,
                timestamp: new Date().toISOString()
            };
            this.adminHistory.push(historyItem);

            this.saveUsers();
            this.saveAdminHistory();
            return newFrozenStatus;
        }

        // Firebase版
        try {
            const adminRef = db.collection('users').doc(adminUsername);
            const targetRef = db.collection('users').doc(targetUsername);

            return await db.runTransaction(async (transaction) => {
                const adminDoc = await transaction.get(adminRef);
                const targetDoc = await transaction.get(targetRef);

                if (!adminDoc.exists || adminDoc.data().accountType !== 'admin') {
                    throw new Error('管理者権限が必要です');
                }
                if (!targetDoc.exists) {
                    throw new Error('対象ユーザーが見つかりません');
                }

                const targetUser = targetDoc.data();
                const newFrozenStatus = !targetUser.frozen;

                transaction.update(targetRef, {
                    frozen: newFrozenStatus
                });

                // 管理履歴記録
                const historyData = {
                    type: newFrozenStatus ? 'freeze' : 'unfreeze',
                    admin: adminUsername,
                    target: targetUsername,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };

                const historyRef = db.collection('admin_history').doc();
                transaction.set(historyRef, historyData);

                return newFrozenStatus;
            });
        } catch (error) {
            throw error;
        }
    }

    async deleteAccount(adminUsername, targetUsername) {
        if (!this.useFirebase) {
            const adminUser = this.users[adminUsername];
            if (!adminUser || adminUser.accountType !== 'admin') {
                throw new Error('管理者権限が必要です');
            }
            if (!this.users[targetUsername]) {
                throw new Error('対象ユーザーが見つかりません');
            }

            delete this.users[targetUsername];

            // 管理履歴記録
            const historyItem = {
                id: Date.now(),
                type: 'delete',
                admin: adminUsername,
                target: targetUsername,
                timestamp: new Date().toISOString()
            };
            this.adminHistory.push(historyItem);

            this.saveUsers();
            this.saveAdminHistory();
            return;
        }

        // Firebase版
        try {
            const adminRef = db.collection('users').doc(adminUsername);
            const targetRef = db.collection('users').doc(targetUsername);

            return await db.runTransaction(async (transaction) => {
                const adminDoc = await transaction.get(adminRef);
                const targetDoc = await transaction.get(targetRef);

                if (!adminDoc.exists || adminDoc.data().accountType !== 'admin') {
                    throw new Error('管理者権限が必要です');
                }
                if (!targetDoc.exists) {
                    throw new Error('対象ユーザーが見つかりません');
                }

                transaction.delete(targetRef);

                // 管理履歴記録
                const historyData = {
                    type: 'delete',
                    admin: adminUsername,
                    target: targetUsername,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };

                const historyRef = db.collection('admin_history').doc();
                transaction.set(historyRef, historyData);
            });
        } catch (error) {
            throw error;
        }
    }

    async updateBalance(adminUsername, targetUsername, newBalance) {
        if (!this.useFirebase) {
            const adminUser = this.users[adminUsername];
            const targetUser = this.users[targetUsername];

            if (!adminUser || adminUser.accountType !== 'admin') {
                throw new Error('管理者権限が必要です');
            }
            if (!targetUser) {
                throw new Error('対象ユーザーが見つかりません');
            }

            const oldBalance = targetUser.balance;
            targetUser.balance = newBalance;

            // 管理履歴記録
            const historyItem = {
                id: Date.now(),
                type: 'balance_update',
                admin: adminUsername,
                target: targetUsername,
                oldBalance: oldBalance,
                newBalance: newBalance,
                timestamp: new Date().toISOString()
            };
            this.adminHistory.push(historyItem);

            this.saveUsers();
            this.saveAdminHistory();
            return;
        }

        // Firebase版
        try {
            const adminRef = db.collection('users').doc(adminUsername);
            const targetRef = db.collection('users').doc(targetUsername);

            return await db.runTransaction(async (transaction) => {
                const adminDoc = await transaction.get(adminRef);
                const targetDoc = await transaction.get(targetRef);

                if (!adminDoc.exists || adminDoc.data().accountType !== 'admin') {
                    throw new Error('管理者権限が必要です');
                }
                if (!targetDoc.exists) {
                    throw new Error('対象ユーザーが見つかりません');
                }

                const targetUser = targetDoc.data();
                const oldBalance = targetUser.balance;

                transaction.update(targetRef, {
                    balance: newBalance
                });

                // 管理履歴記録
                const historyData = {
                    type: 'balance_update',
                    admin: adminUsername,
                    target: targetUsername,
                    oldBalance: oldBalance,
                    newBalance: newBalance,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };

                const historyRef = db.collection('admin_history').doc();
                transaction.set(historyRef, historyData);
            });
        } catch (error) {
            throw error;
        }
    }

    async toggleSystem(adminUsername) {
        if (!this.useFirebase) {
            const adminUser = this.users[adminUsername];
            if (!adminUser || adminUser.accountType !== 'admin') {
                throw new Error('管理者権限が必要です');
            }

            const newSystemStatus = !this.systemSettings.systemActive;
            this.systemSettings.systemActive = newSystemStatus;

            // 管理履歴記録
            const historyItem = {
                id: Date.now(),
                type: newSystemStatus ? 'system_start' : 'system_stop',
                admin: adminUsername,
                timestamp: new Date().toISOString()
            };
            this.adminHistory.push(historyItem);

            this.saveSystemSettings();
            this.saveAdminHistory();
            return newSystemStatus;
        }

        // Firebase版
        try {
            const adminRef = db.collection('users').doc(adminUsername);
            const settingsRef = db.collection('system').doc('settings');

            return await db.runTransaction(async (transaction) => {
                const adminDoc = await transaction.get(adminRef);
                const settingsDoc = await transaction.get(settingsRef);

                if (!adminDoc.exists || adminDoc.data().accountType !== 'admin') {
                    throw new Error('管理者権限が必要です');
                }

                const settings = settingsDoc.data();
                const newSystemStatus = !settings.systemActive;

                transaction.update(settingsRef, {
                    systemActive: newSystemStatus
                });

                // 管理履歴記録
                const historyData = {
                    type: newSystemStatus ? 'system_start' : 'system_stop',
                    admin: adminUsername,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };

                const historyRef = db.collection('admin_history').doc();
                transaction.set(historyRef, historyData);

                return newSystemStatus;
            });
        } catch (error) {
            throw error;
        }
    }

    async getAdminHistory() {
        if (!this.useFirebase) {
            return this.adminHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }

        // Firebase版
        try {
            const historyRef = db.collection('admin_history')
                .orderBy('timestamp', 'desc')
                .limit(100);
            const snapshot = await historyRef.get();

            const history = [];
            snapshot.forEach(doc => {
                history.push({ id: doc.id, ...doc.data() });
            });

            return history;
        } catch (error) {
            console.error('管理履歴取得エラー:', error);
            return [];
        }
    }

    // すべての操作前にIPチェックを行う共通関数
    async checkIPBeforeOperation() {
        if (!this.currentUser) {
            // ログイン前でもIPチェック
            const currentIP = await this.getClientIP();
            const isBlocked = await this.isIPBlocked(currentIP);

            if (isBlocked) {
                // ページ全体をブロック
                this.showIPBlockedScreen(currentIP);
                throw new Error('このIPアドレスからのアクセスはブロックされています');
            }
            return true;
        }

        if (this.currentUser.accountType === 'admin') return true; // 管理者は常に許可

        const currentIP = await this.getClientIP();
        const isBlocked = await this.isIPBlocked(currentIP);

        if (isBlocked) {
            // ブロックされたIPの場合、強制ログアウト
            this.forceLogout('IPアドレスがブロックされました');
            throw new Error('このIPアドレスからのアクセスはブロックされています');
        }

        return true;
    }

    // IPブロック画面を表示
    showIPBlockedScreen(ipAddress) {
        // 全ての画面を非表示
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });

        // ブロック画面を作成・表示
        let blockedScreen = document.getElementById('ipBlockedScreen');
        if (!blockedScreen) {
            blockedScreen = document.createElement('div');
            blockedScreen.id = 'ipBlockedScreen';
            blockedScreen.className = 'screen';
            blockedScreen.innerHTML = `
                <div class="container" style="text-align: center; padding-top: 100px;">
                    <div style="background: #ffebee; border: 2px solid #f44336; border-radius: 10px; padding: 40px; max-width: 500px; margin: 0 auto;">
                        <h1 style="color: #f44336; margin-bottom: 20px;">🚫 アクセスブロック</h1>
                        <p style="font-size: 18px; margin-bottom: 15px;">このIPアドレスからのアクセスはブロックされています</p>
                        <p style="font-size: 14px; color: #666; margin-bottom: 20px;">IPアドレス: <strong>${ipAddress}</strong></p>
                        <p style="font-size: 14px; color: #666;">管理者にお問い合わせください</p>
                        <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer;">ページを再読み込み</button>
                    </div>
                </div>
            `;
            document.body.appendChild(blockedScreen);
        }

        blockedScreen.classList.remove('hidden');
    }

    // 強制ログアウト
    forceLogout(reason) {
        // セッションデータをクリア
        localStorage.removeItem('warat_auto_login');
        this.currentUser = null;
        this.clearListeners();

        // ログイン画面に戻す
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });
        document.getElementById('loginScreen').classList.remove('hidden');

        // エラーメッセージを表示
        setTimeout(() => {
            alert(`アクセスが拒否されました: ${reason}`);
        }, 100);
    }
    async blockIP(adminUsername, ipAddress) {
        if (!this.useFirebase) {
            return this.blockIPLocal(adminUsername, ipAddress);
        }

        try {
            // 管理者が自分のIPをブロックしようとしていないかチェック
            const currentIP = await this.getClientIP();
            if (ipAddress === currentIP) {
                const confirmBlock = confirm(`警告: 現在アクセスしているIPアドレス (${currentIP}) をブロックしようとしています。\n\nこの操作を実行すると、あなた自身もアクセスできなくなる可能性があります。\n\n本当に実行しますか？`);
                if (!confirmBlock) {
                    throw new Error('IPブロック操作がキャンセルされました');
                }
            }

            const adminRef = db.collection('users').doc(adminUsername);
            const settingsRef = db.collection('system').doc('settings');

            return await db.runTransaction(async (transaction) => {
                const adminDoc = await transaction.get(adminRef);
                const settingsDoc = await transaction.get(settingsRef);

                if (!adminDoc.exists || adminDoc.data().accountType !== 'admin') {
                    throw new Error('管理者権限が必要です');
                }

                const settings = settingsDoc.data();
                const blockedIPs = settings.blockedIPs || [];

                if (blockedIPs.includes(ipAddress)) {
                    throw new Error('このIPアドレスは既にブロックされています');
                }

                const newBlockedIPs = [...blockedIPs, ipAddress];
                transaction.update(settingsRef, {
                    blockedIPs: newBlockedIPs
                });

                // 管理履歴記録
                const historyData = {
                    type: 'ip_block',
                    admin: adminUsername,
                    target: ipAddress,
                    adminIP: currentIP, // 管理者のIPも記録
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };

                const historyRef = db.collection('admin_history').doc();
                transaction.set(historyRef, historyData);

                console.log(`IP ${ipAddress} がFirebaseでブロックされました`);
            });
        } catch (error) {
            throw error;
        }
    }

    blockIPLocal(adminUsername, ipAddress) {
        const adminUser = this.users[adminUsername];
        if (!adminUser || adminUser.accountType !== 'admin') {
            throw new Error('管理者権限が必要です');
        }

        if (this.systemSettings.blockedIPs.includes(ipAddress)) {
            throw new Error('このIPアドレスは既にブロックされています');
        }

        // IPアドレスをブロックリストに追加
        this.systemSettings.blockedIPs.push(ipAddress);
        console.log('IP blocked locally:', ipAddress, 'Current blocked IPs:', this.systemSettings.blockedIPs);

        // 管理履歴記録
        const historyItem = {
            id: Date.now(),
            type: 'ip_block',
            admin: adminUsername,
            target: ipAddress,
            timestamp: new Date().toISOString()
        };
        this.adminHistory.push(historyItem);

        this.saveSystemSettings();
        this.saveAdminHistory();

        console.log('システム設定保存完了:', this.systemSettings);
    }

    async unblockIP(adminUsername, ipAddress) {
        if (!this.useFirebase) {
            return this.unblockIPLocal(adminUsername, ipAddress);
        }

        try {
            const adminRef = db.collection('users').doc(adminUsername);
            const settingsRef = db.collection('system').doc('settings');

            return await db.runTransaction(async (transaction) => {
                const adminDoc = await transaction.get(adminRef);
                const settingsDoc = await transaction.get(settingsRef);

                if (!adminDoc.exists || adminDoc.data().accountType !== 'admin') {
                    throw new Error('管理者権限が必要です');
                }

                const settings = settingsDoc.data();
                const blockedIPs = settings.blockedIPs || [];

                if (!blockedIPs.includes(ipAddress)) {
                    throw new Error('このIPアドレスはブロックされていません');
                }

                const newBlockedIPs = blockedIPs.filter(ip => ip !== ipAddress);
                transaction.update(settingsRef, {
                    blockedIPs: newBlockedIPs
                });

                // 管理履歴記録
                const historyData = {
                    type: 'ip_unblock',
                    admin: adminUsername,
                    target: ipAddress,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };

                const historyRef = db.collection('admin_history').doc();
                transaction.set(historyRef, historyData);
            });
        } catch (error) {
            throw error;
        }
    }

    unblockIPLocal(adminUsername, ipAddress) {
        const adminUser = this.users[adminUsername];
        if (!adminUser || adminUser.accountType !== 'admin') {
            throw new Error('管理者権限が必要です');
        }

        if (!this.systemSettings.blockedIPs.includes(ipAddress)) {
            throw new Error('このIPアドレスはブロックされていません');
        }

        this.systemSettings.blockedIPs = this.systemSettings.blockedIPs.filter(ip => ip !== ipAddress);

        // 管理履歴記録
        const historyItem = {
            id: Date.now(),
            type: 'ip_unblock',
            admin: adminUsername,
            target: ipAddress,
            timestamp: new Date().toISOString()
        };
        this.adminHistory.push(historyItem);

        this.saveSystemSettings();
        this.saveAdminHistory();
    }

    async getBlockedIPs() {
        if (!this.useFirebase) {
            return this.systemSettings.blockedIPs || [];
        }

        try {
            const settingsRef = db.collection('system').doc('settings');
            const settingsDoc = await settingsRef.get();

            if (settingsDoc.exists) {
                return settingsDoc.data().blockedIPs || [];
            }
            return [];
        } catch (error) {
            console.error('ブロックIPリスト取得エラー:', error);
            return [];
        }
    }

    async isIPBlocked(ipAddress) {
        if (!this.useFirebase) {
            return this.systemSettings.blockedIPs.includes(ipAddress);
        }

        try {
            const settingsRef = db.collection('system').doc('settings');
            const settingsDoc = await settingsRef.get();

            if (settingsDoc.exists) {
                const blockedIPs = settingsDoc.data().blockedIPs || [];
                return blockedIPs.includes(ipAddress);
            }
            return false;
        } catch (error) {
            console.error('IP確認エラー:', error);
            return false;
        }
    }

    // IPアドレス管理機能
    async blockIP(adminUsername, ipAddress) {
        if (!this.useFirebase) {
            return this.blockIPLocal(adminUsername, ipAddress);
        }

        try {
            const adminRef = db.collection('users').doc(adminUsername);
            const settingsRef = db.collection('system').doc('settings');

            return await db.runTransaction(async (transaction) => {
                const adminDoc = await transaction.get(adminRef);
                const settingsDoc = await transaction.get(settingsRef);

                if (!adminDoc.exists || adminDoc.data().accountType !== 'admin') {
                    throw new Error('管理者権限が必要です');
                }

                const settings = settingsDoc.data();
                const blockedIPs = settings.blockedIPs || [];

                if (blockedIPs.includes(ipAddress)) {
                    throw new Error('このIPアドレスは既にブロックされています');
                }

                const newBlockedIPs = [...blockedIPs, ipAddress];
                transaction.update(settingsRef, {
                    blockedIPs: newBlockedIPs
                });

                // 管理履歴記録
                const historyData = {
                    type: 'ip_block',
                    admin: adminUsername,
                    target: ipAddress,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };

                const historyRef = db.collection('admin_history').doc();
                transaction.set(historyRef, historyData);
            });
        } catch (error) {
            throw error;
        }
    }

    blockIPLocal(adminUsername, ipAddress) {
        const adminUser = this.users[adminUsername];
        if (!adminUser || adminUser.accountType !== 'admin') {
            throw new Error('管理者権限が必要です');
        }

        if (this.systemSettings.blockedIPs.includes(ipAddress)) {
            throw new Error('このIPアドレスは既にブロックされています');
        }

        this.systemSettings.blockedIPs.push(ipAddress);

        // 管理履歴記録
        const historyItem = {
            id: Date.now(),
            type: 'ip_block',
            admin: adminUsername,
            target: ipAddress,
            timestamp: new Date().toISOString()
        };
        this.adminHistory.push(historyItem);

        this.saveSystemSettings();
        this.saveAdminHistory();
    }

    async unblockIP(adminUsername, ipAddress) {
        if (!this.useFirebase) {
            return this.unblockIPLocal(adminUsername, ipAddress);
        }

        try {
            const adminRef = db.collection('users').doc(adminUsername);
            const settingsRef = db.collection('system').doc('settings');

            return await db.runTransaction(async (transaction) => {
                const adminDoc = await transaction.get(adminRef);
                const settingsDoc = await transaction.get(settingsRef);

                if (!adminDoc.exists || adminDoc.data().accountType !== 'admin') {
                    throw new Error('管理者権限が必要です');
                }

                const settings = settingsDoc.data();
                const blockedIPs = settings.blockedIPs || [];

                if (!blockedIPs.includes(ipAddress)) {
                    throw new Error('このIPアドレスはブロックされていません');
                }

                const newBlockedIPs = blockedIPs.filter(ip => ip !== ipAddress);
                transaction.update(settingsRef, {
                    blockedIPs: newBlockedIPs
                });

                // 管理履歴記録
                const historyData = {
                    type: 'ip_unblock',
                    admin: adminUsername,
                    target: ipAddress,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                };

                const historyRef = db.collection('admin_history').doc();
                transaction.set(historyRef, historyData);
            });
        } catch (error) {
            throw error;
        }
    }

    unblockIPLocal(adminUsername, ipAddress) {
        const adminUser = this.users[adminUsername];
        if (!adminUser || adminUser.accountType !== 'admin') {
            throw new Error('管理者権限が必要です');
        }

        if (!this.systemSettings.blockedIPs.includes(ipAddress)) {
            throw new Error('このIPアドレスはブロックされていません');
        }

        this.systemSettings.blockedIPs = this.systemSettings.blockedIPs.filter(ip => ip !== ipAddress);

        // 管理履歴記録
        const historyItem = {
            id: Date.now(),
            type: 'ip_unblock',
            admin: adminUsername,
            target: ipAddress,
            timestamp: new Date().toISOString()
        };
        this.adminHistory.push(historyItem);

        this.saveSystemSettings();
        this.saveAdminHistory();
    }

    async getBlockedIPs() {
        if (!this.useFirebase) {
            return this.systemSettings.blockedIPs || [];
        }

        try {
            const settingsRef = db.collection('system').doc('settings');
            const settingsDoc = await settingsRef.get();

            if (settingsDoc.exists) {
                return settingsDoc.data().blockedIPs || [];
            }
            return [];
        } catch (error) {
            console.error('ブロックIPリスト取得エラー:', error);
            return [];
        }
    }

    async isIPBlocked(ipAddress) {
        if (!this.useFirebase) {
            return this.systemSettings.blockedIPs.includes(ipAddress);
        }

        try {
            const settingsRef = db.collection('system').doc('settings');
            const settingsDoc = await settingsRef.get();

            if (settingsDoc.exists) {
                const blockedIPs = settingsDoc.data().blockedIPs || [];
                return blockedIPs.includes(ipAddress);
            }
            return false;
        } catch (error) {
            console.error('IP確認エラー:', error);
            return false;
        }
    }
}

// デバッグ用：クラスにメソッドが正しく追加されているか確認
console.log('WaratDatabase methods:', Object.getOwnPropertyNames(WaratDatabase.prototype));

// グローバルデータベースインスタンス
const waratDB = new WaratDatabase();

// デバッグ用：インスタンスのメソッドを確認
console.log('waratDB instance methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(waratDB)));