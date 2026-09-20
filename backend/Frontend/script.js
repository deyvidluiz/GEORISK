// ==========================================================================
// STATE
// ==========================================================================
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

// ==========================================================================
// MAP CONFIG — cores por continente, status de conflito
// Mapa, legenda e card compartilham a mesma classificação e paleta.
// ==========================================================================
const CONTINENT_COLORS = Object.freeze({
  "North America": "#8FBED8", "South America": "#8FC8A8",
  "Europe": "#AAAEDF", "Africa": "#E7C88E", "Asia": "#DFAAAA",
  "Oceania": "#91CCC5", "Antarctica": "#D6E2E8"
});
const CONTINENT_LABELS = Object.freeze({
  "North America": "América do Norte", "South America": "América do Sul",
  "Europe": "Europa", "Africa": "África", "Asia": "Ásia",
  "Oceania": "Oceania", "Antarctica": "Antártida"
});
const MAP_STATUS = {
  conflict: { label: "Conflito ativo", color: "#D84F57", className: "conflict" },
  stable: { label: "Sem conflito ativo", color: "#27A56C", className: "stable" },
  unknown: { label: "Status não disponível", color: "#8a9ba8", className: "unknown" }
};
// As únicas três geometrias sem correspondência ISO na API atual.
// Só classificam a geografia: não atribuem população, economia ou conflitos.
const GEO_CONTINENT_EXCEPTIONS = Object.freeze({
  "Northern Cyprus": "Europe", "Kosovo": "Europe", "Somaliland": "Africa"
});
let anoConflitosCarregado = null;
const seletor = document.getElementById("seletor-ano");
const buscaPais = document.getElementById("busca-pais");
const anoAtual = document.getElementById("ano-atual");

// ==========================================================================
// COUNTRY CLASSIFICATION — mesma lógica usada pelo mapa, legenda e card
// ==========================================================================
function featureKey(feature) {
  return feature.id && feature.id !== "-99" ? feature.id : `geo:${feature.properties?.name}`;
}

function getCountryData(feature) {
  const country = countriesByCode[feature.id];
  return country || { code3: featureKey(feature), name: feature.properties?.name || "País sem cadastro" };
}

function getContinent(feature) {
  const properties = feature?.properties || {};
  const country = countriesByCode[feature?.id] || {};
  const normalize = value => {
    const text = String(value || "").trim().toLowerCase();
    const continent = Object.keys(CONTINENT_COLORS).find(key => key.toLowerCase() === text);
    if (continent) return continent;
    if (["northern america", "central america", "caribbean"].includes(text)) return "North America";
    if (["polar", "antarctic"].includes(text)) return "Antarctica";
    return null;
  };
  // Prioridade a metadados da geometria quando disponíveis; neste GeoJSON só há name.
  for (const source of [properties, country]) {
    const direct = normalize(source.continent) || normalize(source.region);
    if (direct) return direct;
    const subregion = normalize(source.subregion);
    if (subregion) return subregion;
  }
  if (feature?.id === "ATA") return "Antarctica";
  return GEO_CONTINENT_EXCEPTIONS[properties.name] || null;
}

function getContinentColor(feature) {
  return CONTINENT_COLORS[getContinent(feature)] || "#CBD7DE";
}

function hasActiveConflict(country) {
  const code3 = typeof country === "string" ? country : country?.code3;
  return conflitosByCode[code3] !== undefined;
}

function statusPais(code3) {
  if (!countriesByCode[code3] || anoConflitosCarregado !== seletor.value) return MAP_STATUS.unknown;
  return hasActiveConflict(code3) ? MAP_STATUS.conflict : MAP_STATUS.stable;
}

function mapaEmTemaEscuro() {
  return document.documentElement.dataset.theme === "dark";
}

