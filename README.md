# Flow Image Gen

通过 [Flow2API](https://github.com/TheSmallHanCat/flow2api) 生成 AI 图片的 Web 界面。

## 功能

- 🎨 **文生图** — 输入描述生成图片
- 🖼️ **图生图** — 上传本地图片，基于参考图生成
- 📐 **比例 & 分辨率** — 支持 16:9 / 9:16 / 1:1 / 4:3 / 3:4，标准 / 2K / 4K
- 🔍 **灯箱放大** — 点击图片全屏预览
- 💾 **一键下载** — 下载生成的图片
- 🔒 **API Key 安全** — 服务端代理，Key 不暴露到浏览器
- 🐧 **Linux.do OAuth 登录** — 通过 Linux.do 账号认证，Trust Level 2+ 可用
- 📊 **配额管理** — 每位用户 10 次生图配额，管理员无限

## 技术栈

- Next.js 16 (App Router)
- Cloudflare R2 (图生图中转)
- Flow2API (OpenAI 兼容 API)
- Linux.do Connect (OAuth2 认证)

## 快速开始

### 1. 安装

```bash
git clone https://github.com/kirenath/flow-image-gen.git
cd flow-image-gen
npm install
```

### 2. 配置

复制 `MUST_READ_ME.env.template` 为 `.env.local` 并填入你的配置：

```bash
cp MUST_READ_ME.env.template .env.local
nano .env.local
```

需要配置以下环境变量：

| 变量                    | 说明                                                            |
| ----------------------- | --------------------------------------------------------------- |
| `FLOW_API_URL`          | Flow2API 地址                                                   |
| `FLOW_API_KEY`          | Flow2API 密钥                                                   |
| `R2_*`                  | Cloudflare R2 配置（图生图中转用）                              |
| `LINUXDO_CLIENT_ID`     | Linux.do Connect Client ID                                      |
| `LINUXDO_CLIENT_SECRET` | Linux.do Connect Client Secret                                  |
| `LINUXDO_REDIRECT_URI`  | OAuth 回调地址，如 `https://你的域名/api/auth/linuxdo/callback` |
| `LINUXDO_ADMIN_IDS`     | 管理员的 Linux.do 用户 ID（逗号分隔）                           |

### 3. 运行

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
