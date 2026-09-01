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
node dist/cli.js run --task ./examples/sort-bench --proposals 3 --budget 30m
```

跑起来会在本机打开状态页（默认 `http://127.0.0.1:8787`），大约每秒刷新：阶段、是否健康、队列、谁在写代码、谁在沙盒里、当前最好成绩、最近记录。页面只能看，不能改循环。

跑完后可以再打开同一页：

```bash
node dist/cli.js status --run <run-dir>
```

常用参数：

| 参数 | 含义 | 默认 |
|---|---|---|
| `--task` | 题目目录 | 必填 |
| `--proposals` | 同时写方案的人数 | `3` |
| `--sandboxes` | 同时跑沙盒的个数 | `2` |
| `--budget` | 最长时间，如 `30s` / `30m` / `2h` | `30m` |
| `--solutions` | 最多评多少份方案 | `8` |
| `--port` | 状态页端口 | `8787` |
| `--runs` | 运行记录目录 | `runs` |
| `--context-model` | Context 的 `provider/id:思考深度` | `deepseek/deepseek-v4-pro:max` |
| `--proposal-model` | Proposal 的 `provider/id:思考深度` | `deepseek/deepseek-v4-flash-vision-exp:high` |

沙盒镜像默认是 `debian:bookworm-slim`，可用环境变量 `HYRA_PI_IMAGE` 改。超时用 `HYRA_PI_SANDBOX_MS`（默认 60 秒）。

## 题目长什么样

题目目录必须有 `TASK.md`（说明）和 `eval.sh`（评分）。没有评分脚本会直接报错。

`eval.sh` 收到方案目录，在当前工作目录写出 `score.json`：

```json
{ "score": 12, "higher_is_better": true, "notes": "ok" }
```

方案只交一样东西：带 `solve.sh` 的文件夹。沙盒里先按评分脚本的约定跑方案，再打分。Proposal 自己不评分。

自带例子：`examples/sort-bench`，从 stdin 读整数、输出升序。对了就按耗时给分：`1000000 / (毫秒 + 1)`，越大越好。

## 一次运行留下什么

```
run/<id>/
  eb/index.jsonl              # 流水账
  eb/solutions/<sid>/         # 某次方案的源码、日志、分数
  queue/                      # 待领取或已领取的灵感
  workspaces/proposal-<n>/    # 某个 Proposal 的工作目录
  best/                       # 到目前最好的方案
  live.json                   # 状态页读的现场快照
  run.json                    # 这次的名额和预算
```

## 测试

```bash
npm test
```

单元测试用假智能体，不调用真实模型。
