// Generates the Tesla-inspired profile SVGs in assets/.
// Run: bun scripts/build.ts   (daily via .github/workflows/update-profile-art.yml)
// Env: WAKATIME_API_KEY (optional, coding hours), GITHUB_TOKEN (optional, API rate limit), STATIC=1 (no animation).
import { mkdir } from "node:fs/promises";

const USER = "prabhuSub";
const ROOT = new URL("..", import.meta.url).pathname;
const OUT = `${ROOT}assets/`;
const STATIC = process.env.STATIC === "1";

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif`;
const C = {
  bg: "#ffffff",
  panel: "#f4f4f4",
  ink: "#171a20",
  sub: "#5c5e62",
  faint: "#a2a3a5",
  line: "#e2e3e3",
  blue: "#3e6ae1",
  red: "#e82127",
  redSoft: "#fdecec",
  green: ["#ebedf0", "#c6ebcf", "#8fd6a0", "#4fbf6a", "#3ab54a", "#1f8a33"],
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const svg = (w: number, h: number, body: string, css = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}">
<style>
text{font-family:${FONT}}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes on{0%,99%{opacity:1}100%{opacity:0}}
@keyframes stay{to{opacity:1}}
.rise{opacity:0;animation:rise .8s cubic-bezier(.2,.7,.2,1) forwards}
.fade{opacity:0;animation:fade .7s ease-out forwards}
${css}
${STATIC ? "*{animation:none!important}.rise,.fade,.cf{opacity:1!important}.dr{stroke-dashoffset:0!important}.r0{opacity:1!important}.sh,.pulse{display:none}" : ""}
</style>
${body}
</svg>`;

// Rough text width for the system sans stack; good enough to size pills.
const textW = (s: string, size: number, spacing = 0) => s.length * size * 0.55 + s.length * spacing;

function pill(x: number, y: number, label: string, o: { size?: number; fill?: string; stroke?: string; color?: string; dot?: string; pulse?: boolean; cls?: string; delay?: number } = {}) {
  const size = o.size ?? 12.5, h = size * 2.2, pad = size * 0.95;
  const dotW = o.dot ? size * 0.9 : 0;
  const w = textW(label, size) + pad * 2 + dotW;
  const anim = o.cls ? ` class="${o.cls}" style="animation-delay:${o.delay ?? 0}s"` : "";
  const out = `<g${anim}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${o.fill ?? C.bg}" stroke="${o.stroke ?? C.line}"/>${
    (o.dot && o.pulse ? `<circle class="pulse" cx="${x + pad + size * 0.28}" cy="${y + h / 2}" r="${size * 0.28}" fill="${o.dot}"/>` : "") +
    (o.dot ? `<circle cx="${x + pad + size * 0.28}" cy="${y + h / 2}" r="${size * 0.28}" fill="${o.dot}"/>` : "")
  }<text x="${x + pad + dotW}" y="${y + h / 2 + size * 0.36}" font-size="${size}" fill="${o.color ?? C.ink}">${esc(label)}</text></g>`;
  return { svg: out, w, h };
}

// ---------- data ----------
type Day = { date: string; level: number; count: number; row: number; col: number };

async function fetchContributions(): Promise<Day[]> {
  const html = await (await fetch(`https://github.com/users/${USER}/contributions`)).text();
  const counts = new Map<string, number>();
  for (const m of html.matchAll(/for="(contribution-day-component-\d+-\d+)"[^>]*>([^<]+)</g)) {
    const n = m[2].match(/^(\d[\d,]*) contribution/);
    counts.set(m[1], n ? Number(n[1].replace(/,/g, "")) : 0);
  }
  const days: Day[] = [];
  for (const m of html.matchAll(/<td[^>]*data-date="([\d-]+)"[^>]*id="(contribution-day-component-(\d+)-(\d+))"[^>]*data-level="(\d)"/g)) {
    days.push({ date: m[1], row: +m[3], col: +m[4], level: +m[5], count: counts.get(m[2]) ?? 0 });
  }
  if (days.length < 300) throw new Error(`Only parsed ${days.length} contribution days — markup changed?`);
  return days;
}

