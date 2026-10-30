// run-tests: BuddyCodeHistory.swift BuddyCodeChecks.swift
import Foundation

/// The Code view's records: a coding task's history kept beside its project, its steps with lines, one file's change, the copy compared with
/// the person's folder (as it is, combined, or clashing), bringing work in only as chosen, clashes marked for the agent, and checks read from
/// the commands it ran.
@main struct CodeHistoryTests {
    static func require(_ value: Bool, _ message: String) { if !value { fputs("FAILED: \(message)\n", stderr); exit(1) } }
    static func main() throws {
        let fm = FileManager.default, root = fm.temporaryDirectory.appendingPathComponent("buddy-code-test-" + UUID().uuidString)
        defer { try? fm.removeItem(at: root) }
        let project = root.appendingPathComponent("Tasks/T1/Files", isDirectory: true), folder = root.appendingPathComponent("portfolio-site", isDirectory: true)
        try fm.createDirectory(at: project, withIntermediateDirectories: true); try fm.createDirectory(at: folder.appendingPathComponent("src"), withIntermediateDirectories: true)
        func put(_ base: URL, _ path: String, _ text: String) throws { let url = base.appendingPathComponent(path); try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true); try Data(text.utf8).write(to: url) }
        func get(_ base: URL, _ path: String) -> String? { (try? Data(contentsOf: base.appendingPathComponent(path))).map { String(decoding: $0, as: UTF8.self) } }
        let read: (String, String) -> Data? = { id, path in id == "f1" ? try? Data(contentsOf: folder.appendingPathComponent(path)) : nil }
        let menu = "<nav>\n<a href=\"/\">Home</a>\n<a href=\"/about\">About me</a>\n<a href=\"/contact\">Contact</a>\n</nav>\n"
        let styles = (1...30).map { "line \($0)" }.joined(separator: "\n") + "\n"
        try put(folder, "index.html", menu); try put(folder, "src/styles.css", styles); try put(folder, "README.md", "Portfolio\n")

        // The history lives beside the project, never in it, and starts with the files copied in, by Buddy.
        let history = BuddyCodeHistory(project: project), forge = BuddyCodeHistory.Author(id: "forge", name: "Forge")
        require(try history.steps().isEmpty && !history.hasSteps, "a new task has no steps")
        for path in ["index.html", "src/styles.css", "README.md"] { try fm.copyItem(at: folder.appendingPathComponent(path), to: project.appendingPathComponent(path).creatingFolder()) }
        let copy = try history.copied(["index.html", "src/styles.css", "README.md"].map { ["path": $0, "to": $0, "version": BuddyCodeHistory.hash(read("f1", $0))] }, from: "f1", folderName: "portfolio-site")
        require(copy?["kind"] as? String == "copy" && copy?["author"] as? String == "buddy" && copy?["message"] as? String == "Copied 3 files from portfolio-site", "the copy is Buddy's first step: \(copy ?? [:])")
        require(fm.fileExists(atPath: root.appendingPathComponent("Tasks/T1/History.git/HEAD").path) && !fm.fileExists(atPath: project.appendingPathComponent(".git").path), "the history is beside the project, not inside it")
        require(history.sources()["src/styles.css"]?["folderId"] as? String == "f1" && history.mainFolder() == "f1", "each copied file remembers where it came from")
        require(try history.save(nil, author: forge) == nil, "nothing changed, nothing saved")

        // A step by the agent: its sentence, its files with lines, and a note per file.
        try put(project, "index.html", menu.replacingOccurrences(of: "<a href=\"/contact\">", with: "<a href=\"/projects\">Projects</a>\n<a href=\"/contact\">"))
        try put(project, "src/pages/projects.astro", (1...12).map { "row \($0)" }.joined(separator: "\n") + "\n")
        try fm.createDirectory(at: project.appendingPathComponent("node_modules/x"), withIntermediateDirectories: true); try put(project, "node_modules/x/index.js", "dependency\n")
        let step = try history.save("Projects page and a link to it", author: forge, notes: ["src/pages/projects.astro": "The new Projects page"])
        require(step?["author"] as? String == "forge" && step?["name"] as? String == "Forge" && step?["kind"] as? String == "step" && step?["added"] as? Int == 13, "the agent's step with its lines: \(step ?? [:])")
        require(!((step?["files"] as? [[String: Any]]) ?? []).contains { ($0["path"] as? String ?? "").hasPrefix("node_modules") }, "dependencies stay out of the history")
        try put(project, "src/styles.css", styles.replacingOccurrences(of: "line 28\n", with: "line 28 wider\n"))
        let auto = try history.save(nil, author: forge)
        require(auto?["message"] as? String == "Edited styles.css", "an unnamed step says which file it touched: \(auto?["message"] ?? "")")
        let steps = try history.steps()
        require(steps.map { $0["kind"] as? String ?? "" } == ["step", "step", "copy"], "newest first: \(steps.map { $0["message"] ?? "" })")

