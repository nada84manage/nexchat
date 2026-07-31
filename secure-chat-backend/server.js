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

const typingStatus = {};

// 新規登録
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'すべての項目を入力してください。' });
        }

        const { data: existingUsers } = await supabase.from('users').select('*').eq('email', email);
        if (existingUsers && existingUsers.length > 0) {
            return res.status(400).json({ success: false, message: 'このメールアドレスは既に登録されています。' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const initialQrSecret = `${name}_${Date.now()}_fixed`;

        const { error } = await supabase.from('users').insert([{ 
            name, 
            email, 
            password: hashedPassword,
            qr_secret: initialQrSecret 
        }]);
        
        if (error) throw error;
        res.json({ success: true, message: '登録が完了しました！' });
    } catch (err) {
        console.error('Signup Error:', err);
        res.status(500).json({ success: false, message: 'サーバーエラーが発生しました。' });
    }
});

// ログイン
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const { data: users, error } = await supabase.from('users').select('*').eq('email', email);
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

// マイQRコード取得・更新用API
app.post('/api/qr/update', async (req, res) => {
    try {
        const { name, forceRefresh } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'ユーザー名が必要です。' });

        const { data: user, error: fetchError } = await supabase.from('users').select('*').eq('name', name).single();
        if (fetchError || !user) return res.status(400).json({ success: false, message: 'ユーザーが見つかりません。' });

        let qrSecret = user.qr_secret;

        if (forceRefresh || !qrSecret) {
            qrSecret = `${name}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            const { error: updateError } = await supabase
                .from('users')
                .update({ qr_secret: qrSecret })
                .eq('name', name);

            if (updateError) throw updateError;
        }

        res.json({ success: true, qrData: qrSecret });
    } catch (err) {
        console.error('QR Update Error:', err);
        res.status(500).json({ success: false, message: 'QRコードの処理に失敗しました。' });
    }
});

// フレンド追加API (QRコードの有効性チェック付き)
app.post('/api/friends/add', async (req, res) => {
    try {
        const { myName, targetName, qrData } = req.body;
        if (!myName || !targetName) return res.status(400).json({ success: false, message: 'データが不足しています。' });
        if (myName === targetName) return res.status(400).json({ success: false, message: '自分自身を追加することはできません。' });

        const { data: targetUser } = await supabase.from('users').select('*').eq('name', targetName).single();
        if (!targetUser) return res.status(400).json({ success: false, message: '指定したユーザーが見つかりません。' });

        if (qrData && targetUser.qr_secret && targetUser.qr_secret !== qrData) {
            return res.status(400).json({ success: false, message: 'このQRコードは無効化されています。新しいQRコードを読み込んでください。' });
        }

        const { data: existing } = await supabase
            .from('friend_requests')
            .select('*')
            .or(`and(sender.eq.${myName},recipient.eq.${targetName}),and(sender.eq.${targetName},recipient.eq.${myName})`);

        if (existing && existing.length > 0) {
            return res.json({ success: true, message: 'すでにフレンドに追加されています。' });
        }

        const { error } = await supabase.from('friend_requests').insert([{ sender: myName, recipient: targetName, status: 'accepted' }]);
        if (error) throw error;

        res.json({ success: true, message: `${targetName} さんをフレンドに追加しました！` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'フレンド追加に失敗しました。' });
    }
});

// フレンド一覧取得API
app.get('/api/friends', async (req, res) => {
    try {
        const { name } = req.query;
        const { data, error } = await supabase
            .from('friend_requests')
            .select('*')
            .or(`sender.eq.${name},recipient.eq.${name}`);

        if (error) throw error;
        
        const friendNames = new Set();
        if (Array.isArray(data)) {
            data.forEach(row => {
                if (row.sender === name) friendNames.add(row.recipient);
                if (row.recipient === name) friendNames.add(row.sender);
            });
        }

        res.json(Array.from(friendNames));
    } catch (err) {
        res.status(500).json({ success: false, message: 'フレンド一覧の取得に失敗しました。' });
    }
});

// メッセージ取得
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

// メッセージ送信
app.post('/api/messages', async (req, res) => {
    try {
        const { sender, recipient, text, time, is_announcement, reply_to_id, reply_to_sender, reply_to_text } = req.body;
        const newMessage = {
            sender,
            recipient,
            text,
            time: time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            is_read: sender === recipient,
            is_deleted: false,
            is_announcement: is_announcement || false,
            reply_to_id: reply_to_id || null,
            reply_to_sender: reply_to_sender || null,
            reply_to_text: reply_to_text || null
        };

        const { data, error } = await supabase.from('messages').insert([newMessage]).select();
        if (error) throw error;
        res.json({ success: true, message: data[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'メッセージの送信に失敗しました。' });
    }
});

// メッセージ編集API
app.post('/api/messages/edit', async (req, res) => {
    try {
        const { id, sender, newText } = req.body;
        const { error } = await supabase
            .from('messages')
            .update({ text: newText })
            .eq('id', id)
            .eq('sender', sender);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'メッセージの編集に失敗しました。' });
    }
});

// 送信取り消し
app.post('/api/messages/unsend', async (req, res) => {
    try {
        const { id, sender } = req.body;
        const { error } = await supabase.from('messages').delete().eq('id', id).eq('sender', sender);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 既読更新
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

// タイピング状態
app.post('/api/typing', (req, res) => {
    const { sender, recipient } = req.body;
    if (sender && recipient) typingStatus[`${sender}_${recipient}`] = Date.now();
    res.json({ success: true });
});

app.get('/api/typing', (req, res) => {
    const { sender, recipient } = req.query;
    if (!sender || !recipient) return res.json({ isTyping: false });
    const lastTyped = typingStatus[`${recipient}_${sender}`] || 0;
    res.json({ isTyping: (Date.now() - lastTyped) < 4000 });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
