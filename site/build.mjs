#!/usr/bin/env node
// 付加価値ニュース 静的サイトジェネレーター
// 使い方: node site/build.mjs
// articles/*.md (frontmatter付き) → docs/ にHTML・RSS・sitemapを生成する
// デザイン: カクシン公式パレット(kakushin.bizから抽出)
//   ゴールド#cca433 / ネイビー#212947 / テキスト#333 / クリーム#f7f1e3 / Noto Serif JP + Noto Sans JP

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, cpSync } from "node:fs";
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
  t = t.replace(/\[([^\]]+)\]\(((?:\.\.\/|\.\/)?[\w./-]+\.html)\)/g, '<a href="$2">$1</a>');
  return t;
}

function mdToHtml(md, meta = {}) {
  const blocks = md.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((b) => {
      if (b === "{{chart}}") return meta.chart ? renderChart(meta.chart) : "";
      if (b === "{{vs}}") return meta.vs ? renderVs(meta.vs) : "";
      if (b === "{{flow}}") return meta.flow ? renderFlow(meta.flow) : "";
      if (b === "{{kando}}") return meta.kando ? renderKando(meta.kando) : "";
      if (b.startsWith("### ")) return `<h3>${inline(b.slice(4))}</h3>`;
      if (b.startsWith("## ")) return `<h2>${inline(b.slice(3))}</h2>`;
      if (b === "---") return "<hr>";
      return `<p>${inline(b).replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

// ---------- 記事内ビジュアル(グラフ/対比図/変換フロー) ----------
function renderChart(json) {
  let c;
  try { c = JSON.parse(json); } catch { return ""; }
  const labels = c.labels || [];
  const values = (c.values || []).map(Number);
  if (!labels.length || labels.length !== values.length) return "";
  const max = Math.max(...values);
  const W = 640, H = 300, padL = 20, padB = 46, padT = 40;
  const bw = (W - padL * 2) / labels.length;
  let bars = "";
  values.forEach((v, i) => {
    const h = Math.max(4, (v / max) * (H - padT - padB));
    const x = padL + i * bw + bw * 0.18;
    const y = H - padB - h;
    const cx = padL + i * bw + bw / 2;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="#cca433"/>
<text x="${cx.toFixed(1)}" y="${(y - 9).toFixed(1)}" text-anchor="middle" font-size="15" font-weight="700" fill="#212947">${v.toLocaleString("ja-JP")}</text>
<text x="${cx.toFixed(1)}" y="${H - padB + 26}" text-anchor="middle" font-size="14" fill="#5c5e6d">${escapeHtml(labels[i])}</text>`;
  });
  return `<figure class="viz">
<figcaption class="viz-title">${escapeHtml(c.title || "")}${c.unit ? `<span class="viz-unit">(${escapeHtml(c.unit)})</span>` : ""}</figcaption>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(c.title || "グラフ")}">
<line x1="${padL}" y1="${H - padB}" x2="${W - padL}" y2="${H - padB}" stroke="#e7e0d0" stroke-width="1.5"/>
${bars}
</svg>
${c.source ? `<div class="viz-source">出典: ${escapeHtml(c.source)}</div>` : ""}
</figure>`;
}

function renderVs(spec) {
  const rows = spec.split(" / ").map((r) => r.split("|").map((s) => s.trim()));
  if (rows.length < 2 || rows[0].length < 2) return "";
  const [heads, ...body] = rows;
  const col = (i) => body.map((r) => `<li>${escapeHtml(r[i] || "")}</li>`).join("");
  return `<div class="vs">
<div class="vs-col vs-a"><div class="vs-head">${escapeHtml(heads[0])}</div><ul>${col(0)}</ul></div>
<div class="vs-col vs-b"><div class="vs-head">${escapeHtml(heads[1])}</div><ul>${col(1)}</ul></div>
</div>`;
}

// 感動価値ブロック: 事例に感動価値が見出せる時だけ使う(編集方針参照)
function renderKando(text) {
  return `<div class="kando">
<div class="kando-label"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2l2.4 6.2L21 9.3l-5 4.4 1.5 6.6L12 16.8 6.5 20.3 8 13.7 3 9.3l6.6-1.1z" fill="#cca433"/></svg>この事例の感動価値</div>
<p>${escapeHtml(text)}</p>
</div>`;
}

