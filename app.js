// web/app.js —— 校园猫猫档案网页版(在线编辑版)
// 数据通过腾讯云开发(CloudBase Web SDK)实时读写,与微信小程序共用一套数据

// ========== 状态 ==========
const STATUS_OPTIONS = ['待领养', '已领养', '暂不领养', '已离世'];
const GENDER_OPTIONS = ['公', '母', '未知'];

// 领养状态 → 徽章样式类名
const BADGE_MAP = {
    '待领养': 'badge-adoptable',
    '已领养': 'badge-adopted',
    '已离世': 'badge-passed',
    '暂不领养': 'badge-other'
};

let currentFilter = '全部';     // 当前状态筛选
let currentKeyword = '';        // 搜索关键词
let cats = [];                  // 全量猫猫数据(含 photoUrl)
let isAdmin = false;            // 是否处于管理模式
let adminPassword = '';         // 本次会话的管理密码(仅存内存)
let editingCat = null;          // 正在编辑的猫(含 _id;null 表示新增)

/** 从档案中提取照片列表(兼容新旧两种格式)
 *  新数据:photos = ['cloud://...', ...](数组)
 *  旧数据:photo = 'cloud://...'(字符串)
 *  返回 { urls: [...], ids: [...], count: N }
 */
const MAX_PHOTOS = 9;
function getPhotos(cat) {
    if (!cat) return { urls: [], ids: [], count: 0 };
    const ids = [];
    if (Array.isArray(cat.photos) && cat.photos.length) {
        cat.photos.forEach(p => {
 if (p) ids.push(p);
        });
    } else if (cat.photo) {
        ids.push(cat.photo);
    }
    const urls = ids.map((_, i) => {
        if (Array.isArray(cat.photos)) {
            // 优先用对应的 photoUrls[i],fallback photoUrl
            return (cat.photoUrls && cat.photoUrls[i]) || cat.photoUrl || '';
        }
        return cat.photoUrl || '';
    });
    return { urls, ids, count: ids.length };
}

// ========== 云开发初始化 ==========
const cloudApp = cloudbase.init({ env: CLOUD_ENV_ID });

/** 尝试匿名登录(失败不影响只读访问,写操作靠密码校验) */
async function ensureCloudLogin() {
    try {
        const auth = cloudApp.auth();
        if (!auth.hasLoginState()) {
            await auth.anonymousAuthProvider().signIn();
        }
    } catch (err) {
        console.warn('匿名登录未启用(不影响浏览):', err.message || err);
    }
}

/** 调用云函数并返回 result */
async function callFn(name, data = {}) {
    const res = await cloudApp.callFunction({ name, data });
    const result = res && res.result;
    if (result && result.success === false) {
        throw new Error(result.message || '操作失败');
    }
    return result;
}

// ========== DOM 引用 ==========
const listEl = document.getElementById('catList');
const emptyBox = document.getElementById('emptyBox');
const errorBox = document.getElementById('errorBox');
const errorText = document.getElementById('errorText');
const loadingBox = document.getElementById('loadingBox');
const searchInput = document.getElementById('searchInput');
const filtersEl = document.getElementById('filters');
const adminToggle = document.getElementById('adminToggle');
const adminBar = document.getElementById('adminBar');
const btnAdd = document.getElementById('btnAdd');
const detailModal = document.getElementById('detailModal');
const modalBody = document.getElementById('modalBody');
const modalMask = document.getElementById('modalMask');
const passwordModal = document.getElementById('passwordModal');
const passwordBody = document.getElementById('passwordBody');
const editModal = document.getElementById('editModal');
const editBody = document.getElementById('editBody');

// ========== 列表渲染 ==========

/**
 * 渲染猫猫卡片列表
 * @param {Array} list 待展示的猫猫数组
 */