// ==========================================================================
// FORMATTERS
// ==========================================================================
function formatarNumeroCompacto(valor) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) {
    return "Dado nao disponivel";
  }
  const unidades = [
    [1_000_000_000_000, "trilhões"],
    [1_000_000_000, "bilhões"],
    [1_000_000, "milhões"],
    [1_000, "mil"]
  ];
  const unidade = unidades.find(([limite]) => Math.abs(valor) >= limite);
  if (!unidade) return new Intl.NumberFormat("pt-BR").format(valor);
  const [limite, plural] = unidade;
  const singular = { "milhões": "milhão", "bilhões": "bilhão", "trilhões": "trilhão" };
  const rotulo = Math.round(Math.abs(valor / limite) * 10) / 10 === 1 ? (singular[plural] || plural) : plural;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: limite >= 1e9 ? 1 : 0 }).format(valor / limite)} ${rotulo}`;
}

function formatarMoedaCompacta(valor) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) {
    return "Dado nao disponivel";
  }
  return `US$ ${formatarNumeroCompacto(valor)}`;
}

function formatarTempoRelativo(dataISO) {
  if (!dataISO) {
    return "";
  }

  const data = new Date(dataISO);
  if (Number.isNaN(data.getTime())) {
    return "";
  }

  const diffMs = Date.now() - data.getTime();
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 60) {
    return diffMin <= 1 ? "há 1 min" : `há ${diffMin} min`;
  }

  const diffHoras = Math.round(diffMin / 60);
  if (diffHoras < 24) {
    return diffHoras === 1 ? "há 1 hora" : `há ${diffHoras} horas`;
  }

  const diffDias = Math.round(diffHoras / 24);
  return diffDias === 1 ? "há 1 dia" : `há ${diffDias} dias`;
}

function formatarAreaCompacta(valor) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) {
    return "Dado nao disponivel";
  }
  return `${formatarNumeroCompacto(valor)} km²`;
}

// ==========================================================================
// COUNTRY STYLING — preenchimento por continente, borda por conflito/seleção
// ==========================================================================
function getCountryStyle(feature) {
  const code3 = featureKey(feature);
  const comparado = modoComparacao && [comparacaoA?.code3, comparacaoB?.code3].includes(code3);
  const selecionado = code3 === codigoSelecionado || comparado;
  const emConflito = statusPais(code3) === MAP_STATUS.conflict;
  return {
    fill: true,
    fillColor: getContinentColor(feature),
    fillOpacity: selecionado ? 0.92 : emConflito || mapaEmTemaEscuro() ? 0.82 : 0.78,
    color: emConflito ? MAP_STATUS.conflict.color : selecionado ? "#087FB5"
      : mapaEmTemaEscuro() ? "rgba(225,240,248,.55)" : "#FFFFFF",
    weight: selecionado ? 3.2 : emConflito ? 2.5 : 0.8,
    opacity: 0.95,
    dashArray: comparado || (selecionado && emConflito) ? "6 2" : null
  };
}

function highlightCountry(event) {
  const layer = event.target;
  layer.setStyle({ fillOpacity: 0.95, weight: Math.max(getCountryStyle(layer.feature).weight, 2) });
  layer.bringToFront();
}

function resetCountryHighlight(event) {
  geoLayer.resetStyle(event.target); // Recalcula seleção, continente e conflito atuais.
}

// ==========================================================================
// MAP LEGEND — consome a mesma paleta CONTINENT_COLORS/MAP_STATUS do mapa
// ==========================================================================
function renderizarLegendaMapa() {
  const legenda = document.getElementById("map-legend");
  const expandir = document.getElementById("map-expand-link");
  legenda.querySelectorAll("span").forEach(item => item.remove());
  Object.entries(CONTINENT_COLORS).forEach(([continente, color]) => {
    const item = document.createElement("span");
    item.innerHTML = `<i class="legend-dot" style="--status-color:${color}"></i>${CONTINENT_LABELS[continente]}`;
    legenda.insertBefore(item, expandir);
  });
  const heading = document.createElement("span");
  heading.className = "legend-status-heading";
  heading.textContent = "STATUS";
  legenda.insertBefore(heading, expandir);
  const item = document.createElement("span");
  item.innerHTML = `<i class="legend-dot conflict" style="--status-color:${MAP_STATUS.conflict.color}"></i>${MAP_STATUS.conflict.label}`;
  legenda.insertBefore(item, expandir);
}

function atualizarEstilosMapa() {
  if (!geoLayer) {
    return;
  }

  geoLayer.eachLayer(layer => {
    layer.setStyle(getCountryStyle(layer.feature));
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

// ==========================================================================
// COUNTRY CARD — conflitos anuais, seleção e "Análise do País"
// ==========================================================================
let consultaConflitos = 0;
async function carregarConflitos(ano) {
  const consulta = ++consultaConflitos;
  anoAtual.textContent = ano;
  anoConflitosCarregado = null;
  atualizarEstilosMapa();
  atualizarStatusPais();
  atualizarPainelConflito();

  try {
    const response = await fetch(`${API_URL}/api/conflicts?ano=${ano}`);

    if (!response.ok) {
      throw new Error(`Erro ao carregar conflitos: HTTP ${response.status}`);
    }

    const conflitos = await response.json();
    if (consulta !== consultaConflitos) return;
    conflitosByCode = {};
    anoConflitosCarregado = String(ano);

    conflitos.forEach(conflito => {
      conflitosByCode[conflito.code3] = conflito;
    });

    renderizarDashboard(conflitos);
    atualizarEstilosMapa();
    atualizarPainelConflito();
    atualizarStatusPais();
    atualizarPainelComparacao();
    map.closePopup();
  } catch (error) {
    console.error("Erro ao carregar conflitos:", error);
    document.getElementById("alert-list").textContent = "Não foi possível carregar os alertas deste ano.";
  }
}

function atualizarPainelConflito() {
  const banner = document.getElementById("alerta-conflito");

  if (!paisSelecionado) {
    banner.classList.remove("visivel");
    return;
  }

  const conflito = statusPais(paisSelecionado.code3) === MAP_STATUS.conflict
    ? conflitosByCode[paisSelecionado.code3] : null;

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

// A base fornece conflitos anuais, não um índice de risco geopolítico.
function atualizarStatusPais() {
  if (!paisSelecionado) return;
  const status = statusPais(paisSelecionado.code3);
  const badge = document.getElementById("risco-badge");
  badge.textContent = status.label;
  badge.classList.toggle("risco-alto", status === MAP_STATUS.conflict);
  badge.classList.toggle("risco-baixo", status === MAP_STATUS.stable);
  badge.style.setProperty("--country-status-color", status.color);
  document.getElementById("risco").textContent = "Não disponível na base";
  document.getElementById("painel-subtitulo").textContent = `Registros de ${seletor.value}`;
  document.getElementById("pais-resumo").textContent = gerarResumoPais(paisSelecionado, paisSelecionado.code3);
}

function gerarResumoPais(country, code3) {
  const feature = layerByCode[code3]?.feature || { id: code3 };
  const continente = CONTINENT_LABELS[getContinent(feature)];
  const partes = [continente ? `${country.name} — ${continente}` : country.name];
  if (country.capital) partes.push(`capital ${country.capital}`);
  if (typeof country.population === "number") partes.push(`população de ${formatarNumeroCompacto(country.population)} habitantes`);
  if (typeof country.gdp === "number") partes.push(`PIB de ${formatarMoedaCompacta(country.gdp)}`);
  return `${partes.join(", ")}. ${statusPais(code3).label} nos dados de ${seletor.value}.`;
}

function construirPopupPais(country, code3) {
  const status = statusPais(code3);
  const emAlerta = status === MAP_STATUS.conflict;
  const statusExibido = status;
  const conflito = conflitosByCode[code3];
  const bandeiraSrc = country.code ? `https://flagcdn.com/w40/${country.code.toLowerCase()}.png` : "";

  const resumo = emAlerta
    ? (conflito?.summary || "Conflito armado registrado no ano selecionado.")
    : `Sem registro de conflito armado no ano selecionado. População de ${formatarNumeroCompacto(country.population)} habitantes.`;

  return `
    <div class="mapa-popup">
      <div class="mapa-popup-cabecalho">
        ${bandeiraSrc ? `<img src="${bandeiraSrc}" alt="" class="mapa-popup-bandeira">` : ""}
        <strong>${country.name || code3}</strong>
      </div>
      <span class="mapa-popup-status" style="--status-color:${statusExibido.color}"><i></i>${statusExibido.label}</span>
      <p>${resumo}</p>
      <button type="button" class="popup-detalhes">Ver detalhes →</button>
    </div>
  `;
}

