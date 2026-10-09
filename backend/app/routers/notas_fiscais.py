import os

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import dfe, models, nota_xml, schemas
from app.database import get_db

router = APIRouter(prefix="/notas-fiscais", tags=["Notas Fiscais"])

TIPOS_VALIDOS = ("nfe_entrada", "nfe_saida", "nfse_prestada")


def _validar_tipo(tipo: str):
    if tipo not in TIPOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Tipo inválido. Use um destes: {', '.join(TIPOS_VALIDOS)}")


def _normalizar_chave(chave: str | None) -> str | None:
    # string vazia vira None — assim várias notas sem chave não colidem na
    # restrição de unicidade (o Postgres aceita vários NULL numa coluna unique).
    chave = (chave or "").strip()
    return chave or None


def _checar_chave_duplicada(db: Session, chave: str | None, ignorar_id: int | None = None):
    if not chave:
        return
    query = db.query(models.NotaFiscal).filter(models.NotaFiscal.chave_acesso == chave)
    if ignorar_id is not None:
        query = query.filter(models.NotaFiscal.id != ignorar_id)
    existente = query.first()
    if existente:
        raise HTTPException(
            status_code=409,
            detail=f"Já existe uma nota com esta chave de acesso (nº {existente.numero or existente.id})",
        )


@router.post("/xml/preview")
def pre_visualizar_xml(corpo: schemas.NotaFiscalXmlIn, db: Session = Depends(get_db)):
    """Lê o XML e devolve os campos para preencher o formulário. NÃO salva nada.

    Se a chave já existir no banco, avisa em `duplicada` para o frontend
    bloquear a importação antes mesmo de abrir o formulário."""
    try:
        resultado = nota_xml.ler_xml(corpo.xml)
    except nota_xml.XmlNotaError as erro:
        raise HTTPException(status_code=422, detail=str(erro))

    chave = resultado["campos"].get("chave_acesso")
    existente = (
        db.query(models.NotaFiscal).filter(models.NotaFiscal.chave_acesso == chave).first()
        if chave else None
    )
    resultado["duplicada"] = (
        {"id": existente.id, "numero": existente.numero, "tem_xml": bool(existente.xml)}
        if existente else None
    )
    return resultado


# ---------------------------------------------------------------------------
# Consulta automática de compras (Distribuição DF-e da SEFAZ)
# ---------------------------------------------------------------------------

MAX_PAGINAS_POR_CONSULTA = 5  # cada página traz até 50 documentos


def _controle_dfe(db: Session) -> models.DfeControle:
    ctrl = db.get(models.DfeControle, 1)
    if not ctrl:
        ctrl = models.DfeControle(id=1, ultimo_nsu=dfe.NSU_ZERO)
        db.add(ctrl)
        db.commit()
        db.refresh(ctrl)
    return ctrl


@router.get("/dfe/status")
def status_dfe(db: Session = Depends(get_db)):
    ctrl = _controle_dfe(db)
    agora = dfe.agora_utc()
    espera = ctrl.bloqueado_ate and ctrl.bloqueado_ate > agora
    return {
        "configurado": bool(nota_xml.cnpj_da_empresa()) and os.path.isfile(dfe.caminho_certificado()),
        "ultima_consulta": ctrl.ultima_consulta,
        "pode_consultar_em": ctrl.bloqueado_ate if espera else None,
    }


