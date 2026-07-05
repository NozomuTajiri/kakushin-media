#!/usr/bin/env node
// 付加価値ニュース 静的サイトジェネレーター
// 使い方: node site/build.mjs
// articles/*.md (frontmatter付き) → docs/ にHTML・RSS・sitemapを生成する
// デザイン: カクシン公式パレット(kakushin.bizから抽出)
//   ゴールド#cca433 / ネイビー#212947 / テキスト#333 / クリーム#f7f1e3 / Noto Serif JP + Noto Sans JP

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARTICLES_DIR = join(ROOT, "articles");
const OUT_DIR = join(ROOT, "docs");
const CONFIG = JSON.parse(readFileSync(join(ROOT, "site.config.json"), "utf8"));

// ---------- Markdown (制限サブセット) ----------
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

// ---------- 記事ごとのジェネレーティブアート(ブランド柄・決定的生成) ----------
function hashOf(s) {
  let h = 2166136261;
  for (const c of s) { h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; }
  return h;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function heroSvg(slug, w = 1200, h = 360) {
  const rnd = mulberry32(hashOf(slug));
  const gold = "#cca433", cream = "#f7f1e3", steel = "#4a6f96";
  let shapes = "";
  // 大きな同心円(ゴールド)
  const cx = w * (0.6 + rnd() * 0.3), cy = h * (0.2 + rnd() * 0.6);
  const base = h * (0.5 + rnd() * 0.5);
  for (let i = 0; i < 3; i++) {
    shapes += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(base + i * h * 0.28).toFixed(0)}" fill="none" stroke="${gold}" stroke-width="${(1.5 - i * 0.4).toFixed(1)}" opacity="${(0.55 - i * 0.15).toFixed(2)}"/>`;
  }
  // 満ちた小円(ゴールド/クリーム)
  const n = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const r = 3 + rnd() * 9;
    shapes += `<circle cx="${(rnd() * w).toFixed(0)}" cy="${(rnd() * h).toFixed(0)}" r="${r.toFixed(0)}" fill="${rnd() > 0.5 ? gold : cream}" opacity="${(0.25 + rnd() * 0.45).toFixed(2)}"/>`;
  }
  // 斜めの細線(スチールブルー/ゴールド)
  for (let i = 0; i < 3; i++) {
    const x1 = rnd() * w, y1 = rnd() * h;
    const len = w * (0.15 + rnd() * 0.3);
    const ang = -0.35 - rnd() * 0.3;
    shapes += `<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${(x1 + len * Math.cos(ang)).toFixed(0)}" y2="${(y1 + len * Math.sin(ang)).toFixed(0)}" stroke="${rnd() > 0.4 ? gold : steel}" stroke-width="1" opacity="${(0.3 + rnd() * 0.3).toFixed(2)}"/>`;
  }
  // 右上がりの太い弧(価値の上昇を示唆)
  const ax = w * (0.05 + rnd() * 0.15);
  shapes += `<path d="M ${ax.toFixed(0)} ${(h * 0.85).toFixed(0)} Q ${(w * 0.45).toFixed(0)} ${(h * (0.55 + rnd() * 0.2)).toFixed(0)} ${(w * 0.92).toFixed(0)} ${(h * 0.12).toFixed(0)}" fill="none" stroke="${gold}" stroke-width="2.5" opacity="0.8"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true"><defs><linearGradient id="g-${hashOf(slug) % 9999}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a2138"/><stop offset="1" stop-color="#2a3355"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g-${hashOf(slug) % 9999})"/>${shapes}</svg>`;
}

// ---------- 現状→理想ブロック ----------
function transformBlock(meta) {
  if (!meta.genjo || !meta.riso) return "";
  return `
<div class="transform" aria-label="現状と理想">
  <div class="t-box t-now"><span class="t-label">現状</span><p>${escapeHtml(meta.genjo)}</p></div>
  <div class="t-arrow" aria-hidden="true"><svg viewBox="0 0 40 40" width="34" height="34"><path d="M8 20h20m-8-8 8 8-8 8" fill="none" stroke="#cca433" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  <div class="t-box t-ideal"><span class="t-label">理想</span><p>${escapeHtml(meta.riso)}</p></div>
</div>`;
}

const chips = (tags) =>
  (tags || "")
    .split(/[、,]\s*/)
    .filter(Boolean)
    .map((t) => `<span class="chip">${escapeHtml(t)}</span>`)
    .join("");

