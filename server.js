const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const formidableMod = require('formidable');
const IncomingForm = formidableMod.IncomingForm || formidableMod;
const os = require('os');
const http = require('http');
const https = require('https');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const app = express();
const PORT = config.port || 8080;
const BASE_DIR = config.baseDir || path.join(os.homedir(), 'KangManis');
const USERS_FILE = path.join(__dirname, 'users.json');
const SHARES_FILE = path.join(__dirname, 'shares.json');

if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

const ASSETS_DIR = path.join(__dirname, 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: config.sessionSecret || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000, sameSite: 'lax' }
}));

app.get('/assets/:file', (req, res) => {
    const filePath = path.join(ASSETS_DIR, req.params.file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Asset not found: ' + req.params.file });
    const ext = path.extname(filePath).toLowerCase();
    const mime = { '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=604800');
    fs.createReadStream(filePath).pipe(res);
});

function getUsers() {
    if (!fs.existsSync(USERS_FILE)) {
        const defaults = [{ id: 1, username: 'admin', password: bcrypt.hashSync('admin123', 10), role: 'admin' }];
        fs.writeFileSync(USERS_FILE, JSON.stringify(defaults, null, 2));
        return defaults;
    }
    try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
    catch { return []; }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function findUser(username) {
    return getUsers().find(u => u.username === username);
}

function getShares() {
    if (!fs.existsSync(SHARES_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(SHARES_FILE, 'utf8')); }
    catch { return {}; }
}

function saveShares(shares) {
    fs.writeFileSync(SHARES_FILE, JSON.stringify(shares, null, 2));
}

function encodePath(p) {
    if (!p || p === '/') return '';
    return Buffer.from(p.replace(/^\/+|\/+$/g, '')).toString('base64url');
}

function decodePath(p) {
    if (!p) return '';
    try { return Buffer.from(p, 'base64url').toString('utf8'); }
    catch { return ''; }
}

function formatBytes(b) {
    if (b === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function getDirSize(dir) {
    let size = 0;
    try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            if (item.endsWith('.meta')) continue;
            const p = path.join(dir, item);
            const stat = fs.statSync(p);
            if (stat.isDirectory()) size += getDirSize(p);
            else size += stat.size;
        }
    } catch {}
    return size;
}

function getStats(dir) {
    let files = 0, folders = 0, totalSize = 0;
    try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            if (item.endsWith('.meta')) continue;
            const p = path.join(dir, item);
            const stat = fs.statSync(p);
            if (stat.isDirectory()) { folders++; const s = getStats(p); files += s.files; totalSize += s.totalSize; }
            else { files++; totalSize += stat.size; }
        }
    } catch {}
    return { files, folders, totalSize, totalSizeFormatted: formatBytes(totalSize) };
}

function listFiles(dir, rel) {
    const items = [];
    try {
        const entries = fs.readdirSync(dir);
        for (const name of entries) {
            if (name.endsWith('.meta')) continue;
            const full = path.join(dir, name);
            const stat = fs.statSync(full);
            const relPath = rel ? rel + '/' + name : name;
            let hash = null;
            const metaPath = full + '.meta';
            if (fs.existsSync(metaPath)) {
                try { hash = JSON.parse(fs.readFileSync(metaPath, 'utf8')).hash; } catch {}
            }
            items.push({
                name,
                path: encodePath(relPath),
                rawPath: relPath,
                isFolder: stat.isDirectory(),
                size: stat.isDirectory() ? getDirSize(full) : stat.size,
                sizeFormatted: stat.isDirectory() ? formatBytes(getDirSize(full)) : formatBytes(stat.size),
                mtime: stat.mtime.getTime(),
                mtimeFormatted: stat.mtime.toLocaleString('id-ID'),
                hash,
                ext: stat.isDirectory() ? '' : path.extname(name).toLowerCase()
            });
        }
    } catch {}
    return items;
}

