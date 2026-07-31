from flask import Flask
from flask_cors import CORS
import json
import os
import csv
import urllib.error
import urllib.request
from flask import request  # adicione "request" no import do flask
from dotenv import load_dotenv
from flask import Flask, request

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"), override=True)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

app = Flask(__name__)

CORS(app)


@app.route("/api/ai/chat", methods=["POST"])
def chat_ai():
    if not GEMINI_API_KEY:
        return {"error": "GEMINI_API_KEY nao foi configurada no .env da raiz do projeto."}, 500

    dados = request.get_json() or {}
    code3 = dados.get("code3")
    historico = dados.get("history", [])
    mensagem = dados.get("message")

    if not code3 or not mensagem:
        return {"error": "Faltam dados (code3 ou message)"}, 400

    caminho_countries = os.path.join(os.path.dirname(__file__), "data", "countries.json")
    with open(caminho_countries, "r", encoding="utf-8") as f:
        countries_data = json.load(f)
    pais = next((c for c in countries_data if c.get("cca3") == code3), None)

    nome = pais.get("name", {}).get("common") if pais else code3
    capital_list = pais.get("capital") if pais else None
    capital = capital_list[0] if capital_list else "desconhecida"
    regiao = pais.get("region") if pais else "desconhecida"

    instrucao_sistema = f"""
Você é um analista de geopolítica conversando com um estudante sobre o país {nome}.
Dados do país: capital {capital}, região {regiao}.
Responda sempre em português, de forma simples e objetiva, sem usar markdown.
"""

    historico_formatado = []
    for h in historico:
        role = h.get("role")
        text = h.get("text")
        if not text:
            continue
        historico_formatado.append({
            "role": "model" if role in ("model", "assistant") else "user",
            "parts": [{"text": text}]
        })

    try:
        conteudo = historico_formatado + [
            {"role": "user", "parts": [{"text": mensagem}]}
        ]
        payload = json.dumps({
            "systemInstruction": {
                "parts": [{"text": instrucao_sistema}]
            },
            "contents": conteudo
        }).encode("utf-8")
        url = (
            "https://generativelanguage.googleapis.com/v1beta/"
            f"models/gemini-2.5-flash-lite:generateContent?key={GEMINI_API_KEY}"
        )
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))

        reply = (
            data.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text")
        )
        if not reply:
            return {"error": "A IA respondeu sem texto."}, 502

        return {"reply": reply}
    except urllib.error.HTTPError as exc:
        detalhe = exc.read().decode("utf-8", errors="replace")
        return {"error": f"Erro ao conectar com a IA: HTTP {exc.code}: {detalhe}"}, 502
    except Exception as exc:
        return {"error": f"Erro ao conectar com a IA: {type(exc).__name__}: {exc}"}, 502

@app.route("/api/conflicts")
def get_conflicts():
    ano = request.args.get("ano", "2025")  #se não declarar nenhum ano, 2025 vai ser adicionado automatico

    caminho = os.path.join(os.path.dirname(__file__), "data", "conflicts.csv")
    conflitos = []

    with open(caminho, "r", encoding="utf-8") as f:
        leitor = csv.DictReader(f)
        for linha in leitor:
            if linha["Year"] == ano and linha["Code"]:
                teve_conflito = linha["Country where conflict took place - Conflict type: all"]
                if teve_conflito == "1":
                    conflitos.append({
                        "code3": linha["Code"],
                        "type": "Conflito armado",
                        "summary": f"{linha['Entity']} registrou conflito armado ativo em {ano}, segundo dados do UCDP."
                    })

    return conflitos

@app.route("/api/borders")#para criar as rotas de fronteira dos paises
def get_borders():
    caminho = os.path.join(os.path.dirname(__file__), "data", "countries.geo.json")
    with open(caminho, "r", encoding="utf-8") as f:
        return json.load(f)

#criando o servidor em Flask
#servidor chamado de app
@app.route("/api/health")
def health():
    return {
        "status":"ok",

    }


@app.route("/api/countries")
def get_countries():
    caminho = os.path.join(os.path.dirname(__file__), "data", "countries.json")#pega os dados direto do arquivo da data

    with open(caminho, "r", encoding="utf-8") as f:
        countries_data = json.load(f)

    countries = []

    for country in countries_data:
        name = country.get("name", {}).get("common")
        code = country.get("cca2")
        code3 = country.get ("cca3")
        region = country.get("region")
        capital_list = country.get("capital")
        capital = capital_list[0] if capital_list else "Sem capital"
        population = country.get("population")
        latlng = country.get("latlng", [])

        if len(latlng) == 2:
            countries.append({
                "name": name,
                "code": code,
                "code3": code3, #codigo de 3 letras
                "region": region,
                "capital": capital,
                "population": population,
                "latlng": latlng
            })

    return countries

if __name__ == "__main__":
    app.run(debug=True)
