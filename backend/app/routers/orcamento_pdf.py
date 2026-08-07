import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
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


def _gerar_pdf_bytes(orcamento: models.Orcamento) -> bytes:
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
    header_data = [
        [Paragraph("ORÇAMENTO TÉCNICO COMERCIAL", ParagraphStyle(
            "title", parent=styles["Title"], fontSize=15, textColor=INK, alignment=0
        ))],
    ]
    story.append(Table(header_data, colWidths=[170 * mm]))
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

    # Equipamento
    if orcamento.equipamento or orcamento.local_equipamento:
        story.append(Paragraph("Dados do Equipamento", section_style))
        eq = orcamento.equipamento
        eq_rows = []
        if eq:
            eq_rows.append(linha("Marca / Modelo", f"{eq.marca} {eq.modelo}"))
            if eq.numero_serie:
                eq_rows.append(linha("Serial", eq.numero_serie))
        if orcamento.local_equipamento:
            eq_rows.append(linha("Local", orcamento.local_equipamento))
        t = Table(eq_rows, colWidths=[30 * mm, 140 * mm])
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        story.append(t)

    # Diagnóstico
    if orcamento.defeitos_constatados:
        story.append(Paragraph("Defeitos Constatados", section_style))
        story.append(Paragraph(orcamento.defeitos_constatados, body_style))

    if orcamento.solucao_adotada:
        story.append(Paragraph("Solução Adotada", section_style))
        story.append(Paragraph(orcamento.solucao_adotada, body_style))

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


@router.get("/{orcamento_id}/pdf")
def gerar_pdf_orcamento(orcamento_id: int, db: Session = Depends(get_db)):
    orcamento = db.get(models.Orcamento, orcamento_id)
    if not orcamento:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado")

    pdf_bytes = _gerar_pdf_bytes(orcamento)
    numero = orcamento.numero or orcamento.id
    filename = f"orcamento_{numero}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
