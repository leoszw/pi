# PI Agent 行业智能操作平台（MySQL）实施计划 v1.0

> 状态：审查后版本
>
> 适用仓库：`leoszw/pi`
>
> 数据库约束：使用 MySQL；当前阶段只生成数据库脚本文件，不连接数据库、不执行 migration、不执行 DDL/DML。

## 1. 文档目的

本计划依据 `docs/design_docs` 下的平台技术规格、工程行业向量召回审查方案、工程部位召回实施方案、工程量清单召回实施方案编制，用于指导后续按阶段开发行业 Agent。

目标不是修改 Pi 成为工程行业专用框架，而是以现有 Pi Agent Runtime、AI、Telemetry、Protocol、Server、Evals 等能力为基础，增加独立的行业 Agent 扩展层。

第一阶段围绕两类核心业务实体形成完整闭环：

- 工程部位；
- 工程量清单。

第一阶段必须具备：

1. 自然语言查询与连续上下文查询；
2. 显式 Tool Registry；
3. 新增、修改、删除的 Prepare → Diff → Approval → Commit → Verify；
4. 所有数据库写操作必须经过用户明确确认；
5. 所有请求生成 `trace_id`，可查询全过程；
6. 保存每次 LLM、Tool、Retrieval、错误、Token、耗时等结构化日志；
7. 文档上传、解析、切片、Embedding、Hybrid Retrieval、引用回答；
8. RAG 按租户、行业、公司、项目及 ACL 隔离；
9. 工程部位、工程量清单按专项方案实现 Exact/BM25/Dense/RRF/Rerank；
10. 为后续只读 SQL/Python 分析、报表生成预留安全扩展点。

---

## 2. 审查结论与修正

### 2.1 保留的设计

以下方向与设计文档一致，应保持：

- 复用 Pi Agent 的状态、Tool 执行、Streaming 和事件机制；
- 复用 Pi Telemetry 的显式 Span/Context 机制，不重新设计一套平行 Trace Runtime；
- SemanticFrame 作为自然语言到业务 Tool 之间的稳定中间协议；
- 工程实体使用“结构化约束 + Exact/BM25 + Dense + RRF + Rerank”，而不是仅依赖 Embedding；
- 写操作采用两阶段协议，并通过 UI 确认；
- RAG 权限过滤发生在召回之前；
- 工程量、金额、数量、单价、版本等事实字段必须回源，不允许从向量文本直接作为最终事实回答；
- 后续 Sandbox 只能通过只读 Data Access Broker 访问数据。

### 2.2 本计划修正项

#### 修正 A：PostgreSQL 主库改为 MySQL

平台规格书中的 PostgreSQL/pgvector 是推荐实现，不是业务协议本身。当前项目明确使用 MySQL，因此：

- MySQL 保存业务主数据、Trace、Mutation、RAG 元数据、Memory、审计、报表任务、代码执行记录等结构化数据；
- OpenSearch 保存 Exact/BM25/Dense 检索索引；
- 不为了替换 pgvector 而把 Dense Retrieval 强行放入 MySQL；
- MySQL 始终是需要强一致性的权威结构化存储，OpenSearch 是检索索引，不是事实源。

#### 修正 B：行业 Agent 与 Pi Core 解耦

不在 `packages/agent` 中直接加入工程行业逻辑。新增独立行业层，通过 Pi 公共 API、Tool、Telemetry、Protocol 接入。

#### 修正 C：SQL 产物成为每个阶段的显式交付物

凡涉及持久化结构的阶段，都必须同步生成：

- migration SQL；
- rollback SQL；
- 必要 View SQL；
- seed SQL；
- 索引说明。

当前阶段只能生成和静态审查这些脚本，禁止连接 MySQL 执行。

#### 修正 D：高风险约束升级为发布门禁

以下不是建议，而是第一阶段强制门禁：

