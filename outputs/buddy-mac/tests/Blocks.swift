import Foundation

// Reply blocks: Buddy checks what an agent asks it to show, fixes what it can, says only what it couldn't, and never lets a block ask for a
// secret or count an agent's own words as the person's.
@main struct BlockTests {
    static func require(_ value: Bool, _ message: String) { if !value { fputs("FAILED: \(message)\n", stderr); exit(1) } }
    @MainActor static func main() throws {
        let fm = FileManager.default, support = fm.temporaryDirectory.appendingPathComponent("buddy-blocks-test-" + UUID().uuidString)
        try fm.createDirectory(at: support, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: support) }
        let files = BuddyProjectFiles(support: support), workspace = UUID().uuidString, scope = try files.scope(workspace)
        _ = try files.write(scope, path: "results/summary.md", content: "# Summary\n", expectedVersion: "", actor: "scout", actorName: "Scout")
        let place = BuddyBlocks.Place(files: files, scope: scope, actor: "scout", actorName: "Scout")
        require(JSONSerialization.isValidJSONObject(BuddyBlocks.tool), "the tool definition is valid JSON")

        // Types, ids and plain text.
        var checked = BuddyBlocks.check(["blocks": [["type": "carousel"], ["type": "stats", "title": "Line one\nline <b>two</b>\u{0007}", "numbers": [["label": "Done", "value": 21]]], ["type": "stats", "id": "Week Summary!", "numbers": [["label": "A", "value": 1]]], ["type": "stats", "id": "week-summary", "numbers": [["label": "B", "value": "2"]]]]], from: "scout", place: place, taken: ["stats2"])
        require(checked.blocks.count == 3 && checked.notes.contains { $0.contains("no “carousel” block") }, "an unknown type is left out and named")
        require(checked.blocks.map { $0["id"] as? String ?? "" } == ["stats2-2", "week-summary", "week-summary-2"], "ids are made, cleaned and kept unique within the reply")
        require(checked.blocks[0]["title"] as? String == "Line one line <b>two</b>", "strings are one line of plain text; markup stays text for the page to escape")
        require(checked.blocks.allSatisfy { $0["from"] as? String == "scout" }, "each block says which agent showed it")

        // Tables: kinds, cells, and a long table saved whole.
        let rows: [[Any]] = (1...250).map { ["row \($0)", "\($0),000", $0 % 2 == 0, "12.5%", "results/summary.md"] }
        checked = BuddyBlocks.check(["blocks": [["type": "table", "title": "Monthly files", "columns": [["label": "Name", "kind": "text"], ["label": "Rows", "kind": "number"], ["label": "Done", "kind": "sparkle"], ["label": "Missing", "kind": "percent"], ["label": "File", "kind": "file"]], "rows": rows]]], from: "scout", place: place, now: Date(timeIntervalSince1970: 1_793_300_000))
        let table = checked.blocks.first ?? [:]
        require((table["columns"] as? [[String: Any]])?[2]["kind"] as? String == "text", "an unknown column kind is shown as text")
        let first = (table["rows"] as? [[Any]])?.first ?? []
        require((first[1] as? NSNumber)?.doubleValue == 1000 && first[2] as? String == "No" && abs(((first[3] as? NSNumber)?.doubleValue ?? 0) - 0.125) < 0.0001, "numbers, yes/no and percents are read from what the agent wrote")
        require((first[4] as? [String: Any])?["folderId"] as? String == scope.folderId, "a file cell in a connected folder can be opened")
        require((table["rows"] as? [[Any]])?.count == 200 && table["total"] as? Int == 250, "a long table shows 200 rows and says how many there are")
        let saved = (table["savedAs"] as? [String: Any])?["path"] as? String ?? ""
        require(saved.hasPrefix("Buddy tables/Monthly files ") && saved.hasSuffix(".xlsx") && checked.files.count == 1, "the whole table is saved as an Excel file in the project")
        let workbook = try files.read(scope, path: saved), listedCells = (workbook["sheets"] as? [[String: Any]])?.first?["cells"] as? [[String: Any]] ?? []
        let sheet = Dictionary(listedCells.map { ($0["cell"] as? String ?? "", "\($0["value"] ?? "")") }, uniquingKeysWith: { a, _ in a })
        require(workbook["format"] as? String == "xlsx" && sheet["A1"] == "Name" && sheet["A251"] == "row 250" && sheet["B251"] == "250000", "the saved workbook has the header and every row")
        require(checked.notes.contains { $0.contains("showing 200 of 250 rows") && $0.contains(saved) }, "the agent hears where the whole table went")
        checked = BuddyBlocks.check(["blocks": [["type": "table", "rows": rows]]], from: "scout", place: nil)
        require(checked.files.isEmpty && checked.notes.contains { $0.contains("showing the first 200 of 250 rows") } && ((checked.blocks.first?["columns"] as? [Any])?.count ?? 0) == 5, "without file access the table is cut, not saved, and columns are named for it")
        checked = BuddyBlocks.check(["blocks": [["type": "table", "columns": [["label": "A"]], "rows": []]]], from: "scout", place: place)
        require(checked.blocks.isEmpty && checked.notes.contains { $0.contains("needs columns and at least one row") }, "an empty table isn't shown")

