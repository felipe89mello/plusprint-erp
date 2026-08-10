import io
import os
import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy.orm import Session

from app import models
from app.database import get_db

router = APIRouter(prefix="/orcamentos", tags=["Orçamentos"])

AMBER = colors.HexColor("#B97A1E")
INK = colors.HexColor("#1C1E22")
LINE = colors.HexColor("#CFCFC8")

LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "logo.png")

# Dados de contato da Plusprint exibidos nas propostas comerciais de venda —
# você pode me pedir para alterar esses dados quando quiser.
PLUSPRINT_EMAIL = "felipe@plusprintautomacao.com"
PLUSPRINT_FONE = "(11) 9-60825882"


def _slugify(texto: str) -> str:
    """Converte 'PIXIE ARTEMODA LTDA.' em 'pixie_artemoda_ltda' — seguro para nome de arquivo."""
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    limpo = re.sub(r"[^a-zA-Z0-9]+", "_", sem_acento).strip("_").lower()
    return limpo[:40]


def _gerar_pdf_bytes(orcamento: models.Orcamento) -> bytes:
    if orcamento.tipo == "venda_equipamento":
        return _gerar_pdf_venda(orcamento)
    return _gerar_pdf_tecnico(orcamento)


def _gerar_pdf_tecnico(orcamento: models.Orcamento) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
    )
    styles = getSampleStyleSheet()
    label_style = ParagraphStyle("label", parent=styles["Normal"], fontSize=8.5, textColor=colors.grey)
    value_style = ParagraphStyle("value", parent=styles["Normal"], fontSize=10, textColor=INK)
    section_style = ParagraphStyle(
        "section", parent=styles["Heading3"], fontSize=11, textColor=AMBER, spaceBefore=14, spaceAfter=6
    )
    body_style = ParagraphStyle("body", parent=styles["Normal"], fontSize=9.5, leading=13)

    story = []

    # Cabeçalho
    cliente = orcamento.cliente
    titulo_style = ParagraphStyle("title", parent=styles["Title"], fontSize=15, textColor=INK, alignment=0)

    if os.path.exists(LOGO_PATH):
        logo = Image(LOGO_PATH, width=20 * mm, height=20 * mm)
        header_data = [[logo, Paragraph("ORÇAMENTO TÉCNICO COMERCIAL", titulo_style)]]
        header_table = Table(header_data, colWidths=[24 * mm, 146 * mm])
        header_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (0, 0), 0),
        ]))
        story.append(header_table)
    else:
        story.append(Table([[Paragraph("ORÇAMENTO TÉCNICO COMERCIAL", titulo_style)]], colWidths=[170 * mm]))
    story.append(Spacer(1, 2))

    numero_txt = f"Proposta nº {orcamento.numero}" if orcamento.numero else f"Proposta nº {orcamento.id}"
    data_txt = orcamento.data.strftime("%d/%m/%Y")
    story.append(Paragraph(f"{numero_txt}  ·  Data: {data_txt}", label_style))
    story.append(Spacer(1, 10))

    # Dados do cliente
    def linha(label, valor):
        return [Paragraph(label, label_style), Paragraph(valor or "—", value_style)]

    cliente_rows = [
        linha("Cliente", cliente.nome),
        linha("Endereço", cliente.endereco),
        linha("Contato", cliente.contato_nome),
        linha("CNPJ/CPF", cliente.cnpj_cpf),
        linha("E-mail", cliente.email),
        linha("Telefone", cliente.telefone),
    ]
    t = Table(cliente_rows, colWidths=[30 * mm, 140 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
    ]))
    story.append(t)

    # Equipamento(s) — cada um com seu próprio diagnóstico e solução
    if orcamento.itens_equipamento or orcamento.local_equipamento:
        titulo_eq = "Equipamento" if len(orcamento.itens_equipamento) <= 1 else "Equipamentos"
        story.append(Paragraph(titulo_eq, section_style))

        if orcamento.local_equipamento:
            story.append(Paragraph(f"Local: {orcamento.local_equipamento}", label_style))
            story.append(Spacer(1, 4))

        eq_nome_style = ParagraphStyle("eq_nome", parent=styles["Normal"], fontSize=10, fontName="Helvetica-Bold", textColor=INK, spaceBefore=6)
        eq_label_style = ParagraphStyle("eq_label", parent=styles["Normal"], fontSize=8.5, fontName="Helvetica-Bold", textColor=colors.grey, spaceBefore=3)

        for vinculo in orcamento.itens_equipamento:
            eq = vinculo.equipamento
            nome_eq = f"{eq.marca} {eq.modelo}" if eq else "Equipamento"
            if eq and eq.numero_serie:
                nome_eq += f" — SN {eq.numero_serie}"
            story.append(Paragraph(nome_eq, eq_nome_style))
            if vinculo.defeitos_constatados:
                story.append(Paragraph("Defeitos constatados:", eq_label_style))
                story.append(Paragraph(vinculo.defeitos_constatados, body_style))
            if vinculo.solucao_adotada:
                story.append(Paragraph("Solução adotada:", eq_label_style))
                story.append(Paragraph(vinculo.solucao_adotada, body_style))

    # Itens
    story.append(Paragraph("Peças e Serviços", section_style))
    tabela_dados = [["Qtde./Hrs", "Descrição", "Unitário", "Total"]]
    for item in orcamento.itens:
        total_item = item.quantidade * item.valor_unitario
        tabela_dados.append([
            f"{item.quantidade:g}",
            item.descricao,
            f"R$ {item.valor_unitario:.2f}",
            f"R$ {total_item:.2f}",
        ])
    valor_total = sum((i.quantidade * i.valor_unitario for i in orcamento.itens), 0)
    tabela_dados.append(["", "", "Subtotal", f"R$ {valor_total:.2f}"])

    itens_table = Table(tabela_dados, colWidths=[22 * mm, 88 * mm, 28 * mm, 32 * mm])
    itens_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("GRID", (0, 0), (-1, -2), 0.5, LINE),
        ("LINEABOVE", (0, -1), (-1, -1), 1, INK),
        ("FONTNAME", (2, -1), (-1, -1), "Helvetica-Bold"),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ("TOPPADDING", (0, 1), (-1, -1), 5),
    ]))
    story.append(itens_table)

    # Condições comerciais
    story.append(Paragraph("Condições Comerciais", section_style))
    condicoes = [
        f"Validade do Orçamento: {orcamento.validade_dias} dias.",
        f"Condições de Pagamento: {orcamento.condicoes_pagamento or '—'}",
        f"Prazo de Entrega: {orcamento.prazo_entrega or '—'}",
        f"Garantia: Peças e Serviços com garantia de {orcamento.garantia_dias} dias contra defeitos de fabricação.",
        f"Transporte: responsabilidade e administração por conta do(a) {orcamento.responsabilidade_transporte}.",
    ]
    for linha_texto in condicoes:
        story.append(Paragraph(linha_texto, body_style))

    if orcamento.observacoes:
        story.append(Paragraph("Observações", section_style))
        story.append(Paragraph(orcamento.observacoes, body_style))

    # Assinatura
    story.append(Spacer(1, 18))
    tecnico = orcamento.tecnico_responsavel or "—"
    story.append(Paragraph(f"Técnico Responsável: {tecnico}", body_style))
    story.append(Spacer(1, 24))
    assinatura_data = [["Nome:", ""], ["Assinatura:", ""]]
    t = Table(assinatura_data, colWidths=[25 * mm, 120 * mm])
    t.setStyle(TableStyle([
        ("LINEBELOW", (1, 0), (1, 0), 0.7, INK),
        ("LINEBELOW", (1, 1), (1, 1), 0.7, INK),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
    ]))
    story.append(t)

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


