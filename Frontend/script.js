//const map = L.map("map").setView([20, 0], 2);

//L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  //  maxZoom: 19,
    //attribution: "&copy; OpenStreetMap contributors"
//}).addTo(map);

fetch("http://127.0.0.1:5000/api/health") //verifica se o flask esta ativo
    .then(response => response.json())
    .then(data => {
        console.log("Resposta do backend:");
        console.log(data);
    })
    .catch(error => {
        console.error("Erro:", error);
    });

// 1. Busca os dados de cada país
fetch("http://127.0.0.1:5000/api/countries")
  .then(response => response.json())
  .then(countries => {

    // Cria um dicionário pra encontrar mais rápido um país pelo code3
    const countriesByCode = {};
    countries.forEach(country => {
      if (country.code3) countriesByCode[country.code3] = country;
    });

    // 2. Busca as fronteiras e mostra no mapa
    fetch("http://127.0.0.1:5000/api/borders")
      .then(response => response.json())
      .then(geojsonData => {

        L.geoJSON(geojsonData, {
          style: {
            color: "#3388ff",
            weight: 1,
            fillOpacity: 0.15
          },
          onEachFeature: function (feature, layer) {
            const code3 = feature.id; // o arquivo usa o códe3 como id do pais
            const country = countriesByCode[code3];

            layer.on("click", () => {
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
            });

            // destaca o pais ao passar o mouse
            layer.on("mouseover", () => layer.setStyle({ fillOpacity: 0.4 }));
            layer.on("mouseout", () => layer.setStyle({ fillOpacity: 0.15 }));
          }
        }).addTo(map);

      })
      .catch(error => console.error("Erro ao carregar contornos:", error));

  })
  .catch(error => console.error("Erro ao carregar países:", error));