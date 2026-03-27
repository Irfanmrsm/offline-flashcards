// src/database.js

// 0. Force attach the Find plugin to PouchDB (Fixes the createIndex bug)
if (typeof pouchdbFind !== 'undefined') {
    PouchDB.plugin(pouchdbFind);
}

// 1. Initialize the Local Browser Database
const db = new PouchDB('flashcards_local');

// 2. Initialize the Remote CouchDB Server
// Note: In a real public app, you would never put passwords in plain text here, 
// but this is perfect for your local Docker testing environment!
const remoteDB = new PouchDB('http://admin:password@127.0.0.1:5984/flashcards_remote');

// 3. Create Indexes so we can query our NoSQL documents easily
async function setupIndexes() {
    try {
        await db.createIndex({ index: { fields: ['type'] } });
        await db.createIndex({ index: { fields: ['parent_id'] } });
        await db.createIndex({ index: { fields: ['folder_id'] } });
        await db.createIndex({ index: { fields: ['deck_id'] } });
        console.log("Database indexes verified and ready.");
    } catch (err) {
        console.error("Failed to setup database indexes:", err);
    }
}
setupIndexes();

// 4. THE SYNC ENGINE
// This automatically handles the 2-way data transfer in the background
PouchDB.sync(db, remoteDB, {
    live: true,  // Keep syncing continuously
    retry: true  // If the WiFi drops, keep trying until it reconnects
}).on('change', function (info) {
    // This fires automatically whenever new data arrives from the server
    console.log("Sync activity detected. Updating UI...", info);
    
    // Tell the UI to refresh automatically so the user sees the new data instantly
    if (typeof loadHub === 'function') loadHub(); 
    if (typeof loadCardsForCurrentDeck === 'function' && typeof currentDeckId !== 'undefined' && currentDeckId !== null) {
        loadCardsForCurrentDeck();
    }
}).on('error', function (err) {
    console.error('Database Sync Error:', err);
});