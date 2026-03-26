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
        span.style.padding = "5px"; 
        span.style.borderRadius = "4px";

        if (index < breadcrumbs.length - 1) {
            span.onclick = () => openFolder(crumb.id, crumb.name, index);
            span.innerText += " / ";
            
            span.addEventListener('dragover', e => { e.preventDefault(); span.style.background = '#e2e8f0'; });
            span.addEventListener('dragleave', e => span.style.background = 'transparent');
            span.addEventListener('drop', async e => {
                e.preventDefault();
                span.style.background = 'transparent';
                await handleDrop(e, crumb.id); 
            });
        } else {
            span.style.color = "#333"; 
            span.style.textDecoration = "none";
            span.style.cursor = "default";
        }
        breadcrumbTrail.appendChild(span);
    });
}

// --- 4. THE HUB LOGIC ---

// Global function so the PouchDB sync listener in database.js can trigger it
window.loadHub = async function() {
    try {
        const allFoldersResult = await db.find({ selector: { type: 'folder', deleted: 0 } });
        const allDecksResult = await db.find({ selector: { type: 'deck', deleted: 0 } });
        
        const allFolders = allFoldersResult.docs;
        const allDecks = allDecksResult.docs;
        const now = Date.now();

        let folderDueCounts = {};
        allDecks.forEach(deck => {
            if (deck.session_enabled !== 0 && (deck.next_session_date || 0) <= now) {
                let currentFid = deck.folder_id;
                while (currentFid && currentFid !== "") {
                    folderDueCounts[currentFid] = (folderDueCounts[currentFid] || 0) + 1;
                    const parentFolder = allFolders.find(f => f._id === currentFid);
                    currentFid = parentFolder ? parentFolder.parent_id : "";
                }
            }
        });

        const folders = allFolders.filter(f => f.parent_id === currentFolderId);
        const decks = allDecks.filter(d => d.folder_id === currentFolderId);

        itemGrid.innerHTML = '';

        const deleteFolderBtn = document.getElementById('delete-folder-btn');
        if (deleteFolderBtn) {
            if (currentFolderId === "") deleteFolderBtn.classList.add('hidden'); 
            else deleteFolderBtn.classList.remove('hidden'); 
        }

        if (folders.length === 0 && decks.length === 0) {
            hubEmptyState.classList.remove('hidden');
        } else {
            hubEmptyState.classList.add('hidden');
            
            folders.forEach(folder => {
                const div = document.createElement('div');
                div.className = 'grid-item';
                div.draggable = true; 
                div.style.position = 'relative'; 

                const dueCount = folderDueCounts[folder._id] || 0;
                const badgeHTML = dueCount > 0 ? `<div style="position: absolute; top: -5px; right: -5px; background: #dc3545; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${dueCount}</div>` : '';

                div.innerHTML = `${badgeHTML}<div class="folder-icon">📁</div><h3>${folder.name}</h3>`;
                div.onclick = () => openFolder(folder._id, folder.name);
                
                attachDragAndDropEvents(div, folder._id, 'folder', allFolders);
                itemGrid.appendChild(div);
            });

            decks.forEach(deck => {
                const div = document.createElement('div');
                div.className = 'grid-item';
                div.draggable = true; 
                div.style.position = 'relative';
                
                const isDue = deck.session_enabled !== 0 && (deck.next_session_date || 0) <= now;
                const dotHTML = isDue ? `<div style="position: absolute; top: 5px; right: 5px; background: #dc3545; border-radius: 50%; width: 12px; height: 12px;"></div>` : '';

                div.innerHTML = `${dotHTML}<div class="folder-icon">🃏</div><h3>${deck.name}</h3>`;
                div.onclick = () => openDeckStudio(deck._id, deck.name);
                
                attachDragAndDropEvents(div, deck._id, 'deck', allFolders);
                itemGrid.appendChild(div);
            });
        }
        renderBreadcrumbs();
        switchView('view-hub');
    } catch (error) {
        console.error("Failed to load hub:", error);
    }
}

