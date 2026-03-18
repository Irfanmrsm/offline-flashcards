// src/app.js

// --- 1. STATE MANAGEMENT ---
let currentFolderId = ""; 
let currentDeckId = null;
let breadcrumbs = [{ id: "", name: "Home" }]; 

// --- 2. DOM ELEMENTS ---
const viewHub = document.getElementById('view-hub');
const viewStudio = document.getElementById('view-studio');
const viewFocus = document.getElementById('view-focus');
const itemGrid = document.getElementById('item-grid');
const hubEmptyState = document.getElementById('hub-empty-state');
const breadcrumbTrail = document.getElementById('breadcrumb-trail');
const syncBtn = document.getElementById('sync-btn'); 

// --- 3. NAVIGATION & BREADCRUMBS ---
function switchView(viewId) {
    viewHub.classList.add('hidden');
    viewStudio.classList.add('hidden');
    viewFocus.classList.add('hidden');
    document.getElementById(viewId).classList.remove('hidden');
}

function renderBreadcrumbs() {
    breadcrumbTrail.innerHTML = '';
    breadcrumbs.forEach((crumb, index) => {
        const span = document.createElement('span');
        span.className = 'crumb';
        span.innerText = crumb.name;
        span.style.padding = "5px"; // Added padding for a better drop target
        span.style.borderRadius = "4px";

        if (index < breadcrumbs.length - 1) {
            span.onclick = () => openFolder(crumb.id, crumb.name, index);
            span.innerText += " / ";
            
            // Allow dropping items onto breadcrumbs to move them "UP" the folder tree
            span.addEventListener('dragover', e => { e.preventDefault(); span.style.background = '#e2e8f0'; });
            span.addEventListener('dragleave', e => span.style.background = 'transparent');
            span.addEventListener('drop', async e => {
                e.preventDefault();
                span.style.background = 'transparent';
                await handleDrop(e, crumb.id); // Move to this breadcrumb's folder
            });
        } else {
            span.style.color = "#333"; 
            span.style.textDecoration = "none";
            span.style.cursor = "default";
        }
        breadcrumbTrail.appendChild(span);
    });
}

// --- 4. THE HUB LOGIC (With Drag-and-Drop & Notifications) ---

async function loadHub() {
    try {
        const allFolders = await db.folders.where('deleted').equals(0).toArray();
        const allDecks = await db.decks.where('deleted').equals(0).toArray();
        const now = Date.now();

        // 1. Calculate Notifications (How many decks are due inside each folder)
        let folderDueCounts = {};
        allDecks.forEach(deck => {
            // Is this deck due?
            if (deck.session_enabled !== 0 && (deck.next_session_date || 0) <= now) {
                let currentFid = deck.folder_id;
                // Propagate the notification up the folder tree
                while (currentFid && currentFid !== "") {
                    folderDueCounts[currentFid] = (folderDueCounts[currentFid] || 0) + 1;
                    const parentFolder = allFolders.find(f => f.id === currentFid);
                    currentFid = parentFolder ? parentFolder.parent_id : "";
                }
            }
        });

        // 2. Filter items just for the current screen
        const folders = allFolders.filter(f => f.parent_id === currentFolderId);
        const decks = allDecks.filter(d => d.folder_id === currentFolderId);

        itemGrid.innerHTML = '';
        if (folders.length === 0 && decks.length === 0) {
            hubEmptyState.classList.remove('hidden');
        } else {
            hubEmptyState.classList.add('hidden');
            
            // RENDER FOLDERS
            folders.forEach(folder => {
                const div = document.createElement('div');
                div.className = 'grid-item';
                div.draggable = true; 
                div.style.position = 'relative'; // Required for the notification badge

                // Check if this folder has due decks inside it
                const dueCount = folderDueCounts[folder.id] || 0;
                const badgeHTML = dueCount > 0 ? `<div style="position: absolute; top: -5px; right: -5px; background: #dc3545; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${dueCount}</div>` : '';

                div.innerHTML = `${badgeHTML}<div class="folder-icon">📁</div><h3>${folder.name}</h3>`;
                div.onclick = () => openFolder(folder.id, folder.name);
                
                attachDragAndDropEvents(div, folder.id, 'folder', allFolders);
                itemGrid.appendChild(div);
            });

            // RENDER DECKS
            decks.forEach(deck => {
                const div = document.createElement('div');
                div.className = 'grid-item';
                div.draggable = true; 
                div.style.position = 'relative';
                
                // Show a simple red dot if the deck itself is due
                const isDue = deck.session_enabled !== 0 && (deck.next_session_date || 0) <= now;
                const dotHTML = isDue ? `<div style="position: absolute; top: 5px; right: 5px; background: #dc3545; border-radius: 50%; width: 12px; height: 12px;"></div>` : '';

                div.innerHTML = `${dotHTML}<div class="folder-icon">🃏</div><h3>${deck.name}</h3>`;
                div.onclick = () => openDeckStudio(deck.id, deck.name);
                
                attachDragAndDropEvents(div, deck.id, 'deck', allFolders);
                itemGrid.appendChild(div);
            });
        }
        renderBreadcrumbs();
        switchView('view-hub');
    } catch (error) {
        console.error("Failed to load hub:", error);
    }
}