function getAllFiles(dir, base) {
    let results = [];
    try {
        const entries = fs.readdirSync(dir);
        for (const name of entries) {
            if (name.endsWith('.meta')) continue;
            const full = path.join(dir, name);
            const stat = fs.statSync(full);
            const rel = base ? base + '/' + name : name;
            results.push({ name, relPath: rel, encodedPath: encodePath(rel), isFolder: stat.isDirectory(), size: stat.isDirectory() ? getDirSize(full) : stat.size });
            if (stat.isDirectory()) results = results.concat(getAllFiles(full, rel));
        }
    } catch {}
    return results;
}

function getHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', d => hash.update(d));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

function ensureMeta(filePath, username) {
    const metaPath = filePath + '.meta';
    if (!fs.existsSync(metaPath)) {
        getHash(filePath).then(hash => {
            fs.writeFileSync(metaPath, JSON.stringify({ hash, uploadedBy: username || 'system', uploadedAt: new Date().toISOString() }));
        });
    }
}

function recalcMetaHash(dir) {
    try {
        const items = fs.readdirSync(dir);
        for (const name of items) {
            const full = path.join(dir, name);
            if (name.endsWith('.meta')) continue;
            const stat = fs.statSync(full);
            if (stat.isDirectory()) { recalcMetaHash(full); }
            else { ensureMeta(full); }
        }
    } catch {}
}

async function sendTelegram(text) {
    const token = config.telegramBotToken;
    const chatId = config.telegramChatId;
    if (!token || !chatId) return;
    try {
        const postData = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: '/bot' + token + '/sendMessage',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        };
        await new Promise((resolve, reject) => {
            const req = https.request(options, res => { res.resume(); res.on('end', resolve); });
            req.on('error', reject);
            req.write(postData);
            req.end();
        });
    } catch {}
}

async function getStorageInfo() {
    let disk = { total: 'N/A', used: 'N/A', avail: 'N/A', percent: 0 };
    try { const { execSync } = require('child_process'); const out = execSync('df -h /sdcard 2>/dev/null || df -h .').toString().split('\n')[1]; if (out) { const p = out.split(/\s+/); disk = { total: p[1], used: p[2], avail: p[3], percent: parseInt(p[4]) || 0 }; } } catch {}
    const stats = getStats(BASE_DIR);
    return { ...disk, files: stats.files, folders: stats.folders, totalSize: stats.totalSizeFormatted };
}

async function getSharesInfo() {
    const shares = getShares();
    const list = Object.entries(shares).map(([token, s]) => s.path);
    return list;
}

const authRequired = (req, res, next) => {
    if (!req.session || !req.session.user) {
        if (req.path.startsWith('/api/')) return res.status(401).json({ success: false, message: 'Silakan login terlebih dahulu' });
        return res.redirect('/login');
    }
    next();
};

const adminRequired = (req, res, next) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }
    next();
};

app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = findUser(username);
    if (user && bcrypt.compareSync(password, user.password)) {
        req.session.user = { id: user.id, username: user.username, role: user.role };
        return res.json({ success: true, user: { username: user.username, role: user.role } });
    }
    res.status(401).json({ success: false, message: 'Username atau password salah' });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/', authRequired, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/me', authRequired, (req, res) => {
    res.json({ success: true, user: req.session.user });
});

app.get('/api/files', authRequired, (req, res) => {
    const rel = decodePath(req.query.path || '');
    const dir = path.join(BASE_DIR, rel);
    if (!dir.startsWith(BASE_DIR)) return res.status(400).json({ success: false, message: 'Path tidak valid' });
    const items = listFiles(dir, rel);
    const stats = getStats(dir);
    let diskTotal = 'N/A', diskUsed = 'N/A', diskAvail = 'N/A', diskPercent = 0;
    try { const { execSync } = require('child_process'); const out = execSync('df -h /sdcard 2>/dev/null || df -h .').toString().split('\n')[1]; if (out) { const p = out.split(/\s+/); diskTotal = p[1]; diskUsed = p[2]; diskAvail = p[3]; diskPercent = parseInt(p[4]) || 0; } } catch {}
    res.json({ success: true, currentPath: rel || '/', items, stats, storage: { total: diskTotal, used: diskUsed, avail: diskAvail, percent: diskPercent } });
});

