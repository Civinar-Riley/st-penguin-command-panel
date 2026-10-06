#!/usr/bin/env node
// 生成酒馆助手脚本包（JSON）—— 维护者工具，使用者不需要运行任何构建
//
// 用法（仓库根目录）:
//   node tools/build-bundle.mjs            用 command_panel.js 覆盖生成脚本包
//   node tools/build-bundle.mjs --check    只校验：包内内容是否与源码一致（CI/提交前用）
//
// 版本号的唯一来源是 command_panel.js 里的 `const VERSION = 'vX.Y';`，
// 这里读出来写进包名无关的 info 字段。发布新版本：改 VERSION → 跑本脚本 → 提交 → 打 tag。

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'command_panel.js');
// 包名不带版本号：换 tag 即发布新版本，下载链接始终指向最新
const OUT = join(root, '酒馆助手脚本-企鹅-酒馆原生命令面板.json');
const AUTHOR = '西维纳尔';

const check = process.argv.includes('--check');

const src = readFileSync(SRC, 'utf8');
if (/\r/.test(src)) {
  console.error('✖ command_panel.js 含 CR，请先统一为 LF 再打包');
  process.exit(1);
}

const version = (/^\s*const VERSION = '([^']+)'/m.exec(src) || [])[1];
if (!version) {
  console.error("✖ 在 command_panel.js 里找不到 `const VERSION = 'vX.Y';`");
  process.exit(1);
}
// 文件头的更新记录里应当有对应条目，避免改了 VERSION 却忘了写变更说明
if (!src.includes(`*   ${version} `)) {
  console.error(`✖ command_panel.js 头部的更新记录里没有 ${version} 条目`);
  process.exit(1);
}

const bundle = {
  type: 'script',
  enabled: true,
  name: '企鹅-酒馆原生命令面板',
  id: 'e8c2cc54-46f2-4171-b229-f15bf4ab11ae',   // 沿用 v1.4 的 id，导入时覆盖同一份脚本
  content: src,
  info: `作者：${AUTHOR}\n版本：${version}`,
  button: { enabled: true, buttons: [{ name: '🐧企鹅·命令面板', visible: true }] },
  data: {},
  export_with: { data: true, button: true },
};

if (check) {
  const cur = JSON.parse(readFileSync(OUT, 'utf8'));
  const same = cur.content === src && cur.info === bundle.info;
  console.log(same ? `✔ 脚本包与源码一致（${version}）` : '✖ 脚本包与源码不一致，请运行 node tools/build-bundle.mjs');
  process.exit(same ? 0 : 1);
}

writeFileSync(OUT, JSON.stringify(bundle, null, 2) + '\n');
console.log(`✔ 已生成 ${OUT.split(/[\\/]/).pop()}（${version}，${src.split('\n').length} 行）`);