function renderFlow(spec) {
  const steps = spec.split(" / ").map((s) => s.split("|").map((x) => x.trim()));
  if (steps.length < 2) return "";
  const arrow = `<div class="flow-arrow" aria-hidden="true"><svg viewBox="0 0 40 40" width="26" height="26"><path d="M8 20h20m-8-8 8 8-8 8" fill="none" stroke="#cca433" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
  return `<div class="flow">${steps
    .map(
      (s, i) =>
        `${i ? arrow : ""}<div class="flow-step"><div class="flow-name">${escapeHtml(s[0])}</div>${s[1] ? `<div class="flow-desc">${escapeHtml(s[1])}</div>` : ""}</div>`
    )
    .join("")}</div>`;
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

// ---------- ヒーロー画像(assets/<slug>.jpg があれば使用、なければブランドアートSVG) ----------
const ASSETS_DIR = join(ROOT, "assets");
function assetVersion(slug) {
  // 内容ハッシュでキャッシュバスト(差し替え時に旧キャッシュが残らないように)
  const buf = readFileSync(join(ASSETS_DIR, `${slug}.jpg`));
  return hashOf(buf.subarray(0, 4096).toString("latin1")).toString(36);
}
function heroFor(slug, prefix, w, h) {
  if (existsSync(join(ASSETS_DIR, `${slug}.jpg`))) {
    return `<img src="${prefix}assets/${slug}.jpg?v=${assetVersion(slug)}" alt="" loading="lazy">`;
  }
  return heroSvg(slug, w, h);
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
/* category nav */
.catnav{display:flex;flex-wrap:wrap;gap:.45rem;margin:0 0 2rem}
.catnav a{font-size:.78rem;padding:.2rem .8rem;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--muted);line-height:1.7}
.catnav a:hover{border-color:var(--gold);color:var(--gold-text)}
.catnav a.active{background:var(--navy);color:var(--gold);border-color:var(--navy)}
.catnav .cnt{font-size:.68rem;margin-left:.3rem;opacity:.75}
.page-title{font-family:"Noto Serif JP","Hiragino Mincho ProN",serif;font-size:1.3rem;color:var(--navy);margin:0 0 1.5rem;font-weight:600}
.chip-cat{background:var(--navy);color:var(--gold)}
/* archive */
.archive h2{font-family:"Noto Serif JP","Hiragino Mincho ProN",serif;font-size:1.1rem;color:var(--navy);margin:2rem 0 .8rem;font-weight:600}
.archive ul{list-style:none}
.archive li{padding:.5rem 0;border-bottom:1px dashed var(--line);font-size:.9rem;display:flex;gap:.8rem;align-items:baseline;flex-wrap:wrap}
.archive time{color:var(--muted);font-size:.78rem;letter-spacing:.05em;flex-shrink:0}
.archive a:hover{color:var(--gold-text)}
.archive .a-cat{font-size:.72rem;color:var(--muted)}
/* index cards */
.cards{list-style:none;display:grid;grid-template-columns:1fr;gap:1.5rem}
@media(min-width:640px){.cards{grid-template-columns:1fr 1fr}}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(33,41,71,.05);transition:box-shadow .2s,transform .2s}
.card:hover{box-shadow:0 8px 22px rgba(33,41,71,.13);transform:translateY(-2px)}
.card a.card-link{display:block}
.card svg{display:block;width:100%;height:auto}
.card img{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover}
.card-body{padding:1rem 1.2rem 1.35rem}
.card-meta{display:flex;align-items:center;gap:.6rem;margin-bottom:.4rem}
.card time{font-size:.75rem;color:var(--muted);letter-spacing:.1em}
.chip{display:inline-block;font-size:.68rem;color:var(--navy);background:var(--cream);border-radius:999px;padding:.05rem .6rem;line-height:1.6;white-space:nowrap}
.card-meta{flex-wrap:wrap}
.card h2{font-family:"Noto Serif JP","Hiragino Mincho ProN",serif;font-size:1.12rem;line-height:1.65;font-weight:600;color:var(--navy);margin:.15rem 0 .4rem}
.card:hover h2{color:var(--gold-text)}
.card p{font-size:.85rem;color:#4c4c4c;line-height:1.85;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
/* article */
.crumb{font-size:.8rem;color:var(--muted);margin-bottom:1.5rem}
.crumb a:hover{color:var(--gold-text)}
.hero{border-radius:10px;overflow:hidden;margin-bottom:2rem;line-height:0}
.hero svg{width:100%;height:auto}
.hero img{display:block;width:100%;height:auto;aspect-ratio:21/9;object-fit:cover}
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
/* 関連記事 */
.related{margin-top:3rem;padding-top:2rem;border-top:1px solid var(--line)}
.related h2{font-family:"Noto Serif JP","Hiragino Mincho ProN",serif;font-size:1.15rem;color:var(--navy);margin-bottom:1.2rem;font-weight:600}
.rel-list{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:1rem}
@media(max-width:560px){.rel-list{grid-template-columns:1fr}}
.rel-list li{background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden;transition:box-shadow .2s}
.rel-list li:hover{box-shadow:0 6px 16px rgba(33,41,71,.12)}
.rel-list a{display:block}
.rel-list img,.rel-list svg{display:block;width:100%;height:auto;aspect-ratio:21/9;object-fit:cover}
.rel-t{display:block;font-size:.88rem;font-weight:600;color:var(--navy);line-height:1.6;padding:.6rem .8rem .1rem}
.rel-d{display:block;font-size:.72rem;color:var(--muted);padding:0 .8rem .7rem}
/* 用語集 */
.term-reading{font-size:.85rem;color:var(--muted);margin-left:.7rem;font-weight:400}
.term-related{margin-top:2.5rem;display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
.tr-label{font-size:.78rem;color:var(--muted);letter-spacing:.1em}
.term-related a{font-size:.8rem;padding:.15rem .7rem;border:1px solid var(--gold);border-radius:999px;color:var(--gold-text)}
.term-articles{margin-top:2.5rem;background:#fff;border:1px solid var(--line);border-radius:10px;padding:1.2rem 1.4rem}
.term-articles h2{font-size:1rem;border:none;padding:0;margin:0 0 .8rem;color:var(--navy)}
.term-articles ul{list-style:none}
.term-articles li{padding:.4rem 0;border-bottom:1px dashed var(--line);font-size:.88rem;display:flex;gap:.7rem;align-items:baseline}
.term-articles li:last-child{border:none}
.term-articles time{font-size:.75rem;color:var(--muted);flex-shrink:0}
.term-articles a:hover{color:var(--gold-text)}
.term-list{list-style:none}
.term-list li{border-bottom:1px solid var(--line)}
.term-list a{display:block;padding:1rem .2rem}
.term-list a:hover .tl-term{color:var(--gold-text)}
.tl-term{display:block;font-family:"Noto Serif JP","Hiragino Mincho ProN",serif;font-weight:600;color:var(--navy);font-size:1.05rem}
.tl-def{display:block;font-size:.85rem;color:#555;line-height:1.9;margin-top:.2rem}
/* 事例データベース */
.db-controls{display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.8rem}
#db-q{flex:1;min-width:220px;padding:.5rem .9rem;border:1px solid var(--line);border-radius:8px;font-size:.9rem;background:#fff}
#db-cat{padding:.5rem .7rem;border:1px solid var(--line);border-radius:8px;font-size:.9rem;background:#fff}
.db-count{font-size:.78rem;color:var(--muted);margin-bottom:.6rem}
.db-list{list-style:none}
.db-list li{padding:.55rem 0;border-bottom:1px dashed var(--line);font-size:.9rem;display:flex;gap:.7rem;align-items:baseline;flex-wrap:wrap}
.db-list time{font-size:.75rem;color:var(--muted);flex-shrink:0}
.db-list a{font-weight:500;color:var(--navy)}
.db-list a:hover{color:var(--gold-text)}
.db-co{font-size:.78rem;color:var(--muted)}
/* カテゴリ導入文 */
.cat-intro{font-size:.92rem;color:#4a4f60;background:var(--cream);border-radius:8px;padding:.9rem 1.2rem;margin:-.5rem 0 1.8rem;line-height:1.95}
/* 記事内ビジュアル */
.viz{margin:2.2rem 0;padding:1.4rem 1.4rem 1.1rem;background:#fff;border:1px solid var(--line);border-radius:10px}
.viz-title{font-size:.92rem;font-weight:700;color:var(--navy);margin-bottom:.9rem}
.viz-unit{font-weight:400;color:var(--muted);font-size:.8rem;margin-left:.4rem}
.viz svg{width:100%;height:auto;display:block}
.viz-source{font-size:.75rem;color:var(--muted);margin-top:.5rem;text-align:right}
.vs{display:grid;grid-template-columns:1fr 1fr;gap:.9rem;margin:2.2rem 0}
.vs-col{border-radius:8px;overflow:hidden;border:1px solid var(--line);background:#fff}
.vs-head{padding:.55rem 1rem;font-weight:700;font-size:.92rem;text-align:center}
.vs-a .vs-head{background:#f1eee5;color:#5a5a55}
.vs-b{border-color:var(--navy)}
.vs-b .vs-head{background:var(--navy);color:var(--gold)}
.vs ul{list-style:none;padding:.7rem 1rem;margin:0}
.vs li{font-size:.86rem;line-height:1.8;padding:.35rem 0;border-bottom:1px dashed var(--line)}
.vs li:last-child{border-bottom:none}
.flow{display:flex;align-items:stretch;gap:.5rem;margin:2.2rem 0;flex-wrap:wrap}
.flow-step{flex:1;min-width:130px;background:var(--cream);border:1px solid var(--line);border-radius:8px;padding:.8rem .9rem;text-align:center}
.flow-name{font-weight:700;color:var(--navy);font-size:.95rem}
.flow-desc{font-size:.78rem;color:var(--muted);line-height:1.7;margin-top:.25rem}
.flow-arrow{align-self:center}
@media(max-width:560px){.vs{grid-template-columns:1fr}.flow{flex-direction:column}.flow-arrow{transform:rotate(90deg);align-self:center}}
.kando{margin:2.2rem 0;padding:1.2rem 1.4rem;background:linear-gradient(135deg,#fdf9ee,#f7f1e3);border:1px solid var(--gold);border-left:5px solid var(--gold);border-radius:8px}
.kando-label{display:flex;align-items:center;gap:.45rem;font-weight:700;font-size:.88rem;color:var(--navy);letter-spacing:.08em;margin-bottom:.45rem}
.kando p{margin:0;font-size:.95rem;line-height:2;color:#3a3f52}
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
<meta property="og:url" content="${CONFIG.baseUrl}${path}">
${path.startsWith("/articles/") && existsSync(join(ROOT, "assets", path.replace("/articles/", "").replace(".html", "") + ".jpg")) ? `<meta property="og:image" content="${CONFIG.baseUrl}/assets/${path.replace("/articles/", "").replace(".html", "")}.jpg">` : ""}` : ""}
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%23212947'/%3E%3Ctext x='50' y='72' font-size='58' text-anchor='middle' fill='%23cca433' font-family='serif' font-weight='bold'%3E価%3C/text%3E%3C/svg%3E">
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
  世界のニュースを付加価値経営の視点で毎日解説しています。
  <a href="${rel(path)}about.html">このメディアについて・編集方針</a><br>
  &copy; ${new Date().getFullYear()} ${escapeHtml(CONFIG.company)}