def _gravar_documento(db: Session, doc: dict, empresa: str, resultado: dict):
    schema = doc["schema"]
    xml = doc["xml"]

    if schema.startswith("resNFe"):
        r = dfe.ler_resumo_nfe(xml)
        if r is None:
            resultado["ignoradas"] += 1
            return
        if r["emitente_cnpj"] == empresa:
            resultado["ignoradas"] += 1  # nota emitida por nós: não é compra
            return
        if db.query(models.NotaFiscal).filter(models.NotaFiscal.chave_acesso == r["chave_acesso"]).first():
            return
        db.add(models.NotaFiscal(
            tipo="nfe_entrada", origem="dfe", destinatario_cnpj=empresa,
            observacoes="Resumo recebido da SEFAZ. O XML completo ainda não está disponível; "
                        "quando tiver, use Importar XML para completar.",
            **r,
        ))
        resultado["novas"] += 1

    elif schema.startswith("procNFe"):
        try:
            lida = nota_xml.ler_xml(xml)["campos"]
        except nota_xml.XmlNotaError:
            resultado["ignoradas"] += 1
            return
        if lida["emitente_cnpj"] == empresa:
            resultado["ignoradas"] += 1
            return
        lida["tipo"] = "nfe_entrada"
        existente = db.query(models.NotaFiscal).filter(
            models.NotaFiscal.chave_acesso == lida["chave_acesso"]).first()
        if existente:
            if not existente.xml:  # promove o resumo a nota completa
                for campo, valor in lida.items():
                    if valor is not None:
                        setattr(existente, campo, valor)
                existente.xml = xml
                existente.observacoes = lida.get("observacoes")
                resultado["completadas"] += 1
            return
        db.add(models.NotaFiscal(origem="dfe", xml=xml, **lida))
        resultado["novas"] += 1

    elif schema.startswith(("resEvento", "procEventoNFe")):
        chave = dfe.chave_de_evento_cancelamento(xml)
        if chave:
            nota = db.query(models.NotaFiscal).filter(models.NotaFiscal.chave_acesso == chave).first()
            if nota and "CANCELADA" not in (nota.observacoes or ""):
                nota.observacoes = "[CANCELADA] " + (nota.observacoes or "")
                resultado["canceladas"] += 1


