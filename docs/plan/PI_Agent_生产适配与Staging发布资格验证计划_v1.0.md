# PI Industry Agent 下一阶段实施计划：生产适配、Staging 集成与发布资格验证 v1.0

日期：2026-09-12  
适用分支：`feat/industry-agent-platform`  
前置基线：Phase 0–11 + M9–M12 已完成代码/协议级审计；最终审计结论为 `PASS WITH FIX / 生产发布 BLOCKED-CONDITIONAL`。  
本阶段性质：**生产适配与发布资格验证，不新增 Agent 业务能力。**

---

## 1. 目标

下一阶段的目标不是继续扩展功能，而是把当前“代码/协议完成”的 Industry Agent 变成一个**可以在真实 Staging 环境被验证、可以形成稳定质量基线、可以进入生产发布评审**的系统。

本阶段必须最终回答以下问题：

1. 当前分支在真实仓库环境中是否能完成安装、构建、类型检查和定向测试；
2. 所有 InMemory / Port 接口是否都有明确的生产实现或受控降级方案；
3. OpenSearch、Embedding、Reranker、对象存储、RAG Parser、Multimodal、Report Renderer、Sandbox/Broker 是否能在真实环境工作；
4. Trace、Token、Tool、Retrieval、Audit 是否能持久化、查询和对账；
5. 1030 条 Phase 11 corpus 以及 M9–M12 Eval 是否能用真实系统执行并形成 accepted baseline；
6. 场景 A–D 是否能在 Staging 走完真正端到端链路；
7. Mutation 在“业务写已提交、控制面收尾失败”等异常场景下是否可恢复；
8. SQL migration/rollback 是否经过最后静态审查，并在获得明确授权后能够执行受控 rollout；
9. 是否满足明确、可量化、可回滚的生产发布门禁。

最终交付不是“代码能跑”，而是：

```text
Real CI PASS
  -> Production Adapters Ready
  -> Staging Infrastructure Ready
  -> Real Eval Baseline PASS
  -> A-D E2E PASS
  -> Security / Reliability / Performance PASS
  -> Release Readiness Review
  -> Explicit DB / Production Approval
```

---

## 2. 不变的安全与实施边界

### 2.1 数据库执行边界

当前仍保持：

> **MySQL migration、DDL、DML、真实业务写入：NOT AUTHORIZED / NOT EXECUTED。**

本计划可以：

- 编写/修改 MySQL Adapter；
- 生成新的 migration/rollback SQL 文件；
- 做 SQL 静态检查；
- 做 SQL/Repository 单元测试或 mock driver 测试；
- 编写 rollout/rollback runbook；
- 准备 Staging 数据库验证脚本。

在用户**另行明确批准**前，不得：

- 连接 MySQL 实例（包括只读直连）；
- 执行 migration；
- 执行 DDL；
- 执行 DML；
- 通过 Mutation Runtime 写真实数据库；
- 使用真实数据库做 Testcontainers/集成测试。

为避免把“允许连库”和“允许写库”混为一谈，后续授权建议拆成两个独立 hard gate：

```text
DB_CONNECT_APPROVAL
  = 允许指定 Staging MySQL 的受控网络连接/只读验证

DB_EXECUTION_APPROVAL
  = 允许指定 Staging MySQL 执行 migration / DDL / DML / Mutation commit
```

`DB_EXECUTION_APPROVAL` 不得由 `DB_CONNECT_APPROVAL` 推导。Production 数据库另需单独 Production approval。

### 2.2 写操作边界

任何业务修改继续严格遵守：

```text
prepare_create / prepare_update / prepare_delete
    -> Diff
    -> Trusted UI Confirmation
    -> One-time Approval Token
    -> commit_mutation
    -> Transaction
    -> Reread Verify
    -> Audit
```

禁止新增可绕过确认的写入口。

### 2.3 Sandbox 边界

Sandbox 永远不持有：

- 数据库生产凭据；
- 通用 DB Client；
- 文件系统写权限；
- 网络访问能力；
- 进程执行能力；
- Secret；
- 动态代码下载/加载能力。

SQL/Python 分析只能通过 Server-side Read-only Broker 获取受控数据。

### 2.4 本阶段禁止范围膨胀

本阶段不新增：

- 开放式长期人格记忆；
- 自主无限循环 Agent；
- 自动批准写操作；
- 通用生产 SQL 执行器；
- Sandbox 直接连接数据库；
- 新业务实体/新行业能力；
- 与发布资格无关的大规模 UI 重构。

遇到新需求，默认进入后续 Backlog，不得插入本阶段关键路径。

---

## 3. 总体执行原则

本阶段采用 **Gate 驱动**，不得跨 Gate 偷跑。

每个 Gate 必须执行：

```text
实现 / 配置
 -> 定向测试
 -> 自审
 -> 安全审查
 -> 修正
 -> 再审
 -> 产物归档
 -> Gate 验收
```

建议保持当前提交节奏：

