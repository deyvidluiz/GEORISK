from flask import Flask
from flask_cors import CORS
import json
import os
import csv
from flask import request  # adicione "request" no import do flask

app = Flask(__name__)

CORS(app)


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