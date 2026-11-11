# 小島漫步

用 Three.js + Vite + TypeScript 製作的 3D 網頁遊戲：在小島上自由走動，四周是遠方雪山、浮空島與巨大星體。
同一份程式碼支援電腦與手機，之後可用 Capacitor 包裝成 App。

## 操作

| 裝置 | 移動 | 視角 | 跳躍 |
| --- | --- | --- | --- |
| 電腦 | WASD／方向鍵（Shift 奔跑） | 拖曳滑鼠 | 空白鍵 |
| 手機 | 畫面左半邊拖曳（虛擬搖桿） | 畫面右半邊拖曳 | 「跳」按鈕 |

## 開發

```bash
npm install
npm run dev        # 本機開發
npm run build      # 建置到 dist/
npm run typecheck  # TypeScript 型別檢查
```

## 部署

推送到 `main` 後，GitHub Actions 會自動建置並部署到 GitHub Pages。

第一次使用前，請到 repo 的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。

## 專案結構

- `src/main.ts` — 進入點：渲染器、玩家、鏡頭、主迴圈
- `src/input.ts` — 輸入層（鍵盤、滑鼠、觸控搖桿統一成同一組數值）
- `src/terrain.ts` — 小島地形與高度函式
- `src/world.ts` — 天空、海、山脈、浮空島、樹木等場景
- `src/noise.ts` — 雜訊與亂數工具
- `.github/workflows/deploy.yml` — 自動部署流程
