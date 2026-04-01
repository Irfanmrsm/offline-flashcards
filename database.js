const db = new Dexie("flashcards");

db.version(1).stores({
  cards: "id, updated_at",
  meta: "key"
});

async function getLastSync() {
  const data = await db.meta.get("last_sync");
  return data ? data.value : 0;
}

async function setLastSync(ts) {
  await db.meta.put({ key: "last_sync", value: ts });
}