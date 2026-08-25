let countriesByCode = {};
let conflitosByCode = {};
let layerByCode = {};
let geoLayer = null;
let paisSelecionado = null;
let codigoSelecionado = null;
let historicoChat = [];

let modoComparacao = false;
let comparacaoA = null;
let comparacaoB = null;
let cacheAnaliseComparacao = {};

const API_URL = window.location.protocol === "file:"
  ? "http://127.0.0.1:5000"
  : "";

const seletor = document.getElementById("seletor-ano");
const buscaPais = document.getElementById("busca-pais");
const totalConflitos = document.getElementById("total-conflitos");
const anoAtual = document.getElementById("ano-atual");

function conflitoAtivo(code3) {
  return conflitosByCode[code3] !== undefined;
}

function estiloPais(feature) {
  if (modoComparacao) {
    const isA = comparacaoA && feature.id === comparacaoA.code3;
    const isB = comparacaoB && feature.id === comparacaoB.code3;

    if (isA || isB) {
      return {
        color: isA ? "#4fa8f4" : "#f4c95d",
        weight: 3,
        fillColor: isA ? "#4fa8f4" : "#f4c95d",
        fillOpacity: 0.5,
        opacity: 0.95
      };
    }

    return {
      color: "#3a4a48",
      weight: 1,
      fillColor: "#3a4a48",
      fillOpacity: 0.08,
      opacity: 0.6
    };
  }

  const emAlerta = conflitoAtivo(feature.id);
  const selecionado = feature.id === codigoSelecionado;

  return {
    color: selecionado ? "#f4c95d" : emAlerta ? "#e94f4f" : "#2f8fd8",
    weight: selecionado ? 3 : emAlerta ? 2 : 1,
    fillColor: emAlerta ? "#e94f4f" : "#2f8fd8",
    fillOpacity: selecionado ? 0.56 : emAlerta ? 0.42 : 0.16,
    opacity: 0.95
  };
}

function atualizarEstilosMapa() {
  if (!geoLayer) {
    return;
  }

  geoLayer.eachLayer(layer => {
    layer.setStyle(estiloPais(layer.feature));
  });
}

function preencherAnos() {
  for (let ano = 2025; ano >= 1989; ano--) {
    const option = document.createElement("option");
    option.value = ano;
    option.textContent = ano;
    seletor.appendChild(option);
  }
}

async function carregarConflitos(ano) {
  anoAtual.textContent = ano;

  try {
    const response = await fetch(`${API_URL}/api/conflicts?ano=${ano}`);

    if (!response.ok) {
      throw new Error(`Erro ao carregar conflitos: HTTP ${response.status}`);
    }

    const conflitos = await response.json();
    conflitosByCode = {};

    conflitos.forEach(conflito => {
      conflitosByCode[conflito.code3] = conflito;
    });

    totalConflitos.textContent = conflitos.length.toLocaleString("pt-BR");
    atualizarEstilosMapa();
    atualizarPainelConflito();
  } catch (error) {
    console.error("Erro ao carregar conflitos:", error);
    totalConflitos.textContent = "-";
  }
}

function atualizarPainelConflito() {
  const banner = document.getElementById("alerta-conflito");

  if (!paisSelecionado) {
    banner.classList.remove("visivel");
    return;
  }

  const conflito = conflitosByCode[paisSelecionado.code3];

  if (conflito) {
    banner.classList.add("visivel");
    document.getElementById("alerta-tipo").textContent = conflito.type;
    document.getElementById("alerta-resumo").textContent = conflito.summary;
  } else {
    banner.classList.remove("visivel");
    document.getElementById("alerta-tipo").textContent = "";
    document.getElementById("alerta-resumo").textContent = "";
  }
}

