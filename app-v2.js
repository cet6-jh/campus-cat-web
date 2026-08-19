// app.js —— 校园猫猫档案(在线编辑版)
// 数据从 data.js 加载,通过 GitHub API 实现网页编辑

const CFG = window.APP_CONFIG;

// 优先从 localStorage 读取 GitHub Token(更安全,不暴露在 GitHub 上)
CFG.GH_TOKEN = localStorage.getItem('gh_token') || CFG.GH_TOKEN || '';
let cats = [];
let currentFilter = '全部';
let currentKeyword = '';
let isAdmin = false;

// ===== 状态徽章 =====
const BADGE_MAP = {
    '待领养': 'badge-adoptable',
    '已领养': 'badge-adopted',
    '已离世': 'badge-passed',
    '暂不领养': 'badge-other'
};

// ===== 加载数据 =====
function load() {
    try {
        cats = window.CATS_DATA || [];
        renderList(getFiltered());
    } catch (err) {
        document.getElementById('errorBox').classList.remove('hidden');
        document.getElementById('errorBox').textContent = '数据加载失败:' + err.message;
    } finally {
        document.getElementById('loadingBox').classList.add('hidden');
    }
}

// ===== 列表渲染 =====
function getFiltered() {
    const kw = currentKeyword.trim();
    return cats.filter(cat => {
        if (currentFilter !== '全部' && cat.adoption_status !== currentFilter) return false;
        if (kw) {
            const text = `${cat.name || ''}${cat.title || ''}${cat.breed || ''}${(cat.traits || []).join('')}${(cat.stories || []).join('')}${cat.source || ''}`;
            if (!text.includes(kw)) return false;
        }
        return true;
    });
}

function renderList(list) {
    const listEl = document.getElementById('catList');
    const emptyBox = document.getElementById('emptyBox');
    listEl.innerHTML = '';
    emptyBox.classList.toggle('hidden', list.length > 0);

    list.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'cat-card';
        card.onclick = () => openDetail(cat);
        const photo = cat.photo || 'photos/placeholder.jpg';
        const isPassed = cat.adoption_status === '已离世';
        card.innerHTML = `
            <div class="cat-photo-wrap">
                <img class="cat-photo ${isPassed ? 'passed' : ''}"
                     src="${escapeHtml(photo)}" alt="${escapeHtml(cat.name || '')}"
                     onerror="this.style.visibility='hidden'">
            </div>
            <div class="cat-info">
                <div class="cat-name-row">
                    <span class="cat-name">${escapeHtml(cat.name || '')}</span>
                    <span class="badge ${BADGE_MAP[cat.adoption_status] || 'badge-other'}">${escapeHtml(cat.adoption_status || '')}</span>
                </div>
                <div class="cat-title">🎭 ${escapeHtml(cat.title || '')}</div>
                <div class="cat-meta">${formatMeta(cat)}</div>
                <div class="cat-tags">
                    ${(cat.traits || []).slice(0, 3).map(t => `<span class="cat-tag">${escapeHtml(t)}</span>`).join('')}
                </div>
            </div>
            ${isAdmin ? `<button class="card-edit" data-id="${escapeHtml(cat.id)}">编辑</button>` : ''}
        `;
        const editBtn = card.querySelector('.card-edit');
        if (editBtn) {
            editBtn.onclick = (e) => { e.stopPropagation(); openEdit(cat); };
        }
        listEl.appendChild(card);
    });
}

function formatMeta(cat) {
    const parts = [];
    if (cat.gender && cat.gender !== '未知') parts.push(`⚧ ${cat.gender}`);
    if (cat.age && cat.age !== '未知') parts.push(cat.age);
    return parts.join(' · ');
}

function refresh() {
    renderList(getFiltered());
}

