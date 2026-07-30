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

// タイピング状態を一時保存するメモリ { "送信者_受信者": タイムスタンプ }
const typingStatus = {};

// 新規登録API
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
        const { error } = await supabase
            .from('users')
            .insert([{ name, email, password: hashedPassword }]);

        if (error) throw error;
        res.json({ success: true, message: '登録が完了しました！' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'サーバーエラーが発生しました。' });
    }
});

// ログインAPI
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email);

        if (error || !users || users.length === 0) {
            return res.status(400).json({ success: false, message: 'メールアドレスまたはパスワードが間違っています。' });
        }

        const user = users[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(400).json({ success: false, message: 'メールアドレスまたはパスワードが間違っています。' });
        }

        res.json({ success: true, user: { name: user.name, email: user.email } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'サーバーエラーが発生しました。' });
    }
});

// ユーザー一覧取得API
app.get('/api/users', async (req, res) => {
    try {
        const { data, error } = await supabase.from('users').select('name, email');
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ success: false, message: 'ユーザー一覧の取得に失敗しました。' });
    }
});

// メッセージ取得API
app.get('/api/messages', async (req, res) => {
    try {
        const { user1, user2 } = req.query;
        let query = supabase.from('messages').select('*');

        if (user1 === user2) {
            query = query.eq('sender', user1).eq('recipient', user1);
        } else {
            query = query.or(`and(sender.eq.${user1},recipient.eq.${user2}),and(sender.eq.${user2},recipient.eq.${user1})`);
        }

        const { data, error } = await query.order('id', { ascending: true });
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ success: false, message: 'メッセージの取得に失敗しました。' });
    }
});

// メッセージ送信API
app.post('/api/messages', async (req, res) => {
    try {
        const { sender, recipient, text, time, is_announcement } = req.body;
        if (!sender || !recipient || !text) {
            return res.status(400).json({ success: false, message: 'データが不足しています。' });
        }

        const newMessage = {
            sender,
            recipient,
            text,
            time: time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            is_read: false,
            is_deleted: false,
            is_announcement: is_announcement || false
        };

        const { data, error } = await supabase
            .from('messages')
            .insert([newMessage])
            .select();

        if (error) throw error;
        res.json({ success: true, message: data[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'メッセージの送信に失敗しました。' });
    }
});

// 送信取り消しAPI（データベースから完全削除）
app.post('/api/messages/unsend', async (req, res) => {
    try {
        const { id, sender } = req.body;
        const { error } = await supabase
            .from('messages')
            .delete()
            .eq('id', id)
            .eq('sender', sender);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 既読更新API
app.post('/api/read', async (req, res) => {
    try {
        const { myName, targetName } = req.body;
        if (myName === targetName) return res.json({ success: true });

        const { error } = await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('sender', targetName)
            .eq('recipient', myName)
            .eq('is_read', false);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// --- タイピング中機能のAPI ---

// タイピング状態の送信
app.post('/api/typing', (req, res) => {
    const { sender, recipient } = req.body;
    if (sender && recipient) {
        const key = `${sender}_${recipient}`;
        typingStatus[key] = Date.now();
    }
    res.json({ success: true });
});

// タイピング状態の確認
app.get('/api/typing', (req, res) => {
    const { sender, recipient } = req.query; // 相手が自分に向けて入力しているか確認するため [recipient -> sender]
    if (!sender || !recipient) return res.json({ isTyping: false });

    const key = `${recipient}_${sender}`;
    const lastTyped = typingStatus[key] || 0;
    const now = Date.now();

    // 4秒以内にタイピング信号があれば「入力中」とみなす
    const isTyping = (now - lastTyped) < 4000;
    res.json({ isTyping });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
