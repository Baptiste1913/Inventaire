const STORAGE_KEY = "tare-paniettes-v1";
const DEFAULT_BASKETS = [
  { id: crypto.randomUUID(), name: "Petite", tare: 85 },
  { id: crypto.randomUUID(), name: "Moyenne", tare: 120 },
  { id: crypto.randomUUID(), name: "Grande", tare: 175 }
];

const $ = (id) => document.getElementById(id);
let baskets = loadBaskets();
let editingId = null;

function loadBaskets() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed.filter(x => x && typeof x.name === "string" && Number.isFinite(Number(x.tare)));
    }
  } catch (error) { console.warn("Lecture des données impossible", error); }
  return DEFAULT_BASKETS;
}
function saveBaskets() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(baskets));
  renderBaskets();
  calculate();
}
function format(value) { return Math.round(value).toLocaleString("fr-FR"); }

function renderBaskets() {
  const select = $("basketSelect");
  const previous = select.value;
  select.innerHTML = "";
  if (!baskets.length) {
    const option = document.createElement("option");
    option.value = ""; option.textContent = "Ajoute d’abord une paniette";
    select.append(option);
  } else {
    baskets.forEach(b => {
      const option = document.createElement("option");
      option.value = b.id;
      option.textContent = `${b.name} — ${format(Number(b.tare))} g`;
      select.append(option);
    });
    if (baskets.some(b => b.id === previous)) select.value = previous;
  }
  $("basketCount").textContent = `${baskets.length} modèle${baskets.length > 1 ? "s" : ""}`;
  const list = $("basketList");
  list.innerHTML = "";
  if (!baskets.length) {
    const empty = document.createElement("div");
    empty.className = "empty"; empty.textContent = "Aucune paniette enregistrée pour le moment.";
    list.append(empty);
  }
  baskets.forEach(b => {
    const item = document.createElement("div");
    item.className = "basket-item";
    const symbol = document.createElement("div"); symbol.className = "basket-symbol"; symbol.textContent = "🧺";
    const info = document.createElement("div"); info.className = "basket-info";
    const name = document.createElement("strong"); name.textContent = b.name;
    const tare = document.createElement("span"); tare.textContent = `${format(Number(b.tare))} g à vide`;
    info.append(name, tare);
    const actions = document.createElement("div"); actions.className = "item-actions";
    const edit = document.createElement("button"); edit.className = "small-action"; edit.type = "button"; edit.textContent = "Modifier";
    edit.addEventListener("click", () => startEdit(b.id));
    const del = document.createElement("button"); del.className = "small-action delete"; del.type = "button"; del.textContent = "×"; del.setAttribute("aria-label", `Supprimer ${b.name}`);
    del.addEventListener("click", () => removeBasket(b.id));
    actions.append(edit, del); item.append(symbol, info, actions); list.append(item);
  });
}
function calculate() {
  const raw = $("grossWeight").value.trim();
  const gross = raw === "" ? null : Number(raw);
  const selected = baskets.find(b => b.id === $("basketSelect").value);
  const tare = selected ? Number(selected.tare) : null;
  $("grossDisplay").textContent = gross === null || !Number.isFinite(gross) ? "— g" : `${format(gross)} g`;
  $("tareDisplay").textContent = tare === null ? "— g" : `− ${format(tare)} g`;
  $("errorMessage").textContent = "";
  if (gross === null || tare === null) { $("netDisplay").innerHTML = "— <small>g</small>"; return; }
  if (gross < 0) { $("errorMessage").textContent = "Le poids doit être positif."; $("netDisplay").innerHTML = "— <small>g</small>"; return; }
  if (gross < tare) { $("errorMessage").textContent = "Le poids brut est inférieur à la tare de cette paniette."; $("netDisplay").innerHTML = "— <small>g</small>"; return; }
  $("netDisplay").innerHTML = `${format(gross - tare)} <small>g</small>`;
}
function resetCalc() { $("grossWeight").value = ""; calculate(); $("grossWeight").focus(); }
function startEdit(id) {
  const b = baskets.find(x => x.id === id); if (!b) return;
  editingId = id; $("basketName").value = b.name; $("basketTare").value = b.tare;
  $("formTitle").textContent = "Modifier la paniette"; $("saveBasketBtn").textContent = "Enregistrer";
  $("cancelEditBtn").classList.remove("hidden"); $("basketName").focus();
}
function cancelEdit() {
  editingId = null; $("basketForm").reset(); $("formTitle").textContent = "Ajouter une paniette";
  $("saveBasketBtn").textContent = "Ajouter"; $("cancelEditBtn").classList.add("hidden");
}
function removeBasket(id) {
  const b = baskets.find(x => x.id === id); if (!b) return;
  if (!confirm(`Supprimer la paniette « ${b.name} » ?`)) return;
  baskets = baskets.filter(x => x.id !== id);
  if (editingId === id) cancelEdit();
  saveBaskets();
}
$("grossWeight").addEventListener("input", calculate);
$("basketSelect").addEventListener("change", calculate);
$("resetBtn").addEventListener("click", resetCalc);
$("cancelEditBtn").addEventListener("click", cancelEdit);
$("basketForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("basketName").value.trim();
  const tare = Number($("basketTare").value);
  if (!name || !Number.isFinite(tare) || tare < 0) return;
  if (editingId) {
    baskets = baskets.map(b => b.id === editingId ? {...b, name, tare} : b);
  } else {
    baskets.push({id: crypto.randomUUID(), name, tare});
  }
  const savedId = editingId;
  cancelEdit(); saveBaskets();
  if (savedId) $("basketSelect").value = savedId;
  else $("basketSelect").value = baskets[baskets.length - 1]?.id || "";
  calculate();
});
$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({app:"Tare Paniettes",version:1,baskets}, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = "mes-paniettes.json"; a.click(); URL.revokeObjectURL(url);
  $("backupStatus").textContent = "Sauvegarde exportée.";
});
$("importInput").addEventListener("change", async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data.baskets;
    if (!Array.isArray(incoming) || !incoming.every(b => b && typeof b.name === "string" && Number.isFinite(Number(b.tare)) && Number(b.tare) >= 0)) throw new Error("format");
    if (!confirm(`Remplacer tes modèles actuels par les ${incoming.length} modèles de la sauvegarde ?`)) return;
    baskets = incoming.map(b => ({id: crypto.randomUUID(), name:b.name.trim(), tare:Number(b.tare)}));
    saveBaskets(); $("backupStatus").textContent = "Sauvegarde importée.";
  } catch { $("backupStatus").textContent = "Fichier invalide. Choisis une sauvegarde exportée depuis l’application."; }
  event.target.value = "";
});
$("themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("tare-paniettes-theme", document.body.classList.contains("dark") ? "dark" : "light");
});
if (localStorage.getItem("tare-paniettes-theme") === "dark") document.body.classList.add("dark");
renderBaskets(); calculate();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(err => console.warn("Mode hors ligne indisponible", err)));
}
