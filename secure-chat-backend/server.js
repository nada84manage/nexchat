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

// Vercelなどのサーバーレス環境では /tmp ディレクトリを使用する
const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';
const DATA_DIR = isVercel ? '/tmp' : __dirname;

const DB_FILE = path.join(DATA_DIR, 'users.json');
const MSG_FILE = path.join(DATA_DIR, 'messages.json');

// 初期ファイルが存在しない場合に備えて空ファイルを作成しておく関数
function ensureFileExists(filePath, defaultData) {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf8');
        }
    } catch (error) {
        console.error('ファイル初期化エラー:', error);
    }
}

ensureFileExists(DB_FILE, []);
ensureFileExists(MSG_FILE, { global: [] });

function loadData(filePath, defaultData) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('読み込みエラー:', error);
    }
    return defaultData;
}

function saveData(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('保存エラー:', error);
    }
}

app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const users = loadData(DB_FILE, []);

        if (users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'このメールアドレスは既に登録されています。' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        users.push({ name, email, password: hashedPassword });
        saveData(DB_FILE, users);

        res.status(201).json({ message: 'アカウント作成成功' });
    } catch (error) {
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const users = loadData(DB_FILE, []);

        const user = users.find(u => u.email === email);
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ error: 'メールまたはパスワードが間違っています。' });
        }

        res.status(200).json({ message: 'ログイン成功', name: user.name });
    } catch (error) {
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

app.get('/api/messages', (req, res) => {
    const data = loadData(MSG_FILE, { global: [] });
    res.status(200).json(data);
});

app.post('/api/messages', (req, res) => {
    try {
        const { sender, text, time } = req.body;
        const data = loadData(MSG_FILE, { global: [] });

        if (!data.global) data.global = [];
        
        const newMessage = { sender, text, time, read: true };
        data.global.push(newMessage);
        saveData(MSG_FILE, data);

        res.status(201).json(newMessage);
    } catch (error) {
        res.status(500).json({ error: '保存失敗' });
    }
});

const PORT = process.env.PORT || 3000;
if (!isVercel && require.main === module) {
    app.listen(PORT, () => console.log(`起動: ${PORT}`));
}

module.exports = app;
