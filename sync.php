<?php
// sync.php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');

// Connect to MySQL
$conn = new mysqli('localhost', 'root', '', 'flashcard_app');
if ($conn->connect_error) {
    die(json_encode(['error' => 'Database connection failed']));
}

// 1. Get the incoming JSON from the browser
$jsonInput = file_get_contents('php://input');
$incomingCards = json_decode($jsonInput, true);

if ($incomingCards) {
    // 2. Process incoming cards (Last Write Wins against the server DB)
    $stmt = $conn->prepare("SELECT last_modified FROM flashcards WHERE id = ?");
    $updateStmt = $conn->prepare("REPLACE INTO flashcards (id, question, answer, last_modified, deleted) VALUES (?, ?, ?, ?, ?)");

    foreach ($incomingCards as $card) {
        $stmt->bind_param("s", $card['id']);
        $stmt->execute();
        $result = $stmt->get_result();
        $serverCard = $result->fetch_assoc();

        // If the server doesn't have it, or the incoming card is newer, save it to MySQL
        if (!$serverCard || $card['last_modified'] > $serverCard['last_modified']) {
            $updateStmt->bind_param("sssii", 
                $card['id'], 
                $card['question'], 
                $card['answer'], 
                $card['last_modified'], 
                $card['deleted']
            );
            $updateStmt->execute();
        }
    }
}

// 3. Send the entire server state back to the browser
// (For a production app, you'd only send changes, but this is perfect for learning)
$result = $conn->query("SELECT * FROM flashcards");
$serverData = [];
while ($row = $result->fetch_assoc()) {
    // Cast numeric strings back to actual numbers for JavaScript
    $row['last_modified'] = (int)$row['last_modified'];
    $row['deleted'] = (int)$row['deleted'];
    $serverData[] = $row;
}

echo json_encode($serverData);
$conn->close();
?>