app.get('/api/search', authRequired, (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    if (!q) return res.json({ success: true, results: [] });
    const all = getAllFiles(BASE_DIR, '');
    const results = all.filter(f => f.name.toLowerCase().includes(q) || f.relPath.toLowerCase().includes(q));
    res.json({ success: true, results: results.slice(0, 100) });
});

function getFieldVal(field) {
    if (Array.isArray(field)) return field[0];
    return field;
}

function getUploadedFiles(files, fieldName) {
    const raw = files[fieldName];
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    return [raw];
}

app.post('/api/upload', authRequired, (req, res) => {
    const opts = {
        maxFileSize: (config.maxUploadSize || 500) * 1024 * 1024,
        uploadDir: path.join(BASE_DIR, '.tmp_upload'),
        keepExtensions: true,
        multiples: true
    };
    if (!fs.existsSync(opts.uploadDir)) fs.mkdirSync(opts.uploadDir, { recursive: true });

    const form = new IncomingForm(opts);

    form.parse(req, async (err, fields, files) => {
        if (err) {
            console.error('[UPLOAD ERROR]', err.message);
            return res.status(500).json({ success: false, message: 'Upload gagal: ' + err.message });
        }
        try {
            const rel = decodePath(getFieldVal(fields.path) || '');
            const target = path.join(BASE_DIR, rel);
            if (!target.startsWith(BASE_DIR)) throw new Error('Path tidak valid');
            if (!fs.existsSync(target)) fs.mkdirSync(target, { recursive: true });

            const fileList = getUploadedFiles(files, 'files');
            if (!fileList.length) throw new Error('Tidak ada file yang diterima');

            const uploaded = [];
            const compress = getFieldVal(fields.compress) === 'true';
            let sharp = null;
            if (compress) { try { sharp = require('sharp'); } catch { sharp = null; } }

            for (const file of fileList) {
                if (!file) continue;
                const srcPath = file.filepath || file.newFilename || file.file;
                if (!srcPath || !fs.existsSync(srcPath)) {
                    console.error('[UPLOAD] Temp file not found:', srcPath);
                    continue;
                }
                let dest = target;
                let name = file.originalFilename || file.newFilename || path.basename(srcPath) || 'upload';
                if (name.includes('/')) { const parts = name.split('/'); name = parts.pop(); const sub = parts.join('/'); dest = path.join(target, sub); if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true }); }
                const finalPath = path.join(dest, name);
                let counter = 1, savePath = finalPath;
                while (fs.existsSync(savePath)) { const ext = path.extname(name); const base = path.basename(name, ext); savePath = path.join(dest, base + ' (' + counter + ')' + ext); counter++; }

                if (sharp && /\.(jpe?g|png|webp)$/i.test(name)) {
                    try { await sharp(srcPath).resize(config.imageSizes?.preview || 1920, null, { withoutEnlargement: true }).jpeg({ quality: config.imageQuality || 80 }).toFile(savePath); }
                    catch { fs.copyFileSync(srcPath, savePath); }
                } else {
                    fs.copyFileSync(srcPath, savePath);
                }
                try { fs.unlinkSync(srcPath); } catch {}
                const hash = await getHash(savePath);
                fs.writeFileSync(savePath + '.meta', JSON.stringify({ hash, uploadedBy: req.session.user.username, uploadedAt: new Date().toISOString(), originalName: name }));
                uploaded.push({ name: path.basename(savePath), size: fs.statSync(savePath).size, hash });
            }
            sendTelegram(`📤 <b>Upload</b>\n📄 ${uploaded.length} file\n👤 ${req.session.user.username}`);
            res.json({ success: true, uploaded });
        } catch (e) {
            console.error('[UPLOAD PROCESS ERROR]', e.message);
            res.status(500).json({ success: false, message: e.message });
        }
    });
});

