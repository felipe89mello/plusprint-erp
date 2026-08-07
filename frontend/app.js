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
    columns: [
      { key: "id", label: "ID", mono: true },
      { key: "cliente_id", label: "Cliente", relation: "clientes" },
      { key: "descricao", label: "Descrição" },
      { key: "status", label: "Status", badge: true },
      { key: "data_abertura", label: "Data de abertura", date: true },
    ],
    fields: [
      { name: "cliente_id", label: "Cliente", type: "select", relation: "clientes", required: true },
      { name: "equipamento_id", label: "Equipamento", type: "select", relation: "equipamentos" },
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
    columns: [
      { key: "id", label: "ID", mono: true },
      { key: "numero", label: "Nº" },
      { key: "cliente_id", label: "Cliente", relation: "clientes" },
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
    columns: [
      { key: "id", label: "ID", mono: true },
      { key: "nome", label: "Nome" },
      { key: "quantidade_estoque", label: "Estoque", mono: true, lowStock: true },
      { key: "valor_compra", label: "Custo (compra)", money: true },
      { key: "valor_unitario", label: "Valor de venda", money: true },
    ],
    fields: [
      { name: "nome", label: "Nome", type: "text", required: true },
      { name: "quantidade_estoque", label: "Quantidade em estoque", type: "number", required: true },
      { name: "valor_compra", label: "Valor de compra / custo (R$)", type: "number" },
      { name: "valor_unitario", label: "Valor de venda (R$)", type: "number", required: true },
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

      <h3 class="panel-title">Orçamentos</h3>
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Total</div>
          <div class="metric-value">${d.orcamentos_total}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Pendentes</div>
          <div class="metric-value">${d.orcamentos_pendentes}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Aprovados</div>
          <div class="metric-value" style="color:var(--green)">${d.orcamentos_aprovados}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Recusados</div>
          <div class="metric-value" style="color:var(--red)">${d.orcamentos_recusados}</div>
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

async function renderFinanceiro() {
  const root = document.getElementById("view-root");
  root.innerHTML = `<div class="empty-state">Carregando indicadores...</div>`;

  try {
    const d = await apiGet("/dashboard/");
    root.innerHTML = `
      <h3 class="panel-title">Este mês</h3>
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Faturamento</div>
          <div class="metric-value amber">${formatMoney(d.faturamento_mes_atual)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Custo de peças</div>
          <div class="metric-value" style="color:var(--red)">${formatMoney(d.custo_pecas_mes)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Líquido</div>
          <div class="metric-value" style="color:var(--green)">${formatMoney(d.liquido_mes)}</div>
        </div>
      </div>

      <h3 class="panel-title">Este ano</h3>
      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">Faturamento</div>
          <div class="metric-value amber">${formatMoney(d.faturamento_ano)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Custo de peças</div>
          <div class="metric-value" style="color:var(--red)">${formatMoney(d.custo_pecas_ano)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Líquido</div>
          <div class="metric-value" style="color:var(--green)">${formatMoney(d.liquido_ano)}</div>
        </div>
      </div>
    `;
  } catch (e) {
    root.innerHTML = `<div class="empty-state">Não foi possível carregar os dados financeiros. A API está rodando?</div>`;
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
        return `<tr>${cells}<td class="row-actions">${pdfBtn}${osBtn}<button class="btn btn-edit" data-edit="${item.id}">Editar</button><button class="btn btn-danger" data-delete="${item.id}">Excluir</button></td></tr>`;
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
    root.querySelectorAll("[data-pdf]").forEach((btn) => {
      btn.addEventListener("click", () => window.open(`${API_BASE}/orcamentos/${btn.dataset.pdf}/pdf`, "_blank"));
    });
    root.querySelectorAll("[data-pdf-os]").forEach((btn) => {
      btn.addEventListener("click", () => window.open(`${API_BASE}/ordens-servico/${btn.dataset.pdfOs}/pdf`, "_blank"));
    });
    root.querySelectorAll("[data-gerar-os]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = items.find((i) => String(i.id) === btn.dataset.gerarOs);
        handleGerarOS(item);
      });
    });
    root.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = items.find((i) => String(i.id) === btn.dataset.edit);
        if (ENTITIES[viewKey].custom) openOrcamentoModal(item);
        else openModal(viewKey, item);
      });
    });
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
  const primeiroEquip = orcamento.equipamentos && orcamento.equipamentos[0];
  const prefill = {
    cliente_id: orcamento.cliente_id,
    equipamento_id: (primeiroEquip && primeiroEquip.equipamento_id) || "",
    orcamento_id: orcamento.id,
    descricao: montarDescricaoOS(orcamento),
    status: "aberto",
  };
  await openModal("ordens", null, prefill);
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
          <input type="${f.type}" name="${f.name}" value="${valueAttr}" ${f.type === "number" ? 'step="0.01"' : ""} ${f.required ? "required" : ""}>
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
      <td><input type="number" step="0.01" class="item-qtd" value="${item.quantidade ?? ""}" placeholder="Qtde." required></td>
      <td><input type="text" class="item-desc" value="${item.descricao ?? ""}" placeholder="Descrição" required></td>
      <td><input type="number" step="0.01" class="item-valor" value="${item.valor_unitario ?? ""}" placeholder="Unitário" required></td>
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

async function openOrcamentoModal(existingItem) {
  await preloadRelations({ columns: [{ relation: "clientes" }, { relation: "equipamentos" }], fields: [] });

  const isEdit = existingItem != null;
  document.getElementById("modal-title").textContent = `${isEdit ? "Editar" : "Novo"} — Orçamento`;
  document.getElementById("modal").classList.add("modal-lg");

  const clientesOptions = (cache.clientes || [])
    .map((c) => `<option value="${c.id}" ${isEdit && c.id === existingItem.cliente_id ? "selected" : ""}>${c.nome}</option>`)
    .join("");

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
      .filter((e) => !equipamentosSelecionados.some((s) => s.equipamento_id === e.id))
      .map((e) => `<option value="${e.id}">${labelForItem(e)}</option>`)
      .join("");

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
      <div class="field"><label>Data de emissão</label><input type="date" name="data" value="${v("data").slice(0, 10)}" placeholder="hoje"></div>
      <div class="field"><label>Local</label><input type="text" name="local_equipamento" value="${v("local_equipamento")}" placeholder="ex: Loja Mooca"></div>
    </div>

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
      <div class="field"><label>Técnico responsável</label><input type="text" name="tecnico_responsavel" value="${v("tecnico_responsavel")}"></div>
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

    if (data.itens.length === 0) {
      showAlert("Adicione ao menos um item de peça ou serviço.");
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
  if (ENTITIES[currentView] && ENTITIES[currentView].custom) openOrcamentoModal(null);
  else openModal(currentView);
});
document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", (ev) => {
  if (ev.target.id === "modal-overlay") closeModal();
});

checkApiStatus();
setInterval(checkApiStatus, 15000);
switchView("dashboard");