```text
一个 Gate
 -> 一组明确提交
 -> 一次净 diff 审查
 -> 一次验收结论
 -> 再进入下一 Gate
```

每个 Gate 的结果统一标记：

- `PASS`
- `PASS WITH ACTIONS`
- `BLOCKED`
- `NOT STARTED`

## 3.1 外部依赖与授权矩阵

| 依赖 | 可以先做的工作 | 需要的授权/条件 | 未满足时 |
| --- | --- | --- | --- |
| GitHub CI / PR | 本阶段立即执行 | Repo write/PR 权限 | Gate 0 BLOCKED |
| Branch ruleset | 方案、required checks 清单 | Repo admin/治理权限 | Production BLOCKED |
| OpenSearch | Adapter、mapping、index plan | Staging endpoint/credential | 真实 Retrieval Eval BLOCKED |
| Embedding/Reranker | Adapter、版本配置 | Staging model endpoint | 真实 Dense/Rerank Eval BLOCKED |
| Object Storage/Parser | Adapter、契约测试 | Staging service | RAG Ingest E2E BLOCKED |
| Report Renderer | Port/adapter、fixture | Approved renderer runtime | Report qualification BLOCKED |
| Sandbox/Broker | 静态校验、contract test | 真隔离 runtime + Broker | Sandbox qualification BLOCKED |
| MySQL Adapter | 代码、mock、SQL 静态审查 | 无需连库 | 可继续 |
| Staging MySQL 只读直连 | 连接方案、权限设计 | `DB_CONNECT_APPROVAL` | 所有依赖直连 MySQL 的真实 read E2E BLOCKED |
| Staging migration / write | rollout/rollback、dry design | `DB_EXECUTION_APPROVAL` | 场景 B real commit BLOCKED |
| Production rollout | runbook/canary plan | 单独 Production approval | 禁止部署 |

---

# 4. Gate 0：真实仓库与 CI 基线

## 4.1 目标

先证明当前分支在真实仓库依赖、真实 Node/npm、真实 Vitest 和 GitHub Actions 中成立。

当前根 `package.json` 已显式包含：

- `npm run build` 中的 `packages/industry-agent/tsconfig.build.json`
- `npm run test:industry-agent`
- `npm test` 中的 Industry Agent tests
- `npm run check`

现有 `.github/workflows/ci.yml` 只对 `main` 的 push / PR 触发，因此需要通过真实 PR/CI 或等效受控运行获得第一份可信结果。

## 4.2 必做事项

### G0-T1：真实依赖安装

执行：

```bash
npm ci --ignore-scripts
```

记录：

- Node 版本；
- npm 版本；
- lockfile 是否干净；
- 是否存在 `packages/industry-agent` 的依赖/版本冲突；
- 是否出现 workspace 排除引起的安装问题。

### G0-T2：真实构建

执行：

```bash
npm run build
```

重点确认：

- `packages/industry-agent` 生成 `dist`；
- ESM/Node16/NodeNext import 无问题；
- `erasableSyntaxOnly` 兼容；
- 无跨 package 隐式依赖；
- 输出声明文件正确。

### G0-T3：真实 Check

执行：

```bash
npm run check
```

如果 `biome check --write` 修改文件：

1. 立即审查变更；
2. 不能把格式器自动修改当作“无风险”；
3. 只提交与 Industry Agent 或其集成直接相关的变化。

### G0-T4：定向测试

至少执行：

```bash
npm run test:industry-agent
```

以及发生修改时对应的单文件 Vitest。

要求记录：

- test file count；
- passed/failed/skipped；
- 总耗时；
- flaky 情况；
- Node warning；
- 未执行项目。

### G0-T5：集成 PR 与 CI 真实触发

当前 `main` 仍停留在最初实施计划提交，Industry Agent 的 Phase 0–11 + M9–M12 代码尚在 `feat/industry-agent-platform`；因此下一阶段首先应建立 **feature -> main 的集成 PR**，但在所有 Gate 0 检查通过前不得合并。

该 PR 用于：

- 触发当前只针对 `main` PR 的 `CI` workflow；
- 暴露真实 monorepo build/check/test 集成问题；
- 形成可审阅的总 diff；
- 作为后续 Staging qualification 的固定基线 commit。

CI 至少必须通过：

```text
Install
Build
Check
Test
```

如果当前主 CI 过重或阻塞 Industry Agent 调试，可以新增：

`.github/workflows/industry-agent-qualification.yml`

但该 workflow 只能作为更快的专用门禁，不能替代主 CI。

### G0-T6：Required Checks / Branch Governance

当前 `main` 没有启用 branch protection / required status checks。正式进入 Staging qualification 前，应至少建立等效的 repository ruleset / branch protection：

- 禁止直接绕过 PR 合并关键代码；
- 主 CI 必须是 required check；
- Industry Agent qualification（建立后）必须是 required check；
- 禁止在 required checks 未通过时进入 release candidate；
- 如果权限或仓库治理策略暂时无法配置，必须在 `release-readiness.md` 中明确记录为发布风险，不能静默忽略。

