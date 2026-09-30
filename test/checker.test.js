import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractLinks, checkUrl, scan } from '../src/checker.js';
import { htmlReport } from '../src/report.js';

test('解析普通链接、图片和引用链接，忽略代码', () => {
  const source = '[文档](guide.md)\n![图](a.png)\n[参考][ref]\n\n[ref]: target.md\n\n`[代码](fake.md)`\n\n```md\n[代码](fake2.md)\n```';
  assert.deepEqual(extractLinks(source).map(i => [i.url, i.kind, i.line]), [
    ['guide.md', 'link', 1], ['a.png', 'image', 2], ['target.md', 'link', 3]
  ]);
});

test('中文、空格、根目录路径、缺失图片、排除目录和离线模式', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-check-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'docs'));
  await fs.mkdir(path.join(root, 'node_modules'));
  await fs.writeFile(path.join(root, '中文 文件.md'), '内容');
  await fs.writeFile(path.join(root, 'node_modules', 'skip.md'), '[bad](missing)');
  await fs.writeFile(path.join(root, 'docs', 'README.md'), '[中](../中文%20文件.md)\n[根](/中文%20文件.md)\n![图](missing.png)\n[网页](https://example.com)\n[标题](#abc)');
  const report = await scan(root, { offline: true });
  assert.deepEqual(report.summary, { files: 2, links: 5, ok: 2, broken: 1, uncertain: 0, skipped: 2 });
  assert.equal(report.results[2].line, 3);
  assert.equal(report.results[2].file, 'docs/README.md');
});

test('网络成功、重定向、HEAD 回退、失效、限流、超时和去重', async t => {
  const calls = [];
  const server = http.createServer((req, res) => {
    calls.push(`${req.method} ${req.url}`);
    if (req.url === '/slow') return;
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/ok' }); return res.end(); }
    if (req.url === '/fallback') res.statusCode = req.method === 'HEAD' ? 405 : 200;
    else if (req.url === '/missing') res.statusCode = 404;
    else if (req.url === '/gone') res.statusCode = 410;
    else if (req.url === '/limited') res.statusCode = 429;
    else if (req.url === '/login') res.statusCode = 403;
    res.end('test');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [route, status] of [['ok', 'ok'], ['redirect', 'ok'], ['fallback', 'ok'], ['missing', 'broken'], ['gone', 'broken'], ['limited', 'uncertain'], ['login', 'uncertain']]) {
    assert.equal((await checkUrl(`${base}/${route}`)).status, status, route);
  }
  assert.ok(calls.includes('GET /fallback'));
  assert.equal((await checkUrl(`${base}/slow`, { timeout: 40 })).reason, '请求超时');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-check-net-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'README.md'), `[a](${base}/unique#a)\n[b](${base}/unique#b)`);
  assert.equal((await scan(root)).summary.ok, 2);
  assert.equal(calls.filter(c => c === 'HEAD /unique').length, 1);
});

test('忽略前缀与自定义排除目录', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-check-ignore-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'custom'));
  await fs.writeFile(path.join(root, 'custom', 'x.md'), '[bad](missing.md)');
  await fs.writeFile(path.join(root, 'README.md'), '[a](https://example.com)');
  const report = await scan(root, { exclude: ['custom'], ignore: ['https://example.com'] });
  assert.equal(report.summary.files, 1);
  assert.equal(report.summary.skipped, 1);
});

test('HTML 报告转义文档内容，防止脚本注入', () => {
  const html = htmlReport({ summary: { files: 1, links: 1, ok: 0, broken: 1, uncertain: 0, skipped: 0 }, results: [{ status: 'broken', file: '<script>alert(1)</script>', line: 1, url: '<img onerror=x>', reason: '"unsafe"' }] });
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
});

test('命令行退出码和 JSON 报告', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-check-cli-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const cli = fileURLToPath(new URL('../bin/open-doc-check.js', import.meta.url));
  await fs.writeFile(path.join(root, 'README.md'), '[bad](missing.md)');
  const broken = spawnSync(process.execPath, [cli, root, '--offline', '--format', 'json'], { encoding: 'utf8' });
  assert.equal(broken.status, 1);
  assert.equal(JSON.parse(broken.stdout).summary.broken, 1);
  await fs.writeFile(path.join(root, 'README.md'), 'No links');
  assert.equal(spawnSync(process.execPath, [cli, root, '--offline']).status, 0);
  assert.equal(spawnSync(process.execPath, [cli, root, '--concurrency', '0']).status, 2);
  assert.equal(spawnSync(process.execPath, [cli, root, '--format', 'invalid']).status, 2);
});
