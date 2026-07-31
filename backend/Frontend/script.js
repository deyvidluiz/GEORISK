let countriesByCode = {};
let conflitosByCode = {};
let geoLayer = null;
let paisSelecionado = null;
let historicoChat = [];

const API_URL = "http://127.0.0.1:5000";

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
  fetch(`${API_URL}/api/conflicts?ano=${ano}`)
    .then(response => response.json())
    .then(conflitos => {
      conflitosByCode = {};
      conflitos.forEach(c => { conflitosByCode[c.code3] = c; });

      // Se o mapa já foi desenhado, só re-estiliza (sem recriar tudo)
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

// ---- Fluxo principal ----

fetch(`${API_URL}/api/countries`)
  .then(response => response.json())
  .then(countries => {

    countries.forEach(country => {
      if (country.code3) countriesByCode[country.code3] = country;
    });

    fetch(`${API_URL}/api/borders`)
      .then(response => response.json())
      .then(geojsonData => {

        geoLayer = L.geoJSON(geojsonData, {
          style: estiloPais,
          onEachFeature: function (feature, layer) {
            const code3 = feature.id;

            layer.on("click", () => {
              const country = countriesByCode[code3];
              const conflito = conflitosByCode[code3]; // sempre busca o valor atual

              if (!country) {
                document.getElementById("nome-pais").textContent = feature.properties?.name || "País não encontrado na base";
                return;
              }
              paisSelecionado = country;
              historicoChat = [];
              renderizarMensagemSistema(`Pergunte sobre ${country.name}.`);
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

        // Carrega os conflitos do ano padrão (2025) assim que o mapa estiver pronto
        carregarConflitos(2025);

      })
      .catch(error => console.error("Erro ao carregar contornos:", error));

  })
  .catch(error => console.error("Erro ao carregar países:", error));

function adicionarMensagem(role, text) {
  const chat = document.getElementById("chat-mensagens");
  const item = document.createElement("div");
  item.className = `chat-msg ${role}`;
  item.textContent = text;
  chat.appendChild(item);
  chat.scrollTop = chat.scrollHeight;
}

function renderizarMensagemSistema(text) {
  const chat = document.getElementById("chat-mensagens");
  chat.innerHTML = "";
  adicionarMensagem("sistema", text);
  document.getElementById("chat-erro").textContent = "";
}

document.getElementById("chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const input = document.getElementById("chat-input");
  const erro = document.getElementById("chat-erro");
  const mensagem = input.value.trim();

  erro.textContent = "";

  if (!paisSelecionado) {
    erro.textContent = "Selecione um país no mapa antes de perguntar.";
    return;
  }

  if (!mensagem) return;

  input.value = "";
  input.disabled = true;
  adicionarMensagem("user", mensagem);

  try {
    const response = await fetch(`${API_URL}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code3: paisSelecionado.code3,
        message: mensagem,
        history: historicoChat
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Erro HTTP ${response.status}`);
    }

    adicionarMensagem("assistant", data.reply);
    historicoChat.push({ role: "user", text: mensagem });
    historicoChat.push({ role: "assistant", text: data.reply });
  } catch (error) {
    erro.textContent = error.message || "Erro ao conectar com a IA.";
  } finally {
    input.disabled = false;
    input.focus();
  }
});
