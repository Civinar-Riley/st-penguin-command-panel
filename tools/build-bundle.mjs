#!/usr/bin/env node
// 生成酒馆助手脚本包（JSON）—— 维护者工具，使用者不需要运行任何构建
//
// 用法（仓库根目录）:
//   node tools/build-bundle.mjs            用 command_panel.js 覆盖生成两种脚本包
//   node tools/build-bundle.mjs --check     只校验：包内内容是否与源码一致（提交前用）
//
// 产出两个包，二选一导入：
//   1) 自包含版  酒馆助手脚本-企鹅-酒馆原生命令面板.json        代码完整内置，离线可用
//   2) CDN 加载器 酒馆助手脚本-企鹅-酒馆原生命令面板-CDN加载器.json  只有一行 import，
//      实时从 jsDelivr 拉 @main 分支的源码，仓库更新后无需重新导入
//
// 版本号的唯一来源是 command_panel.js 里的 `const VERSION = 'vX.Y';`。
// 发布新版本：改 VERSION → 跑本脚本 → 提交 → 打 tag（tag 一旦被 jsDelivr 缓存就不可再移动）。

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_NAME = 'command_panel.js';          // 仓库内的源码路径，也是 CDN 上要拉的路径
const SRC = join(root, SRC_NAME);
const OUT_FULL = join(root, '酒馆助手脚本-企鹅-酒馆原生命令面板.json');
const OUT_LOADER = join(root, '酒馆助手脚本-企鹅-酒馆原生命令面板-CDN加载器.json');
const AUTHOR = '西维纳尔';
const REPO = 'Civinar-Riley/st-penguin-command-panel';
const BRANCH = 'main';                        // 加载器跟随的分支
const SCRIPT_NAME = '企鹅-酒馆原生命令面板';
const BUTTON = { name: '🐧企鹅·命令面板', visible: true };
const LOADER_ID = '7b1f0c93-2d84-4e5a-9f36-c4a8e15d2b70';

const check = process.argv.includes('--check');

const src = readFileSync(SRC, 'utf8');
if (/\r/.test(src)) {
  console.error(`✖ ${SRC_NAME} 含 CR，请先统一为 LF 再打包`);
  process.exit(1);
}

const version = (/^\s*const VERSION = '([^']+)'/m.exec(src) || [])[1];
if (!version) {
  console.error(`✖ 在 ${SRC_NAME} 里找不到 \`const VERSION = 'vX.Y';\``);
  process.exit(1);
}
// 文件头的更新记录里应当有对应条目，避免改了 VERSION 却忘了写变更说明
if (!src.includes(`*   ${version} `)) {
  console.error(`✖ ${SRC_NAME} 头部的更新记录里没有 ${version} 条目`);
  process.exit(1);
}

const cdnUrl = `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/${SRC_NAME}`;

const full = {
  type: 'script',
  enabled: true,
  name: SCRIPT_NAME,
  id: 'e8c2cc54-46f2-4171-b229-f15bf4ab11ae',
  content: src,
  info: `作者：${AUTHOR}\n版本：${version}`,
  button: { enabled: true, buttons: [BUTTON] },
  data: {},
  export_with: { data: true, button: true },
};

const loader = {
  type: 'script',
  enabled: true,
  name: `${SCRIPT_NAME}（CDN 加载器）`,
  id: LOADER_ID,
  content: `import '${cdnUrl}';`,
  info:
    `${SCRIPT_NAME} CDN 加载器：脚本内容只有一行 import，代码实时从 jsDelivr 拉取本仓库 ` +
    `@${BRANCH} 分支（当前 ${version}），仓库更新后无需重新导入（jsDelivr 有最长约 12 小时缓存）。` +
    `与自包含版二选一导入，不要同时启用两个，否则会出现两个同名脚本按钮。` +
    `断网或 CDN 不可达时无效，此时请用自包含版。` +
    `想锁定版本：把 URL 里的 @${BRANCH} 换成具体的 tag（如 @${version}），代价是 tag 为不可变缓存、不再自动更新。`,
  button: { enabled: true, buttons: [BUTTON] },
  data: {},
  export_with: { data: false, button: false },
};

if (check) {
  const curFull = JSON.parse(readFileSync(OUT_FULL, 'utf8'));
  const curLoader = JSON.parse(readFileSync(OUT_LOADER, 'utf8'));
  const problems = [];
  if (curFull.content !== src) problems.push('自包含版内容与源码不一致');
  if (curFull.info !== full.info) problems.push(`自包含版 info 不是 ${version}`);
  if (curLoader.content !== loader.content) problems.push('CDN 加载器指向的 URL 与预期不一致');
  if (problems.length) {
    console.error('✖ ' + problems.join('；') + '\n  请运行 node tools/build-bundle.mjs');
    process.exit(1);
  }
  console.log(`✔ 两种脚本包都与源码一致（${version}）`);
  console.log(`  CDN：${cdnUrl}`);
  process.exit(0);
}

writeFileSync(OUT_FULL, JSON.stringify(full, null, 2) + '\n');
writeFileSync(OUT_LOADER, JSON.stringify(loader, null, 2) + '\n');
console.log(`✔ 已生成两种脚本包（${version}，源码 ${src.split('\n').length} 行）`);
console.log(`  自包含版  ${OUT_FULL.split(/[\\/]/).pop()}`);
console.log(`  CDN 加载器 ${OUT_LOADER.split(/[\\/]/).pop()}`);
console.log(`  CDN 地址   ${cdnUrl}`);
