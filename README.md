# hyra-pi

用 [Pi](https://pi.dev/) 搭的 Hyra 式内层循环：Context 看着经验库往队列里放灵感，多个 Proposal 写出带 `solve.sh` 的方案，Docker 沙盒打分，结果写回经验库。

## 依赖

- Node 20+
- 已登录的 Pi（`@earendil-works/pi-coding-agent`）
- 正在运行的 Docker Desktop（没有非 Docker 沙盒）

```bash
npm install
npm test
```

`npm install` 会编译到 `dist/`。命令是 `node dist/cli.js`，或 `npx hyra-pi`。

## 怎么跑

```bash
node dist/cli.js run --task <task-dir> --proposals 3 --budget 30m
```

同一条 run 接着派活（队列里没出分的灵感会再领，已出分的不重跑）：

```bash
node dist/cli.js run --task <task-dir> --run <run-dir>
```

续训时份数上限接着用；`--budget` 加在剩余墙钟上，不是换掉当初的总时长。`--solutions` 才会改份数上限。`--no-limits` 会拿掉时间、份数、写作和沙盒上限，只等 Context 停或 Ctrl+C；再写 `--budget` / `--solutions` / `--write` / `--sandbox` 仍生效。

跑起来会在本机打开状态页（默认 `http://127.0.0.1:8787`）。页面只能看，不能改循环。只看不跑：

```bash
node dist/cli.js status --run <run-dir>
```

| 参数 | 含义 | 默认 |
|---|---|---|
| `--task` | 题目目录 | 必填 |
| `--proposals` | 同时写方案的人数 | `3` |
| `--sandboxes` | 同时跑沙盒的个数 | `2` |
| `--run` | 已有 run 目录；续训用这个，不新建 | 新建时间戳目录 |
| `--no-limits` | 去掉时间、份数、写作和沙盒上限 | 关 |
| `--budget` | 最长时间；续训时加在剩余墙钟上 | 新跑 `30m` |
| `--solutions` | 最多评多少份方案；续训时若写出则改上限 | 新跑 `8` |
| `--rewrites` | 同一灵感沙盒崩溃后还能改几次 | `2` |
| `--write` | 单次 Proposal 写作上限 | `30m` |
| `--sandbox` | 单次 Docker 评分上限 | `30m` |
| `--port` | 状态页端口 | `8787` |
| `--runs` | 运行记录目录 | `runs` |
| `--context-model` | Context 的 `provider/id:思考深度` | `deepseek/deepseek-v4-pro:max` |
| `--proposal-model` | Proposal 的 `provider/id:思考深度` | `deepseek/deepseek-v4-flash-vision-exp:high` |

沙盒镜像默认 `debian:bookworm-slim`，用 `HYRA_PI_IMAGE` 改。超时也可用 `HYRA_PI_SANDBOX_MS` / `HYRA_PI_PROPOSAL_MS`；命令行优先。同一灵感若沙盒崩溃（没写出分数），会把日志还回去改，默认还能改 2 次（`--rewrites` / `HYRA_PI_PROPOSAL_REWRITES`）。Proposal 带官方 Context7；可选 `CONTEXT7_API_KEY`。

## 题目长什么样

题目目录必须有 `TASK.md` 和 `eval.sh`。`eval.sh` 收到方案目录，在当前工作目录写出 `score.json`：

```json
{ "score": 12, "higher_is_better": true, "notes": "ok" }
```

方案只交带 `solve.sh` 的文件夹。Proposal 自己不评分。

## 仓库里有什么

| 路径 | 进 git | 说明 |
|---|---|---|
| `src/` | 是 | 循环、队列、状态页、CLI |
| `prompts/` | 是 | Context / Proposal 系统提示 |
| `examples/` | 否 | 本地题目，暂不发布 |
| `docker/` | 否 | 本地沙盒镜像 |
| `scripts/` | 否 | 本地准备和冒烟 |
| `runs/` | 否 | 一次运行的现场 |
| `.cache/` | 否 | 下载缓存 |

一次运行留下：

```
runs/<id>/
  eb/index.jsonl            # 经验库流水账
  eb/solutions/<sid>/       # 某次方案的源码和日志
  queue/                    # 待领取或已领取的灵感
  workspaces/<insp-id>/     # Proposal 工作目录
  best/                     # 到目前最好的方案
  live.json                 # 状态页读的现场快照
  activity/<id>.jsonl       # Context / Proposal 轨迹
  run.json                  # 这次的名额和预算
```

## 发布

```bash
npm test
npm run build
npm publish
```

npm 包只带 `dist/` 和 `prompts/`。
