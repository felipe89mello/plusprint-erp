"""Leitor de XML de notas fiscais (NF-e modelo 55 e NFS-e Nacional).

Não usa nenhuma biblioteca nova: só o `xml.etree.ElementTree` que já vem no
Python. Como o XML vem de fora (upload), antes de ler fazemos algumas
proteções simples:
  - limite de tamanho (2 MB);
  - recusa de XML com <!DOCTYPE> ou <!ENTITY> (é por aí que entram os ataques
    de "expansão de entidades"; nota fiscal legítima nunca tem isso).

A função principal é `ler_xml(texto)`. Ela devolve:
    {"formato": "nfe" | "nfse", "campos": {...}, "avisos": [...]}
Os `campos` já têm os mesmos nomes das colunas da tabela `notas_fiscais`,
então o frontend só precisa jogar no formulário.

Qualquer problema que impeça a leitura levanta `XmlNotaError` (mensagem em
português, pronta para mostrar ao usuário).
"""
import os
import re
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation

TAMANHO_MAXIMO = 2 * 1024 * 1024  # 2 MB
STATUS_NFE_AUTORIZADA = {"100", "150"}


class XmlNotaError(ValueError):
    pass


def _so_digitos(valor: str | None) -> str:
    return re.sub(r"\D", "", valor or "")


def cnpj_da_empresa() -> str:
    """CNPJ da própria empresa (só dígitos), vindo da variável EMPRESA_CNPJ."""
    return _so_digitos(os.getenv("EMPRESA_CNPJ"))


# ---------------------------------------------------------------- utilidades

def _carregar(texto: str) -> ET.Element:
    if not texto or not texto.strip():
        raise XmlNotaError("O arquivo está vazio.")
    if len(texto.encode("utf-8", errors="ignore")) > TAMANHO_MAXIMO:
        raise XmlNotaError("O arquivo é grande demais para ser uma nota fiscal (máximo 2 MB).")

    texto = texto.lstrip("﻿").strip()
    if re.search(r"<!\s*(DOCTYPE|ENTITY)", texto, re.IGNORECASE):
        raise XmlNotaError("O XML contém declarações não permitidas e foi recusado por segurança.")

    try:
        raiz = ET.fromstring(texto)
    except ET.ParseError:
        raise XmlNotaError("O arquivo não é um XML válido.")

    # Tira o namespace de todas as tags: "{http://...}infNFe" vira "infNFe".
    for el in raiz.iter():
        if isinstance(el.tag, str) and "}" in el.tag:
            el.tag = el.tag.split("}", 1)[1]
    return raiz


def _txt(no: ET.Element | None, caminho: str) -> str | None:
    if no is None:
        return None
    achado = no.find(caminho)
    if achado is None or achado.text is None:
        return None
    valor = achado.text.strip()
    return valor or None


def _valor(texto: str | None, rotulo: str) -> Decimal:
    try:
        return Decimal(texto).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError):
        raise XmlNotaError(f"Não consegui ler o valor da nota ({rotulo}).")


def _documento(no: ET.Element | None) -> str | None:
    """CNPJ ou CPF de um bloco emit/dest/toma (só dígitos)."""
    d = _txt(no, "CNPJ") or _txt(no, "CPF")
    return _so_digitos(d) or None


def _tipo_automatico(emitente: str | None, destinatario: str | None,
                     tipo_se_emitente: str, avisos: list[str]) -> str | None:
    empresa = cnpj_da_empresa()
    if not empresa:
        avisos.append("O CNPJ da empresa não está configurado no servidor, "
                      "então escolha o tipo da nota manualmente.")
        return None
    if emitente == empresa:
        return tipo_se_emitente
    if destinatario == empresa:
        return "nfe_entrada"
    avisos.append("Nem o emitente nem o destinatário é o CNPJ da empresa; "
                  "confira e escolha o tipo da nota.")
    return None


def _resumo_itens(infnfe: ET.Element) -> str | None:
    itens = []
    for det in infnfe.findall("det"):
        nome = _txt(det.find("prod"), "xProd")
        if not nome:
            continue
        qtd = _txt(det.find("prod"), "qCom")
        try:
            qtd_txt = f"{Decimal(qtd).normalize():f}" if qtd else "1"
        except InvalidOperation:
            qtd_txt = qtd or "1"
        itens.append(f"{qtd_txt}× {nome}")
    if not itens:
        return None
    return "; ".join(itens)[:400]


# ---------------------------------------------------------------------- NF-e

