// src/app.js

// 1. Grab the HTML elements we need to interact with
const addCardForm = document.getElementById('add-card-form');
const questionInput = document.getElementById('question');
const answerInput = document.getElementById('answer');
const flashcardContainer = document.getElementById('flashcard-container');
const syncBtn = document.getElementById('sync-btn');

// 2. Listen for the form submission
addCardForm.addEventListener('submit', async function(event) {
    event.preventDefault();

    const questionText = questionInput.value.trim();
    const answerText = answerInput.value.trim();
    const newCardId = crypto.randomUUID(); 
    const now = Date.now();

    const newCard = {
        id: newCardId,
        question: questionText,
        answer: answerText,
        last_modified: now,
        deleted: 0
    };

    try {
        await db.flashcards.put(newCard);
        
        await db.changelog.add({
            flashcard_id: newCardId,
            operation: 'CREATE',
            timestamp: now,
            synced: 0
        });

        addCardForm.reset();
        questionInput.focus();
        loadFlashcards();

    } catch (error) {
        console.error("Error saving flashcard:", error);
        alert("There was an error saving your flashcard.");
    }
});

// Function to fetch and display the cards
async function loadFlashcards() {
    try {
        const cards = await db.flashcards.where('deleted').equals(0).toArray();
        flashcardContainer.innerHTML = '';

        if (cards.length === 0) {
            flashcardContainer.innerHTML = '<p class="empty-state">No flashcards yet. Add one above!</p>';
            return; 
        }

        cards.forEach(card => {
            const cardElement = document.createElement('div');
            cardElement.className = 'flashcard'; 
            
            cardElement.innerHTML = `
                <div class="card-content">
                    <p class="question"><strong>Q:</strong> ${card.question}</p>
                    <p class="answer"><strong>A:</strong> ${card.answer}</p>
                </div>
                <button class="delete-btn" onclick="deleteCard('${card.id}')">Delete</button>
            `;
            
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
        await db.flashcards.update(id, { 
            deleted: 1, 
            last_modified: now 
        });
        
        await db.changelog.add({
            flashcard_id: id,
            operation: 'DELETE',
            timestamp: now,
            synced: 0
        });
        
        loadFlashcards();
        
    } catch (error) {
        console.error("Error deleting card:", error);
    }
}

// --- AUTOMATED XAMPP SYNC LOGIC ---

syncBtn.addEventListener('click', async () => {
    syncBtn.innerText = "Syncing...";
    
    try {
        // 1. Gather local changes
        const unsyncedLogs = await db.changelog.where('synced').equals(0).toArray();
        const changedIds = [...new Set(unsyncedLogs.map(log => log.flashcard_id))];
        const cardsToSync = await Promise.all(changedIds.map(id => db.flashcards.get(id)));
        const validCards = cardsToSync.filter(card => card !== undefined);

        // 2. Send changes to XAMPP (PHP)
        const response = await fetch('http://192.168.1.3/flashcards/sync.php', {
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