function renderList(list) {
    listEl.innerHTML = '';
    emptyBox.classList.toggle('hidden', list.length > 0);

    list.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'cat-card';
        card.onclick = () => openDetail(cat);

        const photos = getPhotos(cat);
        const firstUrl = photos.urls[0] || '';
        const photoCount = photos.count;
        card.innerHTML = `
            <div class="cat-photo-wrap">
                <img class="cat-photo ${cat.adoption_status === '已离世' ? 'passed' : ''}"
                     src="${escapeHtml(firstUrl)}" alt="${escapeHtml(cat.name)}"
                     onerror="this.style.visibility='hidden'">
                ${photoCount > 1 ? `<span class="photo-count">${photoCount}</span>` : ''}
            </div>
            <div class="cat-info">
                <div class="cat-name-row">
                    <span class="cat-name">${escapeHtml(cat.name)}</span>
                    <span class="badge ${BADGE_MAP[cat.adoption_status] || 'badge-other'}">${escapeHtml(cat.adoption_status)}</span>
                </div>
                <div class="cat-title">🎭 ${escapeHtml(cat.title)}</div>
                <div class="cat-meta">${formatMeta(cat)}</div>
                <div class="cat-tags">
                    ${(cat.traits || []).slice(0, 3).map(t => `<span class="cat-tag">${escapeHtml(t)}</span>`).join('')}
                </div>
            </div>
            ${isAdmin ? `<button class="card-edit" data-id="${escapeHtml(cat._id)}">编辑</button>` : ''}
        `;
        // 管理模式下的编辑按钮(阻止冒泡,不触发详情)
        const editBtn = card.querySelector('.card-edit');
        if (editBtn) {
            editBtn.onclick = (e) => {
                e.stopPropagation();
                openEditForm(cat);
            };
        }
        listEl.appendChild(card);
    });
}

/** 组装性别/年龄等元信息 */
function formatMeta(cat) {
    const parts = [];
    if (cat.gender && cat.gender !== '未知') parts.push(`⚧ ${cat.gender}`);
    if (cat.age && cat.age !== '未知') parts.push(cat.age);
    return parts.join(' · ');
}

/** 按筛选条件与关键词过滤 */
function getFiltered() {
    const kw = currentKeyword.trim();
    return cats.filter(cat => {
        if (currentFilter !== '全部' && cat.adoption_status !== currentFilter) return false;
        if (kw) {
            const text = `${cat.name}${cat.title}${cat.breed || ''}`;
            if (!text.includes(kw)) return false;
        }
        return true;
    });
}

/** 重新渲染 */
function refresh() {
    renderList(getFiltered());
}

// ========== 数据加载 ==========

/** 从云函数拉取全部猫猫 */
async function loadCats() {
    loadingBox.classList.remove('hidden');
    errorBox.classList.add('hidden');
    try {
        const result = await callFn('getCatList');
        cats = result.data || [];
        refresh();
    } catch (err) {
        console.error('加载失败:', err);
        cats = [];
        refresh();
        errorBox.classList.remove('hidden');
        errorText.textContent = err.message || '数据加载失败';
    } finally {
        loadingBox.classList.add('hidden');
    }
}

// ========== 详情弹层 ==========