function updateCountryCard(country, feature) {
  document.getElementById("nome-pais").textContent = country.name;
  const select = document.getElementById("selecao-pais");
  select.querySelectorAll("[data-geometry-only]").forEach(option => option.remove());
  if (!countriesByCode[country.code3]) {
    const option = new Option(country.name, country.code3);
    option.dataset.geometryOnly = "true";
    select.add(option);
  }
  select.value = country.code3;
  document.getElementById("continente").textContent = CONTINENT_LABELS[getContinent(feature)] || "Não disponível";
  document.getElementById("capital").textContent = country.capital || "Não disponível";
  document.getElementById("regiao").textContent = country.region || "Não disponível";
  document.getElementById("populacao").textContent = formatarNumeroCompacto(country.population);
  document.getElementById("codigo").textContent = country.code || "Não disponível";
  document.getElementById("moeda").textContent = country.currency
    ? `${country.currency.name || country.currency.code} (${country.currency.code})` : "Não disponível";
  document.getElementById("pib").textContent = formatarMoedaCompacta(country.gdp);
  atualizarStatusPais();
  document.getElementById("pais-resumo").hidden = false;
  const bandeira = document.getElementById("bandeira-pais");
  bandeira.hidden = !country.code;
  if (country.code) {
    bandeira.src = `https://flagcdn.com/w80/${country.code.toLowerCase()}.png`;
    bandeira.alt = `Bandeira de ${country.name}`;
  } else {
    bandeira.removeAttribute("src");
    bandeira.alt = "";
  }
  atualizarPainelConflito();
}

function selecionarPais(code3, aproximar = true) {
  const layer = layerByCode[code3];
  const feature = layer?.feature || { id: code3 };
  const country = countriesByCode[code3] || (layer && getCountryData(feature));
  if (!country) return;
  paisSelecionado = country;
  codigoSelecionado = code3;
  historicoChat = [];
  updateCountryCard(country, feature);
  renderizarMensagemSistema(`Pergunte sobre ${country.name}.`);
  atualizarEstilosMapa();
  layer?.bringToFront();
  if (aproximar && layer) map.fitBounds(layer.getBounds(), { maxZoom: 5, padding: [34, 34] });
}

// ==========================================================================
// COMPARISON — modo de comparação entre dois países
// ==========================================================================
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
    ? formatarNumeroCompacto(country.population)
    : "Dado nao disponivel";
  document.getElementById(`comparacao-${prefixo}-moeda`).textContent = country.currency
    ? `${country.currency.name}${country.currency.symbol ? " (" + country.currency.symbol + ")" : ""}`
    : "Dado nao disponivel";

  const conflito = conflitosByCode[country.code3];
  document.getElementById(`comparacao-${prefixo}-conflito`).textContent = conflito
    ? conflito.type
    : "Sem alerta no ano selecionado";
}

function preencherMetricaComparacao(chave, valorA, valorB, formatador) {
  const trilhoA = document.getElementById(`barra-${chave}-a`);
  const trilhoB = document.getElementById(`barra-${chave}-b`);
  const rotuloA = document.getElementById(`valor-${chave}-a`);
  const rotuloB = document.getElementById(`valor-${chave}-b`);

  rotuloA.textContent = formatador(valorA);
  rotuloB.textContent = formatador(valorB);

  const a = typeof valorA === "number" ? valorA : 0;
  const b = typeof valorB === "number" ? valorB : 0;
  const total = a + b;
  const percentualA = total > 0 ? (a / total) * 100 : 0;

  trilhoA.style.width = `${percentualA}%`;
  trilhoB.style.width = `${total > 0 ? (b / total) * 100 : 0}%`;
}

function atualizarMetricasComparacao() {
  if (!comparacaoA || !comparacaoB) {
    return;
  }

  preencherMetricaComparacao("populacao", comparacaoA.population, comparacaoB.population, formatarNumeroCompacto);
  preencherMetricaComparacao("pib", comparacaoA.gdp, comparacaoB.gdp, formatarMoedaCompacta);
  preencherMetricaComparacao("area", comparacaoA.area_sq_km, comparacaoB.area_sq_km, formatarAreaCompacta);
}

