// src/database.js

// 1. Initialize the Local Browser Database
const db = new PouchDB('flashcards_local');

// 2. Initialize the Remote CouchDB Server (from Step 1)
// In production, this would be a secure HTTPS URL without passwords in plain text
const remoteDB = new PouchDB('http://admin:password@127.0.0.1:5984/flashcards_remote');

// 3. Create Indexes so we can query our NoSQL documents easily
async function setupIndexes() {
    await db.createIndex({ index: { fields: ['type'] } });
    await db.createIndex({ index: { fields: ['parent_id'] } });
    await db.createIndex({ index: { fields: ['folder_id'] } });
    await db.createIndex({ index: { fields: ['deck_id'] } });
}
setupIndexes();

// 4. THE SYNC ENGINE
// This one function replaces your entire sync.php file and manual sync buttons.
PouchDB.sync(db, remoteDB, {
    live: true,  // Keep syncing continuously in the background
    retry: true  // If the WiFi drops, keep trying until it comes back
}).on('change', function (info) {
    // This fires automatically whenever new data arrives from the server
    console.log("New data arrived from server!", info);
    
    // Tell the UI to refresh automatically!
    if (typeof loadHub === 'function') loadHub(); 
    if (typeof loadCardsForCurrentDeck === 'function' && currentDeckId) loadCardsForCurrentDeck();
}).on('error', function (err) {
    console.error('Sync Error:', err);
});