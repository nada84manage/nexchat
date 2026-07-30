const express = require('express');
const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl || '', supabaseKey || '');

app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'すべての項目を入力してください。' });
        }

        const { data: existingUsers, error: searchError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email);

        if (searchError) throw searchError;
        if (existingUsers && existingUsers.length > 0) {
            return res.status(400).json({ success: false, message: 'このメールアドレスは既に登録されています。' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const { data, error } = await supabase
            .from('users')
            .insert([{ name, email, password: hashedPassword }])
            .select();

        if (error) throw error;

        res.json({ success: true, message: '登録が完了しました！', user: { name: data[0].name, email: data[0].email } });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ success: false, message: 'サーバーエラーが発生しました。' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'メールアドレスとパスワードを入力してください。' });
        }

        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email);

        if (error) throw error;
        if (!users || users.length === 0) {
            return res.status(400).json({ success: false, message: 'メールアドレスまたはパスワードが間違っています。' });
        }

        const user = users[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(400).json({ success: false, message: 'メールアドレスまたはパスワードが間違っています。' });
        }

        res.json({ success: true, message: 'ログイン成功！', user: { name: user.name, email: user.email } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'サーバーエラーが発生しました。' });
    }
});

app.get('/api/messages', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        console.error('Get messages error:', err);
        res.status(500).json({ success: false, message: 'メッセージの取得に失敗しました。' });
    }
});

app.post('/api/messages', async (req, res) => {
    try {
        const { sender, text, time, read } = req.body;
        if (!sender || !text) {
            return res.status(400).json({ success: false, message: '送信者と本文が必要です。' });
        }

        const newMessage = {
            sender,
            text,
            time: time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            read: read || '既読'
        };

        const { data, error } = await supabase
            .from('messages')
            .insert([newMessage])
            .select();

        if (error) throw error;

        res.json({ success: true, message: data[0] });
    } catch (err) {
        console.error('Post message error:', err);
        res.status(500).json({ success: false, message: 'メッセージの送信に失敗しました。' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