</div></footer>
</body>
</html>`;

function rel(path) {
  return path.startsWith("/articles/") || path.startsWith("/category/") ? "../" : "./";
}

// ---------- カテゴリ ----------
const CATEGORY_SLUGS = {
  "製造業・B2B": "seizo",
  "消費財・食品": "shohizai",
  "小売・流通": "kouri",
  "外食・サービス": "gaishoku",
  "IT・SaaS": "it-saas",
  "エンタメ・レジャー": "entertainment",
  "金融・インフラ": "finance-infra",
  "海外事例": "global",
  "サービス業": "services",
  "マクロ・調査": "macro",
};
const catSlug = (name) => CATEGORY_SLUGS[name] || "cat-" + hashOf(name).toString(36).slice(0, 6);

function navHtml(prefix, activeCat, cats) {
  const chips = [...cats.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(
      ([name, n]) =>
        `<a href="${prefix}category/${catSlug(name)}.html"${name === activeCat ? ' class="active"' : ""}>${escapeHtml(name)}<span class="cnt">${n}</span></a>`
    )
    .join("");
  return `<nav class="catnav"><a href="${prefix}index.html"${activeCat === null ? ' class="active"' : ""}>最新</a>${chips}<a href="${prefix}database.html"${activeCat === "__db" ? ' class="active"' : ""}>事例データベース</a><a href="${prefix}terms/index.html"${activeCat === "__terms" ? ' class="active"' : ""}>用語集</a><a href="${prefix}guides/index.html"${activeCat === "__guides" ? ' class="active"' : ""}>実践ガイド</a><a href="${prefix}archive.html"${activeCat === "__archive" ? ' class="active"' : ""}>全記事一覧</a></nav>`;
}

function cardHtml(p, prefix) {
  return `<li class="card"><a class="card-link" href="${prefix}articles/${p.slug}.html">
  ${heroFor(p.slug, prefix, 800, 240)}
  <div class="card-body">
    <div class="card-meta"><time datetime="${p.date}">${p.date.replaceAll("-", ".")}</time>${p.category ? `<span class="chip chip-cat">${escapeHtml(p.category)}</span>` : ""}${chips(p.tags)}</div>
    <h2>${escapeHtml(p.title)}</h2>
    <p>${escapeHtml(p.excerpt)}</p>
  </div>
