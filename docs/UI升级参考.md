# UI 升级参考（GitHub 高星库借鉴清单）

> 目的：比赛主要看网页效果。本文档收集 GitHub 高星 UI 仓库里**用得上的具体手法**，映射到见途各页面，供后续升级逐项落地。风格约束不变：深绿/米白、无障碍优先、「减少动态效果」直接呈现终态。

## 一、仓库清单（2026-11-07 检索）

| 仓库 | Stars(约) | 对我们的价值 |
| --- | --- | --- |
| [shadcn/ui](https://github.com/shadcn-ui/ui) | 85k+ | 组件结构范式与设计令牌组织方式，学习其「复制粘贴」分发思路 |
| [react-bits](https://github.com/DavidHDev/react-bits) | 51k | **最贴合**：215+ 动效组件（数字滚动、文字拆分入场、点阵背景、光效卡片），逐个抄实现 |
| [Aceternity UI](https://github.com/aceternity-ui/aceternity-ui) | 28k | 视觉效果领导者：Bento 网格、Spotlight 追光、Background Beams、Shimmer 按钮 |
| [Magic UI](https://github.com/magicuidesign/magicui) | 15-21k | shadcn 生态动效层：Border Beam 流动描边、Marquee 跑马灯、Number Ticker、Blur Fade、Meteors |
| [MengTo/threeui](https://github.com/MengTo/threeui) | 5k+（15天） | Three.js 3D Hero 组件目录（用户点名）；3D 城市舞台的升级参考 |
| [Lottie/lottie-web](https://github.com/airbnb/lottie-web) | 30k+ | 设计师导出的微交互动画（说明页、空状态） |

> 注意：这些库多基于 Tailwind + Framer Motion；我们是 **React 19 + 原生 CSS + GSAP**。借鉴手法与实现思路，代码按我们的栈重写（GSAP 已有，等价能力足够）；不要整库引入。

## 二、逐页借鉴映射（按视觉收益排序）

### 1. 出行助手（收益最高）
- **Number Ticker 数字滚动**（react-bits/Magic UI）：查询完成时，方案卡的「59 分钟 / 10.78 公里」从 0 滚动到目标值，0.8s GSAP 内插即可实现，比赛演示效果立竿见影。
- **Border Beam 流动描边**（Magic UI）：选中方案卡的金色进度条升级为绕边流动光带（conic-gradient + 旋转遮罩）。
- **Spotlight 追光卡**（Aceternity）：卡片 hover 时鼠标位置追踪径向高光，纯 CSS 变量 + radial-gradient 实现。
- **Flip 已有**：Codex 的方案切换连续过渡保留。

### 2. 首页
- **Bento 网格**（Aceternity）：三张特性卡改 Bento 布局（1 大 2 小 + 知识带并入），信息密度和现代感同时提升。
- **Split Text 标题入场**（react-bits）：Hero「让每一次出发，都更从容」按字符/词组错落浮现（0.6s，reduce-motion 直接显示）。
- **3D Hero（ThreeUI 风格）**：现有城市舞台升级为轻量 3D——优先用 CSS perspective + GSAP 实现倾斜视差（零依赖）；若评估后必须 Three.js，懒加载并只在首页用，bundle +150KB 要接受。
- **Dot Pattern / Grid 背景纹理**（react-bits）：米白底上加极淡点阵，增加质感不抢戏。

### 3. 知识问答
- **Marquee 跑马灯**（Magic UI）：热门问题横滑条带（可暂停，aria-hidden 装饰）。
- **Blur Fade 逐条浮现**（Magic UI）：来源列表逐条淡入。

### 4. 全局
- **Shimmer 加载按钮**（Aceternity）：查询中按钮流光替代纯文字「查询中…」。
- **设计令牌整理**（shadcn 思路）：颜色/圆角/阴影统一成 CSS 变量清单，保证多 AI 协作风格不漂移。

## 三、落地顺序建议（每项都过 reduce-motion）

1. Number Ticker + 选中卡流动描边（出行页，半天）
2. Bento 首页 + Split Text 标题（一天）
3. Spotlight 追光 + 点阵背景（半天）
4. Three.js 3D Hero（评估后再做，最后做）

## 四、技术红线

- 不引入 Tailwind/Framer Motion 依赖，用 GSAP + 原生 CSS 等价实现
- 所有新动效挂 `reduce-motion`（CSS 全局规则 + motion.ts 的 reduced()/useReducedMotion）
- 新依赖进 package.json 前报体积影响；3D 内容必须懒加载
- 借鉴手法重写实现，不整段复制受版权保护的示例代码