/** 打开详情 */
function openDetail(cat) {
    const isPassed = cat.adoption_status === '已离世';
    const photos = getPhotos(cat);
    const photoUrls = photos.urls;
    const photoCount = photoCount(photos);

    const heroHtml = photoCount > 0
        ? `
            <div class="detail-hero">
                <button class="detail-close" id="detailClose">✕</button>
                <div class="detail-swiper" id="detailSwiper">
                    ${photoUrls.map(url => `
                        <img class="detail-photo ${isPassed ? 'passed' : ''}"
                             src="${escapeHtml(url)}" alt="${escapeHtml(cat.name)}">
                    `).join('')}
                    ${photoCount > 1 ? `
                        <div class="swiper-dots">
                            ${photoUrls.map((_, i) => `<span class="swiper-dot ${i === 0 ? 'active' : ''}" data-i="${i}"></span>`).join('')}
                        </div>
                        <div class="swiper-counter">${photoCount > 1 ? `1 / ${photoCount}` : ''}</div>
                    ` : ''}
                </div>
                <div class="detail-mask"></div>
                <div class="detail-hero-info">
                    <div class="detail-name-row">
                        <span class="detail-name">${escapeHtml(cat.name)}</span>
                        <span class="badge ${BADGE_MAP[cat.adoption_status] || 'badge-other'}">${escapeHtml(cat.adoption_status)}</span>
                    </div>
                    <div class="detail-title">🎭 ${escapeHtml(cat.title)}</div>
                </div>
            </div>
        `
        : `
            <div class="detail-hero">
                <button class="detail-close" id="detailClose">✕</button>
                <div class="detail-photo placeholder">
                    <div class="placeholder-icon">🐱</div>
                </div>
                <div class="detail-hero-info">
                    <div class="detail-name-row">
                        <span class="detail-name">${escapeHtml(cat.name)}</span>
                        <span class="badge ${BADGE_MAP[cat.adoption_status] || 'badge-other'}">${escapeHtml(cat.adoption_status)}</span>
                    </div>
                    <div class="detail-title">🎭 ${escapeHtml(cat.title)}</div>
                </div>
            </div>
        `;

    modalBody.innerHTML = heroHtml + `
        <div class="detail-card">
            <div class="detail-section-title">🧬 基本信息</div>
            ${infoRow('品种/特征', cat.breed || '未知')}
            ${infoRow('性别', cat.gender || '未知')}
            ${infoRow('年龄', cat.age || '未知')}
            ${infoRow('健康状态', cat.health || '待观察')}
            ${infoRow('绝育情况',
                cat.neutered
                    ? '<span class="neutered-yes">✅ 已绝育</span>'
                    : '<span class="neutered-no">⚠️ 未绝育</span>')}
        </div>

        ${(cat.traits && cat.traits.length)
            ? `<div class="detail-card">
                <div class="detail-section-title">🧠 性格标签</div>
                <div class="detail-tags">
                    ${cat.traits.map(t => `<span class="detail-tag">${escapeHtml(t)}</span>`).join('')}
                </div>
               </div>`
            : ''}

        ${(cat.stories && cat.stories.length)
            ? `<div class="detail-card">
                <div class="detail-section-title">📜 专属事迹</div>
                ${cat.stories.map(s => `<div class="story-item"><span class="story-dot">🐾</span><span>${escapeHtml(s)}</span></div>`).join('')}
               </div>`
            : ''}

        ${cat.source ? `<div class="detail-source">📢 档案来源:${escapeHtml(cat.source)}</div>` : ''}

        ${isPassed ? '<div class="memorial">🕊️ 愿它在喵星安息,谢谢它曾陪伴我们的校园时光</div>' : ''}
    `;
    detailModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.getElementById('detailClose').onclick = closeDetail;

    // 绑定轮播切换(如果有照片)
    if (photoCount > 1) {
        bindSwiperEvents();
    }
}

/** 获取照片数量(辅助) */
function photoCount(photos) {
    return photos && photos.count ? photos.count : 0;
}

/** 绑定轮播图切换(点击轮播切换图片) */
function bindSwiperEvents() {
    const swiper = document.getElementById('detailSwiper');
    const photos = swiper.querySelectorAll('.detail-photo');
    const dots = swiper.querySelectorAll('.swiper-dot');
    const counter = swiper.querySelector('.swiper-counter');
    let current = 0;
    const total = photos.length;

    const show = (i) => {
        current = (i + total) % total;
        photos.forEach((p, idx) => p.style.display = idx === current ? 'block' : 'none');
        dots.forEach((d, idx) => d.classList.toggle('active', idx === current));
        if (counter) counter.textContent = `${current + 1} / ${total}`;
    };

    // 初始隐藏非当前图
    photos.forEach((p, idx) => p.style.display = idx === 0 ? 'block' : 'none');

    // 点击切换
    swiper.onclick = () => show(current + 1);
    // 点击指示器
    dots.forEach((dot, i) => dot.onclick = (e) => { e.stopPropagation(); show(i); });
}

/** 生成一条信息行 */
function infoRow(label, content) {
    return `<div class="detail-info-row">
        <span class="detail-label">${label}</span>
        <span class="detail-value">${content}</span>
    </div>`;
}

/** 关闭详情 */
function closeDetail() {
    detailModal.classList.add('hidden');
    document.body.style.overflow = '';
}

// ========== 管理模式(密码) ==========

/** 打开密码弹层 */
function openPasswordModal() {
    // 未配置环境 ID 时直接提示
    if (!CLOUD_ENV_ID) {
        alert('尚未配置云开发环境:\n1. 按部署手册开通云开发\n2. 把环境 ID 填进 cloudbase-config.js\n3. 重新部署网页后即可管理');
        return;
    }
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordError').classList.add('hidden');
    passwordModal.classList.remove('hidden');
}

/** 校验密码并进入管理模式 */
async function submitPassword() {
    const input = document.getElementById('passwordInput').value.trim();
    if (!input) return;
    try {
        const result = await callFn('login', { adminPassword: input });
        if (result.isAdmin) {
            adminPassword = input;
            isAdmin = true;
            passwordModal.classList.add('hidden');
            adminToggle.textContent = '🚪 退出管理';
            adminToggle.classList.add('admin-active');
            adminBar.classList.remove('hidden');
            refresh();   // 重新渲染,显示编辑按钮
            alert('✅ 已进入管理模式,可以新增/编辑/删除猫猫档案了');
        } else {
            document.getElementById('passwordError').classList.remove('hidden');
        }
    } catch (err) {
        alert('验证失败:' + (err.message || '请检查云函数是否已部署'));
    }
}