// DRAG AND DROP PHYSICS ENGINE FOR THE HUB
function attachDragAndDropEvents(element, id, type, allFolders) {
    // 1. Picking it up
    element.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ id, type }));
        element.style.opacity = '0.5';
    });
    
    element.addEventListener('dragend', () => element.style.opacity = '1');

    // 2. Only FOLDERS can have things dropped INTO them
    if (type === 'folder') {
        element.addEventListener('dragover', e => {
            e.preventDefault(); // Allows dropping
            element.style.transform = 'scale(1.05)';
            element.style.boxShadow = '0 0 10px rgba(0, 123, 255, 0.5)';
        });
        
        element.addEventListener('dragleave', e => {
            element.style.transform = 'scale(1)';
            element.style.boxShadow = 'none';
        });

        element.addEventListener('drop', async e => {
            e.preventDefault();
            e.stopPropagation(); // Stops the drop from bubbling up
            element.style.transform = 'scale(1)';
            element.style.boxShadow = 'none';
            
            const draggedData = JSON.parse(e.dataTransfer.getData('text/plain'));
            
            // Prevent dropping a folder into itself, or a parent into its own child (infinite loop!)
            if (draggedData.id === id) return; 
            if (draggedData.type === 'folder' && isDescendant(id, draggedData.id, allFolders)) {
                return alert("You cannot move a folder into its own sub-folder!");
            }

            await handleDrop(e, id, draggedData);
        });
    }
}

// Executes the database change when an item is dropped
async function handleDrop(e, targetFolderId, providedData = null) {
    const data = providedData || JSON.parse(e.dataTransfer.getData('text/plain'));
    const now = Date.now();

    if (data.type === 'folder') {
        await db.folders.update(data.id, { parent_id: targetFolderId, last_modified: now });
        await db.changelog.add({ entity_id: data.id, entity_type: 'FOLDER', operation: 'UPDATE', synced: 0 });
    } else if (data.type === 'deck') {
        await db.decks.update(data.id, { folder_id: targetFolderId, last_modified: now });
        await db.changelog.add({ entity_id: data.id, entity_type: 'DECK', operation: 'UPDATE', synced: 0 });
    }
    loadHub(); // Refresh the screen instantly
}

// Infinite Loop Protection: Checks if target folder is inside the dragged folder
function isDescendant(targetId, draggedId, allFolders) {
    let currentId = targetId;
    while (currentId && currentId !== "") {
        if (currentId === draggedId) return true;
        const parent = allFolders.find(f => f.id === currentId);
        currentId = parent ? parent.parent_id : "";
    }
    return false;
}

function openFolder(folderId, folderName, sliceIndex = null) {
    currentFolderId = folderId;
    if (sliceIndex !== null) breadcrumbs = breadcrumbs.slice(0, sliceIndex + 1);
    else breadcrumbs.push({ id: folderId, name: folderName });
    loadHub();
}

function goHome() {
    breadcrumbs = [{ id: "", name: "Home" }];
    currentFolderId = "";
    loadHub();
}

document.getElementById('new-folder-btn').addEventListener('click', async () => {
    const name = prompt("Enter folder name:");
    if (!name) return;
    const newFolder = { id: crypto.randomUUID(), parent_id: currentFolderId, name: name.trim(), last_modified: Date.now(), deleted: 0 };
    await db.folders.put(newFolder);
    await db.changelog.add({ entity_id: newFolder.id, entity_type: 'FOLDER', operation: 'CREATE', synced: 0 });
    loadHub();
});

