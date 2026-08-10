import io
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.routers.orcamento_pdf import _slugify

router = APIRouter(prefix="/ordens-servico", tags=["Ordens de Serviço"])

AMBER = colors.HexColor("#B97A1E")
INK = colors.HexColor("#1C1E22")
LINE = colors.HexColor("#CFCFC8")

LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "logo.png")

STATUS_LABEL = {"aberto": "Aberto", "em_andamento": "Em andamento", "concluido": "Concluído"}


def _gerar_pdf_os_bytes(os_: models.OrdemServico) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm, leftMargin=18 * mm, rightMargin=18 * mm
    )
    styles = getSampleStyleSheet()
    label_style = ParagraphStyle("label", parent=styles["Normal"], fontSize=8.5, textColor=colors.grey)
    value_style = ParagraphStyle("value", parent=styles["Normal"], fontSize=10, textColor=INK)
    section_style = ParagraphStyle(
        "section", parent=styles["Heading3"], fontSize=11, textColor=AMBER, spaceBefore=14, spaceAfter=6
    )
    body_style = ParagraphStyle("body", parent=styles["Normal"], fontSize=9.5, leading=13)

    story = []
    titulo_style = ParagraphStyle("title", parent=styles["Title"], fontSize=15, textColor=INK, alignment=0)

    if os.path.exists(LOGO_PATH):
        logo = Image(LOGO_PATH, width=20 * mm, height=20 * mm)
        header_table = Table(
            [[logo, Paragraph("ORDEM DE SERVIÇO", titulo_style)]], colWidths=[24 * mm, 146 * mm]
        )
        header_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (0, 0), 0)]))
        story.append(header_table)
    else:
        story.append(Table([[Paragraph("ORDEM DE SERVIÇO", titulo_style)]], colWidths=[170 * mm]))
    story.append(Spacer(1, 2))

    abertura_txt = os_.data_abertura.strftime("%d/%m/%Y")
    conclusao_txt = os_.data_conclusao.strftime("%d/%m/%Y") if os_.data_conclusao else "—"
    status_txt = STATUS_LABEL.get(os_.status, os_.status)
    numero_os = os_.numero or os_.id
    story.append(Paragraph(f"OS nº {numero_os}  ·  Abertura: {abertura_txt}  ·  Conclusão: {conclusao_txt}  ·  Status: {status_txt}", label_style))
    story.append(Spacer(1, 10))

    def linha(label, valor):
        return [Paragraph(label, label_style), Paragraph(valor or "—", value_style)]

    cliente = os_.cliente
    cliente_rows = [
        linha("Cliente", cliente.nome),
        linha("Endereço", cliente.endereco),
        linha("Contato", cliente.contato_nome),
        linha("Telefone", cliente.telefone),
    ]
    t = Table(cliente_rows, colWidths=[30 * mm, 140 * mm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    story.append(t)

    if os_.equipamentos:
        titulo_eq = "Equipamento" if len(os_.equipamentos) <= 1 else "Equipamentos"
        story.append(Paragraph(titulo_eq, section_style))
        eq_rows = []
        for eq in os_.equipamentos:
            descricao_eq = f"{eq.marca} {eq.modelo}"
            if eq.numero_serie:
                descricao_eq += f" — SN {eq.numero_serie}"
            eq_rows.append(linha("Equipamento", descricao_eq))
        t = Table(eq_rows, colWidths=[30 * mm, 140 * mm])
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        story.append(t)

    if os_.orcamento:
        story.append(Paragraph(
            f"Originada do Orçamento nº {os_.orcamento.numero or os_.orcamento.id}", label_style
        ))

    story.append(Paragraph("Descrição do Atendimento", section_style))
    story.append(Paragraph((os_.descricao or "—").replace("\n", "<br/>"), body_style))

    subtotal_pecas = 0
    subtotal_servicos = 0

    if os_.itens_peca:
        story.append(Paragraph("Peças Utilizadas", section_style))
        tabela_dados = [["Qtde.", "Peça", "Unitário", "Total"]]
        for item in os_.itens_peca:
            total_item = item.quantidade_usada * item.valor_unitario_na_epoca
            subtotal_pecas += total_item
            tabela_dados.append([
                str(item.quantidade_usada),
                item.peca.nome if item.peca else "—",
                f"R$ {item.valor_unitario_na_epoca:.2f}",
                f"R$ {total_item:.2f}",
            ])
        tabela_dados.append(["", "", "Subtotal", f"R$ {subtotal_pecas:.2f}"])
        pecas_table = Table(tabela_dados, colWidths=[20 * mm, 90 * mm, 28 * mm, 32 * mm])
        pecas_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -2), 0.5, LINE),
            ("LINEABOVE", (0, -1), (-1, -1), 1, INK),
            ("FONTNAME", (2, -1), (-1, -1), "Helvetica-Bold"),
            ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(pecas_table)

    if os_.itens_servico:
        story.append(Paragraph("Serviços / Mão de Obra", section_style))
        tabela_serv = [["Qtde./Hrs", "Descrição", "Unitário", "Total"]]
        for item in os_.itens_servico:
            total_item = item.quantidade * item.valor_unitario
            subtotal_servicos += total_item
            tabela_serv.append([
                f"{item.quantidade:g}",
                item.descricao,
                f"R$ {item.valor_unitario:.2f}",
                f"R$ {total_item:.2f}",
            ])
        tabela_serv.append(["", "", "Subtotal", f"R$ {subtotal_servicos:.2f}"])
        serv_table = Table(tabela_serv, colWidths=[22 * mm, 88 * mm, 28 * mm, 32 * mm])
        serv_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -2), 0.5, LINE),
            ("LINEABOVE", (0, -1), (-1, -1), 1, INK),
            ("FONTNAME", (2, -1), (-1, -1), "Helvetica-Bold"),
            ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(serv_table)

    if os_.itens_peca or os_.itens_servico:
        total_geral = subtotal_pecas + subtotal_servicos
        story.append(Spacer(1, 8))
        total_geral_style = ParagraphStyle(
            "total_geral", parent=styles["Normal"], fontSize=12, fontName="Helvetica-Bold",
            textColor=INK, alignment=2,  # 2 = alinhado à direita
        )
        story.append(Paragraph(f"Total Geral: R$ {total_geral:.2f}", total_geral_style))

    tecnico = os_.orcamento.tecnico_responsavel if os_.orcamento else None
    story.append(Spacer(1, 18))
    story.append(Paragraph(f"Técnico Responsável: {tecnico or '—'}", body_style))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


@router.get("/{os_id}/pdf")
def gerar_pdf_os(os_id: int, db: Session = Depends(get_db)):
    os_ = db.get(models.OrdemServico, os_id)
    if not os_:
        raise HTTPException(status_code=404, detail="Ordem de serviço não encontrada")

    pdf_bytes = _gerar_pdf_os_bytes(os_)
    cliente_slug = _slugify(os_.cliente.nome)
    numero_os = os_.numero or os_.id
    filename = f"os_{numero_os}_{cliente_slug}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
