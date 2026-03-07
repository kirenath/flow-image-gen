# Flow Image Gen

通过 [Flow2API](https://github.com/TheSmallHanCat/flow2api) 生成 AI 图片的 Web 界面。

## 功能

- 🎨 **文生图** — 输入描述生成图片
- 🖼️ **图生图** — 上传本地图片或粘贴公链 URL，基于参考图生成
- 📐 **比例 & 分辨率** — 支持 16:9 / 9:16 / 1:1 / 4:3 / 3:4，标准 / 2K / 4K
- 🔍 **灯箱放大** — 点击图片全屏预览
- 💾 **一键下载** — 下载生成的图片
- 🔒 **API Key 安全** — 服务端代理，Key 不暴露到浏览器
- 🔑 **访问密钥** — 支持 Admin（无限生成）和分发 Key（配额限制）

## 技术栈

- Next.js 16 (App Router)
- Cloudflare R2 (图生图中转)
- Flow2API (OpenAI 兼容 API)

## 快速开始

### 1. 安装

```bash
git clone https://github.com/你的用户名/flow-image-gen.git
cd flow-image-gen
npm install
```

### 2. 配置

复制 `MUST_READ_ME.env.template` 为 `.env.local` 并填入你的配置：

```bash
cp MUST_READ_ME.env.template .env.local
nano .env.local
```

### 3. 配置访问密钥

在项目根目录创建 `data/keys.json`：

```json
{
  "sk-admin-你的密钥": { "role": "admin", "name": "管理员" },
  "sk-user-001": { "role": "user", "name": "朋友A", "quota": 50 },
  "sk-user-002": { "role": "user", "name": "朋友B", "quota": 20 }
}
```

| 字段    | 说明                                    |
| ------- | --------------------------------------- |
| `role`  | `admin` = 无限生成，`user` = 有配额限制 |
| `name`  | 页面右上角显示的名称                    |
| `quota` | user 角色的最大生成次数                 |

> **提示：** 修改 `keys.json` 后无需重启，下次请求自动生效。  
> `data/` 目录已加入 `.gitignore`，密钥和用量数据不会被提交。

### 4. 运行

```bash
# 开发模式
npm run dev

# 生产部署
npm run build
PORT=3100 npm start
```

浏览器打开 http://localhost:3000（开发）或 http://localhost:3100（生产）

## 部署

推荐使用 PM2 部署到 VPS，与 Flow2API 同机运行，内网直连：

```bash
npm run build
PORT=3100 pm2 start npm --name flow-image-gen -- start
```

## 截图

> 深色 glassmorphism 主题，支持模型选择、比例/分辨率切换、图片画廊

## ⚠️ 免责声明

1. **本项目仅供学习和个人研究使用**，不得用于商业用途或对外提供服务。
2. 本项目依赖 [Flow2API](https://github.com/TheSmallHanCat/flow2api) 作为后端，其通过逆向工程调用 Google Flow 服务。**使用本项目可能违反 Google 的服务条款（ToS）**，包括但不限于：禁止逆向工程、禁止自动化访问、禁止绕过技术保护措施等。
3. **使用者需自行承担所有风险**，包括但不限于：账号封禁、服务中断、法律责任等。开发者不对因使用本项目而产生的任何直接或间接损失负责。
4. 本项目**不提供任何形式的担保**（明示或暗示），包括但不限于适销性、特定用途适用性的担保。
5. 请遵守当地法律法规，不要使用本项目生成违法、侵权或不当内容。
6. 如果您不同意上述声明，请勿使用本项目。

## License

AGPL-3.0
