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
    searchCliente: true,
    searchFields: ["marca", "modelo", "numero_serie", "tipo"],
    searchPlaceholder: "Buscar por cliente, marca, modelo...",
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
    sort: compareNumeroDesc,
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
      { key: "nota_fiscal_id", label: "NF", relation: "notas_fiscais", nfBadge: true }, // selo só aparece se houver nota vinculada
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
    sort: compareNumeroDesc,
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
      { key: "nota_fiscal_id", label: "NF", relation: "notas_fiscais", nfBadge: true }, // selo só aparece se houver nota vinculada
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
    searchFields: ["nome", "partnumber", "marca", "modelo"],
    searchPlaceholder: "Buscar por nome, partnumber, marca...",
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
    searchFields: ["descricao", "categoria", "observacoes"],
    searchPlaceholder: "Buscar por descrição, categoria...",
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

  visitas: {
    title: "Visitas",
    endpoint: "/visitas/",
    searchCliente: true,
    searchFields: ["observacoes"],
    searchPlaceholder: "Buscar por cliente, anotação...",
    columns: [
      { key: "data", label: "Data", date: true },
      { key: "cliente_id", label: "Cliente", relation: "clientes" },
      { key: "status", label: "Status", badge: true },
      { key: "observacoes", label: "Anotação" },
    ],
    fields: [
      { name: "cliente_id", label: "Cliente", type: "select", relation: "clientes", required: true },
      { name: "data", label: "Data", type: "date", required: true },
      { name: "status", label: "Status", type: "select", options: ["agendada", "realizada", "cancelada"] },
      { name: "observacoes", label: "Anotação", type: "textarea" },
    ],
  },

  contas_pagar: {
    title: "Contas a Pagar",
    endpoint: "/contas-pagar/",
    searchFields: ["descricao", "fornecedor", "observacoes"],
    searchPlaceholder: "Buscar por descrição, fornecedor...",
    columns: [
      { key: "data_vencimento", label: "Vencimento", date: true },
      { key: "descricao", label: "Descrição" },
      { key: "fornecedor", label: "Fornecedor" },
      { key: "valor", label: "Valor", money: true },
      { key: "pago", label: "Status", pagoBadge: true },
    ],
    fields: [
      { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "ex: Compra Zebra ZD230t p/ revenda (Mari Maria)" },
      { name: "fornecedor", label: "Fornecedor", type: "text" },
      { name: "valor", label: "Valor (R$)", type: "number", required: true },
      { name: "data_vencimento", label: "Vencimento", type: "date", required: true },
      { name: "pago", label: "Já foi pago", type: "checkbox" },
      { name: "observacoes", label: "Observações", type: "textarea" },
    ],
  },

  notas_fiscais: {
    title: "Notas Fiscais",
    endpoint: "/notas-fiscais/",
    filterKey: "tipo", // os botões de filtro usam o campo "tipo" (as demais telas usam "status")
    statusFilters: [
      { value: "nfse_prestada", label: "Serviços (NFS-e)" },
      { value: "nfe_saida", label: "Vendas (NF-e)" },
      { value: "nfe_entrada", label: "Compras (NF-e)" },
    ],
    searchFields: ["numero", "emitente_nome", "destinatario_nome", "chave_acesso"],
    searchPlaceholder: "Buscar por nº, fornecedor, cliente, chave...",
    columns: [
      { key: "data_emissao", label: "Emissão", date: true },
      { key: "tipo", label: "Tipo", nfTipo: true },
      { key: "numero", label: "Nº" },
      { key: "parte", label: "Fornecedor / Cliente", compute: (n) => escHtml(parteDaNota(n) || "—") },
      { key: "valor_total", label: "Valor", money: true },
      { key: "vinculos", label: "Vinculada a", compute: (n) => textoVinculosNota(n) },
    ],
    fields: [
      {
        name: "tipo",
        label: "Tipo",
        type: "select",
        required: true,
        options: [
          { value: "nfse_prestada", label: "NFS-e — serviço prestado" },
          { value: "nfe_saida", label: "NF-e — venda (emitida por mim)" },
          { value: "nfe_entrada", label: "NF-e — compra (emitida por fornecedor)" },
        ],
      },
      { name: "data_emissao", label: "Data de emissão", type: "date", required: true },
      { name: "numero", label: "Número", type: "text" },
      { name: "serie", label: "Série", type: "text" },
      { name: "valor_total", label: "Valor total (R$)", type: "number", required: true },
      { name: "emitente_nome", label: "Emitente (quem emitiu)", type: "text", placeholder: "ex: Plusprint Automação / nome do fornecedor" },
      { name: "emitente_cnpj", label: "CNPJ do emitente", type: "text" },
      { name: "destinatario_nome", label: "Destinatário / tomador (quem recebeu)", type: "text", placeholder: "ex: nome do cliente" },
      { name: "destinatario_cnpj", label: "CNPJ/CPF do destinatário", type: "text" },
      { name: "chave_acesso", label: "Chave de acesso (opcional)", type: "text", placeholder: "44 dígitos da NF-e — evita cadastrar a mesma nota duas vezes" },
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

    // O backend já manda o nome certo no Content-Disposition (ex:
    // os_057_Almad.pdf) — só precisa ser lido explicitamente aqui, porque
    // um blob: URL não carrega esse cabeçalho sozinho.
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match ? match[1] : "documento.pdf";

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
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
  // Campos "date" (sem hora) vêm como "AAAA-MM-DD". Se passar isso direto
  // pro construtor do Date, o JS interpreta como meia-noite UTC e, ao
  // converter pro fuso local (Brasil, UTC-3), "volta" pro dia anterior —
  // por isso datas apareciam sempre 1 dia a menos. Montando a data manual,
  // sem passar pelo Date, evita esse problema.
  const soData = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (soData) {
    const [, ano, mes, dia] = soData;
    return `${dia}/${mes}/${ano}`;
  }
  return new Date(v).toLocaleDateString("pt-BR");
}

const TIPO_ORCAMENTO_LABEL = { tecnico: "Técnico / Manutenção", venda_equipamento: "Venda de Equipamento", desenvolvimento: "Desenvolvimento" };
function formatTipoOrcamento(v) {
  return TIPO_ORCAMENTO_LABEL[v] || TIPO_ORCAMENTO_LABEL.tecnico;
}

const TIPO_ORCAMENTO_LABEL_CURTO = { venda_equipamento: "Venda de equipamento", desenvolvimento: "Desenvolvimento", tecnico: "Técnico" };
function formatTipoOrcamentoCurto(v) {
  return TIPO_ORCAMENTO_LABEL_CURTO[v] || TIPO_ORCAMENTO_LABEL_CURTO.tecnico;
}

// ---------------------------------------------------------------
// Notas fiscais — rótulos, selo "NF 1234" e opções do seletor
// ---------------------------------------------------------------

const NF_TIPO_LABEL = { nfse_prestada: "NFS-e serviço", nfe_saida: "NF-e venda", nfe_entrada: "NF-e compra" };

// Nomes de fornecedor/cliente podem vir de fora (XML, digitação) e entram em
// HTML montado por string — por isso passam por escHtml antes de ser exibidos.
function escHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Na compra (nfe_entrada) a "outra parte" é quem emitiu (fornecedor); nas
// vendas e serviços é quem recebeu a nota (cliente).
function parteDaNota(n) {
  return n.tipo === "nfe_entrada" ? n.emitente_nome : n.destinatario_nome;
}

function textoVinculosNota(n) {
  const partes = [];
  if (n.orcamento_ids && n.orcamento_ids.length) partes.push(`${n.orcamento_ids.length} orç.`);
  if (n.ordem_servico_ids && n.ordem_servico_ids.length) partes.push(`${n.ordem_servico_ids.length} OS`);
  return partes.join(" · ") || "—";
}

function labelNotaFiscal(n) {
  const quem = parteDaNota(n);
  return `NF ${n.numero || "#" + n.id}${quem ? " — " + quem : ""} — ${formatMoney(n.valor_total)} (${formatDate(n.data_emissao)})`;
}

// Selo discreto "NF 1234" — só é desenhado quando existe vínculo (sem nota,
// a célula fica vazia: não mostramos "sem NF" para não parecer pendência).
function badgeNF(notaId) {
  const nota = (cache.notas_fiscais || []).find((n) => n.id === notaId);
  const texto = nota ? `NF ${nota.numero || "#" + nota.id}` : `NF #${notaId}`;
  return `<span class="badge nf">${escHtml(texto)}</span>`;
}

// <option>s do seletor "Nota fiscal (opcional)" dos formulários. Compras
// (nfe_entrada) ficam de fora, pois não se ligam a orçamento/OS — a não ser
// que já seja a nota vinculada, para não "sumir" na edição.
function notaFiscalOptionsHtml(selecionadaId) {
  return (cache.notas_fiscais || [])
    .filter((n) => n.tipo !== "nfe_entrada" || String(n.id) === String(selecionadaId))
    .map((n) => `<option value="${n.id}" ${String(n.id) === String(selecionadaId) ? "selected" : ""}>${escHtml(labelNotaFiscal(n))}</option>`)
    .join("");
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

let dashboardAnoSelecionado = null;

function buildDashboardHtml(d) {
  return `
    <h3 class="panel-title">Orçamentos</h3>
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-label">Aprovados</div>
        <div class="metric-value" style="color:var(--green)">${d.orcamentos_aprovados}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Pendentes</div>
        <div class="metric-value amber">${d.orcamentos_pendentes}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Reprovados</div>
        <div class="metric-value" style="color:var(--red)">${d.orcamentos_recusados}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total</div>
        <div class="metric-value">${d.orcamentos_total}</div>
      </div>
    </div>

    <h3 class="panel-title" style="margin-top:24px">Ordens de Serviço</h3>
    <div class="metric-grid">
      <div class="metric-card">
        <div class="metric-label">Abertas</div>
        <div class="metric-value amber">${d.os_abertas}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Em andamento</div>
        <div class="metric-value" style="color:var(--ink)">${d.os_em_andamento}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Concluídas</div>
        <div class="metric-value" style="color:var(--green)">${d.os_concluidas}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total</div>
        <div class="metric-value">${d.os_total}</div>
      </div>
    </div>

    <div class="metric-grid" style="margin-top:24px">
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
}

function buildProximasVisitasHtml(visitas) {
  if (visitas.length === 0) {
    return `<div class="empty-state">Nenhuma visita agendada.</div>`;
  }
  // Data local (não UTC) — evita marcar visitas de hoje à noite como
  // "atrasada" por causa do fuso horário (mesma causa do bug do formatDate).
  const agora = new Date();
  const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>Data</th><th>Cliente</th><th>Anotação</th><th></th></tr></thead>
    <tbody>${visitas
      .map((v) => {
        const atrasada = v.data < hoje;
        return `<tr>
          <td class="mono" ${atrasada ? 'style="color:var(--red)"' : ""}>${formatDate(v.data)}</td>
          <td>${v.cliente_nome}</td>
          <td>${v.observacoes || "—"}</td>
          <td class="row-actions"><button type="button" class="btn btn-edit" data-visita-realizada="${v.id}">Marcar como realizada</button></td>
        </tr>`;
      })
      .join("")}</tbody>
  </table></div>`;
}

async function marcarVisitaRealizada(id) {
  try {
    await apiSend(`/visitas/${id}`, "PUT", { status: "realizada" });
    showAlert("Visita marcada como realizada.", "success");
    const wrap = document.getElementById("dashboard-visitas-wrap");
    if (wrap) {
      const visitas = await apiGet("/visitas/proximas");
      wrap.innerHTML = buildProximasVisitasHtml(visitas);
      wrap.querySelectorAll("[data-visita-realizada]").forEach((btn) => {
        btn.addEventListener("click", () => marcarVisitaRealizada(Number(btn.dataset.visitaRealizada)));
      });
    }
  } catch (e) {
    showAlert(e.message);
  }
}

function buildContasPagarPendentesHtml(contas) {
  if (contas.length === 0) {
    return `<div class="empty-state">Nenhuma conta a pagar pendente.</div>`;
  }
  const agora = new Date();
  const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>Vencimento</th><th>Descrição</th><th>Valor</th><th></th></tr></thead>
    <tbody>${contas
      .map((c) => {
        const atrasada = c.data_vencimento < hoje;
        return `<tr>
          <td class="mono" ${atrasada ? 'style="color:var(--red)"' : ""}>${formatDate(c.data_vencimento)}</td>
          <td>${c.descricao}${c.fornecedor ? ` <span style="color:var(--ink-soft)">— ${c.fornecedor}</span>` : ""}</td>
          <td class="mono">${formatMoney(c.valor)}</td>
          <td class="row-actions"><button type="button" class="btn btn-edit" data-conta-pagar-paga="${c.id}">Marcar como paga</button></td>
        </tr>`;
      })
      .join("")}</tbody>
  </table></div>`;
}

async function marcarContaPagarPaga(id) {
  try {
    await apiSend(`/contas-pagar/${id}`, "PUT", { pago: true });
    showAlert("Conta marcada como paga.", "success");
    const wrap = document.getElementById("dashboard-contas-pagar-wrap");
    if (wrap) {
      const contas = await apiGet("/contas-pagar/pendentes");
      wrap.innerHTML = buildContasPagarPendentesHtml(contas);
      wrap.querySelectorAll("[data-conta-pagar-paga]").forEach((btn) => {
        btn.addEventListener("click", () => marcarContaPagarPaga(Number(btn.dataset.contaPagarPaga)));
      });
    }
  } catch (e) {
    showAlert(e.message);
  }
}

function buildContasReceberPendentesDashboardHtml(contasReceber) {
  const pendentes = contasReceber
    .filter((c) => c.situacao !== "pago")
    .sort((a, b) => {
      if (!a.data_vencimento) return 1;
      if (!b.data_vencimento) return -1;
      return a.data_vencimento.localeCompare(b.data_vencimento);
    })
    .slice(0, 8);
  if (pendentes.length === 0) {
    return `<div class="empty-state">Nenhuma conta a receber pendente.</div>`;
  }
  return `<div class="table-wrap"><table>
    <thead><tr><th>Vencimento</th><th>Cliente</th><th>Valor</th><th>Situação</th></tr></thead>
    <tbody>${pendentes
      .map(
        (c) => `<tr>
          <td class="mono">${c.data_vencimento ? formatDate(c.data_vencimento) : "—"}</td>
          <td>${c.cliente_nome}</td>
          <td class="mono">${formatMoney(c.valor_total)}</td>
          <td><span class="badge status-${c.situacao}">${c.situacao.replace(/_/g, " ")}</span></td>
        </tr>`
      )
      .join("")}</tbody>
  </table></div>`;
}

async function selecionarAnoDashboard(anoOuNull) {
  dashboardAnoSelecionado = anoOuNull;
  const root = document.getElementById("view-root");
  const botoesWrap = document.getElementById("dashboard-ano-botoes");
  const corpo = document.getElementById("dashboard-corpo");
  if (botoesWrap) {
    botoesWrap.querySelectorAll("[data-ano-dashboard]").forEach((btn) => {
      const btnAno = btn.dataset.anoDashboard === "total" ? null : Number(btn.dataset.anoDashboard);
      btn.className = `btn ${btnAno === anoOuNull ? "btn-primary" : ""}`;
      btn.style.cssText = "padding:6px 14px;font-size:12.5px";
    });
  }
  if (corpo) corpo.innerHTML = `<div class="empty-state">Carregando...</div>`;
  try {
    const qs = anoOuNull ? `?ano=${anoOuNull}` : "";
    const d = await apiGet(`/dashboard/${qs}`);
    if (corpo) corpo.innerHTML = buildDashboardHtml(d);
  } catch (e) {
    if (corpo) corpo.innerHTML = `<div class="empty-state">Não foi possível carregar o dashboard.</div>`;
    else if (root) root.innerHTML = `<div class="empty-state">Não foi possível carregar o dashboard. A API está rodando?</div>`;
  }
}

async function renderDashboard() {
  const root = document.getElementById("view-root");
  root.innerHTML = `<div class="empty-state">Carregando indicadores...</div>`;

  try {
    const [anos, proximasVisitas, contasPagarPendentes, contasReceber] = await Promise.all([
      apiGet("/dashboard/anos-disponiveis"),
      apiGet("/visitas/proximas"),
      apiGet("/contas-pagar/pendentes"),
      apiGet("/financeiro/contas-a-receber"),
    ]);
    if (dashboardAnoSelecionado === null) {
      const anoAtual = new Date().getFullYear();
      dashboardAnoSelecionado = anos.includes(anoAtual) ? anoAtual : null;
    }

    const botoesAno = anos
      .map((a) => `<button type="button" class="btn" data-ano-dashboard="${a}">${a}</button>`)
      .join("");

    root.innerHTML = `
      <h3 class="panel-title">Próximas Visitas</h3>
      <div id="dashboard-visitas-wrap">${buildProximasVisitasHtml(proximasVisitas)}</div>

      <div class="dashboard-duas-colunas">
        <div>
          <h3 class="panel-title">Contas a Pagar</h3>
          <div id="dashboard-contas-pagar-wrap">${buildContasPagarPendentesHtml(contasPagarPendentes)}</div>
        </div>
        <div>
          <h3 class="panel-title">Contas a Receber</h3>
          <div id="dashboard-contas-receber-wrap">${buildContasReceberPendentesDashboardHtml(contasReceber)}</div>
        </div>
      </div>

      <div class="panel-title" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:24px">
        <span>Visão geral</span>
        <span id="dashboard-ano-botoes" style="display:flex;gap:6px">
          ${botoesAno}
          <button type="button" class="btn" data-ano-dashboard="total">Total</button>
        </span>
      </div>
      <div id="dashboard-corpo"></div>
    `;

    document.getElementById("dashboard-visitas-wrap").querySelectorAll("[data-visita-realizada]").forEach((btn) => {
      btn.addEventListener("click", () => marcarVisitaRealizada(Number(btn.dataset.visitaRealizada)));
    });

    document.getElementById("dashboard-contas-pagar-wrap").querySelectorAll("[data-conta-pagar-paga]").forEach((btn) => {
      btn.addEventListener("click", () => marcarContaPagarPaga(Number(btn.dataset.contaPagarPaga)));
    });

    document.querySelectorAll("[data-ano-dashboard]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const btnAno = btn.dataset.anoDashboard === "total" ? null : Number(btn.dataset.anoDashboard);
        selecionarAnoDashboard(btnAno);
      });
    });

    await selecionarAnoDashboard(dashboardAnoSelecionado);
  } catch (e) {
    root.innerHTML = `<div class="empty-state">Não foi possível carregar o dashboard. A API está rodando?</div>`;
  }
}

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

let financeiroAnoSelecionado = null;

function buildEsteAnoCardsHtml(anos, anoSelecionado, resumo) {
  const botoesAno = anos
    .map(
      (a) =>
        `<button type="button" class="btn ${a === anoSelecionado ? "btn-primary" : ""}" style="padding:6px 14px;font-size:12.5px" data-ano-resumo="${a}">${a}</button>`
    )
    .join("");

  return `
    <div class="panel-title" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span>Este ano</span>
      <span style="display:flex;gap:6px">${botoesAno}</span>
    </div>
    <div class="metric-grid">
      <div class="metric-card metric-card-clickable" data-detalhe-ano="${anoSelecionado}">
        <div class="metric-label">Faturamento</div>
        <div class="metric-value amber">${formatMoney(resumo.faturamento_ano)}</div>
      </div>
      <div class="metric-card metric-card-clickable" data-detalhe-ano="${anoSelecionado}">
        <div class="metric-label">Custo de peças/produtos</div>
        <div class="metric-value" style="color:var(--red)">${formatMoney(resumo.custo_pecas_ano)}</div>
      </div>
      <div class="metric-card metric-card-clickable" data-detalhe-ano="${anoSelecionado}">
        <div class="metric-label">Despesas</div>
        <div class="metric-value" style="color:var(--red)">${formatMoney(resumo.despesas_ano)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Líquido</div>
        <div class="metric-value" style="color:var(--green)">${formatMoney(resumo.liquido_ano)}</div>
      </div>
    </div>
  `;
}

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
  const wrapGrafico = document.getElementById("faturamento-chart-wrap");
  const wrapCards = document.getElementById("financeiro-ano-cards-wrap");
  if (wrapGrafico) wrapGrafico.innerHTML = `<div class="empty-state">Carregando...</div>`;
  if (wrapCards) wrapCards.innerHTML = `<div class="empty-state">Carregando...</div>`;
  try {
    const [anos, pontos, resumo] = await Promise.all([
      apiGet("/financeiro/anos-disponiveis"),
      apiGet(`/financeiro/faturamento-mensal?ano=${ano}`),
      apiGet(`/financeiro/resumo?ano=${ano}`),
    ]);
    if (wrapGrafico) wrapGrafico.innerHTML = buildFaturamentoPanelHtml(anos, ano, pontos);
    if (wrapCards) wrapCards.innerHTML = buildEsteAnoCardsHtml(anos, ano, resumo);
    attachFaturamentoPanelListeners();
  } catch (e) {
    if (wrapGrafico) wrapGrafico.innerHTML = `<div class="empty-state">Não foi possível carregar o gráfico.</div>`;
    if (wrapCards) wrapCards.innerHTML = `<div class="empty-state">Não foi possível carregar os dados.</div>`;
  }
}

function attachFaturamentoPanelListeners() {
  document.querySelectorAll("[data-ano-faturamento], [data-ano-resumo]").forEach((btn) => {
    const ano = Number(btn.dataset.anoFaturamento ?? btn.dataset.anoResumo);
    btn.addEventListener("click", () => selecionarAnoFaturamento(ano));
  });
  document.querySelectorAll(".chart-bar-group").forEach((g) => {
    g.addEventListener("click", () => {
      openFaturamentoMesModal(Number(g.dataset.ano), Number(g.dataset.mes));
    });
  });
  document.querySelectorAll("#financeiro-ano-cards-wrap [data-detalhe-ano]").forEach((card) => {
    card.addEventListener("click", () => openFaturamentoMesModal(Number(card.dataset.detalheAno)));
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
      const acao = c.pago
        ? `<button class="btn btn-danger" data-desmarcar-pago="${c.orcamento_id}">Desfazer pagamento</button>`
        : `<button class="btn btn-pagar" data-marcar-pago="${c.orcamento_id}">Marcar como pago</button>`;
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
    const [contas, anos, ranking] = await Promise.all([
      apiGet("/financeiro/contas-a-receber"),
      apiGet("/financeiro/anos-disponiveis"),
      apiGet("/financeiro/por-cliente"),
    ]);

    if (financeiroAnoSelecionado === null || !anos.includes(financeiroAnoSelecionado)) {
      financeiroAnoSelecionado = anos[anos.length - 1];
    }
    const [resumo, pontos] = await Promise.all([
      apiGet(`/financeiro/resumo?ano=${financeiroAnoSelecionado}`),
      apiGet(`/financeiro/faturamento-mensal?ano=${financeiroAnoSelecionado}`),
    ]);

    const agora = new Date();
    const anoAtual = agora.getFullYear();
    const mesAtual = agora.getMonth() + 1;

    root.innerHTML = `
      <h3 class="panel-title">Este mês</h3>
      <div class="metric-grid" id="financeiro-mes-cards-wrap">
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

      <div id="financeiro-ano-cards-wrap">${buildEsteAnoCardsHtml(anos, financeiroAnoSelecionado, resumo)}</div>

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

    document.querySelectorAll("[data-desmarcar-pago]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await apiSend(`/orcamentos/${btn.dataset.desmarcarPago}`, "PUT", { pago: false });
          showAlert("Pagamento desfeito — orçamento voltou para Contas a Receber.", "success");
          renderFinanceiro();
        } catch (e) {
          showAlert(e.message);
        }
      });
    });

    document.querySelectorAll("#financeiro-mes-cards-wrap [data-detalhe-ano]").forEach((card) => {
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
  const totalCustoVendas = detalhe.orcamentos.reduce(
    (s, o) => s + (o.tipo === "venda_equipamento" && o.custo != null ? Number(o.custo) : 0),
    0
  );
  const totalPecas = detalhe.pecas.reduce((s, p) => s + Number(p.custo_total), 0);
  const totalDespesas = detalhe.despesas.reduce((s, d) => s + Number(d.valor), 0);
  const liquido = totalOrcamentos - totalCustoVendas - totalPecas - totalDespesas;

  const resumoHtml = `
    <div class="metric-grid" style="margin-bottom:24px">
      <div class="metric-card">
        <div class="metric-label">Faturamento</div>
        <div class="metric-value amber">${formatMoney(totalOrcamentos)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Líquido</div>
        <div class="metric-value" style="color:var(--green)">${formatMoney(liquido)}</div>
      </div>
    </div>
  `;

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
                <td>${formatTipoOrcamentoCurto(o.tipo)}</td>
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
    ${resumoHtml}

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

function compareNumeroDesc(a, b) {
  if (!a.numero && !b.numero) return 0;
  if (!a.numero) return 1; // sem número vai para o fim, mesmo em ordem decrescente
  if (!b.numero) return -1;
  return b.numero.localeCompare(a.numero, undefined, { numeric: true, sensitivity: "base" });
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

function itemTextoBuscavel(viewKey, config, item) {
  const partes = [];
  if (config.filterEmpresa || config.searchCliente) partes.push(nomeClienteDoItem(viewKey, item));
  if (config.searchFields) {
    config.searchFields.forEach((campo) => {
      if (item[campo] != null) partes.push(String(item[campo]));
    });
  }
  return partes.join(" ").toLowerCase();
}

function applyFilters(viewKey, items) {
  const config = ENTITIES[viewKey];
  const state = filterState[viewKey] || {};
  let filtrados = items;
  const campoFiltro = config.filterKey || "status"; // Notas Fiscais filtra por "tipo"
  if (state.status) filtrados = filtrados.filter((i) => i[campoFiltro] === state.status);
  if (state.busca) {
    const termo = state.busca.toLowerCase();
    filtrados = filtrados.filter((i) => itemTextoBuscavel(viewKey, config, i).includes(termo));
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
  const searchHtml =
    config.filterEmpresa || config.searchFields || config.searchCliente
      ? `<input type="text" id="filtro-busca" class="filter-search" placeholder="${config.searchPlaceholder || "Buscar..."}" value="${state.busca || ""}">`
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
  const searchInput = document.getElementById("filtro-busca");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      filterState[viewKey].busca = searchInput.value;
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
          // Selo "NF 1234": vem antes de c.relation, que devolveria o rótulo longo.
          if (c.nfBadge) return `<td>${value != null ? badgeNF(value) : ""}</td>`;
          if (c.relation) value = relationLabel(c.relation, value);
          else if (c.compute) value = c.compute(item);
          else if (c.nfTipo) return `<td><span class="badge nf-${escHtml(value)}">${escHtml(NF_TIPO_LABEL[value] || value)}</span></td>`;
          else if (c.money) value = formatMoney(value);
          else if (c.date) value = formatDate(value);
          else if (c.tipoOrcamento) value = formatTipoOrcamento(value);
          else if (c.badge) return `<td><span class="badge status-${value}">${value}</span></td>`;
          else if (c.pagoBadge) return `<td>${value ? '<span class="badge status-pago">Pago</span>' : '<span class="badge status-pendente">Pendente</span>'}</td>`;
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
    const temFiltro = config.statusFilters || config.filterEmpresa || config.searchFields || config.searchCliente;

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

  const avisosHtml =
    prefillData && prefillData._avisos && prefillData._avisos.length
      ? `<div class="aviso-xml">${prefillData._avisos.map((a) => `<p>${escHtml(a)}</p>`).join("")}</div>`
      : "";
  const veioDeXml = !isEdit && prefillData && prefillData._extra;

  form.innerHTML =
    avisosHtml +
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
            : f.options.map((o) => {
                // opção pode ser só um texto ("mensal") ou { value, label } quando o valor salvo difere do rótulo
                const val = typeof o === "object" ? o.value : o;
                const lab = typeof o === "object" ? o.label : o;
                return `<option value="${val}" ${val === valueAttr ? "selected" : ""}>${lab}</option>`;
              });
          return `<div class="field">
            <label>${f.label}${f.required ? " *" : ""}</label>
            <select name="${f.name}" ${f.required ? "required" : ""}>
              ${f.relation || (veioDeXml && !valueAttr) ? `<option value="">Selecione...</option>` : ""}
              ${options.join("")}
            </select>
          </div>`;
        }
        if (f.type === "checkbox") {
          const checked = currentValue ? "checked" : "";
          return `<div class="field field-checkbox">
            <label><input type="checkbox" name="${f.name}" ${checked}> ${f.label}</label>
          </div>`;
        }
        if (f.type === "textarea") {
          return `<div class="field">
            <label>${f.label}${f.required ? " *" : ""}</label>
            <textarea name="${f.name}" ${f.required ? "required" : ""}>${escHtml(valueAttr)}</textarea>
          </div>`;
        }
        return `<div class="field">
          <label>${f.label}${f.required ? " *" : ""}</label>
          <input type="${f.type}" name="${f.name}" value="${escHtml(valueAttr)}" ${f.placeholder ? `placeholder="${f.placeholder}"` : ""} ${f.type === "number" ? 'step="0.01"' : ""} ${f.required ? "required" : ""}>
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
      if (f.type === "checkbox") {
        data[f.name] = form.querySelector(`[name="${f.name}"]`).checked;
        return;
      }
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
        // campos que não aparecem no formulário (ex.: o texto do XML importado)
        if (veioDeXml) Object.assign(data, prefillData._extra);
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
  await preloadRelations({ columns: [{ relation: "clientes" }, { relation: "equipamentos" }, { relation: "notas_fiscais" }], fields: [] });

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
          <option value="desenvolvimento" ${tipoAtual === "desenvolvimento" ? "selected" : ""}>Desenvolvimento</option>
          <option value="venda_equipamento" ${tipoAtual === "venda_equipamento" ? "selected" : ""}>Venda de Equipamento</option>
        </select>
      </div>
      <div class="field"><label>Data de emissão</label><input type="date" name="data" value="${v("data").slice(0, 10)}" placeholder="hoje"></div>
    </div>

    <div id="secao-tecnico">
      <div id="secao-equipamentos">
        <div class="field"><label>Local</label><input type="text" name="local_equipamento" value="${v("local_equipamento")}" placeholder="ex: Loja Mooca"></div>

        <label class="field-label-block">Equipamentos — defeito e solução de cada um</label>
        <div class="picker-row">
          <select id="equipamento-picker">${equipamentosPickerOptions()}</select>
          <button type="button" class="btn" id="btn-add-equip">+ Adicionar</button>
        </div>
        <div id="equipamentos-cards"></div>
      </div>

      <div class="field hidden" id="campo-escopo-servico">
        <label>Escopo do Serviço</label>
        <textarea name="escopo_servico" placeholder="Descreva o projeto/serviço a ser desenvolvido">${v("escopo_servico")}</textarea>
      </div>

      <label class="field-label-block" id="label-itens-tecnico">Peças e Serviços</label>
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
      <div class="field" id="campo-garantia-dias"><label>Garantia (dias)</label><input type="number" name="garantia_dias" value="${v("garantia_dias", 90)}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Condições de pagamento</label><input type="text" name="condicoes_pagamento" value="${v("condicoes_pagamento")}" placeholder="ex: 28DDL"></div>
      <div class="field" id="campo-prazo-entrega-geral"><label>Prazo de entrega</label><input type="text" name="prazo_entrega" value="${v("prazo_entrega")}" placeholder="ex: 30 dias após aprovação"></div>
    </div>
    <div class="field-row">
      <div class="field"><label id="label-transporte">Transporte por conta de</label><input type="text" name="responsabilidade_transporte" value="${v("responsabilidade_transporte", "Cliente")}"></div>
      <div class="field"><label>Técnico / Vendedor responsável</label><input type="text" name="tecnico_responsavel" value="${v("tecnico_responsavel")}"></div>
    </div>

    <div class="field"><label>Observações</label><textarea name="observacoes">${v("observacoes")}</textarea></div>

    <div class="field"><label>Status</label>
      <select name="status">
        ${["pendente", "aprovado", "recusado"].map((s) => `<option value="${s}" ${v("status", "pendente") === s ? "selected" : ""}>${s}</option>`).join("")}
      </select>
    </div>

    <div class="field"><label>Nota fiscal (opcional)</label>
      <select name="nota_fiscal_id"><option value="">— sem nota —</option>${notaFiscalOptionsHtml(v("nota_fiscal_id"))}</select>
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
    const mostrarItensTecnicos = tipo === "tecnico" || tipo === "desenvolvimento";
    document.getElementById("secao-tecnico").classList.toggle("hidden", !mostrarItensTecnicos);
    document.getElementById("secao-venda").classList.toggle("hidden", tipo !== "venda_equipamento");
    document.getElementById("secao-equipamentos").classList.toggle("hidden", tipo !== "tecnico");
    document.getElementById("campo-escopo-servico").classList.toggle("hidden", tipo !== "desenvolvimento");
    document.getElementById("label-itens-tecnico").textContent = tipo === "desenvolvimento" ? "Itens do Projeto" : "Peças e Serviços";
    // Na Venda de Equipamento, Garantia e Prazo de entrega já são definidos
    // por item (aparecem na tabela do PDF) — os campos gerais abaixo não são
    // usados nesse caso, então ficam escondidos pra não duplicar.
    const ehVenda = tipo === "venda_equipamento";
    document.getElementById("campo-garantia-dias").classList.toggle("hidden", ehVenda);
    document.getElementById("campo-prazo-entrega-geral").classList.toggle("hidden", ehVenda);
    document.getElementById("label-transporte").textContent = ehVenda ? "Frete/instalação por conta de" : "Transporte por conta de";
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
    // Nota fiscal é opcional: vazio vira null (e, na edição, isso desfaz o vínculo).
    data.nota_fiscal_id = data.nota_fiscal_id ? Number(data.nota_fiscal_id) : null;

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

    <div class="field"><label>Nota fiscal (opcional)</label>
      <select name="nota_fiscal_id"><option value="">— sem nota —</option>${notaFiscalOptionsHtml(v("nota_fiscal_id"))}</select>
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
    <div class="picker-row" style="flex-wrap:wrap;gap:8px">
      <select id="peca-picker">${pecasPickerOptions()}</select>
      <input type="number" id="peca-qtd" min="1" step="1" value="1" style="width:70px" title="Quantidade">
      <input type="number" id="peca-venda" min="0" step="0.01" placeholder="Venda (R$)" style="width:110px" title="Preço de venda nesta OS">
      <input type="number" id="peca-custo" min="0" step="0.01" placeholder="Custo (R$)" style="width:110px" title="Quanto você pagou nesta OS">
      <button type="button" class="btn" id="btn-add-peca">+ Adicionar</button>
    </div>
    <p style="font-size:12px;color:var(--ink-soft);margin:2px 0 0">Venda e custo já vêm preenchidos com o padrão da peça, mas dá pra ajustar pra esse lançamento específico.</p>
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
              `<span class="chip">${p.quantidade}x ${p.nome} — venda ${formatMoney(p.valor_unitario)} / custo ${formatMoney(p.valor_compra)}<button type="button" data-remove-peca-nova="${idx}">×</button></span>`
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

  function preencherPadraoPeca() {
    const picker = document.getElementById("peca-picker");
    const peca = (cache.pecas || []).find((p) => p.id === Number(picker.value));
    document.getElementById("peca-venda").value = peca ? Number(peca.valor_unitario).toFixed(2) : "";
    document.getElementById("peca-custo").value = peca && peca.valor_compra != null ? Number(peca.valor_compra).toFixed(2) : "";
  }
  document.getElementById("peca-picker").addEventListener("change", preencherPadraoPeca);
  preencherPadraoPeca();

  document.getElementById("btn-add-peca").addEventListener("click", () => {
    const picker = document.getElementById("peca-picker");
    const qtdInput = document.getElementById("peca-qtd");
    const vendaInput = document.getElementById("peca-venda");
    const custoInput = document.getElementById("peca-custo");
    if (!picker.value) return;
    const qtd = Number(qtdInput.value) || 1;
    const peca = (cache.pecas || []).find((p) => p.id === Number(picker.value));
    if (!peca) return;
    const valor_unitario = vendaInput.value !== "" ? Number(vendaInput.value) : Number(peca.valor_unitario);
    const valor_compra = custoInput.value !== "" ? Number(custoInput.value) : Number(peca.valor_compra || 0);
    pecasNovas.push({ peca_id: peca.id, nome: peca.nome, quantidade: qtd, valor_unitario, valor_compra });
    qtdInput.value = 1;
    renderPecasNovas();
    preencherPadraoPeca();
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
    // Nota fiscal é opcional: vazio vira null (e, na edição, isso desfaz o vínculo).
    data.nota_fiscal_id = data.nota_fiscal_id ? Number(data.nota_fiscal_id) : null;

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
            valor_unitario: p.valor_unitario,
            valor_compra: p.valor_compra,
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

  document.getElementById("btn-importar-xml").classList.toggle("hidden", viewKey !== "notas_fiscais");
  document.getElementById("btn-sync-dfe").classList.toggle("hidden", viewKey !== "notas_fiscais");

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
// ---------- Importar XML de nota fiscal ----------

// Lê o arquivo como bytes e decodifica: UTF-8 primeiro (o normal em NF-e/NFS-e);
// se tiver caracteres inválidos, tenta windows-1252 (alguns emissores antigos).
async function lerArquivoTexto(file) {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

async function importarXmlNota(file) {
  if (file.size > 2 * 1024 * 1024) {
    showAlert("O arquivo é grande demais para ser uma nota fiscal (máximo 2 MB).");
    return;
  }
  try {
    const xml = await lerArquivoTexto(file);
    const r = await apiSend("/notas-fiscais/xml/preview", "POST", { xml });
    if (r.duplicada) {
      const nome = r.duplicada.numero ? `nº ${r.duplicada.numero}` : `#${r.duplicada.id}`;
      // Nota que veio da SEFAZ só como resumo (sem XML): em vez de barrar,
      // completa a nota existente com o XML e os dados completos.
      if (!r.duplicada.tem_xml && confirm(`A nota ${nome} já existe, mas só como resumo da SEFAZ. Anexar este XML a ela?`)) {
        const dados = Object.fromEntries(Object.entries(r.campos).filter(([k, v]) => v != null && k !== "tipo"));
        await apiSend(`/notas-fiscais/${r.duplicada.id}`, "PUT", { ...dados, xml });
        showAlert(`Nota ${nome} completada com o XML.`, "success");
        switchView("notas_fiscais");
        return;
      }
      showAlert(`Esta nota já está cadastrada (${nome}). Nada foi importado.`);
      return;
    }
    await openModal("notas_fiscais", null, {
      ...r.campos,
      _avisos: r.avisos,
      _extra: { xml, origem: "upload" },
    });
  } catch (e) {
    showAlert(e.message);
  }
}

document.getElementById("btn-sync-dfe").addEventListener("click", async () => {
  const btn = document.getElementById("btn-sync-dfe");
  btn.disabled = true;
  btn.textContent = "Consultando a SEFAZ...";
  try {
    const r = await apiSend("/notas-fiscais/dfe/sincronizar", "POST", {});
    showAlert(r.mensagem, "success");
    switchView("notas_fiscais");
  } catch (e) {
    showAlert(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Buscar compras (SEFAZ)";
  }
});

document.getElementById("btn-importar-xml").addEventListener("click", () => {
  document.getElementById("input-xml").click();
});
document.getElementById("input-xml").addEventListener("change", (ev) => {
  const file = ev.target.files[0];
  ev.target.value = ""; // permite escolher o mesmo arquivo de novo depois
  if (file) importarXmlNota(file);
});

document.getElementById("modal-close").addEventListener("click", closeModal);
let modalMousedownNoOverlay = false;
document.getElementById("modal-overlay").addEventListener("mousedown", (ev) => {
  // Só conta como "clique fora" se o botão foi pressionado E solto no
  // fundo escuro — evita fechar o modal quando você seleciona texto ou
  // arrasta dentro de um campo e o mouse escorrega pra fora sem querer.
  modalMousedownNoOverlay = ev.target.id === "modal-overlay";
});
document.getElementById("modal-overlay").addEventListener("click", (ev) => {
  if (ev.target.id === "modal-overlay" && modalMousedownNoOverlay) closeModal();
  modalMousedownNoOverlay = false;
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