#!/usr/bin/env node
/**
 * audit-logos-pipeline.js  (v3, 定稿)
 *
 * 静态审计 BiliBiliMApp 的 Hook 管线，不执行任何目标代码：
 *   1. 每个手写 .xm 是否都有对应的 Logos 生成物 .mm
 *   2. .xm 中每个 %hook 方法 / %property，是否在 .mm 里以对应方式注册
 *        - 普通方法 -> MSHookMessageEx(...)
 *        - %new / %property -> class_addMethod(...)
 *   3. .mm 里存在但 .xm 已无来源的注册（生成物领先 / 生成物被手改）
 *   4. 磁盘上的 .mm 是否全部进入 pbxproj 的 Sources 阶段
 *   5. #import "x.h" 是否可解析
 *
 * 用法: node tools/audit-logos-pipeline.js [repoRoot]
 * 退出码: 0 = 一致, 1 = 存在漂移（可直接挂 CI）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const dylibRoot = path.join(repoRoot, 'BiliBiliMDDylib');
const pbxprojPath = path.join(repoRoot, 'BiliBiliMD.xcodeproj', 'project.pbxproj');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** 去注释但保留字符串字面量 */
function stripComments(src) {
  let out = '';
  let state = 'code';
  for (let i = 0; i < src.length; ) {
    const c = src[i], n = src[i + 1];
    if (state === 'code') {
      if (c === '/' && n === '/') { state = 'line'; i += 2; continue; }
      if (c === '/' && n === '*') { state = 'block'; i += 2; continue; }
      if (c === '"') state = 'dq'; else if (c === "'") state = 'sq';
      out += c; i++; continue;
    }
    if (state === 'line') { if (c === '\n') { state = 'code'; out += c; } i++; continue; }
    if (state === 'block') { if (c === '*' && n === '/') { state = 'code'; i += 2; } else i++; continue; }
    if (state === 'dq' || state === 'sq') {
      const q = state === 'dq' ? '"' : "'";
      if (c === '\\') { out += c + (n ?? ''); i += 2; continue; }
      if (c === q) state = 'code';
      out += c; i++; continue;
    }
  }
  return out;
}

/** 由 Logos 方法声明头算出 selector */
function selectorOf(sig) {
  const head = sig.replace(/\{[\s\S]*$/, '').replace(/;+\s*$/, '').trim();
  const parts = [...head.matchAll(/(\w+)\s*:/g)].map((x) => x[1]);
  if (parts.length) return parts.map((p) => p + ':').join('');
  return head.replace(/^[-+]\s*\([^)]*\)\s*/, '').trim();
}

/** 解析 .xm -> [{cls, sel, kind}]，kind: hook | new | property */
function parseXm(srcRaw) {
  const lines = stripComments(srcRaw).split(/\r?\n/);
  const out = [];
  let group = null, curClass = null, pendingNew = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    let m;
    if ((m = line.match(/^%group\s+(\w+)/))) { group = m[1]; continue; }
    if (/^%end\b/.test(line)) { curClass = null; continue; }
    if ((m = line.match(/^%hook\s+([\w$.]+)/))) { curClass = m[1]; pendingNew = false; continue; }
    if (/^%new\b/.test(line)) { pendingNew = true; continue; }
    if (/^%ctor\b/.test(line) || /^%init\(/.test(line)) continue;

    if (curClass && (m = line.match(/^%property\s*(?:\([^)]*\))?\s*(.+);$/))) {
      // %property (nonatomic, strong) NSObject *nj_currentItem;
      const decl = m[1].trim();
      const name = decl.split(/\s+/).pop().replace(/^\*/, '');
      out.push({ group: group || '_ungrouped', cls: curClass, sel: name, kind: 'property' });
      out.push({ group: group || '_ungrouped', cls: curClass, sel: `set${name[0].toUpperCase()}${name.slice(1)}:`, kind: 'property' });
      continue;
    }

    if (curClass && /^[-+]\s*\(/.test(line)) {
      // 多行 selector：一直拼到出现 { 或 ;
      let sig = line;
      let j = i;
      while (!/[;{]/.test(sig) && j + 1 < lines.length) { j++; sig += ' ' + lines[j].trim(); }
      i = j;
      out.push({ group: group || '_ungrouped', cls: curClass, sel: selectorOf(sig), kind: pendingNew ? 'new' : 'hook' });
      pendingNew = false;
    }
  }
  return out;
}

/** 解析 .mm -> Set("cls|sel") */
function parseMm(srcRaw) {
  const src = stripComments(srcRaw);
  const reg = new Set();
  const patterns = [
    /MSHookMessageEx\(\s*_logos_(?:meta)?class\$([\w$]+)\$([\w$.]+)\s*,\s*@selector\(([^)]+)\)/g,
    /class_addMethod\(\s*_logos_(?:meta)?class\$([\w$]+)\$([\w$.]+)\s*,\s*@selector\(([^)]+)\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src))) reg.add(`${m[2]}|${m[3]}`);
  }
  return reg;
}