// ===== HTML 转义 =====
function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== 详情弹层 =====
function openDetail(cat) {
    const isPassed = cat.adoption_status === '已离世';
    const photo = cat.photo || 'photos/placeholder.jpg';
    const content = document.getElementById('modalContent');
    content.innerHTML = `
        <button class="modal-close" id="detailClose">✕</button>
        <div class="detail-hero">
            <img class="detail-photo ${isPassed ? 'passed' : ''}" src="${escapeHtml(photo)}" alt="${escapeHtml(cat.name || '')}" onerror="this.style.display='none'">
            <div class="detail-mask"></div>
            <div class="detail-hero-info">
                <div class="detail-name-row">
                    <span class="detail-name">${escapeHtml(cat.name || '')}</span>
                    <span class="badge ${BADGE_MAP[cat.adoption_status] || 'badge-other'}">${escapeHtml(cat.adoption_status || '')}</span>
                </div>
                <div class="detail-title">🎭 ${escapeHtml(cat.title || '')}</div>
            </div>
        </div>
        <div class="detail-card">
            <div class="detail-section-title">🧬 基本信息</div>
            ${infoRow('品种/特征', cat.breed || '未知')}
            ${infoRow('性别', cat.gender || '未知')}
            ${infoRow('年龄', cat.age || '未知')}
            ${infoRow('健康状态', cat.health || '待观察')}
            ${infoRow('绝育情况', cat.neutered ? '<span class="neutered-yes">✅ 已绝育</span>' : '<span class="neutered-no">⚠️ 未绝</span>')}
        </div>
        ${cat.traits && cat.traits.length ? `<div class="detail-card">
            <div class="detail-section-title">🧠 性格标签</div>
            <div class="detail-tags">${cat.traits.map(t => `<span class="detail-tag">${escapeHtml(t)}</span>`).join('')}</div>
        </div>` : ''}
        ${cat.stories && cat.stories.length ? `<div class="detail-card">
            <div class="detail-section-title">📜 专属事迹</div>
            ${cat.stories.map(s => `<div class="story-item"><span class="story-dot">🐾</span><span>${escapeHtml(s)}</span></div>`).join('')}
        </div>` : ''}
        ${cat.source ? `<div class="detail-source">📢 档案来源:${escapeHtml(cat.source)}</div>` : ''}
        ${isPassed ? '<div class="memorial">🕊️ 愿它在喵星安息,谢谢它曾陪伴我们的校园时光</div>' : ''}
    `;
    document.getElementById('detailModal').classList.remove('hidden');
    document.getElementById('detailClose').onclick = closeDetail;
    document.body.style.overflow = 'hidden';
}

function infoRow(label, content) {
    return `<div class="detail-info-row"><span class="detail-label">${label}</span><span class="detail-value">${content}</span></div>`;
}

function closeDetail() {
    document.getElementById('detailModal').classList.add('hidden');
    document.body.style.overflow = '';
}