## 4.3 Gate 0 验收标准

全部满足才 PASS：

- `npm ci --ignore-scripts` 成功；
- `npm run build` 成功；
- `npm run check` 成功且工作树可解释；
- `npm run test:industry-agent` 真实通过；
- GitHub CI 有真实成功记录；
- feature -> main 集成 PR 的总 diff 已人工审查；
- required checks / branch governance 已建立，或存在明确记录且阻断 Production；
- 没有被忽略的 TypeScript/Vitest failure；
- 建立 `docs/qualification/ci-baseline.md`，记录命令、版本、结果、commit SHA。

---

# 5. Gate 1：生产 Adapter 清单与 Composition Root

## 5.1 目标

把当前 Port / InMemory 实现逐项转换为生产实现计划，并建立统一 Production Composition Root。

禁止在业务 Service 内直接 new 基础设施客户端。

建议新增：

```text
packages/industry-agent/src/adapters/
  mysql/
  opensearch/
  object-storage/
  model/
  parser/
  renderer/
  sandbox/
  telemetry/

packages/industry-agent/src/bootstrap/
  production.ts
  staging.ts
```

目录名可根据仓库现状调整，但必须保持“领域逻辑不依赖具体基础设施实现”。

## 5.2 Adapter Inventory

必须对以下接口逐个建立状态表：

| 能力 | 当前实现 | 目标生产实现 | 是否阻断发布 |
| --- | --- | --- | --- |
| Trace Repository | InMemory/Port | MySQL 或独立持久化实现 | 是 |
| Working Memory Repository | InMemory/Port | MySQL 实现 | 是 |
| Entity/Read Repository | InMemory/Port | MySQL / Business API | 是 |
| Mutation Proposal Repository | InMemory/Port | MySQL 实现 | 是 |
| Approval Repository | InMemory/Port | MySQL 实现 | 是 |
| Mutation Audit Sink | InMemory/Port | Durable Audit Store | 是 |
| Mutation Write Gateway | InMemory/Port | 受控 MySQL Runtime | 是，执行需授权 |
| Engineering Retrieval | OpenSearch Port | OpenSearch 生产实现 | 是 |
| BOQ Retrieval | OpenSearch Port | OpenSearch 生产实现 | 是 |
| RAG Metadata/Chunk Repository | Port | MySQL | 是 |
| Object Storage | Port | S3/OSS/MinIO 等受控实现 | 是 |
| Embedding | Port | BGE-M3 Endpoint | 是 |
| Reranker | Port | 真实 Reranker Endpoint | 是 |
| Parser/Vision | Port | 生产解析器/多模态服务 | 是 |
| Report Renderer | Port | Excel/PDF/Chart/Narrative | 是 |
| Sandbox Executor | Port | 真隔离 Runtime | 是 |
| Read-only Broker | Port | Server-side Broker | 是 |
| Trace/Usage Sink | Port | 持久化 + 查询 | 是 |

状态统一使用：

- `PORT_ONLY`
- `IMPLEMENTED_UNVERIFIED`
- `STAGING_VERIFIED`
- `PRODUCTION_QUALIFIED`

## 5.3 配置

建立无 Secret 的环境配置模板，例如：

```text
packages/industry-agent/config/environments/
  staging.example.json
  production.example.json
```

必须显式列出：

- OpenSearch endpoint/index alias；
- embedding/reranker model version；
- object storage bucket/prefix；
- parser version；
- report renderer version；
- Sandbox runtime identity；
- Broker allowlist；
- Trace/Audit sink；
- timeout；
- concurrency；
- max rows；
- max artifact size；
- feature flags；
- retrieval config versions。

Secret 只允许通过部署环境 Secret Manager 注入，禁止进入 Git。

## 5.4 Composition Root 要求

Production/Staging bootstrap 必须做到：

1. 所有 Port 显式注入；
2. 启动时校验必要配置；
3. 配置缺失 fail closed；
4. 测试环境不能误加载 production credentials；
5. Sandbox 不接收 DB credentials；
6. Mutation Write Gateway 和普通 Read Repository 使用不同权限身份；
7. 所有模型、索引、parser、chunker、renderer 版本可查询；
8. 服务启动日志不得打印 Secret。

## 5.5 Gate 1 验收标准

- Adapter Inventory 100%；
- 所有生产必要 Port 都有明确实现路径；
- Production/Staging Composition Root 可构造；
- 没有基础设施客户端泄漏到领域层；
- config schema 有校验测试；
- Secret scanning 无新增问题；
- MySQL Adapter 可编译、可 mock 测试，但仍未连接数据库。

---

# 6. Gate 2：Staging 基础设施与最小权限

## 6.1 目标

准备真实 Staging，但不默认开启真实数据库写入。

Staging 必须与生产采用相同安全模型，只允许规模/容量不同。

