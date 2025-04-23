# CG-WinterFell

<img src="/public/docs/landing-page.jpg" alt="winterfell" width="100%" height="500px">

## File Tree

```
src
├─App.tsx
├─Game.tsx
├─main.tsx
├─vite-env.d.ts
├─utils
|   ├─Debug.tsx
|   ├─MotionController.ts
|   ├─Pause.tsx
|   ├─ResourcePreloader.tsx
|   ├─WebgpuSupport.tsx
|   └utils.ts
├─types
|   └store.d.ts
├─styles
|   ├─index.css
|   ├─layout.css
|   ├─pause.css
|   ├─score.css
|   └welcome.css
├─store
|   └store.ts
├─hooks
|   ├─useKeyboardControls.ts
|   ├─usePlayerMovement.ts
|   └useWebGPURenderer.ts
├─config
|   └constants.ts
├─components
|     ├─Ground.tsx
|     ├─Player.tsx
|     ├─ProgressMonitor.tsx
|     ├─PumpkinField.tsx
|     ├─Score.tsx
|     ├─Skybox.tsx
|     ├─WelcomePage.tsx
|     ├─unused
|     |   ├─MonsterTerrain.tsx
|     |   └TerrainGenerator.tsx
├─assets
|   ├─welcome1.jpg
|   └welcome2.jpg
```

## Start

```bash

$ npm install

$ npm run dev

```

## Commit Specification

-   feat: new features
-   fix: fix problems
-   chore: modify tool related (including but not limited to documentation, code generation, etc.)
-   docs: modify documentation
-   perf: improve performance
-   refactor: refactor code, theoretically without affecting existing functions
-   revert: rollback
-   style: modify code format, without affecting code logic
-   test: test related
-   ci: CI
