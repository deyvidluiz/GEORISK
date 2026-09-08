(() => {
  const root = document.documentElement;
  let savedTheme;
  try {
    savedTheme = localStorage.getItem("georisk-theme");
  } catch { /* O tema continua funcionando quando o armazenamento está bloqueado. */ }
  root.dataset.theme = savedTheme === "dark" ? "dark" : "light";

  document.addEventListener("DOMContentLoaded", () => {
    const button = document.getElementById("theme-toggle");
    const label = document.getElementById("theme-label");
    function updateButton() {
      const dark = root.dataset.theme === "dark";
      const text = dark ? "Tema claro" : "Tema escuro";
      label.textContent = text;
      button.setAttribute("aria-label", "Tema escuro");
      button.setAttribute("aria-pressed", String(dark));
      button.title = "Ativar " + text.toLowerCase();
    }
    button.addEventListener("click", () => {
      root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("georisk-theme", root.dataset.theme);
      } catch { /* A preferência vale para a sessão atual. */ }
      updateButton();
    });
    updateButton();
  });
})();
