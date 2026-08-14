const API_BASE = "/api";

// ---------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------

let authToken = localStorage.getItem("plusprint_token") || null;

function getAuthHeaders() {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

function showLogin(mensagemErro) {
  document.getElementById("app-root").classList.add("hidden");
  document.getElementById("login-overlay").classList.remove("hidden");
  const erroEl = document.getElementById("login-erro");
  if (mensagemErro) {
    erroEl.textContent = mensagemErro;
    erroEl.classList.remove("hidden");
  } else {
    erroEl.classList.add("hidden");
  }
  document.getElementById("login-senha").value = "";
  document.getElementById("login-email").focus();
}

function showApp(nomeUsuario) {
  document.getElementById("login-overlay").classList.add("hidden");
  document.getElementById("app-root").classList.remove("hidden");
  const el = document.getElementById("usuario-logado");
  if (el) el.textContent = nomeUsuario || "";
  iniciarApp();
}

function logout() {
  authToken = null;
  localStorage.removeItem("plusprint_token");
  showLogin();
}

async function tentarLogin(email, senha) {
  const res = await fetch(API_BASE + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  if (!res.ok) {
    const detalhe = await res.json().catch(() => ({}));
    throw new Error(detalhe.detail || "Não foi possível entrar.");
  }
  const dados = await res.json();
  authToken = dados.access_token;
  localStorage.setItem("plusprint_token", authToken);
  return dados;
}

async function verificarSessao() {
  if (!authToken) {
    showLogin();
    return;
  }
  try {
    const res = await fetch(API_BASE + "/auth/me", { headers: getAuthHeaders() });
    if (!res.ok) throw new Error();
    const usuario = await res.json();
    showApp(usuario.nome);
  } catch {
    authToken = null;
    localStorage.removeItem("plusprint_token");
    showLogin();
  }
}

document.getElementById("login-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;
  const btn = document.getElementById("login-submit");
  btn.disabled = true;
  btn.textContent = "Entrando...";
  try {
    const dados = await tentarLogin(email, senha);
    showApp(dados.nome);
  } catch (e) {
    showLogin(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
});

// ---------------------------------------------------------------
// Configuração de cada módulo: de onde vem o dado e como exibir/editar.
// Isso evita repetir a lógica de tabela/formulário 7 vezes — um único
// motor genérico (renderList, openModal) lê essa configuração.
// ---------------------------------------------------------------

const ENTITIES = {
  clientes: {
    title: "Clientes",
    endpoint: "/clientes/",
    sort: compareNome,
    showSeq: true,
    filterEmpresa: true,
    columns: [
      { key: "nome", label: "Nome" },
      { key: "telefone", label: "Telefone" },
      { key: "email", label: "Email" },
      { key: "endereco", label: "Endereço" },
    ],
    fields: [
      { name: "nome", label: "Nome", type: "text", required: true },
      { name: "cnpj_cpf", label: "CNPJ / CPF", type: "text" },
      { name: "telefone", label: "Telefone", type: "text" },
      { name: "email", label: "Email", type: "text" },
      { name: "endereco", label: "Endereço", type: "text" },
      { name: "contato_nome", label: "Pessoa de contato", type: "text" },
    ],
  },

  equipamentos: {
    title: "Equipamentos",
    endpoint: "/equipamentos/",
    columns: [
      { key: "id", label: "ID", mono: true },
      { key: "cliente_id", label: "Cliente", relation: "clientes" },
      { key: "marca", label: "Marca" },
      { key: "modelo", label: "Modelo" },
      { key: "tipo", label: "Tipo" },
    ],
    fields: [
      { name: "cliente_id", label: "Cliente", type: "select", relation: "clientes", required: true },
      { name: "marca", label: "Marca", type: "text", required: true },
      { name: "modelo", label: "Modelo", type: "text", required: true },
      { name: "numero_serie", label: "Número de série", type: "text" },
      { name: "tipo", label: "Tipo", type: "text" },
    ],
  },

  ordens: {
    title: "Ordens de Serviço",
    endpoint: "/ordens-servico/",
    custom: true, // este módulo usa formulário próprio (openOrdemModal) — inclui peças utilizadas
    sort: compareNumero,
    filterEmpresa: true,
    statusFilters: [
      { value: "aberto", label: "Aberto" },
      { value: "em_andamento", label: "Em andamento" },
      { value: "concluido", label: "Concluído" },
    ],
    columns: [
      { key: "numero", label: "Nº" },
      { key: "cliente_id", label: "Cliente", relation: "clientes" },
      { key: "status", label: "Status", badge: true },
      { key: "data_abertura", label: "Data de abertura", date: true },
      { key: "data_conclusao", label: "Data de conclusão", date: true },
    ],
    fields: [
      { name: "cliente_id", label: "Cliente", type: "select", relation: "clientes", required: true },
      { name: "orcamento_id", label: "Orçamento de origem (opcional)", type: "select", relation: "orcamentos" },
      { name: "descricao", label: "Descrição", type: "textarea", required: true },
      { name: "status", label: "Status", type: "select", options: ["aberto", "em_andamento", "concluido"] },
      { name: "data_abertura", label: "Data de abertura (opcional — padrão: hoje)", type: "date" },
    ],
  },

  orcamentos: {
    title: "Orçamentos",
    endpoint: "/orcamentos/",
    custom: true, // este módulo usa formulário próprio (openOrcamentoModal), não o motor genérico
    sort: compareNumero,
    filterEmpresa: true,
    statusFilters: [
      { value: "pendente", label: "Pendente" },
      { value: "aprovado", label: "Aprovado" },
      { value: "recusado", label: "Reprovado" },
    ],
    columns: [
      { key: "numero", label: "Nº" },
      { key: "cliente_id", label: "Cliente", relation: "clientes" },
      { key: "tipo", label: "Tipo", tipoOrcamento: true },
      { key: "data", label: "Emissão", date: true },
      { key: "valor_total", label: "Valor", money: true },
      { key: "status", label: "Status", badge: true },
    ],
    fields: [], // sem uso — preload de relações feito manualmente em openOrcamentoModal
  },

  contratos: {
    title: "Contratos",
    endpoint: "/contratos/",
    columns: [
      { key: "id", label: "ID", mono: true },
      { key: "cliente_id", label: "Cliente", relation: "clientes" },
      { key: "descricao", label: "Descrição" },
      { key: "valor_mensal", label: "Mensal", money: true },
      { key: "status", label: "Status", badge: true },
    ],
    fields: [
      { name: "cliente_id", label: "Cliente", type: "select", relation: "clientes", required: true },
      { name: "descricao", label: "Descrição", type: "text" },
      { name: "periodicidade_visita", label: "Periodicidade da visita", type: "select", options: ["mensal", "trimestral", "semestral"] },
      { name: "data_inicio", label: "Início", type: "date", required: true },
      { name: "data_fim", label: "Fim (opcional)", type: "date" },
      { name: "valor_mensal", label: "Valor mensal (R$)", type: "number", required: true },
      { name: "equipamento_ids", label: "Equipamentos (IDs separados por vírgula)", type: "text", listInt: true },
    ],
  },

  pecas: {
    title: "Peças / Estoque",
    endpoint: "/pecas/",
    sort: compareNome,
    columns: [
      { key: "id", label: "ID", mono: true },
      { key: "nome", label: "Nome" },
      { key: "partnumber", label: "Partnumber", mono: true },
      { key: "marca", label: "Marca" },
      { key: "modelo", label: "Modelo" },
      { key: "quantidade_estoque", label: "Estoque", mono: true, lowStock: true },
      { key: "valor_compra", label: "Custo (compra)", money: true },
      { key: "valor_unitario", label: "Valor de venda", money: true },
    ],
    fields: [
      { name: "nome", label: "Nome", type: "text", required: true },
      { name: "partnumber", label: "Partnumber", type: "text" },
      { name: "marca", label: "Marca da impressora", type: "text", placeholder: "ex: Zebra" },
      { name: "modelo", label: "Modelo da impressora", type: "text", placeholder: "ex: ZT411" },
      { name: "quantidade_estoque", label: "Quantidade em estoque", type: "number", required: true },
      { name: "valor_compra", label: "Valor de compra / custo (R$)", type: "number" },
      { name: "valor_unitario", label: "Valor de venda (R$)", type: "number", required: true },
    ],
  },

  despesas: {
    title: "Despesas",
    endpoint: "/despesas/",
    columns: [
      { key: "data", label: "Data", date: true },
      { key: "descricao", label: "Descrição" },
      { key: "categoria", label: "Categoria" },
      { key: "valor", label: "Valor", money: true },
    ],
    fields: [
      { name: "descricao", label: "Descrição", type: "text", required: true },
      {
        name: "categoria",
        label: "Categoria",
        type: "select",
        options: ["aluguel", "combustível", "salário", "imposto", "manutenção", "material de escritório", "outros"],
      },
      { name: "valor", label: "Valor (R$)", type: "number", required: true },
      { name: "data", label: "Data", type: "date", required: true },
      { name: "observacoes", label: "Observações", type: "textarea" },
    ],
  },
};

// Cache simples em memória, usado para preencher os <select> de relação
// (ex: lista de clientes dentro do formulário de Equipamento) sem repetir
// chamadas à API toda hora.
const cache = {};

let currentView = "dashboard";

// ---------------------------------------------------------------
// Requisições à API
// ---------------------------------------------------------------

async function apiGet(path) {
  const res = await fetch(API_BASE + path, { headers: getAuthHeaders() });
  if (res.status === 401) {
    logout();
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!res.ok) throw new Error(`Erro ${res.status} ao buscar ${path}`);
  return res.json();
}

async function apiSend(path, method, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    logout();
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!res.ok) {
    const detalhe = await res.json().catch(() => ({}));
    throw new Error(detalhe.detail || `Erro ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

async function apiDelete(path) {
  const res = await fetch(API_BASE + path, { method: "DELETE", headers: getAuthHeaders() });
  if (res.status === 401) {
    logout();
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!res.ok) throw new Error(`Erro ${res.status} ao excluir`);
}

async function abrirPdf(url) {
  try {
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (res.status === 401) {
      logout();
      return;
    }
    if (!res.ok) throw new Error("Não foi possível gerar o PDF.");
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch (e) {
    showAlert(e.message);
  }
}

// ---------------------------------------------------------------
// Status da API (indicador na sidebar)
// ---------------------------------------------------------------

async function checkApiStatus() {
  const el = document.getElementById("api-status");
  try {
    await apiGet("/health");
    el.className = "api-status ok";
    el.innerHTML = `<span class="light"></span> API conectada`;
  } catch {
    el.className = "api-status error";
    el.innerHTML = `<span class="light"></span> API offline`;
  }
}

// ---------------------------------------------------------------
// Alertas (erros/sucesso)
// ---------------------------------------------------------------

function showAlert(message, type = "error") {
  const box = document.getElementById("alert-box");
  box.textContent = message;
  box.className = `alert-box ${type}`;
  setTimeout(() => box.classList.add("hidden"), 4000);
}

// ---------------------------------------------------------------
// Formatação de células
// ---------------------------------------------------------------

function formatMoney(v) {
  return v == null ? "—" : `R$ ${Number(v).toFixed(2)}`;
}

function formatDate(v) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("pt-BR");
}

const TIPO_ORCAMENTO_LABEL = { tecnico: "Técnico / Manutenção", venda_equipamento: "Venda de Equipamento" };
function formatTipoOrcamento(v) {
  return TIPO_ORCAMENTO_LABEL[v] || TIPO_ORCAMENTO_LABEL.tecnico;
}

function labelForItem(item) {
  if (!item) return "";
  if (item.nome) return item.nome;
  if (item.descricao) return item.descricao;
  if (item.descricao_itens) return item.descricao_itens;
  if (item.marca && item.modelo) {
    return `${item.marca} ${item.modelo}${item.numero_serie ? " — SN " + item.numero_serie : ""}`;
  }
  if (item.itens !== undefined) {
    // é um Orçamento — identifica pelo número da proposta (ou id, se numero não foi preenchido)
    return `Orçamento nº ${item.numero || item.id}`;
  }
  return `#${item.id}`;
}

function relationLabel(entityKey, id) {
  if (id == null) return "—";
  const list = cache[entityKey] || [];
  const item = list.find((i) => i.id === id);
  if (!item) return `#${id}`;
  return labelForItem(item);
}

// ---------------------------------------------------------------
// Renderização: Dashboard
// ---------------------------------------------------------------

async function renderDashboard() {
  const root = document.getElementById("view-root");
  root.innerHTML = `<div class="empty-state">Carregando indicadores...</div>`;

  try {
    const d = await apiGet("/dashboard/");
    root.innerHTML = `
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">OS abertas</div>
          <div class="metric-value">${d.os_abertas}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">OS em andamento</div>
          <div class="metric-value">${d.os_em_andamento}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">OS concluídas</div>
          <div class="metric-value">${d.os_concluidas}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Contratos ativos</div>
          <div class="metric-value">${d.contratos_ativos}</div>
        </div>
      </div>

      <h3 class="panel-title">Peças com estoque baixo</h3>
      <div class="table-wrap">
        ${
          d.pecas_com_estoque_baixo.length === 0
            ? `<div class="empty-state">Nenhuma peça com estoque baixo no momento.</div>`
            : `<table>
                <thead><tr><th>Nome</th><th>Estoque</th><th>Valor unitário</th></tr></thead>
                <tbody>
                  ${d.pecas_com_estoque_baixo
                    .map(
                      (p) => `<tr>
                        <td>${p.nome}</td>
                        <td class="mono" style="color:var(--red)">${p.quantidade_estoque}</td>
                        <td class="mono">${formatMoney(p.valor_unitario)}</td>
                      </tr>`
                    )
                    .join("")}
                </tbody>
              </table>`
        }
      </div>
    `;
  } catch (e) {
    root.innerHTML = `<div class="empty-state">Não foi possível carregar o dashboard. A API está rodando?</div>`;
  }
}

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

let financeiroAnoSelecionado = null;

function buildFaturamentoPanelHtml(anos, anoSelecionado, pontos) {
  const botoesAno = anos
    .map(
      (a) =>
        `<button type="button" class="btn ${a === anoSelecionado ? "btn-primary" : ""}" style="padding:6px 14px;font-size:12.5px" data-ano-faturamento="${a}">${a}</button>`
    )
    .join("");

  return `
    <div class="panel-title" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span>Faturamento x Líquido</span>
      <span style="display:flex;gap:6px">${botoesAno}</span>
    </div>
    <div class="chart-card">
      <div class="chart-legend">
        <span><span class="dot" style="background:var(--amber)"></span> Faturamento</span>
        <span><span class="dot" style="background:var(--green)"></span> Líquido</span>
        <span style="margin-left:auto;color:#9A9A93;font-size:12.5px">Clique num mês para ver o detalhe</span>
      </div>
      ${buildFaturamentoChartSvg(pontos)}
    </div>
  `;
}

async function selecionarAnoFaturamento(ano) {
  financeiroAnoSelecionado = ano;
  const wrap = document.getElementById("faturamento-chart-wrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="empty-state">Carregando...</div>`;
  try {
    const [anos, pontos] = await Promise.all([
      apiGet("/financeiro/anos-disponiveis"),
      apiGet(`/financeiro/faturamento-mensal?ano=${ano}`),
    ]);
    wrap.innerHTML = buildFaturamentoPanelHtml(anos, ano, pontos);
    attachFaturamentoPanelListeners();
  } catch (e) {
    wrap.innerHTML = `<div class="empty-state">Não foi possível carregar o gráfico.</div>`;
  }
}

function attachFaturamentoPanelListeners() {
  document.querySelectorAll("[data-ano-faturamento]").forEach((btn) => {
    btn.addEventListener("click", () => selecionarAnoFaturamento(Number(btn.dataset.anoFaturamento)));
  });
  document.querySelectorAll(".chart-bar-group").forEach((g) => {
    g.addEventListener("click", () => {
      openFaturamentoMesModal(Number(g.dataset.ano), Number(g.dataset.mes));
    });
  });
}
const SITUACAO_LABEL = {
  pago: "Pago",
  em_dia: "Em dia",
  vence_em_breve: "Vence em breve",
  atrasado: "Atrasado",
  aguardando_conclusao: "Aguardando conclusão",
};

function buildFaturamentoChartSvg(pontos) {
  const largura = 760;
  const altura = 200;
  const padEsq = 46;
  const padBaixo = 24;
  const padTopo = 10;
  const areaW = largura - padEsq - 10;
  const areaH = altura - padTopo - padBaixo;

  const maxValor = Math.max(1, ...pontos.map((p) => Math.max(Number(p.faturamento), Number(p.liquido))));
  const passo = areaW / pontos.length;
  const escala = (v) => (v / maxValor) * areaH;

  const barras = pontos
    .map((p, i) => {
      const x = padEsq + i * passo;
      const wBar = Math.min(22, passo * 0.32);
      const hFat = escala(Number(p.faturamento));
      const hLiq = escala(Number(p.liquido));
      const yFat = padTopo + areaH - hFat;
      const yLiq = padTopo + areaH - hLiq;
      const label = MESES_ABREV[p.mes - 1];
      return `
        <g class="chart-bar-group" data-ano="${p.ano}" data-mes="${p.mes}" style="cursor:pointer">
          <rect x="${x}" y="${padTopo}" width="${passo}" height="${areaH}" fill="transparent"></rect>
          <rect x="${x + passo / 2 - wBar - 2}" y="${yFat}" width="${wBar}" height="${Math.max(hFat, 1)}" fill="var(--amber)" rx="2"></rect>
          <rect x="${x + passo / 2 + 2}" y="${yLiq}" width="${wBar}" height="${Math.max(hLiq, 1)}" fill="var(--green)" rx="2"></rect>
          <text x="${x + passo / 2}" y="${altura - 6}" font-size="9.5" text-anchor="middle" fill="#5B5F66">${label}</text>
        </g>
      `;
    })
    .join("");

  const linhaBase = padTopo + areaH;

  return `
    <svg viewBox="0 0 ${largura} ${altura}" width="100%" style="max-width:100%;height:auto;font-family:var(--font-body)">
      <line x1="${padEsq}" y1="${linhaBase}" x2="${largura - 10}" y2="${linhaBase}" stroke="#E3E2DD" stroke-width="1"></line>
      <text x="4" y="${padTopo + 6}" font-size="9.5" fill="#5B5F66">${formatMoney(maxValor)}</text>
      ${barras}
    </svg>
  `;
}

function buildRankingHtml(ranking) {
  if (ranking.length === 0) return `<div class="empty-state">Nenhum faturamento realizado ainda.</div>`;
  const max = Math.max(...ranking.map((r) => Number(r.faturamento_total)));
  return ranking
    .slice(0, 10)
    .map(
      (r, i) => `
      <div class="ranking-row">
        <span class="pos">${i + 1}º</span>
        <span class="nome">${r.cliente_nome}</span>
        <span class="ranking-bar-track"><span class="ranking-bar-fill" style="width:${(Number(r.faturamento_total) / max) * 100}%"></span></span>
        <span class="valor">${formatMoney(r.faturamento_total)}</span>
      </div>
    `
    )
    .join("");
}

function buildContasReceberHtml(contas) {
  if (contas.length === 0) return `<div class="empty-state">Nenhum orçamento aprovado no momento.</div>`;
  const linhas = contas
    .map((c) => {
      const badge = `<span class="badge status-${c.situacao}">${SITUACAO_LABEL[c.situacao] || c.situacao}</span>`;
      const venc = c.data_vencimento ? formatDate(c.data_vencimento) : "—";
      const acao = c.pago ? "" : `<button class="btn btn-pagar" data-marcar-pago="${c.orcamento_id}">Marcar como pago</button>`;
      return `<tr>
        <td class="mono">${c.numero || "—"}</td>
        <td>${c.cliente_nome}</td>
        <td>${c.condicoes_pagamento || "—"}</td>
        <td>${venc}</td>
        <td class="mono">${formatMoney(c.valor_total)}</td>
        <td>${badge}</td>
        <td>${acao}</td>
      </tr>`;
    })
    .join("");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nº</th><th>Cliente</th><th>Condição</th><th>Vencimento</th><th>Valor</th><th>Situação</th><th></th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
  `;
}

async function renderFinanceiro() {
  const root = document.getElementById("view-root");
  root.innerHTML = `<div class="empty-state">Carregando indicadores...</div>`;

  try {
    const [resumo, contas, anos, ranking] = await Promise.all([
      apiGet("/financeiro/resumo"),
      apiGet("/financeiro/contas-a-receber"),
      apiGet("/financeiro/anos-disponiveis"),
      apiGet("/financeiro/por-cliente"),
    ]);

    if (financeiroAnoSelecionado === null || !anos.includes(financeiroAnoSelecionado)) {
      financeiroAnoSelecionado = anos[anos.length - 1];
    }
    const pontos = await apiGet(`/financeiro/faturamento-mensal?ano=${financeiroAnoSelecionado}`);

    const agora = new Date();
    const anoAtual = agora.getFullYear();
    const mesAtual = agora.getMonth() + 1;

    root.innerHTML = `
      <h3 class="panel-title">Este mês</h3>
      <div class="metric-grid">
        <div class="metric-card metric-card-clickable" data-detalhe-ano="${anoAtual}" data-detalhe-mes="${mesAtual}">
          <div class="metric-label">Faturamento</div>
          <div class="metric-value amber">${formatMoney(resumo.faturamento_mes)}</div>
        </div>
        <div class="metric-card metric-card-clickable" data-detalhe-ano="${anoAtual}" data-detalhe-mes="${mesAtual}">
          <div class="metric-label">Custo de peças/produtos</div>
          <div class="metric-value" style="color:var(--red)">${formatMoney(resumo.custo_pecas_mes)}</div>
        </div>
        <div class="metric-card metric-card-clickable" data-detalhe-ano="${anoAtual}" data-detalhe-mes="${mesAtual}">
          <div class="metric-label">Despesas</div>
          <div class="metric-value" style="color:var(--red)">${formatMoney(resumo.despesas_mes)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Líquido</div>
          <div class="metric-value" style="color:var(--green)">${formatMoney(resumo.liquido_mes)}</div>
        </div>
      </div>

      <h3 class="panel-title">Este ano</h3>
      <div class="metric-grid">
        <div class="metric-card metric-card-clickable" data-detalhe-ano="${anoAtual}">
          <div class="metric-label">Faturamento</div>
          <div class="metric-value amber">${formatMoney(resumo.faturamento_ano)}</div>
        </div>
        <div class="metric-card metric-card-clickable" data-detalhe-ano="${anoAtual}">
          <div class="metric-label">Custo de peças/produtos</div>
          <div class="metric-value" style="color:var(--red)">${formatMoney(resumo.custo_pecas_ano)}</div>
        </div>
        <div class="metric-card metric-card-clickable" data-detalhe-ano="${anoAtual}">
          <div class="metric-label">Despesas</div>
          <div class="metric-value" style="color:var(--red)">${formatMoney(resumo.despesas_ano)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Líquido</div>
          <div class="metric-value" style="color:var(--green)">${formatMoney(resumo.liquido_ano)}</div>
        </div>
      </div>

      <div id="faturamento-chart-wrap">${buildFaturamentoPanelHtml(anos, financeiroAnoSelecionado, pontos)}</div>

      <h3 class="panel-title">Faturamento por cliente</h3>
      <div class="ranking-list">${buildRankingHtml(ranking)}</div>

      <h3 class="panel-title" style="margin-top:28px">Contas a Receber</h3>
      <div id="contas-a-receber-wrap">${buildContasReceberHtml(contas)}</div>
    `;

    document.querySelectorAll("[data-marcar-pago]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await apiSend(`/orcamentos/${btn.dataset.marcarPago}`, "PUT", { pago: true });
          showAlert("Orçamento marcado como pago.", "success");
          renderFinanceiro();
        } catch (e) {
          showAlert(e.message);
        }
      });
    });

    document.querySelectorAll("[data-detalhe-ano]").forEach((card) => {
      card.addEventListener("click", () => {
        const ano = Number(card.dataset.detalheAno);
        const mes = card.dataset.detalheMes ? Number(card.dataset.detalheMes) : null;
        openFaturamentoMesModal(ano, mes);
      });
    });

    attachFaturamentoPanelListeners();
  } catch (e) {
    root.innerHTML = `<div class="empty-state">Não foi possível carregar os dados financeiros. A API está rodando?</div>`;
  }
}

// ---------------------------------------------------------------
// Modal de detalhe mensal (clique numa barra do gráfico Financeiro)
// ---------------------------------------------------------------

function buildDetalheMensalHtml(detalhe) {
  const totalOrcamentos = detalhe.orcamentos.reduce((s, o) => s + Number(o.valor), 0);
  const totalPecas = detalhe.pecas.reduce((s, p) => s + Number(p.custo_total), 0);
  const totalDespesas = detalhe.despesas.reduce((s, d) => s + Number(d.valor), 0);

  const orcamentosHtml =
    detalhe.orcamentos.length === 0
      ? `<div class="empty-state">Nenhum orçamento faturado neste mês.</div>`
      : `<div class="table-wrap"><table>
          <thead><tr><th>Nº</th><th>Cliente</th><th>Tipo</th><th>Valor</th><th>Custo</th><th>Margem</th></tr></thead>
          <tbody>${detalhe.orcamentos
            .map((o) => {
              const temCusto = o.tipo === "venda_equipamento" && o.custo != null;
              const margem = temCusto ? Number(o.valor) - Number(o.custo) : null;
              return `<tr>
                <td class="mono">${o.numero || "—"}</td>
                <td>${o.cliente_nome}</td>
                <td>${o.tipo === "venda_equipamento" ? "Venda de equipamento" : "Técnico"}</td>
                <td class="mono">${formatMoney(o.valor)}</td>
                <td class="mono">${temCusto ? formatMoney(o.custo) : "—"}</td>
                <td class="mono">${temCusto ? formatMoney(margem) : "—"}</td>
              </tr>`;
            })
            .join("")}</tbody>
        </table></div>`;

  const pecasHtml =
    detalhe.pecas.length === 0
      ? `<div class="empty-state">Nenhuma peça usada neste mês.</div>`
      : `<div class="table-wrap"><table>
          <thead><tr><th>Peça</th><th>Qtde</th><th>Custo</th></tr></thead>
          <tbody>${detalhe.pecas
            .map(
              (p) => `<tr>
                <td>${p.peca_nome}</td>
                <td class="mono">${p.quantidade}</td>
                <td class="mono">${formatMoney(p.custo_total)}</td>
              </tr>`
            )
            .join("")}</tbody>
        </table></div>`;

  const despesasHtml =
    detalhe.despesas.length === 0
      ? `<div class="empty-state">Nenhuma despesa lançada neste mês.</div>`
      : `<div class="table-wrap"><table>
          <thead><tr><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead>
          <tbody>${detalhe.despesas
            .map(
              (d) => `<tr>
                <td>${d.descricao}</td>
                <td>${d.categoria || "—"}</td>
                <td class="mono">${formatMoney(d.valor)}</td>
              </tr>`
            )
            .join("")}</tbody>
        </table></div>`;

  return `
    <h3 class="panel-title" style="margin-top:0">Orçamentos faturados <span class="mono" style="font-weight:400;color:#5B5F66">— ${formatMoney(totalOrcamentos)}</span></h3>
    ${orcamentosHtml}

    <h3 class="panel-title" style="margin-top:22px">Peças usadas <span class="mono" style="font-weight:400;color:#5B5F66">— ${formatMoney(totalPecas)}</span></h3>
    ${pecasHtml}

    <h3 class="panel-title" style="margin-top:22px">Despesas <span class="mono" style="font-weight:400;color:#5B5F66">— ${formatMoney(totalDespesas)}</span></h3>
    ${despesasHtml}
  `;
}

async function openFaturamentoMesModal(ano, mes = null) {
  document.getElementById("modal-title").textContent = mes ? `${MESES_ABREV[mes - 1]}/${ano} — Detalhe` : `${ano} — Detalhe do ano`;
  document.getElementById("modal").classList.add("modal-lg");
  const form = document.getElementById("modal-form");
  form.innerHTML = `<div class="empty-state">Carregando...</div>`;
  document.getElementById("modal-overlay").classList.remove("hidden");

  try {
    const qs = mes ? `ano=${ano}&mes=${mes}` : `ano=${ano}`;
    const detalhe = await apiGet(`/financeiro/detalhe-mensal?${qs}`);
    form.innerHTML =
      buildDetalheMensalHtml(detalhe) +
      `<div class="modal-actions">
        <button type="button" class="btn btn-primary" id="modal-cancel">Fechar</button>
      </div>`;
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
  } catch (e) {
    form.innerHTML = `<div class="empty-state">Não foi possível carregar o detalhe deste período.</div>`;
  }
}

// ---------------------------------------------------------------
// Renderização: Listagem genérica (Clientes, Equipamentos, ...)
// ---------------------------------------------------------------

function compareNome(a, b) {
  return (a.nome || "").localeCompare(b.nome || "", "pt-BR", { sensitivity: "base" });
}

function compareNumero(a, b) {
  if (!a.numero && !b.numero) return 0;
  if (!a.numero) return 1; // sem número vai para o fim
  if (!b.numero) return -1;
  return a.numero.localeCompare(b.numero, undefined, { numeric: true, sensitivity: "base" });
}

async function preloadRelations(config) {
  // Garante que os dados de relação (ex: clientes, para exibir nome em vez de ID)
  // estejam no cache antes de desenhar a tabela.
  const needed = new Set();
  config.columns.forEach((c) => c.relation && needed.add(c.relation));
  config.fields.forEach((f) => f.relation && needed.add(f.relation));
  for (const key of needed) {
    if (!cache[key]) {
      cache[key] = await apiGet(ENTITIES[key].endpoint);
      if (ENTITIES[key].sort) cache[key].sort(ENTITIES[key].sort);
    }
  }
}

const filterState = {}; // por viewKey: { status: string|null, empresa: string }

function nomeClienteDoItem(viewKey, item) {
  if (viewKey === "clientes") return item.nome || "";
  const cli = (cache.clientes || []).find((c) => c.id === item.cliente_id);
  return cli ? cli.nome : "";
}

function applyFilters(viewKey, items) {
  const state = filterState[viewKey] || {};
  let filtrados = items;
  if (state.status) filtrados = filtrados.filter((i) => i.status === state.status);
  if (state.empresa) {
    const termo = state.empresa.toLowerCase();
    filtrados = filtrados.filter((i) => nomeClienteDoItem(viewKey, i).toLowerCase().includes(termo));
  }
  return filtrados;
}

function buildFilterBarHtml(viewKey, config) {
  const state = filterState[viewKey];
  const statusBtns = (config.statusFilters || [])
    .map(
      (s) =>
        `<button type="button" class="filter-btn ${state.status === s.value ? "active" : ""}" data-filter-status="${s.value}">${s.label}</button>`
    )
    .join("");
  const searchHtml = config.filterEmpresa
    ? `<input type="text" id="filtro-empresa" class="filter-search" placeholder="Buscar por empresa..." value="${state.empresa || ""}">`
    : "";
  return `<div class="filter-bar">${statusBtns}${searchHtml}</div>`;
}

function wireFilterBar(viewKey) {
  document.querySelectorAll("[data-filter-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.filterStatus;
      filterState[viewKey].status = filterState[viewKey].status === val ? null : val;
      document.querySelectorAll("[data-filter-status]").forEach((b) => b.classList.toggle("active", b.dataset.filterStatus === filterState[viewKey].status));
      renderTableInto(viewKey, cache[viewKey]);
    });
  });
  const searchInput = document.getElementById("filtro-empresa");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      filterState[viewKey].empresa = searchInput.value;
      renderTableInto(viewKey, cache[viewKey]);
    });
  }
}

function renderTableInto(viewKey, allItems) {
  const config = ENTITIES[viewKey];
  const container = document.getElementById("table-container");
  const items = applyFilters(viewKey, allItems);

  if (items.length === 0) {
    container.innerHTML = `<div class="table-wrap"><div class="empty-state">Nenhum resultado encontrado.</div></div>`;
    return;
  }

  const headerHtml = (config.showSeq ? `<th>#</th>` : "") + config.columns.map((c) => `<th>${c.label}</th>`).join("") + "<th></th>";

  const rowsHtml = items
    .map((item, index) => {
      const seqCell = config.showSeq ? `<td class="mono">${index + 1}</td>` : "";
      const cells = config.columns
        .map((c) => {
          let value = item[c.key];
          if (c.relation) value = relationLabel(c.relation, value);
          else if (c.money) value = formatMoney(value);
          else if (c.date) value = formatDate(value);
          else if (c.tipoOrcamento) value = formatTipoOrcamento(value);
          else if (c.badge) return `<td><span class="badge status-${value}">${value}</span></td>`;
          else if (value == null || value === "") value = "—";

          const cls = c.mono ? "mono" : "";
          const style = c.lowStock && item.quantidade_estoque < 5 ? 'style="color:var(--red);font-weight:600"' : "";
          return `<td class="${cls}" ${style}>${value}</td>`;
        })
        .join("");
      const pdfBtn =
        viewKey === "orcamentos"
          ? `<button class="btn btn-pdf" data-pdf="${item.id}">PDF</button>`
          : viewKey === "ordens"
          ? `<button class="btn btn-pdf" data-pdf-os="${item.id}">PDF</button>`
          : "";
      const osBtn =
        viewKey === "orcamentos" && item.status === "aprovado"
          ? `<button class="btn btn-os" data-gerar-os="${item.id}">Gerar OS</button>`
          : "";
      const rowAttr = viewKey === "ordens" ? `data-open-os="${item.id}"` : "";
      return `<tr ${rowAttr}>${seqCell}${cells}<td class="row-actions">${pdfBtn}${osBtn}<button class="btn btn-edit" data-edit="${item.id}">Editar</button><button class="btn btn-danger" data-delete="${item.id}">Excluir</button></td></tr>`;
    })
    .join("");

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>${headerHtml}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  container.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => handleDelete(viewKey, btn.dataset.delete));
  });
  container.querySelectorAll("[data-pdf]").forEach((btn) => {
    btn.addEventListener("click", () => abrirPdf(`${API_BASE}/orcamentos/${btn.dataset.pdf}/pdf`));
  });
  container.querySelectorAll("[data-pdf-os]").forEach((btn) => {
    btn.addEventListener("click", () => abrirPdf(`${API_BASE}/ordens-servico/${btn.dataset.pdfOs}/pdf`));
  });
  container.querySelectorAll("[data-gerar-os]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = items.find((i) => String(i.id) === btn.dataset.gerarOs);
      handleGerarOS(item);
    });
  });
  container.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = items.find((i) => String(i.id) === btn.dataset.edit);
      if (viewKey === "orcamentos") openOrcamentoModal(item);
      else if (viewKey === "ordens") openOrdemModal(item);
      else openModal(viewKey, item);
    });
  });
  container.querySelectorAll("[data-open-os]").forEach((tr) => {
    tr.addEventListener("click", (ev) => {
      if (ev.target.closest("button")) return; // não interfere nos botões da linha
      const item = items.find((i) => String(i.id) === tr.dataset.openOs);
      openOrdemModal(item);
    });
  });
}

