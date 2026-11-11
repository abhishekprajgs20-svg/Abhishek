/*
 ABHISHEK - build se pehle chalti hai (GitHub par apne aap).
 1. tools/ folder ki har .html ko app me jodti hai
 2. HTML me jo bhi online JS/CSS libraries hain unhe download karke app ke andar rakhti hai (offline chalne ke liye)
 3. www/tools.json (app ki list) banati hai
 Koi bhi download fail ho to build nahi rukta, sirf wo library online rehti hai.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'tools');
const WWW = path.join(ROOT, 'www');
const OUT = path.join(WWW, 'tools');
const VENDOR = path.join(WWW, 'vendor');

const URL_RE = /https?:\/\/[^\s"'`<>()\\{}$]+?\.(?:m?js|css)(?:\?[^\s"'`<>()\\{}$]*)?(?=["'`\s<>)]|$)/gi;
const cache = new Map(); // url -> '/vendor/name' | null

const h8 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
const baseName = (u) => {
  let b = decodeURIComponent(new URL(u).pathname.split('/').pop() || 'file');
  b = b.replace(/[^a-zA-Z0-9._-]/g, '_');
  return b.replace(/\.mjs$/i, '.js');
};

async function download(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(40000),
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

async function vendorAsset(url) {
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    try {
      const isCss = /\.css(\?|$)/i.test(url);
      const buf = await download(url);
      if (buf.length < 50 || buf.slice(0, 30).toString().trim().startsWith('<')) throw new Error('not a script/css');
      const name = h8(url) + '-' + baseName(url);
      if (!isCss) {
        fs.writeFileSync(path.join(VENDOR, name), buf);
        return '/vendor/' + name;
      }
      // CSS: andar ke fonts/images (url(...)) bhi download karo
      let css = buf.toString('utf8');
      const refs = new Set();
      css.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g, (m, q, u) => { refs.add(u); return m; });
      for (const u of refs) {
        if (/^(data:|#)/i.test(u)) continue;
        let abs;
        try { abs = new URL(u, url).href; } catch { continue; }
        let local = abs;
        try {
          const fb = await download(abs);
          const fname = h8(abs) + '-' + baseName(abs);
          fs.writeFileSync(path.join(VENDOR, fname), fb);
          local = '/vendor/' + fname;
        } catch { /* online hi rahega */ }
        css = css.split(u).join(local);
      }
      fs.writeFileSync(path.join(VENDOR, name), css);
      return '/vendor/' + name;
    } catch (e) {
      console.log('  (online rahega) ' + url + ' -> ' + e.message);
      return null;
    }
  })();
  cache.set(url, p);
  return p;
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const slugify = (s) => s.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tool';

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.rmSync(VENDOR, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(VENDOR, { recursive: true });

  const files = fs.existsSync(SRC)
    ? fs.readdirSync(SRC).filter((f) => /\.html?$/i.test(f) && fs.statSync(path.join(SRC, f)).isFile()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    : [];
  console.log('tools folder me %d HTML mili.', files.length);

  const manifest = [];
  const used = new Set();
  for (const f of files) {
    let html = fs.readFileSync(path.join(SRC, f), 'utf8');
    const clean = f.replace(/^\d{8,}_/, '');
    let id = slugify(clean), n = 2;
    while (used.has(id)) id = slugify(clean) + '-' + n++;
    used.add(id);

    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = (m && decode(m[1]).replace(/\s+/g, ' ').trim()) || clean.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');

    const urls = [...new Set(html.match(URL_RE) || [])].filter((u) => !/localhost|127\.0\.0\.1/.test(u));
    const got = await Promise.all(urls.map(async (u) => [u, await vendorAsset(u)]));
    let ok = 0;
    for (const [u, local] of got.sort((a, b) => b[0].length - a[0].length)) {
      if (local) { html = html.split(u).join(local); ok++; }
    }
    // integrity/crossorigin hatao (local file par kaam nahi karte)
    html = html.replace(/<(script|link)\b[^>]*\/vendor\/[^>]*>/gi, (tag) =>
      tag.replace(/\s+integrity=(["'])[^"']*\1/gi, '').replace(/\s+crossorigin(=(["'])[^"']*\2)?/gi, ''));

    const shim = '<script src="/tool-shim.js"></script>';
    const head = html.match(/<head[^>]*>/i);
    if (head) html = html.replace(head[0], head[0] + shim);
    else {
      const ht = html.match(/<html[^>]*>/i);
      html = ht ? html.replace(ht[0], ht[0] + shim) : shim + html;
    }

    fs.writeFileSync(path.join(OUT, id + '.html'), html);
    manifest.push({ id, file: id + '.html', title });
    console.log('+ %s  (%s)  libraries andar: %d/%d', title, id + '.html', ok, urls.length);
  }
  fs.writeFileSync(path.join(WWW, 'tools.json'), JSON.stringify(manifest, null, 1));
  console.log('Taiyaar: %d tools.', manifest.length);
}

main().catch((e) => { console.log('prepare warning:', e && e.message); process.exit(0); });
