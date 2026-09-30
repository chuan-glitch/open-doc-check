#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { scan } from '../src/checker.js';
import { textReport, markdownReport, htmlReport } from '../src/report.js';

const help = `open-doc-check <文件或目录> [选项]

检查 Markdown 链接和图片。需要 Node.js 22 或以上。
  --offline              只检查本地路径，不访问网络
  --format <格式>        text（默认）、json、markdown、html
  --output <文件>        保存报告；默认输出到终端
  --root <目录>          / 开头的本地路径相对于此目录
  --timeout <毫秒>       单个网页检查超时，默认 10000
  --concurrency <数量>   并发数，默认 8，最多 64
  --exclude <目录名>     跳过目录名，可重复
  --ignore <链接前缀>    跳过匹配的链接，可重复
  --strict               待确认的链接也使检查失败
  --help                 显示帮助
  --version              显示版本

退出码：0 无失效链接；1 发现失效（strict 时含待确认）；2 参数或运行错误。
第一版不检查锚点、原始 HTML 标签和未解析的引用链接。`;

try {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { console.log(help); process.exit(0); }
  if (args.includes('--version')) { console.log('0.1.0'); process.exit(0); }
  const options = { exclude: [], ignore: [] };
  let target;
  let format = 'text';
  let output;
  const value = (flag, index) => {
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${flag} 缺少值`);
    return args[index + 1];
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--offline') options.offline = true;
    else if (flag === '--strict') options.strict = true;
    else if (['--format', '--output', '--root', '--timeout', '--concurrency', '--exclude', '--ignore'].includes(flag)) {
      const v = value(flag, i++);
      if (flag === '--format') format = v;
      else if (flag === '--output') output = v;
      else if (flag === '--exclude') options.exclude.push(v);
      else if (flag === '--ignore') options.ignore.push(v);
      else if (flag === '--root') options.root = v;
      else {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || (flag === '--concurrency' && n > 64)) throw new Error(`${flag} 数值无效`);
        options[flag.slice(2)] = n;
      }
    } else if (flag.startsWith('-')) throw new Error(`未知选项：${flag}`);
    else if (!target) target = flag;
    else throw new Error('只能指定一个文件或目录');
  }
  if (!['text', 'json', 'markdown', 'html'].includes(format)) throw new Error(`未知报告格式：${format}`);
  const report = await scan(target ?? '.', options);
  const rendered = format === 'json' ? JSON.stringify(report, null, 2) : format === 'html' ? htmlReport(report) : format === 'markdown' ? markdownReport(report) : textReport(report);
  if (output) {
    await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
    await fs.writeFile(output, rendered + '\n', 'utf8');
    console.log(textReport({ ...report, results: [] }));
    console.log(`报告已保存：${path.resolve(output)}`);
  } else console.log(rendered);
  process.exitCode = report.summary.broken || (options.strict && report.summary.uncertain) ? 1 : 0;
} catch (error) {
  console.error(`open-doc-check：${error.message}`);
  process.exitCode = 2;
}