function atualizarPainelComparacao() {
  const instrucao = document.getElementById("comparacao-instrucao");
  const corpo = document.getElementById("comparacao-corpo");
  const blocoIA = document.getElementById("comparacao-ia");
  const resultadoIA = document.getElementById("comparacao-ia-resultado");

  for (const [prefixo, country] of [["a", comparacaoA], ["b", comparacaoB]]) {
    document.getElementById(`comparacao-${prefixo}-select`).value = country?.code3 || "";
    if (!country) {
      for (const campo of ["nome", "capital", "regiao", "populacao", "moeda", "conflito"]) {
        document.getElementById(`comparacao-${prefixo}-${campo}`).textContent = "—";
      }
    }
  }
  if (!comparacaoA || !comparacaoB) {
    for (const chave of ["populacao", "pib", "area"]) {
      for (const lado of ["a", "b"]) {
        document.getElementById(`valor-${chave}-${lado}`).textContent = "—";
        document.getElementById(`barra-${chave}-${lado}`).style.width = "0%";
      }
    }
  }
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
    atualizarMetricasComparacao();
  } else if (comparacaoA) {
    corpo.hidden = false;
    blocoIA.hidden = true;
    instrucao.textContent = `${comparacaoA.name} selecionado. Clique em um segundo pais no mapa.`;
  } else {
    corpo.hidden = false;
    blocoIA.hidden = true;
    instrucao.textContent = "Escolha dois países nos seletores ou ative a comparação pelo mapa.";
  }
}

// ==========================================================================
// SEARCH
// ==========================================================================
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
    if (modoComparacao) selecionarParaComparacao(encontrado.code3);
    else selecionarPais(encontrado.code3);
    buscaPais.value = encontrado.name;
  }
}

// ==========================================================================
// AI CHAT
// ==========================================================================
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

let consultaChat = false;
async function enviarPergunta(mensagem) {
  if (consultaChat) return;
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

  consultaChat = true;
  const paisDaPergunta = paisSelecionado.code3;
  const historicoDaPergunta = historicoChat;
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
        code3: paisDaPergunta,
        message: mensagem,
        history: historicoDaPergunta
      })
    });

    const data = await response.json().catch(() => {
      throw new Error(`O servidor retornou uma resposta invalida. HTTP ${response.status}`);
    });

    if (!response.ok) {
      throw new Error(data.error || `Erro HTTP ${response.status}`);
    }

    mensagemCarregando.remove();
    if (paisSelecionado?.code3 !== paisDaPergunta || historicoChat !== historicoDaPergunta) return;
    adicionarMensagem("assistant", data.reply);

    historicoChat.push({ role: "user", text: mensagem });
    historicoChat.push({ role: "assistant", text: data.reply });

    atualizarTamanhoMapa();

  } catch (error) {
    mensagemCarregando.remove();
    console.error("Erro ao conectar com a IA:", error);
    erro.textContent = error.message || "Erro ao conectar com a IA.";
  } finally {
    consultaChat = false;
    input.disabled = false;
    botao.disabled = false;
    botao.textContent = "Enviar";
    input.focus();
  }
}

// ==========================================================================
// MAP DATA LOADING — países, fronteiras (GeoJSON) e bootstrap do Leaflet
// ==========================================================================
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

    renderizarResumoPaises(countries);
    const ordenados = [...countries].sort((a,b) => a.name.localeCompare(b.name, "pt-BR"));
    for (const id of ["selecao-pais", "comparacao-a-select", "comparacao-b-select"]) {
      const select = document.getElementById(id);
      ordenados.forEach(country => select.add(new Option(country.name, country.code3)));
    }
    const listaBusca = document.getElementById("paises-busca");
    ordenados.forEach(country => listaBusca.appendChild(new Option(country.code3, country.name)));

    const bordersResponse = await fetch(`${API_URL}/api/borders`);

    if (!bordersResponse.ok) {
      throw new Error(`Erro ao carregar fronteiras: HTTP ${bordersResponse.status}`);
    }

    const geojsonData = await bordersResponse.json();

    geoLayer = L.geoJSON(geojsonData, {
      style: getCountryStyle,
      onEachFeature(feature, layer) {
        const code3 = featureKey(feature);
        layerByCode[code3] = layer;

        layer.bindTooltip(feature.properties?.name || code3, {
          sticky: true,
          direction: "top",
          opacity: 0.92
        });

        layer.on("click", () => {
          selecionarPais(code3, false);
          if (modoComparacao) {
            selecionarParaComparacao(code3);
          } else {
            const country = getCountryData(feature);
            layer.bindPopup(construirPopupPais(country, code3), {
              maxWidth: 260,
              className: "mapa-popup-wrap"
            }).openPopup();
          }
        });
        layer.on("mouseover", highlightCountry);
        layer.on("mouseout", resetCountryHighlight);
      }
    }).addTo(map);

    // Mantém o mundo em destaque sem desperdiçar área útil na Antártida.
    map.fitBounds([[-45, -175], [83, 180]], { padding: [10, 10] });
    atualizarTamanhoMapa();

    await carregarConflitos(seletor.value);
  } catch (error) {
    console.error("Erro ao carregar mapa:", error);
    document.getElementById("chat-erro").textContent =
      "Nao foi possivel carregar os dados do mapa.";
  }
}

// ==========================================================================
// BOOTSTRAP — inicialização e listeners globais
// ==========================================================================
preencherAnos();
renderizarLegendaMapa();
renderizarMensagemSistema("Selecione um pais para iniciar a conversa.");

window.addEventListener("georisk:themechange", () => {
  atualizarEstilosMapa();
  renderizarLegendaMapa();
  atualizarTamanhoMapa();
});

