"""Consulta à Distribuição DF-e da SEFAZ (Ambiente Nacional).

O que isto faz: pergunta à SEFAZ "tem nota nova emitida para o meu CNPJ?".
A SEFAZ responde com um lote de documentos numerados por NSU (um contador).
Guardamos o último NSU lido, assim a próxima consulta só traz o que é novo.

Como a SEFAZ sabe que somos nós: pelo certificado digital A1 (.pfx), usado
como "crachá" na conexão HTTPS (mTLS). Nada é assinado aqui.

Regras da SEFAZ que o código respeita:
  - sem nota nova (cStat 137), só consultar de novo depois de 1 hora;
  - consultar demais gera "consumo indevido" (cStat 656) e bloqueio de 1 hora.

Os documentos chegam de 2 formas:
  - resumo (resNFe): chave, emitente, valor, data. É o que vem enquanto o
    destinatário não manifestou ciência da operação;
  - XML completo (procNFe): quando já liberado. Aí reaproveitamos o leitor
    de XML (nota_xml.py) e guardamos o XML.

Este módulo NÃO acessa o banco: só conversa com a SEFAZ e interpreta a
resposta. Quem grava é o router (assim dá para testar sem rede).
"""
import base64
import gzip
import os
import ssl
import tempfile
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

URL_PRODUCAO = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx"
URL_HOMOLOGACAO = "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx"
NSU_ZERO = "000000000000000"
ESPERA_APOS_VAZIO = timedelta(hours=1)


class DfeError(Exception):
    """Erro com mensagem pronta para o usuário."""


# ------------------------------------------------------------- configuração

def caminho_certificado() -> str:
    return os.getenv("CERT_A1_PATH", "/app/certs/certificado.pfx")


def ambiente() -> str:
    return "2" if os.getenv("DFE_AMBIENTE") == "2" else "1"


def uf_autor() -> str:
    return os.getenv("DFE_UF", "35")  # 35 = São Paulo


# ------------------------------------------------------- conexão (mTLS)

def _contexto_ssl() -> ssl.SSLContext:
    # Importado aqui (e não no topo) de propósito: se o servidor ainda não foi
    # reconstruído com a biblioteca nova, o ERP inteiro continua funcionando e
    # só esta consulta avisa o que falta.
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.serialization import pkcs12
    except ImportError:
        raise DfeError("O servidor precisa ser reconstruído (docker compose up -d --build api) "
                       "para habilitar a consulta à SEFAZ.")
    caminho = caminho_certificado()
    senha = os.getenv("CERT_A1_SENHA", "")
    if not os.path.isfile(caminho):
        raise DfeError("Certificado digital não encontrado no servidor. "
                       "Veja a configuração do certificado A1.")
    try:
        with open(caminho, "rb") as f:
            chave, cert, extras = pkcs12.load_key_and_certificates(f.read(), senha.encode() or None)
    except Exception:
        raise DfeError("Não consegui abrir o certificado: senha incorreta ou arquivo inválido.")
    if chave is None or cert is None:
        raise DfeError("O arquivo do certificado não contém chave e certificado.")

    pem = cert.public_bytes(serialization.Encoding.PEM)
    for extra in extras or []:
        pem += extra.public_bytes(serialization.Encoding.PEM)
    pem += chave.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )

    ctx = ssl.create_default_context(cafile=os.getenv("DFE_CA_BUNDLE") or None)
    # O Python só carrega certificado de arquivo; gravamos num temporário
    # (permissão 0600 por padrão), carregamos e apagamos na hora.
    with tempfile.NamedTemporaryFile("wb", suffix=".pem", delete=False) as tmp:
        tmp.write(pem)
        nome = tmp.name
    try:
        ctx.load_cert_chain(nome)
    finally:
        os.unlink(nome)
    return ctx


def enviar_para_sefaz(envelope: bytes) -> bytes:
    url = URL_HOMOLOGACAO if ambiente() == "2" else URL_PRODUCAO
    req = urllib.request.Request(
        url, data=envelope, method="POST",
        headers={"Content-Type": "application/soap+xml; charset=utf-8"},
    )
    handler = urllib.request.HTTPSHandler(context=_contexto_ssl())
    try:
        with urllib.request.build_opener(handler).open(req, timeout=40) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        raise DfeError(f"A SEFAZ recusou a consulta (HTTP {e.code}).")
    except (urllib.error.URLError, ssl.SSLError, TimeoutError, OSError) as e:
        causa = getattr(e, "reason", e)
        if isinstance(causa, ssl.SSLError):
            raise DfeError("Falha na conexão segura com a SEFAZ (certificado do servidor da SEFAZ "
                           f"não reconhecido ou certificado do cliente recusado): {causa.reason or causa}")
        raise DfeError(f"Não consegui falar com a SEFAZ agora ({getattr(e, 'reason', e)}). Tente mais tarde.")