- 业务大整数 ID 全链路使用字符串，禁止进入 JavaScript `Number`；
- 低置信度实体字段禁止直接转 hard filter；
- BM25、Dense、Reranker raw score 禁止直接裸加；
- RAG ACL 必须在检索前执行；
- Agent、Sandbox、普通查询 Tool 不持有数据库写权限；
- 只有 Mutation Runtime 允许受控写入；
- 所有写入必须有 Approval；
- 数量、金额、单价等事实字段不得进入最终事实回答的向量来源；
- Embedding/索引升级必须版本化并通过 benchmark 回归。

---

## 3. 总体架构

```text
Web / Mobile
     |
Agent Gateway
     |
Pi Agent Runtime
     |
+---------------- Semantic Runtime
+---------------- Context / Normalization
+---------------- Entity Retrieval
+---------------- Tool Registry
+---------------- Mutation Runtime
+---------------- RAG Core
+---------------- Working Memory
+---------------- Policy / Permission
+---------------- Trace Adapter
     |
Business API / Data Access
     |
MySQL -------------------- OpenSearch
  |                            |
权威结构化数据               Keyword/BM25/Dense/HNSW

Object Storage (文档原文件)
Worker (解析 / Embedding / 索引 / 报表任务)
```

第一阶段优先采用模块化单体，不提前拆十几个微服务。逻辑模块边界必须清晰，物理部署可后续根据吞吐量拆分。

---

## 4. 推荐仓库结构

```text
packages/
  agent/                         # 现有 Pi Agent Core，不加入行业代码
  ai/
  telemetry/
  protocol/
  server/
  evals/

  industry-agent/                # 新增：行业 Agent 扩展层
    src/
      gateway/
      semantic/
      context/
      normalization/
      entity/
      retrieval/
      tools/
      mutation/
      rag/
      memory/
      policy/
      trace/
      ui-actions/
      data-access/
      shared/
    test/
    package.json
    tsconfig.build.json

db/
  mysql/
    migrations/
    rollback/
    views/
    seeds/
    README.md

evals/
  industry-agent/
    intent/
    entity/
    normalization/
    rag/
    tool-use/
    mutation/
    end-to-end/

docs/
  plan/
  architecture/
  api/
  ontology/
  runbooks/
```

若后续确认行业 Agent 应独立仓库，再迁移 `packages/industry-agent`；第一阶段不因仓库拆分增加额外复杂度。

---

## 5. MySQL 设计与脚本管理

### 5.1 第一阶段核心表

至少规划以下表：

```text
agent_trace
agent_span
llm_call
tool_call
retrieval_event
agent_error

audit_event
conversation
memory_item
memory_link

entity
entity_alias
entity_embedding_meta
ontology_item

mutation_operation
mutation_approval

rag_document
rag_document_version
rag_chunk
rag_ingestion_job
rag_citation

report_job
code_execution
```

`entity_embedding_meta` 只保存 Embedding/索引版本、OpenSearch document id 等元信息；向量本体由 OpenSearch 保存。

### 5.2 SQL 文件规划

```text
db/mysql/
  migrations/
    001_trace.sql
    002_conversation_memory.sql
    003_entity_ontology.sql
    004_retrieval.sql
    005_mutation.sql
    006_rag.sql
    007_audit_policy.sql
    008_report_sandbox.sql
    009_indexes.sql

  rollback/
    009_indexes.rollback.sql
    008_report_sandbox.rollback.sql
    007_audit_policy.rollback.sql
    006_rag.rollback.sql
    005_mutation.rollback.sql
    004_retrieval.rollback.sql
    003_entity_ontology.rollback.sql
    002_conversation_memory.rollback.sql
    001_trace.rollback.sql

  views/
    engineering_position_source.sql
    boq_source.sql

  seeds/
    001_ontology.sql
    002_tool_definitions.sql
```

### 5.3 SQL 编写规范

- migration 必须可重复审查、不可依赖应用启动时自动建表；
- 所有表显式指定字符集、排序规则和时间字段策略；
- 关键业务 ID 在 TypeScript/JSON 中按字符串处理；
- 高频查询字段建立明确索引，不能把关键过滤条件只放在 JSON 中；
- Trace/Approval/Audit 数据不得由普通业务逻辑物理删除；
- 写操作表必须保留版本、状态、审批、操作摘要和审计字段；
- RAG/Entity 表必须保留 tenant/company/project 等 scope 字段；
- SQL 文件必须同时提供 rollback 或说明不可逆原因。

