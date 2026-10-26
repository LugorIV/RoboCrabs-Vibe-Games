# Third-party libraries

DIY.org adds these graphics engines to games automatically, but they are not
included in a DIY.org download, so this site provides them.

| File | Library | License |
| --- | --- | --- |
| `pixi-8.22.0.min.js` | [PixiJS](https://pixijs.com) 8.22.0, unmodified `dist/pixi.min.js` from npm | MIT |
| `three-r182.min.js` | [three.js](https://threejs.org) r182 (0.182.0) plus addons GLTFLoader, SkeletonUtils, RoomEnvironment, EffectComposer, RenderPass, ShaderPass, OutputPass, UnrealBloomPass, FXAAPass, bundled into one file that sets `window.THREE` | MIT |

## Rebuilding `three-r182.min.js`

```sh
mkdir three-build && cd three-build && npm init -y
npm i three@0.182.0 esbuild@0.24.2
# entry.js: import * as CORE from 'three' and each addon above from
# 'three/examples/jsm/...', then:
#   window.THREE = Object.assign({}, CORE, { GLTFLoader, SkeletonUtils, ... });
npx esbuild entry.js --bundle --minify --format=iife --outfile=three-r182.min.js
```
