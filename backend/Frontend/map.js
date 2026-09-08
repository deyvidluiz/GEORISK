const map = L.map("map", {
            maxBounds: [[-90, -180], [90, 180]],
            maxBoundsViscosity: 1.0,
            worldCopyJump: false,
            zoomControl: false
        });

        L.control.zoom({ position: "bottomleft" }).addTo(map);

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            noWrap: true,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);

        map.fitWorld();

        window.addEventListener("load", () => {
            setTimeout(() => {
                map.invalidateSize();
                map.fitWorld();
            }, 250);
        });

        window.addEventListener("resize", () => {
            map.invalidateSize();
        });
