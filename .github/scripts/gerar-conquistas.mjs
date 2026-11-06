// Gera conquistas.svg — o "Baú de Conquistas" do README.
// Busca no GitHub (GraphQL): contribuições de todos os anos, sequências,
// e as linguagens de TODOS os repositórios em que o usuário é dono,
// colaborador, membro de organização ou já contribuiu (commits/PRs/issues).
// Uso: GH_TOKEN=... USERNAME=VictorRodriguesCosta node .github/scripts/gerar-conquistas.mjs
// Prévia sem internet: DEMO=1 node .github/scripts/gerar-conquistas.mjs

import { readFileSync, writeFileSync } from "node:fs";

const USER = process.env.USERNAME || process.env.GITHUB_REPOSITORY_OWNER || "VictorRodriguesCosta";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const DEMO = process.env.DEMO === "1";
const OUT = process.env.OUT || "conquistas.svg";
// Linguagens que não devem entrar na conta (separe por vírgula)
const IGNORAR = (process.env.IGNORAR_LINGUAGENS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const C = { BOR: "#9A222B", BOR2: "#821F4E", GOLD: "#DDA423", GOLD2: "#F2D000", OFF: "#FEFEFC", BLK: "#030303", MUT: "#b5aa95" };

// ---------------------------------------------------------------- dados
async function gql(query, variables = {}) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "bau-de-conquistas" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const LANGS = `languages(first: 15, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name color } } }`;

async function reposPaginados(campo, args) {
  const vistos = [];
  let cursor = null;
  do {
    const d = await gql(
      `query($login:String!,$cursor:String){ user(login:$login){ ${campo}(first:100, after:$cursor, ${args}){
        pageInfo{ hasNextPage endCursor } nodes{ nameWithOwner isFork stargazerCount owner{ login } ${LANGS} } } } }`,
      { login: USER, cursor }
    );
    const c = d.user[campo];
    vistos.push(...c.nodes);
    cursor = c.pageInfo.hasNextPage ? c.pageInfo.endCursor : null;
  } while (cursor);
  return vistos;
}

async function dadosReais() {
  if (!TOKEN) throw new Error("Defina GH_TOKEN (ou rode com DEMO=1).");
  const base = await gql(`query($login:String!){ user(login:$login){ createdAt contributionsCollection{ contributionYears } } }`, { login: USER });
  const anos = base.user.contributionsCollection.contributionYears;

  let commits = 0, prs = 0, issues = 0, reviews = 0, privadas = 0;
  const dias = [];
  for (const ano of anos) {
    const d = await gql(
      `query($login:String!,$from:DateTime!,$to:DateTime!){ user(login:$login){ contributionsCollection(from:$from,to:$to){
        totalCommitContributions totalPullRequestContributions totalIssueContributions totalPullRequestReviewContributions restrictedContributionsCount
        contributionCalendar{ weeks{ contributionDays{ date contributionCount } } } } } }`,
      { login: USER, from: `${ano}-01-01T00:00:00Z`, to: `${ano}-12-31T23:59:59Z` }
    );
    const cc = d.user.contributionsCollection;
    commits += cc.totalCommitContributions; prs += cc.totalPullRequestContributions;
    issues += cc.totalIssueContributions; reviews += cc.totalPullRequestReviewContributions;
    privadas += cc.restrictedContributionsCount;
    for (const w of cc.contributionCalendar.weeks) for (const day of w.contributionDays) dias.push(day);
  }

  // Repositórios: donos, colaborador, organização + todos em que contribuiu
  // Com token pessoal pega também colaborações/organizações; o "privacy:PUBLIC" garante os públicos mesmo com o token padrão da Action
  const proprios = [...await reposPaginados("repositories", "ownerAffiliations:[OWNER, COLLABORATOR, ORGANIZATION_MEMBER]"), ...await reposPaginados("repositories", "privacy:PUBLIC")];
  const contribuidos = await reposPaginados("repositoriesContributedTo", "includeUserRepositories:true, contributionTypes:[COMMIT, PULL_REQUEST, ISSUE, REPOSITORY]");
  const mapa = new Map();
  for (const r of [...proprios, ...contribuidos]) if (!r.isFork || r.owner.login !== USER) mapa.set(r.nameWithOwner, r);
  const repos = [...mapa.values()];

  const estrelas = repos.filter((r) => r.owner.login === USER).reduce((s, r) => s + r.stargazerCount, 0);
  const linguas = new Map();
  for (const r of repos)
    for (const e of r.languages.edges) {
      if (IGNORAR.includes(e.node.name.toLowerCase())) continue;
      const atual = linguas.get(e.node.name) || { size: 0, color: e.node.color };
      atual.size += e.size;
      linguas.set(e.node.name, atual);
    }
  return { commits, prs, issues, reviews, privadas, estrelas, repos: repos.length, colaboracoes: repos.filter((r) => r.owner.login !== USER).length, dias, linguas };
}

function dadosDemo() {
  const dias = [];
  const hoje = new Date();
  for (let i = 400; i >= 0; i--) {
    const d = new Date(hoje); d.setDate(d.getDate() - i);
    const s = Math.sin(i / 9) + Math.random();
    dias.push({ date: d.toISOString().slice(0, 10), contributionCount: i < 220 && s > 0.7 ? Math.floor(Math.random() * 7) + (i < 6 ? 1 : 0) : i < 6 ? 2 : 0 });
  }
  const linguas = new Map([["HTML", { size: 52000, color: "#e34c26" }], ["CSS", { size: 41000, color: "#663399" }], ["C", { size: 26000, color: "#555555" }], ["JavaScript", { size: 12000, color: "#f1e05a" }], ["Python", { size: 8000, color: "#3572A5" }], ["TSQL", { size: 5000, color: "#e38c00" }]]);
  return { commits: 148, prs: 9, issues: 5, reviews: 3, privadas: 12, estrelas: 7, repos: 11, colaboracoes: 3, dias, linguas };
}

// ---------------------------------------------------------------- cálculos
function sequencias(dias) {
  const ord = [...dias].sort((a, b) => a.date.localeCompare(b.date));
  let maior = 0, run = 0;
  for (const d of ord) { run = d.contributionCount > 0 ? run + 1 : 0; maior = Math.max(maior, run); }
  let atual = 0;
  let i = ord.length - 1;
  if (i >= 0 && ord[i].contributionCount === 0) i--; // hoje ainda pode não ter commit
  for (; i >= 0 && ord[i].contributionCount > 0; i--) atual++;
  const total = ord.reduce((s, d) => s + d.contributionCount, 0);
  return { atual, maior, total, ultimo: ord.slice(-371) };
}

// ---------------------------------------------------------------- desenho
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fmt = (n) => n.toLocaleString("pt-BR");

function painel(x, y, w, h, titulo, kicker) {
  return `<g transform="translate(${x} ${y})">
<rect width="${w}" height="${h}" rx="14" fill="#120e10" stroke="${C.GOLD}" stroke-width="2"/>
<rect x="7" y="7" width="${w - 14}" height="${h - 14}" rx="10" fill="none" stroke="#3a3034"/>
<text x="${w / 2}" y="30" text-anchor="middle" class="sf" font-size="15" font-weight="bold" letter-spacing="6" fill="${C.GOLD}">${kicker}</text>
<text x="${w / 2 + 2}" y="70" text-anchor="middle" class="pf" font-size="36" fill="${C.BOR}">${titulo}</text>
<text x="${w / 2}" y="68" text-anchor="middle" class="pf" font-size="36" fill="${C.GOLD}" stroke="${C.BLK}" stroke-width="3" paint-order="stroke">${titulo}</text>`;
}

const ICONES = {
  commit: `<path d="M-2 10 L8 -10 L12 -8 L2 12 Z" fill="${C.OFF}" stroke="${C.BLK}"/><path d="M8 -10 Q16 -18 12 -8" fill="${C.OFF}" stroke="${C.BLK}"/><path d="M-6 12 L2 12" stroke="${C.GOLD}" stroke-width="2"/>`,
  pr: `<circle cx="-6" cy="-8" r="4" fill="none" stroke="${C.OFF}" stroke-width="2.5"/><circle cx="-6" cy="9" r="4" fill="none" stroke="${C.OFF}" stroke-width="2.5"/><circle cx="7" cy="9" r="4" fill="none" stroke="${C.OFF}" stroke-width="2.5"/><path d="M-6 -4 L-6 5 M7 5 L7 -4 Q7 -8 2 -8" stroke="${C.OFF}" stroke-width="2.5" fill="none"/>`,
  issue: `<circle r="10" fill="none" stroke="${C.OFF}" stroke-width="2.5"/><circle r="3" fill="${C.OFF}"/>`,
  estrela: `<path d="M0 -11 L3 -3 L11 -3 L5 2 L7 10 L0 5 L-7 10 L-5 2 L-11 -3 L-3 -3 Z" fill="${C.GOLD2}" stroke="${C.BLK}"/>`,
  navio: `<path d="M-11 4 L11 4 L8 10 L-8 10 Z" fill="${C.OFF}"/><line x1="0" y1="4" x2="0" y2="-11" stroke="${C.OFF}" stroke-width="2"/><path d="M1 -10 L9 1 L1 1 Z" fill="${C.OFF}"/>`,
};

function tesouros(d, x, y) {
  const w = 540, h = 330;
  const linhas = [
    ["commit", "Commits em todos os anos", d.commits + d.privadas],
    ["pr", "Pull requests abertos", d.prs],
    ["issue", "Issues abertas", d.issues],
    ["estrela", "Estrelas recebidas", d.estrelas],
    ["navio", `Repositórios navegados (${d.colaboracoes} em colaboração)`, d.repos],
  ];
  let s = painel(x, y, w, h, "Tesouros do Capitão", "⚓ PILHAGEM ⚓");
  linhas.forEach(([ic, lab, v], i) => {
    const yy = 104 + i * 44;
    s += `<g transform="translate(36 ${yy})"><circle r="17" fill="${C.BOR2}" stroke="${C.GOLD}" stroke-width="1.5"/>${ICONES[ic]}</g>
<text x="66" y="${yy + 6}" class="sf" font-size="17" fill="${C.OFF}">${esc(lab)}</text>
<text x="${w - 30}" y="${yy + 9}" text-anchor="end" class="sf" font-size="26" font-weight="bold" fill="${C.GOLD}">${fmt(v)}</text>
<line x1="66" y1="${yy + 22}" x2="${w - 30}" y2="${yy + 22}" stroke="#2a2326"/>`;
  });
  return s + "</g>";
}

function linguas(d, x, y) {
  const w = 544, h = 330;
  const lista = [...d.linguas.entries()].sort((a, b) => b[1].size - a[1].size);
  const total = lista.reduce((s, [, v]) => s + v.size, 0) || 1;
  const top = lista.slice(0, 6);
  let s = painel(x, y, w, h, "Línguas dos Sete Mares", "⚓ IDIOMAS DA TRIPULAÇÃO ⚓");
  top.forEach(([nome, v], i) => {
    const pct = (v.size / total) * 100;
    const yy = 100 + i * 34, bw = 226, fill = Math.max(4, (bw * pct) / 100);
    s += `<circle cx="38" cy="${yy}" r="7" fill="${v.color || C.GOLD}" stroke="${C.BLK}" stroke-width="1.5"/>
<text x="54" y="${yy + 6}" class="sf" font-size="17" font-weight="bold" fill="${C.OFF}">${esc(nome)}</text>
<rect x="210" y="${yy - 8}" width="${bw}" height="16" rx="8" fill="#2a1d15" stroke="#6b3f1d" stroke-width="1.5"/>
<rect x="210" y="${yy - 8}" width="0" height="16" rx="8" fill="${i === 0 ? C.GOLD : C.BOR}"><animate attributeName="width" from="0" to="${fill.toFixed(1)}" begin="${(0.3 + i * 0.2).toFixed(1)}s" dur="1.2s" fill="freeze"/></rect>
<text x="${w - 30}" y="${yy + 6}" text-anchor="end" class="sf" font-size="16" font-weight="bold" fill="${C.OFF}">${pct.toFixed(1).replace(".", ",")}%</text>`;
  });
  if (!top.length) s += `<text x="${w / 2}" y="180" text-anchor="middle" class="sf" font-size="17" fill="${C.MUT}">Nenhuma linguagem encontrada ainda.</text>`;
  s += `<text x="${w / 2}" y="${h - 22}" text-anchor="middle" class="sf" font-size="15" fill="${C.MUT}">repositórios próprios + colaborações · por volume de código</text>`;
  return s + "</g>";
}

function navegacao(d, x, y) {
  const w = 1100, h = 430;
  const sq = sequencias(d.dias);
  let s = painel(x, y, w, h, "Diário de Navegação", "⚓ CONTRIBUIÇÕES · MINI GAME ⚓");
  const nums = [["Contribuições no total", fmt(sq.total)], ["Sequência atual", `${sq.atual} dia${sq.atual === 1 ? "" : "s"}`], ["Maior sequência", `${sq.maior} dia${sq.maior === 1 ? "" : "s"}`]];
  nums.forEach(([lab, v], i) => {
    const cx = 220 + i * 330;
    s += `<text x="${cx}" y="122" text-anchor="middle" class="sf" font-size="36" font-weight="bold" fill="${i === 1 ? C.GOLD2 : C.GOLD}">${v}</text>
<text x="${cx}" y="146" text-anchor="middle" class="sf" font-size="15" fill="${C.MUT}">${lab}</text>`;
    if (i === 1) s += `<g transform="translate(${cx + 88} 108)"><path d="M0 -14 Q8 -2 0 10 Q-8 -2 0 -14 Z" fill="${C.GOLD2}"><animate attributeName="d" values="M0 -14 Q8 -2 0 10 Q-8 -2 0 -14 Z;M2 -18 Q9 -2 0 10 Q-7 -2 2 -18 Z;M0 -14 Q8 -2 0 10 Q-8 -2 0 -14 Z" dur="1.2s" repeatCount="indefinite"/></path><path d="M0 -4 Q4 3 0 9 Q-4 3 0 -4 Z" fill="${C.BOR}"/></g>`;
  });

  // ---- tabuleiro: últimas 53 semanas
  const dias = sq.ultimo;
  const max = Math.max(1, ...dias.map((q) => q.contributionCount));
  const cores = ["#1c1517", "#4a1a20", "#7a1a22", C.BOR, C.GOLD];
  const cell = 15, gap = 3, step = cell + gap;
  const primeiroDia = new Date(dias[0]?.date || Date.now()).getUTCDay();
  const cols = Math.ceil((dias.length + primeiroDia) / 7);
  const gx = (w - cols * step) / 2, gy = 210;
  const celulas = dias.map((q, i) => {
    const k = i + primeiroDia, col = Math.floor(k / 7), row = k % 7;
    const lvl = q.contributionCount === 0 ? 0 : Math.min(4, Math.ceil((q.contributionCount / max) * 4));
    return { col, row, lvl, x: gx + col * step, y: gy + row * step };
  });

  // ---- mini game: o navio atravessa o gráfico linha por linha e afunda cada contribuição a tiros de canhão
  const alvos = celulas.filter((c) => c.lvl > 0);
  const V = 300, DESCE = 0.35, PAUSA = 2.5, DIST = 70, VOO = 0.2;
  const xIni = gx - 34, xFim = gx + cols * step + 16;
  const rowY = (r) => gy + r * step + cell / 2;
  let t = 0.6;
  const paradas = [{ t: 0, x: xIni, y: rowY(0), s: 1 }];
  for (let r = 0; r < 7; r++) {
    const dir = r % 2 === 0 ? 1 : -1, xs = dir > 0 ? xIni : xFim, xe = dir > 0 ? xFim : xIni, t0 = t;
    paradas.push({ t, x: xs, y: rowY(r), s: dir });
    for (const a of alvos.filter((c) => c.row === r)) {
      const xc = a.x + cell / 2;
      const xTiro = dir > 0 ? Math.max(xs, xc - DIST) : Math.min(xs, xc + DIST);
      a.tiro = t0 + Math.abs(xTiro - xs) / V; a.xTiro = xTiro + dir * 20; a.hit = a.tiro + VOO; a.cx = xc; a.cy = rowY(r);
    }
    t += Math.abs(xe - xs) / V;
    paradas.push({ t, x: xe, y: rowY(r), s: dir });
    if (r < 6) { t += DESCE; }
  }
  const fim = t; t += PAUSA; const T = t;
  paradas.push({ t: T - 0.01, x: paradas[paradas.length - 1].x, y: rowY(6), s: -1 }, { t: T, x: xIni, y: rowY(0), s: 1 });
  const kt = (v) => Math.min(1, Math.max(0, v / T)).toFixed(4);
  const dur = `${T.toFixed(2)}s`;
  const anim = (attr, values, times) => `<animate attributeName="${attr}" values="${values}" keyTimes="${times}" dur="${dur}" repeatCount="indefinite"/>`;

  // células (viram destroços depois da explosão)
  celulas.forEach((c) => {
    s += `<rect x="${c.x.toFixed(1)}" y="${c.y}" width="${cell}" height="${cell}" rx="3" fill="${cores[c.lvl]}" stroke-width="1.5"`;
    if (c.lvl > 0) {
      const a = kt(c.hit), b = kt(c.hit + 0.02);
      s += `>${anim("fill", `${cores[c.lvl]};${cores[c.lvl]};#2a1612;#2a1612`, `0;${a};${b};1`)}${anim("stroke", `none;none;#5a2a1a;#5a2a1a`, `0;${a};${b};1`)}</rect>`;
    } else s += `/>`;
  });

  // balas de canhão, clarão do disparo e explosões
  alvos.forEach((a) => {
    const k0 = kt(a.tiro), k1 = kt(a.hit), k2 = kt(a.hit + 0.02), k3 = kt(a.hit + 0.5), k4 = kt(a.hit + 1.1);
    s += `<circle cy="${a.cy}" r="3.5" fill="${C.BLK}" stroke="${C.OFF}" stroke-width="1" opacity="0">${anim("cx", `${a.xTiro.toFixed(1)};${a.xTiro.toFixed(1)};${a.cx.toFixed(1)};${a.cx.toFixed(1)}`, `0;${k0};${k1};1`)}${anim("opacity", "0;0;1;0;0", `0;${k0};${k1};${k2};1`)}</circle>`;
    s += `<circle cx="${a.xTiro.toFixed(1)}" cy="${a.cy}" r="7" fill="${C.GOLD2}" opacity="0">${anim("opacity", "0;0;1;0;0", `0;${k0};${kt(a.tiro + 0.02)};${kt(a.tiro + 0.12)};1`)}</circle>`;
    s += `<circle cx="${a.cx.toFixed(1)}" cy="${a.cy}" r="2" fill="#ff7a1a" opacity="0">${anim("r", "2;2;2;16;16", `0;${k1};${k2};${k3};1`)}${anim("opacity", "0;0;1;0;0", `0;${k1};${k2};${k3};1`)}</circle>`;
    s += `<circle cx="${a.cx.toFixed(1)}" cy="${a.cy}" r="2" fill="${C.GOLD2}" opacity="0">${anim("r", "2;2;2;9;9", `0;${k1};${k2};${k3};1`)}${anim("opacity", "0;0;1;0;0", `0;${k1};${k2};${k3};1`)}</circle>`;
    s += `<g opacity="0">${anim("opacity", "0;0;0.8;0;0", `0;${k2};${k3};${k4};1`)}<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 -14;0 -14" keyTimes="0;${k2};${k4};1" dur="${dur}" repeatCount="indefinite"/><circle cx="${a.cx.toFixed(1)}" cy="${a.cy - 4}" r="5" fill="#6b6b6b"/><circle cx="${(a.cx + 5).toFixed(1)}" cy="${a.cy - 7}" r="4" fill="#555"/></g>`;
  });

  // navio (vira de lado a cada linha)
  const vals = paradas.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(";");
  const kts = paradas.map((p) => kt(p.t)).join(";");
  const escalas = paradas.map((p) => `${p.s} 1`).join(";");
  s += `<g><animateMotion values="${vals}" keyTimes="${kts}" dur="${dur}" repeatCount="indefinite" calcMode="linear"/>
<g><animateTransform attributeName="transform" type="scale" values="${escalas}" keyTimes="${kts}" calcMode="discrete" dur="${dur}" repeatCount="indefinite"/>
<g><animateTransform attributeName="transform" type="rotate" values="-4;4;-4" dur="1.2s" repeatCount="indefinite"/>
<g transform="translate(-26 -36)"><path d="M0 26 L52 26 L45 40 L7 40 Z" fill="#5a3418" stroke="${C.BLK}" stroke-width="1.5"/><rect x="3" y="29" width="46" height="3" fill="${C.GOLD}"/>
<rect x="40" y="31" width="10" height="4" fill="#2f3237" stroke="${C.BLK}"/>
<line x1="20" y1="26" x2="20" y2="2" stroke="${C.BLK}" stroke-width="2"/><line x1="34" y1="26" x2="34" y2="8" stroke="${C.BLK}" stroke-width="2"/>
<path d="M8 5 Q20 10 32 5 L30 22 Q20 25 10 22 Z" fill="${C.OFF}" stroke="${C.BLK}"/><path d="M26 10 Q34 13 42 10 L41 23 Q34 25 27 23 Z" fill="${C.OFF}" stroke="${C.BLK}"/>
<path d="M20 2 L31 5 L20 8 Z" fill="${C.BLK}"/><circle cx="20" cy="13" r="2.5" fill="${C.BLK}"/></g></g></g></g>`;

  // placar e legenda
  s += `<text x="${gx}" y="${h - 46}" class="sf" font-size="16" fill="${C.OFF}">🏴‍☠️ <tspan fill="${C.GOLD}" font-weight="bold">Mini game:</tspan> cada contribuição é um alvo — o navio do capitão explode ${fmt(alvos.length)} delas a tiros de canhão!</text>
<text x="${gx}" y="${h - 24}" class="sf" font-size="15" fill="${C.MUT}">últimas 53 semanas de navegação</text>
<g transform="translate(${w - gx - 250} ${h - 36})"><text x="0" y="12" class="sf" font-size="15" fill="${C.MUT}">mar calmo</text>${cores.map((c, i) => `<rect x="${80 + i * 19}" y="0" width="15" height="15" rx="3" fill="${c}"/>`).join("")}<text x="182" y="12" class="sf" font-size="15" fill="${C.MUT}">tempestade</text></g>`;
  return s + "</g>";
}

function montar(d) {
  const fonte = readFileSync("pirata-one.woff2").toString("base64");
  let cab = readFileSync("bau-de-conquistas.svg", "utf8");
  cab = cab.replace(/<svg[^>]*>/, '<svg x="0" y="0" width="1100" height="370" viewBox="0 0 1100 370">').replace(/<title>.*?<\/title>/, "");
  const W = 1100, H = 370 + 16 + 330 + 16 + 430;
  const atualizado = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + 24}" width="100%">
<title>Baú de Conquistas de ${esc(USER)}</title>
<defs><style>@font-face{font-family:"PirataOne";src:url(data:font/woff2;base64,${fonte}) format("woff2")}
.pf{font-family:"PirataOne","Pirata One",Georgia,serif}.sf{font-family:"Segoe UI",Helvetica,Arial,sans-serif}</style></defs>
${cab}
${tesouros(d, 0, 386)}
${linguas(d, 556, 386)}
${navegacao(d, 0, 732)}
<text x="${W / 2}" y="${H + 18}" text-anchor="middle" class="sf" font-size="15" fill="#8a8a8a">registro atualizado em ${atualizado}</text>
</svg>`;
}

const VAZIO = process.env.VAZIO === "1"; // arquivo inicial, antes da primeira execução da Action
const dados = VAZIO ? { commits: 0, prs: 0, issues: 0, reviews: 0, privadas: 0, estrelas: 0, repos: 0, colaboracoes: 0, dias: dadosDemo().dias.map((q) => ({ ...q, contributionCount: 0 })), linguas: new Map() }
  : DEMO ? dadosDemo() : await dadosReais();
writeFileSync(OUT, montar(dados));
console.log(`OK: ${OUT} gerado para ${USER}`);