function attachDragAndDropEvents(element, id, type, allFolders) {
    element.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ id, type }));
        element.style.opacity = '0.5';
    });
    
    element.addEventListener('dragend', () => element.style.opacity = '1');

    if (type === 'folder') {
        element.addEventListener('dragover', e => {
            e.preventDefault(); 
            element.style.transform = 'scale(1.05)';
            element.style.boxShadow = '0 0 10px rgba(0, 123, 255, 0.5)';
        });
        
        element.addEventListener('dragleave', e => {
            element.style.transform = 'scale(1)';
            element.style.boxShadow = 'none';
        });

        element.addEventListener('drop', async e => {
            e.preventDefault();
            e.stopPropagation(); 
            element.style.transform = 'scale(1)';
            element.style.boxShadow = 'none';
            
            const draggedData = JSON.parse(e.dataTransfer.getData('text/plain'));
            
            if (draggedData.id === id) return; 
            if (draggedData.type === 'folder' && isDescendant(id, draggedData.id, allFolders)) {
                return alert("You cannot move a folder into its own sub-folder!");
            }

            await handleDrop(e, id, draggedData);
        });
    }
}

async function handleDrop(e, targetFolderId, providedData = null) {
    const data = providedData || JSON.parse(e.dataTransfer.getData('text/plain'));
    const now = Date.now();
    
    // Fetch the document to get the _rev token, modify it, and put it back
    const doc = await db.get(data.id);
    doc.last_modified = now;

    if (data.type === 'folder') doc.parent_id = targetFolderId;
    else if (data.type === 'deck') doc.folder_id = targetFolderId;

    await db.put(doc);
    loadHub(); 
}

function isDescendant(targetId, draggedId, allFolders) {
    let currentId = targetId;
    while (currentId && currentId !== "") {
        if (currentId === draggedId) return true;
        const parent = allFolders.find(f => f._id === currentId);
        currentId = parent ? parent.parent_id : "";
    }
    return false;
}

window.goHome = function() {
    breadcrumbs = [{ id: "", name: "Home" }];
    currentFolderId = "";
    loadHub();
}

function openFolder(folderId, folderName, sliceIndex = null) {
    currentFolderId = folderId;
    if (sliceIndex !== null) breadcrumbs = breadcrumbs.slice(0, sliceIndex + 1);
    else breadcrumbs.push({ id: folderId, name: folderName });
    loadHub();
}

document.getElementById('new-folder-btn').addEventListener('click', async () => {
    const name = prompt("Enter folder name:");
    if (!name) return;
    const newFolder = { 
        _id: 'folder:' + crypto.randomUUID(), 
        type: 'folder',
        parent_id: currentFolderId, 
        name: name.trim(), 
        last_modified: Date.now(), 
        deleted: 0 
    };
    await db.put(newFolder);
    loadHub();
});

document.getElementById('new-deck-btn').addEventListener('click', async () => {
    const name = prompt("Enter deck name:");
    if (!name) return;
    const newDeck = { 
        _id: 'deck:' + crypto.randomUUID(), 
        type: 'deck',
        folder_id: currentFolderId, 
        name: name.trim(), 
        next_session_date: 0, 
        session_enabled: 1, 
        last_modified: Date.now(), 
        deleted: 0 
    };
    await db.put(newDeck);
    loadHub();
});

document.getElementById('delete-folder-btn').addEventListener('click', async () => {
    if (!currentFolderId) return;
    if (!confirm("WARNING: Are you sure you want to delete this folder? ALL sub-folders, decks, and flashcards inside it will be permanently deleted!")) return;

    const now = Date.now();

    async function trashFolderContents(targetFolderId) {
        const folder = await db.get(targetFolderId);
        folder.deleted = 1; folder.last_modified = now;
        await db.put(folder);

        const subFolders = await db.find({ selector: { type: 'folder', parent_id: targetFolderId, deleted: 0 } });
        for (const sub of subFolders.docs) await trashFolderContents(sub._id); 

        const decks = await db.find({ selector: { type: 'deck', folder_id: targetFolderId, deleted: 0 } });
        for (const deck of decks.docs) {
            deck.deleted = 1; deck.last_modified = now;
            await db.put(deck);
            
            const cards = await db.find({ selector: { type: 'card', deck_id: deck._id, deleted: 0 } });
            for (const card of cards.docs) {
                card.deleted = 1; card.last_modified = now;
                await db.put(card);
            }
        }
    }

    await trashFolderContents(currentFolderId);

    breadcrumbs.pop();
    currentFolderId = breadcrumbs[breadcrumbs.length - 1].id;
    loadHub();
});

