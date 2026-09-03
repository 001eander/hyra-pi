# hyra-pi

用 [Pi](https://pi.dev/) 搭的 Hyra 式内层循环：Context 看着经验库往队列里放灵感，多个 Proposal 写出带 `solve.sh` 的方案，Docker 沙盒打分，结果写回经验库。

## 依赖

- Node 20+
- 已登录的 Pi（`@earendil-works/pi-coding-agent`）
- 正在运行的 Docker Desktop（没有非 Docker 沙盒）

```bash
npm install
npx tsc
```

## 怎么跑

```bash
node dist/cli.js run --task <task-dir> --proposals 3 --budget 30m
```

同一条 run 接着派活（队列里没出分的灵感会再领，已出分的不重跑）：

```bash
node dist/cli.js run --task <task-dir> --run <run-dir>
```

续训时份数上限接着用；`--budget` 加在剩余墙钟上，不是换掉当初的总时长。`--solutions` 才会改份数上限。`--no-limits` 会拿掉时间、份数、写作和沙盒上限，只等 Context 停或 Ctrl+C；再写 `--budget` / `--solutions` / `--write` / `--sandbox` 仍生效。

跑起来会在本机打开状态页（默认 `http://127.0.0.1:8787`），看板大约每秒刷新：顶上是 Context 和运行状态，中间 Proposal / 沙盒两列（写完的方案会进沙盒），底下是历史结果。页面只能看，不能改循环。

只看不跑：

```bash
node dist/cli.js status --run <run-dir>
```

常用参数：

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
| `--write` | 单次 Proposal 写作上限，如 `30s` / `30m` / `2h` | `30m` |
| `--sandbox` | 单次 Docker 评分上限，如 `30s` / `30m` / `2h` | `30m` |
| `--port` | 状态页端口 | `8787` |
| `--runs` | 运行记录目录 | `runs` |
| `--context-model` | Context 的 `provider/id:思考深度` | `deepseek/deepseek-v4-pro:max` |
| `--proposal-model` | Proposal 的 `provider/id:思考深度` | `deepseek/deepseek-v4-flash-vision-exp:high` |

沙盒镜像默认是 `debian:bookworm-slim`，可用环境变量 `HYRA_PI_IMAGE` 改。单次评分超时默认 30 分钟，用 `--sandbox 30m` 或 `HYRA_PI_SANDBOX_MS` 改；命令行优先。Proposal 可以 bash 检查刚写的文件；写方案超时默认也是 30 分钟，用 `--write 30m` 或 `HYRA_PI_PROPOSAL_MS` 改，命令行优先。超时前已经写出 `solve.sh` 的方案仍会送去沙盒评分。同一灵感若沙盒崩溃（没写出分数），会把日志还回去改，默认还能改 2 次（`--rewrites` / `HYRA_PI_PROPOSAL_REWRITES`）；经验库只记最后一次。有分数的低分不会重写。

Proposal 带官方 Context7（Pi 扩展 `@upstash/context7-pi`，工具是 `resolve-library-id` / `query-docs`，和 Context7 MCP 同一套接口）。写 LightGBM / XGBoost / sklearn 之前会先查现行文档。可选环境变量 `CONTEXT7_API_KEY`（`ctx7sk_...`），没有也能用，限额更低。

## 题目长什么样

题目目录必须有 `TASK.md`（说明）和 `eval.sh`（评分）。没有评分脚本会直接报错。

`eval.sh` 收到方案目录，在当前工作目录写出 `score.json`：

```json
{ "score": 12, "higher_is_better": true, "notes": "ok" }
```

方案只交一样东西：带 `solve.sh` 的文件夹。沙盒里先按评分脚本的约定跑方案，再打分。Proposal 自己不评分。

## 一次运行留下什么

```
run/<id>/
  eb/index.jsonl              # 流水账
  eb/solutions/<sid>/         # 某次方案的源码、日志、分数
  queue/                      # 待领取或已领取的灵感
  workspaces/proposal-<n>/    # 某个 Proposal 的工作目录
  best/                       # 到目前最好的方案
  live.json                   # 状态页读的现场快照
  activity/<id>.jsonl         # Context / Proposal 的思考和工具
  workspaces/<id>/eval.log    # 沙盒正在打出的日志
  run.json                    # 这次的名额和预算
```

## 测试

```bash
npm test
```

单元测试用假智能体，不调用真实模型。
