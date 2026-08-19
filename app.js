// web/app.js —— 校园猫猫档案网页版(零依赖版,直接 HTTP 调用云函数)
// 云函数需要在微信云开发控制台启用 HTTP 触发路径
// 从 cloudbase-config.js 注入(已配 cloud1-d7gu5dy8z80af58cd)
const CLOUD_ENV_ID = (typeof CLOUD_ENV_ID !== 'undefined' && CLOUD_ENV_ID)
    || 'cloud1-d7gu5dy8z80af58cd';
const FUNCTION_BASE = `https://${CLOUD_ENV_ID}.service.tcloudbase.com/functions`;

// ========== 状态 ==========
const STATUS_OPTIONS = ['待领养', '已领养', '暂不领养', '已离世'];
const GENDER_OPTIONS = ['公', '母', '未知'];
const BADGE_MAP = {
    '待领养': 'badge-adoptable',
    '已领养': 'badge-adopted',
    '已离世': 'badge-passed',
    '暂不领养': 'badge-other'
};
const MAX_PHOTOS = 9;

let currentFilter = '全部';
let currentKeyword = '';
let cats = [];
let isAdmin = false;
let adminPassword = '';
let editingCat = null;
let editingPhotos = [];
let deletedPhotos = [];

async function callFn(name, data = {}) {
    const url = `${FUNCTION_BASE}/${name}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {})
    });
    const body = await res.json().catch(() => ({}));
    if (body && body.success === false) {
        throw new Error(body.message || '操作失败');
    }
    return body || {};
}

async function uploadPhoto(file) {
    const base64 = await fileToBase64(file);
    const r = await callFn('webUploadPhoto', {
        fileName: file.name || 'photo.jpg',
        contentType: file.type || 'image/jpeg',
        data: base64
    });
    if (!r.fileID) throw new Error(r.message || '上传失败');
    return r.fileID;
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function getPhotos(cat) {
    if (!cat) return { urls: [], ids: [], count: 0 };
    const ids = [];
    if (Array.isArray(cat.photos) && cat.photos.length) {
        cat.photos.forEach(p => { if (p) ids.push(p); });
    } else if (cat.photo) {
        ids.push(cat.photo);
    }
    const urls = ids.map((_, i) =>
        (cat.photoUrls && cat.photoUrls[i]) || cat.photoUrl || ''
    );
    return { urls, ids, count: ids.length };
}

const $ = (id) => document.getElementById(id);
const listEl = $('catList');
const emptyBox = $('emptyBox');
const errorBox = $('errorBox');
const errorText = $('errorText');
const loadingBox = $('loadingBox');
const searchInput = $('searchInput');
const filtersEl = $('filters');
const adminToggle = $('adminToggle');
const adminBar = $('adminBar');
const btnAdd = $('btnAdd');
const detailModal = $('detailModal');
const modalBody = $('modalBody');
const modalMask = $('modalMask');
const passwordModal = $('passwordModal');
const editModal = $('editModal');
const editBody = $('editBody');

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

function formatMeta(cat) {
    const parts = [];
    if (cat.gender && cat.gender !== '未知') parts.push(`⚧ ${cat.gender}`);
    if (cat.age && cat.age !== '未知') parts.push(cat.age);
    return parts.join(' · ');
}

function getFiltered() {
    const kw = currentKeyword.trim();
    return cats.filter(cat => {
        if (currentFilter !== '全部' && cat.adoption_status !== currentFilter) return false;
        if (kw) {
            const text = `${cat.name}${cat.title}${cat.breed || ''}${(cat.traits || []).join('')}${(cat.stories || []).join('')}${cat.source || ''}`;
            if (!text.includes(kw)) return false;
        }
        return true;
    });
}

function refresh() {
    renderList(getFiltered());
}

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

function openDetail(cat) {
    const isPassed = cat.adoption_status === '已离世';
    const photos = getPhotos(cat);
    const photoUrls = photos.urls;
    const photoCount = photos.count;

    const heroHtml = photoCount > 0
        ? `<div class="detail-hero">
                <button class="detail-close" id="detailClose">✕</button>
                <div class="detail-swiper" id="detailSwiper">
                    ${photoUrls.map(url => `<img class="detail-photo ${isPassed ? 'passed' : ''}" src="${escapeHtml(url)}" alt="${escapeHtml(cat.name)}">`).join('')}
                    ${photoCount > 1 ? `<div class="swiper-dots">${photoUrls.map((_, i) => `<span class="swiper-dot ${i === 0 ? 'active' : ''}" data-i="${i}"></span>`).join('')}</div><div class="swiper-counter">1 / ${photoCount}</div>` : ''}
                </div>
                <div class="detail-mask"></div>
                <div class="detail-hero-info">
                    <div class="detail-name-row">
                        <span class="detail-name">${escapeHtml(cat.name)}</span>
                        <span class="badge ${BADGE_MAP[cat.adoption_status] || 'badge-other'}">${escapeHtml(cat.adoption_status)}</span>
                    </div>
                    <div class="detail-title">🎭 ${escapeHtml(cat.title)}</div>
                </div>
            </div>`
        : `<div class="detail-hero">
                <button class="detail-close" id="detailClose">✕</button>
                <div class="detail-photo placeholder"><div class="placeholder-icon">🐱</div></div>
                <div class="detail-hero-info">
                    <div class="detail-name-row">
                        <span class="detail-name">${escapeHtml(cat.name)}</span>
                        <span class="badge ${BADGE_MAP[cat.adoption_status] || 'badge-other'}">${escapeHtml(cat.adoption_status)}</span>
                    </div>
                    <div class="detail-title">🎭 ${escapeHtml(cat.title)}</div>
                </div>
            </div>`;

    modalBody.innerHT