## 6.2 必备组件

至少准备：

1. OpenSearch；
2. Embedding Endpoint；
3. Reranker Endpoint；
4. Object Storage；
5. Parser / Vision / Multimodal Endpoint；
6. Report Renderer；
7. Sandbox Runtime；
8. Server-side Read-only Broker；
9. Trace/Audit 持久化目标；
10. Staging Secret Manager；
11. 指标/日志/告警平台。

MySQL：

- 仅准备连接参数和权限模型设计；
- **未获得 DB 执行授权前不得连接**。

## 6.3 身份与权限

至少划分：

```text
agent-read
mutation-runtime
rag-ingest
rag-query
sandbox-broker
report-renderer
observability
```

要求：

- `agent-read` 无写权限；
- `sandbox-broker` 只读且仅允许 approved views/tables；
- `mutation-runtime` 是唯一业务写身份；
- `rag-query` 不能绕过 ACL；
- Object Storage 按前缀/tenant 限制；
- Renderer 无数据库权限；
- Sandbox 无 Secret Manager 权限。

## 6.4 网络边界

必须验证：

- Sandbox egress 默认关闭；
- 只有 Broker 能访问权威业务源；
- Model Endpoint 不能反向访问业务数据库；
- Renderer 只能读取受控输入/写受控 artifact；
- OpenSearch 不直接暴露公网；
- 管理面和数据面访问分离。

## 6.5 Gate 2 验收标准

输出：

`docs/qualification/staging-topology.md`

至少包含：

- 组件图；
- 身份矩阵；
- 网络矩阵；
- Secret 来源；
- 数据流；
- 日志流；
- 故障边界。

Gate PASS 前不得跑真实 E2E。

---

# 7. Gate 3：持久化可靠性、Outbox 与 Reconciliation

## 7.1 目标

解决最终审计留下的最大可靠性缺口：

> 业务写成功后，Proposal/Audit 等控制面 finalization 必须能够 durable 收敛。

## 7.2 Mutation Durable Finalization

设计并实现以下二选一，优先方案 A：

### 方案 A：Transactional Outbox

业务写事务中同时产生：

```text
mutation_business_write
approval_consume
mutation_outbox_event
```

后台 worker：

```text
outbox
 -> COMMITTED audit
 -> proposal COMMITTED
 -> trace reconciliation
 -> mark outbox delivered
```

要求：

- eventId 唯一；
- operationId 幂等；
- 可重复消费；
- 重试有 backoff；
- dead-letter 可查询；
- 不自动重复业务写。

### 方案 B：Durable Reconciliation Queue

如果业务库和控制库无法同事务：

- 业务写成功后生成 durable reconcile record；
- reconcile worker 按 operationId 查询业务事实；
- 只修复 Proposal/Audit；
- 绝不重放业务 Mutation。

## 7.3 建议新增 SQL 产物

如设计需要，可新增：

```text
008_mutation_reconciliation.sql
008_mutation_reconciliation.rollback.sql
```

可包含：

- mutation_outbox
- mutation_reconciliation
- delivery status
- attempt_count
- next_attempt_at
- last_error
- committed_at

**只生成与审查；不得执行。**

## 7.4 Trace 持久化可靠性

需要明确：

- Trace write failure 是否影响业务响应；
- buffer 策略；
- 最大丢失窗口；
- retry；
- dead-letter；
- retention；
- trace_id 查询 SLO。

推荐最低目标：

```text
Trace 查询 P95 < 2s
Trace 丢失率 < 0.1%
Audit 丢失率 = 0（以 durable reconciliation 保证）
```

最终 SLO 可在真实 Benchmark 后调整，但必须先有目标。

## 7.5 Gate 3 验收标准

- post-commit finalization 有 durable recovery；
- replay 不重复业务写；
- reconciliation 可手动按 operationId 触发；
- 有故障注入测试：
  - Proposal store down
  - Audit store down
  - Worker crash
  - duplicate delivery
  - retry exhaustion
- 如新增 SQL：SQL STATIC REVIEW PASS；NOT EXECUTED。

---

# 8. Gate 4：真实 Offline Eval Executor 与 Accepted Baseline

## 8.1 目标

将现有 `runOfflineBenchmark(corpus, executor, options)` 从测试契约接到真实系统。

需要实现 Production/Staging `OfflineEvalExecutor`：

```text
Golden Case
 -> Real Semantic Parser
 -> Real Retrieval / RAG / Tool path
 -> Real Observation
 -> Metrics
 -> Release Gate
```

## 8.2 1030 Corpus

完整执行 Phase 11 corpus，不允许抽样冒充全量。

必须保存：

- commit SHA；
- corpus version；
- corpus fingerprint；
- retrieval config versions；
- index aliases/versions；
- embedding model/version；
- reranker model/version；
- parser/chunker version；
- run timestamp；
- environment；
- **Staging data snapshot / fixture manifest**；
- authoritative source dataset version；
- OpenSearch index snapshot/alias；
- RAG document-set fingerprint；
- observation count；
- metric report；
- failed case IDs。

