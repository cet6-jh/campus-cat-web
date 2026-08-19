// config.js —— 网页版配置
// ---------------------------------------------------------------
// ⚠️ 重要: 这个文件保存了管理员密码和 GitHub PAT
// 1. 修改密码: 修改 ADMIN_PASSWORD 字段
// 2. 填入 GitHub Token: 修改 GH_TOKEN 字段
// ---------------------------------------------------------------

// 管理员密码(网页端登录管理模式的密码)
const ADMIN_PASSWORD = 'gnnu9797';

// GitHub 仓库配置
const GH_OWNER = 'cet6-jh';           // 你的 GitHub 用户名
const GH_REPO = 'campus-cat-web';     // 仓库名
const GH_BRANCH = 'main';;            // 分支名
const GH_FILE_PATH = 'data.js';        // 数据文件路径(在仓库中的路径)
const GH_FILE_PATH_PHOTOS = 'photos';  // 图片文件夹路径
const GH_TOKEN = '';                   // ★ 必填:GitHub Personal Access Token

// 导出(全局变量,方便 app.js 使用)
window.APP_CONFIG = {
    ADMIN_PASSWORD,
    GH_OWNER,
    GH_REPO,
    GH_BRANCH,
    GH_FILE_PATH,
    GH_FILE_PATH_PHOTOS,
    GH_TOKEN
};