map.on("popupopen", evento => {
  const botao = evento.popup.getElement()?.querySelector(".popup-detalhes");
  if (botao) {
    botao.addEventListener("click", () => {
      map.closePopup();
      document.getElementById("painel").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
});

seletor.addEventListener("change", async () => {
  await carregarConflitos(seletor.value);
  renderizarIndicador(document.querySelector(".indicador-tab.active").dataset.indicador);
});

document.getElementById("selecao-pais").addEventListener("change", event => selecionarPais(event.target.value));
for (const lado of ["a", "b"]) {
  document.getElementById(`comparacao-${lado}-select`).addEventListener("change", event => {
    const country = countriesByCode[event.target.value] || null;
    if (lado === "a") comparacaoA = country; else comparacaoB = country;
    atualizarPainelComparacao();
    atualizarEstilosMapa();
  });
}

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

document.querySelectorAll(".prompt-item").forEach(button => {
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

document.getElementById("comparacao-swap").addEventListener("click", () => {
  if (!comparacaoA || !comparacaoB) {
    return;
  }

  [comparacaoA, comparacaoB] = [comparacaoB, comparacaoA];
  atualizarPainelComparacao();
  atualizarEstilosMapa();
});

document.getElementById("comparacao-analisar").addEventListener("click", async () => {
  if (!comparacaoA || !comparacaoB) {
    return;
  }

  const botao = document.getElementById("comparacao-analisar");
  const resultado = document.getElementById("comparacao-ia-resultado");
  const chave = "pt-BR_v2_" + [comparacaoA.code3, comparacaoB.code3].sort().join("_");

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

    atualizarTamanhoMapa();
  } catch (erro) {
    console.error("Erro ao comparar paises:", erro);
    resultado.textContent = "Erro ao consultar a IA. Tente novamente.";
  } finally {
    botao.disabled = false;
    botao.textContent = "Analisar com IA";
  }
});

carregarMapa().then(() => {
  const abaAtiva = document.querySelector(".indicador-tab.active");
  renderizarIndicador(abaAtiva ? abaAtiva.dataset.indicador : "economia");
});

// ==========================================================================
// NEWS
// ==========================================================================
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

      // Conteúdo da API entra como texto, preservando links e imagens reais.
      if (!/^https?:\/\//i.test(noticia.url || "")) return;
      if (/^https?:\/\//i.test(noticia.image || "")) {
        const img = document.createElement("img");
        img.src = noticia.image;
        img.alt = "";
        img.loading = "lazy";
        img.addEventListener("error", () => img.remove(), { once: true });
        card.appendChild(img);
      }
      const corpo = document.createElement("div");
      corpo.className = "noticia-card-corpo";
      const categoria = document.createElement("span");
      categoria.className = "noticia-categoria";
      categoria.textContent = "Geopolítica";
      const titulo = document.createElement("span");
      titulo.className = "noticia-titulo";
      titulo.textContent = noticia.title;
      const rodape = document.createElement("div");
      rodape.className = "noticia-rodape";
      const fonte = document.createElement("span");
      fonte.className = "noticia-fonte";
      fonte.textContent = noticia.source || "Fonte desconhecida";
      const tempo = document.createElement("time");
      tempo.className = "noticia-tempo";
      if (noticia.publishedAt) tempo.dateTime = noticia.publishedAt;
      tempo.textContent = formatarTempoRelativo(noticia.publishedAt);
      rodape.append(fonte, tempo);
      corpo.append(categoria, titulo, rodape);
      card.appendChild(corpo);

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

// ==========================================================================
// DASHBOARD SUMMARY — KPIs do topo e lista de alertas
// Indicadores usam somente os dados já expostos pelo GeoRisk.
// ==========================================================================
function renderizarResumoPaises(countries) {
  document.getElementById("resumo-paises").textContent = countries.length.toLocaleString("pt-BR");

  const moedas = new Set();
  let populacaoTotal = 0;
  countries.forEach(country => {
    if (country.currency?.code) {
      moedas.add(country.currency.code);
    }
    if (typeof country.population === "number") {
      populacaoTotal += country.population;
    }
  });

  document.getElementById("resumo-moedas").textContent = moedas.size.toLocaleString("pt-BR");
  document.getElementById("resumo-populacao").textContent = formatarNumeroCompacto(populacaoTotal);
}

function renderizarDashboard(conflitos) {
  document.getElementById("resumo-conflitos").textContent = conflitos.length.toLocaleString("pt-BR");
  document.getElementById("resumo-conflitos-ano").textContent = `No ano ${anoAtual.textContent}`;

  const badge = document.getElementById("notification-badge");
  badge.textContent = conflitos.length > 99 ? "99+" : String(conflitos.length);
  badge.hidden = conflitos.length === 0;

  const lista = document.getElementById("alert-list");
  lista.replaceChildren();
  if (!conflitos.length) {
    lista.textContent = "Nenhum conflito registrado no ano selecionado.";
  }
  conflitos.forEach(conflito => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "alert-item";
    const marcador = document.createElement("i");
    marcador.setAttribute("aria-hidden", "true");
    const texto = document.createElement("div");
    const tipo = document.createElement("strong");
    tipo.textContent = conflito.type;
    const pais = document.createElement("span");
    pais.textContent = countriesByCode[conflito.code3]?.name || conflito.code3;
    const resumo = document.createElement("small");
    resumo.textContent = conflito.summary;
    texto.append(tipo, pais, resumo);
    botao.append(marcador, texto);
    botao.disabled = !countriesByCode[conflito.code3];
    botao.addEventListener("click", () => {
      selecionarPais(conflito.code3);
      document.getElementById("painel").scrollIntoView({block:"start"});
    });
    lista.appendChild(botao);
  });
}

// ==========================================================================
// CHARTS — série histórica, rankings e abas de indicadores
// ==========================================================================
const cacheConflitosPorAno = new Map();

async function obterConflitosPorAno() {
  const anoFinal = Number(seletor.value);
  if (cacheConflitosPorAno.has(anoFinal)) return cacheConflitosPorAno.get(anoFinal);
  const anos = [];
  for (let ano = Math.max(1989, anoFinal - 9); ano <= anoFinal; ano++) {
    anos.push(ano);
  }

  const respostas = await Promise.all(
    anos.map(ano => fetch(`${API_URL}/api/conflicts?ano=${ano}`).then(r => { if (!r.ok) throw new Error("Falha ao carregar série de conflitos"); return r.json(); }))
  );

  const serie = anos.map((ano, indice) => ({ ano, total: respostas[indice].length }));
  cacheConflitosPorAno.set(anoFinal, serie);
  return serie;
}

function definirVisibilidadeIndicador(mostrarGrafico) {
  document.getElementById("indicador-grafico").toggleAttribute("hidden", !mostrarGrafico);
  document.getElementById("indicador-barras").toggleAttribute("hidden", mostrarGrafico);
}

function desenharLinhaIndicador(pontos, unidadeTooltip) {
  const svg = document.getElementById("indicador-grafico");
  const largura = 600;
  const altura = 240;
  const margemEsq = 46;
  const margemDir = 12;
  const margemTopo = 16;
  const margemBaixo = 32;

  const valores = pontos.map(p => p.value);
  const maxV = Math.max(...valores, 1);
  const passoX = (largura - margemEsq - margemDir) / Math.max(pontos.length - 1, 1);
  const areaUtil = altura - margemTopo - margemBaixo;

  const coords = pontos.map((p, indice) => [
    margemEsq + indice * passoX,
    altura - margemBaixo - (p.value / maxV) * areaUtil
  ]);

  const linhaPath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c[0].toFixed(1)} ${c[1].toFixed(1)}`).join(" ");
  const areaPath = `${linhaPath} L${coords[coords.length - 1][0].toFixed(1)} ${(altura - margemBaixo).toFixed(1)} L${coords[0][0].toFixed(1)} ${(altura - margemBaixo).toFixed(1)} Z`;

  let grade = "";
  let eixoY = "";
  const nivelamentos = 4;
  for (let i = 0; i <= nivelamentos; i++) {
    const y = margemTopo + (i * areaUtil) / nivelamentos;
    const valorNivel = Math.round(maxV - (i * maxV) / nivelamentos);
    grade += `<line x1="${margemEsq}" y1="${y.toFixed(1)}" x2="${largura - margemDir}" y2="${y.toFixed(1)}" class="indicador-grade" />`;
    eixoY += `<text x="${margemEsq - 10}" y="${(y + 4).toFixed(1)}" class="indicador-eixo-y" text-anchor="end">${valorNivel.toLocaleString("pt-BR")}</text>`;
  }

  const pontosSvg = coords.map((c, i) => {
    const ultimo = i === coords.length - 1;
    return `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${ultimo ? 6 : 4}" class="indicador-ponto${ultimo ? " atual" : ""}" data-label="${pontos[i].label}" data-valor="${pontos[i].value}" />`;
  }).join("");
  const rotulos = pontos.map((p, i) => `<text x="${coords[i][0].toFixed(1)}" y="${altura - 8}" class="indicador-eixo" text-anchor="middle">${p.label}</text>`).join("");

  svg.setAttribute("viewBox", `0 0 ${largura} ${altura}`);
  svg.innerHTML = grade + eixoY + `<path d="${areaPath}" class="indicador-area"></path>` + `<path d="${linhaPath}" class="indicador-traco"></path>` + pontosSvg + rotulos;

  const tooltip = document.getElementById("indicador-tooltip");
  const wrap = svg.parentElement;

  svg.querySelectorAll(".indicador-ponto").forEach(ponto => {
    ponto.addEventListener("mouseenter", () => {
      const cx = Number(ponto.getAttribute("cx"));
      const cy = Number(ponto.getAttribute("cy"));
      const rect = svg.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const escalaX = rect.width / largura;
      const escalaY = rect.height / altura;
      const valorPonto = Number(ponto.dataset.valor).toLocaleString("pt-BR");

      tooltip.innerHTML = `${ponto.dataset.label}<small>${valorPonto} ${unidadeTooltip || ""}</small>`;
      tooltip.style.left = `${(rect.left - wrapRect.left) + cx * escalaX}px`;
      tooltip.style.top = `${(rect.top - wrapRect.top) + cy * escalaY}px`;
      tooltip.hidden = false;
    });
    ponto.addEventListener("mouseleave", () => {
      tooltip.hidden = true;
    });
  });
}

function renderizarBarrasIndicador(itens) {
  const container = document.getElementById("indicador-barras");
  container.innerHTML = itens.map(item => `
    <div class="indicador-barra-item">
      <span class="indicador-barra-rotulo" title="${item.tituloCompleto || item.rotulo}">${item.rotulo}</span>
      <div class="indicador-barra-trilha"><div class="indicador-barra-preenchida ${item.classe || ""}" style="width:${item.percentual.toFixed(1)}%"></div></div>
      <span class="indicador-barra-valor">${item.valor}</span>
    </div>
  `).join("");
}

function renderizarStatsIndicador(itens) {
  document.getElementById("indicador-stats").innerHTML = itens.map(item => `
    <div class="indicador-stat"><small>${item.rotulo}</small><strong>${item.valor}</strong></div>
  `).join("");
}

function definirCabecalhoIndicador(titulo, valor, unidade, variacaoTexto, negativo) {
  document.getElementById("indicador-titulo").textContent = titulo;
  document.getElementById("indicador-valor").firstChild.textContent = valor;
  document.getElementById("indicador-unidade").textContent = unidade || "";
  const variacao = document.getElementById("indicador-variacao");
  variacao.textContent = variacaoTexto;
  variacao.classList.toggle("negativo", Boolean(negativo));
}

async function renderizarIndicadorSeguranca() {
  const ano = seletor.value;
  let serie;
  try { serie = await obterConflitosPorAno(); }
  catch { definirCabecalhoIndicador("Série indisponível", "—", "", "Tente novamente"); return; }
  if (ano !== seletor.value || !document.querySelector('[data-indicador="seguranca"]').classList.contains("active")) return;
  definirVisibilidadeIndicador(true);

  desenharLinhaIndicador(serie.map(p => ({ label: p.ano, value: p.total })), "países em conflito");

  const ultimo = serie[serie.length - 1];
  const penultimo = serie[serie.length - 2];
  const delta = penultimo ? ultimo.total - penultimo.total : 0;
  const pico = serie.reduce((maior, atual) => (atual.total > maior.total ? atual : maior), serie[0]);

  definirCabecalhoIndicador(
    "Conflitos ativos por ano",
    String(ultimo.total),
    "países",
    penultimo ? `${delta >= 0 ? "+" : ""}${delta} vs ${penultimo.ano}` : "-",
    delta > 0
  );

  renderizarStatsIndicador([
    { rotulo: "Ano mais recente", valor: String(ultimo.ano) },
    { rotulo: "Conflitos no ano", valor: ultimo.total.toLocaleString("pt-BR") },
    { rotulo: "Pico no período", valor: `${pico.total} em ${pico.ano}` },
    { rotulo: "Anos monitorados", valor: serie.length.toLocaleString("pt-BR") }
  ]);
}

function renderizarIndicadorEconomia() {
  definirVisibilidadeIndicador(false);

  const paises = Object.values(countriesByCode).filter(c => typeof c.gdp === "number");
  const ranking = [...paises].sort((a, b) => b.gdp - a.gdp).slice(0, 8);
  const maiorGdp = ranking[0]?.gdp || 1;
  const somaGdp = paises.reduce((soma, c) => soma + c.gdp, 0);

  renderizarBarrasIndicador(ranking.map(c => ({
    rotulo: c.name,
    tituloCompleto: c.name,
    valor: formatarMoedaCompacta(c.gdp),
    percentual: (c.gdp / maiorGdp) * 100
  })));

  definirCabecalhoIndicador("Maiores economias monitoradas", formatarMoedaCompacta(somaGdp), "", `${ranking.length} maiores`);

  renderizarStatsIndicador([
    { rotulo: "PIB global somado", valor: formatarMoedaCompacta(somaGdp) },
    { rotulo: "Maior economia", valor: ranking[0]?.name || "-" },
    { rotulo: "Participação da maior", valor: ranking[0] ? `${((ranking[0].gdp / somaGdp) * 100).toFixed(1)}%` : "-" },
    { rotulo: "Países com dado de PIB", valor: paises.length.toLocaleString("pt-BR") }
  ]);
}

function renderizarIndicadorPopulacao() {
  definirVisibilidadeIndicador(false);

  const paises = Object.values(countriesByCode).filter(c => typeof c.population === "number");
  const ranking = [...paises].sort((a, b) => b.population - a.population).slice(0, 8);
  const maiorPopulacao = ranking[0]?.population || 1;
  const somaPopulacao = paises.reduce((soma, c) => soma + c.population, 0);

  renderizarBarrasIndicador(ranking.map(c => ({
    rotulo: c.name,
    tituloCompleto: c.name,
    valor: formatarNumeroCompacto(c.population),
    percentual: (c.population / maiorPopulacao) * 100,
    classe: "populacao"
  })));

  definirCabecalhoIndicador("Países mais populosos", formatarNumeroCompacto(somaPopulacao), "habitantes", `${ranking.length} maiores`);

  renderizarStatsIndicador([
    { rotulo: "População global", valor: formatarNumeroCompacto(somaPopulacao) },
    { rotulo: "País mais populoso", valor: ranking[0]?.name || "-" },
    { rotulo: "Participação do maior", valor: ranking[0] ? `${((ranking[0].population / somaPopulacao) * 100).toFixed(1)}%` : "-" },
    { rotulo: "Média por país", valor: formatarNumeroCompacto(somaPopulacao / (paises.length || 1)) }
  ]);
}

function renderizarIndicadorMoedas() {
  definirVisibilidadeIndicador(false);

  const contagem = {};
  Object.values(countriesByCode).forEach(c => {
    if (c.currency?.code) {
      contagem[c.currency.code] = (contagem[c.currency.code] || 0) + 1;
    }
  });

  const ranking = Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maiorContagem = ranking[0]?.[1] || 1;

  renderizarBarrasIndicador(ranking.map(([codigo, total]) => ({
    rotulo: codigo,
    tituloCompleto: codigo,
    valor: `${total} países`,
    percentual: (total / maiorContagem) * 100,
    classe: "moedas"
  })));

  const totalMoedas = Object.keys(contagem).length;
  definirCabecalhoIndicador("Moedas mais utilizadas", String(totalMoedas), "moedas distintas", "recursos monetários");

  renderizarStatsIndicador([
    { rotulo: "Moedas distintas", valor: totalMoedas.toLocaleString("pt-BR") },
    { rotulo: "Moeda mais comum", valor: ranking[0]?.[0] || "-" },
    { rotulo: "Países com essa moeda", valor: ranking[0] ? String(ranking[0][1]) : "-" },
    { rotulo: "Total de países", valor: Object.keys(countriesByCode).length.toLocaleString("pt-BR") }
  ]);
}

const RENDERIZADORES_INDICADOR = {
  seguranca: renderizarIndicadorSeguranca,
  economia: renderizarIndicadorEconomia,
  populacao: renderizarIndicadorPopulacao,
  moedas: renderizarIndicadorMoedas
};

function renderizarIndicador(tipo) {
  const renderizador = RENDERIZADORES_INDICADOR[tipo];
  if (renderizador) {
    renderizador();
  }
}

document.querySelectorAll(".indicador-tab").forEach(botao => {
  botao.addEventListener("click", () => {
    document.querySelectorAll(".indicador-tab").forEach(item => {
      item.classList.remove("active");
      item.setAttribute("aria-selected", "false");
    });
    botao.classList.add("active");
    botao.setAttribute("aria-selected", "true");
    renderizarIndicador(botao.dataset.indicador);
  });
});

renderizarIndicador("economia");

// ==========================================================================
// NOTIFICATIONS
// ==========================================================================
const notificationToggle = document.getElementById("notification-toggle");
const notificationPainel = document.getElementById("notificacoes-painel");

function abrirNotificacoes() {
  notificationPainel.hidden = false;
  notificationToggle.setAttribute("aria-expanded", "true");
}

function fecharNotificacoes() {
  notificationPainel.hidden = true;
  notificationToggle.setAttribute("aria-expanded", "false");
}

notificationToggle.addEventListener("click", evento => {
  evento.stopPropagation();
  if (notificationPainel.hidden) {
    abrirNotificacoes();
  } else {
    fecharNotificacoes();
  }
});

notificationPainel.addEventListener("click", evento => evento.stopPropagation());

document.addEventListener("click", () => {
  fecharNotificacoes();
});

document.getElementById("ver-perfil").addEventListener("click", () => {
  document.getElementById("chat-ia").scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("chat-input").focus();
});

// ==========================================================================
// SIDEBAR
// ==========================================================================
const sidebarToggle = document.getElementById("sidebar-toggle");
const backdrop = document.querySelector(".sidebar-backdrop");
const mobileSidebar = window.matchMedia("(max-width: 1000px)");
function sincronizarSidebar() {
  const aberta = mobileSidebar.matches
    ? document.body.classList.contains("sidebar-open")
    : !document.body.classList.contains("sidebar-collapsed");
  sidebarToggle.setAttribute("aria-expanded", String(aberta));
  backdrop.hidden = !(mobileSidebar.matches && aberta);
  atualizarTamanhoMapa(260);
}
sidebarToggle.addEventListener("click", () => {
  document.body.classList.toggle(mobileSidebar.matches ? "sidebar-open" : "sidebar-collapsed");
  sincronizarSidebar();
});
function fecharSidebar() {
  document.body.classList.remove("sidebar-open");
  sincronizarSidebar();
}
backdrop.addEventListener("click", fecharSidebar);
mobileSidebar.addEventListener("change", sincronizarSidebar);
document.querySelectorAll(".sidebar nav a").forEach(link => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".sidebar nav a").forEach(item => {
      item.classList.remove("active");
      item.removeAttribute("aria-current");
    });
    link.classList.add("active");
    link.setAttribute("aria-current", "location");
    fecharSidebar();

    if (link.getAttribute("href") === "#alertas") {
      abrirNotificacoes();
    }

    if (link.dataset.indicadorTab) {
      const tab = document.querySelector(`.indicador-tab[data-indicador="${link.dataset.indicadorTab}"]`);
      if (tab) {
        tab.click();
      }
    }
  });
});

