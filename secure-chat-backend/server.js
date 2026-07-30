const express = require('express');
const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, 'public')));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl || '', supabaseKey || '');

// 新規登録API
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'すべての項目を入力してください。' });
        }

        const { data: existingUsers, error: searchError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email);

        if (searchError) throw searchError;
        if (existingUsers && existingUsers.length > 0) {
            return res.status(400).json({ error: 'このメールアドレスは既に登録されています。' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const { error } = await supabase
            .from('users')
            .insert([{ name, email, password: hashedPassword }]);

        if (error) throw error;

        res.json({ success: true, message: '登録が完了しました！' });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
});

// ログインAPI
app.post('/api/login', async (req, strRes) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return strRes.status(400).json({ error: 'メールアドレスとパスワードを入力してください。' });
        }

        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email);

        if (error) throw error;
        if (!users || users.length === 0) {
            return strRes.status(400).json({ error: 'メールアドレスまたはパスワードが間違っています。' });
        }

        const user = users[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return strRes.status(400).json({ error: 'メールアドレスまたはパスワードが間違っています。' });
        }

        strRes.json({ success: true, name: user.name });
    } catch (err) {
        console.error('Login error:', err);
        strRes.status(500).json({ error: 'サーバーエラーが発生しました。' });
    }
});

// メッセージ取得API
app.get('/api/messages', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;
        res.json({ global: data || [] });
    } catch (err) {
        console.error('Get messages error:', err);
        res.status(500).json({ global: [] });
    }
});

// メッセージ送信API
app.post('/api/messages', async (req, res) => {
    try {
        const { sender, text, time, read } = req.body;
        if (!sender || !text) {
            return res.status(400).json({ error: '送信者と本文が必要です。' });
        }

        const newMessage = {
            sender,
            text,
            time: time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            read: read !== undefined ? read : true
        };

        const { data, error } = await supabase
            .from('messages')
            .insert([newMessage])
            .select();

        if (error) throw error;

        res.json({ success: true, message: data[0] });
    } catch (err) {
        console.error('Post message error:', err);
        res.status(500).json({ error: 'メッセージの送信に失敗しました。' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