</a></li>`;
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
  // 関連記事(同カテゴリ+タグ一致でスコアリング)
  const pTags = (p.tags || "").split(/[、,]\s*/).filter(Boolean);
  const related = posts
    .filter((q) => q.slug !== p.slug)
    .map((q) => {
      const qTags = (q.tags || "").split(/[、,]\s*/);
      const overlap = pTags.filter((t) => qTags.includes(t)).length;
      return { q, score: (q.category === p.category ? 2 : 0) + overlap };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (a.q.date < b.q.date ? 1 : -1))
    .slice(0, 4)
    .map((r) => r.q);

  const bodyHtml = `
<div class="crumb"><a href="../index.html">ホーム</a> › ${p.category ? `<a href="../category/${catSlug(p.category)}.html">${escapeHtml(p.category)}</a>` : `<a href="../index.html">一覧</a>`}</div>
<article>
<div class="hero">${heroFor(p.slug, "../", 1200, 360)}</div>
<h1>${escapeHtml(p.title)}</h1>
<div class="meta"><time datetime="${p.date}">${p.date.replaceAll("-", ".")}</time>${p.category ? `<span class="chip chip-cat">${escapeHtml(p.category)}</span>` : ""}${chips(p.tags)}</div>
<p class="lead">${escapeHtml(p.excerpt)}</p>
${transformBlock(p)}
${mdToHtml(p.body, p)}
${p.source_name ? `<div class="source">参考: <a href="${p.source_url}" rel="noopener">${escapeHtml(p.source_name)}</a></div>` : ""}
<div class="credit">本記事は、${escapeHtml(CONFIG.company)}が提唱する付加価値経営の視点でニュースを解説するものです。<a href="../about.html">編集方針</a></div>
</article>
${related.length ? `<div class="related"><h2>関連記事</h2><ul class="rel-list">${related
    .map(
      (q) => `<li><a href="${q.slug}.html">${heroFor(q.slug, "../", 800, 240)}<span class="rel-t">${escapeHtml(q.title)}</span><span class="rel-d">${q.date.replaceAll("-", ".")}${q.category ? ` ｜ ${escapeHtml(q.category)}` : ""}</span></a></li>`
    )
    .join("")}</ul></div>` : ""}`;

  const hasImg = existsSync(join(ASSETS_DIR, `${p.slug}.jpg`));
  const newsLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: p.title,
    datePublished: p.date,
    dateModified: p.date,
    description: p.excerpt,
    ...(CONFIG.baseUrl ? { mainEntityOfPage: `${CONFIG.baseUrl}${p.htmlPath}` } : {}),
    ...(CONFIG.baseUrl && hasImg ? { image: [`${CONFIG.baseUrl}/assets/${p.slug}.jpg`] } : {}),
    author: { "@type": "Organization", name: CONFIG.company, url: CONFIG.baseUrl ? `${CONFIG.baseUrl}/about.html` : CONFIG.companyUrl },
    publisher: { "@type": "Organization", name: CONFIG.company, url: CONFIG.companyUrl },
  };
  const breadcrumbLd = CONFIG.baseUrl
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "ホーム", item: `${CONFIG.baseUrl}/` },
          ...(p.category ? [{ "@type": "ListItem", position: 2, name: p.category, item: `${CONFIG.baseUrl}/category/${catSlug(p.category)}.html` }] : []),
          { "@type": "ListItem", position: p.category ? 3 : 2, name: p.title },
        ],
      }
    : null;
  writeFileSync(
    join(OUT_DIR, "articles", `${p.slug}.html`),
    page({ title: `${p.title} | ${CONFIG.siteName}`, description: p.excerpt, path: p.htmlPath, bodyHtml, jsonLd: breadcrumbLd ? [newsLd, breadcrumbLd] : newsLd })
  );
}

// カテゴリ集計
const cats = new Map();
for (const p of posts) if (p.category) cats.set(p.category, (cats.get(p.category) || 0) + 1);

// トップ: カテゴリナビ + 最新24件
const INDEX_LIMIT = 24;
writeFileSync(
  join(OUT_DIR, "index.html"),
  page({
    title: `${CONFIG.siteName} | ${CONFIG.company}`,
    description: CONFIG.tagline,
    path: "/",
    bodyHtml: `${navHtml("./", null, cats)}
