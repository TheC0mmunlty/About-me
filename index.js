// Show the current year in the footer
document.getElementById("year").textContent = new Date().getFullYear();

// Light / dark theme toggle
const root = document.documentElement;
const toggle = document.getElementById("theme-toggle");

toggle.addEventListener("click", () => {
  const isDark = root.getAttribute("data-theme") === "dark";
  root.setAttribute("data-theme", isDark ? "light" : "dark");
});
