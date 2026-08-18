// batch-upload.js —— 批量上传猫咪照片工具
// 通过 fileName 自动匹配 14 只猫,一次传到云存储并保存到 cats 档案

const CATS = [
    '龙龙', '年年', '躲躲', '挖挖', '皮皮',
    '呱呱', '花花', '白鼻', '话唠', '麻薯',
    '三毛', '汤圆', '推推', '蓬蓬'
];

const STATUS_ADOPTABLE = ['待领养'];
const STATUS_ADOPTED = ['已领养'];
const STATUS_PASSED = ['已离世'];

const app = cloudbase.init({ env: CLOUD_ENV_ID });
const auth = app.auth();
const db = app.database();
const catsRef = db.collection('cats');

const fileMap = {};   // name → File 对象
let existingMap = {}; // name → _id(已加载的数据库档案)

/** 渲染 14 行猫咪选择框 */
function renderRows() {
    const box = document.getElementById('catRows');
    box.innerHTML = '';
    CATS.forEach(name => {
        const row = document.createElement('div');
        row.className = 'cat-row';
        row.innerHTML = `
            <span class="cat-name">${name}</span>
            <label class="cat-input" id="row-${name}">
                <input type="file" accept="image/*" data-name="${name}" multiple style="display:none">
                📷 点击选择照片(支持多选)
            </label>
        `;
        box.appendChild(row);
        // 绑定选择事件
        const input = row.querySelector('input[type=file]');
        input.addEventListener('change', e => onFilePick(name, e.target.files));
    });
}

/** 处理选择文件(支持多选) */
function onFilePick(name, files) {
    if (!files || files.length === 0) return;
    // 取第一个匹配猫名的文件(忽略大小写、扩展名)
    let matchFile = null;
    for (const f of files) {
        const base = f.name.replace(/\.\w+$/, '').trim();
        if (base === name) {
            matchFile = f;
            break;
        }
    }
    // 没精确匹配就用第一个
    if (!matchFile) matchFile = files[0];
    fileMap[name] = matchFile;
    const label = document.getElementById(`row-${name}`);
    label.classList.add('has-file');
    label.lastChild.textContent = `✅ ${matchFile.name} (${(matchFile.size / 1024).toFixed(0)} KB)`;
}

/** 加载现有档案,建立 name → _id 映射 */
async function loadExisting() {
    try {
        const res = await catsRef.limit(100).get();
        existingMap = {};
        res.data.forEach(c => {
            if (c.name) existingMap[c.name] = c._id;
        });
        log(`📋 已加载 ${res.data.length} 条档案(${Object.keys(existingMap).length} 只已存在)`, 'success');
    } catch (err) {
        log(`⚠️ 加载档案失败:${err.message || err}`, 'fail');
    }
}

/** 上传单张照片到云存储 */
async function uploadOne(name) {
    const file = fileMap[name];
    if (!file) return null;
    const ext = (file.name.match(/\.(\w+)$/) || [])[1] || 'jpg';
    const cloudPath = `photos/${Date.now()}-${Math.floor(Math.random() * 100000)}.${ext}`;
    try {
        const res = await app.uploadFile({ cloudPath, filePath: file });
        return res.fileID;
    } catch (err) {
        throw new Error(`上传 ${name} 失败: ${err.message || err}`);
    }
}

/** 更新档案 photo 字段 */
async function updateCatPhoto(name, fileID) {
    const id = existingMap[name];
    if (!id) throw new Error(`档案 ${name} 不存在`);
    await catsRef.doc(id).update({ data: { photo: fileID } });
}

/** 主流程:批量上传 + 关联 */
async function doBatchUpload() {
    const names = Object.keys(fileMap);
    if (names.length === 0) {
        log('⚠️ 请先选择至少一张照片', 'fail');
        return;
    }
    log(`🚀 开始批量上传 ${names.length} 张照片...`);
    const btn = document.getElementById('btnUpload');
    btn.disabled = true;

    let success = 0;
    let fail = 0;
    for (const name of names) {
        try {
            log(`⬆️  上传 [${name}]...`);
            const fileID = await uploadOne(name);
            await updateCatPhoto(name, fileID);
            log(`✅ [${name}] 已上传并关联`, 'success');
            success++;
        } catch (err) {
            log(`❌ [${name}] 失败:${err.message || err}`, 'fail');
            fail++;
        }
    }
    btn.disabled = false;
    log(`\n🎉 完成!成功 ${success}/${names.length},失败 ${fail}`);
}

function log(msg, level) {
    const el = document.getElementById('progress');
    const div = document.createElement('div');
    div.textContent = msg;
    if (level === 'success') div.className = 'success';
    else if (level === 'fail') div.className = 'fail';
    el.appendChild(div);
}

document.getElementById('btnUpload').onclick = doBatchUpload;
document.getElementById('btnReset').onclick = () => {
    Object.keys(fileMap).forEach(k => delete fileMap[k]);
    document.getElementById('progress').innerHTML = '';
    renderRows();
};

// 初始化:尝试匿名登录 + 加载档案
(async function init() {
    renderRows();
    try {
        // 静默尝试匿名登录(失败也不影响)
        if (!auth.hasLoginState()) {
            await auth.anonymousAuthProvider().signIn().catch(() => {});
        }
    } catch (e) {}
    await loadExisting();
})();