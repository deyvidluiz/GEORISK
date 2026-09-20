// Uma única instância Leaflet e um único ciclo de atualização de tamanho.
const map = L.map("map", {
  maxBounds: [[-90, -180], [90, 180]],
  maxBoundsViscosity: 1,
  worldCopyJump: false,
  zoomControl: false,
  zoomSnap: 0.25
});
L.control.zoom({ position: "bottomleft" }).addTo(map);
map.fitWorld();
let mapSizeFrame;
function atualizarTamanhoMapa() {
  cancelAnimationFrame(mapSizeFrame);
  mapSizeFrame = requestAnimationFrame(() => {
    map.invalidateSize({ pan: false, animate: false });
  });
}
const mapWrapper = document.querySelector(".map-wrapper");
new ResizeObserver(atualizarTamanhoMapa).observe(mapWrapper);
new IntersectionObserver(entries => {
  if (entries.some(entry => entry.isIntersecting)) atualizarTamanhoMapa();
}).observe(mapWrapper);
window.addEventListener("resize", atualizarTamanhoMapa);
window.addEventListener("load", atualizarTamanhoMapa);
window.addEventListener("pageshow", atualizarTamanhoMapa);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) atualizarTamanhoMapa();
});
document.querySelector(".app-shell").addEventListener("transitionend", atualizarTamanhoMapa);
atualizarTamanhoMapa();
