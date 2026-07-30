const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());

// データを保存するファイルのパス
const DB_FILE = path.join(__dirname, 'users.json');

// ユーザーデータをファイルから読み込む関数
function loadUsers() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('データの読み込みエラー:', error);
    }
    return [];
}

// ユーザーデータをファイルに保存する関数
function saveUsers(users) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2), 'utf8');
    } catch (error) {
        console.error('データの保存エラー:', error);
    }
}

// 新規登録エンドポイント
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const users = loadUsers();

        const existingUser = users.find(u => u.email === email);
        if (existingUser) {
            return res.status(400).json({ error: 'このメールアドレスは既に登録されています。' });
        }

        // パスワードのハッシュ化
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = {
            name,
            email,
            password: hashedPassword // ハッシュ化されたパスワードのみ保存
        };
        
        users.push(newUser);
        saveUsers(users); // ファイルに永続保存

        console.log("アカウントが永続ファイルに保存されました:", email);
        res.status(201).json({ message: 'アカウントが安全に作成されました。' });

    } catch (error) {
        res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
});

// ログインエンドポイント
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const users = loadUsers();

        const user = users.find(u => u.email === email);
        if (!user) {
            return res.status(400).json({ error: 'メールアドレスまたはパスワードが間違っています。' });
        }

        // ハッシュ値の比較検証
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'メールアドレスまたはパスワードが間違っています。' });
        }

        res.status(200).json({ message: 'ログイン成功', name: user.name });
    } catch (error) {
        res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
});

// サーバー起動
app.listen(3000, () => {
    console.log('セキュアサーバー（永続化対応）がポート3000で起動しました');
});