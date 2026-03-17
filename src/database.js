// src/database.js

// Initialize a new Dexie database instance
const db = new Dexie('FlashcardSystemDB');

// Define the database schema
// '++' means auto-increment, '&' means unique. 
// We only list the columns we want to search or filter by later.
db.version(1).stores({
    flashcards: '&id, last_modified, deleted',
    changelog: '++log_id, flashcard_id, operation, synced'
});

// Test the connection
db.on('ready', function () {
    console.log("Database is ready and schema is initialized!");
});

// Open the database
db.open().catch(err => {
    console.error("Failed to open db: ", err.stack || err);
});