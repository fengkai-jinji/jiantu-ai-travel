# 模型训练工坊（出行领域增强）

目标：让出行助手「懂出行、懂景点」。分两条路线——**现在用的 RAG+工具**（零训练成本、可解释、当天生效）和**将来的 GLM 微调**（效果上限更高）。

## 路线 A：RAG + 工具（当前已上线）

出行 Agent 新增 `lookup_knowledge` 工具：知识性问题（景点介绍、开放安排、无障碍常识、帮助方法）先查 `server/knowledge.json`，只依据返回条目回答并注明来源；资料不足就明确说明。
扩充领域知识 = 往 knowledge.json 加条目（记得核对后改 verified）。

## 路线 B：GLM LoRA 微调（备选，参赛演示可作为路线图讲）

1. **数据**：`scripts/build_corpus.py` 从 knowledge.json + 工具轨迹样例生成 GLM 微调 JSONL（chat 格式，含 tools + tool_calls 标注）。
2. **训练**：LLaMA-Factory 或 glm4-finetune 对 GLM-4-9B/开源底座做 LoRA SFT（见下方资源）。
3. **评测**：`eval/eval_set.jsonl` 问题集，检查要点命中与来源引用；对比微调前后。
4. **上线**：vLLM 部署需注意 GLM 工具调用解析（tool-call-parser）配置；线上仍保留 RAG 兜底。
5. **成本提示**：微调需要 GPU 与时间；比赛期以路线 A 为主，本目录保存数据与脚本即可随时启动路线 B。

## GitHub 资源清单（2026-11-07 检索）

### 领域数据
- [qwd/LocationList](https://github.com/qwd/LocationList) —— 全国景点 POI 列表 CSV（名称/经纬度/省市），可持续更新，适合做景点知识库的候选池。
- [qmjy/poi](https://github.com/qmjy/poi) —— 基于 OpenStreetMap 的国内 POI 数据集（附提取代码），类别比景点更全。
- [xiangyuecn/AreaCity-JsSpider-StatsGov](https://github.com/xiangyuecn/AreaCity-JsSpider-StatsGov) —— 省市区县乡镇行政区划 + 坐标边界（城市/区域识别的地理底座）。
- [pbeenigg/poi_collector_app](https://github.com/pbeenigg/poi_collector_app) —— 高德 POI 采集器（关键词/周边搜索、CSV 导出），可用于自采南京景点与无障碍点位。

### 微调框架与教程
- [SwanHubX/glm4-finetune](https://github.com/SwanHubX/glm4-finetune) —— GLM-4 微调教程，README_func_call.md 专门讲工具调用微调（HuggingFace TRL，支持 SFT/DPO 等）。
- [LLaMA-Factory](https://github.com/hiyouga/LLaMA-Factory) —— 社区主流微调框架，GLM-4-9B-Chat LoRA：自定义数据集 + yaml → `llamafactory-cli train`。
- [zai-org/GLM-4](https://github.com/zai-org/GLM-4) —— GLM 官方仓库（模型与部署 issue，含工具调用解析讨论）。

> 使用任何数据前先确认许可证与字段口径；POI 营业状态变化快，入库一律带 date 与 verified 字段。

## 目录

- `scripts/build_corpus.py` —— knowledge.json → 微调 JSONL（含工具调用样例）
- `eval/eval_set.jsonl` —— 出行领域评测问题集（question / must_include / topic）
- `data/` —— 放下载的 POI/语料原始数据（不进 Git 的大文件）


## 社交平台攻略数据（小红书/抖音/大众点评）怎么用

这三家都没有公开 API，运行时抓取违反平台条款且极不稳定——**助手不做运行时爬虫**。等价做法：

1. **官方 POI 优先**：店铺/景点本体来自高德官方周边搜索（名称、地址、距离真实可靠）。
2. **攻略人工入库**：团队浏览小红书/点评后，把「值得推荐的要点」整理进 `server/knowledge.json`（带来源名称+日期+verified 字段），Agent 通过 lookup_knowledge 引用——一次入库反复使用，合规且零运行时爬取。
3. **路线 B 微调**：采集的攻略文本可进入 `scripts/build_corpus.py` 的训练语料（注意平台内容版权，仅自用训练不发布）。

## token 护栏（已上线）

- `server/token_guard.py`：按天记账（优先读响应 usage.total_tokens，缺失时按字符估算），超 `TOKEN_DAILY_LIMIT`（.env，默认 80000）后 AI 聊天友好拒绝，**地图/周边查询永不受限**。
- 零 token 路径：推荐类请求（书店/景点/行程等）由规则路由直接调高德 + 模板回答，实测 125~141ms，不经大模型。