建议产物：

```text
evals/industry-agent/baselines/
  staging-<version>.json
  staging-<version>.report.json
```

## 8.3 M9–M12 Eval

将以下 eval 纳入同一 qualification pipeline：

- M9 Multimodal/Image；
- M10 Agent Loop；
- M11 Report；
- M12 Sandbox。

不得只跑 Phase 11 而忽略后续模块。

## 8.4 Baseline 接受规则

Accepted Baseline 必须：

1. 100% corpus 有 observation；
2. Critical E2E cases 全 PASS；
3. security gate 无失败；
4. Recall/MRR/Hit/ACL/answer evidence 等达到当前 Release Gate；
5. 失败 case 有明确归因；
6. 不允许通过降低阈值来“修绿”；
7. config/model/index fingerprint 改变必须产生新 baseline/version；
8. Staging 数据集/索引/文档集必须可通过 manifest 复现，禁止用不断变化的匿名数据集做 accepted baseline。

## 8.5 CI 集成

新增专用命令，例如：

```bash
npm run eval:industry-agent:offline
npm run eval:industry-agent:gate
```

命令名可按仓库习惯调整。

PR 级可使用 deterministic/mock corpus gate；
Staging qualification 必须使用真实 executor。

## 8.6 Gate 4 验收标准

- 1030/1030 observation；
- M9–M12 Eval 完成；
- accepted baseline 已归档；
- Release Gate PASS；
- 每个失败 case 可由 caseId 追踪到 traceId；
- 结果可重复执行。

---

# 9. Gate 5：Staging 关键场景 A–D E2E

## 9.1 场景 A：工程部位 + BOQ 查询

输入：

```text
查一下 K12+300 到 K12+800 左幅路基的清单
```

验证：

1. SemanticFrame；
2. chainage `12300 -> 12800`；
3. alignment = 左幅；
4. engineering hybrid retrieval；
5. BOQ hybrid retrieval；
6. READ Tool server scope；
7. 权威业务源回源；
8. Table UI；
9. trace_id；
10. retrieval debug；
11. source version；
12. latency。

禁止最终工程量/价格从向量文本直接返回。

## 9.2 场景 B：上下文写操作

输入：

```text
把刚才那些未完成项负责人改成张三
```

验证：

1. Working Memory 解析“刚才那些”；
2. 未完成过滤；
3. 最新记录重新读取；
4. prepare_update；
5. Diff；
6. UI confirmation；
7. approval token；
8. transaction；
9. reread verify；
10. Audit；
11. trace；
12. replay rejection；
13. version conflict。

### DB 授权限制

未获得用户明确批准前，场景 B 只允许跑到：

```text
prepare_update -> diff -> confirmation contract -> token contract
```

不得执行真实 commit。

获得 Staging DB 执行授权后，才可完成真实 Transaction/Verify/Audit E2E。

## 9.3 场景 C：项目规范 RAG

输入：

```text
这份规范对混凝土养护时间怎么规定？
```

验证：

- Project context；
- ACL；
- BM25；
- Dense；
- Entity-aware retrieval；
- RRF；
- rerank；
- parent expansion；
- evidence gate；
- citation；
- document/page/section/version；
- 不可见文档绝不进入 candidate；
- 无证据时不生成强结论。

必须额外跑 cross-tenant / cross-project negative case。

## 9.4 场景 D：事实字段查询

输入：

```text
二标 K23+400 左幅 0#台桩基混凝土工程量是多少？
```

验证：

- entity resolution；
- position_id / boq_id；
- READ Tool；
- authority source；
- quantity；
- unit；
- version；
- updated_at；
- evidence；
- trace；
- OpenSearch 文本不作为最终事实。

## 9.5 E2E 产物

每次运行生成：

```text
docs/qualification/e2e/
  scenario-a.md
  scenario-b.md
  scenario-c.md
  scenario-d.md
```

每份包含：

- request；
- expected；
- actual；
- trace_id；
- tool calls；
- retrieval；
- source evidence；
- latency；
- result；
- screenshots/artefact refs（如有）；
- known issues。

## 9.6 Gate 5 验收标准

A/C/D 原则上要求真实 Staging 全 PASS；但如果权威数据回源依赖 **MySQL 直连**，在 `DB_CONNECT_APPROVAL` 前必须标记为 `BLOCKED_BY_DB_CONNECT_APPROVAL`，不得用 mock 结果冒充真实 E2E。若通过已批准的 Business API 等非直连权威源完成，可按实际证据验收。

B：

- 未获得 `DB_EXECUTION_APPROVAL` 时只能验证 commit 前链路，状态为 `BLOCKED_BY_DB_EXECUTION_APPROVAL`；
- 获得 Staging DB 执行授权后必须完整 Transaction/Verify/Audit PASS，才能继续 Production Readiness。