        // What changed since the copy, with lines and notes, and one file's change.
        let changes = try history.changes()
        let byPath = Dictionary(uniqueKeysWithValues: changes.map { ($0["path"] as? String ?? "", $0) })
        require(byPath["src/pages/projects.astro"]?["status"] as? String == "new" && byPath["src/pages/projects.astro"]?["added"] as? Int == 12 && byPath["src/pages/projects.astro"]?["note"] as? String == "The new Projects page", "a new file with its lines and note")
        require(byPath["index.html"]?["status"] as? String == "changed" && byPath["index.html"]?["added"] as? Int == 1 && byPath["index.html"]?["removed"] as? Int == 0, "a changed file against its copy")
        require(byPath["README.md"] == nil, "an untouched file is not a change")
        let diff = try history.diff("index.html"), rows = diff["rows"] as? [[String: Any]] ?? []
        require(rows.first?["kind"] as? String == "hunk" && rows.contains { $0["kind"] as? String == "add" && $0["text"] as? String == "<a href=\"/projects\">Projects</a>" && $0["n"] as? Int == 4 }, "one file's change, line by line: \(rows)")
        require((try? history.diff("../secret")) == nil, "a path outside the project is refused")

        // Compared with the person's folder: untouched there → as it is; edited elsewhere in the file → combined; the same lines → a clash.
        var found = try history.compare(agentName: "Forge", read: read)
        require((found["bring"] as? [[String: Any]] ?? []).count == 3 && (found["clashes"] as? [[String: Any]] ?? []).isEmpty && found["ready"] as? Bool == true, "nothing changed there: everything comes in as it is: \(found)")
        try put(folder, "src/styles.css", styles.replacingOccurrences(of: "line 2\n", with: "line 2 yours\n"))
        try put(folder, "index.html", menu.replacingOccurrences(of: "About me", with: "About").replacingOccurrences(of: "<a href=\"/contact\">Contact</a>", with: "<a href=\"/contact\">Say hi</a>"))
        try put(folder, "src/pages/projects.astro", "the person's own page\n")
        found = try history.compare(agentName: "Forge", read: read)
        let clashes = found["clashes"] as? [[String: Any]] ?? []
        require(found["combined"] as? [String] == ["src/styles.css"], "edits on other lines are combined: \(found["combined"] ?? "")")
        require(clashes.contains { $0["path"] as? String == "index.html" && $0["kind"] as? String == "lines" } && clashes.contains { $0["path"] as? String == "src/pages/projects.astro" && $0["kind"] as? String == "exists" } && found["ready"] as? Bool == false, "the same lines, and a different file of that name, clash: \(clashes)")
        let hunk = (clashes.first { $0["path"] as? String == "index.html" }?["hunks"] as? [[String: Any]] ?? []).first ?? [:]
        require((hunk["yours"] as? String ?? "").contains("Say hi") && (hunk["agent"] as? String ?? "").contains("Projects"), "a clash shows both sides: \(hunk)")

        // Bringing in waits for a choice on each clash, then writes exactly what was chosen.
        var written: [String: Data] = [:]
        let write: (String, String, Data) throws -> Void = { id, path, data in written[path] = data; try data.write(to: folder.appendingPathComponent(path)) }
        require((try? history.bringIn(agentName: "Forge", folderName: "portfolio-site", choices: [:], read: read, write: write)) == nil && written.isEmpty, "nothing comes in while a clash is open")
        let brought = try history.bringIn(agentName: "Forge", folderName: "portfolio-site", choices: ["index.html": "yours", "src/pages/projects.astro": "agent"], read: read, write: write)
        require(Set(brought["files"] as? [String] ?? []) == ["src/styles.css", "src/pages/projects.astro"] && brought["left"] as? [String] == ["index.html"], "the chosen files come in, the kept one doesn't: \(brought)")
        require((get(folder, "src/styles.css") ?? "").contains("line 2 yours") && (get(folder, "src/styles.css") ?? "").contains("line 28 wider") && get(folder, "src/pages/projects.astro")?.hasPrefix("row 1") == true, "combined and chosen versions are written")
        require(get(folder, "index.html")?.contains("Say hi") == true, "the person's version is left as it is")
        let kinds = try history.steps().prefix(2).map { "\($0["kind"] ?? "")/\($0["author"] ?? "")" }
        require(kinds == ["in/you", "combine/you"], "the combine and the bringing in are the person's steps: \(kinds)")
        found = try history.compare(agentName: "Forge", read: read)
        require((found["bring"] as? [[String: Any]] ?? []).isEmpty && (found["clashes"] as? [[String: Any]] ?? []).count == 1, "what came in is the new starting point; only the clash left out remains: \(found)")