<ul class="cards">
${posts.slice(0, INDEX_LIMIT).map((p) => cardHtml(p, "")).join("\n")}
</ul>`,
  })
);

// カテゴリページ(ハブ)
const INTROS_PATH = join(ROOT, "prompts", "category-intros.json");
const catIntros = existsSync(INTROS_PATH) ? JSON.parse(readFileSync(INTROS_PATH, "utf8")) : {};
mkdirSync(join(OUT_DIR, "category"), { recursive: true });
for (const [name, n] of cats) {
  const list = posts.filter((p) => p.category === name);
  writeFileSync(
    join(OUT_DIR, "category", `${catSlug(name)}.html`),
    page({
      title: `${name}の付加価値経営 記事一覧 | ${CONFIG.siteName}`,
      description: catIntros[name] || `${name}に関する付加価値経営の解説記事(${n}件)`,
      path: `/category/${catSlug(name)}.html`,
      bodyHtml: `${navHtml("../", name, cats)}
<h1 class="page-title">${escapeHtml(name)} <span style="font-size:.8rem;color:var(--muted)">${n}件</span></h1>
${catIntros[name] ? `<p class="cat-intro">${escapeHtml(catIntros[name])}</p>` : ""}
<ul class="cards">
${list.map((p) => cardHtml(p, "../")).join("\n")}
</ul>`,
    })
  );
}

// 全記事一覧(アーカイブ・軽量)
const byMonth = new Map();
for (const p of posts) {
  const m = p.date.slice(0, 7);
  if (!byMonth.has(m)) byMonth.set(m, []);
  byMonth.get(m).push(p);
}
writeFileSync(
  join(OUT_DIR, "archive.html"),
  page({
    title: `全記事一覧 | ${CONFIG.siteName}`,
    description: `${CONFIG.siteName}の全${posts.length}記事の一覧`,
    path: "/archive.html",
    bodyHtml: `${navHtml("./", "__archive", cats)}
