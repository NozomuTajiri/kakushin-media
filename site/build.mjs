#!/usr/bin/env node
// 付加価値ニュース 静的サイトジェネレーター
// 使い方: node site/build.mjs  (kakushin-media/ どこから実行してもよい)
// articles/*.md (frontmatter付き) → docs/ にHTML・RSS・sitemapを生成する

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARTICLES_DIR = join(ROOT, "articles");
const OUT_DIR = join(ROOT, "docs");
const CONFIG = JSON.parse(readFileSync(join(ROOT, "site.config.json"), "utf8"));

// ---------- Markdown (制限サブセット: 見出し/段落/太字/リンク/区切り線) ----------
const escapeHtml = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function inline(text) {
  let t = escapeHtml(text);
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
  return t;
}

function mdToHtml(md) {
  const blocks = md.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((b) => {
      if (b.startsWith("### ")) return `<h3>${inline(b.slice(4))}</h3>`;
      if (b.startsWith("## ")) return `<h2>${inline(b.slice(3))}</h2>`;
      if (b === "---") return "<hr>";
      return `<p>${inline(b).replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error("frontmatterがありません");
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2].trim() };
}

// ---------- デザイン ----------
const CSS = `
:root{--ink:#1c1c1c;--paper:#faf9f7;--muted:#767068;--accent:#b7282e;--line:#e5e1da;--maxw:42rem}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic",sans-serif;
  font-size:16px;line-height:2;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 1.25rem}
header.site{padding:3.5rem 0 2rem;border-bottom:1px solid var(--line)}
.brand{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:1.9rem;font-weight:600;letter-spacing:.06em}
.brand a{border:none}
.brand .mark{color:var(--accent)}
.tagline{color:var(--muted);font-size:.85rem;margin-top:.4rem;letter-spacing:.08em}
main{padding:2.5rem 0 4rem}
footer.site{border-top:1px solid var(--line);padding:2rem 0 3rem;color:var(--muted);font-size:.8rem;line-height:1.8}
footer.site a{color:var(--accent)}
/* index */
.post-list{list-style:none}
.post-list li{padding:1.75rem 0;border-bottom:1px solid var(--line)}
.post-list time{font-size:.78rem;color:var(--muted);letter-spacing:.1em}
.post-list h2{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:1.35rem;line-height:1.6;margin:.35rem 0 .5rem;font-weight:600}
.post-list h2 a:hover{color:var(--accent)}
.post-list p{font-size:.9rem;color:#444;line-height:1.9}
/* article */
.crumb{font-size:.8rem;color:var(--muted);margin-bottom:2rem}
.crumb a:hover{color:var(--accent)}
article h1{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:1.75rem;line-height:1.55;font-weight:600;margin-bottom:.9rem}
.meta{font-size:.8rem;color:var(--muted);letter-spacing:.06em;padding-bottom:1.75rem;border-bottom:1px solid var(--line);margin-bottom:2.25rem}
article .lead{font-size:1.02rem;color:#3a3a3a;border-left:3px solid var(--accent);padding:.2rem 0 .2rem 1.1rem;margin-bottom:2.5rem;line-height:2}
article h2{font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-size:1.28rem;font-weight:600;line-height:1.6;margin:2.75rem 0 1rem;padding-left:.85rem;border-left:4px solid var(--accent)}
article h3{font-size:1.05rem;margin:2rem 0 .75rem}
article p{margin-bottom:1.4rem;text-align:justify}
article a{color:var(--accent);border-bottom:1px solid currentColor}
article hr{border:none;border-top:1px solid var(--line);margin:2.5rem 0}
.source{margin-top:3rem;padding:1.1rem 1.25rem;background:#f1efe9;border-radius:4px;font-size:.82rem;color:#555;line-height:1.9}
.source a{color:var(--accent);border-bottom:1px solid currentColor}
.credit{margin-top:2.5rem;font-size:.82rem;color:var(--muted);line-height:1.9}
@media(max-width:480px){.brand{font-size:1.5rem}article h1{font-size:1.45rem}}
`.trim();

const page = ({ title, description, path, bodyHtml, jsonLd }) => `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
${CONFIG.baseUrl ? `<link rel="canonical" href="${CONFIG.baseUrl}${path}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${CONFIG.baseUrl}${path}">` : ""}
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
<style>${CSS}</style>
</head>
<body>
<header class="site"><div class="wrap">
  <div class="brand"><a href="${rel(path)}index.html">付加価値<span class="mark">ニュース</span></a></div>
  <div class="tagline">${escapeHtml(CONFIG.tagline)}</div>
</div></header>
<main><div class="wrap">
${bodyHtml}
</div></main>
<footer class="site"><div class="wrap">
  運営: <a href="${CONFIG.companyUrl}" rel="noopener">${escapeHtml(CONFIG.company)}</a> ─
  世界のニュースを付加価値経営の視点で毎日解説しています。<br>
  &copy; ${new Date().getFullYear()} ${escapeHtml(CONFIG.company)}
</div></footer>
</body>
</html>`;

// 記事ページは docs/articles/ 配下なのでトップへの相対パスを返す
function rel(path) {
  return path.startsWith("/articles/") ? "../" : "./";
}

// ---------- ビルド ----------
if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(join(OUT_DIR, "articles"), { recursive: true });

const files = readdirSync(ARTICLES_DIR).filter((f) => f.endsWith(".md")).sort().reverse();
const posts = [];

for (const f of files) {
  const { meta, body } = parseFrontmatter(readFileSync(join(ARTICLES_DIR, f), "utf8"));
  for (const k of ["title", "date", "slug", "excerpt"]) {
    if (!meta[k]) throw new Error(`${f}: frontmatterに ${k} がありません`);
  }
  posts.push({ ...meta, body, htmlPath: `/articles/${meta.slug}.html` });
}

for (const p of posts) {
  const bodyHtml = `
<div class="crumb"><a href="../index.html">← 付加価値ニュース 一覧</a></div>
<article>
<h1>${escapeHtml(p.title)}</h1>
<div class="meta"><time datetime="${p.date}">${p.date.replaceAll("-", ".")}</time>${p.tags ? ` ｜ ${escapeHtml(p.tags)}` : ""}</div>
<p class="lead">${escapeHtml(p.excerpt)}</p>
${mdToHtml(p.body)}
${p.source_name ? `<div class="source">参考: <a href="${p.source_url}" rel="noopener">${escapeHtml(p.source_name)}</a></div>` : ""}
<div class="credit">本記事は、${escapeHtml(CONFIG.company)}が提唱する付加価値経営の視点でニュースを解説するものです。</div>
</article>`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: p.title,
    datePublished: p.date,
    description: p.excerpt,
    author: { "@type": "Organization", name: CONFIG.company, url: CONFIG.companyUrl },
    publisher: { "@type": "Organization", name: CONFIG.company, url: CONFIG.companyUrl },
  };
  writeFileSync(
    join(OUT_DIR, "articles", `${p.slug}.html`),
    page({ title: `${p.title} | ${CONFIG.siteName}`, description: p.excerpt, path: p.htmlPath, bodyHtml, jsonLd })
  );
}

const indexBody = `
<ul class="post-list">
${posts
  .map(
    (p) => `<li>
  <time datetime="${p.date}">${p.date.replaceAll("-", ".")}</time>
  <h2><a href="articles/${p.slug}.html">${escapeHtml(p.title)}</a></h2>
  <p>${escapeHtml(p.excerpt)}</p>
</li>`
  )
  .join("\n")}
</ul>`;
writeFileSync(
  join(OUT_DIR, "index.html"),
  page({ title: `${CONFIG.siteName} | ${CONFIG.company}`, description: CONFIG.tagline, path: "/", bodyHtml: indexBody })
);

// RSS / sitemap は baseUrl 設定後に生成される
if (CONFIG.baseUrl) {
  const items = posts
    .slice(0, 20)
    .map(
      (p) => `<item><title>${escapeHtml(p.title)}</title><link>${CONFIG.baseUrl}${p.htmlPath}</link>
<guid>${CONFIG.baseUrl}${p.htmlPath}</guid><pubDate>${new Date(p.date + "T06:40:00+09:00").toUTCString()}</pubDate>
<description>${escapeHtml(p.excerpt)}</description></item>`
    )
    .join("\n");
  writeFileSync(
    join(OUT_DIR, "feed.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeHtml(CONFIG.siteName)}</title><link>${CONFIG.baseUrl}/</link><description>${escapeHtml(CONFIG.tagline)}</description>${items}</channel></rss>`
  );
  writeFileSync(
    join(OUT_DIR, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${CONFIG.baseUrl}/</loc></url>${posts.map((p) => `<url><loc>${CONFIG.baseUrl}${p.htmlPath}</loc><lastmod>${p.date}</lastmod></url>`).join("")}</urlset>`
  );
}
writeFileSync(join(OUT_DIR, ".nojekyll"), "");
if (CONFIG.customDomain) writeFileSync(join(OUT_DIR, "CNAME"), CONFIG.customDomain + "\n");

console.log(`✔ built ${posts.length} article(s) -> ${OUT_DIR}`);
if (!CONFIG.baseUrl) console.log("  (baseUrl未設定のため feed.xml / sitemap.xml はスキップ)");