function selecionarPais(code3, aproximar = true) {
  const country = countriesByCode[code3];
  const layer = layerByCode[code3];

  if (!country) {
    return;
  }

  paisSelecionado = country;
  codigoSelecionado = code3;
  historicoChat = [];

  document.getElementById("nome-pais").textContent = country.name || "Nome nao disponivel";
  document.getElementById("painel-subtitulo").textContent = conflitoAtivo(code3)
    ? "Ha registro de conflito armado no ano selecionado."
    : "Nao ha alerta de conflito armado no ano selecionado.";
  document.getElementById("capital").textContent = country.capital || "Sem capital";
  document.getElementById("regiao").textContent = country.region || "Regiao nao disponivel";
  document.getElementById("populacao").textContent = country.population
    ? country.population.toLocaleString("pt-BR")
    : "Dado nao disponivel";
    document.getElementById("codigo").textContent = country.code || "-";
    document.getElementById("moeda").textContent = country.currency
      ? `${country.currency.name}${country.currency.symbol ? " (" + country.currency.symbol + ")" : ""}`
      : "Dado nao disponivel";
  
    const bandeira = document.getElementById("bandeira-pais");
    if (country.code) {
      bandeira.src = `https://flagcdn.com/w80/${country.code.toLowerCase()}.png`;
      bandeira.alt = `Bandeira de ${country.name || country.code}`;
      bandeira.hidden = false;
    } else {
      bandeira.hidden = true;
    }
  
    renderizarMensagemSistema(`Pergunte sobre ${country.name}.`);
  atualizarPainelConflito();
  atualizarEstilosMapa();

  if (aproximar && layer) {
    map.fitBounds(layer.getBounds(), {
      maxZoom: 5,
      padding: [34, 34]
    });
  }
}
function selecionarParaComparacao(code3) {
  const country = countriesByCode[code3];

  if (!country) {
    return;
  }

  if (!comparacaoA || (comparacaoA && comparacaoB)) {
    comparacaoA = country;
    comparacaoB = null;
  } else if (country.code3 === comparacaoA.code3) {
    return;
  } else {
    comparacaoB = country;
  }

  atualizarPainelComparacao();
  atualizarEstilosMapa();
}

function preencherColunaComparacao(prefixo, country) {
  document.getElementById(`comparacao-${prefixo}-nome`).textContent = country.name || "-";
  document.getElementById(`comparacao-${prefixo}-capital`).textContent = country.capital || "Sem capital";
  document.getElementById(`comparacao-${prefixo}-regiao`).textContent = country.region || "Regiao nao disponivel";
  document.getElementById(`comparacao-${prefixo}-populacao`).textContent = country.population
    ? country.population.toLocaleString("pt-BR")
    : "Dado nao disponivel";
  document.getElementById(`comparacao-${prefixo}-moeda`).textContent = country.currency
    ? `${country.currency.name}${country.currency.symbol ? " (" + country.currency.symbol + ")" : ""}`
    : "Dado nao disponivel";

  const conflito = conflitosByCode[country.code3];
  document.getElementById(`comparacao-${prefixo}-conflito`).textContent = conflito
    ? conflito.type
    : "Sem alerta no ano selecionado";
}