<h1 class="page-title">全記事一覧 <span style="font-size:.8rem;color:var(--muted)">${posts.length}件</span></h1>
<div class="archive">
${[...byMonth.entries()]
  .map(
    ([m, list]) => `<h2>${m.replace("-", "年")}月</h2>
<ul>
${list.map((p) => `<li><time datetime="${p.date}">${p.date.replaceAll("-", ".")}</time><a href="articles/${p.slug}.html">${escapeHtml(p.title)}</a>${p.category ? `<span class="a-cat">${escapeHtml(p.category)}</span>` : ""}</li>`).join("\n")}
</ul>`
  )
  .join("\n")}
</div>`,
  })
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
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${CONFIG.baseUrl}/</loc></url><url><loc>${CONFIG.baseUrl}/archive.html</loc></url>${[...cats.keys()].map((c) => `<url><loc>${CONFIG.baseUrl}/category/${catSlug(c)}.html</loc></url>`).join("")}${posts.map((p) => `<url><loc>${CONFIG.baseUrl}${p.htmlPath}</loc><lastmod>${p.date}</lastmod></url>`).join("")}</urlset>`
  );
}
// ---------- 用語集 ----------
const TERMS_DIR = join(ROOT, "terms");
const terms = [];
if (existsSync(TERMS_DIR)) {
  for (const f of readdirSync(TERMS_DIR).filter((x) => x.endsWith(".md")).sort()) {
    const { meta, body } = parseFrontmatter(readFileSync(join(TERMS_DIR, f), "utf8"));
    if (meta.term && meta.slug && meta.definition) terms.push({ ...meta, body });
  }
}
if (terms.length) {
  mkdirSync(join(OUT_DIR, "terms"), { recursive: true });
  const termSlugByName = new Map(terms.map((t) => [t.term, t.slug]));
  for (const t of terms) {
    const key = t.term.split("(")[0].trim();
    const relatedArticles = posts
      .filter((p) => (p.title + " " + (p.tags || "") + " " + p.excerpt).includes(key))
      .slice(0, 6);
    const relatedTerms = (t.related || "")
      .split(/[、,]\s*/)
      .filter((r) => termSlugByName.has(r))
      .map((r) => `<a href="${termSlugByName.get(r)}.html">${escapeHtml(r)}</a>`)
      .join("");
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "DefinedTerm",
      name: t.term,
      description: t.definition,
      inDefinedTermSet: { "@type": "DefinedTermSet", name: `${CONFIG.siteName} 用語集`, url: CONFIG.baseUrl ? `${CONFIG.baseUrl}/terms/index.html` : undefined },
    };
    writeFileSync(
      join(OUT_DIR, "terms", `${t.slug}.html`),
      page({
        title: `${t.term}とは | ${CONFIG.siteName} 用語集`,
        description: t.definition,
        path: `/terms/${t.slug}.html`,
        jsonLd,
        bodyHtml: `${navHtml("../", "__terms", cats)}
<article class="term">
<h1>${escapeHtml(t.term)}${t.reading ? `<span class="term-reading">${escapeHtml(t.reading)}</span>` : ""}</h1>
<p class="lead">${escapeHtml(t.definition)}</p>
${mdToHtml(t.body)}
${relatedTerms ? `<div class="term-related"><span class="tr-label">関連用語</span>${relatedTerms}</div>` : ""}
${relatedArticles.length ? `<div class="term-articles"><h2>この概念が読めるニュース解説</h2><ul>${relatedArticles.map((p) => `<li><time>${p.date.replaceAll("-", ".")}</time><a href="../articles/${p.slug}.html">${escapeHtml(p.title)}</a></li>`).join("")}</ul></div>` : ""}
<div class="credit">本用語集は、${escapeHtml(CONFIG.company)}が付加価値経営の視点で編纂しています。</div>
</article>`,
      })
    );
  }
  writeFileSync(
    join(OUT_DIR, "terms", "index.html"),
    page({
      title: `付加価値経営 用語集 | ${CONFIG.siteName}`,
      description: `付加価値・値決め・価値転嫁など、付加価値経営の${terms.length}用語を${CONFIG.company}が解説します。`,
      path: `/terms/index.html`,
      bodyHtml: `${navHtml("../", "__terms", cats)}
<h1 class="page-title">付加価値経営 用語集 <span style="font-size:.8rem;color:var(--muted)">${terms.length}語</span></h1>
<ul class="term-list">
${terms.map((t) => `<li><a href="${t.slug}.html"><span class="tl-term">${escapeHtml(t.term)}</span><span class="tl-def">${escapeHtml(t.definition)}</span></a></li>`).join("\n")}
</ul>`,
    })
  );
}

