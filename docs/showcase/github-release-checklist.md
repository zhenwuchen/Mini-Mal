# GitHub 公开准备检查

检查日期：2026-11-17。

## 1. 当前 Git 状态

项目原始 Git 元数据不存在，也没有发现可恢复的 `.git` 目录、bundle 或仓库
备份。因此不存在可审计的旧 Git 历史。

本阶段已经建立新的本地 Git 历史：

- 默认分支：`main`；
- 远程：`https://github.com/zhenwuchen/Mini-Mal.git`；
- 首次提交：准备阶段完成 179 个文件的暂存与安全审计；
- 推送状态：未执行 push。

GitHub 仓库是否公开仍由人工确认。首次提交创建完成后，公开前应再次核对
暂存区、已跟踪文件和 GitHub Secret Scanning 结果。

## 2. 当前文件风险

### 已发现的本机敏感文件

- `.env`：含已填充的本地管理员和数据库配置，不应公开；
- `.env.local`：含已填充的认证密钥，不应公开；
- `prisma/dev.db`：本地 SQLite 数据库，含测试邮箱等数据，不应公开；
- `.next/`：构建产物，不应公开；
- `.playwright-cli/`、`output/`：本地截图与自动化产物，按需公开筛选后的副本；
- `settings.json`：本地工具权限配置，不属于项目源码。

敏感文件内容没有被写入展示站或本文档。

### `.gitignore` 覆盖

当前已覆盖：

- `.env*`，保留 `.env.example`；
- Prisma SQLite、WAL、SHM、journal、备份文件；
- 通用 `.sqlite`、`.sqlite3`；
- 根级与 Prisma 备份目录；
- `.next/`、`out/`、`build/`；
- `output/`、`.idea/`、`.playwright-cli/`；
- `.codex/`、`.claude/`、`.vscode/` 本地工具目录；
- `*.tsbuildinfo`、`next-env.d.ts`；
- 本地 `settings.json`。

这些规则已经通过 `git check-ignore` 验证。首次提交前又通过暂存文件列表确认
环境文件、数据库、构建产物和工具目录没有进入暂存区。

## 3. 可能误判但当前未见真实凭证的内容

- 测试文件中的 `example.com` 邮箱；
- 明显的虚构手机号和测试地址；
- 测试专用占位 Secret；
- `src/lib/auth-service.ts` 中用于时序平衡的 dummy bcrypt hash；
- 部署文档中的环境变量模板；
- 商品图片和 IMAGE_ATTRIBUTION 中的来源说明。

这些内容在公开前仍应人工复核。

## 4. 可重复执行的 Git 审计

仓库恢复后应执行：

```powershell
git status --short --branch
git remote -v
git ls-files | Select-String -Pattern '\.env|\.db|\.sqlite|backup|output|secret|credential'
git log --all --oneline -- .env .env.local prisma/dev.db
git log --all -S "AUTH_SECRET" --oneline
git log --all -S "CRON_SECRET" --oneline
```

如果历史中曾存在真实凭证：

- 立即停止公开；
- 轮换凭证；
- 评估是否需要历史清理；
- 不在未备份、未确认协作影响时重写历史。

## 5. 人工公开前检查

- [ ] 确认公开仓库名称和可见性；
- [ ] 确认首次 commit 已在本地创建；
- [ ] 确认 `.env`、`.env.local` 未跟踪；
- [ ] 确认 `prisma/dev.db` 及 WAL/SHM/journal 未跟踪；
- [ ] 确认无数据库备份、私人日志、临时截图或构建产物；
- [ ] 确认 README 不包含真实主机、私人域名或凭证；
- [ ] 确认测试数据和截图不含个人信息；
- [ ] 确认 GitHub Secret Scanning 无告警；
- [ ] 确认公开前轮换仍可能暴露的旧凭证；
- [ ] 人工审阅首次公开文件列表。