const navConfiguracoes = document.getElementById("nav-configuracoes");
if (navConfiguracoes) {
  navConfiguracoes.addEventListener("click", () => document.getElementById("theme-toggle").click());
}
// ==========================================================================
// MAP UI CONTROLS — tela cheia, atalhos de teclado, status do servidor
// ==========================================================================
const expandir = document.getElementById("map-expand");
function expandirMapa(estado) {
  document.getElementById("mapa").classList.toggle("expanded", estado);
  expandir.setAttribute("aria-pressed", String(estado));
  expandir.setAttribute("aria-label", estado ? "Restaurar mapa" : "Ampliar mapa");
  atualizarTamanhoMapa(30);
}
expandir.addEventListener("click", () => expandirMapa(expandir.getAttribute("aria-pressed") !== "true"));
document.getElementById("map-expand-link").addEventListener("click", () => expandirMapa(expandir.getAttribute("aria-pressed") !== "true"));
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    fecharSidebar();
    expandirMapa(false);
    fecharNotificacoes();
    sidebarToggle.focus();
  }
});
document.getElementById("data-hoje").textContent = new Intl.DateTimeFormat("pt-BR", {dateStyle:"long"}).format(new Date());
fetch(`${API_URL}/api/health`).then(response => {
  if (!response.ok) throw new Error("Conexão indisponível");
  return response.json();
}).then(data => {
  if (data.status !== "ok") throw new Error("Conexão indisponível");
  const status = document.getElementById("system-status");
  status.textContent = "● Servidor conectado";
  status.classList.add("online");
}).catch(() => {
  document.getElementById("system-status").textContent = "Servidor indisponível";
});
sincronizarSidebar();