// ---------- 事例データベース ----------
const dbData = posts.map((p) => ({
  s: p.slug, t: p.title, c: p.company || "", g: p.category || "", d: p.date, x: p.excerpt, tg: p.tags || "",
}));
writeFileSync(
  join(OUT_DIR, "database.html"),
  page({
    title: `事例データベース | ${CONFIG.siteName}`,
    description: `付加価値・値決めの実例${posts.length}件を企業名・業界・テーマで横断検索できます。`,
    path: `/database.html`,
    bodyHtml: `${navHtml("./", "__db", cats)}
<h1 class="page-title">事例データベース <span style="font-size:.8rem;color:var(--muted)">${posts.length}件</span></h1>
<div class="db-controls">
<input id="db-q" type="search" placeholder="企業名・キーワードで検索(例: 値上げ、ホテル、SaaS)">
<select id="db-cat"><option value="">すべての業界</option>${[...cats.keys()].map((c) => `<option>${escapeHtml(c)}</option>`).join("")}</select>
</div>
<div class="db-count" id="db-count"></div>
<ul class="db-list" id="db-list"></ul>
<script>
const DATA=${JSON.stringify(dbData)};
const q=document.getElementById("db-q"),cat=document.getElementById("db-cat"),list=document.getElementById("db-list"),count=document.getElementById("db-count");
function esc(s){return s.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function render(){
  const kw=q.value.trim().toLowerCase(),c=cat.value;
  const hits=DATA.filter(r=>(!c||r.g===c)&&(!kw||(r.t+r.c+r.tg+r.x).toLowerCase().includes(kw)));
  count.textContent=hits.length+"件";
  list.innerHTML=hits.map(r=>'<li><time>'+r.d.replaceAll("-",".")+'</time><span class="chip chip-cat">'+esc(r.g)+'</span><a href="articles/'+r.s+'.html">'+esc(r.t)+'</a><span class="db-co">'+esc(r.c)+'</span></li>').join("");
}
q.addEventListener("input",render);cat.addEventListener("change",render);render();
</script>`,
  })
);

// ---------- 実践ガイド(ピラーページ) ----------
const GUIDES_DIR = join(ROOT, "guides");
const guides = [];
if (existsSync(GUIDES_DIR)) {
  for (const f of readdirSync(GUIDES_DIR).filter((x) => x.endsWith(".md")).sort()) {
    const { meta, body } = parseFrontmatter(readFileSync(join(GUIDES_DIR, f), "utf8"));
    if (meta.title && meta.slug && meta.description) guides.push({ ...meta, body });
  }
}
mkdirSync(join(OUT_DIR, "guides"), { recursive: true });
for (const g of guides) {
  const guideLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: g.title,
    description: g.description,
    datePublished: g.date,
    dateModified: g.date,
    ...(CONFIG.baseUrl ? { mainEntityOfPage: `${CONFIG.baseUrl}/guides/${g.slug}.html` } : {}),
    author: { "@type": "Organization", name: CONFIG.company, url: CONFIG.baseUrl ? `${CONFIG.baseUrl}/about.html` : CONFIG.companyUrl },
    publisher: { "@type": "Organization", name: CONFIG.company, url: CONFIG.companyUrl },
  };
  writeFileSync(
    join(OUT_DIR, "guides", `${g.slug}.html`),
    page({
      title: `${g.title} | ${CONFIG.siteName}`,
      description: g.description,
      path: `/guides/${g.slug}.html`,
      jsonLd: guideLd,
      bodyHtml: `${navHtml("../", "__guides", cats)}
<div class="crumb"><a href="../index.html">ホーム</a> › <a href="index.html">実践ガイド</a></div>
<article>
<h1>${escapeHtml(g.title)}</h1>
<div class="meta"><time datetime="${g.date}">${g.date.replaceAll("-", ".")}</time><span class="chip chip-cat">実践ガイド</span></div>
<p class="lead">${escapeHtml(g.description)}</p>
${mdToHtml(g.body, g)}
<div class="credit">本ガイドは、${escapeHtml(CONFIG.company)}が提唱する付加価値経営の視点で編纂しています。<a href="../about.html">編集方針</a></div>
</article>`,
    })
  );
}
writeFileSync(
  join(OUT_DIR, "guides", "index.html"),
  page({
    title: `実践ガイド | ${CONFIG.siteName}`,
    description: `値上げ・脱コモディティなど、付加価値経営を実践するための体系的なガイド集。${CONFIG.company}編纂。`,
    path: `/guides/index.html`,
    bodyHtml: `${navHtml("../", "__guides", cats)}
<h1 class="page-title">実践ガイド</h1>
${guides.length ? `<ul class="term-list">
${guides.map((g) => `<li><a href="${g.slug}.html"><span class="tl-term">${escapeHtml(g.title)}</span><span class="tl-def">${escapeHtml(g.description)}</span></a></li>`).join("\n")}
</ul>` : `<p>準備中です。</p>`}`,
  })
);

