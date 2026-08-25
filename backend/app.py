from flask import Flask, request
from flask_cors import CORS
from dotenv import load_dotenv

import csv
import json
import os
import urllib.error
import urllib.parse
import urllib.request

from datetime import date


# Carrega as variáveis do arquivo .env
load_dotenv(
    os.path.join(os.path.dirname(__file__), ".env"),
    override=True
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
NEWS_API_KEY = os.getenv("NEWS_API_KEY")


# Criação da aplicação Flask
app = Flask(
    __name__,
    static_folder="Frontend",
    static_url_path=""
)

# Permite comunicação entre o frontend e o backend
CORS(app)


@app.route("/")
def home():
    return app.send_static_file("index.html")


@app.route("/api/health")
def health():
    return {
        "status": "ok"
    }


@app.route("/api/ai/chat", methods=["POST"])
def chat_ai():
    if not GEMINI_API_KEY:
        return {
            "error": (
                "GEMINI_API_KEY não foi configurada nas variáveis "
                "de ambiente do servidor."
            )
        }, 500

    dados = request.get_json(silent=True) or {}

    code3 = dados.get("code3")
    historico = dados.get("history", [])
    mensagem = dados.get("message")

    if not code3 or not mensagem:
        return {
            "error": "Faltam dados obrigatórios: code3 ou message."
        }, 400

    caminho_countries = os.path.join(
        os.path.dirname(__file__),
        "data",
        "countries.json"
    )

    try:
        with open(caminho_countries, "r", encoding="utf-8") as arquivo:
            countries_data = json.load(arquivo)
    except FileNotFoundError:
        return {
            "error": "O arquivo data/countries.json não foi encontrado."
        }, 500
    except json.JSONDecodeError:
        return {
            "error": "O arquivo countries.json possui formato inválido."
        }, 500

    pais = next(
        (
            country
            for country in countries_data
            if country.get("iso3") == code3
        ),
        None
    )

    nome = (
        pais.get("name")
        if pais
        else code3
    )

    capital = (
        pais.get("capital")
        if pais and pais.get("capital")
        else "desconhecida"
    )
    regiao = (
        pais.get("region")
        if pais
        else "desconhecida"
    )

    from datetime import date

    data_hoje = date.today().strftime("%d/%m/%Y")

    instrucao_sistema = f"""
Você é um analista de geopolítica conversando com um estudante sobre o país {nome}.
A data de hoje é {data_hoje}. Use a busca do Google para trazer informações atualizadas
sempre que a pergunta envolver eventos recentes ou situação atual.

Dados do país:
- Capital: {capital}
- Região: {regiao}

Sua função é explicar acontecimentos geopolíticos de forma didática.
Considere informações recentes quando disponíveis.
Quando não tiver certeza sobre um acontecimento atual, informe essa limitação e não invente dados.

Responda sempre em português, de forma simples e objetiva, sem usar markdown.
""".strip()

    historico_formatado = []

    for item in historico:
        role = item.get("role")
        text = item.get("text")

        if not text:
            continue

        historico_formatado.append({
            "role": (
                "model"
                if role in ("model", "assistant")
                else "user"
            ),
            "parts": [
                {
                    "text": text
                }
            ]
        })

    conteudo = historico_formatado + [
        {
            "role": "user",
            "parts": [
                {
                    "text": mensagem
                }
            ]
        }
    ]

    payload = json.dumps({
        "systemInstruction": {
            "parts": [
                {
                    "text": instrucao_sistema
                }
            ]
        },
        "contents": conteudo,
        "tools": [
            {
                "google_search": {}
            }
        ]
    }).encode("utf-8")

    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        "models/gemini-2.5-flash-lite:generateContent"
        f"?key={GEMINI_API_KEY}"
    )

    requisicao = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(
            requisicao,
            timeout=30
        ) as resposta:
            data = json.loads(
                resposta.read().decode("utf-8")
            )

        candidatos = data.get("candidates", [])

        if not candidatos:
            return {
                "error": "A IA não retornou nenhuma resposta."
            }, 502

        partes = (
            candidatos[0]
            .get("content", {})
            .get("parts", [])
        )

        if not partes:
            return {
                "error": "A IA respondeu sem conteúdo."
            }, 502

        reply = partes[0].get("text")

        if not reply:
            return {
                "error": "A IA respondeu sem texto."
            }, 502

        return {
            "reply": reply
        }

    except urllib.error.HTTPError as erro:
        detalhe = erro.read().decode(
            "utf-8",
            errors="replace"
        )

        return {
            "error": (
                f"Erro ao conectar com a IA: "
                f"HTTP {erro.code}: {detalhe}"
            )
        }, 502

    except urllib.error.URLError as erro:
        return {
            "error": (
                "Não foi possível conectar ao serviço da IA: "
                f"{erro.reason}"
            )
        }, 502

    except Exception as erro:
        return {
            "error": (
                "Erro inesperado ao conectar com a IA: "
                f"{type(erro).__name__}: {erro}"
            )
        }, 502


