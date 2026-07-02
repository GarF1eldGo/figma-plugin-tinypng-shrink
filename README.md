# figma-tinypng-plugin

Figma 插件：导出选中图层并通过 TinyPNG API 循环压缩，最终保存到本地。

## 功能

- 选中 Figma 图层后一键导出
- 循环调用 TinyPNG API 压缩（次数可配置，默认 2 次）
- 支持 PNG / JPG / WebP 导出格式
- 支持 1x / 2x / 3x 导出倍率
- API Key 本地持久化（`clientStorage`）
- 实时进度日志

## 目录结构

```
figma-tinypng-plugin/
├── manifest.json       # Figma 插件配置
├── package.json        # 构建脚本
├── tsconfig.json       # TypeScript 配置
├── build-ui.js         # 复制 UI HTML 到 dist/
├── src/
│   ├── code.ts         # 主逻辑（在 Figma 沙盒中运行）
│   └── ui.html         # 插件 UI
└── dist/               # 构建产物（运行 npm run build 后生成）
```

## 安装与构建

```bash
npm install
npm run build
```

构建产物在 `dist/` 目录：`code.js` + `ui.html`。

## 在 Figma 中加载

1. 打开 Figma Desktop
2. 菜单 → Plugins → Development → Import plugin from manifest…
3. 选择本项目根目录的 `manifest.json`

## 使用方法

1. 在 Figma 中选中要导出的图层（支持多选）
2. 运行插件
3. 输入 TinyPNG API Key（在 https://tinypng.com/developers 免费申请）
4. 设置压缩次数（默认 2）、导出格式和倍率
5. 点击「导出并压缩选中图层」
6. 浏览器会依次弹出下载对话框保存文件

## TinyPNG API 工作流

每张图片的压缩流程：

```
Figma exportAsync → (循环 N 次) → POST /shrink → GET 压缩图 → 下载到本地
```

每次循环都在上一次压缩结果的基础上再压缩一次，从而进一步减小文件体积。

## 注意事项

- TinyPNG 免费账户每月限 500 次压缩，2 次压缩 × 图层数 = 实际消耗次数
- 对已经高度压缩的图片，多次压缩的收益递减，推荐 2~3 次