// ===== 密码弹层 =====
function openPasswordModal() {
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordError').classList.add('hidden');
    document.getElementById('passwordModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('passwordInput').focus(), 100);
}
function closePasswordModal() {
    document.getElementById('passwordModal').classList.add('hidden');
    document.body.style.overflow = '';
}

function submitPassword() {
    const input = document.getElementById('passwordInput').value.trim();
    if (!input) return;
    if (input !== CFG.ADMIN_PASSWORD) {
        const errEl = document.getElementById('passwordError');
        errEl.textContent = '密码错误';
        errEl.classList.remove('hidden');
        return;
    }
    if (!CFG.GH_TOKEN) {
        alert('密码正确!\n\n但当前没有 GitHub Token,无法保存修改到 GitHub。\n\n请在 config.js 中填写 GH_TOKEN,然后重新打开网页。');
    }
    isAdmin = true;
    closePasswordModal();
    document.getElementById('adminToggle').textContent = '🚪 退出管理';
    document.getElementById('adminToggle').classList.add('admin-active');
    document.getElementById('adminAddBtn').classList.remove('hidden');
    refresh();
}

function exitAdmin() {
    if (!confirm('退出管理模式?')) return;
    isAdmin = false;
    document.getElementById('adminToggle').textContent = '🔑 管理模式';
    document.getElementById('adminToggle').classList.remove('admin-active');
    document.getElementById('adminAddBtn').classList.add('hidden');
    refresh();
}

// ===== 编辑表单 =====
let editingCat = null;
let isCreatingNew = false;   // 标记是否为新增模式

/** 生成新的 cat ID(短随机) */
function generateCatId() {
    return 'cat_' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
}

function openEdit(cat) {
    isCreatingNew = !cat;
    editingCat = cat || {
        id: generateCatId(),
        name: '',
        title: '',
        photo: '',
        photos: [],
        breed: '',
        gender: '未知',
        age: '',
        adoption_status: '待领养',
        health: '',
        neutered: true,
        source: '',
        traits: [],
        stories: [],
        created_at: new Date().toISOString().slice(0, 16).replace('T', ' ')
    };
    openEditForm();   // 复用同一个表单渲染函数
}

/** 渲染编辑表单(支持编辑和新增) */
function openEditForm() {
    const photosArr = editingCat.photos || (editingCat.photo ? [editingCat.photo] : []);
    const content = document.getElementById('editContent');
    content.innerHTML = `
        <button class="modal-close" id="editClose">✕</button>
        <div style="padding: 20px;">
            <div class="form-title">${isCreatingNew ? '🐱 新增猫猫档案' : `✏️ 编辑「${escapeHtml(editingCat.name)}」`}</div>

            <div class="form-block">
                <label class="form-label">猫咪照片 <span class="form-hint">(可上传,会保存到 GitHub)</span></label>
                <div class="photo-grid" id="photoGrid">
                    ${photosArr.map((p, i) => `
                        <div class="photo-grid-item">
                            <img class="photo-grid-img" src="${escapeHtml(p)}" alt="图${i+1}">
                        </div>
                    `).join('')}
                    <div class="photo-add-btn" id="photoAddBtn">
                        <span>+</span><span>上传图片</span>
                        <input type="file" id="photoFile" accept="image/*" multiple style="display:none;">
                    </div>
                </div>
                <div class="form-hint">⚠️ 上传图片会保存到 GitHub 仓库 photos 目录</div>
            </div>

            <div class="form-row"><label class="form-label">名字 <span class="required">*</span></label><input class="form-input" id="f-name" value="${escapeHtml(editingCat.name || '')}"></div>
            <div class="form-row"><label class="form-label">江湖称号</label><input class="form-input" id="f-title" value="${escapeHtml(editingCat.title || '')}"></div>
            <div class="form-row"><label class="form-label">品种/特征</label><input class="form-input" id="f-breed" value="${escapeHtml(editingCat.breed || '')}"></div>
            <div class="form-row"><label class="form-label">性别</label>
                <select class="form-select" id="f-gender">
                    <option value="公" ${editingCat.gender === '公' ? 'selected' : ''}>公</option>
                    <option value="母" ${editingCat.gender === '母' ? 'selected' : ''}>母</option>
                    <option value="未知" ${!editingCat.gender || editingCat.gender === '未知' ? 'selected' : ''}>未知</option>
                </select>
            </div>
            <div class="form-row"><label class="form-label">年龄</label><input class="form-input" id="f-age" value="${escapeHtml(editingCat.age || '')}"></div>
            <div class="form-row"><label class="form-label">领养状态</label>
                <select class="form-select" id="f-status">
                    ${['待领养', '已领养', '暂不领养', '已离世'].map(s => `<option value="${s}" ${editingCat.adoption_status === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>
            <div class="form-row"><label class="form-label">健康状态</label><input class="form-input" id="f-health" value="${escapeHtml(editingCat.health || '')}"></div>
            <div class="form-row form-row-switch"><label class="form-label">已绝育</label>
                <label style="display:flex; align-items:center; gap:6px; padding: 6px 0;">
                    <input type="checkbox" id="f-neutered" ${editingCat.neutered ? 'checked' : ''}> 是
                </label>
            </div>
            <div class="form-row"><label class="form-label">档案来源</label><input class="form-input" id="f-source" value="${escapeHtml(editingCat.source || '')}"></div>

            <div class="form-block">
                <label class="form-label">性格标签 <span class="form-hint">(每行一条)</span></label>
                <textarea class="form-textarea" id="f-traits" rows="4">${escapeHtml((editingCat.traits || []).join('\n'))}</textarea>
            </div>

            <div class="form-block">
                <label class="form-label">专属事迹 <span class="form-hint">(每行一条)</span></label>
                <textarea class="form-textarea" id="f-stories" rows="4">${escapeHtml((editingCat.stories || []).join('\n'))}</textarea>
            </div>

            <div class="form-error hidden" id="editError"></div>

            <div class="btn-row">
                ${!isCreatingNew ? '<button class="btn-ghost btn-danger" id="btnDelete">🗑 删除</button>' : ''}
                <button class="btn-ghost" id="btnCancel">取消</button>
                <button class="btn-primary" id="btnSave">💾 保存到 GitHub</button>
            </div>
        </div>
    `;

    document.getElementById('editClose').onclick = closeEdit;
    document.getElementById('btnCancel').onclick = closeEdit;
    const btnDel = document.getElementById('btnDelete');
    if (btnDel) btnDel.onclick = deleteCat;
    document.getElementById('btnSave').onclick = saveCat;
    document.getElementById('photoFile').onchange = onPhotoSelected;
    document.getElementById('editModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    editingCat._newPhotos = [];
}

/** 渲染编辑表单(支持编辑和新增) */

function onPhotoSelected(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    files.forEach(file => {
        if (!/^image\//.test(file.type)) return alert('只支持图片');
        if (file.size > 5 * 1024 * 1024) return alert('图片不能超过 5MB');
        const reader = new FileReader();
        reader.onload = () => {
            editingCat._newPhotos = editingCat._newPhotos || [];
            editingCat._newPhotos.push({
                name: file.name,
                contentType: file.type,
                base64: reader.result.split(',')[1]
            });
            // 立即渲染新图片到网格
            const grid = document.getElementById('photoGrid');
            const div = document.createElement('div');
            div.className = 'photo-grid-item';
            div.innerHTML = `<img class="photo-grid-img" src="${reader.result}" alt="新">`;
            grid.insertBefore(div, document.getElementById('photoAddBtn'));
        };
        reader.readAsDataURL(file);
    });
    e.target.value = '';
}

function closeEdit() {
    document.getElementById('editModal').classList.add('hidden');
    document.body.style.overflow = '';
    editingCat = null;
    isCreatingNew = false;
}

// ===== GitHub API 保存 =====
async function getGithubFile() {
    const r = await fetch(
        `https://api.github.com/repos/${CFG.GH_OWNER}/${CFG.GH_REPO}/contents/${CFG.GH_FILE_PATH}?ref=${CFG.GH_BRANCH}`,
        { headers: { Authorization: `Bearer ${CFG.GH_TOKEN}`, Accept: 'application/vnd.github.v3+json' } }
    );
    if (!r.ok) throw new Error(`获取文件失败:${r.status}`);
    return r.json();
}

/** 解码 GitHub base64 文本(支持中文) */
function decodeBase64(b64) {
    // 去掉换行符,补齐 padding
    b64 = b64.replace(/\n/g, '');
    const binStr = atob(b64);
    // 用 TextDecoder 正确解码为 UTF-8(中文不会乱码)
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
}

/** 编码 UTF-8 文本为 GitHub base64 */
function encodeBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binStr = '';
    for (let i = 0; i < bytes.length; i++) binStr += String.fromCharCode(bytes[i]);
    return btoa(binStr);
}