app.post('/api/mkdir', authRequired, (req, res) => {
    try {
        const { name, path: p } = req.body;
        const rel = decodePath(p || '');
        const dir = path.join(BASE_DIR, rel);
        const newDir = path.join(dir, name);
        if (!newDir.startsWith(BASE_DIR)) throw new Error('Path tidak valid');
        if (fs.existsSync(newDir)) throw new Error('Folder sudah ada');
        fs.mkdirSync(newDir, { recursive: true });
        sendTelegram(`📁 <b>Folder Baru</b>\n📂 ${name}\n👤 ${req.session.user.username}`);
        res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

app.post('/api/rename', authRequired, (req, res) => {
    try {
        const { path: p, newName } = req.body;
        const rel = decodePath(p);
        const oldPath = path.join(BASE_DIR, rel);
        if (!oldPath.startsWith(BASE_DIR)) throw new Error('Path tidak valid');
        const parent = path.dirname(rel);
        const newPath = path.join(BASE_DIR, parent === '.' ? newName : path.join(parent, newName));
        if (!fs.existsSync(oldPath)) throw new Error('File/folder tidak ditemukan');
        if (fs.existsSync(newPath)) throw new Error('Nama sudah digunakan');
        fs.renameSync(oldPath, newPath);
        const oldMeta = oldPath + '.meta';
        const newMeta = newPath + '.meta';
        if (fs.existsSync(oldMeta)) fs.renameSync(oldMeta, newMeta);
        sendTelegram(`✏️ <b>Rename</b>\n📝 ${decodePath(p)} → ${newName}\n👤 ${req.session.user.username}`);
        res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

app.post('/api/delete', authRequired, (req, res) => {
    try {
        const { path: p } = req.body;
        const rel = decodePath(p);
        const full = path.join(BASE_DIR, rel);
        if (!full.startsWith(BASE_DIR) || full === BASE_DIR) throw new Error('Path tidak valid');
        if (!fs.existsSync(full)) throw new Error('Tidak ditemukan');
        const deleteRecursive = (dir) => {
            if (!fs.existsSync(dir)) return;
            if (fs.statSync(dir).isDirectory()) {
                fs.readdirSync(dir).forEach(f => deleteRecursive(path.join(dir, f)));
                fs.rmdirSync(dir);
            } else {
                fs.unlinkSync(dir);
                if (fs.existsSync(dir + '.meta')) fs.unlinkSync(dir + '.meta');
            }
        };
        deleteRecursive(full);
        sendTelegram(`🗑️ <b>Hapus</b>\n❌ ${rel}\n👤 ${req.session.user.username}`);
        res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

app.post('/api/batch-delete', authRequired, (req, res) => {
    try {
        const { paths } = req.body;
        if (!Array.isArray(paths)) throw new Error('Invalid request');
        let deleted = 0;
        for (const p of paths) {
            const rel = decodePath(p);
            const full = path.join(BASE_DIR, rel);
            if (!full.startsWith(BASE_DIR) || full === BASE_DIR) continue;
            if (!fs.existsSync(full)) continue;
            const deleteRecursive = (dir) => {
                if (!fs.existsSync(dir)) return;
                if (fs.statSync(dir).isDirectory()) { fs.readdirSync(dir).forEach(f => deleteRecursive(path.join(dir, f))); fs.rmdirSync(dir); }
                else { fs.unlinkSync(dir); if (fs.existsSync(dir + '.meta')) fs.unlinkSync(dir + '.meta'); }
            };
            deleteRecursive(full);
            deleted++;
        }
        res.json({ success: true, deleted });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

app.post('/api/copy', authRequired, (req, res) => {
    try {
        const { source, destination } = req.body;
        const src = path.join(BASE_DIR, decodePath(source));
        const dstDir = path.join(BASE_DIR, decodePath(destination));
        if (!fs.existsSync(src)) throw new Error('Sumber tidak ditemukan');
        const copyRec = (s, d) => {
            if (!fs.existsSync(s)) return;
            if (fs.statSync(s).isDirectory()) {
                if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
                fs.readdirSync(s).forEach(f => { if (!f.endsWith('.meta')) copyRec(path.join(s, f), path.join(d, f)); });
            } else {
                let finalDst = d;
                if (fs.existsSync(finalDst)) {
                    const ext = path.extname(d);
                    const base = path.basename(d, ext);
                    let c = 1;
                    while (fs.existsSync(path.join(path.dirname(d), base + ' (' + c + ')' + ext))) c++;
                    finalDst = path.join(path.dirname(d), base + ' (' + c + ')' + ext);
                }
                fs.copyFileSync(s, finalDst);
                if (fs.existsSync(s + '.meta')) fs.copyFileSync(s + '.meta', finalDst + '.meta');
            }
        };
        const srcName = path.basename(src);
        copyRec(src, path.join(dstDir, srcName));
        res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

app.post('/api/move', authRequired, (req, res) => {
    try {
        const { source, destination } = req.body;
        const src = path.join(BASE_DIR, decodePath(source));
        const dstDir = path.join(BASE_DIR, decodePath(destination));
        if (!fs.existsSync(src)) throw new Error('Sumber tidak ditemukan');
        if (!src.startsWith(BASE_DIR) || !dstDir.startsWith(BASE_DIR)) throw new Error('Path tidak valid');
        const srcName = path.basename(src);
        let dst = path.join(dstDir, srcName);
        if (fs.existsSync(dst) && fs.statSync(dst).isDirectory()) {
            const srcStat = fs.statSync(src);
            if (srcStat.isDirectory()) {
                fs.readdirSync(src).forEach(f => { if (!f.endsWith('.meta')) { const s = path.join(src, f); const d = path.join(dst, f); if (!fs.existsSync(d)) { fs.renameSync(s, d); if (fs.existsSync(s + '.meta') && !fs.existsSync(d + '.meta')) fs.renameSync(s + '.meta', d + '.meta'); } } });
                fs.readdirSync(src).filter(f => f.endsWith('.meta')).forEach(f => fs.unlinkSync(path.join(src, f)));
                fs.rmdirSync(src);
                return res.json({ success: true });
            }
        }
        if (fs.existsSync(dst)) { const ext = path.extname(srcName); const base = path.basename(srcName, ext); let c = 1; while (fs.existsSync(path.join(dstDir, base + ' (' + c + ')' + ext))) c++; dst = path.join(dstDir, base + ' (' + c + ')' + ext); }
        fs.renameSync(src, dst);
        if (fs.existsSync(src + '.meta')) { const dstMeta = dst + '.meta'; if (!fs.existsSync(dstMeta)) fs.renameSync(src + '.meta', dstMeta); else fs.unlinkSync(src + '.meta'); }
        sendTelegram(`📦 <b>Pindah</b>\n📄 ${path.basename(src)}\n📁 → ${decodePath(destination)}\n👤 ${req.session.user.username}`);
        res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

app.post('/api/batch-move', authRequired, (req, res) => {
    try {
        const { paths, destination } = req.body;
        if (!Array.isArray(paths)) throw new Error('Invalid');
        const dstDir = path.join(BASE_DIR, decodePath(destination));
        if (!dstDir.startsWith(BASE_DIR)) throw new Error('Path tidak valid');
        if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
        let moved = 0;
        for (const p of paths) {
            const src = path.join(BASE_DIR, decodePath(p));
            if (!src.startsWith(BASE_DIR) || !fs.existsSync(src)) continue;
            const srcName = path.basename(src);
            let dst = path.join(dstDir, srcName);
            if (fs.existsSync(dst)) { const ext = path.extname(srcName); const base = path.basename(srcName, ext); let c = 1; while (fs.existsSync(path.join(dstDir, base + ' (' + c + ')' + ext))) c++; dst = path.join(dstDir, base + ' (' + c + ')' + ext); }
            fs.renameSync(src, dst);
            if (fs.existsSync(src + '.meta')) { const dm = dst + '.meta'; if (!fs.existsSync(dm)) fs.renameSync(src + '.meta', dm); else fs.unlinkSync(src + '.meta'); }
            moved++;
        }
        res.json({ success: true, moved });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

app.get('/api/verify', authRequired, async (req, res) => {
    try {
        const file = path.join(BASE_DIR, decodePath(req.query.path || ''));
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.status(404).json({ success: false, message: 'File not found' });
        const metaPath = file + '.meta';
        if (!fs.existsSync(metaPath)) return res.json({ status: 'not_scanned' });
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        const hash = await getHash(file);
        const valid = meta.hash === hash;
        res.json({ status: valid ? 'valid' : 'corrupted', originalHash: meta.hash, currentHash: hash, uploadedBy: meta.uploadedBy, uploadedAt: meta.uploadedAt });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/download', authRequired, (req, res) => {
    const file = path.join(BASE_DIR, decodePath(req.query.path || ''));
    if (!file.startsWith(BASE_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.status(404).json({ success: false, message: 'Not found' });
    res.download(file);
});

app.get('/api/preview', authRequired, (req, res) => {
    const file = path.join(BASE_DIR, decodePath(req.query.path || ''));
    if (!file.startsWith(BASE_DIR) || !fs.existsSync(file)) return res.status(404).end();
    const ext = path.extname(file).toLowerCase();
    const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.pdf': 'application/pdf', '.txt': 'text/plain' }[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    fs.createReadStream(file).pipe(res);
});

app.get('/api/thumbnail', authRequired, async (req, res) => {
    const file = path.join(BASE_DIR, decodePath(req.query.path || ''));
    if (!file.startsWith(BASE_DIR) || !fs.existsSync(file)) return res.status(404).end();
    try {
        const sharp = require('sharp');
        const thumb = await sharp(file).resize(200, 200, { fit: 'cover' }).jpeg({ quality: 70 }).toBuffer();
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.end(thumb);
    } catch {
        res.status(404).end();
    }
});

app.post('/api/compress', authRequired, async (req, res) => {
    try {
        const { path: p, quality } = req.body;
        const file = path.join(BASE_DIR, decodePath(p));
        if (!file.startsWith(BASE_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) throw new Error('File not found');
        const ext = path.extname(file).toLowerCase();
        if (!/\.(jpe?g|png|webp)$/i.test(ext)) throw new Error('Hanya file gambar yang bisa dikompres');
        const sharp = require('sharp');
        const q = quality || 70;
        const tmpFile = file + '.tmp_compress';
        await sharp(file).resize(config.imageSizes?.preview || 1920, null, { withoutEnlargement: true }).jpeg({ quality: q }).toFile(tmpFile);
        const origSize = fs.statSync(file).size;
        fs.copyFileSync(tmpFile, file);
        fs.unlinkSync(tmpFile);
        const newSize = fs.statSync(file).size;
        const hash = await getHash(file);
        const metaPath = file + '.meta';
        let meta = {};
        if (fs.existsSync(metaPath)) { try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {} }
        meta.hash = hash;
        meta.compressedAt = new Date().toISOString();
        meta.compressedBy = req.session.user.username;
        fs.writeFileSync(metaPath, JSON.stringify(meta));
        res.json({ success: true, originalSize: origSize, compressedSize: newSize, saved: origSize - newSize, savedFormatted: formatBytes(origSize - newSize) });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/share', authRequired, (req, res) => {
    try {
        const { path: p, expiresIn } = req.body;
        const rel = decodePath(p);
        const file = path.join(BASE_DIR, rel);
        if (!file.startsWith(BASE_DIR) || !fs.existsSync(file)) throw new Error('File tidak ditemukan');
        const token = crypto.randomBytes(16).toString('hex');
        const shares = getShares();
        shares[token] = {
            path: rel,
            createdBy: req.session.user.username,
            createdAt: new Date().toISOString(),
            expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 3600000).toISOString() : null
        };
        saveShares(shares);
        const host = req.headers.host;
        const url = 'http://' + host + '/share/' + token;
        res.json({ success: true, url, token });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

app.get('/share/:token', (req, res) => {
    const shares = getShares();
    const share = shares[req.params.token];
    if (!share) return res.status(404).send('Link tidak valid atau sudah expired');
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) { delete shares[req.params.token]; saveShares(shares); return res.status(410).send('Link sudah expired'); }
    const file = path.join(BASE_DIR, share.path);
    if (!fs.existsSync(file)) return res.status(404).send('File tidak ditemukan');
    if (fs.statSync(file).isDirectory()) return res.status(400).send('Folder tidak bisa di-share');
    res.download(file, path.basename(file));
});

app.get('/api/shares', authRequired, (req, res) => {
    const shares = getShares();
    const list = Object.entries(shares).map(([token, s]) => ({ token, path: s.path, createdBy: s.createdBy, createdAt: s.createdAt, expiresAt: s.expiresAt, url: 'http://' + req.headers.host + '/share/' + token }));
    res.json({ success: true, shares: list });
});

app.delete('/api/share/:token', authRequired, (req, res) => {
    const shares = getShares();
    if (shares[req.params.token]) { delete shares[req.params.token]; saveShares(shares); }
    res.json({ success: true });
});

app.get('/api/storage', authRequired, (req, res) => {
    const stats = getStats(BASE_DIR);
    let disk = { total: 'N/A', used: 'N/A', avail: 'N/A', percent: 0 };
    try { const { execSync } = require('child_process'); const out = execSync('df -h /sdcard 2>/dev/null || df -h .').toString().split('\n')[1]; if (out) { const p = out.split(/\s+/); disk = { total: p[1], used: p[2], avail: p[3], percent: parseInt(p[4]) || 0 }; } } catch {}
    res.json({ success: true, files: stats.files, folders: stats.folders, totalSize: stats.totalSizeFormatted, disk });
});

app.get('/api/users', authRequired, adminRequired, (req, res) => {
    const users = getUsers().map(u => ({ id: u.id, username: u.username, role: u.role }));
    res.json({ success: true, users });
});

app.post('/api/users', authRequired, adminRequired, (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password) throw new Error('Username dan password wajib diisi');
        if (findUser(username)) throw new Error('Username sudah ada');
        const users = getUsers();
        const id = Math.max(...users.map(u => u.id), 0) + 1;
        users.push({ id, username, password: bcrypt.hashSync(password, 10), role: role || 'user' });
        saveUsers(users);
        res.json({ success: true, user: { id, username, role: role || 'user' } });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

app.delete('/api/users/:id', authRequired, adminRequired, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const users = getUsers();
        const idx = users.findIndex(u => u.id === id);
        if (idx === -1) throw new Error('User tidak ditemukan');
        if (users[idx].username === 'admin') throw new Error('Tidak bisa hapus admin utama');
        users.splice(idx, 1);
        saveUsers(users);
        res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

app.post('/api/recalc-hash', authRequired, async (req, res) => {
    try {
        const { path: p } = req.body;
        const dir = path.join(BASE_DIR, decodePath(p || ''));
        if (!dir.startsWith(BASE_DIR)) throw new Error('Path tidak valid');
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) { recalcMetaHash(dir); }
        else if (fs.existsSync(dir)) { await getHash(dir).then(h => { fs.writeFileSync(dir + '.meta', JSON.stringify({ hash: h, uploadedBy: req.session.user.username, uploadedAt: new Date().toISOString() })); }); }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/export-tree', authRequired, (req, res) => {
    const rel = decodePath(req.query.path || '');
    const dir = path.join(BASE_DIR, rel);
    if (!dir.startsWith(BASE_DIR)) return res.status(400).json({ success: false, message: 'Invalid path' });
    const buildTree = (d, name) => {
        if (!fs.existsSync(d)) return null;
        const stat = fs.statSync(d);
        if (stat.isDirectory()) {
            return { name, type: 'folder', children: fs.readdirSync(d).filter(n => !n.endsWith('.meta')).map(n => buildTree(path.join(d, n), n)).filter(Boolean) };
        }
        return { name, type: 'file', size: stat.size, sizeFormatted: formatBytes(stat.size) };
    };
    res.json({ success: true, tree: buildTree(dir, path.basename(dir) || 'root') });
});

app.post('/api/change-password', authRequired, (req, res) => {
    try {
        const { currentPassword, newPassword, newUsername } = req.body;
        if (!currentPassword || !newPassword) throw new Error('Password lama dan baru wajib diisi');
        const users = getUsers();
        const user = users.find(u => u.id === req.session.user.id);
        if (!user) throw new Error('User tidak ditemukan');
        if (!bcrypt.compareSync(currentPassword, user.password)) throw new Error('Password lama salah');
        if (newUsername && newUsername !== user.username) {
            if (findUser(newUsername)) throw new Error('Username sudah digunakan');
            user.username = newUsername;
            req.session.user.username = newUsername;
        }
        user.password = bcrypt.hashSync(newPassword, 10);
        saveUsers(users);
        res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

app.post('/api/batch-compress', authRequired, async (req, res) => {
    try {
        const { paths, quality } = req.body;
        if (!Array.isArray(paths) || !paths.length) throw new Error('Tidak ada file dipilih');
        let sharp;
        try { sharp = require('sharp'); } catch { throw new Error('sharp tidak terinstall'); }
        const q = quality || 75;
        let compressed = 0, totalSaved = 0;
        for (const p of paths) {
            const file = path.join(BASE_DIR, decodePath(p));
            if (!file.startsWith(BASE_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
            const ext = path.extname(file).toLowerCase();
            if (!/\.(jpe?g|png|webp)$/i.test(ext)) continue;
            try {
                const tmpFile = file + '.tmp_batch_compress';
                await sharp(file).resize(config.imageSizes?.preview || 1920, null, { withoutEnlargement: true }).jpeg({ quality: q }).toFile(tmpFile);
                const origSize = fs.statSync(file).size;
                fs.copyFileSync(tmpFile, file);
                fs.unlinkSync(tmpFile);
                const newSize = fs.statSync(file).size;
                totalSaved += (origSize - newSize);
                const hash = await getHash(file);
                const metaPath = file + '.meta';
                let meta = {};
                if (fs.existsSync(metaPath)) { try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {} }
                meta.hash = hash;
                meta.compressedAt = new Date().toISOString();
                meta.compressedBy = req.session.user.username;
                fs.writeFileSync(metaPath, JSON.stringify(meta));
                compressed++;
            } catch {}
        }
        res.json({ success: true, compressed, saved: totalSaved, savedFormatted: formatBytes(totalSaved) });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/telegram-report', authRequired, async (req, res) => {
    try {
        const storage = await getStorageInfo();
        const shares = await getSharesInfo();
        let msg = `<b>📊 KangManis - Laporan Storage</b>\n\n`;
        msg += `📁 File: <b>${storage.files}</b> | Folder: <b>${storage.folders}</b>\n`;
        msg += `💾 Total: <b>${storage.totalSize}</b>\n`;
        msg += `💿 Disk: ${storage.used} / ${storage.total} (${storage.percent}%)\n`;
        msg += `🔗 Share Aktif: <b>${shares.length}</b>\n`;
        if (shares.length) {
            msg += `\n<b>Share Links:</b>\n`;
            shares.forEach((s, i) => { msg += `${i + 1}. ${s}\n`; });
        }
        await sendTelegram(msg);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.use((req, res) => { res.status(404).json({ success: false, message: 'Not found' }); });

function detectLocalIP() {
    const skip = ['lo','loopback','pseudo','isatap','teredo','6to4','vethernet','docker','hamachi','tun','tap'];
    const nets = os.networkInterfaces();
    let fallback = null;
    for (const [name, addrs] of Object.entries(nets)) {
        const lower = name.toLowerCase();
        if (skip.some(s => lower.includes(s))) continue;
        for (const a of addrs) {
            if (a.family !== 'IPv4' || a.internal) continue;
            return a.address;
        }
    }
    try {
        const { execSync } = require('child_process');
        const out = execSync('ip -4 addr show wlan0 2>/dev/null || ip -4 addr show 2>/dev/null').toString();
        const m = out.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
        if (m && m[1] !== '127.0.0.1') return m[1];
    } catch {}
    return fallback || 'localhost';
}

const server = app.listen(PORT, '0.0.0.0', () => {
    const ip = detectLocalIP();
    console.log('\n🚀 KangManis Server Aktif!');
    console.log('📍 Local:    http://localhost:' + PORT);
    console.log('📍 Network:  http://' + ip + ':' + PORT);
    console.log('📁 Storage:  ' + BASE_DIR);
    console.log('👤 Default:  admin / admin123\n');
});