@router.post("/dfe/sincronizar")
def sincronizar_dfe(db: Session = Depends(get_db)):
    """Busca na SEFAZ as notas emitidas para a empresa e cadastra as novas."""
    empresa = nota_xml.cnpj_da_empresa()
    if not empresa:
        raise HTTPException(status_code=400, detail="O CNPJ da empresa (EMPRESA_CNPJ) não está configurado no servidor.")

    ctrl = _controle_dfe(db)
    agora = dfe.agora_utc()
    if ctrl.bloqueado_ate and ctrl.bloqueado_ate > agora:
        minutos = int((ctrl.bloqueado_ate - agora).total_seconds() // 60) + 1
        raise HTTPException(status_code=429, detail=f"A SEFAZ pede para esperar. Tente de novo em cerca de {minutos} min.")

    resultado = {"novas": 0, "completadas": 0, "canceladas": 0, "ignoradas": 0, "mensagem": ""}
    try:
        for _ in range(MAX_PAGINAS_POR_CONSULTA):
            r = dfe.consultar(empresa, ctrl.ultimo_nsu)
            ctrl.ultima_consulta = dfe.agora_utc()

            if r["cstat"] == "656":  # consumo indevido
                ctrl.bloqueado_ate = dfe.agora_utc() + dfe.ESPERA_APOS_VAZIO
                db.commit()
                raise HTTPException(status_code=429, detail="A SEFAZ bloqueou novas consultas por 1 hora (consumo indevido).")
            if r["cstat"] == "137":  # nada novo
                ctrl.bloqueado_ate = dfe.agora_utc() + dfe.ESPERA_APOS_VAZIO
                db.commit()
                break
            if r["cstat"] != "138":
                db.commit()
                raise HTTPException(status_code=502, detail=f"Resposta da SEFAZ: {r['cstat']} - {r['motivo']}")

            for doc in r["docs"]:
                _gravar_documento(db, doc, empresa, resultado)
            ctrl.ultimo_nsu = r["ult_nsu"] or ctrl.ultimo_nsu
            db.commit()  # guarda o progresso a cada página
            if not r["max_nsu"] or r["ult_nsu"] == r["max_nsu"]:
                ctrl.bloqueado_ate = dfe.agora_utc() + dfe.ESPERA_APOS_VAZIO
                db.commit()
                break
    except dfe.DfeError as erro:
        db.rollback()
        raise HTTPException(status_code=502, detail=str(erro))

    partes = []
    if resultado["novas"]: partes.append(f"{resultado['novas']} nova(s)")
    if resultado["completadas"]: partes.append(f"{resultado['completadas']} completada(s) com XML")
    if resultado["canceladas"]: partes.append(f"{resultado['canceladas']} cancelada(s)")
    resultado["mensagem"] = ("Consulta concluída: " + ", ".join(partes) + ".") if partes else "Consulta concluída: nenhuma nota nova."
    return resultado


@router.post("/", response_model=schemas.NotaFiscalOut, status_code=201)
def criar_nota_fiscal(nota: schemas.NotaFiscalCreate, db: Session = Depends(get_db)):
    _validar_tipo(nota.tipo)
    dados = nota.model_dump()
    dados["chave_acesso"] = _normalizar_chave(dados.get("chave_acesso"))
    _checar_chave_duplicada(db, dados["chave_acesso"])

    nova = models.NotaFiscal(**dados)
    db.add(nova)
    db.commit()
    db.refresh(nova)
    return schemas.NotaFiscalOut.from_model(nova)


@router.get("/", response_model=list[schemas.NotaFiscalOut])
def listar_notas_fiscais(
    tipo: str | None = None,
    busca: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.NotaFiscal)
    if tipo:
        query = query.filter(models.NotaFiscal.tipo == tipo)
    if busca:
        termo = f"%{busca.strip()}%"
        query = query.filter(
            or_(
                models.NotaFiscal.numero.ilike(termo),
                models.NotaFiscal.emitente_nome.ilike(termo),
                models.NotaFiscal.destinatario_nome.ilike(termo),
                models.NotaFiscal.chave_acesso.ilike(termo),
            )
        )
    query = query.order_by(models.NotaFiscal.data_emissao.desc(), models.NotaFiscal.id.desc())
    return [schemas.NotaFiscalOut.from_model(n) for n in query.all()]


@router.get("/{nota_id}", response_model=schemas.NotaFiscalOut)
def obter_nota_fiscal(nota_id: int, db: Session = Depends(get_db)):
    nota = db.get(models.NotaFiscal, nota_id)
    if not nota:
        raise HTTPException(status_code=404, detail="Nota fiscal não encontrada")
    return schemas.NotaFiscalOut.from_model(nota)


@router.get("/{nota_id}/xml")
def obter_xml_nota_fiscal(nota_id: int, db: Session = Depends(get_db)):
    nota = db.get(models.NotaFiscal, nota_id)
    if not nota:
        raise HTTPException(status_code=404, detail="Nota fiscal não encontrada")
    if not nota.xml:
        raise HTTPException(status_code=404, detail="Esta nota não tem XML guardado")
    return Response(content=nota.xml, media_type="application/xml")


@router.put("/{nota_id}", response_model=schemas.NotaFiscalOut)
def atualizar_nota_fiscal(nota_id: int, dados: schemas.NotaFiscalUpdate, db: Session = Depends(get_db)):
    nota = db.get(models.NotaFiscal, nota_id)
    if not nota:
        raise HTTPException(status_code=404, detail="Nota fiscal não encontrada")

    campos = dados.model_dump(exclude_unset=True)
    if "tipo" in campos:
        _validar_tipo(campos["tipo"])
    if "chave_acesso" in campos:
        campos["chave_acesso"] = _normalizar_chave(campos["chave_acesso"])
        _checar_chave_duplicada(db, campos["chave_acesso"], ignorar_id=nota_id)

    for campo, valor in campos.items():
        setattr(nota, campo, valor)

    db.commit()
    db.refresh(nota)
    return schemas.NotaFiscalOut.from_model(nota)


@router.delete("/{nota_id}", status_code=204)
def excluir_nota_fiscal(nota_id: int, db: Session = Depends(get_db)):
    nota = db.get(models.NotaFiscal, nota_id)
    if not nota:
        raise HTTPException(status_code=404, detail="Nota fiscal não encontrada")

    # Orçamentos e OS que apontavam para esta nota continuam existindo e só
    # perdem o vínculo (nota_fiscal_id vira NULL — o ORM faz isso ao excluir,
    # e o banco também garante via ON DELETE SET NULL).
    db.delete(nota)
    db.commit()