def _ler_nfe(raiz: ET.Element) -> dict:
    avisos: list[str] = []
    infnfe = raiz.find("NFe/infNFe") if raiz.tag == "nfeProc" else raiz.find("infNFe")
    if infnfe is None:
        infnfe = raiz.find(".//infNFe")
    if infnfe is None:
        raise XmlNotaError("Não encontrei os dados da NF-e dentro do XML.")

    ide = infnfe.find("ide")
    modelo = _txt(ide, "mod")
    if modelo and modelo != "55":
        raise XmlNotaError(f"Só NF-e modelo 55 é suportada (este arquivo é modelo {modelo}).")
    if _txt(ide, "tpAmb") == "2":
        raise XmlNotaError("Esta NF-e é de HOMOLOGAÇÃO (teste) e não tem valor fiscal.")

    prot = raiz.find(".//protNFe/infProt")
    if prot is None:
        avisos.append("O XML não traz o protocolo de autorização da SEFAZ "
                      "(não é possível garantir que a nota foi autorizada).")
        chave = None
    else:
        status = _txt(prot, "cStat")
        if status not in STATUS_NFE_AUTORIZADA:
            motivo = _txt(prot, "xMotivo") or "sem motivo informado"
            raise XmlNotaError(f"Esta NF-e não está autorizada (status {status}: {motivo}).")
        chave = _txt(prot, "chNFe")

    if not chave:
        chave = (infnfe.get("Id") or "").removeprefix("NFe")
    chave = _so_digitos(chave)
    if len(chave) != 44:
        raise XmlNotaError("Não consegui identificar a chave de acesso (44 dígitos) da NF-e.")

    emit, dest = infnfe.find("emit"), infnfe.find("dest")
    emit_doc, dest_doc = _documento(emit), _documento(dest)
    data = (_txt(ide, "dhEmi") or _txt(ide, "dEmi") or "")[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", data):
        raise XmlNotaError("Não consegui ler a data de emissão da NF-e.")

    campos = {
        "tipo": _tipo_automatico(emit_doc, dest_doc, "nfe_saida", avisos),
        "chave_acesso": chave,
        "numero": _txt(ide, "nNF"),
        "serie": _txt(ide, "serie"),
        "data_emissao": data,
        "valor_total": str(_valor(_txt(infnfe, "total/ICMSTot/vNF"), "vNF")),
        "emitente_cnpj": emit_doc,
        "emitente_nome": _txt(emit, "xNome"),
        "destinatario_cnpj": dest_doc,
        "destinatario_nome": _txt(dest, "xNome"),
        "observacoes": _resumo_itens(infnfe),
    }
    return {"formato": "nfe", "campos": campos, "avisos": avisos}


# ------------------------------------------------------------- NFS-e Nacional

def _ler_nfse(raiz: ET.Element) -> dict:
    avisos: list[str] = []
    inf = raiz.find("infNFSe")
    if inf is None:
        raise XmlNotaError("Não encontrei os dados da NFS-e dentro do XML.")
    dps = inf.find("DPS/infDPS")
    if dps is None:
        raise XmlNotaError("A NFS-e não traz o bloco DPS com os dados do serviço.")

    if _txt(dps, "tpAmb") == "2":
        raise XmlNotaError("Esta NFS-e é de HOMOLOGAÇÃO (teste) e não tem valor fiscal.")

    chave = _so_digitos((inf.get("Id") or "").removeprefix("NFS"))
    if len(chave) != 50:
        raise XmlNotaError("Não consegui identificar a chave de acesso (50 dígitos) da NFS-e.")

    emit_doc = _documento(inf.find("emit"))
    toma = dps.find("toma")
    toma_doc = _documento(toma)

    data = (_txt(dps, "dhEmi") or _txt(inf, "dhProc") or "")[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", data):
        raise XmlNotaError("Não consegui ler a data de emissão da NFS-e.")

    valor = _txt(dps, "valores/vServPrest/vServ") or _txt(inf, "valores/vLiq")

    empresa = cnpj_da_empresa()
    if empresa and toma_doc == empresa and emit_doc != empresa:
        raise XmlNotaError("Esta NFS-e foi emitida por outra empresa para a sua "
                           "(serviço contratado). Esse tipo ainda não é suportado.")
    if not empresa:
        tipo = None
        avisos.append("O CNPJ da empresa não está configurado no servidor, "
                      "então escolha o tipo da nota manualmente.")
    elif emit_doc == empresa:
        tipo = "nfse_prestada"
    else:
        tipo = None
        avisos.append("O prestador da nota não é o CNPJ da empresa; "
                      "confira e escolha o tipo da nota.")

    descricao = _txt(dps, "serv/cServ/xDescServ")
    campos = {
        "tipo": tipo,
        "chave_acesso": chave,
        "numero": _txt(inf, "nNFSe"),
        "serie": None,
        "data_emissao": data,
        "valor_total": str(_valor(valor, "vServ")),
        "emitente_cnpj": emit_doc,
        "emitente_nome": _txt(inf, "emit/xNome"),
        "destinatario_cnpj": toma_doc,
        "destinatario_nome": _txt(toma, "xNome"),
        "observacoes": descricao[:400] if descricao else None,
    }
    return {"formato": "nfse", "campos": campos, "avisos": avisos}


# ------------------------------------------------------------------ principal

def ler_xml(texto: str) -> dict:
    raiz = _carregar(texto)
    if raiz.tag in ("nfeProc", "NFe"):
        return _ler_nfe(raiz)
    if raiz.tag == "NFSe":
        return _ler_nfse(raiz)
    raise XmlNotaError("Formato não reconhecido. Por enquanto são suportados "
                       "XML de NF-e (modelo 55) e de NFS-e Nacional.")
