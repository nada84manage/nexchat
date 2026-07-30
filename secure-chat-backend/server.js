const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const DB_FILE = path.join(__dirname, 'users.json');
const MSG_FILE = path.join(__dirname, 'messages.json');

function loadData(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (error) {
        console.error('ファイル読み込みエラー:', error);
    }
    return filePath === DB_FILE ? [] : { global: [] };
}

function saveData(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('ファイル保存エラー:', error);
    }
}

app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const users = loadData(DB_FILE);

        if (users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'このメールアドレスは既に登録されています。' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        users.push({ name, email, password: hashedPassword });
        saveData(DB_FILE, users);

        res.status(201).json({ message: 'アカウントが作成されました。' });
    } catch (error) {
        res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const users = loadData(DB_FILE);

        const user = users.find(u => u.email === email);
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ error: 'メールアドレスまたはパスワードが間違っています。' });
        }

        res.status(200).json({ message: 'ログイン成功', name: user.name });
    } catch (error) {
        res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
});

app.get('/api/messages', (req, res) => {
    const data = loadData(MSG_FILE);
    res.status(200).json(data);
});

app.post('/api/messages', (req, res) => {
    try {
        const { sender, text, time } = req.body;
        const data = loadData(MSG_FILE);

        if (!data.global) data.global = [];
        
        const newMessage = { sender, text, time, read: false };
        data.global.push(newMessage);
        saveData(MSG_FILE, data);

        res.status(201).json(newMessage);
    } catch (error) {
        res.status(500).json({ error: 'メッセージの保存に失敗しました。' });
    }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production' && require.main === module) {
    app.listen(PORT, () => console.log(`サーバー起動: ポート ${PORT}`));
}

module.exports = app;
