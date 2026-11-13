#!/usr/bin/env node
/**
 * make-patch.js
 * 生成「原始仓库 → 当前工作副本」的统一 diff，便于审阅/回滚。
 *
 * 用法: node tools/make-patch.js <原始目录> <当前目录> [输出文件]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const [pristineRoot, workRoot, outFile = 'docs/PATCH.patch'] = process.argv.slice(2);
if (!pristineRoot || !workRoot) {
  console.error('用法: node tools/make-patch.js <原始目录> <当前目录> [输出文件]');
  process.exit(2);
}

function walk(dir, base = dir, out = new Map()) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else out.set(path.relative(base, full).split(path.sep).join('/'), full);
  }
  return out;
}

const isText = (buf) => !buf.includes(0) && !/\.(png|jpg|jpeg|gif|zip|dylib|a)$/i.test(String(buf.slice(0, 0)));

/** 行级 LCS diff */
function diffLines(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push([' ', a[i]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push(['-', a[i]]); i++; }
    else { ops.push(['+', b[j]]); j++; }
  }
  while (i < n) { ops.push(['-', a[i]]); i++; }
  while (j < m) { ops.push(['+', b[j]]); j++; }
  return ops;
}

function unified(rel, aText, bText, context = 3) {
  const a = aText.split(/\r?\n/), b = bText.split(/\r?\n/);
  const ops = diffLines(a, b);
  const hunks = [];
  let idx = 0, oldLine = 1, newLine = 1;

  while (idx < ops.length) {
    // 找下一处变更
    while (idx < ops.length && ops[idx][0] === ' ') { idx++; oldLine++; newLine++; }
    if (idx >= ops.length) break;

    const startOld = oldLine, startNew = newLine;
    const body = [];
    let tail = 0;

    // 向前推进，保持 context 行上下文
    while (idx < ops.length) {
      const [op, line] = ops[idx];
      if (op === ' ') {
        tail++;
        body.push(' ' + line);
        oldLine++; newLine++;
        idx++;
        if (tail > context * 2) break;
        continue;
      }
      tail = 0;
      body.push(op + line);
      if (op === '-') oldLine++; else newLine++;
      idx++;
    }
    const oldCount = body.filter((l) => l[0] === ' ' || l[0] === '-').length;
    const newCount = body.filter((l) => l[0] === ' ' || l[0] === '+').length;
    hunks.push(`@@ -${startOld},${oldCount} +${startNew},${newCount} @@\n` + body.join('\n'));
  }
  if (!hunks.length) return '';
  return `--- a/${rel}\n+++ b/${rel}\n` + hunks.join('\n') + '\n';
}

const oldFiles = walk(pristineRoot);
const newFiles = walk(workRoot);
const all = new Set([...oldFiles.keys(), ...newFiles.keys()]);
const parts = [];
const stats = { added: [], modified: [], removed: [] };

const outRel = path.relative(workRoot, path.isAbsolute(outFile) ? outFile : path.join(workRoot, outFile)).split(path.sep).join('/');

for (const rel of [...all].sort()) {
  if (rel === outRel) continue;
  const o = oldFiles.get(rel), nn = newFiles.get(rel);
  if (!o) { stats.added.push(rel); continue; }
  if (!nn) { stats.removed.push(rel); continue; }
  const ob = fs.readFileSync(o), nb = fs.readFileSync(nn);
  if (ob.equals(nb)) continue;
  if (!isText(ob) || !isText(nb)) { stats.modified.push(rel + ' (二进制)'); continue; }
  const d = unified(rel, ob.toString('utf8'), nb.toString('utf8'));
  if (d) { stats.modified.push(rel); parts.push(d); }
}

const header = [
  '# 原始仓库 → 当前工作副本 的改动',
  '',
  `修改 ${stats.modified.length} 个文件，新增 ${stats.added.length} 个文件。`,
  '',
  '## 新增',
  ...stats.added.map((f) => `- ${f}`),
  '',
  '## 修改',
  ...stats.modified.map((f) => `- ${f}`),
  '',
  '```diff',
].join('\n');

const target = path.isAbsolute(outFile) ? outFile : path.join(workRoot, outFile);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, header + '\n' + parts.join('\n') + '\n```\n');
console.log(header);
console.log('...');
console.log('\n补丁已写入 ' + target);
