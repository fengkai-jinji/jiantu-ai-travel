# 测试区

> **制作区（唯一维护目录）：`F:\归档\传智杯网页设计\jiantu-react`**（src/ 前端、server/ 后端、docs/ 文档、tests 在 server/）。旧内层目录已归档。

这里是**测试区**：浏览器实测记录、验收结论、截图归档。测试相关的活儿直接看这里，不用翻制作区代码。

## 怎么跑测试

1. 单元测试：`npm test`（JS 2 项）+ `F:/Miniconda/envs/yolo/python.exe -X utf8 -m unittest discover -s server -p "test_*.py"`（42 项）
2. 浏览器实测：运行 `启动项目.ps1`（若存在）或分别启动 maps.py / vite，打开 http://127.0.0.1:5173
3. 生产构建验证：`npm run build`；预览：`npm run preview`（另见 完成区/见途首页升级版）

详细记录见 [验收记录.md](验收记录.md)。
