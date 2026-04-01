<?php
header("Content-Type: application/json");

$conn = new mysqli("localhost", "root", "", "spaced_repetition");

$data = json_decode(file_get_contents("php://input"), true);

$last_sync = $data["last_sync"];
$cards = $data["cards"];

// SAVE
foreach ($cards as $card) {
    $stmt = $conn->prepare("
        INSERT INTO cards (id, question, answer, updated_at, deleted)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            question=VALUES(question),
            answer=VALUES(answer),
            updated_at=VALUES(updated_at),
            deleted=VALUES(deleted)
    ");
    $stmt->bind_param("sssii",
        $card["id"],
        $card["question"],
        $card["answer"],
        $card["updated_at"],
        $card["deleted"]
    );
    $stmt->execute();
}

// RETURN
$result = $conn->query("SELECT * FROM cards WHERE updated_at > $last_sync");

$output = [];
while ($row = $result->fetch_assoc()) {
    $output[] = $row;
}

echo json_encode(["cards" => $output]);
?>