# ------------------------------------------------------ mensagem e resposta

def montar_envelope(cnpj: str, ult_nsu: str) -> bytes:
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>'
        '<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">'
        '<nfeDadosMsg>'
        '<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">'
        f"<tpAmb>{ambiente()}</tpAmb><cUFAutor>{uf_autor()}</cUFAutor><CNPJ>{cnpj}</CNPJ>"
        f"<distNSU><ultNSU>{ult_nsu}</ultNSU></distNSU>"
        "</distDFeInt></nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>"
    )
    return xml.encode("utf-8")


def _sem_namespace(raiz: ET.Element) -> ET.Element:
    for el in raiz.iter():
        if isinstance(el.tag, str) and "}" in el.tag:
            el.tag = el.tag.split("}", 1)[1]
    return raiz


def _txt(no, caminho):
    if no is None:
        return None
    achado = no.find(caminho)
    return achado.text.strip() if achado is not None and achado.text and achado.text.strip() else None


def interpretar_resposta(corpo: bytes) -> dict:
    """Devolve {cstat, motivo, ult_nsu, max_nsu, docs:[{nsu, schema, xml}]}."""
    try:
        raiz = _sem_namespace(ET.fromstring(corpo))
    except ET.ParseError:
        raise DfeError("A resposta da SEFAZ veio ilegível.")
    ret = raiz.find(".//retDistDFeInt")
    if ret is None:
        raise DfeError("A resposta da SEFAZ não tem o formato esperado.")

    docs = []
    for dz in ret.findall("loteDistDFeInt/docZip"):
        try:
            xml = gzip.decompress(base64.b64decode(dz.text or "")).decode("utf-8")
        except Exception:
            continue  # documento corrompido: ignora e segue
        docs.append({"nsu": dz.get("NSU"), "schema": dz.get("schema") or "", "xml": xml})

    return {
        "cstat": _txt(ret, "cStat"),
        "motivo": _txt(ret, "xMotivo"),
        "ult_nsu": _txt(ret, "ultNSU"),
        "max_nsu": _txt(ret, "maxNSU"),
        "docs": docs,
    }


def consultar(cnpj: str, ult_nsu: str, enviar=enviar_para_sefaz) -> dict:
    """Faz UMA consulta. `enviar` pode ser trocado nos testes."""
    return interpretar_resposta(enviar(montar_envelope(cnpj, ult_nsu)))


# ------------------------------------------------------ documentos recebidos

def ler_resumo_nfe(xml: str) -> dict | None:
    """Lê um resNFe. Devolve None se a nota não deve virar entrada (cancelada/denegada)."""
    raiz = _sem_namespace(ET.fromstring(xml))
    chave = _txt(raiz, "chNFe")
    if not chave or len(chave) != 44:
        return None
    if _txt(raiz, "cSitNFe") not in (None, "1"):
        return None  # 2 = denegada, 3 = cancelada
    doc = _txt(raiz, "CNPJ") or _txt(raiz, "CPF")
    return {
        "chave_acesso": chave,
        "numero": str(int(chave[25:34])),
        "serie": str(int(chave[22:25])),
        "data_emissao": (_txt(raiz, "dhEmi") or "")[:10],
        "valor_total": _txt(raiz, "vNF") or "0",
        "emitente_cnpj": doc,
        "emitente_nome": _txt(raiz, "xNome"),
    }


def chave_de_evento_cancelamento(xml: str) -> str | None:
    """Se o documento é um evento de cancelamento (110111), devolve a chave."""
    raiz = _sem_namespace(ET.fromstring(xml))
    if _txt(raiz, "tpEvento") == "110111" or _txt(raiz, ".//tpEvento") == "110111":
        return _txt(raiz, "chNFe") or _txt(raiz, ".//chNFe")
    return None


def agora_utc() -> datetime:
    return datetime.utcnow()
