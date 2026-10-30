import Foundation

/// A coding task's checks, for the Code view: read from the commands it ran (their receipts), never from what the agent says about them. A
/// command Buddy recognizes as tests, a code-style check, a type check, a build or a preview server is a check, with its counts where the
/// tool prints them. The newest receipt of each kind wins; anything else stays a plain command.
enum BuddyCodeChecks {
    static let kinds = ["test", "lint", "types", "build", "preview"]
    static let labels = ["test": "Tests", "lint": "Code style", "types": "Type check", "build": "Build", "preview": "Preview"]

    /// The kind of check a command is, if any. Commands joined with && or ; are read by their last recognized part.
    static func kind(_ code: String) -> String? {
        let c = code.lowercased()
        func has(_ pattern: String) -> Bool { c.range(of: pattern, options: .regularExpression) != nil }
        if has(#"\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|preview|serve)\b|\bastro\s+dev\b|\bnext\s+dev\b|\bvite(\s+dev)?\s*$|\bpython3?\s+-m\s+http\.server\b|\bflask\s+run\b|\buvicorn\b|\brails\s+s(erver)?\b|\bhugo\s+server\b|\bjekyll\s+serve\b"#) { return "preview" }
        if has(#"\b(vitest|jest|mocha|pytest|rspec|phpunit|ava)\b|\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bnode\s+--test\b|\bswift\s+test\b|\bxcodebuild\b.*\btest\b|\bgo\s+test\b|\bcargo\s+test\b|\bpython3?\s+-m\s+(pytest|unittest)\b|\brun-tests\b"#) { return "test" }
        if has(#"\b(tsc|vue-tsc)\b.*--noemit|\bmypy\b|\bpyright\b|\b(npm|pnpm|yarn)\s+(run\s+)?(typecheck|type-check|types|check-types)\b|\bswiftc\b.*-typecheck"#) { return "types" }
        if has(#"\b(eslint|ruff|flake8|pylint|swiftlint|stylelint|rubocop|golangci-lint|prettier\s+--check|black\s+--check)\b|\bbiome\s+(lint|check)\b|\b(npm|pnpm|yarn)\s+(run\s+)?lint\b"#) { return "lint" }
        if has(#"\b(npm|pnpm|yarn|bun)\s+(run\s+)?build\b|\bvite\s+build\b|\bastro\s+build\b|\bnext\s+build\b|\bswift\s+build\b|\bxcodebuild\b|\bcargo\s+build\b|\bgo\s+build\b|\bmake\b|\bbuild\.py\b"#) { return "build" }
        return nil
    }
    private static func first(_ text: String, _ pattern: String) -> [String]? {
        guard let r = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]), let m = r.matches(in: text, range: NSRange(text.startIndex..., in: text)).last else { return nil }
        return (0..<m.numberOfRanges).map { i in Range(m.range(at: i), in: text).map { String(text[$0]) } ?? "" }
    }
    /// Passed and failed tests as the common runners print them, when they do.
    static func testCounts(_ output: String) -> (passed: Int, failed: Int)? {
        let o = output.replacingOccurrences(of: #"\u{1b}\[[0-9;]*m"#, with: "", options: .regularExpression)
        // vitest: "Tests  2 failed | 16 passed (18)" or "Tests  18 passed (18)"
        if let m = first(o, #"Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed"#) { return (Int(m[2]) ?? 0, Int(m[1]) ?? 0) }
        // jest: "Tests:       1 failed, 17 passed, 18 total"
        if let m = first(o, #"Tests:\s+(?:(\d+)\s+failed,\s+)?(\d+)\s+passed"#) { return (Int(m[2]) ?? 0, Int(m[1]) ?? 0) }
        // node --test: "# pass 18" and "# fail 0"
        if let p = first(o, #"#\s*pass\s+(\d+)"#) { return (Int(p[1]) ?? 0, Int(first(o, #"#\s*fail\s+(\d+)"#)?[1] ?? "0") ?? 0) }
        // XCTest / swift test: "Executed 18 tests, with 1 failure"
        if let m = first(o, #"Executed\s+(\d+)\s+tests?,\s+with\s+(\d+)\s+failures?"#) { let all = Int(m[1]) ?? 0, bad = Int(m[2]) ?? 0; return (max(0, all - bad), bad) }
        // cargo: "test result: ok. 18 passed; 0 failed"
        if let m = first(o, #"test result:\s+\w+\.\s+(\d+)\s+passed;\s+(\d+)\s+failed"#) { return (Int(m[1]) ?? 0, Int(m[2]) ?? 0) }
        // pytest: "=== 1 failed, 17 passed in 6.2s ===" or "17 passed in 0.4s"
        if let m = first(o, #"(?:(\d+)\s+failed,\s+)?(\d+)\s+passed(?:,\s+\d+\s+\w+)*\s+in\s+[\d.]+s"#) { return (Int(m[2]) ?? 0, Int(m[1]) ?? 0) }
        if let m = first(o, #"(\d+)\s+failed(?:,\s+\d+\s+\w+)*\s+in\s+[\d.]+s"#) { return (0, Int(m[1]) ?? 0) }
        return nil
    }
    private static func problems(_ output: String, _ pattern: String) -> Int? { first(output, pattern).flatMap { Int($0[1]) } }
    private static func seconds(_ ms: Int?) -> String {
        guard let ms, ms > 0 else { return "" }
        let s = Double(ms) / 1000; return s < 60 ? String(format: "%.1f s", s) : "\(Int(s) / 60) min \(Int(s) % 60) s"
    }

    /// One check per kind, from the newest receipt of that kind, in the order tests, code style, type check, build, preview. `ok` is true or
    /// false once a command finished, and absent while one runs.
    static func read(_ commands: [[String: Any]]) -> [[String: Any]] {
        var newest: [String: [String: Any]] = [:]
        for c in commands {
            guard let code = c["code"] as? String, let kind = kind(code) else { continue }
            newest[kind] = c
        }
        return kinds.compactMap { kind -> [String: Any]? in
            guard let c = newest[kind], let code = c["code"] as? String else { return nil }
            let status = c["status"] as? String ?? "", output = c["output"] as? String ?? "", exit = c["exitCode"] as? Int
            let short = String(code.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80)), took = seconds(c["durationMs"] as? Int)
            var row: [String: Any] = ["kind": kind, "label": labels[kind] ?? kind, "command": short, "at": c["at"] ?? "", "commandId": c["id"] ?? ""]
            if status == "running" {
                if kind == "preview" {
                    let url = first(output, #"(https?://(?:localhost|127\.0\.0\.1)(?::\d+)?[^\s]*)"#)?[1]
                    row["ok"] = true; row["summary"] = "running on this Mac"; row["detail"] = [short, url].compactMap { $0 }.joined(separator: " · ")
                } else { row["summary"] = "running"; row["detail"] = short }
                return row
            }
            let passed = exit == 0 && c["timedOut"] as? Bool != true
            row["ok"] = passed
            switch kind {
            case "test":
                if let n = testCounts(output) { row["summary"] = n.failed == 0 ? (n.passed == 1 ? "1 passes" : "all \(n.passed) pass") : "\(n.failed) of \(n.passed + n.failed) failing"; row["passed"] = n.passed; row["failed"] = n.failed }
                else { row["summary"] = passed ? "pass" : "failing" }
            case "lint":
                let n = problems(output, #"(\d+)\s+problems?"#) ?? problems(output, #"Found\s+(\d+)\s+errors?"#)
                row["summary"] = passed ? "no problems" : n.map { "\($0) problem\($0 == 1 ? "" : "s")" } ?? "problems found"
            case "types":
                let n = problems(output, #"Found\s+(\d+)\s+errors?"#) ?? problems(output, #"(\d+)\s+errors?"#)
                row["summary"] = passed ? "no errors" : n.map { "\($0) error\($0 == 1 ? "" : "s")" } ?? "errors found"
            case "build": row["summary"] = passed ? "builds" : "build failed"
            default: row["summary"] = passed ? "ran" : "stopped"
            }
            row["detail"] = [short, took].filter { !$0.isEmpty }.joined(separator: " · ")
            if c["timedOut"] as? Bool == true { row["summary"] = "timed out" }
            return row
        }
    }
}