/** 退出管理模式 */
function exitAdmin() {
    isAdmin = false;
    adminPassword = '';
    adminToggle.textContent = '🔑 管理模式';
    adminToggle.classList.remove('admin-active');
    adminBar.classList.add('hidden');
    refresh();
}

// ========== 编辑表单(新增/编辑) ==========

/** 打开编辑表单 */
function openEditForm(cat) {
    editingCat = cat || null;   // 有值 = 编辑;null = 新增
    deletedPhotos = [];
    // 从 cat 提取现有照片(兼容旧 photo 字段)
    const initialPhotos = [];
    if (cat) {
        if (Array.isArray(cat.photos) && cat.photos.length) {
            cat.photos.forEach((id, i) => {
                initialPhotos.push({
                    fileID: id,
                    previewUrl: (cat.photoUrls && cat.photoUrls[i]) || cat.photoUrl || '',
                    isNew: false,
                    file: null
                });
            });
        } else if (cat.photo) {
            initialPhotos.push({
                fileID: cat.photo,
                previewUrl: cat.photoUrl || '',
                isNew: false,
                file: null
            });
        }
    }
    editingPhotos = initialPhotos.slice(0, MAX_PHOTOS);

    const f = cat || {
        name: '', title: '', breed: '', gender: '未知', age: '',
        adoption_status: '待领养', health: '', neutered: true, source: '',
        traits: [], stories: []
    };
    editBody.innerHTML = `
        <div class="form-card">
            <div class="form-title">${cat ? `✏️ 编辑「${escapeHtml(cat.name)}」` : '🐱 新增猫猫档案'}</div>

            <!-- 多图区(最多 ${MAX_PHOTOS} 张) -->
            <div class="form-block">
                <label class="form-label">猫咪照片 <span class="form-hint">(最多 ${MAX_PHOTOS} 张,可长按/点 ✕ 删除)</span></label>
                <div class="photo-grid" id="photoGrid"></div>
                <label class="btn-ghost btn-small photo-add-btn" id="photoAddBtn">
                    ＋ 添加照片
                    <input type="file" id="photoFile" accept="image/*" multiple class="hidden-input">
                </label>
            </div>

            <div class="form-row">
                <label class="form-label">名字 <span class="required">*</span></label>
                <input class="form-input" id="f-name" value="${escapeHtml(f.name)}" placeholder="如:龙龙" maxlength="20">
            </div>
            <div class="form-row">
                <label class="form-label">江湖称号</label>
                <input class="form-input" id="f-title" value="${escapeHtml(f.title)}" placeholder="如:待领养的橘座" maxlength="40">
            </div>
            <div class="form-row">
                <label class="form-label">品种/特征</label>
                <input class="form-input" id="f-breed" value="${escapeHtml(f.breed)}" placeholder="如:全橘、头小身子大" maxlength="60">
            </div>
            <div class="form-row">
                <label class="form-label">性别</label>
                <select class="form-select" id="f-gender">
                    ${GENDER_OPTIONS.map(g => `<option value="${g}" ${f.gender === g ? 'selected' : ''}>${g}</option>`).join('')}
                </select>
            </div>
            <div class="form-row">
                <label class="form-label">年龄</label>
                <input class="form-input" id="f-age" value="${escapeHtml(f.age)}" placeholder="如:三岁(未知留空)" maxlength="30">
            </div>
            <div class="form-row">
                <label class="form-label">领养状态</label>
                <select class="form-select" id="f-status">
                    ${STATUS_OPTIONS.map(s => `<option value="${s}" ${f.adoption_status === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>
            <div class="form-row">
                <label class="form-label">健康状态</label>
                <input class="form-input" id="f-health" value="${escapeHtml(f.health)}" placeholder="如:已绝育,健康" maxlength="60">
            </div>
            <div class="form-row">
                <label class="form-label">已绝育</label>
                <label class="checkbox-label">
                    <input type="checkbox" id="f-neutered" ${f.neutered ? 'checked' : ''}> 是
                </label>
            </div>
            <div class="form-row">
                <label class="form-label">档案来源</label>
                <input class="form-input" id="f-source" value="${escapeHtml(f.source)}" placeholder="如:小红书 @赣范喵喵" maxlength="60">
            </div>

            <div class="form-block">
                <label class="form-label">性格标签 <span class="form-hint">(每行一条)</span></label>
                <textarea class="form-textarea" id="f-traits" placeholder="黏人精&#10;叫声好听&#10;爱贴贴" rows="4" maxlength="500">${escapeHtml((f.traits || []).join('\n'))}</textarea>
            </div>

            <div class="form-block">
                <label class="form-label">专属事迹 <span class="form-hint">(每行一条)</span></label>
                <textarea class="form-textarea" id="f-stories" placeholder="与朵朵是亲兄妹&#10;偶尔需要控制体重" rows="4" maxlength="800">${escapeHtml((f.stories || []).join('\n'))}</textarea>
            </div>

            <p class="form-error hidden" id="formError"></p>

            <div class="form-btns">
                ${cat ? '<button class="btn-ghost btn-danger" id="btnDelete">🗑 删除档案</button>' : ''}
                <div class="form-btns-right">
                    <button class="btn-ghost" id="btnCancel">取消</button>
                    <button class="btn-primary" id="btnSave">保存</button>
                </div>
            </div>
        </div>
    `;

    // 表单事件
    document.getElementById('btnCancel').onclick = closeEditForm;
    document.getElementById('btnSave').onclick = () => saveForm();
    document.getElementById('photoFile').onchange = onPhotosSelected;

    renderPhotoGrid();

    editModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

/** 渲染照片网格(预览 + 删除按钮) */
function renderPhotoGrid() {
    const grid = document.getElementById('photoGrid');
    if (!grid) return;
    grid.innerHTML = editingPhotos.map((p, idx) => `
        <div class="photo-grid-item" data-idx="${idx}">
            <img class="photo-grid-img ${p.isNew ? 'is-new' : ''}" src="${escapeHtml(p.previewUrl)}" alt="照片${idx + 1}">
            <button type="button" class="photo-grid-del" data-idx="${idx}">✕</button>
        </div>
    `).join('');
    grid.querySelectorAll('.photo-grid-del').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            removePhotoAt(parseInt(btn.dataset.idx, 10));
        };
    });
    const addBtn = document.getElementById('photoAddBtn');
    if (addBtn) {
        addBtn.style.display = editingPhotos.length >= MAX_PHOTOS ? 'none' : '';
    }
}

/** 删除指定索引的照片 */
function removePhotoAt(idx) {
    if (idx < 0 || idx >= editingPhotos.length) return;
    const removed = editingPhotos.splice(idx, 1)[0];
    if (removed && removed.fileID && !removed.isNew) {
        deletedPhotos.push(removed.fileID);
    }
    renderPhotoGrid();
}

/** 选择多张照片 */
function onPhotosSelected(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remain = MAX_PHOTOS - editingPhotos.length;
    const toAdd = files.slice(0, remain);
    if (files.length > remain) {
        alert(`最多只能上传 ${MAX_PHOTOS} 张照片,已忽略多余的`);
    }
    toAdd.forEach(file => {
        if (!/^image\//.test(file.type)) {
            alert(`文件 ${file.name} 不是图片,已跳过`);
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert(`图片 ${file.name} 超过 5MB,已跳过`);
            return;
        }
        editingPhotos.push({
            fileID: null,
            previewUrl: URL.createObjectURL(file),
            isNew: true,
            file: file
        });
    });
    renderPhotoGrid();
    e.target.value = '';
}

/** 关闭编辑表单 */
function closeEditForm() {
    editModal.classList.add('hidden');
    document.body.style.overflow = '';
    editingCat = null;
    editingPhotos = [];
    deletedPhotos = [];
}

/** 把多行文本拆成数组(去除空行) */
function textToArray(text) {
    return (text || '').split('\n').map(s => s.trim()).filter(Boolean);
}

/** 保存表单(新增/编辑) */
async function saveForm() {
    const errorEl = document.getElementById('formError');
    const showError = (msg) => {
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
    };

    const name = document.getElementById('f-name').value.trim();
    if (!name) return showError('请填写猫猫名字');

    const payload = {
        id: editingCat ? editingCat._id : undefined,
        name,
        title: document.getElementById('f-title').value.trim(),
        breed: document.getElementById('f-breed').value.trim(),
        gender: document.getElementById('f-gender').value,
        age: document.getElementById('f-age').value.trim(),
        adoption_status: document.getElementById('f-status').value,
        health: document.getElementById('f-health').value.trim(),
        neutered: document.getElementById('f-neutered').checked,
        source: document.getElementById('f-source').value.trim(),
        traits: textToArray(document.getElementById('f-traits').value),
        stories: textToArray(document.getElementById('f-stories').value),
        // 多图字段:photos 数组(每个元素是 fileID)
        photos: editingPhotos.filter(p => p.fileID).map(p => p.fileID),
        // 同时保留 photo 字段兼容旧逻辑(取第一张)
        photo: editingPhotos.length ? (editingPhotos.find(p => p.fileID)?.fileID || '') : '',
        deletedPhotos,
        adminPassword
    };

    // 1. 上传所有新选的照片(还没有 fileID 的)
    const newFiles = editingPhotos.filter(p => p.isNew && p.file).map(p => p.file);
    if (newFiles.length) {
        errorEl.textContent = `上传 ${newFiles.length} 张照片中…`;
        errorEl.classList.remove('hidden');
        for (let i = 0; i < newFiles.length; i++) {
            const file = newFiles[i];
            try {
                const ext = (file.name.match(/\.(\w+)$/) || [])[1] || 'jpg';
                const cloudPath = `photos/${Date.now()}-${Math.floor(Math.random() * 100000)}.${ext}`;
                const upRes = await cloudApp.uploadFile({ cloudPath, filePath: file });
                // 找到对应预览位置,设置 fileID
                const idx = editingPhotos.findIndex(p => p.file === file);
                if (idx >= 0) editingPhotos[idx].fileID = upRes.fileID;
                // 写入 payload
                payload.photos.push(upRes.fileID);
            } catch (err) {
                return showError(`第 ${i + 1} 张照片上传失败: ${err.message || err}`);
            }
        }
        // 更新 payload 中的 photo 字段
        payload.photo = payload.photos[0] || '';
    }

    try {
        errorEl.classList.add('hidden');
        const result = await callFn('saveCat', payload);
        closeEditForm();
        await loadCats();
        alert('✅ ' + (result.message || '保存成功'));
    } catch (err) {
        showError(err.message || '保存失败,请重试');
    }
}

/** 删除当前编辑的档案 */
function deleteEditingCat() {
    if (!editingCat) return;
    if (!confirm(`确定删除「${editingCat.name}」的档案吗?删除后不可恢复。`)) return;
    callFn('deleteCat', { id: editingCat._id, adminPassword })
        .then(async () => {
            closeEditForm();
            await loadCats();
            alert('✅ 已删除');
        })
        .catch(err => {
            const errorEl = document.getElementById('formError');
            errorEl.textContent = err.message || '删除失败';
            errorEl.classList.remove('hidden');
        });
}

// ========== 工具函数 ==========

/** 转义 HTML 特殊字符,防止注入与显示异常 */
function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ========== 事件绑定 ==========

// 管理模式入口
adminToggle.addEventListener('click', () => {
    if (isAdmin) {
        exitAdmin();
    } else {
        openPasswordModal();
    }
});

// 新增猫咪(管理模式)
btnAdd.addEventListener('click', () => {
    if (!isAdmin) return;
    openEditForm(null);
});

// 密码弹层
document.getElementById('passwordCancel').onclick = () => passwordModal.classList.add('hidden');
document.getElementById('passwordConfirm').onclick = submitPassword;
document.getElementById('passwordMask').onclick = () => passwordModal.classList.add('hidden');
document.getElementById('passwordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitPassword();
});

// 筛选点击
filtersEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    currentFilter = chip.dataset.filter;
    filtersEl.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    refresh();
});

// 搜索输入(防抖 200ms)
let searchTimer = null;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        currentKeyword = e.target.value;
        refresh();
    }, 200);
});

// 编辑弹层遮罩关闭
editMask.addEventListener('click', closeEditForm);

// 详情遮罩关闭
modalMask.addEventListener('click', closeDetail);

// ========== 启动 ==========
(async function init() {
    // 未配置环境 ID:提示后停止(页面保持空白提示)
    if (!CLOUD_ENV_ID) {
        errorBox.classList.remove('hidden');
        errorText.textContent = '未配置云开发环境 ID';
        return;
    }
    try {
        await ensureCloudLogin();
    } catch (err) {
        // 匿名登录失败不阻塞,继续尝试加载
    }
    await loadCats();
})();
