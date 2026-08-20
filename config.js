// config.js —— 网页版公开配置
// 管理密码只用于隐藏网页编辑入口；静态网页中的密码不能作为强安全认证。
// GitHub Token 不写入此文件，由管理员在管理模式中输入并仅保存在当前浏览器。

// 管理员密码(网页端登录管理模式的密码)
const ADMIN_PASSWORD = 'gnnu9797';

// GitHub 仓库配置
const GH_OWNER = 'cet6-jh';           // 你的 GitHub 用户名
const GH_REPO = 'campus-cat-web';     // 仓库名
const GH_BRANCH = 'main';             // 分支名
const GH_FILE_PATH = 'data.js';        // 数据文件路径(在仓库中的路径)
const GH_FILE_PATH_PHOTOS = 'photos';  // 图片文件夹路径
// 运行时从 localStorage.gh_token 读取；Token 不会被提交到 GitHub。
const GH_TOKEN = localStorage.getItem('gh_token') || '';

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