        // Ask the agent to combine: the person's version first, then both sides marked; once the agent settles them it comes in as it is.
        let marked = try history.markClashes(agentName: "Forge", read: read)
        require(marked == ["index.html"] && (get(project, "index.html") ?? "").contains("<<<<<<< yours") && (get(project, "index.html") ?? "").contains(">>>>>>> Forge"), "the clash is marked in the agent's copy")
        try put(project, "index.html", "<nav>\n<a href=\"/\">Home</a>\n<a href=\"/about\">About</a>\n<a href=\"/projects\">Projects</a>\n<a href=\"/contact\">Say hi</a>\n</nav>\n")
        _ = try history.save("Kept your labels and added Projects", author: forge)
        found = try history.compare(agentName: "Forge", read: read)
        require((found["bring"] as? [[String: Any]] ?? []).map { "\($0["path"] ?? "")/\($0["how"] ?? "")" } == ["index.html/as-is"] && found["ready"] as? Bool == true, "the settled file comes in as it is: \(found)")

        // A file too large for the history is left out of it.
        try Data(count: BuddyCodeHistory.largeFile + 1).write(to: project.appendingPathComponent("data.bin"))
        _ = try history.save(nil, author: forge)
        require(!(try history.changes()).contains { $0["path"] as? String == "data.bin" }, "a file over the size limit stays out of the history")

        // Checks come from the commands, newest of each kind, with counts where the tool prints them.
        let checks = BuddyCodeChecks.read([
            ["id": "1", "code": "npx vitest run", "status": "completed", "exitCode": 1, "output": "Tests  2 failed | 16 passed (18)", "durationMs": 6200],
            ["id": "2", "code": "npm test", "status": "completed", "exitCode": 0, "output": "\u{1b}[32m Tests  18 passed (18)\u{1b}[0m", "durationMs": 6200],
            ["id": "3", "code": "npx eslint .", "status": "completed", "exitCode": 1, "output": "✖ 3 problems (3 errors, 0 warnings)"],
            ["id": "4", "code": "npx tsc --noEmit", "status": "completed", "exitCode": 0, "output": ""],
            ["id": "5", "code": "npm run dev", "status": "running", "output": "  Local: http://localhost:4321/"],
            ["id": "6", "code": "ls -la", "status": "completed", "exitCode": 0, "output": ""]])
        require(checks.map { $0["kind"] as? String ?? "" } == ["test", "lint", "types", "preview"], "one check per kind, in order: \(checks.map { $0["kind"] ?? "" })")
        require(checks[0]["summary"] as? String == "all 18 pass" && checks[0]["ok"] as? Bool == true && checks[0]["detail"] as? String == "npm test · 6.2 s", "the newest test run wins, with its count: \(checks[0])")
        require(checks[1]["summary"] as? String == "3 problems" && checks[1]["ok"] as? Bool == false, "a failed lint says how many problems")
        require(checks[2]["summary"] as? String == "no errors", "a clean type check")
        require(checks[3]["summary"] as? String == "running on this Mac" && (checks[3]["detail"] as? String ?? "").contains("http://localhost:4321/"), "a preview server that runs, with its address")
        for (output, passed, failed) in [("Tests:       1 failed, 17 passed, 18 total", 17, 1), ("# pass 18\n# fail 0", 18, 0), ("Executed 18 tests, with 1 failure (0 unexpected)", 17, 1),
                                         ("test result: ok. 18 passed; 0 failed; 0 ignored", 18, 0), ("==== 1 failed, 17 passed in 6.20s ====", 17, 1), ("17 passed in 0.42s", 17, 0)] {
            let n = BuddyCodeChecks.testCounts(output)
            require(n?.passed == passed && n?.failed == failed, "test counts from “\(output)”: \(String(describing: n))")
        }
        require(BuddyCodeChecks.kind("cd web && npm run build") == "build" && BuddyCodeChecks.kind("python3 -m pytest -q") == "test" && BuddyCodeChecks.kind("cat notes.md") == nil, "commands are recognized by what they run")
        print("PASS: a coding task keeps its history beside its project, saves steps with lines and notes, shows a file's change, compares with the person's folder (as it is, combined or clashing), brings in only what was chosen, marks clashes for the agent, and reads checks from its commands")
    }
}
extension URL {
    func creatingFolder() throws -> URL { try FileManager.default.createDirectory(at: deletingLastPathComponent(), withIntermediateDirectories: true); return self }
}
