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

// --- 3. NAVIGATION CONTROLLER ---
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
        if (index < breadcrumbs.length - 1) {
            span.onclick = () => openFolder(crumb.id, crumb.name, index);
            span.innerText += " / ";
        } else {
            span.style.color = "#333"; 
            span.style.textDecoration = "none";
            span.style.cursor = "default";
        }
        breadcrumbTrail.appendChild(span);
    });
}

// --- 4. THE HUB LOGIC ---
async function loadHub() {
    try {
        const folders = await db.folders.where('parent_id').equals(currentFolderId).and(f => f.deleted === 0).toArray();
        const decks = await db.decks.where('folder_id').equals(currentFolderId).and(d => d.deleted === 0).toArray();

        itemGrid.innerHTML = '';
        if (folders.length === 0 && decks.length === 0) {
            hubEmptyState.classList.remove('hidden');
        } else {
            hubEmptyState.classList.add('hidden');
            folders.forEach(folder => {
                const div = document.createElement('div');
                div.className = 'grid-item';
                div.innerHTML = `<div class="folder-icon">📁</div><h3>${folder.name}</h3>`;
                div.onclick = () => openFolder(folder.id, folder.name);
                itemGrid.appendChild(div);
            });
            decks.forEach(deck => {
                const div = document.createElement('div');
                div.className = 'grid-item';
                div.innerHTML = `<div class="folder-icon">🃏</div><h3>${deck.name}</h3>`;
                div.onclick = () => openDeckStudio(deck.id, deck.name);
                itemGrid.appendChild(div);
            });
        }
        renderBreadcrumbs();
        switchView('view-hub');
    } catch (error) {
        console.error("Failed to load hub:", error);
    }
}

function openFolder(folderId, folderName, sliceIndex = null) {
    currentFolderId = folderId;
    if (sliceIndex !== null) {
        breadcrumbs = breadcrumbs.slice(0, sliceIndex + 1);
    } else {
        breadcrumbs.push({ id: folderId, name: folderName });
    }
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
    let dueCount = 0;
    let nextReviewTs = Infinity;

    cards.forEach(card => {
        const reviewDate = card.next_review_date || 0; 
        if (reviewDate <= now) dueCount++; 
        else if (reviewDate < nextReviewTs) nextReviewTs = reviewDate; 
    });

    // Update the UI Dashboard
    document.getElementById('stat-total').innerText = cards.length;
    
    if (deck.session_enabled === 0) {
        document.getElementById('stat-due').innerText = "Paused";
        document.getElementById('stat-next').innerText = "Paused";
    } else {
        document.getElementById('stat-due').innerText = dueCount;
        if (nextReviewTs === Infinity) {
            document.getElementById('stat-next').innerText = "None";
        } else {
            const daysAway = Math.ceil((nextReviewTs - now) / (1000 * 60 * 60 * 24));
            document.getElementById('stat-next').innerText = daysAway === 1 ? "Tomorrow" : `In ${daysAway} days`;
        }
    }

    // --- THIS IS THE VARIABLE JAVASCRIPT WAS MISSING! ---
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
        
        let dueIndicator = "";
        if (deck.session_enabled !== 0) {
            dueIndicator = (card.next_review_date || 0) <= now ? '🔴' : '🟢';
        }

        // Clean up line breaks for the single-line summary
        const summaryText = card.question.replace(/\n/g, ' ');

        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                
                <div style="display: flex; align-items: center; flex-grow: 1; overflow: hidden; cursor: pointer;" onclick="togglePreview('${card.id}')" title="Click to preview full card">
                    <span style="font-size: 1.5rem; color: #ccc; margin-right: 15px; cursor: grab;" title="Drag to reorder">☰</span>
                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 20px;">
                        <span>${dueIndicator} <strong>Q:</strong> ${summaryText}</span>
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
                <div style="margin-top: 15px; font-size: 0.85rem; color: #888;">
                    <em>Current SRS Step: ${card.srs_step || 0} | Next Review: ${card.next_review_date ? new Date(card.next_review_date).toLocaleDateString() : 'Brand New'}</em>
                </div>
            </div>
        `;

        // Drag events
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
    const cards = await db.flashcards.where('deck_id').equals(currentDeckId).and(card => card.deleted === 0).toArray();
    const now = Date.now();
    const dueCards = cards.filter(card => (card.next_review_date || 0) <= now);
    
    if (dueCards.length === 0) return alert("🎉 You are all caught up! No cards due for review right now.");

    // CHECK THE DROPDOWN TO DETERMINE THE SORT ORDER
    const orderStyle = document.getElementById('review-order-select').value;
    
    if (orderStyle === 'mixed') {
        reviewQueue = dueCards.sort(() => Math.random() - 0.5);
    } else if (orderStyle === 'ordered') {
        reviewQueue = dueCards.sort((a, b) => (a.position || 0) - (b.position || 0));
    } else if (orderStyle === 'reverse') {
        reviewQueue = dueCards.sort((a, b) => (b.position || 0) - (a.position || 0));
    }

    currentReviewIndex = 0; 
    sessionCorrect = 0;
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
    const percentComplete = (currentReviewIndex / reviewQueue.length) * 100;
    document.getElementById('focus-progress-bar').value = percentComplete;
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
    const card = reviewQueue[currentReviewIndex];
    const now = Date.now();
    let currentStep = card.srs_step || 0;

    if (isCorrect) {
        sessionCorrect++;
        currentStep = Math.min(currentStep + 1, SRS_INTERVALS.length - 1);
    } else {
        currentStep = 0; 
    }

    const nextSessionDate = now + (SRS_INTERVALS[currentStep] * 24 * 60 * 60 * 1000);
    await db.flashcards.update(card.id, { srs_step: currentStep, next_review_date: nextSessionDate, last_modified: now });
    await db.changelog.add({ entity_id: card.id, entity_type: 'FLASHCARD', operation: 'UPDATE', synced: 0 });
    currentReviewIndex++;
    loadNextCardInQueue();
}

document.getElementById('btn-right').addEventListener('click', (e) => { e.stopPropagation(); scoreCard(true); });
document.getElementById('btn-wrong').addEventListener('click', (e) => { e.stopPropagation(); scoreCard(false); });

async function endSession() {
    await db.sessions.add({ deck_id: currentDeckId, date: Date.now(), total_cards: reviewQueue.length, correct_answers: sessionCorrect });
    alert(`Session Complete! You got ${sessionCorrect} out of ${reviewQueue.length} right.`);
    loadCardsForCurrentDeck(); 
    switchView('view-studio');
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
    try {
        const unsyncedLogs = await db.changelog.where('synced').equals(0).toArray();
        // Expand the sync logic here if needed!
        alert("Ready to sync!");
    } catch (error) {
        console.error("Sync failed:", error);
    } finally {
        syncBtn.innerText = "Sync with Server";
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