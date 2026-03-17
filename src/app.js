// src/app.js

// 1. Grab the HTML elements we need to interact with
const addCardForm = document.getElementById('add-card-form');
const questionInput = document.getElementById('question');
const answerInput = document.getElementById('answer');

// 2. Listen for the form submission
addCardForm.addEventListener('submit', async function(event) {
    // Prevent the page from refreshing (the default HTML form behavior)
    event.preventDefault();

    // Grab the text the user typed
    const questionText = questionInput.value.trim();
    const answerText = answerInput.value.trim();

    // Generate our unique ID and timestamp
    const newCardId = crypto.randomUUID(); 
    const now = Date.now();

    // Create the flashcard object
    const newCard = {
        id: newCardId,
        question: questionText,
        answer: answerText,
        last_modified: now,
        deleted: 0
    };

    try {
        // 3. Save the card to the local database
        await db.flashcards.put(newCard);
        
        // 4. Record the creation in the changelog for future syncing
        await db.changelog.add({
            flashcard_id: newCardId,
            operation: 'CREATE',
            timestamp: now,
            synced: 0 // 0 means false (not synced yet)
        });

        console.log("Flashcard saved successfully!", newCard);

        // 5. UI/UX: Clear the input fields so the user can immediately type another card
        addCardForm.reset();
        
        // Focus the cursor back on the question input
        questionInput.focus();
        loadFlashcards();

    } catch (error) {
        console.error("Error saving flashcard:", error);
        alert("There was an error saving your flashcard.");
    }
});

// Grab the container where the cards will be displayed
const flashcardContainer = document.getElementById('flashcard-container');

// Function to fetch and display the cards
async function loadFlashcards() {
    try {
        // 1. Fetch only the cards that have NOT been deleted (deleted == 0)
        // We use an array so we can loop through them easily
        const cards = await db.flashcards.where('deleted').equals(0).toArray();

        // 2. Clear out the container so we don't get duplicates when refreshing
        flashcardContainer.innerHTML = '';

        // 3. UI/UX: Handle the empty state
        if (cards.length === 0) {
            flashcardContainer.innerHTML = '<p class="empty-state">No flashcards yet. Add one above!</p>';
            return; // Stop running the function here
        }

        // 4. Loop through each card and create HTML elements for it
        cards.forEach(card => {
            // Create a wrapper div for the card
            const cardElement = document.createElement('div');
            cardElement.className = 'flashcard'; 
            
            // Inject the question, answer, and a delete button into the div
            cardElement.innerHTML = `
                <div class="card-content">
                    <p class="question"><strong>Q:</strong> ${card.question}</p>
                    <p class="answer"><strong>A:</strong> ${card.answer}</p>
                </div>
                <button class="delete-btn" onclick="deleteCard('${card.id}')">Delete</button>
            `;
            
            // Add this new card element to the page
            flashcardContainer.appendChild(cardElement);
        });

    } catch (error) {
        console.error("Error loading flashcards:", error);
    }
}

// Call the function immediately when the page loads
loadFlashcards();

// Function to handle soft-deleting a card
async function deleteCard(id) {
    const now = Date.now();
    
    try {
        // 1. Update the existing card to mark it as deleted and update the timestamp
        await db.flashcards.update(id, { 
            deleted: 1, 
            last_modified: now 
        });
        
        // 2. Log the delete operation in the changelog for the sync engine
        await db.changelog.add({
            flashcard_id: id,
            operation: 'DELETE',
            timestamp: now,
            synced: 0
        });
        
        // 3. Instantly refresh the UI to remove the card from view
        loadFlashcards();
        
    } catch (error) {
        console.error("Error deleting card:", error);
    }
}

// --- SYNC LOGIC ---

const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importFileInput = document.getElementById('import-file-input');

