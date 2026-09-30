import fs from 'node:fs/promises';
import path from 'node:path';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: false });
const excluded = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage', 'reports']);

export async function findMarkdown(target, extraExclude = []) {
  const skip = new Set([...excluded, ...extraExclude]);
  const result = [];
  async function walk(p) {
    const stat = await fs.lstat(p);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const entry of (await fs.readdir(p)).sort()) {
        if (!skip.has(entry)) await walk(path.join(p, entry));
      }
    } else if (stat.isFile() && /\.(md|markdown)$/i.test(p)) result.push(p);
  }
  await walk(path.resolve(target));
  return result;
}

export function extractLinks(source) {
  const links = [];
  for (const block of md.parse(source, {})) {
    if (block.type !== 'inline' || !block.children) continue;
    let offset = 0;
    // Inline tokens preserve soft/hard breaks; code tokens are never inspected.
    for (const token of block.children) {
      const line = (block.map?.[0] ?? 0) + offset + 1;
      if (token.type === 'link_open') links.push({ url: token.attrGet('href'), kind: 'link', line });
      if (token.type === 'image') links.push({ url: token.attrGet('src'), kind: 'image', line });
      if (token.type === 'softbreak' || token.type === 'hardbreak') offset++;
      // A code span can contain a normalized newline. Positions inside multi-line
      // constructs are approximate, documented in README.
    }
  }
  return links;
}

export async function checkUrl(url, { timeout = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const request = async method => {
    const response = await fetch(url, {
      method, redirect: 'follow', signal: controller.signal,
      headers: { 'User-Agent': 'open-doc-check/0.1.0', ...(method === 'GET' ? { Range: 'bytes=0-0' } : {}) }
    });
    await response.body?.cancel();
    return response;
  };
  try {
    let response = await request('HEAD');
    // Some sites reject HEAD even though opening the page succeeds.
    if (response.status >= 400) response = await request('GET');
    const code = response.status;
    if (code >= 200 && code < 400) return { status: 'ok', reason: `HTTP ${code}`, code };
    if (code === 404 || code === 410) return { status: 'broken', reason: `HTTP ${code}：页面不存在`, code };
    return { status: 'uncertain', reason: `HTTP ${code}：可能需要登录、被限流或服务器暂时异常`, code };
  } catch (error) {
    return { status: 'uncertain', reason: controller.signal.aborted ? '请求超时' : `网络请求失败：${error.cause?.code ?? error.message}` };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkLocal(url, file, root) {
  if (!url || url.startsWith('#')) return { status: 'skipped', reason: '仅含锚点；第一版不验证锚点' };
  if (/^\/\//.test(url)) return { status: 'uncertain', reason: '缺少协议的网络链接，请明确使用 https://' };
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) return { status: 'skipped', reason: '非 HTTP(S) 链接' };
  const raw = url.split(/[?#]/, 1)[0];
  let decoded;
  try { decoded = decodeURIComponent(raw); }
  catch { return { status: 'broken', reason: '路径包含无效的百分号编码' }; }
  const destination = decoded.startsWith('/') ? path.resolve(root, '.' + decoded) : path.resolve(path.dirname(file), decoded);
  try {
    await fs.stat(destination);
    return { status: 'ok', reason: url.includes('#') ? '本地路径存在（未验证锚点）' : '本地路径存在' };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return { status: 'broken', reason: '本地文件或目录不存在' };
    return { status: 'uncertain', reason: `无法读取路径：${error.code ?? error.message}` };
  }
}

export async function scan(target, options = {}) {
  const absolute = path.resolve(target);
  const stat = await fs.stat(absolute);
  const root = path.resolve(options.root ?? (stat.isDirectory() ? absolute : path.dirname(absolute)));
  const files = await findMarkdown(absolute, options.exclude);
  const items = [];
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    for (const link of extractLinks(source)) items.push({ ...link, file: path.relative(root, file).split(path.sep).join('/'), absoluteFile: file });
  }
  const cache = new Map();
  let index = 0;
  const results = new Array(items.length);
  async function worker() {
    while (index < items.length) {
      const current = index++;
      const item = items[current];
      let outcome;
      if (options.ignore?.some(prefix => item.url.startsWith(prefix))) outcome = { status: 'skipped', reason: '匹配忽略前缀' };
      else if (/^https?:\/\//i.test(item.url)) {
        if (options.offline) outcome = { status: 'skipped', reason: '离线模式：未请求网页链接' };
        else {
          const key = item.url.split('#', 1)[0];
          if (!cache.has(key)) cache.set(key, checkUrl(key, options));
          outcome = await cache.get(key);
        }
      } else outcome = await checkLocal(item.url, item.absoluteFile, root);
      const { absoluteFile, ...publicItem } = item;
      results[current] = { ...publicItem, ...outcome };
    }
  }
  await Promise.all(Array.from({ length: options.concurrency ?? 8 }, worker));
  const summary = { files: files.length, links: results.length, ok: 0, broken: 0, uncertain: 0, skipped: 0 };
  for (const item of results) summary[item.status]++;
  return { version: '0.1.0', generatedAt: new Date().toISOString(), root, summary, results };
}
