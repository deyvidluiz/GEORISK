let countriesByCode = {};
let conflitosByCode = {};
let geoLayer = null;
let paisSelecionado = null;
let historicoChat = [];

const API_URL = "";


function estiloPais(feature) {
  const emAlerta = conflitosByCode[feature.id] !== undefined;

  return {
    color: emAlerta ? "#e74c3c" : "#3388ff",
    weight: emAlerta ? 2 : 1,
    fillColor: emAlerta ? "#e74c3c" : "#3388ff",
    fillOpacity: emAlerta ? 0.4 : 0.15
  };
}


async function carregarConflitos(ano) {
  try {
    const response = await fetch(
      `${API_URL}/api/conflicts?ano=${ano}`
    );

    if (!response.ok) {
      throw new Error(
        `Erro ao carregar conflitos: HTTP ${response.status}`
      );
    }

    const conflitos = await response.json();

    conflitosByCode = {};

    conflitos.forEach(conflito => {
      conflitosByCode[conflito.code3] = conflito;
    });

    if (geoLayer) {
      geoLayer.eachLayer(layer => {
        layer.setStyle(estiloPais(layer.feature));
      });
    }

    atualizarPainelConflito();
  } catch (error) {
    console.error("Erro ao carregar conflitos:", error);
  }
}


function atualizarPainelConflito() {
  const banner = document.getElementById("alerta-conflito");

  if (!paisSelecionado) {
    banner.style.display = "none";
    return;
  }

  const conflito = conflitosByCode[paisSelecionado.code3];

  if (conflito) {
    banner.style.display = "block";

    document.getElementById("alerta-tipo").textContent =
      conflito.type;

    document.getElementById("alerta-resumo").textContent =
      conflito.summary;
  } else {
    banner.style.display = "none";

    document.getElementById("alerta-tipo").textContent = "";
    document.getElementById("alerta-resumo").textContent = "";
  }
}


// Preenche o seletor de anos
const seletor = document.getElementById("seletor-ano");

for (let ano = 2025; ano >= 1989; ano--) {
  const option = document.createElement("option");

  option.value = ano;
  option.textContent = ano;

  seletor.appendChild(option);
}

seletor.addEventListener("change", async () => {
  await carregarConflitos(seletor.value);
});


// Carrega os países e o mapa
async function carregarMapa() {
  try {
    const countriesResponse = await fetch(
      `${API_URL}/api/countries`
    );

    if (!countriesResponse.ok) {
      throw new Error(
        `Erro ao carregar países: HTTP ${countriesResponse.status}`
      );
    }

    const countries = await countriesResponse.json();

    countriesByCode = {};

    countries.forEach(country => {
      if (country.code3) {
        countriesByCode[country.code3] = country;
      }
    });

    const bordersResponse = await fetch(
      `${API_URL}/api/borders`
    );

    if (!bordersResponse.ok) {
      throw new Error(
        `Erro ao carregar fronteiras: HTTP ${bordersResponse.status}`
      );
    }

    const geojsonData = await bordersResponse.json();

    geoLayer = L.geoJSON(geojsonData, {
      style: estiloPais,

      onEachFeature(feature, layer) {
        const code3 = feature.id;

        layer.on("click", () => {
          const country = countriesByCode[code3];

          if (!country) {
            document.getElementById("nome-pais").textContent =
              feature.properties?.name ||
              "País não encontrado na base";

            return;
          }

          paisSelecionado = country;
          historicoChat = [];

          renderizarMensagemSistema(
            `Pergunte sobre ${country.name}.`
          );

          document.getElementById("nome-pais").textContent =
            country.name || "Nome não disponível";

          document.getElementById("capital").textContent =
            country.capital || "Sem capital";

          document.getElementById("regiao").textContent =
            country.region || "Região não disponível";

          document.getElementById("populacao").textContent =
            country.population
              ? country.population.toLocaleString("pt-BR")
              : "Dado não disponível";

          document.getElementById("codigo").textContent =
            country.code || "—";

          atualizarPainelConflito();
        });

        layer.on("mouseover", () => {
          layer.setStyle({
            fillOpacity: 0.5
          });
        });

        layer.on("mouseout", () => {
          layer.setStyle(estiloPais(feature));
        });
      }
    }).addTo(map);

    await carregarConflitos(seletor.value);
  } catch (error) {
    console.error("Erro ao carregar mapa:", error);

    const erroChat = document.getElementById("chat-erro");

    if (erroChat) {
      erroChat.textContent =
        "Não foi possível carregar os dados do mapa.";
    }
  }
}


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


document
  .getElementById("chat-form")
  .addEventListener("submit", async event => {
    event.preventDefault();

    const input = document.getElementById("chat-input");
    const erro = document.getElementById("chat-erro");
    const botao = document.querySelector(
      "#chat-form button[type='submit']"
    );

    const mensagem = input.value.trim();

    erro.textContent = "";

    if (!paisSelecionado) {
      erro.textContent =
        "Selecione um país no mapa antes de perguntar.";

      return;
    }

    if (!mensagem) {
      return;
    }

    input.value = "";
    input.disabled = true;

    if (botao) {
      botao.disabled = true;
      botao.textContent = "Enviando...";
    }

    adicionarMensagem("user", mensagem);

    const mensagemCarregando = document.createElement("div");

    mensagemCarregando.className = "chat-msg assistant";
    mensagemCarregando.textContent =
      "Aguarde, consultando a IA...";

    document
      .getElementById("chat-mensagens")
      .appendChild(mensagemCarregando);

    try {
      const response = await fetch(
        `${API_URL}/api/ai/chat`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            code3: paisSelecionado.code3,
            message: mensagem,
            history: historicoChat
          })
        }
      );

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          `O servidor retornou uma resposta inválida. HTTP ${response.status}`
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
          `Erro HTTP ${response.status}`
        );
      }

      mensagemCarregando.remove();

      adicionarMensagem(
        "assistant",
        data.reply
      );

      historicoChat.push({
        role: "user",
        text: mensagem
      });

      historicoChat.push({
        role: "assistant",
        text: data.reply
      });
    } catch (error) {
      mensagemCarregando.remove();

      console.error(
        "Erro ao conectar com a IA:",
        error
      );

      erro.textContent =
        error.message ||
        "Erro ao conectar com a IA.";
    } finally {
      input.disabled = false;
      input.focus();

      if (botao) {
        botao.disabled = false;
        botao.textContent = "Enviar";
      }
    }
  });


carregarMapa();