function atualizarPainelComparacao() {
  const instrucao = document.getElementById("comparacao-instrucao");
  const corpo = document.getElementById("comparacao-corpo");
  const blocoIA = document.getElementById("comparacao-ia");
  const resultadoIA = document.getElementById("comparacao-ia-resultado");

  if (comparacaoA) {
    preencherColunaComparacao("a", comparacaoA);
  }

  if (comparacaoB) {
    preencherColunaComparacao("b", comparacaoB);
  }

  if (comparacaoA && comparacaoB) {
    corpo.hidden = false;
    blocoIA.hidden = false;
    instrucao.textContent = `Comparando ${comparacaoA.name} e ${comparacaoB.name}. Clique em outro pais para trocar.`;
    resultadoIA.textContent = "";
  } else if (comparacaoA) {
    corpo.hidden = false;
    blocoIA.hidden = true;
    instrucao.textContent = `${comparacaoA.name} selecionado. Clique em um segundo pais no mapa.`;
  } else {
    corpo.hidden = true;
    blocoIA.hidden = true;
    instrucao.textContent = "Ative o modo comparacao e clique em dois paises no mapa.";
  }
}

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function buscarPais() {
  const termo = normalizarTexto(buscaPais.value);

  if (!termo) {
    return;
  }

  const encontrado = Object.values(countriesByCode).find(country => {
    return normalizarTexto(country.name).includes(termo)
      || normalizarTexto(country.code).includes(termo)
      || normalizarTexto(country.code3).includes(termo);
  });

  if (encontrado) {
    selecionarPais(encontrado.code3);
    buscaPais.value = encontrado.name;
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

async function enviarPergunta(mensagem) {
  const input = document.getElementById("chat-input");
  const erro = document.getElementById("chat-erro");
  const botao = document.getElementById("chat-enviar");

  erro.textContent = "";

  if (!paisSelecionado) {
    erro.textContent = "Selecione um pais no mapa antes de perguntar.";
    return;
  }

  if (!mensagem) {
    return;
  }

  input.value = "";
  input.disabled = true;
  botao.disabled = true;
  botao.textContent = "Enviando";

  adicionarMensagem("user", mensagem);

  const mensagemCarregando = document.createElement("div");
  mensagemCarregando.className = "chat-msg assistant loading";
  mensagemCarregando.textContent = "Consultando a IA...";
  document.getElementById("chat-mensagens").appendChild(mensagemCarregando);

  try {
    const response = await fetch(`${API_URL}/api/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        code3: paisSelecionado.code3,
        message: mensagem,
        history: historicoChat
      })
    });

    const data = await response.json().catch(() => {
      throw new Error(`O servidor retornou uma resposta invalida. HTTP ${response.status}`);
    });

    if (!response.ok) {
      throw new Error(data.error || `Erro HTTP ${response.status}`);
    }

    mensagemCarregando.remove();
    adicionarMensagem("assistant", data.reply);

    historicoChat.push({ role: "user", text: mensagem });
    historicoChat.push({ role: "assistant", text: data.reply });
  } catch (error) {
    mensagemCarregando.remove();
    console.error("Erro ao conectar com a IA:", error);
    erro.textContent = error.message || "Erro ao conectar com a IA.";
  } finally {
    input.disabled = false;
    botao.disabled = false;
    botao.textContent = "Enviar";
    input.focus();
  }
}

async function carregarMapa() {
  try {
    const countriesResponse = await fetch(`${API_URL}/api/countries`);

    if (!countriesResponse.ok) {
      throw new Error(`Erro ao carregar paises: HTTP ${countriesResponse.status}`);
    }

    const countries = await countriesResponse.json();
    countriesByCode = {};

    countries.forEach(country => {
      if (country.code3) {
        countriesByCode[country.code3] = country;
      }
    });

    const bordersResponse = await fetch(`${API_URL}/api/borders`);

    if (!bordersResponse.ok) {
      throw new Error(`Erro ao carregar fronteiras: HTTP ${bordersResponse.status}`);
    }

    const geojsonData = await bordersResponse.json();

    geoLayer = L.geoJSON(geojsonData, {
      style: estiloPais,
      onEachFeature(feature, layer) {
        const code3 = feature.id;
        layerByCode[code3] = layer;

        layer.bindTooltip(feature.properties?.name || code3, {
          sticky: true,
          direction: "top",
          opacity: 0.92
        });

        layer.on("click", () => {
          if (modoComparacao) {
            selecionarParaComparacao(code3);
          } else {
            selecionarPais(code3, false);
          }
        });
        layer.on("mouseover", () => {
          layer.setStyle({
            fillOpacity: 0.62,
            weight: Math.max(estiloPais(feature).weight, 2)
          });
        });
        layer.on("mouseout", () => layer.setStyle(estiloPais(feature)));
      }
    }).addTo(map);

    await carregarConflitos(seletor.value);
  } catch (error) {
    console.error("Erro ao carregar mapa:", error);
    document.getElementById("chat-erro").textContent =
      "Nao foi possivel carregar os dados do mapa.";
  }
}

preencherAnos();
renderizarMensagemSistema("Selecione um pais para iniciar a conversa.");

seletor.addEventListener("change", async () => {
  await carregarConflitos(seletor.value);
});

buscaPais.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    buscarPais();
  }
});

buscaPais.addEventListener("change", buscarPais);

document.getElementById("chat-form").addEventListener("submit", async event => {
  event.preventDefault();
  await enviarPergunta(document.getElementById("chat-input").value.trim());
});

document.querySelectorAll(".prompt-btn").forEach(button => {
  button.addEventListener("click", async () => {
    await enviarPergunta(button.dataset.prompt);
  });
});

document.getElementById("comparacao-toggle").addEventListener("click", () => {
  modoComparacao = !modoComparacao;

  const botao = document.getElementById("comparacao-toggle");
  botao.textContent = modoComparacao ? "Desativar modo comparacao" : "Ativar modo comparacao";
  botao.classList.toggle("ativo", modoComparacao);

  comparacaoA = null;
  comparacaoB = null;
  atualizarPainelComparacao();
  atualizarEstilosMapa();
});

document.getElementById("comparacao-analisar").addEventListener("click", async () => {
  if (!comparacaoA || !comparacaoB) {
    return;
  }

  const botao = document.getElementById("comparacao-analisar");
  const resultado = document.getElementById("comparacao-ia-resultado");
  const chave = [comparacaoA.code3, comparacaoB.code3].sort().join("_");

  if (cacheAnaliseComparacao[chave]) {
    resultado.textContent = cacheAnaliseComparacao[chave];
    return;
  }

  botao.disabled = true;
  botao.textContent = "Analisando...";
  resultado.textContent = "";

  try {
    const resposta = await fetch(`${API_URL}/api/ai/compare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        code3_a: comparacaoA.code3,
        code3_b: comparacaoB.code3
      })
    });

    const data = await resposta.json().catch(() => {
      throw new Error(`O servidor retornou uma resposta invalida. HTTP ${resposta.status}`);
    });

    if (!resposta.ok) {
      throw new Error(data.error || `Erro HTTP ${resposta.status}`);
    }

    cacheAnaliseComparacao[chave] = data.reply;
    resultado.textContent = data.reply;
  } catch (erro) {
    console.error("Erro ao comparar paises:", erro);
    resultado.textContent = "Erro ao consultar a IA. Tente novamente.";
  } finally {
    botao.disabled = false;
    botao.textContent = "Analisar com IA";
  }
});