        // Charts, key numbers, comparisons, timelines.
        checked = BuddyBlocks.check(["blocks": [["type": "chart", "labels": ["Mon", "Tue", "Wed"], "series": [["name": "Tasks", "values": [3, "five", 2, 9]]]], ["type": "chart", "labels": ["Mon"], "series": [["name": "x", "values": ["a"]]]], ["type": "stats", "numbers": [["label": "a", "value": 1], ["label": "b", "value": 2], ["label": "c", "value": 3], ["label": "d", "value": 4], ["label": "e", "value": 5]]]]], from: "scout", place: place)
        let values = ((checked.blocks.first?["series"] as? [[String: Any]])?.first?["values"] as? [Any]) ?? []
        require(values.count == 3 && values[1] is NSNull && checked.blocks.first?["kind"] as? String == "bar", "a chart's values line up with its labels; what isn't a number is a gap")
        require(checked.blocks.count == 2 && (checked.blocks[1]["numbers"] as? [Any])?.count == 4, "a chart with no numbers isn't shown; key numbers keep four")
        checked = BuddyBlocks.check(["blocks": [["type": "compare", "options": [["id": "a", "label": "Only one"]]], ["type": "compare", "pick": "ghost", "options": [["id": "mac", "label": "On this Mac", "facts": [["label": "Cost", "value": "$0"]]], ["id": "gpu", "label": "Rented machine", "facts": [["label": "Cost", "value": 1.8]]]]], ["type": "timeline", "events": [["date": "2026-10-31", "title": "Cover letter", "state": "next"], ["title": "No date"]]]]], from: "scout", place: place)
        require(checked.blocks.count == 2 && checked.notes.contains { $0.contains("needs at least two options") }, "a comparison of one isn't shown")
        require(checked.blocks[0]["pick"] == nil && ((checked.blocks[0]["options"] as? [[String: Any]])?[1]["facts"] as? [[String: Any]])?.first?["label"] as? String == "Cost", "an unknown pick is dropped and facts are kept")
        require((checked.blocks[1]["events"] as? [Any])?.count == 1, "a dated event needs a date and a title")

        // Files: only files in connected folders, and no asking about places on the Mac.
        checked = BuddyBlocks.check(["blocks": [["type": "files", "files": [["path": "results/summary.md", "note": "The write-up"], ["path": "results/old-run.csv"], ["path": "/Users/someone/Desktop/paper.pdf"]]]]], from: "scout", place: place)
        let listed = checked.blocks.first?["files"] as? [[String: Any]] ?? []
        require(listed.count == 3 && listed[0]["folderId"] as? String == scope.folderId && listed[0]["bytes"] as? Int == 10, "a file in a connected folder carries its folder and size")
        require(listed[1]["missing"] as? Bool == true && listed[2]["missing"] as? Bool == true, "a missing file and a path on the Mac show as not found")
        require(checked.notes.contains { $0.contains("2 of 3 files aren't in a connected folder") && $0.contains("old-run.csv") && $0.contains("paper.pdf") }, "the agent hears which files couldn't be shown")

