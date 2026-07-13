#!/usr/bin/env node
import fs from 'fs';
import http from 'http';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3333;

const STATUS_META = {
  Applied:   { color: '#16a34a', bg: '#dcfce7', label: 'Applied' },
  Interview: { color: '#d97706', bg: '#fef3c7', label: 'Interview' },
  Offer:     { color: '#7c3aed', bg: '#ede9fe', label: 'Offer' },
  Responded: { color: '#0891b2', bg: '#cffafe', label: 'Responded' },
  Evaluated: { color: '#2563eb', bg: '#dbeafe', label: 'Evaluated' },
  Rejected:  { color: '#dc2626', bg: '#fee2e2', label: 'Rejected' },
  Discarded: { color: '#6b7280', bg: '#f3f4f6', label: 'Discarded' },
  SKIP:      { color: '#9ca3af', bg: '#f9fafb', label: 'Skip' },
};

function parseApplications() {
  const filePath = path.join(__dirname, 'data', 'applications.md');
  if (!fs.existsSync(filePath)) return [];

  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const apps = [];

  for (const line of lines) {
    if (!line.startsWith('|') || line.startsWith('| #') || line.startsWith('|---')) continue;
    const cols = line.split('|').map(c => c.trim()).filter((_, i) => i > 0 && i < 10);
    if (cols.length < 8) continue;

    const [num, date, company, role, score, status, pdf, report, ...notesParts] = cols;
    const notes = notesParts.join(' | ').trim();

    // Extract report path from markdown link [text](path)
    const reportMatch = report.match(/\[.*?\]\((.+?)\)/);
    const reportPath = reportMatch ? reportMatch[1] : null;

    // Normalise score: "4.3/5" -> 4.3, "—" -> null
    const scoreNum = score && score !== '—' ? parseFloat(score) : null;

    apps.push({
      num: parseInt(num) || 0,
      date: date || '',
      company: company || '',
      role: role || '',
      score: scoreNum,
      scoreRaw: score || '—',
      status: status || '',
      pdf: pdf === '✅',
      reportPath,
      notes: notes || '',
    });
  }

  return apps.sort((a, b) => b.num - a.num);
}

function scoreColor(score) {
  if (score === null) return '#9ca3af';
  if (score >= 4.5) return '#16a34a';
  if (score >= 4.0) return '#2563eb';
  if (score >= 3.5) return '#d97706';
  return '#dc2626';
}

function statusBadge(status) {
  const meta = STATUS_META[status] || { color: '#6b7280', bg: '#f3f4f6', label: status };
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:${meta.color};background:${meta.bg}">${meta.label}</span>`;
}

function computeStats(apps) {
  const total = apps.length;
  const applied = apps.filter(a => ['Applied', 'Responded', 'Interview', 'Offer'].includes(a.status)).length;
  const active = apps.filter(a => ['Responded', 'Interview', 'Offer'].includes(a.status)).length;
  const evaluated = apps.filter(a => a.status === 'Evaluated').length;
  const rejected = apps.filter(a => a.status === 'Rejected').length;
  const offers = apps.filter(a => a.status === 'Offer').length;
  return { total, applied, active, evaluated, rejected, offers };
}