### 5.4 当前阶段禁止事项

```text
禁止配置真实 MySQL 连接；
禁止执行 migration；
禁止执行 CREATE/ALTER/DROP；
禁止执行 INSERT/UPDATE/DELETE；
禁止为了测试 DDL 临时连接生产或开发数据库。
```

允许：

- 生成 SQL；
- 静态语法检查；
- Schema Review；
- Index Review；
- Rollback Review；
- 使用 Mock Repository 做应用层测试。

---

# 6. 分阶段实施计划

## Phase 0：项目骨架与基础协议（对应 M0）

### 目标

建立行业 Agent 最小运行骨架，保持 Pi Core 无行业耦合。

### 开发任务

新增 `packages/industry-agent`，定义核心类型：

```text
RequestContext
SemanticFrame
EntityMention
EntityCandidate
ResolvedEntity
ToolDefinition
ToolInvocation
ToolResult
UIAction
MutationProposal
TraceEvent
RetrievalDebug
KnowledgeScope
```

实现：

```text
Agent Gateway
RequestContext
trace_id
conversation_id
Pi Agent 初始化
Streaming
Tool Registry 基础框架
统一错误模型
Repository 接口
Mock Repository
```

请求入口必须生成/绑定：

```text
trace_id
request_id
conversation_id
user_id
tenant_id
company_id
project_id
```

### SQL 交付

- `001_trace.sql`
- `002_conversation_memory.sql`
- 对应 rollback

只生成，不执行。

### 验收

- 文本消息可以稳定进入 Pi Agent 并 Streaming 返回；
- 每个请求生成唯一 `trace_id`；
- Repository 可使用 Mock 实现运行；
- 无任何真实数据库依赖。

---

## Phase 1：Trace / Observability（对应 M1）

### 目标

可通过一个 `trace_id` 还原一个问题的完整处理过程。

### 开发任务

复用 Pi Telemetry 的 `TelemetryContext / TelemetrySpan`，实现行业侧持久化 Adapter/Collector。

记录：

```text
用户原始问题
SemanticFrame
Agent Span
每次 LLM 调用
模型和模型版本
input/output/cached token
费用（可获取时）
调用耗时
每次 Tool 调用及结果
每次 Retrieval 查询、候选、分数、过滤条件
错误
最终结果
```

API：

```text
GET /api/traces/{trace_id}
GET /api/traces/{trace_id}/timeline
GET /api/traces/{trace_id}/tree
GET /api/traces/{trace_id}/stats
```

### 验收

- Span 父子关系完整；
- LLM 调用次数和 Token 可聚合；
- Tool/Retrieval/Error 可定位到对应 Span；
- Trace 失败不能影响业务主流程；
- 敏感字段支持 schema 级脱敏策略。

---

## Phase 2：SemanticFrame / Context / Normalization（对应 M2）

### 目标

建立自然语言与业务 Tool 之间的稳定语义协议。

### SemanticFrame 示例

```json
{
  "intent": "QUERY_BOQ",
  "mentions": [],
  "constraints": [],
  "filters": {},
  "context_refs": [],
  "requested_fields": []
}
```

### 开发任务

实现：

```text
Query Parser
Context Resolver
Chainage Normalizer
Side Normalizer
Unit Normalizer
Project/Segment Resolver
BOQ Code Normalizer
Date Normalizer
```

示例：

```text
K12+300                 -> 12300
K12+300 ~ K12+800       -> [12300, 12800]
左幅 / 左边 / 左侧 / L   -> LEFT
```

### Hard/Soft 约束规则

- 明确 ID、标准编码、可靠桩号解析等高置信字段可进入 hard filter；
- 低置信度左右幅、项目、部位、上下文推断优先作为 soft constraint 或候选扩展；
- 不允许把所有 NER/LLM 字段直接转换成 hard filter。

### 验收

- 相同语义可得到稳定 canonical JSON；
- Normalizer 有独立单元测试；
- 解析错误不会导致不合理的零召回；
- 每个 constraint 保存 confidence、source、mode。

