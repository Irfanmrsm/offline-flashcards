// src/database.js
const db = new Dexie('FlashcardSystemDB');

db.version(3).stores({
    folders: '&id, parent_id, name, last_modified, deleted',
    decks: '&id, folder_id, name, next_session_date, session_enabled, last_modified, deleted',
    flashcards: '&id, deck_id, position, last_modified, deleted',
    sessions: '++session_id, deck_id, date, total_cards, correct_answers',
    changelog: '++log_id, entity_id, entity_type, operation, synced'
});

db.on('ready', function () {
    console.log("Database is ready and schema is initialized!");
});

db.open().catch(err => {
    console.error("Failed to open db: ", err.stack || err);
});