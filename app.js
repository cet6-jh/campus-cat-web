// web/app.js —— 校园猫猫档案网页版逻辑(列表渲染/搜索/筛选/详情弹层)

// 领养状态 → 徽章样式类名映射
const BADGE_MAP = {
    '待领养': 'badge-adoptable',
    '已领养': 'badge-adopted',
    '已离世': 'badge-passed',
    '暂不领养': 'badge-other'
};

// 当前筛选条件与关键词
let currentFilter = '全部';
let currentKeyword = '';

// DOM 元素引用
const listEl = document.getElementById('catList');
const emptyBox = document.getElementById('emptyBox');
const searchInput = document.getElementById('searchInput');
const filtersEl = document.getElementById('filters');
const detailModal = document.getElementById('detailModal');
const modalBody = document.getElementById('modalBody');
const modalMask = document.getElementById('modalMask');

/**
 * 渲染猫猫卡片列表
 * @param {Array} cats 待展示的猫猫数组
 */
function renderList(cats) {
    listEl.innerHTML = '';
    emptyBox.classList.toggle('hidden', cats.length > 0);

    cats.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'cat-card';
        card.onclick = () => openDetail(cat);
        card.innerHTML = `
            <img class="cat-photo ${cat.adoption_status === '已离世' ? 'passed' : ''}"
                 src="${escapeHtml(cat.photo)}" alt="${escapeHtml(cat.name)}" loading="lazy">
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
        `;
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

/**
 * 按筛选条件与关键词过滤猫猫
 * @returns {Array} 过滤后的数组
 */
function getFiltered() {
    const kw = currentKeyword.trim();
    return CATS.filter(cat => {
        // 状态筛选
        if (currentFilter !== '全部' && cat.adoption_status !== currentFilter) return false;
        // 关键词筛选(匹配名字/称号/花色)
        if (kw) {
            const text = `${cat.name}${cat.title}${cat.breed || ''}`;
            if (!text.includes(kw)) return false;
        }
        return true;
    });
}

/** 重新渲染(筛选/搜索后调用) */
function refresh() {
    renderList(getFiltered());
}

/**
 * 打开详情弹层
 * @param {Object} cat 猫猫档案对象
 */
function openDetail(cat) {
    const isPassed = cat.adoption_status === '已离世';
    modalBody.innerHTML = `
        <div class="detail-hero">
            <button class="detail-close" id="detailClose">✕</button>
            <img class="detail-photo ${isPassed ? 'passed' : ''}" src="${escapeHtml(cat.photo)}" alt="${escapeHtml(cat.name)}">
            <div class="detail-mask"></div>
            <div class="detail-hero-info">
                <div class="detail-name-row">
                    <span class="detail-name">${escapeHtml(cat.name)}</span>
                    <span class="badge ${BADGE_MAP[cat.adoption_status] || 'badge-other'}">${escapeHtml(cat.adoption_status)}</span>
                </div>
                <div class="detail-title">🎭 ${escapeHtml(cat.title)}</div>
            </div>
        </div>

        <div class="detail-card">
            <div class="detail-section-title">🧬 基本信息</div>
            ${infoRow('品种/特征', cat.breed || '未知')}
            ${infoRow('性别', cat.gender || '未知')}
            ${infoRow('年龄', cat.age || '未知')}
            ${infoRow('健康状态', cat.health || '待观察')}
            ${infoRow('绝育情况',
                cat.neutered
                    ? '<span class="detail-value neutered-yes">✅ 已绝育</span>'
                    : '<span class="detail-value neutered-no">⚠️ 未绝育</span>')}
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
}

/** 生成一条信息行(内嵌 span 标签时用 html,否则纯文本) */
function infoRow(label, content) {
    return `<div class="detail-info-row">
        <span class="detail-label">${label}</span>
        <span class="detail-value">${content}</span>
    </div>`;
}

/** 关闭详情弹层 */
function closeDetail() {
    detailModal.classList.add('hidden');
    document.body.style.overflow = '';
}

/**
 * 转义 HTML 特殊字符,防止注入与显示异常
 * @param {string} str 原始字符串
 * @returns {string} 转义后的字符串
 */
function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ---------- 事件绑定 ---------- */

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

// 点击遮罩关闭详情
modalMask.addEventListener('click', closeDetail);

// 初始化渲染
refresh();
