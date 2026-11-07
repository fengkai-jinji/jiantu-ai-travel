# 见途 · 最新版（唯一真源）

> **本目录是两个 AI（ZCode 与 Codex）共同管理的最新版本**。旧的 `jiantu-react`（Codex 工作副本）与 `传智杯网页设计\传智杯网页设计\jiantu-react`（ZCode 旧副本）仅作历史参考，不再更新。

## 共管约定（2026-11-07 起生效）

1. **动手前先看对方**：修改 src/ 或 server/ 前，先查目标文件 mtime 与关键标记，避免覆盖对方刚写的内容。
2. **增量优先**：只改需求点本身；要动交互结构先在对话里说明。
3. **测试区**：`测试区/验收记录.md` 记录每次实测（倒序）；测试看测试区，制作看制作区。
4. **服务**：maps 8766 与 vite 5173 都从本目录启动。Codex 的 5175 preview 属于旧快照，验收以 5173 为准。

## 启动

- 后端：`F:/Miniconda/envs/yolo/python.exe -X utf8 server/maps.py`（端口 8766）
- 前端：`npm run dev`（端口 5173）；构建 `npm run build`
- 测试：`npm test` + `F:/Miniconda/envs/yolo/python.exe -X utf8 -m unittest discover -s server -p "test_*.py"`

## 当前功能

- 出行助手：联想搜索、横向方案卡（步行/公交/地铁/公交＋地铁）、乘车概览（线路/上下车站/换乘）、4 偏好（含优先地铁）、GSAP Flip 切换过渡、Agent 补问与工具调用、周边搜索
- 知识问答：检索 + 来源 + 拒答
- 室内寻物：YOLO 实时识别；环境感知：待室外模型
- 效果：城市舞台视差、曲面页面转场、AI 光环、飞入动画；「减少动态效果」下全部呈现终态