---

## Phase 3：Entity Data Foundation

### 目标

建立工程部位、工程量清单统一实体模型和检索数据源。

### 开发任务

实现：

```text
Canonical Entity Schema
Entity Alias
Hierarchy
Source Version
Index Version
Project/Company/Tenant Scope
```

### SQL 交付

- `003_entity_ontology.sql`
- `004_retrieval.sql`
- `views/engineering_position_source.sql`
- `views/boq_source.sql`
- 对应 rollback

### 工程部位 View

SQL View 负责尽量确定性地完成：

```text
工程类别 ID -> 中文名称
工程类型 ID -> 中文名称
桩号 -> 数值化起止范围
左右幅 -> canonical code
层级路径字段拼装所需基础列
```

### 工程量清单 View

SQL View 负责：

```text
section_id -> section_name
ledger_code 保留原始 canonical code
project scope 字段
update/version 字段
```

### 验收

- 数据源字段可直接供 ETL/Indexer 使用；
- ID 不因 JS Number 发生精度损失；
- `source_version / index_version` 可追踪；
- SQL 仅生成和静态审查。

---

## Phase 4：工程部位 Hybrid Retrieval（对应 M3 子阶段）

### 目标

按专项实施方案完成工程部位高准确率召回。

### 索引准备

```text
MySQL View
  -> Hierarchy Builder
  -> Normalizer
  -> Text Builder
  -> Embedding
  -> OpenSearch
```

Dense 视图：

```text
name_vector    = 1024 dimensions
context_vector = 1024 dimensions
```

### 第一版召回链路

```text
Exact          Top20
BM25           Top80
Name Dense     Top80
Context Dense  Top80
       |
Candidate Union / Weighted RRF
       |
Top80
       |
bge-reranker-v2-m3
       |
Top50
       |
Rerank + Fusion + Business Features
       |
Top10 + confidence + debug trace
```

RRF 权重允许由 Query Router 根据查询类型动态选择，但必须版本化并可通过 benchmark 回归。

禁止：

- 直接裸加 BM25、cosine、reranker raw logit；
- 把完整名称当唯一键；
- embedding 模型升级后覆盖旧索引而不留版本。

### 验收指标

至少统计：

```text
Recall@20
Recall@50
Hit@1
MRR
Zero Result Rate
Constraint Conflict Rate
P50/P95 latency
```

具体发布阈值由 Golden Benchmark 基线确定并固化到 eval 配置，不在代码中散落硬编码。

---

## Phase 5：工程量清单 Hybrid Retrieval（对应 M3 子阶段）

### 目标

完成清单编码、章节、名称、项目范围等多路召回。

### 字段规则

```text
ledger_id        -> keyword/string
pro_id           -> project/permission hard filter
section_id       -> SQL 转 section_name
ledger_code      -> exact + hierarchy；不进入 Dense 主文本
ledger_name      -> normalize + BM25 + Dense
unit             -> normalized feature
```

以下事实字段禁止作为 Dense 语义事实来源：

```text
contract_price
contract_num
contract_amount
ledger_price
change_after_price
change_after_num
change_after_amount
```

### 事实回源

Retrieval 只负责定位：

```text
entity_id
ledger_id
boq_id
record_id
```

数量、金额、单价、版本、更新时间等最终答案必须再从业务 MySQL/API 获取。

### 验收

- 编码查询优先 Exact；
- 自然语言查询可走 Hybrid；
- 项目范围不会串数据；
- 最终事实带 `source_id/version/updated_at/unit` 等证据字段。

---

## Phase 6：READ Tools（对应 M4）

### 目标

用户通过自然语言查询业务数据，不允许 LLM 自由生成数据库访问行为。

### 第一批 Tool

```text
search_engineering_positions
get_engineering_position
search_boq
get_boq_item
query_quantity
list_project_documents
```

### ToolDefinition 必须包含

```text
name
version
domain
action
input_schema
output_schema
allowed_entity_types
permission
data_scope_rule
risk_level
requires_confirmation
supports_dry_run
idempotent
timeout_ms
retry_policy
```

### 安全规则