async function fetchRepoCount(): Promise<number> {
  const headers: Record<string, string> = { "User-Agent": USER };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/users/${USER}`, { headers });
  return (await res.json()).public_repos ?? 60;
}

// Total hours coded, all time. WakaTime computes this in the background, so the first
// call can report is_up_to_date=false with 0s — retry a few times. Null shows "—".
async function fetchWakaHours(): Promise<number | null> {
  const key = process.env.WAKATIME_API_KEY;
  if (!key) return null;
  const headers = { Authorization: `Basic ${Buffer.from(key).toString("base64")}` };
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch("https://wakatime.com/api/v1/users/current/all_time_since_today", { headers });
      const data = res.ok ? (await res.json()).data : null;
      console.log(`WakaTime attempt ${attempt}: HTTP ${res.status}, up_to_date=${data?.is_up_to_date}, seconds=${data?.total_seconds}, range=${data?.range?.start ?? "?"}..${data?.range?.end ?? "?"}`);
      if (data?.is_up_to_date && data.total_seconds > 0) return Math.round(data.total_seconds / 3600);
    } catch (e) {
      console.log(`WakaTime attempt ${attempt} failed: ${e}`);
    }
    if (attempt < 4) await Bun.sleep(15_000);
  }
  return null;
}

// Role line under the name cycles through these, ROLE_SECS each, forever.
const ROLES = ["Sr. Data Analyst @ Tesla", "Data Engineer", "Builder of Ledger", "Teacher at heart"];
const ROLE_SECS = 3;

// ---------- header: photo left, info right, stats underneath ----------
async function header(stats: { n: number | null; suffix?: string; unit?: string; label: string }[]) {
  const photo = Buffer.from(await Bun.file(`${OUT}portrait.jpg`).arrayBuffer()).toString("base64");
  const badge = Buffer.from(await Bun.file(`${OUT}tesla-badge.png`).arrayBuffer()).toString("base64");
  const W = 880, H = 300, cx = 128, cy = 108, r = 82;
  let body = `<defs><clipPath id="ph"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>
<rect width="${W}" height="${H}" rx="16" fill="${C.panel}"/>
<g class="fade" style="animation-duration:1.2s">
  <circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="${C.bg}"/>
  <image href="data:image/jpeg;base64,${photo}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#ph)"/>
</g>
<g class="rise" style="animation-delay:.7s">
  <rect x="${cx + r * 0.52}" y="${cy + r * 0.44}" width="44" height="44" rx="11" fill="${C.bg}"/>
  <image href="data:image/png;base64,${badge}" x="${cx + r * 0.52 + 3}" y="${cy + r * 0.44 + 3}" width="38" height="38"/>
</g>
<text class="rise" style="animation-delay:.15s" x="262" y="72" font-size="31" font-weight="500" letter-spacing="5.5" fill="${C.ink}">PRABHU SUBRAMANIAN</text>
<rect class="fade" style="animation-delay:.5s" x="263" y="96" width="36" height="3" rx="1.5" fill="${C.red}"/>
${ROLES.map((role, i) => `<text class="role${i === 0 ? " r0" : ""}" style="animation-delay:${i * ROLE_SECS}s" x="310" y="102" font-size="15" letter-spacing=".6" fill="${C.sub}">${esc(role)}</text>`).join("")}`;

  // status pills
  let px = 262;
  for (const [i, s] of [
    { label: "Open to collaborate", dot: C.green[4], pulse: true },
    { label: "San Francisco, CA", dot: C.faint },
    { label: "Building with AI", dot: C.red, pulse: true },
  ].entries()) {
    const p = pill(px, 124, s.label, { dot: s.dot, pulse: s.pulse, cls: "rise", delay: 0.45 + i * 0.1 });
    body += p.svg;
    px += p.w + 8;
  }

  // stats row
  const sy = 240, colW = W / stats.length;
  body += `<line x1="32" y1="${sy - 26}" x2="${W - 32}" y2="${sy - 26}" stroke="${C.line}"/>`;
  stats.forEach((it, i) => {
    const x = colW * i + colW / 2;
    const delay0 = 0.6 + i * 0.12;
    const unit = it.unit ? `<tspan font-size="13" fill="${C.sub}" dx="3">${it.unit}</tspan>` : "";
    if (it.n === null) {
      body += `<text class="fade" style="animation-delay:${delay0}s" x="${x}" y="${sy + 8}" text-anchor="middle" fill="${C.faint}"><tspan font-size="28" font-weight="500">—</tspan>${unit}</text>`;
    } else {
      const steps = 8;
      for (let k = 0; k < steps; k++) {
        const v = Math.round((it.n * (k + 1)) / steps), last = k === steps - 1, d = delay0 + k * 0.08;
        const anim = last ? `stay .01s ${d}s forwards` : `on .08s linear ${d}s forwards`;
        body += `<text${last ? ' class="cf"' : ""} x="${x}" y="${sy + 8}" text-anchor="middle" style="opacity:0;animation:${anim}" fill="${C.ink}"><tspan font-size="28" font-weight="500">${v.toLocaleString("en-US")}${last ? it.suffix ?? "" : ""}</tspan>${unit}</text>`;
      }
    }
    body += `<text class="fade" style="animation-delay:${delay0}s" x="${x}" y="${sy + 32}" text-anchor="middle" font-size="12" letter-spacing=".8" fill="${C.sub}">${it.label}</text>`;
    if (i) body += `<line x1="${colW * i}" y1="${sy - 12}" x2="${colW * i}" y2="${sy + 36}" stroke="${C.line}"/>`;
  });
  const cycle = ROLES.length * ROLE_SECS, slot = (100 / ROLES.length).toFixed(2);
  return svg(W, H, body, `@keyframes role{0%{opacity:0;transform:translateY(6px)}3%{opacity:1;transform:none}${(+slot - 3).toFixed(2)}%{opacity:1;transform:none}${slot}%{opacity:0;transform:translateY(-6px)}100%{opacity:0}}
.role{opacity:0;animation:role ${cycle}s ease-in-out infinite}
@keyframes pulse{0%{transform:scale(1);opacity:.7}70%,100%{transform:scale(3);opacity:0}}
.pulse{transform-box:fill-box;transform-origin:center;animation:pulse 2s ease-out 1.2s infinite}`);
}

// ---------- category pills: stack + focus ----------
function pills() {
  const W = 880;
  const rows = [
    { label: "STACK", items: ["Python", "SQL", "Snowflake", "Databricks", "AWS", "GCP", "Terraform", "Tableau", "Power BI"], style: {} },
    { label: "FOCUS", items: ["Data Engineering", "Analytics", "BI", "Machine Learning", "Automation", "AI Agents"], style: { fill: C.ink, stroke: C.ink, color: "#fff" } },
  ];
  // Own light panel so the pills stay readable on GitHub dark mode.
  const PX = 28;
  let body = "", y = 22, n = 0;
  for (const row of rows) {
    body += `<text class="fade" x="${PX}" y="${y + 18}" font-size="11" letter-spacing="2" font-weight="600" fill="${C.faint}">${row.label}</text>`;
    let x = PX + 72;
    for (const item of row.items) {
      const p = pill(x, y, item, { ...row.style, size: 12.5, cls: "rise", delay: 0.05 + n++ * 0.04 });
      if (x + p.w > W - PX) break;
      body += p.svg;
      x += p.w + 7;
    }
    y += 40;
  }
  const H = y + 10;
  return svg(W, H, `<rect width="${W}" height="${H}" rx="16" fill="${C.bg}" stroke="${C.line}"/>` + body);
}

// ---------- contributions grid ----------
function contributions(days: Day[]) {
  const W = 880, cell = 12, gap = 3, cols = Math.max(...days.map((d) => d.col)) + 1;
  const gridW = cols * (cell + gap) - gap;
  const gx = (W - gridW) / 2, gy = 64;
  const H = gy + 7 * (cell + gap) + 46;
  const total = days.reduce((a, d) => a + d.count, 0);
  const active = days.filter((d) => d.count > 0).length;
  let body = `<rect width="${W}" height="${H}" rx="16" fill="${C.bg}" stroke="${C.line}"/>
<text x="${gx}" y="38" font-size="12" letter-spacing="2" fill="${C.sub}">CONTRIBUTIONS · LAST 12 MONTHS</text>
<text class="fade" x="${gx + gridW}" y="40" text-anchor="end" font-size="13" fill="${C.sub}"><tspan font-size="22" font-weight="600" fill="${C.ink}">${total.toLocaleString("en-US")}</tspan> contributions  ·  <tspan font-weight="600" fill="${C.ink}">${active}</tspan> active days</text>`;
  for (const d of days) {
    const x = gx + d.col * (cell + gap), y = gy + d.row * (cell + gap);
    body += `<rect class="fade" style="animation-delay:${(0.2 + d.col * 0.025).toFixed(3)}s;animation-duration:.4s" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2.5" fill="${C.green[Math.min(d.level, 5)]}"><title>${d.count} on ${d.date}</title></rect>`;
  }
  // Charging shimmer: a green band sweeps across the cells every 3s.
  const cells = days.map((d) => `<rect x="${gx + d.col * (cell + gap)}" y="${gy + d.row * (cell + gap)}" width="${cell}" height="${cell}" rx="2.5"/>`).join("");
  body += `<defs><clipPath id="cells">${cells}</clipPath>
<linearGradient id="band" x1="0" x2="1"><stop offset="0" stop-color="${C.green[4]}" stop-opacity="0"/><stop offset=".5" stop-color="${C.green[4]}" stop-opacity=".6"/><stop offset="1" stop-color="${C.green[4]}" stop-opacity="0"/></linearGradient></defs>
<g clip-path="url(#cells)" class="sh"><rect x="${gx - 160}" y="${gy}" width="140" height="${7 * (cell + gap)}" fill="url(#band)" style="animation:shimmer 3s ease-in-out 2.5s infinite"/></g>`;
  const ly = gy + 7 * (cell + gap) + 16;
  body += `<text x="${gx + gridW - 128}" y="${ly + 9}" text-anchor="end" font-size="11" fill="${C.faint}">Less</text>`;
  [0, 1, 2, 3, 4].forEach((l, i) => (body += `<rect x="${gx + gridW - 120 + i * 16}" y="${ly}" width="${cell}" height="${cell}" rx="2.5" fill="${C.green[l]}"/>`));
  body += `<text x="${gx + gridW - 36}" y="${ly + 9}" font-size="11" fill="${C.faint}">More</text>`;
  return svg(W, H, body, `@keyframes shimmer{0%{transform:translateX(0)}75%,100%{transform:translateX(${gridW + 320}px)}}`);
}

