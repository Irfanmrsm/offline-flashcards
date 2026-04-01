let isConnected = false;

// ================== UI ==================
function updateConnectionUI() {
  const status = document.getElementById("connection-status");
  const syncBtn = document.getElementById("sync-btn");

  if (isConnected) {
    status.innerText = "🟢 Connected";
    syncBtn.disabled = false;
    syncBtn.classList.add("connected");
    syncBtn.classList.remove("disconnected");
  } else {
    status.innerText = "🔴 Offline";
    syncBtn.disabled = true;
    syncBtn.classList.add("disconnected");
    syncBtn.classList.remove("connected");
  }
}

// ================== CONNECT ==================
async function connectServer() {
  const status = document.getElementById("connection-status");
  status.innerText = "🟡 Connecting...";

  try {
    const res = await fetch("http://localhost/sync.php");
    isConnected = res.ok;
  } catch {
    isConnected = false;
  }

  updateConnectionUI();
}

// ================== ADD CARD ==================
async function addCard() {
  const question = prompt("Question:");
  const answer = prompt("Answer:");

  await db.cards.put({
    id: crypto.randomUUID(),
    question,
    answer,
    updated_at: Date.now(),
    deleted: 0
  });

  loadCards();
}

// ================== LOAD ==================
async function loadCards() {
  const cards = await db.cards.toArray();
  const container = document.getElementById("cards");
  container.innerHTML = "";

  cards.forEach(c => {
    if (c.deleted) return;

    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<b>Q:</b> ${c.question}<br><b>A:</b> ${c.answer}`;
    container.appendChild(div);
  });
}

// ================== SYNC ==================
async function sync() {
  if (!isConnected) {
    alert("Not connected!");
    return;
  }

  const lastSync = await getLastSync();

  const localCards = await db.cards
    .where("updated_at")
    .above(lastSync)
    .limit(500)
    .toArray();

  const res = await fetch("http://localhost/sync.php", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      last_sync: lastSync,
      cards: localCards
    })
  });

  const data = await res.json();

  await db.cards.bulkPut(data.cards);

  await setLastSync(Date.now());

  loadCards();
}

// ================== AUTO ==================
setInterval(connectServer, 10000);
setInterval(() => {
  if (isConnected) sync();
}, 30000);

// ================== SERVICE WORKER ==================
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}

// ================== START ==================
connectServer();
loadCards();