async function renderList(viewKey) {
  const config = ENTITIES[viewKey];
  const root = document.getElementById("view-root");
  root.innerHTML = `<div class="empty-state">Carregando...</div>`;

  try {
    await preloadRelations(config);
    const items = await apiGet(config.endpoint);
    if (config.sort) items.sort(config.sort);
    cache[viewKey] = items;

    if (items.length === 0) {
      root.innerHTML = `<div class="table-wrap"><div class="empty-state">Nenhum registro ainda. Clique em "+ Novo" para começar.</div></div>`;
      return;
    }

    if (!filterState[viewKey]) filterState[viewKey] = { status: null, empresa: "" };
    const temFiltro = config.statusFilters || config.filterEmpresa;

    root.innerHTML = (temFiltro ? buildFilterBarHtml(viewKey, config) : "") + `<div id="table-container"></div>`;
    if (temFiltro) wireFilterBar(viewKey);

    renderTableInto(viewKey, items);
  } catch (e) {
    root.innerHTML = `<div class="empty-state">Não foi possível carregar os dados. A API está rodando?</div>`;
  }
}

function montarDescricaoOS(orcamento) {
  if (orcamento.equipamentos && orcamento.equipamentos.length) {
    const blocos = orcamento.equipamentos
      .map((eq) => {
        const label = relationLabel("equipamentos", eq.equipamento_id);
        const partes = [];
        if (eq.defeitos_constatados) partes.push(`Diagnóstico: ${eq.defeitos_constatados}`);
        if (eq.solucao_adotada) partes.push(`Solução: ${eq.solucao_adotada}`);
        if (partes.length === 0) return "";
        return `${label}\n${partes.join("\n")}`;
      })
      .filter(Boolean);
    if (blocos.length) return blocos.join("\n\n");
  }
  if (orcamento.itens && orcamento.itens.length) {
    return `Serviço conforme orçamento nº ${orcamento.numero || orcamento.id}: ` + orcamento.itens.map((i) => i.descricao).join(", ");
  }
  return `Atendimento referente ao orçamento nº ${orcamento.numero || orcamento.id}`;
}