每个 Tool 调用都必须携带并在服务端重新校验：

```text
user
tenant
company
project
permission
```

不信任 LLM 生成的 scope。

### 验收

- 自然语言可以完成工程部位/清单查询；
- 连续对话可继承明确上下文；
- Tool input/output 有 JSON Schema；
- Tool 调用完整进入 Trace。

---

## Phase 7：Mutation Runtime + UI Action（对应 M5）

### 目标

建立安全的新增、修改、删除链路。

### 强制执行流程

```text
Agent
  -> prepare_create/update/delete
  -> load current record + version
  -> permission validation
  -> business validation
  -> MutationProposal
  -> human-readable Diff
  -> UI confirmation
  -> user approves
  -> one-time Approval Token
  -> commit_mutation
  -> re-check permission/version/digest
  -> MySQL transaction
  -> verify
  -> audit
  -> trace
```

### Approval Token 必须绑定

```text
tenant
user
company
project
operation_id
operation_digest
record_version
expiry
```

任一参数发生变化，旧 token 失效。

### 权限隔离

```text
Agent Runtime      -> 无数据库写权限
READ Tools         -> 无数据库写权限
Sandbox            -> 无数据库写权限
Mutation Runtime   -> 唯一受控写入口
```

### SQL 交付

- `005_mutation.sql`
- `007_audit_policy.sql`
- 对应 rollback

只生成，不执行。

### UI Action 第一版

```text
entity_picker
form
editable_form
table
diff
mutation_confirmation
```

### 验收

- 未确认无法 Commit；
- Approval 与 Proposal digest 不一致时拒绝；
- 乐观锁版本变化时拒绝；
- Delete 第一版默认软删除；
- 批量变更必须显示影响数量和代表样本；
- Commit 后重新读取验证结果；
- 全过程可审计。

---

## Phase 8：RAG Ingestion（对应 M6）

### 目标

支持行业、公司、项目维度的知识上传和索引。

### Knowledge Scope

每个 Document/Chunk 必须保存：

```text
tenant_id
industry_id
company_id
project_id
department_id
owner_user_id
visibility
acl_users
acl_roles
security_tags
```

### Pipeline

```text
Upload
 -> auth/permission
 -> file validation
 -> object storage
 -> checksum/dedup
 -> parser routing
 -> text/table/image extraction
 -> OCR/vision when required
 -> structure recognition
 -> cleaning/normalization
 -> domain-aware chunking
 -> metadata/entity enrichment
 -> embedding
 -> lexical index
 -> vector index
 -> quality validation
 -> READY
```

### Chunk 规则

禁止统一固定 500/1000 Token 暴力切片。

优先按：

```text
标题层级
条款
表格
段落
页码
业务对象
```

长节再做 token window；必须保留 parent-child、section path、page 范围。

### SQL 交付

- `006_rag.sql`
- 对应 rollback

只生成，不执行。

### 验收

- 文档状态机完整；
- scope/ACL 保存完整；
- Parser/Chunker/Embedding/Index version 可追踪；
- 同文件 checksum 可去重；
- 失败 ingestion 可定位原因。

---

## Phase 9：RAG QA（对应 M7）

### Pipeline

```text
Question
 -> Context Resolve
 -> Query Rewrite
 -> Scope Resolve
 -> ACL Filter
 -> Metadata Filter
 -> BM25
 -> Dense
 -> Optional Entity-aware Retrieval
 -> RRF
 -> Rerank
 -> Diversity/Dedup
 -> Parent Context Expansion
 -> Citation Pack
 -> Answer
```

### 强制规则

- ACL/visibility 在召回前生效；
- 无证据时允许明确回答“证据不足”，禁止强行生成；
- Citation 保存 document/chunk/page/section；
- 不允许通过 Prompt 在召回后“隐藏”无权限内容。

### 验收

回答可以追溯到：

```text
document_id
chunk_id
page
section
source/version
```

---

## Phase 10：Working Memory（对应 M8）

### 目标

支持任务连续性，而不是第一版就追求开放式长期人格记忆。

必须支持：

```text
“刚才那些”
“这些”
“第二个”
“只看未完成的”
“继续”
“把这些导出来”
```