---

# 10. Gate 6：Report、Sandbox 与文件安全验证

## 10.1 Report Renderer

对 Excel/PDF/Chart/Narrative 分别验证：

- 输入 schema；
- 最大行数；
- 最大文件大小；
- 公式注入；
- CSV/Excel injection；
- PDF/HTML escaping；
- 文件名净化；
- artifact lineage；
- source trace；
- timeout；
- renderer crash；
- malformed data。

报告生成必须保存：

```text
query/source
 -> dataset version
 -> transform
 -> renderer version
 -> artifact hash
```

## 10.2 Sandbox

必须使用真实隔离环境验证：

- 无网络；
- 无任意文件系统；
- 无 subprocess；
- 无 secret；
- 无 DB driver/credential；
- 无动态 import/download；
- resource limit；
- wall-clock timeout；
- CPU/memory limit；
- output size limit。

### SQL Validator + Broker

双层验证：

```text
Generated SQL
 -> Static Validator
 -> Broker Validator
 -> Scope Injection
 -> Schema Allowlist
 -> Read-only Session
 -> Statement Timeout
 -> Row Limit
 -> Query Cost Guard
 -> Result
```

测试至少覆盖：

- `UPDATE`
- `DELETE`
- `INSERT`
- `DROP`
- stacked query
- comments bypass
- UNION 越权
- information_schema
- cross-tenant predicate
- 超大扫描
- sleep/time-based query

全部必须 fail closed。

## 10.3 Gate 6 验收标准

- Report 安全用例 PASS；
- Sandbox escape 用例 PASS；
- Broker 越权/写 SQL 用例 PASS；
- 资源限制真实生效；
- Artifact lineage 完整。

---

# 11. Gate 7：安全、性能、可靠性与故障演练

## 11.1 安全测试

至少覆盖：

### Scope/ACL

- tenant A 不能读取 tenant B；
- project A 不能读取 project B；
- Working Memory 不跨 project 泄漏；
- RAG candidate 不跨 ACL；
- Report/Sandbox dataset 不跨 scope；
- Mutation Proposal/token 不可跨 user/tenant/company/project。

### Approval

- token 篡改；
- digest 篡改；
- version 改变；
- token 超时；
- token replay；
- proposal replay；
- operationId 错配。

### Prompt/Tool Injection

- 用户要求覆盖 project；
- RAG 文档中的恶意 Tool 指令；
- 图片 OCR/多模态中的恶意写指令；
- Sandbox 生成写 SQL；
- Report 输入包含公式注入。

### Secret / PII / Logging

- Trace redaction 在真实日志链路继续生效；
- API key / token / DB DSN / approval token 不进入日志；
- Prompt、RAG chunk、Tool args 中的敏感字段按策略脱敏；
- Error stack 不回传 Secret；
- qualification artifact 不包含真实凭据；
- 日志 retention 与访问权限有明确配置。

### Supply Chain

- `npm audit` / 仓库既有依赖安全流程无高危未处理项；
- GitHub Actions 继续使用固定 SHA；
- 新增生产依赖必须审查用途、license、运行时权限；
- 构建/部署 artifact 必须可关联到 commit SHA；
- 发布时记录 package/image/artifact digest（按实际部署形态）。

## 11.2 性能 Benchmark

必须至少测：

- READ Tool P50/P95；
- engineering retrieval P50/P95；
- BOQ retrieval P50/P95；
- RAG end-to-end P50/P95；
- report generation；
- trace query；
- concurrent Agent requests；
- OpenSearch degradation；
- model endpoint degradation。

先建立基线，不强行规定不切实际阈值。

每项要有：

```text
target
actual
sample size
environment
commit
config version
result
```

## 11.3 故障演练

必须覆盖：

- OpenSearch down；
- Dense endpoint down；
- reranker down；
- parser down；
- object storage down；
- trace store down；
- audit store down；
- report renderer timeout；
- sandbox timeout；
- broker timeout；
- stale version；
- reconciliation worker crash。

验证系统是否按设计降级，而不是悄悄给错误答案。

## 11.4 Gate 7 验收标准

- 无 P0/P1 安全问题；
- ACL negative test 100% PASS；
- 核心链路没有未解释的数据泄漏；
- 性能基线形成；
- 降级行为与设计一致；
- 告警能够触发；
- Secret/PII 日志检查 PASS；
- 供应链检查无未接受的高危项；
- runbook 可以定位 trace_id / operationId。

---

# 12. Gate 8：发布 Runbook、Rollback 与最终 Production Readiness Review

## 12.1 必须形成的 Runbook

建议新增：

```text
docs/runbook/
  industry-agent-staging.md
  industry-agent-production.md
  industry-agent-rollback.md
  mutation-reconciliation.md
  retrieval-reindex.md
  rag-reindex.md
  incident-trace-debug.md
```

## 12.2 Feature Flag

至少支持独立开关：