async function handleGerarOS(orcamento) {
  if (!cache.equipamentos) cache.equipamentos = await apiGet(ENTITIES.equipamentos.endpoint);
  const prefill = {
    cliente_id: orcamento.cliente_id,
    equipamento_ids: (orcamento.equipamentos || []).map((e) => e.equipamento_id),
    orcamento_id: orcamento.id,
    descricao: montarDescricaoOS(orcamento),
    status: "aberto",
  };
  await openOrdemModal(null, prefill);
}

async function handleDelete(viewKey, id) {
  if (!confirm("Excluir este registro?")) return;
  const config = ENTITIES[viewKey];
  try {
    await apiDelete(`${config.endpoint}${id}`);
    showAlert("Registro excluído.", "success");
    renderList(viewKey);
  } catch (e) {
    showAlert(e.message);
  }
}

// ---------------------------------------------------------------
// Modal de criação
// ---------------------------------------------------------------

async function openModal(viewKey, existingItem = null, prefillData = null) {
  const config = ENTITIES[viewKey];
  await preloadRelations(config);

  const isEdit = existingItem != null;
  document.getElementById("modal-title").textContent = `${isEdit ? "Editar" : "Novo"} — ${config.title}`;
  const form = document.getElementById("modal-form");
  form.setAttribute("autocomplete", "off");

  form.innerHTML =
    config.fields
      .map((f) => {
        let currentValue = isEdit ? existingItem[f.name] : prefillData ? prefillData[f.name] : undefined;
        if (isEdit && f.listInt && Array.isArray(currentValue)) currentValue = currentValue.join(", ");
        if (f.type === "date" && typeof currentValue === "string") currentValue = currentValue.slice(0, 10);
        const valueAttr = currentValue != null ? String(currentValue) : "";

        if (f.type === "select") {
          const options = f.relation
            ? (cache[f.relation] || []).map(
                (i) => `<option value="${i.id}" ${String(i.id) === valueAttr ? "selected" : ""}>${labelForItem(i)}</option>`
              )
            : f.options.map((o) => `<option value="${o}" ${o === valueAttr ? "selected" : ""}>${o}</option>`);
          return `<div class="field">
            <label>${f.label}${f.required ? " *" : ""}</label>
            <select name="${f.name}" ${f.required ? "required" : ""}>
              ${f.relation ? `<option value="">Selecione...</option>` : ""}
              ${options.join("")}
            </select>
          </div>`;
        }
        if (f.type === "textarea") {
          return `<div class="field">
            <label>${f.label}${f.required ? " *" : ""}</label>
            <textarea name="${f.name}" ${f.required ? "required" : ""}>${valueAttr}</textarea>
          </div>`;
        }
        return `<div class="field">
          <label>${f.label}${f.required ? " *" : ""}</label>
          <input type="${f.type}" name="${f.name}" value="${valueAttr}" ${f.placeholder ? `placeholder="${f.placeholder}"` : ""} ${f.type === "number" ? 'step="0.01"' : ""} ${f.required ? "required" : ""}>
        </div>`;
      })
      .join("") +
    `<div class="modal-actions">
      <button type="button" class="btn" id="modal-cancel">Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar</button>
    </div>`;

  document.getElementById("modal-overlay").classList.remove("hidden");
  document.getElementById("modal-cancel").addEventListener("click", closeModal);

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());

    // Conversões de tipo: o HTML sempre entrega string, mas a API espera
    // número/inteiro em vários campos.
    config.fields.forEach((f) => {
      if (data[f.name] === "") { delete data[f.name]; return; }
      if (f.type === "number") data[f.name] = Number(data[f.name]);
      if (f.type === "select" && f.relation) data[f.name] = Number(data[f.name]);
      if (f.listInt) data[f.name] = data[f.name].split(",").map((v) => Number(v.trim())).filter((v) => !isNaN(v));
    });

    try {
      if (isEdit) {
        await apiSend(`${config.endpoint}${existingItem.id}`, "PUT", data);
        showAlert("Registro atualizado com sucesso.", "success");
      } else {
        await apiSend(config.endpoint, "POST", data);
        showAlert("Registro criado com sucesso.", "success");
      }
      closeModal();
      switchView(viewKey);
    } catch (e) {
      showAlert(e.message);
    }
  };
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  document.getElementById("modal").classList.remove("modal-lg");
}