// ---------- timeline ----------
function timeline() {
  const W = 880, H = 170, y = 84, PAD_BOTTOM = 34; // transparent gap before the project cards
  const stops = [
    { co: "Hewlett Packard", role: "Software Engineer", yr: "2015" },
    { co: "Squark AI", role: "Graduate Programmer Analyst", yr: "2019" },
    { co: "PACCAR", role: "Data Engineer Intern", yr: "2020" },
    { co: "Levi Strauss & Co.", role: "Sr. Data Analyst", yr: "2021" },
    { co: "Tesla", role: "Sr. Data Analyst", yr: "2025 — Now" },
  ];
  const x0 = 90, x1 = W - 90, step = (x1 - x0) / (stops.length - 1);
  let body = `<rect width="${W}" height="${H}" rx="16" fill="${C.panel}"/>
<text x="36" y="34" font-size="12" letter-spacing="2" fill="${C.sub}">THE ROUTE SO FAR</text>
<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${C.line}" stroke-width="3" stroke-linecap="round"/>
<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${C.ink}" stroke-width="3" stroke-linecap="round" class="dr" stroke-dasharray="${x1 - x0}" stroke-dashoffset="${x1 - x0}" style="animation:draw 2.4s ease-in-out .3s forwards"/>`;
  stops.forEach((s, i) => {
    const x = x0 + step * i, d = (0.3 + (2.4 * i) / (stops.length - 1)).toFixed(2);
    const now = i === stops.length - 1;
    body += `<circle cx="${x}" cy="${y}" r="${now ? 9 : 7}" fill="${C.bg}" stroke="${C.line}" stroke-width="3"/>
<circle class="fade" style="animation-delay:${d}s;animation-duration:.3s" cx="${x}" cy="${y}" r="${now ? 9 : 7}" fill="${now ? C.red : C.ink}"/>
<text class="rise" style="animation-delay:${d}s" x="${x}" y="${y - 22}" text-anchor="middle" font-size="12" fill="${now ? C.red : C.faint}" font-weight="${now ? 600 : 400}">${s.yr}</text>
<text class="rise" style="animation-delay:${d}s" x="${x}" y="${y + 34}" text-anchor="middle" font-size="14" font-weight="600" fill="${C.ink}">${esc(s.co)}</text>
<text class="rise" style="animation-delay:${d}s" x="${x}" y="${y + 53}" text-anchor="middle" font-size="11.5" fill="${C.sub}">${esc(s.role)}</text>`;
  });
  return svg(W, H + PAD_BOTTOM, body, `@keyframes draw{to{stroke-dashoffset:0}}`);
}