// --- 5. DECK STUDIO LOGIC ---
const cardModal = document.getElementById('card-modal');
const modalQ = document.getElementById('modal-q');
const modalA = document.getElementById('modal-a');
let editingCardId = null;

window.togglePreview = function(cardId) {
    const previewPanel = document.getElementById(`preview-${cardId}`);
    previewPanel.classList.toggle('hidden');
}

async function openDeckStudio(deckId, deckName) {
    currentDeckId = deckId;
    document.getElementById('studio-deck-title').innerText = deckName;
    
    const deck = await db.get(deckId);
    const toggleBtn = document.getElementById('toggle-session-btn');
    if (deck.session_enabled === 0) {
        toggleBtn.innerText = "🔕 Paused";
        toggleBtn.style.background = "#ffeeba"; 
    } else {
        toggleBtn.innerText = "🔔 Active";
        toggleBtn.style.background = "white";
    }

    await loadCardsForCurrentDeck();
    switchView('view-studio');
}

window.loadCardsForCurrentDeck = async function() {
    const cardsResult = await db.find({ selector: { type: 'card', deck_id: currentDeckId, deleted: 0 } });
    const cards = cardsResult.docs;
    const deck = await db.get(currentDeckId); 

    const now = Date.now();
    const nextSessionDate = deck.next_session_date || 0;
    
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
        div.dataset.id = card._id; 
        div.style.cssText = "background: white; padding: 15px; border-radius: 6px; margin-bottom: 10px; border: 1px solid #ddd; display: flex; flex-direction: column; cursor: default;";
        
        const summaryText = card.question.replace(/\n/g, ' ');

        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div style="display: flex; align-items: center; flex-grow: 1; overflow: hidden; cursor: pointer;" onclick="togglePreview('${card._id}')">
                    <span style="font-size: 1.5rem; color: #ccc; margin-right: 15px; cursor: grab;">☰</span>
                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 20px;">
                        <span>🔹 <strong>Q:</strong> ${summaryText}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 5px;">
                    <button class="primary-btn" onclick="editCard('${card._id}')">Edit</button>
                    <button class="danger-btn" onclick="deleteCard('${card._id}')" style="background: #dc3545; color: white;">Delete</button>
                </div>
            </div>
            <div id="preview-${card._id}" class="hidden" style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #ccc; background: #fdfdfd;">
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
        const card = await db.get(editingCardId);
        card.question = qText; card.answer = aText; card.last_modified = now;
        await db.put(card);
    } else {
        await db.put({ 
            _id: 'card:' + crypto.randomUUID(), 
            type: 'card',
            deck_id: currentDeckId, 
            question: qText, 
            answer: aText, 
            position: now, 
            last_modified: now, 
            deleted: 0 
        });
    }
    cardModal.classList.add('hidden');
    loadCardsForCurrentDeck(); 
});

window.editCard = async function(cardId) {
    const card = await db.get(cardId);
    if (!card) return;
    editingCardId = card._id;
    document.getElementById('modal-title').innerText = "Edit Card";
    modalQ.value = card.question; modalA.value = card.answer;
    cardModal.classList.remove('hidden');
    modalQ.focus();
}

window.deleteCard = async function(cardId) {
    if (!confirm("Are you sure you want to delete this card?")) return;
    const card = await db.get(cardId);
    card.deleted = 1; card.last_modified = Date.now();
    await db.put(card);
    loadCardsForCurrentDeck();
}

document.addEventListener('keydown', (event) => {
    if (!cardModal.classList.contains('hidden')) {
        if (event.shiftKey && event.key === 'Enter' && document.activeElement === modalQ) {
            event.preventDefault(); modalA.focus();
        }
        if (event.shiftKey && event.key === 'Backspace' && document.activeElement === modalA) {
            event.preventDefault(); modalQ.focus();
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault(); document.getElementById('modal-save').click();
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
            event.preventDefault(); 
            document.getElementById('modal-save').click();
            setTimeout(() => { document.getElementById('add-card-btn').click(); }, 100);
        }
    }
});