// ---------- デザイン ----------
const CSS = `
:root{--navy:#212947;--ink:#333333;--paper:#fcfaf4;--cream:#f7f1e3;--muted:#5c5e6d;--gold:#cca433;--gold-text:#8f6f1f;--line:#e7e0d0;--maxw:46rem}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:"Noto Sans JP","Hiragino Kaku Gothic ProN",sans-serif;
  font-size:16px;line-height:2;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 1.25rem}
header.site{background:var(--navy);padding:3rem 0 1.8rem;border-bottom:3px solid var(--gold)}
.brand{font-family:"Noto Serif JP","Hiragino Mincho ProN",serif;font-size:1.9rem;font-weight:600;letter-spacing:.06em;color:#fff}
.brand a{border:none}
.brand .mark{color:var(--gold)}
.tagline{color:#b9bdcc;font-size:.85rem;margin-top:.4rem;letter-spacing:.08em}
main{padding:2.5rem 0 4rem}
footer.site{background:var(--navy);padding:2rem 0 3rem;color:#b9bdcc;font-size:.8rem;line-height:1.8}
footer.site a{color:var(--gold)}
/* index cards */
.cards{list-style:none;display:grid;grid-template-columns:1fr;gap:1.5rem}
@media(min-width:640px){.cards{grid-template-columns:1fr 1fr}}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(33,41,71,.05);transition:box-shadow .2s,transform .2s}
.card:hover{box-shadow:0 8px 22px rgba(33,41,71,.13);transform:translateY(-2px)}
.card a.card-link{display:block}
.card svg{display:block;width:100%;height:auto}
.card-body{padding:1rem 1.2rem 1.35rem}
.card-meta{display:flex;align-items:center;gap:.6rem;margin-bottom:.4rem}
.card time{font-size:.75rem;color:var(--muted);letter-spacing:.1em}
.chip{display:inline-block;font-size:.68rem;color:var(--navy);background:var(--cream);border-radius:999px;padding:.05rem .6rem;line-height:1.6}
.card h2{font-family:"Noto Serif JP","Hiragino Mincho ProN",serif;font-size:1.12rem;line-height:1.65;font-weight:600;color:var(--navy);margin:.15rem 0 .4rem}
.card:hover h2{color:var(--gold-text)}
.card p{font-size:.85rem;color:#4c4c4c;line-height:1.85;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
/* article */
.crumb{font-size:.8rem;color:var(--muted);margin-bottom:1.5rem}
.crumb a:hover{color:var(--gold-text)}
.hero{border-radius:10px;overflow:hidden;margin-bottom:2rem;line-height:0}
.hero svg{width:100%;height:auto}
article h1{font-family:"Noto Serif JP","Hiragino Mincho ProN",serif;font-size:1.75rem;line-height:1.55;font-weight:600;margin-bottom:.9rem;color:var(--navy)}
.meta{font-size:.8rem;color:var(--muted);letter-spacing:.06em;padding-bottom:1.6rem;border-bottom:1px solid var(--line);margin-bottom:2rem;display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}
article .lead{font-size:1.02rem;color:#3a3f52;background:var(--cream);border-left:3px solid var(--gold);padding:1rem 1.2rem;margin-bottom:1.8rem;line-height:2;border-radius:0 4px 4px 0}
/* 現状→理想 */
.transform{display:grid;grid-template-columns:1fr auto 1fr;gap:.8rem;align-items:stretch;margin:0 0 2.6rem}
.t-box{border-radius:8px;padding:.95rem 1.1rem;font-size:.9rem;line-height:1.85}
.t-box p{margin:0}
.t-now{background:#f1eee5;border:1px solid var(--line);color:#5a5a55}
.t-ideal{background:var(--navy);color:#f5f2ea;border-bottom:3px solid var(--gold)}
.t-label{display:block;font-size:.7rem;letter-spacing:.22em;margin-bottom:.3rem;color:var(--gold-text);font-weight:700}
.t-ideal .t-label{color:var(--gold)}
.t-arrow{align-self:center;line-height:0}
@media(max-width:560px){.transform{grid-template-columns:1fr}.t-arrow{justify-self:center;transform:rotate(90deg)}}
article h2{font-family:"Noto Serif JP","Hiragino Mincho ProN",serif;font-size:1.28rem;font-weight:600;line-height:1.6;margin:2.75rem 0 1rem;padding-left:.85rem;border-left:4px solid var(--gold);color:var(--navy)}
article h3{font-size:1.05rem;margin:2rem 0 .75rem;color:var(--navy)}
article p{margin-bottom:1.4rem;text-align:justify}
article a{color:var(--gold-text);border-bottom:1px solid currentColor}
article hr{border:none;border-top:1px solid var(--line);margin:2.5rem 0}
.source{margin-top:3rem;padding:1.1rem 1.25rem;background:var(--cream);border-radius:6px;font-size:.82rem;color:#555;line-height:1.9}
.source a{color:var(--gold-text);border-bottom:1px solid currentColor}
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@600;700&display=swap">
<style>${CSS}</style>
</head>
<body>
<header class="site"><div class="wrap">
  <div class="brand"><a href="${rel(path)}index.html">付加価値<span class="mark">ニュース</span></a></div>
  <div class="tagline">${escapeHtml(CONFIG.tagline)} ─ ${escapeHtml(CONFIG.company)}</div>
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
<div class="hero">${heroSvg(p.slug)}</div>
<h1>${escapeHtml(p.title)}</h1>
<div class="meta"><time datetime="${p.date}">${p.date.replaceAll("-", ".")}</time>${chips(p.tags)}</div>
<p class="lead">${escapeHtml(p.excerpt)}</p>
${transformBlock(p)}
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
<ul class="cards">
${posts
  .map(
    (p) => `<li class="card"><a class="card-link" href="articles/${p.slug}.html">
  ${heroSvg(p.slug, 800, 240)}
  <div class="card-body">
    <div class="card-meta"><time datetime="${p.date}">${p.date.replaceAll("-", ".")}</time>${chips(p.tags)}</div>
    <h2>${escapeHtml(p.title)}</h2>
    <p>${escapeHtml(p.excerpt)}</p>
  </div>
</a></li>`
  )
  .join("\n")}
</ul>`;
writeFileSync(
  join(OUT_DIR, "index.html"),
  page({ title: `${CONFIG.siteName} | ${CONFIG.company}`, description: CONFIG.tagline, path: "/", bodyHtml: indexBody })
);

// RSS / sitemap
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
const noTransform = posts.filter((p) => !p.genjo || !p.riso).map((p) => p.slug);
if (noTransform.length) console.log(`  (現状/理想ブロックなし: ${noTransform.join(", ")})`);