document.getElementById('new-deck-btn').addEventListener('click', async () => {
    const name = prompt("Enter deck name:");
    if (!name) return;
    const newDeck = { id: crypto.randomUUID(), folder_id: currentFolderId, name: name.trim(), next_session_date: 0, session_enabled: 1, last_modified: Date.now(), deleted: 0 };
    await db.decks.put(newDeck);
    await db.changelog.add({ entity_id: newDeck.id, entity_type: 'DECK', operation: 'CREATE', synced: 0 });
    loadHub();
});

// --- 5. DECK STUDIO LOGIC ---
const cardModal = document.getElementById('card-modal');
const modalQ = document.getElementById('modal-q');
const modalA = document.getElementById('modal-a');
let editingCardId = null;

// Toggles the accordion preview panel for a specific card
function togglePreview(cardId) {
    const previewPanel = document.getElementById(`preview-${cardId}`);
    previewPanel.classList.toggle('hidden');
}

async function openDeckStudio(deckId, deckName) {
    currentDeckId = deckId;
    document.getElementById('studio-deck-title').innerText = deckName;
    
    // Check if the deck is paused and update the button UI
    const deck = await db.decks.get(deckId);
    const toggleBtn = document.getElementById('toggle-session-btn');
    if (deck.session_enabled === 0) {
        toggleBtn.innerText = "🔕 Paused";
        toggleBtn.style.background = "#ffeeba"; // Light yellow to indicate it's paused
    } else {
        toggleBtn.innerText = "🔔 Active";
        toggleBtn.style.background = "white";
    }

    await loadCardsForCurrentDeck();
    switchView('view-studio');
}