carregarMapa();

async function carregarNoticias() {
  const container = document.getElementById("carrossel-noticias");

  try {
    const resposta = await fetch(`${API_URL}/api/news`);

    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    const noticias = await resposta.json();

    if (!Array.isArray(noticias) || noticias.length === 0) {
      container.innerHTML = "<p class='carrossel-carregando'>Nenhuma notícia encontrada.</p>";
      return;
    }

    container.innerHTML = "";

    noticias.forEach((noticia) => {
      const card = document.createElement("a");
      card.className = "noticia-card";
      card.href = noticia.url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";

      const imagemSrc = noticia.image || "";

      card.innerHTML = `
        ${imagemSrc ? `<img src="${imagemSrc}" alt="" loading="lazy">` : ""}
        <div class="noticia-card-corpo">
          <span class="noticia-fonte">${noticia.source || "Fonte desconhecida"}</span>
          <span class="noticia-titulo">${noticia.title}</span>
        </div>
      `;

      container.appendChild(card);
    });
  } catch (erro) {
    container.innerHTML = "<p class='carrossel-carregando'>Erro ao carregar notícias.</p>";
    console.error("Erro ao carregar notícias:", erro);
  }
}

document.getElementById("carrossel-anterior").addEventListener("click", () => {
  document.getElementById("carrossel-noticias").scrollBy({ left: -280, behavior: "smooth" });
});

document.getElementById("carrossel-proximo").addEventListener("click", () => {
  document.getElementById("carrossel-noticias").scrollBy({ left: 280, behavior: "smooth" });
});

carregarNoticias();