// ---------- 運営者情報・編集方針 ----------
const ABOUT_PATH = join(ROOT, "about.md");
if (existsSync(ABOUT_PATH)) {
  const aboutMd = readFileSync(ABOUT_PATH, "utf8").replace(/^# .+\n/, "");
  writeFileSync(
    join(OUT_DIR, "about.html"),
    page({
      title: `このメディアについて・運営者情報 | ${CONFIG.siteName}`,
      description: `${CONFIG.siteName}の運営者情報と編集方針。運営: ${CONFIG.company}`,
      path: "/about.html",
      bodyHtml: `${navHtml("./", "__about", cats)}
<article>
<h1>このメディアについて</h1>
${mdToHtml(aboutMd)}
</article>`,
    })
  );
}

// sitemapを用語集・DB込みで再生成
if (CONFIG.baseUrl) {
  writeFileSync(
    join(OUT_DIR, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${CONFIG.baseUrl}/</loc></url><url><loc>${CONFIG.baseUrl}/database.html</loc></url><url><loc>${CONFIG.baseUrl}/about.html</loc></url><url><loc>${CONFIG.baseUrl}/guides/index.html</loc></url>${guides.map((g) => `<url><loc>${CONFIG.baseUrl}/guides/${g.slug}.html</loc><lastmod>${g.date}</lastmod></url>`).join("")}<url><loc>${CONFIG.baseUrl}/archive.html</loc></url><url><loc>${CONFIG.baseUrl}/terms/index.html</loc></url>${terms.map((t) => `<url><loc>${CONFIG.baseUrl}/terms/${t.slug}.html</loc></url>`).join("")}${[...cats.keys()].map((c) => `<url><loc>${CONFIG.baseUrl}/category/${catSlug(c)}.html</loc></url>`).join("")}${posts.map((p) => `<url><loc>${CONFIG.baseUrl}${p.htmlPath}</loc><lastmod>${p.date}</lastmod></url>`).join("")}</urlset>`
  );
}

// robots.txt / llms.txt
if (CONFIG.baseUrl) {
  writeFileSync(join(OUT_DIR, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${CONFIG.baseUrl}/sitemap.xml\n`);
  writeFileSync(
    join(OUT_DIR, "llms.txt"),
    `# ${CONFIG.siteName}

> ${CONFIG.tagline}。運営: ${CONFIG.company}(${CONFIG.companyUrl})。実在の報道・一次情報に基づき、値上げ・差別化・高付加価値化の実例を「顧客価値の構造」から解説する経営者向けメディア。

## 主要ページ
- [このメディアについて・編集方針](${CONFIG.baseUrl}/about.html)
- [用語集(付加価値経営の${terms.length}用語の定義)](${CONFIG.baseUrl}/terms/index.html)
- [事例データベース(${posts.length}件を横断検索)](${CONFIG.baseUrl}/database.html)
- [実践ガイド](${CONFIG.baseUrl}/guides/index.html)
- [全記事一覧](${CONFIG.baseUrl}/archive.html)

## 用語集
${terms.map((t) => `- [${t.term}](${CONFIG.baseUrl}/terms/${t.slug}.html): ${t.definition}`).join("\n")}

## カテゴリ
${[...cats.keys()].map((c) => `- [${c}](${CONFIG.baseUrl}/category/${catSlug(c)}.html)`).join("\n")}

## 記事
全記事は [sitemap.xml](${CONFIG.baseUrl}/sitemap.xml) を参照。
`
  );
}

writeFileSync(join(OUT_DIR, ".nojekyll"), "");
if (CONFIG.customDomain) writeFileSync(join(OUT_DIR, "CNAME"), CONFIG.customDomain + "\n");
if (existsSync(ASSETS_DIR)) cpSync(ASSETS_DIR, join(OUT_DIR, "assets"), { recursive: true });

console.log(`✔ built ${posts.length} article(s) -> ${OUT_DIR}`);
const noTransform = posts.filter((p) => !p.genjo || !p.riso).map((p) => p.slug);
if (noTransform.length) console.log(`  (現状/理想ブロックなし: ${noTransform.join(", ")})`);