// ---------------------------------------------------------------
// Formulário customizado de Orçamento (itens dinâmicos + condições comerciais)
// ---------------------------------------------------------------

let itemRowCount = 0;

function itemRowHtml(item = {}) {
  itemRowCount++;
  const id = `item-${itemRowCount}`;
  return `
    <tr data-item-row="${id}">
      <td><input type="number" step="0.01" class="item-qtd" value="${item.quantidade ?? ""}" placeholder="Qtde."></td>
      <td><input type="text" class="item-desc" value="${item.descricao ?? ""}" placeholder="Descrição"></td>
      <td><input type="number" step="0.01" class="item-valor" value="${item.valor_unitario ?? ""}" placeholder="Unitário"></td>
      <td class="item-total mono">R$ 0,00</td>
      <td><button type="button" class="btn btn-danger" data-remove-row="${id}">×</button></td>
    </tr>
  `;
}

function recalcularSubtotal(form) {
  let subtotal = 0;
  form.querySelectorAll("[data-item-row]").forEach((row) => {
    const qtd = parseFloat(row.querySelector(".item-qtd").value) || 0;
    const valor = parseFloat(row.querySelector(".item-valor").value) || 0;
    const total = qtd * valor;
    row.querySelector(".item-total").textContent = formatMoney(total);
    subtotal += total;
  });
  form.querySelector("#subtotal-display").textContent = formatMoney(subtotal);
}