async function updateGithubFile(contentBase64, message, sha, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        const body = {
            message,
            content: contentBase64,
            branch: CFG.GH_BRANCH,
            sha
        };
        const r = await fetch(
            `https://api.github.com/repos/${CFG.GH_OWNER}/${CFG.GH_REPO}/contents/${CFG.GH_FILE_PATH}`,
            {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${CFG.GH_TOKEN}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/vnd.github.v3+json'
                },
                body: JSON.stringify(body)
            }
        );
        if (r.ok) return r.json();

        // 409 冲突:取响应中的最新 sha 重试
        const err = await r.json().catch(() => ({}));
        if (r.status === 409 && err && err.document && err.document.sha) {
            console.warn(`SHA 冲突,自动用最新 sha 重试(${attempt}/${retries})`);
            sha = err.document.sha;
            continue;
        }
        throw new Error(`保存失败:${r.status} ${err.message || ''}`);
    }
    throw new Error('保存失败:多次 SHA 冲突');
}

async function uploadPhotoToGithub(fileName, base64, message, shaMap = {}) {
    const r = await fetch(
        `https://api.github.com/repos/${CFG.GH_OWNER}/${CFG.GH_REPO}/contents/${CFG.GH_FILE_PATH_PHOTOS}/${encodeURIComponent(fileName)}`,
        {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${CFG.GH_TOKEN}`,
                'Content-Type': 'application/json',
                Accept: 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
                message,
                content: base64,
                branch: CFG.GH_BRANCH,
                ...(shaMap[fileName] ? { sha: shaMap[fileName] } : {})
            })
        }
    );
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(`上传图片 ${fileName} 失败:${r.status} ${err.message || ''}`);
    }
    return r.json();
}

async function deleteGithubFile(filePath, message, sha) {
    const r = await fetch(
        `https://api.github.com/repos/${CFG.GH_OWNER}/${CFG.GH_REPO}/contents/${filePath}`,
        {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${CFG.GH_TOKEN}`,
                'Content-Type': 'application/json',
                Accept: 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({ message, sha, branch: CFG.GH_BRANCH })
        }
    );
    if (!r.ok && r.status !== 404) {
        const err = await r.json().catch(() => ({}));
        throw new Error(`删除文件失败:${r.status} ${err.message || ''}`);
    }
}

async function saveCat() {
    if (!CFG.GH_TOKEN) return alert('请先在 config.js 中填入 GitHub Token');

    const name = document.getElementById('f-name').value.trim();
    if (!name) return alert('请填写名字');
    const errEl = document.getElementById('editError');
    errEl.classList.add('hidden');
    errEl.textContent = '';

    // 收集新照片
    const newPhotos = editingCat._newPhotos || [];

    try {
        // 1. 上传新照片到 photos 目录
        const uploadedPhotos = (editingCat.photos || (editingCat.photo ? [editingCat.photo] : []))
            .slice();
        for (const photo of newPhotos) {
            errEl.textContent = `上传图片: ${photo.name}...`;
            errEl.classList.remove('hidden');
            const upRes = await uploadPhotoToGithub(
                `${Date.now()}-${Math.floor(Math.random() * 10000)}-${photo.name.replace(/[^\w.\u4e00-\u9fa5-]/g, '_')}`,
                photo.base64,
                `上传 ${name} 的照片`
            );
            uploadedPhotos.push(`photos/${upRes.content.name.split('/').pop()}`);
        }

        // 2. 更新档案数据(再次获取最新 sha,避免上传照片导致 sha 变化)
        errEl.textContent = isCreatingNew ? '新建档案...' : '更新档案...';
        errEl.classList.remove('hidden');
        const fileInfo = await getGithubFile();
        const decoded = decodeBase64(fileInfo.content);
        // 去掉顶部 JS 注释行(以 // 开头的整行)
        const cleaned = decoded.split('\n')
            .filter(line => !line.trim().startsWith('//'))
            .join('\n');
        const newData = cleaned.replace(/window\.CATS_DATA\s*=\s*/, '').replace(/;\s*$/, '').trim();
        let catsArr = JSON.parse(newData);
        const idx = catsArr.findIndex(c => c.id === editingCat.id);
        if (!isCreatingNew && idx < 0) throw new Error('找不到原档案');

        const newCatData = {
            ...editingCat,
            name,
            title: document.getElementById('f-title').value.trim(),
            breed: document.getElementById('f-breed').value.trim(),
            gender: document.getElementById('f-gender').value,
            age: document.getElementById('f-age').value.trim(),
            adoption_status: document.getElementById('f-status').value,
            health: document.getElementById('f-health').value.trim(),
            neutered: document.getElementById('f-neutered').checked,
            source: document.getElementById('f-source').value.trim(),
            traits: document.getElementById('f-traits').value.split('\n').map(s => s.trim()).filter(Boolean),
            stories: document.getElementById('f-stories').value.split('\n').map(s => s.trim()).filter(Boolean),
            photo: uploadedPhotos[0] || '',
            photos: uploadedPhotos
        };

        if (isCreatingNew) {
            // 新增:追加到数组
            catsArr.push(newCatData);
        } else {
            // 编辑:替换原档案
            catsArr[idx] = newCatData;
        }

        const newJson = 'window.CATS_DATA = ' + JSON.stringify(catsArr, null, 2) + ';';
        const encoded = encodeBase64(newJson);
        await updateGithubFile(encoded, isCreatingNew ? `新增 ${name} 的档案` : `更新 ${name} 的档案`, fileInfo.sha);

        alert(`✅ ${name} 已${isCreatingNew ? '新增' : '保存'}!\n\n1~2 分钟后 GitHub Pages 重建完成,刷新页面即可看到。`);
        closeEdit();
        // 更新本地数据
        cats = catsArr;
        window.CATS_DATA = catsArr;
        refresh();
    } catch (err) {
        errEl.textContent = err.message || '保存失败';
        errEl.classList.remove('hidden');
    }
}

async function deleteCat() {
    if (!confirm(`确定删除「${editingCat.name}」的档案?`)) return;
    if (!CFG.GH_TOKEN) return alert('请先在浏览器 Console 跑: localStorage.setItem("gh_token", "你的GitHub PAT")');

    try {
        const fileInfo = await getGithubFile();
        const decoded = decodeBase64(fileInfo.content);
        const cleaned = decoded.split('\n')
            .filter(line => !line.trim().startsWith('//'))
            .join('\n');
        let catsArr = JSON.parse(cleaned.replace(/window\.CATS_DATA\s*=\s*/, '').replace(/;\s*$/, '').trim());
        catsArr = catsArr.filter(c => c.id !== editingCat.id);

        const newJson = 'window.CATS_DATA = ' + JSON.stringify(catsArr, null, 2) + ';';
        const encoded = encodeBase64(newJson);
        await updateGithubFile(encoded, `删除 ${editingCat.name} 的档案`, fileInfo.sha);

        alert(`✅ ${editingCat.name} 已删除!`);
        closeEdit();
        cats = catsArr;
        window.CATS_DATA = catsArr;
        refresh();
    } catch (err) {
        alert('删除失败:' + (err.message || '未知错误'));
    }
}

// ===== 事件绑定 =====
document.getElementById('adminToggle').addEventListener('click', () => {
    if (isAdmin) exitAdmin();
    else openPasswordModal();
});

document.getElementById('adminAddBtn').addEventListener('click', () => {
    if (isAdmin) openEdit(null);   // null = 新增模式
});

document.getElementById('passwordConfirm').addEventListener('click', submitPassword);
document.getElementById('passwordCancel').addEventListener('click', closePasswordModal);
document.getElementById('passwordClose').addEventListener('click', closePasswordModal);
document.getElementById('passwordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitPassword();
});
document.getElementById('detailModal').addEventListener('click', (e) => {
    if (e.target.id === 'detailModal') closeDetail();
});
document.getElementById('passwordModal').addEventListener('click', (e) => {
    if (e.target.id === 'passwordModal') closePasswordModal();
});
document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target.id === 'editModal') closeEdit();
});

document.getElementById('filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    currentFilter = chip.dataset.filter;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    refresh();
});

let searchTimer = null;
document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        currentKeyword = e.target.value;
        refresh();
    }, 200);
});

// ===== 启动 =====
load();