// ---------- project cards ----------
const wrap = (t: string, max: number) =>
  t.split(" ").reduce<string[]>((ls, w) => {
    const last = ls[ls.length - 1];
    if (last && (last + " " + w).length <= max) ls[ls.length - 1] = last + " " + w;
    else ls.push(w);
    return ls;
  }, []);
const PROJECTS = [
  { file: "p-kobe", tags: ["Data Science", "Python"], title: "Kobe Bryant Shot Analysis", desc: "EDA on 30k shots across a 20-year career" },
  { file: "p-ledger", tags: ["Personal Infra", "Bun · Hono"], title: "Ledger", desc: "Finance + daily-briefing dashboard on a Raspberry Pi" },
  { file: "p-webgl", tags: ["Web", "WebGL"], title: "3D Scrolling Resume", desc: "WebGL resume you scroll through in 3D" },
  { file: "p-book", tags: ["Research", "ML"], title: "Interpretable ML", desc: "An evaluation system for interpretable models (book)" },
  { file: "p-teach", tags: ["Community", "Teaching"], title: "Workshops & Teaching", desc: "Git/GitHub and Python workshops at Northeastern" },
  { file: "p-tableau", tags: ["BI", "Tableau"], title: "Tableau Portfolio", desc: "Interactive resume and dashboards on Tableau Public" },
];
function card(p: (typeof PROJECTS)[number], i: number, cta: string) {
  const W = 284, H = 156;
  const a = pill(20, 18, p.tags[0], { size: 11, fill: "#e8f6eb", stroke: "#e8f6eb", color: C.green[5] });
  const b = pill(20 + a.w + 6, 18, p.tags[1], { size: 11, fill: C.panel, stroke: C.panel, color: C.sub });
  return svg(W, H, `<g class="rise" style="animation-delay:${0.1 + i * 0.12}s">
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="${C.bg}" stroke="${C.line}"/>
${a.svg}${b.svg}
<text x="20" y="72" font-size="18" font-weight="600" fill="${C.ink}">${esc(p.title)}</text>
${wrap(p.desc, 34).map((l, k) => `<text x="20" y="${95 + k * 18}" font-size="13" fill="${C.sub}">${esc(l)}</text>`).join("")}
<text x="20" y="${H - 16}" font-size="11" letter-spacing="1.5" font-weight="600" fill="${C.ink}">${cta}</text></g>`);
}