async function loadCardsForCurrentDeck() {
    const cards = await db.flashcards.where('deck_id').equals(currentDeckId).and(card => card.deleted === 0).toArray();
    const deck = await db.decks.get(currentDeckId); 

    const now = Date.now();
    const nextSessionDate = deck.next_session_date || 0;
    
    // LOGIC: Is it due? AND have they reviewed it since it became due?
    const isDue = now >= nextSessionDate;
    const hasReviewedSinceDue = deck.last_reviewed_date && deck.last_reviewed_date >= nextSessionDate;

    document.getElementById('stat-total').innerText = cards.length;
    const sessionDoneBtn = document.getElementById('session-done-btn');
    
    if (deck.session_enabled === 0) {
        document.getElementById('stat-due').innerText = "Paused";
        document.getElementById('stat-next').innerText = "Paused";
        sessionDoneBtn.disabled = true;
    } else {
        document.getElementById('stat-due').innerText = isDue ? "🔴 Yes" : "🟢 No";
        
        if (isDue) {
            document.getElementById('stat-next').innerText = "Now";
        } else {
            const daysAway = Math.ceil((nextSessionDate - now) / (1000 * 60 * 60 * 24));
            document.getElementById('stat-next').innerText = daysAway === 1 ? "Tomorrow" : `In ${daysAway} days`;
        }

        // BUTTON UNLOCK LOGIC
        if (isDue && hasReviewedSinceDue && cards.length > 0) {
            sessionDoneBtn.disabled = false;
            sessionDoneBtn.title = "Click to log this session and schedule the next one!";
        } else {
            sessionDoneBtn.disabled = true;
            if (!isDue) sessionDoneBtn.title = "Not due yet.";
            else if (!hasReviewedSinceDue) sessionDoneBtn.title = "Review the deck first!";
        }
    }

    const cardList = document.getElementById('card-list');
    cardList.innerHTML = '';
    if (cards.length === 0) {
        cardList.innerHTML = '<p class="empty-state">No cards yet. Click "Add Card" to start!</p>';
        return;
    }

    cards.sort((a, b) => (a.position || 0) - (b.position || 0));

    cards.forEach(card => {
        const div = document.createElement('div');
        div.className = 'card-row draggable-card'; 
        div.draggable = true; 
        div.dataset.id = card.id; 
        div.style.cssText = "background: white; padding: 15px; border-radius: 6px; margin-bottom: 10px; border: 1px solid #ddd; display: flex; flex-direction: column; cursor: default;";
        
        const summaryText = card.question.replace(/\n/g, ' ');

        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div style="display: flex; align-items: center; flex-grow: 1; overflow: hidden; cursor: pointer;" onclick="togglePreview('${card.id}')">
                    <span style="font-size: 1.5rem; color: #ccc; margin-right: 15px; cursor: grab;">☰</span>
                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 20px;">
                        <span>🔹 <strong>Q:</strong> ${summaryText}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button class="primary-btn" onclick="editCard('${card.id}')">Edit</button>
                    <button class="danger-btn" onclick="deleteCard('${card.id}')" style="background: #dc3545; color: white;">Delete</button>
                </div>
            </div>
            <div id="preview-${card.id}" class="hidden" style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #ccc; background: #fdfdfd;">
                <p style="white-space: pre-wrap; margin-bottom: 10px;"><strong>Question:</strong><br>${card.question}</p>
                <p style="white-space: pre-wrap; color: #555;"><strong>Answer:</strong><br>${card.answer}</p>
            </div>
        `;

        div.addEventListener('dragstart', () => { div.style.opacity = '0.4'; div.classList.add('dragging'); });
        div.addEventListener('dragend', () => { div.style.opacity = '1'; div.classList.remove('dragging'); saveCardOrder(); });
        cardList.appendChild(div);
    });
}

// --- 6. MODALS & CARD CRUD ---
document.getElementById('add-card-btn').addEventListener('click', () => {
    editingCardId = null; 
    document.getElementById('modal-title').innerText = "Add New Card";
    modalQ.value = ''; modalA.value = '';
    cardModal.classList.remove('hidden');
    modalQ.focus();
});

document.getElementById('modal-cancel').addEventListener('click', () => { cardModal.classList.add('hidden'); });

document.getElementById('modal-save').addEventListener('click', async () => {
    const qText = modalQ.value.trim();
    const aText = modalA.value.trim();
    if (!qText || !aText) return alert("Both Question and Answer are required!");

    const now = Date.now();
    if (editingCardId) {
        await db.flashcards.update(editingCardId, { question: qText, answer: aText, last_modified: now });
        await db.changelog.add({ entity_id: editingCardId, entity_type: 'FLASHCARD', operation: 'UPDATE', synced: 0 });
    } else {
        const newCardId = crypto.randomUUID();
        await db.flashcards.put({ id: newCardId, deck_id: currentDeckId, question: qText, answer: aText, position: now, last_modified: now, deleted: 0 });
        await db.changelog.add({ entity_id: newCardId, entity_type: 'FLASHCARD', operation: 'CREATE', synced: 0 });
    }
    cardModal.classList.add('hidden');
    loadCardsForCurrentDeck(); 
});

async function editCard(cardId) {
    const card = await db.flashcards.get(cardId);
    if (!card) return;
    editingCardId = card.id;
    document.getElementById('modal-title').innerText = "Edit Card";
    modalQ.value = card.question; modalA.value = card.answer;
    cardModal.classList.remove('hidden');
    modalQ.focus();
}

async function deleteCard(cardId) {
    if (!confirm("Are you sure you want to delete this card?")) return;
    const now = Date.now();
    await db.flashcards.update(cardId, { deleted: 1, last_modified: now });
    await db.changelog.add({ entity_id: cardId, entity_type: 'FLASHCARD', operation: 'DELETE', synced: 0 });
    loadCardsForCurrentDeck();
}

// --- MODAL KEYBOARD SHORTCUTS (Power User Workflow) ---
document.addEventListener('keydown', (event) => {
    // ONLY run these shortcuts if the Add/Edit Modal is actually open on the screen
    if (!cardModal.classList.contains('hidden')) {

        // 1. Shift + Enter -> Jump to Answer box
        if (event.shiftKey && event.key === 'Enter' && document.activeElement === modalQ) {
            event.preventDefault(); // Stops it from creating a new line in the question
            modalA.focus();
        }

        // 2. Shift + Backspace -> Jump back to Question box
        if (event.shiftKey && event.key === 'Backspace' && document.activeElement === modalA) {
            event.preventDefault(); // Stops it from deleting a character
            modalQ.focus();
        }

        // 3. Ctrl + S (or Cmd + S on Mac) -> Save and Close
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault(); // Stops the browser from trying to download the HTML file
            document.getElementById('modal-save').click();
        }

        // 4. Ctrl + N (or Cmd + N on Mac) -> Save and immediately start a New Card
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
            event.preventDefault(); // Stops the browser from opening a new window
            
            // First, click save to store the current card in the database
            document.getElementById('modal-save').click();
            
            // Wait 100 milliseconds for the save to finish, then instantly open a new blank modal
            setTimeout(() => {
                document.getElementById('add-card-btn').click();
            }, 100);
        }
    }
});

// --- 7. DECK MANAGEMENT ---
document.getElementById('btn-back-hub').addEventListener('click', () => { currentDeckId = null; loadHub(); });

document.getElementById('btn-rename-deck').addEventListener('click', async () => {
    const currentName = document.getElementById('studio-deck-title').innerText;
    const newName = prompt("Enter new deck name:", currentName);
    if (!newName || newName.trim() === currentName) return;
    await db.decks.update(currentDeckId, { name: newName.trim(), last_modified: Date.now() });
    await db.changelog.add({ entity_id: currentDeckId, entity_type: 'DECK', operation: 'UPDATE', synced: 0 });
    document.getElementById('studio-deck-title').innerText = newName.trim();
});

document.getElementById('btn-delete-deck').addEventListener('click', async () => {
    if (!confirm("WARNING: Are you sure you want to delete this deck and ALL of its cards?")) return;
    const now = Date.now();
    await db.decks.update(currentDeckId, { deleted: 1, last_modified: now });
    await db.changelog.add({ entity_id: currentDeckId, entity_type: 'DECK', operation: 'DELETE', synced: 0 });
    const cards = await db.flashcards.where('deck_id').equals(currentDeckId).toArray();
    for (const card of cards) {
        await db.flashcards.update(card.id, { deleted: 1, last_modified: now });
        await db.changelog.add({ entity_id: card.id, entity_type: 'FLASHCARD', operation: 'DELETE', synced: 0 });
    }
    currentDeckId = null;
    loadHub();
});

// --- 8. FOCUS MODE (SRS ENGINE) ---
const SRS_INTERVALS = [1, 3, 7, 14, 30, 60, 90, 180, 365];
let reviewQueue = [];
let currentReviewIndex = 0;
let sessionCorrect = 0;
let isFlipped = false;

const activeCard = document.getElementById('active-card');
const cardQuestion = document.getElementById('card-question');
const cardAnswer = document.getElementById('card-answer');
const cardDivider = document.getElementById('card-divider');
const focusControls = document.getElementById('focus-controls');
const flipHint = document.getElementById('flip-hint');
const focusProgress = document.getElementById('focus-progress');

document.getElementById('start-review-btn').addEventListener('click', async () => {
    // 1. Fetch ALL cards, regardless of due date!
    const cards = await db.flashcards.where('deck_id').equals(currentDeckId).and(card => card.deleted === 0).toArray();
    
    if (cards.length === 0) return alert("Add some cards to this deck first!");

    const orderStyle = document.getElementById('review-order-select').value;
    if (orderStyle === 'mixed') reviewQueue = cards.sort(() => Math.random() - 0.5);
    else if (orderStyle === 'ordered') reviewQueue = cards.sort((a, b) => (a.position || 0) - (b.position || 0));
    else if (orderStyle === 'reverse') reviewQueue = cards.sort((a, b) => (b.position || 0) - (a.position || 0));

    currentReviewIndex = 0; sessionCorrect = 0;
    switchView('view-focus');
    loadNextCardInQueue();
});

function loadNextCardInQueue() {
    if (currentReviewIndex >= reviewQueue.length) return endSession();
    isFlipped = false;
    const currentCard = reviewQueue[currentReviewIndex];
    focusProgress.innerText = `Card ${currentReviewIndex + 1} / ${reviewQueue.length}`;
    cardQuestion.innerText = currentCard.question;
    cardAnswer.innerText = currentCard.answer;
    cardAnswer.classList.add('hidden'); cardDivider.classList.add('hidden');
    focusControls.classList.add('hidden'); flipHint.classList.remove('hidden');
    document.getElementById('focus-progress-bar').value = (currentReviewIndex / reviewQueue.length) * 100;
}

function flipCard() {
    if (isFlipped) return; 
    isFlipped = true;
    cardAnswer.classList.remove('hidden'); cardDivider.classList.remove('hidden');
    focusControls.classList.remove('hidden'); flipHint.classList.add('hidden');
}
activeCard.addEventListener('click', flipCard);

async function scoreCard(isCorrect) {
    if (!isFlipped) return; 
    if (isCorrect) sessionCorrect++;
    
    // Notice: NO MORE DATABASE UPDATES HERE! You can review as much as you want.
    currentReviewIndex++;
    loadNextCardInQueue();
}

document.getElementById('btn-right').addEventListener('click', (e) => { e.stopPropagation(); scoreCard(true); });
document.getElementById('btn-wrong').addEventListener('click', (e) => { e.stopPropagation(); scoreCard(false); });

async function endSession() {
    const now = Date.now();
    await db.sessions.add({ deck_id: currentDeckId, date: now, total_cards: reviewQueue.length, correct_answers: sessionCorrect });
    
    // 2. Mark the DECK as having been reviewed today!
    await db.decks.update(currentDeckId, { last_reviewed_date: now, last_modified: now });
    await db.changelog.add({ entity_id: currentDeckId, entity_type: 'DECK', operation: 'UPDATE', synced: 0 });

    alert(`Session Complete! You got ${sessionCorrect} out of ${reviewQueue.length} right.`);
    openDeckStudio(currentDeckId, document.getElementById('studio-deck-title').innerText); 
}
document.getElementById('exit-review-btn').addEventListener('click', endSession);

document.addEventListener('keydown', (event) => {
    if (viewFocus.classList.contains('hidden')) return;
    if (!isFlipped) {
        if (event.code === 'Space') { event.preventDefault(); flipCard(); }
    } else {
        if (event.key === 'w' || event.key === 'W' || event.key === 'ArrowLeft') scoreCard(true);
        else if (event.key === 'n' || event.key === 'N' || event.key === 'ArrowRight') scoreCard(false);
    }
});

// --- 9. LIVE SEARCH ---
document.getElementById('search-cards').addEventListener('input', (event) => {
    const searchTerm = event.target.value.toLowerCase();
    const allCardRows = document.querySelectorAll('#card-list .card-row');
    allCardRows.forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(searchTerm) ? 'flex' : 'none';
    });
});

// --- 10. DRAG AND DROP PHYSICS ---
const cardListContainer = document.getElementById('card-list');
cardListContainer.addEventListener('dragover', e => {
    e.preventDefault(); 
    const afterElement = getDragAfterElement(cardListContainer, e.clientY);
    const draggable = document.querySelector('.dragging');
    if (draggable) {
        if (afterElement == null) cardListContainer.appendChild(draggable);
        else cardListContainer.insertBefore(draggable, afterElement);
    }
});

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.draggable-card:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
        else return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function saveCardOrder() {
    const allCardsOnScreen = document.querySelectorAll('.draggable-card');
    const now = Date.now();
    let currentPosition = 0;
    for (const cardDiv of allCardsOnScreen) {
        const cardId = cardDiv.dataset.id;
        await db.flashcards.update(cardId, { position: currentPosition, last_modified: now });
        await db.changelog.add({ entity_id: cardId, entity_type: 'FLASHCARD', operation: 'UPDATE', synced: 0 });
        currentPosition++; 
    }
}

// --- 11. XAMPP SYNC API ---
syncBtn.addEventListener('click', async () => {
    syncBtn.innerText = "Syncing...";
    syncBtn.disabled = true;

    try {
        const unsyncedLogs = await db.changelog.where('synced').equals(0).toArray();
        const payload = [];

        // 1. Gather upload data
        for (const log of unsyncedLogs) {
            let recordData = null;
            if (log.operation !== 'DELETE') {
                if (log.entity_type === 'FOLDER') recordData = await db.folders.get(log.entity_id);
                if (log.entity_type === 'DECK') recordData = await db.decks.get(log.entity_id);
                if (log.entity_type === 'FLASHCARD') recordData = await db.flashcards.get(log.entity_id);
            }
            payload.push({ log_id: log.log_id, entity_id: log.entity_id, entity_type: log.entity_type, operation: log.operation, data: recordData });
        }

        // 2. Send request to server
        const response = await fetch('https://0lltl173-80.asse.devtunnels.ms/flashcards/sync.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.success) {
            // A. Mark local items as synced
            for (const log of unsyncedLogs) await db.changelog.update(log.log_id, { synced: 1 });

            // B. PROCESS THE PULL (Optimized Parallel Processing)
            const tables = ['folders', 'decks', 'flashcards'];
            let itemsDownloaded = 0;
            
            for (const tableName of tables) {
                const serverItems = result.server_state[tableName];
                
                // Fetch all local items in ONE massive request
                const serverItemIds = serverItems.map(item => item.id);
                const localItemsArray = await db[tableName].where('id').anyOf(serverItemIds).toArray();
                
                // Convert array to a dictionary for instant lookups
                const localItemsMap = {};
                localItemsArray.forEach(item => localItemsMap[item.id] = item);

                // Figure out exactly which items need to be updated
                const itemsToUpdate = [];
                for (const serverItem of serverItems) {
                    const localItem = localItemsMap[serverItem.id];
                    if (!localItem || serverItem.last_modified > localItem.last_modified) {
                        itemsToUpdate.push(serverItem);
                    }
                }

                // Save them all to the database at the exact same time
                if (itemsToUpdate.length > 0) {
                    await db[tableName].bulkPut(itemsToUpdate);
                    itemsDownloaded += itemsToUpdate.length;
                }
            }

            // C. Final Alert
            if (unsyncedLogs.length === 0 && itemsDownloaded === 0) {
                 alert("✅ Everything is already up to date!");
            } else {
                 alert(`🎉 Sync Complete! Uploaded ${unsyncedLogs.length} changes and downloaded ${itemsDownloaded} updates.`);
            }
            loadHub(); 
        }
    } catch (error) {
        alert("❌ Sync failed. Make sure XAMPP is running!");
    } finally {
        syncBtn.innerText = "Sync with Server";
        syncBtn.disabled = false;
    }
});

// Start the app!
loadHub();

// --- 12. DECK POWER FEATURES (Toggle Session & Bulk Swap) ---

// Feature: Pause/Resume Sessions
document.getElementById('toggle-session-btn').addEventListener('click', async () => {
    const deck = await db.decks.get(currentDeckId);
    
    // Swap between 1 (Active) and 0 (Paused)
    const newState = deck.session_enabled === 1 ? 0 : 1;

    await db.decks.update(currentDeckId, {
        session_enabled: newState,
        last_modified: Date.now()
    });
    
    // Log it for the XAMPP sync
    await db.changelog.add({ entity_id: currentDeckId, entity_type: 'DECK', operation: 'UPDATE', synced: 0 });

    // Instantly reopen the studio to refresh the UI
    openDeckStudio(currentDeckId, deck.name);
});

// Feature: Swap Questions and Answers Bulk
document.getElementById('flip-all-btn').addEventListener('click', async () => {
    if (!confirm("Are you sure you want to swap the Questions and Answers for ALL cards in this deck?")) return;

    const cards = await db.flashcards.where('deck_id').equals(currentDeckId).toArray();
    const now = Date.now();

    for (const card of cards) {
        await db.flashcards.update(card.id, {
            question: card.answer, // Swap them
            answer: card.question, // Swap them
            last_modified: now
        });
        await db.changelog.add({ entity_id: card.id, entity_type: 'FLASHCARD', operation: 'UPDATE', synced: 0 });
    }

    // Refresh the screen
    loadCardsForCurrentDeck();
});

// --- 13. SESSION DONE LOGIC ---
document.getElementById('session-done-btn').addEventListener('click', async () => {
    const deck = await db.decks.get(currentDeckId);
    const now = Date.now();
    
    // Figure out what step the deck is on
    let currentStep = deck.srs_step || 0;
    
    // Calculate next date based on the interval
    const daysToWait = SRS_INTERVALS[currentStep];
    const nextDate = now + (daysToWait * 24 * 60 * 60 * 1000);
    
    // Move up one step for next time
    const nextStep = Math.min(currentStep + 1, SRS_INTERVALS.length - 1);

    await db.decks.update(currentDeckId, {
        srs_step: nextStep,
        next_session_date: nextDate,
        last_modified: now
    });
    
    await db.changelog.add({ entity_id: currentDeckId, entity_type: 'DECK', operation: 'UPDATE', synced: 0 });

    alert(`✅ Session marked as done! Next review is in ${daysToWait} day(s).`);
    openDeckStudio(currentDeckId, deck.name); // Refresh UI
});