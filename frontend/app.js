const API_BASE = "http://localhost:8000";

// ---------------------------------------------------------------
// Configuração de cada módulo: de onde vem o dado e como exibir/editar.
// Isso evita repetir a lógica de tabela/formulário 7 vezes — um único
// motor genérico (renderList, openModal) lê essa configuração.
// ---------------------------------------------------------------

const ENTITIES = {
  clientes: {
    title: "Clientes",
    endpoint: "/clientes/",
    columns: [
      { key: "id", label: "ID", mono: true },
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
    columns: [
      { key: "id", label: "ID", mono: true },
      { key: "cliente_id", label: "Cliente", relation: "clientes" },
      { key: "descricao", label: "Descrição" },
      { key: "status", label: "Status", badge: true },
      { key: "data_abertura", label: "Abertura", date: true },
    ],
    fields: [
      { name: "cliente_id", label: "Cliente", type: "select", relation: "clientes", required: true },
      { name: "equipamento_id", label: "Equipamento", type: "select", relation: "equipamentos" },
      { name: "orcamento_id", label: "Orçamento de origem (opcional)", type: "select", relation: "orcamentos" },
      { name: "descricao", label: "Descrição", type: "textarea", required: true },
      { name: "status", label: "Status", type: "select", options: ["aberto", "em_andamento", "concluido"] },
    ],
  },

  orcamentos: {
    title: "Orçamentos",
    endpoint: "/orcamentos/",
    columns: [
      { key: "id", label: "ID", mono: true },
      { key: "cliente_id", label: "Cliente", relation: "clientes" },
      { key: "descricao_itens", label: "Itens" },
      { key: "valor_total", label: "Valor", money: true },
      { key: "status", label: "Status", badge: true },
    ],
    fields: [
      { name: "cliente_id", label: "Cliente", type: "select", relation: "clientes", required: true },
      { name: "descricao_itens", label: "Descrição dos itens", type: "textarea", required: true },
      { name: "valor_total", label: "Valor total (R$)", type: "number", required: true },
      { name: "status", label: "Status", type: "select", options: ["pendente", "aprovado", "recusado"] },
    ],
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
    columns: [
      { key: "id", label: "ID", mono: true },
      { key: "nome", label: "Nome" },
      { key: "quantidade_estoque", label: "Estoque", mono: true, lowStock: true },
      { key: "valor_unitario", label: "Valor unitário", money: true },
    ],
    fields: [
      { name: "nome", label: "Nome", type: "text", required: true },
      { name: "quantidade_estoque", label: "Quantidade em estoque", type: "number", required: true },
      { name: "valor_unitario", label: "Valor unitário (R$)", type: "number", required: true },
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
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`Erro ${res.status} ao buscar ${path}`);
  return res.json();
}

async function apiSend(path, method, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detalhe = await res.json().catch(() => ({}));
    throw new Error(detalhe.detail || `Erro ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

async function apiDelete(path) {
  const res = await fetch(API_BASE + path, { method: "DELETE" });
  if (!res.ok) throw new Error(`Erro ${res.status} ao excluir`);
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

function relationLabel(entityKey, id) {
  if (id == null) return "—";
  const list = cache[entityKey] || [];
  const item = list.find((i) => i.id === id);
  if (!item) return `#${id}`;
  return item.nome || item.descricao || item.descricao_itens || `#${id}`;
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
          <div class="metric-label">Faturamento do mês</div>
          <div class="metric-value amber">${formatMoney(d.faturamento_mes_atual)}</div>
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

// ---------------------------------------------------------------
// Renderização: Listagem genérica (Clientes, Equipamentos, ...)
// ---------------------------------------------------------------

async function preloadRelations(config) {
  // Garante que os dados de relação (ex: clientes, para exibir nome em vez de ID)
  // estejam no cache antes de desenhar a tabela.
  const needed = new Set();
  config.columns.forEach((c) => c.relation && needed.add(c.relation));
  config.fields.forEach((f) => f.relation && needed.add(f.relation));
  for (const key of needed) {
    if (!cache[key]) {
      cache[key] = await apiGet(ENTITIES[key].endpoint);
    }
  }
}

async function renderList(viewKey) {
  const config = ENTITIES[viewKey];
  const root = document.getElementById("view-root");
  root.innerHTML = `<div class="empty-state">Carregando...</div>`;

  try {
    await preloadRelations(config);
    const items = await apiGet(config.endpoint);
    cache[viewKey] = items;

    if (items.length === 0) {
      root.innerHTML = `<div class="table-wrap"><div class="empty-state">Nenhum registro ainda. Clique em "+ Novo" para começar.</div></div>`;
      return;
    }

    const headerHtml = config.columns.map((c) => `<th>${c.label}</th>`).join("") + "<th></th>";

    const rowsHtml = items
      .map((item) => {
        const cells = config.columns
          .map((c) => {
            let value = item[c.key];
            if (c.relation) value = relationLabel(c.relation, value);
            else if (c.money) value = formatMoney(value);
            else if (c.date) value = formatDate(value);
            else if (c.badge) return `<td><span class="badge status-${value}">${value}</span></td>`;
            else if (value == null || value === "") value = "—";

            const cls = c.mono ? "mono" : "";
            const style = c.lowStock && item.quantidade_estoque < 5 ? 'style="color:var(--red);font-weight:600"' : "";
            return `<td class="${cls}" ${style}>${value}</td>`;
          })
          .join("");
        return `<tr>${cells}<td><button class="btn btn-danger" data-delete="${item.id}">Excluir</button></td></tr>`;
      })
      .join("");

    root.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;

    root.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", () => handleDelete(viewKey, btn.dataset.delete));
    });
  } catch (e) {
    root.innerHTML = `<div class="empty-state">Não foi possível carregar os dados. A API está rodando?</div>`;
  }
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

async function openModal(viewKey) {
  const config = ENTITIES[viewKey];
  await preloadRelations(config);

  document.getElementById("modal-title").textContent = `Novo — ${config.title}`;
  const form = document.getElementById("modal-form");
  form.setAttribute("autocomplete", "off");

  form.innerHTML =
    config.fields
      .map((f) => {
        if (f.type === "select") {
          const options = f.relation
            ? (cache[f.relation] || []).map((i) => `<option value="${i.id}">${i.nome || i.descricao || i.descricao_itens || "#" + i.id}</option>`)
            : f.options.map((o) => `<option value="${o}">${o}</option>`);
          return `<div class="field">
            <label>${f.label}${f.required ? " *" : ""}</label>
            <select name="${f.name}" ${f.required ? "required" : ""}>
              ${f.relation ? '<option value="">Selecione...</option>' : ""}
              ${options.join("")}
            </select>
          </div>`;
        }
        if (f.type === "textarea") {
          return `<div class="field">
            <label>${f.label}${f.required ? " *" : ""}</label>
            <textarea name="${f.name}" ${f.required ? "required" : ""}></textarea>
          </div>`;
        }
        return `<div class="field">
          <label>${f.label}${f.required ? " *" : ""}</label>
          <input type="${f.type}" name="${f.name}" ${f.type === "number" ? 'step="0.01"' : ""} ${f.required ? "required" : ""}>
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
      await apiSend(config.endpoint, "POST", data);
      showAlert("Registro criado com sucesso.", "success");
      closeModal();
      renderList(viewKey);
    } catch (e) {
      showAlert(e.message);
    }
  };
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
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
  document.getElementById("view-title").textContent = config ? config.title : "Dashboard";
  document.getElementById("btn-novo").classList.toggle("hidden", viewKey === "dashboard");

  if (viewKey === "dashboard") renderDashboard();
  else renderList(viewKey);
}

// ---------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------

document.getElementById("nav").addEventListener("click", (ev) => {
  const btn = ev.target.closest(".nav-item");
  if (btn) switchView(btn.dataset.view);
});

document.getElementById("btn-novo").addEventListener("click", () => openModal(currentView));
document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", (ev) => {
  if (ev.target.id === "modal-overlay") closeModal();
});

checkApiStatus();
setInterval(checkApiStatus, 15000);
switchView("dashboard");