CACHE_COMPARACOES = {}


@app.route("/api/ai/compare", methods=["POST"])
def compare_ai():
    if not GEMINI_API_KEY:
        return {
            "error": (
                "GEMINI_API_KEY não foi configurada nas variáveis "
                "de ambiente do servidor."
            )
        }, 500

    dados = request.get_json(silent=True) or {}

    code3_a = dados.get("code3_a")
    code3_b = dados.get("code3_b")

    if not code3_a or not code3_b:
        return {
            "error": "Faltam dados obrigatórios: code3_a ou code3_b."
        }, 400

    chave_cache = "_".join(sorted([code3_a, code3_b]))

    if chave_cache in CACHE_COMPARACOES:
        return {
            "reply": CACHE_COMPARACOES[chave_cache]
        }

    caminho_countries = os.path.join(
        os.path.dirname(__file__),
        "data",
        "countries.json"
    )

    try:
        with open(caminho_countries, "r", encoding="utf-8") as arquivo:
            countries_data = json.load(arquivo)
    except FileNotFoundError:
        return {
            "error": "O arquivo data/countries.json não foi encontrado."
        }, 500
    except json.JSONDecodeError:
        return {
            "error": "O arquivo countries.json possui formato inválido."
        }, 500

    def buscar_pais(code3):
        return next(
            (c for c in countries_data if c.get("iso3") == code3),
            None
        )

    pais_a = buscar_pais(code3_a)
    pais_b = buscar_pais(code3_b)

    nome_a = pais_a.get("name") if pais_a else code3_a
    nome_b = pais_b.get("name") if pais_b else code3_b

    data_hoje = date.today().strftime("%d/%m/%Y")

    instrucao_sistema = f"""
Você é um analista de geopolítica. A data de hoje é {data_hoje}.
Compare {nome_a} e {nome_b} em termos de contexto geopolítico atual,
estabilidade e principais riscos de segurança. Use a busca do Google
para trazer informações atualizadas quando necessário.
Responda em português, de forma objetiva, sem markdown, em no máximo
6 parágrafos curtos.
""".strip()

    payload = json.dumps({
        "systemInstruction": {
            "parts": [
                {
                    "text": instrucao_sistema
                }
            ]
        },
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": f"Compare {nome_a} e {nome_b}."
                    }
                ]
            }
        ],
        "tools": [
            {
                "google_search": {}
            }
        ]
    }).encode("utf-8")

    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        "models/gemini-2.5-flash-lite:generateContent"
        f"?key={GEMINI_API_KEY}"
    )

    requisicao = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(requisicao, timeout=30) as resposta:
            data = json.loads(resposta.read().decode("utf-8"))

        candidatos = data.get("candidates", [])

        if not candidatos:
            return {"error": "A IA não retornou nenhuma resposta."}, 502

        partes = candidatos[0].get("content", {}).get("parts", [])

        if not partes:
            return {"error": "A IA respondeu sem conteúdo."}, 502

        reply = partes[0].get("text")

        if not reply:
            return {"error": "A IA respondeu sem texto."}, 502

        CACHE_COMPARACOES[chave_cache] = reply

        return {"reply": reply}

    except urllib.error.HTTPError as erro:
        detalhe = erro.read().decode("utf-8", errors="replace")
        return {
            "error": f"Erro ao conectar com a IA: HTTP {erro.code}: {detalhe}"
        }, 502

    except urllib.error.URLError as erro:
        return {
            "error": f"Não foi possível conectar ao serviço da IA: {erro.reason}"
        }, 502

    except Exception as erro:
        return {
            "error": f"Erro inesperado ao conectar com a IA: {type(erro).__name__}: {erro}"
        }, 502


TIPO_CONFLITO = {
    "AFG": "guerra", "AGO": "guerra", "BEN": "guerra", "BFA": "guerra",
    "KHM": "guerra", "CMR": "guerra", "CAF": "guerra", "COL": "guerra",
    "COD": "guerra", "ETH": "guerra", "HTI": "guerra", "IND": "guerra",
    "IDN": "guerra", "IRN": "guerra", "IRQ": "guerra", "ISR": "guerra",
    "KEN": "guerra", "MLI": "guerra", "MOZ": "guerra", "MMR": "guerra",
    "NER": "guerra", "NGA": "guerra", "PAK": "guerra", "PSE": "guerra",
    "LBN": "guerra", "RUS": "guerra", "RWA": "guerra", "SOM": "guerra",
    "SDN": "guerra", "SYR": "guerra", "THA": "guerra", "TGO": "guerra",
    "UGA": "guerra", "UKR": "guerra", "YEM": "guerra", "SSD": "guerra",
    "PHL": "guerra", "QAT": "guerra",
    "ARG": "nao_estatal", "BOL": "nao_estatal", "BRA": "nao_estatal",
    "TCD": "nao_estatal", "COG": "nao_estatal", "CRI": "nao_estatal",
    "ECU": "nao_estatal", "GHA": "nao_estatal", "GTM": "nao_estatal",
    "MEX": "nao_estatal", "PNG": "nao_estatal",
}


@app.route("/api/conflicts")
def get_conflicts():
    ano = request.args.get("ano", "2025")

    caminho = os.path.join(
        os.path.dirname(__file__),
        "data",
        "conflicts.csv"
    )

    conflitos = []

    try:
        with open(caminho, "r", encoding="utf-8") as arquivo:
            leitor = csv.DictReader(arquivo)

            for linha in leitor:
                codigo = linha.get("Code")
                ano_linha = linha.get("Year")
                teve_conflito = linha.get(
                    "Country where conflict took place - Conflict type: all"
                )

                if (
                    ano_linha == ano
                    and codigo
                    and teve_conflito == "1"
                ):
                    entidade = linha.get(
                        "Entity",
                        "O país"
                    )

                    tipo = TIPO_CONFLITO.get(codigo)

                    if tipo == "guerra":
                        resumo = (
                            f"{entidade} registrou conflito armado envolvendo "
                            f"o Estado (governo x rebeldes ou entre países) "
                            f"em {ano}, segundo dados do UCDP."
                        )
                    elif tipo == "nao_estatal":
                        resumo = (
                            f"{entidade} registrou violência armada organizada "
                            f"em {ano} (facções, milícias ou crime organizado, "
                            f"sem envolvimento direto do governo como parte do "
                            f"conflito), segundo dados do UCDP."
                        )
                    else:
                        resumo = (
                            f"{entidade} registrou conflito armado ativo "
                            f"em {ano}, segundo dados do UCDP."
                        )

                    conflitos.append({
                        "code3": codigo,
                        "type": "Conflito armado",
                        "summary": resumo
                    })
    except FileNotFoundError:
        return {
            "error": "O arquivo data/conflicts.csv não foi encontrado."
        }, 500

    except Exception as erro:
        return {
            "error": (
                "Erro ao processar os conflitos: "
                f"{type(erro).__name__}: {erro}"
            )
        }, 500

    return conflitos


@app.route("/api/borders")
def get_borders():
    caminho = os.path.join(
        os.path.dirname(__file__),
        "data",
        "countries.geo.json"
    )

    try:
        with open(caminho, "r", encoding="utf-8") as arquivo:
            return json.load(arquivo)

    except FileNotFoundError:
        return {
            "error": (
                "O arquivo data/countries.geo.json "
                "não foi encontrado."
            )
        }, 500

    except json.JSONDecodeError:
        return {
            "error": (
                "O arquivo countries.geo.json "
                "possui formato inválido."
            )
        }, 500


@app.route("/api/countries")
def get_countries():
    caminho = os.path.join(
        os.path.dirname(__file__),
        "data",
        "countries.json"
    )

    try:
        with open(caminho, "r", encoding="utf-8") as arquivo:
            countries_data = json.load(arquivo)

    except FileNotFoundError:
        return {
            "error": "O arquivo data/countries.json não foi encontrado."
        }, 500

    except json.JSONDecodeError:
        return {
            "error": "O arquivo countries.json possui formato inválido."
        }, 500

    countries = []

    for country in countries_data:
        name = country.get("name")
        code = country.get("iso2")
        code3 = country.get("iso3")
        region = country.get("region")
        capital = country.get("capital") or "Sem capital"
        population = country.get("population")

        try:
            latlng = [
                float(country.get("latitude")),
                float(country.get("longitude"))
            ]
        except (TypeError, ValueError):
            latlng = None

        moeda = (
            {
                "code": country.get("currency"),
                "name": country.get("currency_name"),
                "symbol": country.get("currency_symbol")
            }
            if country.get("currency")
            else None
        )

        if latlng:
            countries.append({
                "name": name,
                "code": code,
                "code3": code3,
                "region": region,
                "capital": capital,
                "population": population,
                "latlng": latlng,
                "currency": moeda
            })

    return countries


@app.route("/api/news")
def get_news():
    if not NEWS_API_KEY:
        return {
            "error": (
                "NEWS_API_KEY não foi configurada nas variáveis "
                "de ambiente do servidor."
            )
        }, 500

    query = (
        "geopolitics OR \"international conflict\" OR "
        "\"armed conflict\" OR \"foreign policy\""
    )

    url = (
        "https://newsapi.org/v2/everything"
        f"?q={urllib.parse.quote(query)}"
        "&language=en"
        "&sortBy=publishedAt"
        "&pageSize=10"
        f"&apiKey={NEWS_API_KEY}"
    )

    try:
        with urllib.request.urlopen(url, timeout=15) as resposta:
            data = json.loads(resposta.read().decode("utf-8"))

        artigos = data.get("articles", [])

        noticias = [
            {
                "title": artigo.get("title"),
                "source": (
                    artigo.get("source", {}).get("name")
                ),
                "url": artigo.get("url"),
                "image": artigo.get("urlToImage"),
                "publishedAt": artigo.get("publishedAt")
            }
            for artigo in artigos
            if artigo.get("title") and artigo.get("title") != "[Removed]"
        ]

        return noticias

    except urllib.error.HTTPError as erro:
        detalhe = erro.read().decode("utf-8", errors="replace")
        return {
            "error": f"Erro ao buscar notícias: HTTP {erro.code}: {detalhe}"
        }, 502

    except Exception as erro:
        return {
            "error": (
                "Erro inesperado ao buscar notícias: "
                f"{type(erro).__name__}: {erro}"
            )
        }, 502


# Este bloco deve sempre ficar no final do arquivo.


# Este bloco deve sempre ficar no final do arquivo.
# No Render, o Gunicorn importa o objeto "app".
if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", 5000)),
        debug=True
    )