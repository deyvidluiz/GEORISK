let countriesByCode = {};
let conflitosByCode = {};
let geoLayer = null;
let codigoPaisSelecionado = null;
let historicoChat = [];

function estiloPais(feature) {
  const emAlerta = conflitosByCode[feature.id] !== undefined;
  return {
    color: emAlerta ? "#e74c3c" : "#3388ff",
    weight: emAlerta ? 2 : 1,
    fillColor: emAlerta ? "#e74c3c" : "#3388ff",
    fillOpacity: emAlerta ? 0.4 : 0.15
  };
}

function carregarConflitos(ano) {
  fetch(`http://127.0.0.1:5000/api/conflicts?ano=${ano}`)
    .then(response => response.json())
    .then(conflitos => {
      conflitosByCode = {};
      conflitos.forEach(c => { conflitosByCode[c.code3] = c; });

      if (geoLayer) {
        geoLayer.eachLayer(layer => {
          layer.setStyle(estiloPais(layer.feature));
        });
      }
    })
    .catch(error => console.error("Erro ao carregar conflitos:", error));
}

// Preenche o seletor de anos (1989 até 2025)
const seletor = document.getElementById("seletor-ano");
for (let ano = 2025; ano >= 1989; ano--) {
  const opt = document.createElement("option");
  opt.value = ano;
  opt.textContent = ano;
  seletor.appendChild(opt);
}
seletor.addEventListener("change", () => carregarConflitos(seletor.value));

// ---- Chat com a IA ----

function renderizarChat() {
  const container = document.getElementById("chat-mensagens");
  container.innerHTML = "";
  historicoChat.forEach(msg => {
    const p = document.createElement("p");
    p.style.fontWeight = msg.role === "user" ? "bold" : "normal";
    p.textContent = (msg.role === "user" ? "Você: " : "IA: ") + msg.text;
    container.appendChild(p);
  });
  container.scrollTop = container.scrollHeight;
}

function enviarMensagem() {
  if (!codigoPaisSelecionado) {
    alert("Selecione um país no mapa primeiro.");
    return;
  }

  const input = document.getElementById("chat-input");
  const mensagem = input.value.trim();
  if (!mensagem) return;

  historicoChat.push({ role: "user", text: mensagem });
  renderizarChat();
  input.value = "";

  fetch("http://127.0.0.1:5000/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code3: codigoPaisSelecionado,
      history: historicoChat.slice(0, -1),
      message: mensagem
    })
  })
    .then(response => response.json())
    .then(data => {
      historicoChat.push({ role: "model", text: data.reply || "Não consegui responder." });
      renderizarChat();
    })
    .catch(error => {
      console.error("Erro no chat:", error);
      historicoChat.push({ role: "model", text: "Erro ao conectar com a IA." });
      renderizarChat();
    });
}

document.getElementById("chat-enviar").addEventListener("click", enviarMensagem);
document.getElementById("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") enviarMensagem();
});

// ---- Fluxo principal ----

fetch("http://127.0.0.1:5000/api/countries")
  .then(response => response.json())
  .then(countries => {

    countries.forEach(country => {
      if (country.code3) countriesByCode[country.code3] = country;
    });

    fetch("http://127.0.0.1:5000/api/borders")
      .then(response => response.json())
      .then(geojsonData => {

        geoLayer = L.geoJSON(geojsonData, {
          style: estiloPais,
          onEachFeature: function (feature, layer) {
            const code3 = feature.id;

            layer.on("click", () => {
              codigoPaisSelecionado = code3;
              historicoChat = [];
              renderizarChat();

              const country = countriesByCode[code3];
              const conflito = conflitosByCode[code3];

              if (!country) {
                document.getElementById("nome-pais").textContent = feature.properties?.name || "País não encontrado na base";
                return;
              }
              document.getElementById("nome-pais").textContent = country.name || "Nome não disponível";
              document.getElementById("capital").textContent = country.capital || "Sem capital";
              document.getElementById("regiao").textContent = country.region || "Região não disponível";
              document.getElementById("populacao").textContent =
                country.population ? country.population.toLocaleString("pt-BR") : "Dado não disponível";
              document.getElementById("codigo").textContent = country.code || "—";

              const banner = document.getElementById("alerta-conflito");
              if (conflito) {
                banner.style.display = "block";
                document.getElementById("alerta-tipo").textContent = conflito.type;
                document.getElementById("alerta-resumo").textContent = conflito.summary;
              } else {
                banner.style.display = "none";
              }
            });

            layer.on("mouseover", () => layer.setStyle({ fillOpacity: 0.5 }));
            layer.on("mouseout", () => layer.setStyle(estiloPais(feature)));
          }
        }).addTo(map);

        carregarConflitos(2025);

      })
      .catch(error => console.error("Erro ao carregar contornos:", error));

  })
  .catch(error => console.error("Erro ao carregar países:", error));