Working Memory 保存：

```text
resolved entity ids
last result set
active filters
active project
selected rows
recent tool results
```

禁止把未经用户确认的 LLM 推测持久化为长期事实。

---

## Phase 11：Golden Eval / Hard Cases / 发布门禁（贯穿全程，最终对应 M13）

### 原则

Eval 不能等开发结束后再补。从 Phase 2 开始，每完成一个模块同步加入测试集。

### 数据集

第一阶段目标至少 1000 条 Golden/Hard Eval，覆盖：

```text
同名实体
别名/简称
错别字
桩号区间
左右幅
项目冲突
章节名称
清单编码
上下文指代
图片输入预留样例
RAG scope/ACL
公司/项目/行业冲突知识
无证据回答
错误写目标
批量写操作
Tool 失败
LLM 超时
零召回
Hard Negative
```

### 指标

```text
Intent Candidate Recall@K / Macro F1
Mention Span F1
Normalization Exact Match
Entity Recall@20 / Recall@50
Entity Hit@1 / MRR
RAG Recall@K / nDCG / MRR
RAG Groundedness / Citation Accuracy
Tool Selection Accuracy
Mutation Wrong-target Rate
Approval Consistency
Trace Span Completeness
Token Accounting Completeness
End-to-End Task Success
Clarification Rate
Manual Steps Saved
```

### 发布门禁

Prompt、Normalizer、Embedding、索引、RRF、Reranker、Tool Schema 任一升级都必须：

```text
version bump
 -> offline benchmark
 -> regression diff
 -> pass gate
 -> 才允许进入后续环境
```

---

# 7. 第二阶段能力

第一阶段闭环稳定后再实施：

## M9：图片输入

```text
Image/File
 -> Asset Storage
 -> Multimodal Understanding
 -> Observation JSON
 -> Entity Resolution
 -> Action Proposal
 -> Missing Fields UI
 -> Mutation Prepare
 -> Confirmation
 -> Commit
```

## M10：复杂 Agent Loop

```text
Plan -> Act -> Verify -> Replan
```

必须有最大步数、最大 Tool 次数、最大 Token/费用、超时和终止条件。

## M11：Report

支持将查询/分析结果生成：

```text
Excel
PDF
Charts
Narrative Report
```

## M12：只读 SQL/Python Sandbox

```text
Goal
 -> Planner
 -> Existing Tools sufficient?
 -> NO
 -> Schema Discovery (read-only)
 -> Generate SQL/Python
 -> Static Validation
 -> Sandbox Execute
 -> Data Access Broker (read-only)
 -> Verify Outputs
 -> Report Builder
```

禁止：

```text
INSERT
UPDATE
DELETE
DDL
生产数据库凭据进入 Sandbox
```

如果分析结果要求修改业务数据，必须重新生成 MutationProposal 并由用户确认。

---

# 8. 推荐实际开发顺序

```text
P0  行业 Package 骨架 + 协议
 |
P1  MySQL DDL 文件 + Trace
 |
P2  SemanticFrame + Normalizer
 |
P3  Entity Data Foundation
 |
P4  工程部位 Retrieval
 |
P5  工程量清单 Retrieval
 |
P6  READ Tools
 |
P7  Mutation + UI Confirmation
 |
P8  RAG Ingestion
 |
P9  RAG QA
 |
P10 Working Memory
 |
P11 第一阶段 E2E + Golden Eval
 |
P12 Image / Agent Loop / Report / Sandbox
```

优先完成三个端到端闭环：

### 闭环 1：查询

```text
自然语言 -> SemanticFrame -> Entity -> Tool -> Result -> Trace
```

### 闭环 2：写操作

```text
自然语言 -> Entity -> Prepare -> Diff -> Confirm -> Commit -> Verify -> Audit
```

### 闭环 3：知识问答

```text
文档 -> Ingest -> Hybrid Retrieval -> Citation -> Answer -> Trace
```

不要同时铺开所有长期能力。

---

# 9. 每阶段 Definition of Done

每个阶段必须完成：