function attachItemListeners(formEl) {
  formEl.querySelectorAll("[data-remove-row]").forEach((btn) => {
    btn.onclick = () => {
      if (formEl.querySelectorAll("[data-item-row]").length <= 1) return; // mantém ao menos 1 linha
      formEl.querySelector(`[data-item-row="${btn.dataset.removeRow}"]`).remove();
      recalcularSubtotal(formEl);
    };
  });
  formEl.querySelectorAll(".item-qtd, .item-valor").forEach((input) => {
    input.oninput = () => recalcularSubtotal(formEl);
  });
}

async function openOrcamentoModal(existingItem) {
  await preloadRelations({ columns: [{ relation: "clientes" }, { relation: "equipamentos" }], fields: [] });

  const isEdit = existingItem != null;
  document.getElementById("modal-title").textContent = `${isEdit ? "Editar" : "Novo"} — Orçamento`;
  document.getElementById("modal").classList.add("modal-lg");

  const clientesOptions = (cache.clientes || [])
    .map((c) => `<option value="${c.id}" ${isEdit && c.id === existingItem.cliente_id ? "selected" : ""}>${c.nome}</option>`)
    .join("");

  const tipoAtual = isEdit ? existingItem.tipo || "tecnico" : "tecnico";

  // Cliente selecionado no momento — usado para filtrar o seletor de
  // equipamentos, mostrando só os equipamentos daquele cliente.
  let clienteIdAtual = isEdit ? existingItem.cliente_id : null;

  // Cada equipamento adicionado carrega seu próprio diagnóstico/solução —
  // controlado em memória enquanto o formulário está aberto, e lido do DOM
  // (cada card tem suas próprias textareas) só no momento de salvar.
  let equipamentosSelecionados = isEdit
    ? (existingItem.equipamentos || []).map((e) => ({
        equipamento_id: e.equipamento_id,
        defeitos_constatados: e.defeitos_constatados || "",
        solucao_adotada: e.solucao_adotada || "",
      }))
    : [];

  const equipamentosPickerOptions = () =>
    (cache.equipamentos || [])
      .filter((e) => !clienteIdAtual || e.cliente_id === clienteIdAtual)
      .filter((e) => !equipamentosSelecionados.some((s) => s.equipamento_id === e.id))
      .map((e) => `<option value="${e.id}">${labelForItem(e)}</option>`)
      .join("");

  // Itens de venda de equipamento novo (NCM, Part Number, garantia, IPI/ICMS etc.)
  let itensVenda = isEdit && existingItem.itens_venda && existingItem.itens_venda.length
    ? existingItem.itens_venda.map((i) => ({ ...i }))
    : [];

  const v = (campo, def = "") => (isEdit && existingItem[campo] != null ? existingItem[campo] : def);
  const itensExistentes = isEdit && existingItem.itens.length ? existingItem.itens : [{}];

  const form = document.getElementById("modal-form");
  form.setAttribute("autocomplete", "off");
  form.innerHTML = `
    <div class="field-row">
      <div class="field"><label>Nº da proposta</label><input type="text" name="numero" value="${v("numero")}"></div>
      <div class="field"><label>Cliente *</label>
        <select name="cliente_id" required>
          <option value="">Selecione...</option>
          ${clientesOptions}
        </select>
      </div>
    </div>

    <div class="field-row">
      <div class="field"><label>Tipo de orçamento</label>
        <select name="tipo" id="orcamento-tipo">
          <option value="tecnico" ${tipoAtual === "tecnico" ? "selected" : ""}>Técnico / Manutenção</option>
          <option value="venda_equipamento" ${tipoAtual === "venda_equipamento" ? "selected" : ""}>Venda de Equipamento</option>
        </select>
      </div>
      <div class="field"><label>Data de emissão</label><input type="date" name="data" value="${v("data").slice(0, 10)}" placeholder="hoje"></div>
    </div>

    <div id="secao-tecnico">
      <div class="field"><label>Local</label><input type="text" name="local_equipamento" value="${v("local_equipamento")}" placeholder="ex: Loja Mooca"></div>

      <label class="field-label-block">Equipamentos — defeito e solução de cada um</label>
      <div class="picker-row">
        <select id="equipamento-picker">${equipamentosPickerOptions()}</select>
        <button type="button" class="btn" id="btn-add-equip">+ Adicionar</button>
      </div>
      <div id="equipamentos-cards"></div>

      <label class="field-label-block">Peças e Serviços</label>
      <table class="items-table">
        <thead><tr><th>Qtde./Hrs</th><th>Descrição</th><th>Unitário (R$)</th><th>Total</th><th></th></tr></thead>
        <tbody id="itens-body">${itensExistentes.map(itemRowHtml).join("")}</tbody>
      </table>
      <button type="button" class="btn" id="btn-add-item">+ Adicionar item</button>
      <div class="subtotal-row">Subtotal: <strong id="subtotal-display">R$ 0,00</strong></div>
    </div>

    <div id="secao-venda" class="hidden">
      <label class="field-label-block">Itens — Equipamento(s) Novo(s)</label>
      <div id="venda-cards"></div>
      <button type="button" class="btn" id="btn-add-venda-item">+ Adicionar item</button>
      <div class="subtotal-row">Total: <strong id="venda-subtotal-display">R$ 0,00</strong></div>
    </div>

    <div class="field-row">
      <div class="field"><label>Validade (dias)</label><input type="number" name="validade_dias" value="${v("validade_dias", 5)}"></div>
      <div class="field"><label>Garantia (dias)</label><input type="number" name="garantia_dias" value="${v("garantia_dias", 90)}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Condições de pagamento</label><input type="text" name="condicoes_pagamento" value="${v("condicoes_pagamento")}" placeholder="ex: 28DDL"></div>
      <div class="field"><label>Prazo de entrega</label><input type="text" name="prazo_entrega" value="${v("prazo_entrega")}" placeholder="ex: 30 dias após aprovação"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Transporte por conta de</label><input type="text" name="responsabilidade_transporte" value="${v("responsabilidade_transporte", "Cliente")}"></div>
      <div class="field"><label>Técnico / Vendedor responsável</label><input type="text" name="tecnico_responsavel" value="${v("tecnico_responsavel")}"></div>
    </div>

    <div class="field"><label>Observações</label><textarea name="observacoes">${v("observacoes")}</textarea></div>

    <div class="field"><label>Status</label>
      <select name="status">
        ${["pendente", "aprovado", "recusado"].map((s) => `<option value="${s}" ${v("status", "pendente") === s ? "selected" : ""}>${s}</option>`).join("")}
      </select>
    </div>

    <div class="modal-actions">
      <button type="button" class="btn" id="modal-cancel">Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar</button>
    </div>
  `;

  document.getElementById("modal-overlay").classList.remove("hidden");
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  document.getElementById("btn-add-item").addEventListener("click", () => {
    document.getElementById("itens-body").insertAdjacentHTML("beforeend", itemRowHtml());
    attachItemListeners(form);
    recalcularSubtotal(form);
  });

  document.querySelector('select[name="cliente_id"]').addEventListener("change", (ev) => {
    clienteIdAtual = ev.target.value ? Number(ev.target.value) : null;
    document.getElementById("equipamento-picker").innerHTML = equipamentosPickerOptions();
  });

  function toggleSecaoPorTipo() {
    const tipo = document.getElementById("orcamento-tipo").value;
    document.getElementById("secao-tecnico").classList.toggle("hidden", tipo !== "tecnico");
    document.getElementById("secao-venda").classList.toggle("hidden", tipo !== "venda_equipamento");
  }
  document.getElementById("orcamento-tipo").addEventListener("change", toggleSecaoPorTipo);
  toggleSecaoPorTipo();

  function syncEquipCardsFromDom() {
    document.querySelectorAll("[data-equip-card]").forEach((card) => {
      const id = Number(card.dataset.equipCard);
      const item = equipamentosSelecionados.find((e) => e.equipamento_id === id);
      if (item) {
        item.defeitos_constatados = card.querySelector('[data-field="defeitos_constatados"]').value;
        item.solucao_adotada = card.querySelector('[data-field="solucao_adotada"]').value;
      }
    });
  }

  function renderEquipCards() {
    const wrap = document.getElementById("equipamentos-cards");
    wrap.innerHTML = equipamentosSelecionados.length
      ? equipamentosSelecionados
          .map((e) => {
            const eq = (cache.equipamentos || []).find((x) => x.id === e.equipamento_id);
            const label = eq ? labelForItem(eq) : `#${e.equipamento_id}`;
            return `<div class="equip-card" data-equip-card="${e.equipamento_id}">
              <div class="equip-card-header">
                <strong>${label}</strong>
                <button type="button" data-remove-equip="${e.equipamento_id}">Remover</button>
              </div>
              <div class="field"><label>Defeitos constatados</label><textarea data-field="defeitos_constatados">${e.defeitos_constatados || ""}</textarea></div>
              <div class="field"><label>Solução adotada</label><textarea data-field="solucao_adotada">${e.solucao_adotada || ""}</textarea></div>
            </div>`;
          })
          .join("")
      : `<div class="chips-empty">Nenhum equipamento adicionado ainda.</div>`;

    wrap.querySelectorAll("[data-remove-equip]").forEach((btn) => {
      btn.onclick = () => {
        syncEquipCardsFromDom();
        equipamentosSelecionados = equipamentosSelecionados.filter((e) => e.equipamento_id !== Number(btn.dataset.removeEquip));
        document.getElementById("equipamento-picker").innerHTML = equipamentosPickerOptions();
        renderEquipCards();
      };
    });
  }

  document.getElementById("btn-add-equip").addEventListener("click", () => {
    const picker = document.getElementById("equipamento-picker");
    if (!picker.value) return;
    syncEquipCardsFromDom();
    const id = Number(picker.value);
    if (!equipamentosSelecionados.some((e) => e.equipamento_id === id)) {
      equipamentosSelecionados.push({ equipamento_id: id, defeitos_constatados: "", solucao_adotada: "" });
      picker.innerHTML = equipamentosPickerOptions();
      renderEquipCards();
    }
  });

  renderEquipCards();

  // ---------- Itens de venda de equipamento novo ----------

  function recalcularSubtotalVenda() {
    let total = 0;
    document.querySelectorAll("[data-venda-item]").forEach((card) => {
      const qtd = parseFloat(card.querySelector('[data-field="quantidade"]').value) || 0;
      const preco = parseFloat(card.querySelector('[data-field="preco_unitario"]').value) || 0;
      total += qtd * preco;
    });
    document.getElementById("venda-subtotal-display").textContent = formatMoney(total);
  }

  function syncVendaCardsFromDom() {
    document.querySelectorAll("[data-venda-item]").forEach((card) => {
      const idx = Number(card.dataset.vendaItem);
      const item = itensVenda[idx];
      if (!item) return;
      item.ncm = card.querySelector('[data-field="ncm"]').value;
      item.partnumber = card.querySelector('[data-field="partnumber"]').value;
      item.descricao = card.querySelector('[data-field="descricao"]').value;
      item.quantidade = card.querySelector('[data-field="quantidade"]').value;
      item.unidade = card.querySelector('[data-field="unidade"]').value;
      item.garantia_meses = card.querySelector('[data-field="garantia_meses"]').value;
      item.prazo_entrega = card.querySelector('[data-field="prazo_entrega"]').value;
      item.ipi_percentual = card.querySelector('[data-field="ipi_percentual"]').value;
      item.icms_percentual = card.querySelector('[data-field="icms_percentual"]').value;
      item.preco_unitario = card.querySelector('[data-field="preco_unitario"]').value;
      item.custo_unitario = card.querySelector('[data-field="custo_unitario"]').value;
    });
  }

  function renderVendaCards() {
    const wrap = document.getElementById("venda-cards");
    wrap.innerHTML = itensVenda.length
      ? itensVenda
          .map(
            (item, idx) => `<div class="equip-card" data-venda-item="${idx}">
              <div class="equip-card-header">
                <strong>Item ${idx + 1}</strong>
                <button type="button" data-remove-venda-item="${idx}">Remover</button>
              </div>
              <div class="field-row">
                <div class="field"><label>NCM</label><input data-field="ncm" value="${item.ncm ?? ""}"></div>
                <div class="field"><label>Part Number</label><input data-field="partnumber" value="${item.partnumber ?? ""}"></div>
              </div>
              <div class="field"><label>Descrição do item *</label><input data-field="descricao" value="${item.descricao ?? ""}"></div>
              <div class="field-row">
                <div class="field"><label>Quantidade</label><input type="number" step="0.01" data-field="quantidade" value="${item.quantidade ?? 1}"></div>
                <div class="field"><label>Unidade</label><input data-field="unidade" value="${item.unidade ?? "Peça"}"></div>
              </div>
              <div class="field-row">
                <div class="field"><label>Garantia (meses)</label><input type="number" data-field="garantia_meses" value="${item.garantia_meses ?? ""}"></div>
                <div class="field"><label>Prazo de entrega</label><input data-field="prazo_entrega" value="${item.prazo_entrega ?? ""}" placeholder="ex: 30 Dias"></div>
              </div>
              <div class="field-row">
                <div class="field"><label>IPI (%)</label><input type="number" step="0.01" data-field="ipi_percentual" value="${item.ipi_percentual ?? ""}"></div>
                <div class="field"><label>ICMS (%)</label><input type="number" step="0.01" data-field="icms_percentual" value="${item.icms_percentual ?? ""}"></div>
              </div>
              <div class="field-row">
                <div class="field"><label>Preço Unitário (R$) *</label><input type="number" step="0.01" data-field="preco_unitario" value="${item.preco_unitario ?? ""}"></div>
                <div class="field"><label>Custo unitário (R$) <span style="font-weight:400;color:var(--ink-soft)">— interno, não aparece no PDF</span></label><input type="number" step="0.01" data-field="custo_unitario" value="${item.custo_unitario ?? ""}"></div>
              </div>
            </div>`
          )
          .join("")
      : `<div class="chips-empty">Nenhum item adicionado ainda.</div>`;

    wrap.querySelectorAll("[data-remove-venda-item]").forEach((btn) => {
      btn.onclick = () => {
        syncVendaCardsFromDom();
        itensVenda.splice(Number(btn.dataset.removeVendaItem), 1);
        renderVendaCards();
      };
    });
    wrap.querySelectorAll("[data-venda-item] input").forEach((input) => {
      input.oninput = recalcularSubtotalVenda;
    });
    recalcularSubtotalVenda();
  }

  document.getElementById("btn-add-venda-item").addEventListener("click", () => {
    syncVendaCardsFromDom();
    itensVenda.push({ unidade: "Peça", quantidade: 1 });
    renderVendaCards();
  });

  renderVendaCards();

  attachItemListeners(form);
  recalcularSubtotal(form);

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());

    if (data.cliente_id === "") delete data.cliente_id;
    else data.cliente_id = Number(data.cliente_id);
    if (data.data === "") delete data.data;
    ["validade_dias", "garantia_dias"].forEach((k) => { data[k] = Number(data[k]); });

    syncEquipCardsFromDom();
    data.equipamentos = equipamentosSelecionados.map((e) => ({
      equipamento_id: e.equipamento_id,
      defeitos_constatados: e.defeitos_constatados || null,
      solucao_adotada: e.solucao_adotada || null,
    }));

    data.itens = [];
    form.querySelectorAll("[data-item-row]").forEach((row) => {
      const quantidade = parseFloat(row.querySelector(".item-qtd").value);
      const valor_unitario = parseFloat(row.querySelector(".item-valor").value);
      const descricao = row.querySelector(".item-desc").value;
      if (descricao && !isNaN(quantidade) && !isNaN(valor_unitario)) {
        data.itens.push({ quantidade, descricao, valor_unitario });
      }
    });

    syncVendaCardsFromDom();
    data.itens_venda = itensVenda
      .filter((i) => i.descricao && i.preco_unitario !== "" && i.preco_unitario != null)
      .map((i) => ({
        ncm: i.ncm || null,
        partnumber: i.partnumber || null,
        descricao: i.descricao,
        quantidade: parseFloat(i.quantidade) || 1,
        unidade: i.unidade || "Peça",
        garantia_meses: i.garantia_meses !== "" && i.garantia_meses != null ? parseInt(i.garantia_meses) : null,
        prazo_entrega: i.prazo_entrega || null,
        ipi_percentual: i.ipi_percentual !== "" && i.ipi_percentual != null ? parseFloat(i.ipi_percentual) : null,
        icms_percentual: i.icms_percentual !== "" && i.icms_percentual != null ? parseFloat(i.icms_percentual) : null,
        preco_unitario: parseFloat(i.preco_unitario),
        custo_unitario: i.custo_unitario !== "" && i.custo_unitario != null ? parseFloat(i.custo_unitario) : null,
      }));

    if (data.tipo === "tecnico" && data.itens.length === 0) {
      showAlert("Adicione ao menos um item de peça ou serviço.");
      return;
    }
    if (data.tipo === "venda_equipamento" && data.itens_venda.length === 0) {
      showAlert("Adicione ao menos um item de equipamento.");
      return;
    }

    try {
      if (isEdit) {
        await apiSend(`/orcamentos/${existingItem.id}`, "PUT", data);
        showAlert("Orçamento atualizado com sucesso.", "success");
      } else {
        await apiSend("/orcamentos/", "POST", data);
        showAlert("Orçamento criado com sucesso.", "success");
      }
      closeModal();
      renderList("orcamentos");
    } catch (e) {
      showAlert(e.message);
    }
  };
}