const allFiles = walk(dylibRoot);
const xmFiles = allFiles.filter((f) => f.endsWith('.xm'));
const mmFiles = allFiles.filter((f) => f.endsWith('.mm'));
const xFiles = allFiles.filter((f) => f.endsWith('.x'));

const findings = { missingGenerated: [], staleGenerates: [], aheadGenerates: [], notInPbxproj: [], missingImports: [], conditionalImports: [] };

for (const xm of xmFiles) {
  const mm = xm.replace(/\.xm$/, '.mm');
  const relPath = path.relative(repoRoot, xm);
  if (!fs.existsSync(mm)) { findings.missingGenerated.push(relPath); continue; }

  const declared = parseXm(fs.readFileSync(xm, 'utf8'));
  const registered = parseMm(fs.readFileSync(mm, 'utf8'));

  for (const h of declared) {
    const key = `${h.cls}|${h.sel}`;
    if (!registered.has(key)) findings.staleGenerates.push({ file: relPath, hook: key, kind: h.kind });
  }
  const declaredKeys = new Set(declared.map((h) => `${h.cls}|${h.sel}`));
  for (const key of registered) {
    if (!declaredKeys.has(key)) findings.aheadGenerates.push({ file: relPath, hook: key });
  }
}

// pbxproj 的 /* ... */ 是格式的一部分，不能去注释
const pbxproj = fs.readFileSync(pbxprojPath, 'utf8');
for (const mm of mmFiles) {
  const base = path.basename(mm);
  const pat = new RegExp(`/\\*\\s*${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} in Sources\\s*\\*/`);
  if (!pat.test(pbxproj)) findings.notInPbxproj.push(path.relative(repoRoot, mm));
}

const headerIndex = new Set(allFiles.filter((f) => f.endsWith('.h')).map((f) => path.basename(f)));
for (const f of allFiles.filter((x) => /\.(m|mm|xm|h)$/.test(x))) {
  const rawLines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  const src = stripComments(rawLines.join('\n')).split(/\r?\n/);
  for (let i = 0; i < src.length; i++) {
    const m = src[i].match(/#import\s+"([^"]+)"/);
    if (!m || headerIndex.has(path.basename(m[1]))) continue;
    // 向上 40 行内若有 #if / #ifdef / #ifndef，视为条件编译依赖，仅提示不计为失败
    let conditional = false;
    for (let j = Math.max(0, i - 40); j < i; j++) {
      if (/^\s*#if(n?def)?\b/.test(src[j])) { conditional = true; break; }
    }
    findings[conditional ? 'conditionalImports' : 'missingImports'].push({ file: path.relative(repoRoot, f), import: m[1] });
  }
}

const rel = (p) => path.relative(repoRoot, p);
console.log('=== BiliBiliMApp Hook 管线审计 v3 ===');
console.log(`Logos 源    : ${xmFiles.length} 个 .xm`);
console.log(`CaptainHook : ${xFiles.length} 个 .x`);
console.log(`编译产物    : ${mmFiles.length} 个 .mm`);
console.log('');

const dump = (title, arr, fmt) => {
  console.log(`${title}: ${arr.length}`);
  for (const it of arr.slice(0, 300)) console.log('  - ' + (fmt ? fmt(it) : it));
  if (arr.length > 300) console.log(`  ... 还有 ${arr.length - 300} 条`);
  console.log('');
};

dump('缺少生成物', findings.missingGenerated, rel);
dump('生成物过期 (.xm 声明未落到 .mm)', findings.staleGenerates, (i) => `${i.file} :: ${i.hook} [${i.kind}]`);
dump('生成物领先 (.mm 注册无 .xm 来源)', findings.aheadGenerates, (i) => `${i.file} :: ${i.hook}`);
dump('未进入 Sources', findings.notInPbxproj, rel);
dump('无法解析的 #import', findings.missingImports, (i) => `${i.file} -> ${i.import}`);
dump('条件编译内的 #import(仅提示)', findings.conditionalImports, (i) => `${i.file} -> ${i.import}`);

const failing = ['missingGenerated', 'staleGenerates', 'aheadGenerates', 'notInPbxproj', 'missingImports']
  .reduce((a, k) => a + findings[k].length, 0);
console.log(failing === 0 ? '结论: 管线一致，源与生成物无漂移。' : `结论: 发现 ${failing} 处问题。`);

fs.writeFileSync(
  path.join(repoRoot, 'tools', 'audit-report.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), counts: { xm: xmFiles.length, x: xFiles.length, mm: mmFiles.length }, findings }, null, 2)
);
console.log('明细 -> tools/audit-report.json');
process.exit(failing === 0 ? 0 : 1);
