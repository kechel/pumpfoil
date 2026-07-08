// Theme früh anwenden (kein Flash). Default = auto (folgt System).
// Ausgelagert aus index.html, damit die CSP ohne Inline-Skript auskommt (script-src 'self').
(function () {
  try {
    var t = localStorage.getItem("theme");
    var mode = t === "light" || t === "dark" ? t : "auto";
    var systemLight = window.matchMedia &&
      !window.matchMedia("(prefers-color-scheme: dark)").matches;
    var light = mode === "light" || (mode === "auto" && systemLight);
    if (light) {
      document.documentElement.classList.add("theme-light");
    }
  } catch (e) {}
})();