// ---------- buttons ----------
function button(label: string, primary: boolean) {
  const W = 260, H = 44, PAD_TOP = 16; // transparent gap after the project cards
  return svg(W, H + PAD_TOP, `<g transform="translate(0 ${PAD_TOP})"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="6" fill="${primary ? C.blue : C.panel}"/>
<text x="${W / 2}" y="27" text-anchor="middle" font-size="13" font-weight="600" letter-spacing="1.2" fill="${primary ? "#fff" : C.ink}">${label}</text></g>`);
}

// ---------- main ----------
await mkdir(OUT, { recursive: true });
const [days, repos, hours] = await Promise.all([fetchContributions(), fetchRepoCount(), fetchWakaHours()]);
const years = Math.floor((Date.now() - Date.UTC(2015, 10, 1)) / 31_557_600_000); // since HP, Nov 2015
await Bun.write(`${ROOT}data/contributions.json`, JSON.stringify(days.map(({ date, count, level }) => ({ date, count, level }))));
const files: Record<string, string> = {
  "header.svg": await header([
    { n: years, suffix: "+", unit: "yrs", label: "Experience" },
    { n: 5, label: "Companies" },
    { n: repos, label: "Public Repos" },
    { n: hours, unit: "hrs", label: "Coded · WakaTime" },
  ]),
  "pills.svg": pills(),
  "contributions.svg": contributions(days),
  "timeline.svg": timeline(),
  "btn-portfolio.svg": button("VIEW PORTFOLIO", true),
  "btn-linkedin.svg": button("CONNECT ON LINKEDIN", false),
};
PROJECTS.forEach((p, i) => (files[`${p.file}.svg`] = card(p, i, p.file === "p-ledger" ? "PRIVATE REPO" : "LEARN MORE →")));
for (const [name, content] of Object.entries(files)) await Bun.write(OUT + name, content);
console.log(`Wrote ${Object.keys(files).length} SVGs · ${days.length} days · ${repos} repos · ${hours ?? "no"} WakaTime hrs`);