- engineering retrieval；
- BOQ retrieval；
- RAG QA；
- Mutation prepare；
- Mutation commit；
- image input；
- agent loop；
- report；
- sandbox。

Mutation commit 必须可以独立关闭，而不影响 READ/RAG。

## 12.3 Rollback

必须分别定义：

### 应用回滚

- 上一镜像/commit；
- config rollback；
- feature flag disable。

### Retrieval 回滚

- index alias 回切；
- previous model/config version；
- previous baseline。

### RAG 回滚

- index alias；
- parser/chunker/embedding version；
- document state。

### DB Rollback

只形成步骤，不执行：

- migration pre-check；
- backup；
- **backup restore rehearsal / restore verification plan**；
- forward；
- verify；
- rollback condition；
- rollback SQL；
- data compatibility；
- irreversible change 标记；
- rollback 后应用版本兼容性。

## 12.4 Production Readiness Review

最终会议/审计必须明确签字式检查：

```text
[ ] CI
[ ] TypeScript
[ ] Unit/Integration tests
[ ] 1030 Eval
[ ] M9-M12 Eval
[ ] A-D E2E
[ ] ACL
[ ] Mutation confirmation
[ ] Reconciliation
[ ] Trace/Audit
[ ] Performance
[ ] Sandbox isolation
[ ] Report security
[ ] Rollback
[ ] Alerting
[ ] Secret/PII logging review
[ ] Supply-chain review
[ ] Branch required checks
[ ] Reproducible staging data manifest
[ ] Runbook
[ ] DB connect approval（如需 MySQL 直连）
[ ] DB execution approval
[ ] Production rollout approval
```

没有 DB 执行批准时：

```text
READ/RAG/非 DB 写能力可继续资格验证
Mutation real commit = BLOCKED
```

没有 Production rollout 批准时：

```text
不得部署 Production
```

---

# 13. 推荐实际实施顺序

严格顺序：

```text
G0 真实 CI / Test 基线
 |
G1 Production Adapter + Composition Root
 |
G2 Staging Infrastructure / IAM / Network
 |
G3 Durable Audit / Outbox / Reconciliation
 |
G4 Real Offline Eval + Accepted Baseline
 |
G5 A-D Staging E2E
 |
G6 Report / Sandbox 真实安全验证
 |
G7 Security / Performance / Failure Drill
 |
G8 Runbook / Rollback / Production Readiness Review
 |
Explicit DB Approval
 |
Staging DB Migration + Mutation E2E
 |
Explicit Production Approval
 |
Canary / Production Rollout
```

其中如果数据库授权仍未给出：

- G0–G3 可以继续完成代码、mock、静态审查和非 DB 基础设施工作；
- G4 可运行不依赖 MySQL 直连的真实 Eval；若 corpus 中存在必须直连 MySQL 才能产生真实 observation 的 case，则 Gate 4 只能保持 `BLOCKED_BY_DB_CONNECT_APPROVAL`，不能把 mock observation 设为 accepted production baseline；
- G5 的 A/C/D 若通过已批准 Business API 等权威源可继续；若依赖 MySQL 直连则等待 `DB_CONNECT_APPROVAL`；
- G5-B 只能完成 commit 前链路，直到 `DB_EXECUTION_APPROVAL`；
- G6–G8 的非 DB 项可以继续；
- Production Readiness 保持 BLOCKED，直到相应 DB hard gate 被明确批准并完成验证。

---

# 14. 第一批具体开发任务

下一次开始编码时，建议只做 **Gate 0 + Gate 1 的最小闭环**，不要一次把 G2–G8 全铺开。

## 第一批任务 A：Qualification 脚本

新增或整理：

```text
scripts/industry-agent-qualification.mjs
```

负责：

- 输出 environment versions；
- 执行/汇总 Industry Agent deterministic qualification；
- 生成 JSON report；
- 不持有 secret；
- 不访问数据库。

## 第一批任务 B：专用 CI

视主 CI 结果决定是否新增：

```text
.github/workflows/industry-agent-qualification.yml
```

建议触发条件：

```text
packages/industry-agent/**
evals/industry-agent/**
db/mysql/**
docs/plan/PI_Agent_*
```

至少运行：

```text
npm ci --ignore-scripts
npm run build
npm run check
npm run test:industry-agent
qualification deterministic gate
```

## 第一批任务 C：Adapter Inventory

新增：

```text
docs/qualification/adapter-inventory.md
```

逐项列出 Port、当前实现、生产实现类、配置、权限、测试、Gate。

## 第一批任务 D：Bootstrap 骨架

只建立 Composition Root，不连接真实基础设施：

```text
packages/industry-agent/src/bootstrap/staging.ts
packages/industry-agent/src/bootstrap/production.ts
```

使用显式 adapter factory / dependency injection。

## 第一批任务 E：环境配置 Schema

建立 staging / production config contract 和校验测试，所有 Secret 使用引用名，不保存真实值。

## 第一批任务 F：审查

完成第一批后必须重点审查：