// ---------------------------------------------------------------
// Formulário customizado de Ordem de Serviço (peças utilizadas)
// ---------------------------------------------------------------

async function openOrdemModal(existingItem, prefillData = null) {
  const config = ENTITIES.ordens;
  await preloadRelations(config);
  if (!cache.pecas) cache.pecas = await apiGet(ENTITIES.pecas.endpoint);
  if (!cache.equipamentos) cache.equipamentos = await apiGet(ENTITIES.equipamentos.endpoint);

  const isEdit = existingItem != null;
  document.getElementById("modal-title").textContent = `${isEdit ? "Editar" : "Novo"} — Ordem de Serviço`;
  document.getElementById("modal").classList.add("modal-lg");

  const v = (campo, def = "") => {
    if (isEdit && existingItem[campo] != null) return existingItem[campo];
    if (!isEdit && prefillData && prefillData[campo] != null) return prefillData[campo];
    return def;
  };

  const clientesOptions = (cache.clientes || [])
    .map((c) => `<option value="${c.id}" ${String(c.id) === String(v("cliente_id")) ? "selected" : ""}>${c.nome}</option>`)
    .join("");
  const orcamentosOptions = (cache.orcamentos || [])
    .map((o) => `<option value="${o.id}" ${String(o.id) === String(v("orcamento_id")) ? "selected" : ""}>${labelForItem(o)}</option>`)
    .join("");

  // Equipamentos vinculados a esta OS — lista simples (picker + etiqueta removível).
  const equipamentoIdsExistentes = isEdit
    ? existingItem.equipamento_ids || []
    : (prefillData && prefillData.equipamento_ids) || [];
  let equipamentosOS = equipamentoIdsExistentes
    .map((id) => (cache.equipamentos || []).find((e) => e.id === id))
    .filter(Boolean);

  const equipOSPickerOptions = () =>
    (cache.equipamentos || [])
      .filter((e) => !equipamentosOS.some((s) => s.id === e.id))
      .map((e) => `<option value="${e.id}">${labelForItem(e)}</option>`)
      .join("");

  // Peças que serão registradas ao salvar (novas — ainda não descontadas do estoque)
  let pecasNovas = [];

  const pecasPickerOptions = () =>
    (cache.pecas || [])
      .map((p) => {
        const compat = [p.marca, p.modelo].filter(Boolean).join(" ");
        return `<option value="${p.id}">${p.nome}${p.partnumber ? " — " + p.partnumber : ""}${compat ? " (" + compat + ")" : ""} — estoque: ${p.quantidade_estoque}</option>`;
      })
      .join("");

  const dataAberturaValor = isEdit && existingItem.data_abertura ? existingItem.data_abertura.slice(0, 10) : "";
  const dataConclusaoValor = isEdit && existingItem.data_conclusao ? existingItem.data_conclusao.slice(0, 10) : "";
  const itensServicoExistentes = isEdit && existingItem.itens_servico && existingItem.itens_servico.length
    ? existingItem.itens_servico
    : [{}];

  const form = document.getElementById("modal-form");
  form.setAttribute("autocomplete", "off");
  form.innerHTML = `
    <div class="field-row">
      <div class="field"><label>Nº da OS</label><input type="text" name="numero" value="${v("numero")}"></div>
      <div class="field"><label>Cliente *</label>
        <select name="cliente_id" required>
          <option value="">Selecione...</option>
          ${clientesOptions}
        </select>
      </div>
    </div>

    <div class="field">
      <label>Equipamento(s)</label>
      <div class="picker-row">
        <select id="os-equip-picker">${equipOSPickerOptions()}</select>
        <button type="button" class="btn" id="btn-add-os-equip">+ Adicionar</button>
      </div>
      <div id="os-equip-chips" class="chips-wrap"></div>
    </div>

    <div class="field-row">
      <div class="field"><label>Orçamento de origem (opcional)</label>
        <select name="orcamento_id"><option value="">— nenhum —</option>${orcamentosOptions}</select>
      </div>
      <div class="field"><label>Data de abertura</label><input type="date" name="data_abertura" value="${dataAberturaValor}" placeholder="hoje"></div>
    </div>

    <div class="field-row">
      <div class="field"><label>Data de conclusão</label><input type="date" name="data_conclusao" value="${dataConclusaoValor}"></div>
      <div></div>
    </div>

    <div class="field"><label>Descrição *</label><textarea name="descricao" required>${v("descricao")}</textarea></div>

    <div class="field"><label>Status</label>
      <select name="status">
        ${["aberto", "em_andamento", "concluido"].map((s) => `<option value="${s}" ${v("status", "aberto") === s ? "selected" : ""}>${s}</option>`).join("")}
      </select>
    </div>

    <label class="field-label-block">Serviços / Mão de obra</label>
    <table class="items-table">
      <thead><tr><th>Qtde./Hrs</th><th>Descrição</th><th>Unitário (R$)</th><th>Total</th><th></th></tr></thead>
      <tbody id="itens-body">${itensServicoExistentes.map(itemRowHtml).join("")}</tbody>
    </table>
    <button type="button" class="btn" id="btn-add-item">+ Adicionar item</button>
    <div class="subtotal-row">Subtotal: <strong id="subtotal-display">R$ 0,00</strong></div>

    <label class="field-label-block">Peças utilizadas</label>
    <div id="pecas-ja-registradas"></div>
    <div class="picker-row">
      <select id="peca-picker">${pecasPickerOptions()}</select>
      <input type="number" id="peca-qtd" min="1" step="1" value="1" style="width:80px">
      <button type="button" class="btn" id="btn-add-peca">+ Adicionar</button>
    </div>
    <div id="pecas-novas-list"></div>

    <div class="modal-actions">
      <button type="button" class="btn" id="modal-cancel">Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar</button>
    </div>
  `;

  document.getElementById("modal-overlay").classList.remove("hidden");
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  document.getElementById("btn-add-item").addEventListener("click", () => {
    document.getElementById("itens-body").insertAdjacentHTML("beforeend", itemRowHtml());
    attachItemListeners(form);
    recalcularSubtotal(form);
  });
  attachItemListeners(form);
  recalcularSubtotal(form);

  function renderEquipOSChips() {
    const wrap = document.getElementById("os-equip-chips");
    wrap.innerHTML = equipamentosOS.length
      ? equipamentosOS
          .map((e) => `<span class="chip">${labelForItem(e)}<button type="button" data-remove-os-equip="${e.id}">×</button></span>`)
          .join("")
      : `<span class="chips-empty">Nenhum equipamento adicionado</span>`;
    wrap.querySelectorAll("[data-remove-os-equip]").forEach((btn) => {
      btn.onclick = () => {
        equipamentosOS = equipamentosOS.filter((e) => e.id !== Number(btn.dataset.removeOsEquip));
        document.getElementById("os-equip-picker").innerHTML = equipOSPickerOptions();
        renderEquipOSChips();
      };
    });
  }

  document.getElementById("btn-add-os-equip").addEventListener("click", () => {
    const picker = document.getElementById("os-equip-picker");
    if (!picker.value) return;
    const equip = (cache.equipamentos || []).find((e) => e.id === Number(picker.value));
    if (equip && !equipamentosOS.some((e) => e.id === equip.id)) {
      equipamentosOS.push(equip);
      picker.innerHTML = equipOSPickerOptions();
      renderEquipOSChips();
    }
  });

  renderEquipOSChips();

  // Se estiver editando, mostra o que já foi registrado nessa OS (histórico —
  // já descontou estoque, não é editável por aqui).
  if (isEdit) {
    const registradas = document.getElementById("pecas-ja-registradas");
    registradas.innerHTML = `<div class="empty-state" style="padding:12px">Carregando peças já registradas...</div>`;
    try {
      const usos = await apiGet(`/pecas/usos/por-os/${existingItem.id}`);
      if (usos.length === 0) {
        registradas.innerHTML = "";
      } else {
        registradas.innerHTML = `<div class="equip-card" style="background:#F0F0EC">
          <div style="font-size:12px;color:var(--ink-soft);margin-bottom:6px">Já registradas nesta OS (histórico):</div>
          ${usos
            .map((u) => {
              const peca = (cache.pecas || []).find((p) => p.id === u.peca_id);
              return `<div class="mono" style="font-size:12.5px;padding:2px 0">${u.quantidade_usada}x ${peca ? peca.nome : "#" + u.peca_id}</div>`;
            })
            .join("")}
        </div>`;
      }
    } catch {
      registradas.innerHTML = "";
    }
  }

  function renderPecasNovas() {
    const wrap = document.getElementById("pecas-novas-list");
    wrap.innerHTML = pecasNovas.length
      ? pecasNovas
          .map(
            (p, idx) =>
              `<span class="chip">${p.quantidade}x ${p.nome}<button type="button" data-remove-peca-nova="${idx}">×</button></span>`
          )
          .join("")
      : "";
    wrap.querySelectorAll("[data-remove-peca-nova]").forEach((btn) => {
      btn.onclick = () => {
        pecasNovas.splice(Number(btn.dataset.removePecaNova), 1);
        renderPecasNovas();
      };
    });
  }

  document.getElementById("btn-add-peca").addEventListener("click", () => {
    const picker = document.getElementById("peca-picker");
    const qtdInput = document.getElementById("peca-qtd");
    if (!picker.value) return;
    const qtd = Number(qtdInput.value) || 1;
    const peca = (cache.pecas || []).find((p) => p.id === Number(picker.value));
    if (!peca) return;
    pecasNovas.push({ peca_id: peca.id, nome: peca.nome, quantidade: qtd });
    qtdInput.value = 1;
    renderPecasNovas();
  });

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());

    ["cliente_id", "orcamento_id"].forEach((k) => {
      if (data[k] === "") delete data[k];
      else data[k] = Number(data[k]);
    });
    if (data.data_abertura === "") delete data.data_abertura;
    if (data.data_conclusao === "") delete data.data_conclusao;
    if (data.numero === "") delete data.numero;

    data.equipamento_ids = equipamentosOS.map((e) => e.id);

    data.itens_servico = [];
    form.querySelectorAll("[data-item-row]").forEach((row) => {
      const quantidade = parseFloat(row.querySelector(".item-qtd").value);
      const valor_unitario = parseFloat(row.querySelector(".item-valor").value);
      const descricao = row.querySelector(".item-desc").value;
      if (descricao && !isNaN(quantidade) && !isNaN(valor_unitario)) {
        data.itens_servico.push({ quantidade, descricao, valor_unitario });
      }
    });

    try {
      let osId;
      if (isEdit) {
        await apiSend(`${config.endpoint}${existingItem.id}`, "PUT", data);
        osId = existingItem.id;
      } else {
        const criada = await apiSend(config.endpoint, "POST", data);
        osId = criada.id;
      }

      // Registra as peças novas uma a uma — cada chamada já desconta o
      // estoque e "congela" preço/custo, igual ao fluxo de Peças/Estoque.
      const erros = [];
      for (const p of pecasNovas) {
        try {
          await apiSend("/pecas/usar-em-os", "POST", {
            ordem_servico_id: osId,
            peca_id: p.peca_id,
            quantidade_usada: p.quantidade,
          });
        } catch (e) {
          erros.push(`${p.nome}: ${e.message}`);
        }
      }

      if (erros.length) {
        showAlert(`OS salva, mas houve erro ao registrar peça(s): ${erros.join(" | ")}`);
      } else {
        showAlert(isEdit ? "OS atualizada com sucesso." : "OS criada com sucesso.", "success");
      }
      closeModal();
      switchView("ordens");
    } catch (e) {
      showAlert(e.message);
    }
  };
}

