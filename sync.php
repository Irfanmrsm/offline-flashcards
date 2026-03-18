<?php
// sync.php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

$conn = new mysqli('localhost', 'root', '', 'flashcard_app');
if ($conn->connect_error) {
    die(json_encode(['success' => false, 'error' => 'Database connection failed']));
}

$jsonInput = file_get_contents('php://input');
$requestData = json_decode($jsonInput, true);

// Extract the payload and the timestamp
$incomingPayload = isset($requestData['payload']) ? $requestData['payload'] : [];
$lastSyncTime = isset($requestData['last_sync']) ? (int)$requestData['last_sync'] : 0;

// --- 1. HANDLE INCOMING (PUSH) ---
if (!empty($incomingPayload)) {
    foreach ($incomingPayload as $item) {
        $id = $item['entity_id'];
        $type = $item['entity_type'];
        $op = $item['operation'];
        $data = $item['data'];

        if ($op === 'DELETE') {
            $table = strtolower($type) . "s";
            $conn->query("UPDATE $table SET deleted = 1, last_modified = " . (time() * 1000) . " WHERE id = '$id'");
            continue;
        }

        if ($type === 'FOLDER') {
            $stmt = $conn->prepare("REPLACE INTO folders (id, parent_id, name, last_modified, deleted) VALUES (?, ?, ?, ?, ?)");
            $stmt->bind_param("sssii", $data['id'], $data['parent_id'], $data['name'], $data['last_modified'], $data['deleted']);
        } else if ($type === 'DECK') {
            $stmt = $conn->prepare("REPLACE INTO decks (id, folder_id, name, next_session_date, srs_step, last_reviewed_date, session_enabled, last_modified, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->bind_param("sssiisiii", $data['id'], $data['folder_id'], $data['name'], $data['next_session_date'], $data['srs_step'], $data['last_reviewed_date'], $data['session_enabled'], $data['last_modified'], $data['deleted']);
        } else if ($type === 'FLASHCARD') {
            $stmt = $conn->prepare("REPLACE INTO flashcards (id, deck_id, question, answer, position, last_modified, deleted) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->bind_param("ssssiii", $data['id'], $data['deck_id'], $data['question'], $data['answer'], $data['position'], $data['last_modified'], $data['deleted']);
        }

        if (isset($stmt)) $stmt->execute();
    }
}

// --- 2. GATHER SERVER STATE (DELTA PULL) ---
// ONLY grab items where the last_modified timestamp is GREATER than the phone's last sync time!
$response = [
    'success' => true,
    'server_state' => [
        'folders' => $conn->query("SELECT * FROM folders WHERE last_modified > $lastSyncTime")->fetch_all(MYSQLI_ASSOC),
        'decks' => $conn->query("SELECT * FROM decks WHERE last_modified > $lastSyncTime")->fetch_all(MYSQLI_ASSOC),
        'flashcards' => $conn->query("SELECT * FROM flashcards WHERE last_modified > $lastSyncTime")->fetch_all(MYSQLI_ASSOC)
    ]
];

echo json_encode($response);
$conn->close();
?>