1. 有没有在 import 时自动连接外部系统；
2. 有没有把 credential 写入 config；
3. 有没有让 Sandbox 获得 DB/Secret；
4. 有没有让普通 Agent 获得 Mutation commit 之外的写通道；
5. 有没有为了 CI 方便跳过测试；
6. 有没有改变 SQL 执行状态；
7. 有没有让 environment-specific 代码污染领域层。

---

# 15. 文档和证据目录建议

建议固定：

```text
docs/qualification/
  ci-baseline.md
  adapter-inventory.md
  staging-topology.md
  e2e/
  performance/
  security/
  release-readiness.md

evals/industry-agent/baselines/
  ...

docs/runbook/
  ...
```

所有 qualification 文档必须带：

- date；
- commit SHA；
- environment；
- config version；
- tester/executor；
- result；
- evidence path；
- unresolved issues。

---

# 16. 完成判定

本下一阶段只有满足以下条件才算完成：

```text
Real CI PASS
AND Production adapters STAGING_VERIFIED
AND 1030 corpus real baseline PASS
AND M9-M12 eval PASS
AND A/C/D E2E PASS against approved authoritative sources
AND B E2E PASS after explicit DB execution approval
AND Scope/ACL security PASS
AND Mutation reconciliation PASS
AND Report/Sandbox security PASS
AND Performance baseline accepted
AND Runbook/Rollback reviewed
AND no P0/P1 unresolved issue
```

最终状态应从：

```text
CODE/PROTOCOL COMPLETE
PRODUCTION BLOCKED
```

推进为：

```text
STAGING QUALIFIED
PRODUCTION READY FOR APPROVAL
```

只有用户明确批准数据库执行和生产 rollout 后，才能进入：

```text
PRODUCTION CANARY
 -> VERIFY
 -> GRADUAL ROLLOUT
 -> POST-RELEASE MONITORING
```

---

# 17. 本文档审查记录

## Review Round 1：范围、顺序与依赖审查

审查重点：

- 是否把“真实 CI”放在真实基础设施之前；
- 是否漏掉 Adapter inventory；
- 是否保留 DB NOT EXECUTED 边界；
- 是否覆盖最终审计中的 8 个阻断项；
- 是否覆盖 Mutation durable reconciliation；
- 是否把 1030 corpus 与 M9–M12 Eval 都纳入；
- 是否明确 A–D 的真实 E2E；
- 是否覆盖 Report/Sandbox；
- 是否包含 rollback/runbook。

结论：**PASS WITH FIXES**。

本轮补充/修正：

1. 增加 Gate 0，避免在真实 TypeScript/Vitest 未验证前直接搭 Staging；
2. 明确先建立 `feat/industry-agent-platform -> main` 集成 PR，未通过真实 CI 前不合并；
3. 增加 required checks / branch governance；当前 `main` 未启用 branch protection，不能把“有 CI 文件”误当成“CI 是强制门禁”；
4. 将 Production Adapter / Composition Root 独立为 Gate 1；
5. 将 Mutation durable outbox/reconciliation 提前到正式 E2E 前；
6. 明确 M9–M12 Eval 不能被 Phase 11 corpus 替代；
7. 明确 accepted baseline 必须绑定可复现的 Staging data/index/document snapshot；
8. 明确场景 B 在未授权数据库前只能验证 commit 前链路；
9. 增加 Feature Flag 与 retrieval/RAG 独立 rollback；
10. 增加 Trace/Audit SLO 和故障注入；
11. 增加 Secret/PII logging、供应链审查和 DB backup restore 计划。

## Review Round 2：可落地性、安全与验收闭环审查

审查重点：

- Vibe coding 是否可以按 Task/Gate 直接实施；
- 每个 Gate 是否有输出物；
- 是否有清晰 PASS/BLOCKED 条件；
- 是否存在“接口实现 = 生产通过”的错误表述；
- 是否可能绕过用户确认；
- 是否可能在 Sandbox 暴露 DB；
- 是否可能未经授权执行 SQL；
- 是否有 evidence/trace/baseline 归档。

结论：**PASS**。

确认：

- 每个阶段均有明确任务、产物和 Gate；
- 数据库授权是独立 hard gate；
- Production 资格和 Production 部署明确分离；
- Mutation、RAG ACL、Sandbox、事实回源边界保持不变；
- 下一次实际编码应从 Gate 0 + Gate 1 最小闭环开始，而不是直接实施全阶段。

---

# 18. 下一步执行口径

下次开始实施时，执行：

```text
Gate 0
  -> 真实 npm/CI/Vitest 基线
  -> 审查修复
  -> Gate 0 commit
  -> 验收并停止

然后才进入 Gate 1。
```

继续保持之前的工作方式：

```text
实现
 -> 测试
 -> 自审
 -> 修正
 -> 再审
 -> GitHub 提交
 -> 阶段验收
 -> 停止
```

**不要一次跨多个 Gate。**