```text
实现
 -> TypeScript 类型检查
 -> 单元测试
 -> 必要集成测试
 -> 代码审查
 -> 安全/权限审查
 -> 设计复审
 -> 修改
 -> Golden/Hard Eval
 -> 阶段完成
```

代码变更遵循仓库 `AGENTS.md`：

- 严格 TypeScript；
- 不滥用 `any`；
- 不使用动态 inline import；
- 修改测试后运行对应测试；
- 代码修改后执行 `npm run check`；
- 未明确要求时不执行完整 `npm run build` 或完整测试套件。

数据库阶段额外要求：

```text
DDL Review
Index Review
Scope/ACL Review
Rollback Review
SQL Static Validation
```

当前阶段最后一条始终是：

> SQL REVIEW PASS；NOT EXECUTED。

---

# 10. 第一阶段关键验收场景

## 场景 A：工程部位 + 清单查询

用户：

```text
查一下 K12+300 到 K12+800 左幅路基的清单
```

预期：

```text
Semantic Parsing
 -> 桩号归一化
 -> 工程部位 Hybrid Retrieval
 -> 清单 Hybrid Retrieval
 -> READ Tool
 -> 权威数据回源
 -> Table UI
 -> Trace 完整
```

## 场景 B：上下文写操作

用户：

```text
把刚才那些未完成项负责人改成张三
```

预期：

```text
Working Memory
 -> Result Set
 -> Load Latest Records
 -> Prepare Update
 -> Diff
 -> Confirmation
 -> Approval Token
 -> Commit
 -> Verify
 -> Audit
 -> Trace
```

在用户确认前，不得产生数据库写入。

## 场景 C：项目规范问答

用户：

```text
这份规范对混凝土养护时间怎么规定？
```

预期：

```text
Project Context
 -> ACL/Scope Filter
 -> Hybrid RAG
 -> RRF
 -> Rerank
 -> Parent Expansion
 -> Citation
 -> Answer
```

## 场景 D：事实字段查询

用户：

```text
二标 K23+400 左幅 0#台桩基混凝土工程量是多少？
```

预期：

```text
Entity Retrieval
 -> resolve position_id / boq_id
 -> MySQL/Business API 回源
 -> quantity + unit + version + updated_at
 -> Answer Evidence
```

禁止直接从 OpenSearch 向量文本返回工程量最终值。

---

# 11. 第一阶段完成判定

达到第一阶段完成状态时，系统应形成：

```text
Natural Language
      |
SemanticFrame
      |
Entity Retrieval
      |
Tool Registry
      |
+-----------+------------+
|           |            |
READ     Mutation       RAG
|           |            |
+-----------+------------+
      |
Agent Response
```

外围能力必须同时具备：

```text
Trace
Audit
Permission / Scope
Working Memory
UI Action
Golden Eval
Versioned Retrieval Config
```

最终要求：

- 所有请求可追踪；
- 所有 Tool 调用可审计；
- 所有查询可解释；
- 所有业务事实可回源；
- 所有写操作必须确认；
- 所有 RAG 内容存在权限边界；
- 所有召回/模型升级可回归；
- 所有 MySQL 脚本有文件产物，但当前阶段均未执行。

---

# 12. 后续实施时的首批任务

进入开发后建议首先执行以下任务，而不是直接开发全部功能：

1. 创建 `packages/industry-agent` Package 骨架；
2. 定义 `RequestContext / SemanticFrame / ToolDefinition / UIAction / TraceEvent`；
3. 创建 `db/mysql` 目录和 migration/rollback/view/seed 约定；
4. 生成 `001_trace.sql` 与 rollback；
5. 实现 Mock Trace Repository；
6. 将 Pi Agent 生命周期、LLM、Tool 事件映射为 Trace Span；
7. 建立首批 Normalizer 单元测试；
8. 建立工程部位/工程量清单 Golden Eval 数据格式；
9. 再进入 Retrieval 实现。

首个里程碑应证明：

```text
用户问题
 -> Pi Agent
 -> trace_id
 -> LLM/Tool Span
 -> Mock Persistence
 -> 可查询完整 Trace
```

而不是先追求复杂 Agent 自主规划能力。
