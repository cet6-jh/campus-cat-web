# 校园猫猫档案

面向校园流浪猫的公开档案网站。访客可以搜索、筛选和浏览每只猫咪的资料；管理员可在网页中进入管理模式，新增、编辑或删除档案。

## 公开访问与发布

仓库使用 GitHub Pages 发布：在 GitHub 仓库的 **Settings → Pages** 中，将 Source 设为 **Deploy from a branch**，选择 `main` 分支和 `/(root)` 目录。发布后访问仓库对应的 GitHub Pages 地址。

本地修改后执行：

```powershell
git add index.html styles.css data.js config.js app-v2.js README.md
git commit -m "feat: 完善校园猫猫档案网站"
git push origin main
```

GitHub Pages 部署通常需要数分钟；网页资源带有版本参数，刷新页面即可获取新版本。

## 管理模式

1. 在页面点击“管理模式”并输入管理员密码。
2. 点击“设置 GitHub Token”。
3. 在 GitHub 创建 Fine-grained Personal Access Token：仓库选择 `cet6-jh/campus-cat-web`，Repository permissions 中将 **Contents** 设为 **Read and write**。
4. 将 Token 粘贴到网站弹窗中保存。它仅保存在当前浏览器的 `localStorage`，不会被写入仓库。

管理员密码仅用于前端界面门禁，不能替代服务器端认证。拥有 Token 的浏览器才能将资料写回 GitHub。

## 文件说明

- `index.html`：网站结构和弹窗。
- `styles.css`：视觉样式和响应式布局。
- `data.js`：猫咪公开资料。
- `config.js`：公开仓库配置与管理模式密码。
- `app-v2.js`：搜索、详情、管理模式、图片上传与 GitHub 保存逻辑。
