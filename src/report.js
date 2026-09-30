const labels = { ok: '正常', broken: '失效', uncertain: '待确认', skipped: '跳过' };
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cell = text => String(text).replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');

export function textReport(report) {
  const s = report.summary;
  const lines = [`open-doc-check：${s.files} 个文档，${s.links} 个链接`, `正常 ${s.ok} · 失效 ${s.broken} · 待确认 ${s.uncertain} · 跳过 ${s.skipped}`];
  for (const item of report.results.filter(i => ['broken', 'uncertain'].includes(i.status))) {
    lines.push(`[${labels[item.status]}] ${item.file}:${item.line} ${item.url}\n  ${item.reason}`);
  }
  return lines.join('\n');
}

export function markdownReport(report) {
  return `# 文档链接检查报告\n\n${textReport({ ...report, results: [] })}\n\n| 状态 | 文件 | 行号 | 链接 | 原因 |\n| --- | --- | --- | --- | --- |\n` + report.results.map(i => `| ${labels[i.status]} | ${cell(i.file)} | ${i.line} | ${cell(i.url)} | ${cell(i.reason)} |`).join('\n') + '\n';
}

export function htmlReport(report) {
  const rows = report.results.map(i => `<tr class="${i.status}"><td>${labels[i.status]}</td><td>${escape(i.file)}:${i.line}</td><td>${escape(i.url)}</td><td>${escape(i.reason)}</td></tr>`).join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文档链接检查报告</title><style>body{font:16px/1.6 system-ui,sans-serif;background:#f4f7fb;color:#172334;margin:0;padding:32px}main{max-width:1200px;margin:auto}h1{margin-bottom:8px}pre{white-space:pre-wrap}table{width:100%;border-collapse:collapse;background:white}td,th{text-align:left;padding:12px;border-bottom:1px solid #dce4ee;overflow-wrap:anywhere}th{background:#e6edf7}.broken td:first-child{color:#b42318}.uncertain td:first-child{color:#946200}.ok td:first-child{color:#157347}input{font:inherit;padding:8px;width:min(90%,420px);margin:12px 0}</style><main><h1>文档链接检查报告</h1><pre>${escape(textReport({ ...report, results: [] }))}</pre><input id="filter" placeholder="搜索文件、链接或原因" aria-label="筛选结果"><div style="overflow-x:auto"><table><thead><tr><th>状态</th><th>位置</th><th>链接</th><th>原因</th></tr></thead><tbody>${rows}</tbody></table></div><p>锚点、原始 HTML 标签及未解析的引用链接不在第一版检查范围内。</p></main><script>document.getElementById('filter').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('tbody tr').forEach(r=>r.hidden=!r.textContent.toLowerCase().includes(q))})</script></html>`;
}