def _gerar_pdf_venda(orcamento: models.Orcamento) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
    )
    styles = getSampleStyleSheet()
    label_style = ParagraphStyle("label", parent=styles["Normal"], fontSize=8.5, textColor=colors.grey)
    value_style = ParagraphStyle("value", parent=styles["Normal"], fontSize=10, textColor=INK)
    section_style = ParagraphStyle(
        "section", parent=styles["Heading3"], fontSize=11, textColor=AMBER, spaceBefore=14, spaceAfter=6
    )
    body_style = ParagraphStyle("body", parent=styles["Normal"], fontSize=9.5, leading=13)
    cell_style = ParagraphStyle("cell", parent=styles["Normal"], fontSize=7.5, leading=9.5, textColor=INK)
    cell_header_style = ParagraphStyle("cell_header", parent=cell_style, fontSize=7.5, textColor=colors.white, fontName="Helvetica-Bold")

    story = []
    cliente = orcamento.cliente
    titulo_style = ParagraphStyle("title", parent=styles["Title"], fontSize=15, textColor=INK, alignment=0)

    if os.path.exists(LOGO_PATH):
        logo = Image(LOGO_PATH, width=20 * mm, height=20 * mm)
        header_table = Table([[logo, Paragraph("ORÇAMENTO TÉCNICO COMERCIAL", titulo_style)]], colWidths=[24 * mm, 146 * mm])
        header_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (0, 0), 0),
        ]))
        story.append(header_table)
    else:
        story.append(Table([[Paragraph("ORÇAMENTO TÉCNICO COMERCIAL", titulo_style)]], colWidths=[170 * mm]))
    story.append(Spacer(1, 2))

    numero_txt = f"Proposta nº {orcamento.numero}" if orcamento.numero else f"Proposta nº {orcamento.id}"
    data_txt = orcamento.data.strftime("%d/%m/%Y")
    story.append(Paragraph(f"{numero_txt}  ·  Data: {data_txt}", label_style))
    story.append(Spacer(1, 10))

    # Dados do cliente — mesmo padrão label/valor do orçamento técnico
    def linha(label, valor):
        return [Paragraph(label, label_style), Paragraph(valor or "—", value_style)]

    contato_plusprint = f"{orcamento.tecnico_responsavel or '—'}  ·  {PLUSPRINT_EMAIL}  ·  {PLUSPRINT_FONE}"
    cliente_rows = [
        linha("Cliente", cliente.nome),
        linha("Endereço", cliente.endereco),
        linha("Contato", cliente.contato_nome),
        linha("CNPJ/CPF", cliente.cnpj_cpf),
        linha("E-mail", cliente.email),
        linha("Telefone", cliente.telefone),
        linha("Contato Plusprint", contato_plusprint),
    ]
    t = Table(cliente_rows, colWidths=[30 * mm, 140 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
    ]))
    story.append(t)

    # Itens — Item, NCM, Part Number, Descrição, Quant., Unid., Garantia, Prazo, Preço Unitário
    story.append(Paragraph("Equipamento(s)", section_style))
    cabecalho = ["Item", "NCM", "Part Number", "Descrição do Item", "Quant.", "Unid.", "Garantia\n(Meses)", "Prazo de\nEntrega", "Preço Unitário"]
    tabela_dados = [[Paragraph(c.replace("\n", "<br/>"), cell_header_style) for c in cabecalho]]

    valor_total = 0
    ipi_repr = None
    icms_repr = None
    for idx, item in enumerate(orcamento.itens_venda, start=1):
        total_item = item.quantidade * item.preco_unitario
        valor_total += total_item
        if ipi_repr is None and item.ipi_percentual is not None:
            ipi_repr = item.ipi_percentual
        if icms_repr is None and item.icms_percentual is not None:
            icms_repr = item.icms_percentual
        tabela_dados.append([
            Paragraph(str(idx), cell_style),
            Paragraph(item.ncm or "—", cell_style),
            Paragraph(item.partnumber or "—", cell_style),
            Paragraph(item.descricao, cell_style),
            Paragraph(f"{item.quantidade:g}", cell_style),
            Paragraph(item.unidade or "—", cell_style),
            Paragraph(str(item.garantia_meses) if item.garantia_meses is not None else "—", cell_style),
            Paragraph(item.prazo_entrega or "—", cell_style),
            Paragraph(f"R$ {item.preco_unitario:,.2f}", cell_style),
        ])

    tabela_dados.append(["", "", "", "", "", "", "", "Total", f"R$ {valor_total:,.2f}"])

    itens_table = Table(
        tabela_dados,
        colWidths=[10 * mm, 16 * mm, 20 * mm, 43 * mm, 14 * mm, 11 * mm, 17 * mm, 15 * mm, 24 * mm],
    )
    itens_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("GRID", (0, 0), (-1, -2), 0.5, LINE),
        ("LINEABOVE", (0, -1), (-1, -1), 1, INK),
        ("FONTNAME", (-2, -1), (-1, -1), "Helvetica-Bold"),
        ("ALIGN", (4, 0), (-1, -1), "CENTER"),
        ("ALIGN", (-2, -1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ("TOPPADDING", (0, 1), (-1, -1), 5),
    ]))
    story.append(itens_table)
    story.append(Spacer(1, 4))

    if ipi_repr is not None:
        story.append(Paragraph(f"Valor do IPI: {ipi_repr:g}% (Incluso valor acima)", body_style))
    if icms_repr is not None:
        story.append(Paragraph(f"Valor do ICMS: {icms_repr:g}% (Incluso valor acima)", body_style))

    # Condições comerciais — mesmo padrão do orçamento técnico
    story.append(Paragraph("Condições Gerais de Fornecimento", section_style))
    condicoes = [
        f"Validade: {orcamento.validade_dias} dias - A emissão desta proposta não garante a reserva dos itens ora cotados.",
        f"Condição de Pagamento: {orcamento.condicoes_pagamento or '—'}.",
        "Impostos: Inclusos, acima especificados.",
        "Prazo de Entrega: Conforme descrito.",
        "Entrega, instalação e treinamento feita por conta da Plusprint Automação.",
    ]
    for linha_texto in condicoes:
        story.append(Paragraph(linha_texto, body_style))

    if orcamento.observacoes:
        story.append(Paragraph("Observações", section_style))
        story.append(Paragraph(orcamento.observacoes, body_style))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


@router.get("/{orcamento_id}/pdf")
def gerar_pdf_orcamento(orcamento_id: int, db: Session = Depends(get_db)):
    orcamento = db.get(models.Orcamento, orcamento_id)
    if not orcamento:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado")

    pdf_bytes = _gerar_pdf_bytes(orcamento)
    numero = orcamento.numero or orcamento.id
    cliente_slug = _slugify(orcamento.cliente.nome)
    filename = f"orcamento_{numero}_{cliente_slug}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )