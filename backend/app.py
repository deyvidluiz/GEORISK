from flask import Flask, request
from flask_cors import CORS
from dotenv import load_dotenv

import csv
import json
import os
import urllib.error
import urllib.request


# Carrega as variáveis do arquivo .env
load_dotenv(
    os.path.join(os.path.dirname(__file__), ".env"),
    override=True
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")


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
            if country.get("cca3") == code3
        ),
        None
    )

    nome = (
        pais.get("name", {}).get("common")
        if pais
        else code3
    )

    capital_list = pais.get("capital") if pais else None
    capital = capital_list[0] if capital_list else "desconhecida"

    regiao = (
        pais.get("region")
        if pais
        else "desconhecida"
    )

    instrucao_sistema = f"""
Você é um analista de geopolítica conversando com um estudante sobre o país {nome}.

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
        "contents": conteudo
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

                    conflitos.append({
                        "code3": codigo,
                        "type": "Conflito armado",
                        "summary": (
                            f"{entidade} registrou conflito armado ativo "
                            f"em {ano}, segundo dados do UCDP."
                        )
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
        name = country.get(
            "name",
            {}
        ).get("common")

        code = country.get("cca2")
        code3 = country.get("cca3")
        region = country.get("region")

        capital_list = country.get("capital")
        capital = (
            capital_list[0]
            if capital_list
            else "Sem capital"
        )

        population = country.get("population")
        latlng = country.get("latlng", [])

        if len(latlng) == 2:
            countries.append({
                "name": name,
                "code": code,
                "code3": code3,
                "region": region,
                "capital": capital,
                "population": population,
                "latlng": latlng
            })

    return countries


# Este bloco deve sempre ficar no final do arquivo.
# No Render, o Gunicorn importa o objeto "app".
if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", 5000)),
        debug=True
    )