        // Ask blocks.
        checked = BuddyBlocks.check(["blocks": [["type": "choice", "title": "Which chart style?", "recommend": ["line", "ghost"], "options": [["id": "line", "label": "A line per mix"], ["id": "bars", "label": "Bars by year"], ["label": "Both"]]], ["type": "choice", "options": [["label": "Only"]]]]], from: "scout", place: place)
        let choice = checked.blocks.first ?? [:]
        require(choice["question"] as? String == "Which chart style?" && choice["recommend"] as? [String] == ["line"] && (choice["options"] as? [[String: Any]])?[2]["id"] as? String == "both", "a choice takes its title as the question, keeps known suggestions and names its options")
        require(choice["submit"] as? String == "Send" && checked.blocks.count == 1, "a choice gets a Send button; one option isn't a choice")
        checked = BuddyBlocks.check(["blocks": [["type": "form", "title": "Weekly summary", "fields": [["id": "day", "label": "Day", "kind": "select", "options": ["Monday", "Friday"]], ["id": "where", "label": "Where it goes", "kind": "select"], ["id": "pw", "label": "Your password", "kind": "text"], ["id": "code", "label": "Code", "kind": "text", "placeholder": "6-digit verification code"], ["id": "pin", "label": "PIN", "kind": "number"], ["id": "day", "label": "Second day", "kind": "date"], ["id": "on", "label": "Include charts", "kind": "toggle", "value": true]]], ["type": "form", "fields": [["label": "Card number", "kind": "text"]]]]], from: "scout", place: place)
        let fields = checked.blocks.first?["fields"] as? [[String: Any]] ?? []
        require(fields.map { $0["id"] as? String ?? "" } == ["day", "where", "day-2", "on"], "secret fields are removed and ids stay unique")
        require(fields[1]["kind"] as? String == "text" && fields[3]["value"] as? Bool == true, "a list with nothing to pick becomes text; a toggle keeps its value")
        require(checked.blocks.count == 1 && checked.notes.contains { $0.contains("“Your password”") && $0.contains("“PIN”") && $0.contains("Forms can't ask for passwords") } && checked.notes.contains { $0.contains("has no fields Buddy can show") }, "a form asking only for a secret isn't shown, and the agent hears why")
        require(!BuddyBlocks.secret("Pinterest board") && !BuddyBlocks.secret("Time of day") && BuddyBlocks.secret("API key") && BuddyBlocks.secret("One-time code"), "only secret-looking fields are refused")
        checked = BuddyBlocks.check(["blocks": [["type": "checklist", "title": "Which files?", "checks": [["label": "drawdowns.xlsx", "checked": true], ["label": "drawdowns.xlsx"]]]]], from: "scout", place: place)
        require((checked.blocks.first?["checks"] as? [[String: Any]])?.map { $0["id"] as? String ?? "" } == ["drawdowns-xlsx", "drawdowns-xlsx-2"], "checklist items get unique ids")
        let result = BuddyBlocks.modelResult(checked)
        require(result["shown"] as? Int == 1 && (result["answers"] as? String ?? "").contains("next message"), "the agent hears that the answer comes as the next message")

        // Answers: only what the person typed counts as their words.
        require(BuddyBlocks.typedText(["text": "Hoover St."]) == nil, "an ordinary message is not a block answer")
        require(BuddyBlocks.typedText(["text": "The person answered your block…", "answer": ["block": "viewing", "typed": "after 5pm"]]) == "after 5pm", "a block answer's own words are only what was typed")
        require(BuddyConversationHistory.blocksLine([["type": "choice", "id": "viewing", "question": "Which should I ask about?"], ["type": "chart", "id": "week"]]) == "[Blocks shown: choice viewing “Which should I ask about?”; chart week]", "history says what a reply showed")
        let state: [String: Any] = ["messages": ["lyra": [["id": "m1", "who": "lyra", "live": true, "status": "completed", "body": "Four fit.", "blocks": [["type": "choice", "id": "viewing", "question": "Which should I ask about?"]]], ["id": "m2", "who": "you", "live": true, "body": "Answer to “Which should I ask about?”: Hoover St. duplex"]]], "runs": [String: Any]()]
        require(BuddyConversationHistory.context(state, target: "lyra", runId: "r2").contains("Agent: Four fit.\n[Blocks shown: choice viewing “Which should I ask about?”]\n\nYou: Answer to"), "the next turn's history carries what was shown and what was answered")
        print("PASS: reply blocks are checked, fixed, saved and never ask for secrets")
    }
}