// EXPORT: Generate a JSON file of unsynced changes
exportBtn.addEventListener('click', async () => {
    try {
        // 1. Find all logs that haven't been synced yet
        const unsyncedLogs = await db.changelog.where('synced').equals(0).toArray();
        
        if (unsyncedLogs.length === 0) {
            alert("Your database is already fully synced! No new changes to export.");
            return;
        }

        // 2. Extract unique flashcard IDs from those logs
        const changedIds = [...new Set(unsyncedLogs.map(log => log.flashcard_id))];

        // 3. Fetch the actual card data for those IDs
        const cardsToSync = await Promise.all(
            changedIds.map(id => db.flashcards.get(id))
        );

        // Filter out any undefined results (just in case)
        const validCards = cardsToSync.filter(card => card !== undefined);

        // 4. Create the JSON file
        const dataStr = JSON.stringify(validCards, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        // 5. Trigger a download in the browser
        const a = document.createElement('a');
        a.href = url;
        a.download = `flashcards_sync_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        // 6. Update the changelog to mark these as synced
        for (const log of unsyncedLogs) {
            await db.changelog.update(log.log_id, { synced: 1 });
        }

    } catch (error) {
        console.error("Export failed:", error);
        alert("Failed to export changes.");
    }
});


// IMPORT STEP 1: Route the button click to the hidden file input
importBtn.addEventListener('click', () => {
    importFileInput.click(); 
});

// IMPORT STEP 2: Read the file when selected
importFileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const jsonString = e.target.result;
        await processImport(jsonString);
        // Clear the input so the same file can be selected again if needed
        importFileInput.value = ''; 
    };
    reader.readAsText(file);
});


// IMPORT STEP 3: The Last-Write-Wins Conflict Resolution
async function processImport(jsonString) {
    try {
        const incomingCards = JSON.parse(jsonString);
        let updatedCount = 0;

        for (const incoming of incomingCards) {
            const local = await db.flashcards.get(incoming.id);

            // CONFLICT RESOLUTION: Does the incoming card win?
            // It wins if we don't have it locally, OR if its timestamp is newer.
            if (!local || incoming.last_modified > local.last_modified) {
                
                // Overwrite the local record (or insert if new)
                await db.flashcards.put(incoming);
                
                // Record it in the log so our local state tracks it,
                // but mark it as synced = 1 so we don't echo it back to the other device.
                await db.changelog.add({
                    flashcard_id: incoming.id,
                    operation: local ? 'UPDATE' : 'CREATE',
                    timestamp: Date.now(),
                    synced: 1 
                });
                
                updatedCount++;
            }
        }

        alert(`Sync complete! ${updatedCount} cards updated.`);
        loadFlashcards(); // Refresh the UI

    } catch (error) {
        console.error("Import failed:", error);
        alert("Invalid sync file.");
    }
}

// --- NEW AUTOMATED XAMPP SYNC LOGIC ---

const syncBtn = document.getElementById('sync-btn');

syncBtn.addEventListener('click', async () => {
    syncBtn.innerText = "Syncing...";
    
    try {
        // 1. Gather local changes
        const unsyncedLogs = await db.changelog.where('synced').equals(0).toArray();
        const changedIds = [...new Set(unsyncedLogs.map(log => log.flashcard_id))];
        const cardsToSync = await Promise.all(changedIds.map(id => db.flashcards.get(id)));
        const validCards = cardsToSync.filter(card => card !== undefined);

        // 2. Send changes to XAMPP (PHP)
        const response = await fetch('http://localhost/flashcards/sync.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validCards)
        });

        if (!response.ok) throw new Error("Server error");
        
        // 3. Get the latest data back from the server
        const serverCards = await response.json();

        // 4. Update the local IndexedDB with the server's data
        for (const incoming of serverCards) {
            const local = await db.flashcards.get(incoming.id);

            if (!local || incoming.last_modified > local.last_modified) {
                await db.flashcards.put(incoming);
                // Mark as synced so we don't send it back unnecessarily 
                await db.changelog.add({
                    flashcard_id: incoming.id,
                    operation: incoming.deleted ? 'DELETE' : 'UPDATE',
                    timestamp: Date.now(),
                    synced: 1 
                });
            }
        }

        // 5. Mark our original local changes as successfully synced
        for (const log of unsyncedLogs) {
            await db.changelog.update(log.log_id, { synced: 1 });
        }

        loadFlashcards();
        alert("Sync complete!");

    } catch (error) {
        console.error("Sync failed:", error);
        alert("Could not connect to XAMPP server.");
    } finally {
        syncBtn.innerText = "Sync with Server";
    }
});