// ---------------------------------------------------------------
// Navegação entre módulos
// ---------------------------------------------------------------

function switchView(viewKey) {
  currentView = viewKey;

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewKey);
  });

  const config = ENTITIES[viewKey];
  const titulos = { dashboard: "Dashboard", financeiro: "Financeiro" };
  document.getElementById("view-title").textContent = config ? config.title : titulos[viewKey] || "";
  document.getElementById("btn-novo").classList.toggle("hidden", viewKey === "dashboard" || viewKey === "financeiro");

  if (viewKey === "dashboard") renderDashboard();
  else if (viewKey === "financeiro") renderFinanceiro();
  else renderList(viewKey);
}

// ---------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------

document.getElementById("nav").addEventListener("click", (ev) => {
  const btn = ev.target.closest(".nav-item");
  if (btn) switchView(btn.dataset.view);
});

document.getElementById("btn-novo").addEventListener("click", () => {
  if (currentView === "orcamentos") openOrcamentoModal(null);
  else if (currentView === "ordens") openOrdemModal(null);
  else openModal(currentView);
});
document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", (ev) => {
  if (ev.target.id === "modal-overlay") closeModal();
});

const btnLogout = document.getElementById("btn-logout");
if (btnLogout) btnLogout.addEventListener("click", logout);

let appIniciado = false;
function iniciarApp() {
  if (appIniciado) return; // evita duplicar o polling da API se logar de novo na mesma aba
  appIniciado = true;
  checkApiStatus();
  setInterval(checkApiStatus, 15000);
  switchView("dashboard");
}

verificarSessao();