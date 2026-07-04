const map = L.map("map").setView([20, 0], 2);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

fetch("http://127.0.0.1:5000/api/health") //verifica se o flask esta ativo
    .then(response => response.json())
    .then(data => {
        console.log("Resposta do backend:");
        console.log(data);
    })
    .catch(error => {
        console.error("Erro:", error);
    });

fetch("http://127.0.0.1:5000/api/countries")
    .then(response => response.json())
    .then(countries => {
      countries.forEach(country => {
        if (!country.latlng || country.latlng.length !== 2) return; // pula país sem coordenadas válidas

        const marker = L.marker(country.latlng).addTo(map);
        marker.on("click", () => {

            document.getElementById("nome-pais").textContent = country.name;

            document.getElementById("capital").textContent = country.capital;

            document.getElementById("regiao").textContent = country.region;

            document.getElementById("populacao").textContent =
                country.population ? country.population.toLocaleString("pt-BR") : "Dado não disponível";

            document.getElementById("codigo").textContent = country.code;

        });
      });
    })
    .catch(error => {
      console.error("Erro ao carregar países:", error);
    });