// --- 7. DECK MANAGEMENT ---
document.getElementById('btn-back-hub').addEventListener('click', () => { currentDeckId = null; loadHub(); });

document.getElementById('btn-rename-deck').addEventListener('click', async () => {
    const currentName = document.getElementById('studio-deck-title').innerText;
    const newName = prompt("Enter new deck name:", currentName);
    if (!newName || newName.trim() === currentName) return;
    
    const deck = await db.get(currentDeckId);
    deck.name = newName.trim(); deck.last_modified = Date.now();
    await db.put(deck);
    
    document.getElementById('studio-deck-title').innerText = newName.trim();
});

document.getElementById('btn-delete-deck').addEventListener('click', async () => {
    if (!confirm("WARNING: Are you sure you want to delete this deck and ALL of its cards?")) return;
    const now = Date.now();
    
    const deck = await db.get(currentDeckId);
    deck.deleted = 1; deck.last_modified = now;
    await db.put(deck);
    
    const cardsResult = await db.find({ selector: { type: 'card', deck_id: currentDeckId, deleted: 0 } });
    for (const card of cardsResult.docs) {
        card.deleted = 1; card.last_modified = now;
        await db.put(card);
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
    const cardsResult = await db.find({ selector: { type: 'card', deck_id: currentDeckId, deleted: 0 } });
    const cards = cardsResult.docs;
    
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
    currentReviewIndex++;
    loadNextCardInQueue();
}

document.getElementById('btn-right').addEventListener('click', (e) => { e.stopPropagation(); scoreCard(true); });
document.getElementById('btn-wrong').addEventListener('click', (e) => { e.stopPropagation(); scoreCard(false); });

async function endSession() {
    const now = Date.now();
    await db.put({ 
        _id: 'session:' + crypto.randomUUID(), 
        type: 'session',
        deck_id: currentDeckId, 
        date: now, 
        total_cards: reviewQueue.length, 
        correct_answers: sessionCorrect 
    });
    
    const deck = await db.get(currentDeckId);
    deck.last_reviewed_date = now; deck.last_modified = now;
    await db.put(deck);

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
        const card = await db.get(cardId);
        card.position = currentPosition; card.last_modified = now;
        await db.put(card);
        currentPosition++; 
    }
}

// Start the app!
loadHub();

// --- 11. DECK POWER FEATURES ---
document.getElementById('toggle-session-btn').addEventListener('click', async () => {
    const deck = await db.get(currentDeckId);
    deck.session_enabled = deck.session_enabled === 1 ? 0 : 1;
    deck.last_modified = Date.now();
    await db.put(deck);
    openDeckStudio(currentDeckId, deck.name);
});

document.getElementById('flip-all-btn').addEventListener('click', async () => {
    if (!confirm("Are you sure you want to swap the Questions and Answers for ALL cards in this deck?")) return;

    const cardsResult = await db.find({ selector: { type: 'card', deck_id: currentDeckId } });
    const now = Date.now();

    for (const card of cardsResult.docs) {
        const temp = card.question;
        card.question = card.answer; 
        card.answer = temp; 
        card.last_modified = now;
        await db.put(card);
    }
    loadCardsForCurrentDeck();
});

document.getElementById('session-done-btn').addEventListener('click', async () => {
    const deck = await db.get(currentDeckId);
    const now = Date.now();
    
    let currentStep = deck.srs_step || 0;
    const daysToWait = SRS_INTERVALS[currentStep];
    const nextDate = now + (daysToWait * 24 * 60 * 60 * 1000);
    const nextStep = Math.min(currentStep + 1, SRS_INTERVALS.length - 1);

    deck.srs_step = nextStep;
    deck.next_session_date = nextDate;
    deck.last_modified = now;
    await db.put(deck);
    
    alert(`✅ Session marked as done! Next review is in ${daysToWait} day(s).`);
    openDeckStudio(currentDeckId, deck.name); 
});