function generateHTML(apps) {
  const stats = computeStats(apps);
  const now = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  const rows = apps.map(app => {
    const sc = scoreColor(app.score);
    const sb = statusBadge(app.status);
    const reportLink = app.reportPath
      ? `<a href="/report?path=${encodeURIComponent(app.reportPath)}" style="color:hsl(187,74%,32%);text-decoration:none;font-size:11px">view</a>`
      : '<span style="color:#ccc;font-size:11px">—</span>';
    const pdfIcon = app.pdf ? '✅' : '—';
    const scoreDisplay = app.score !== null
      ? `<span style="color:${sc};font-weight:700">${app.scoreRaw}</span>`
      : '<span style="color:#ccc">—</span>';

    return `<tr>
      <td style="color:#9ca3af;font-size:11px;padding:8px 10px;white-space:nowrap">${app.date}</td>
      <td style="font-weight:600;padding:8px 10px;color:#1a1a2e">${app.company}</td>
      <td style="padding:8px 10px;color:#444;font-size:12px">${app.role}</td>
      <td style="padding:8px 10px;text-align:center">${scoreDisplay}</td>
      <td style="padding:8px 10px;text-align:center">${sb}</td>
      <td style="padding:8px 10px;text-align:center;font-size:13px">${pdfIcon}</td>
      <td style="padding:8px 10px;text-align:center">${reportLink}</td>
      <td style="padding:8px 10px;color:#6b7280;font-size:11px;max-width:260px">${app.notes}</td>
    </tr>`;
  }).join('\n');

  const statCard = (label, value, color = '#1a1a2e') =>
    `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;min-width:120px;text-align:center">
      <div style="font-size:28px;font-weight:700;color:${color};font-family:'Space Grotesk',sans-serif">${value}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:2px">${label}</div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Career Pipeline</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; background: #f8fafc; color: #1a1a2e; }
  a { text-decoration: none; }
  table { width: 100%; border-collapse: collapse; }
  th { font-family: 'Space Grotesk', sans-serif; font-size: 11px; font-weight: 700; text-transform: uppercase;
       letter-spacing: 0.06em; color: hsl(187,74%,32%); padding: 10px 10px; text-align: left;
       border-bottom: 2px solid #e5e7eb; white-space: nowrap; }
  tr:hover td { background: #f0f9ff; }
  tr td { border-bottom: 1px solid #f1f5f9; }
  .header-bar { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 16px 32px;
                display: flex; align-items: center; justify-content: space-between; }
  .header-bar h1 { font-family: 'Space Grotesk', sans-serif; font-size: 20px; font-weight: 700;
                   background: linear-gradient(to right, hsl(187,74%,32%), hsl(270,70%,45%));
                   -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .refresh-btn { font-size: 12px; color: hsl(187,74%,32%); cursor: pointer; border: 1px solid hsl(187,60%,75%);
                 background: hsl(187,40%,97%); padding: 5px 12px; border-radius: 5px; font-family: 'DM Sans', sans-serif; }
  .refresh-btn:hover { background: hsl(187,40%,92%); }
  .main { max-width: 1300px; margin: 0 auto; padding: 24px 32px; }
  .stats { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
  .table-wrap { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
  .table-scroll { overflow-x: auto; }
  .footer { text-align: center; color: #9ca3af; font-size: 11px; margin-top: 20px; }
  th.sortable { cursor: pointer; user-select: none; }
  th.sortable:hover { color: hsl(187,74%,22%); }
</style>
</head>
<body>

<div class="header-bar">
  <h1>Career Pipeline</h1>
  <div style="display:flex;align-items:center;gap:12px">
    <span style="font-size:12px;color:#9ca3af">Updated ${now}</span>
    <button class="refresh-btn" onclick="location.reload()">Refresh</button>
  </div>
</div>

<div class="main">
  <div class="stats">
    ${statCard('Total', stats.total)}
    ${statCard('Applied', stats.applied, '#16a34a')}
    ${statCard('Active', stats.active, '#d97706')}
    ${statCard('Evaluated', stats.evaluated, '#2563eb')}
    ${statCard('Rejected', stats.rejected, '#dc2626')}
    ${statCard('Offers', stats.offers, '#7c3aed')}
  </div>

  <div class="table-wrap">
    <div class="table-scroll">
      <table id="pipeline-table">
        <thead>
          <tr>
            <th class="sortable" data-col="0">Date</th>
            <th class="sortable" data-col="1">Company</th>
            <th>Role</th>
            <th class="sortable" data-col="3" style="text-align:center">Score</th>
            <th class="sortable" data-col="4" style="text-align:center">Status</th>
            <th style="text-align:center">PDF</th>
            <th style="text-align:center">Report</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  </div>

  <div class="footer">career-ops dashboard &middot; <a href="/" style="color:hsl(187,74%,32%)">refresh</a></div>
</div>

<script>
  // Simple column sort
  document.querySelectorAll('th.sortable').forEach(th => {
    let asc = false;
    th.addEventListener('click', () => {
      const col = parseInt(th.dataset.col);
      const tbody = document.querySelector('#pipeline-table tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {
        const va = a.cells[col]?.textContent.trim() ?? '';
        const vb = b.cells[col]?.textContent.trim() ?? '';
        const na = parseFloat(va), nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb)) return asc ? na - nb : nb - na;
        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
      rows.forEach(r => tbody.appendChild(r));
      asc = !asc;
    });
  });
</script>
</body>
</html>`;
}

function generateReportHTML(reportPath) {
  const abs = path.resolve(path.join(__dirname, 'data'), reportPath);
  if (!fs.existsSync(abs)) {
    return `<html><body style="font-family:sans-serif;padding:40px;color:#333"><h2>Report not found</h2><p>${reportPath}</p><a href="/">← Back</a></body></html>`;
  }

  const md = fs.readFileSync(abs, 'utf8');
  // Very simple markdown: headers, bold, bullets, paragraphs
  const html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^\*\*(.+?)\*\*/gm, '<strong>$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[hul])/gm, '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Report</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; background: #f8fafc; color: #1a1a2e; }
  .topbar { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 14px 32px; display: flex; align-items: center; gap: 16px; }
  .topbar a { color: hsl(187,74%,32%); font-size: 13px; }
  .topbar span { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 15px; }
  .content { max-width: 800px; margin: 32px auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 32px 40px; }
  h2 { font-family: 'Space Grotesk', sans-serif; font-size: 14px; font-weight: 700; text-transform: uppercase;
       letter-spacing: 0.06em; color: hsl(187,74%,32%); border-bottom: 1.5px solid #e5e7eb; padding-bottom: 4px;
       margin: 20px 0 8px; }
  h3 { font-size: 13px; font-weight: 600; color: #333; margin: 14px 0 6px; }
  p { font-size: 13px; line-height: 1.6; color: #444; margin: 6px 0; }
  ul { padding-left: 20px; margin: 6px 0; }
  li { font-size: 13px; line-height: 1.7; color: #444; }
  strong { font-weight: 600; color: #222; }
</style>
</head>
<body>
<div class="topbar">
  <a href="/">← Pipeline</a>
  <span>${path.basename(abs, '.md')}</span>
</div>
<div class="content">${html}</div>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/report') {
    const reportPath = url.searchParams.get('path') || '';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(generateReportHTML(reportPath));
    return;
  }

  const apps = parseApplications();
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(generateHTML(apps));
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Dashboard running at ${url}`);
  try {
    const open = process.platform === 'darwin' ? 'open'
               : process.platform === 'win32' ? 'start'
               : 'xdg-open';
    execSync(`${open} ${url}`);
  } catch {}
});
