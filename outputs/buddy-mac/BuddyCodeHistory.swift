import Foundation
import CryptoKit

/// A coding task's history, for the Code view: Buddy's own git repository beside the task's project folder (`Tasks/<owner>/History.git`),
/// never inside it, so the agent's commands neither see nor change it. Files copied in from a connected folder are its first steps, by Buddy,
/// with where each one came from (`sources.json`); each change the agent makes is a saved step by that agent, in a sentence. From it Buddy
/// tells which files changed and by how much, shows one file's change when asked, and compares the copy with the person's folder as it is
/// now. It never reaches the network or a connected folder itself: reading the person's files and writing them back are the caller's, the
/// writing only on the person's tap (`BuddyWorkerHost.codeOperation`).
struct BuddyCodeHistory {
    let project: URL
    init(project: URL) { self.project = project.standardizedFileURL }
    var home: URL { project.deletingLastPathComponent() }
    var gitDir: URL { home.appendingPathComponent("History.git", isDirectory: true) }
    var sourcesURL: URL { home.appendingPathComponent("sources.json") }
    var notesURL: URL { home.appendingPathComponent("notes.json") }
    nonisolated(unsafe) static var git = URL(fileURLWithPath: "/usr/bin/git")
    static let emptyTree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
    /// Files over this size stay out of the history (datasets, archives): they are listed as files, never stored twice.
    static let largeFile = 20 * 1_048_576
    static let ignored = [".git/", "node_modules/", ".venv/", "venv/", "__pycache__/", "*.pyc", ".DS_Store", ".next/", ".cache/", ".pytest_cache/", ".mypy_cache/", "target/", ".build/", "DerivedData/"]
    static let shownSteps = 40, shownFiles = 300, diffRows = 600
    /// What a coding agent is told about its history.
    static let guidance = "Save a step with buddy_save_step after each meaningful change, before running the checks: one plain sentence saying what changed (for example “Projects grid with filters”) and, if useful, a few words per file. The person follows your work as these steps and brings it into their folder from them. Buddy keeps this history outside the project, so never look for it or try to change it."

    struct Failure: LocalizedError { let message: String; var errorDescription: String? { message } }
    /// Who saved a step: an agent (its id and name), Buddy, or the person.
    struct Author { let id: String; let name: String }
    static let buddy = Author(id: "buddy", name: "Buddy"), person = Author(id: "you", name: "You")

    // MARK: git, always on Buddy's own repository, with no system or personal settings, hooks, signing or prompts

    final class Output: @unchecked Sendable { var data = Data() }
    @discardableResult
    func git(_ arguments: [String], author: Author? = nil, allow: Set<Int32> = [0]) throws -> (status: Int32, out: Data) {
        let process = Process(); process.executableURL = Self.git
        process.arguments = ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "core.quotepath=false", "-c", "core.autocrlf=false",
                             "-c", "core.fsmonitor=false", "-c", "gc.auto=0", "-c", "init.defaultBranch=copy", "-c", "advice.detachedHead=false"] + arguments
        var environment = ProcessInfo.processInfo.environment.filter { !$0.key.hasPrefix("GIT_") }
        environment["GIT_DIR"] = gitDir.path; environment["GIT_WORK_TREE"] = project.path
        environment["GIT_CONFIG_NOSYSTEM"] = "1"; environment["GIT_CONFIG_GLOBAL"] = "/dev/null"; environment["GIT_TERMINAL_PROMPT"] = "0"; environment["LC_ALL"] = "C"
        environment["GIT_COMMITTER_NAME"] = "Buddy"; environment["GIT_COMMITTER_EMAIL"] = "buddy@buddy.local"
        if let author { environment["GIT_AUTHOR_NAME"] = author.name; environment["GIT_AUTHOR_EMAIL"] = "\(author.id)@buddy.local" }
        process.environment = environment; process.currentDirectoryURL = project
        let out = Pipe(), err = Pipe(); process.standardOutput = out; process.standardError = err; process.standardInput = FileHandle.nullDevice
        try process.run()
        let errors = Output(), group = DispatchGroup(); group.enter()
        DispatchQueue.global().async { errors.data = err.fileHandleForReading.readDataToEndOfFile(); group.leave() }
        let data = out.fileHandleForReading.readDataToEndOfFile(); group.wait(); process.waitUntilExit()
        guard allow.contains(process.terminationStatus) else {
            throw Failure(message: "The task's history could not be read: " + String(decoding: errors.data.prefix(400), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return (process.terminationStatus, data)
    }
    private func text(_ arguments: [String]) throws -> String { String(decoding: try git(arguments).out, as: UTF8.self) }
    var exists: Bool { FileManager.default.fileExists(atPath: gitDir.appendingPathComponent("HEAD").path) }
    var hasSteps: Bool { exists && ((try? git(["rev-parse", "--verify", "--quiet", "HEAD"], allow: [0, 1]).status) == 0) }

    func ensure() throws {
        try FileManager.default.createDirectory(at: project, withIntermediateDirectories: true)
        if !exists { try git(["init", "--quiet"]) }
        try writeExclude()
    }
    /// What the history leaves out: tool caches and dependencies, and any file over `largeFile`.
    private func writeExclude() throws {
        var large: [String] = []
        let skip = Set(Self.ignored.filter { $0.hasSuffix("/") }.map { String($0.dropLast()) })
        if let walk = FileManager.default.enumerator(at: project, includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey, .isDirectoryKey]) {
            var seen = 0
            for case let url as URL in walk {
                seen += 1; if seen > 20000 { break }
                let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey, .isDirectoryKey])
                if values?.isDirectory == true, skip.contains(url.lastPathComponent) { walk.skipDescendants(); continue }
                if values?.isRegularFile == true, (values?.fileSize ?? 0) > Self.largeFile { large.append("/" + relative(url)) }
            }
        }
        let info = gitDir.appendingPathComponent("info", isDirectory: true)
        try FileManager.default.createDirectory(at: info, withIntermediateDirectories: true)
        try (Self.ignored + large).joined(separator: "\n").appending("\n").write(to: info.appendingPathComponent("exclude"), atomically: true, encoding: .utf8)
    }
    private func relative(_ url: URL) -> String { String(url.standardizedFileURL.path.dropFirst(project.path.count + 1)) }

    // MARK: saving a step

    /// Saves what changed in the project since the last step, as a step by `author`. Without a message the step says which files it touched.
    /// Nil when nothing changed (unless `empty`, for a step that only marks a moment, such as work brought into the person's folder).
    @discardableResult
    func save(_ message: String?, author: Author, kind: String = "step", notes: [String: String] = [:], empty: Bool = false) throws -> [String: Any]? {
        try ensure()
        try git(["add", "-A", "--", "."])
        let unchanged = try git(["diff", "--cached", "--quiet"], allow: [0, 1]).status == 0
        if unchanged && !empty { if !notes.isEmpty { try saveNotes(notes) }; return nil }
        let given = (message?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : String($0.prefix(140)) }
        let said = try given ?? describeStaged()
        // The kind rides in the author's address (id+kind@buddy.local), so a step reads back in one line.
        let tagged = Author(id: "\(author.id)+\(kind)", name: author.name)
        try git(["commit", "--quiet", "--no-verify"] + (empty ? ["--allow-empty"] : []) + ["-m", said], author: tagged)
        if !notes.isEmpty { try saveNotes(notes) }
        return try steps(limit: 1).first
    }
    /// "Edited projects.astro", "Added 3 files", "Edited index.html and 2 more files".
    private func describeStaged() throws -> String {
        let lines = try text(["diff", "--cached", "--name-status", "--no-renames"]).split(separator: "\n").map { $0.split(separator: "\t", maxSplits: 1).map(String.init) }.filter { $0.count == 2 }
        guard let first = lines.first else { return "Saved the project" }
        let verb = Set(lines.map { $0[0] }).count == 1 ? (first[0] == "A" ? "Added" : first[0] == "D" ? "Removed" : "Edited") : "Changed"
        let name = (first[1] as NSString).lastPathComponent
        return lines.count == 1 ? "\(verb) \(name)" : lines.count <= 3 ? "\(verb) " + lines.map { ($0[1] as NSString).lastPathComponent }.joined(separator: ", ") : "\(verb) \(name) and \(lines.count - 1) more files"
    }

    // MARK: reading it back

    /// The newest steps first: who, when, the sentence, and each file's added and removed lines.
    func steps(limit: Int = shownSteps) throws -> [[String: Any]] {
        guard hasSteps else { return [] }
        let raw = try text(["log", "-n", String(max(1, limit)), "--no-renames", "--numstat", "--format=%x1e%H%x1f%an%x1f%ae%x1f%aI%x1f%s"])
        return raw.split(separator: "\u{1e}").compactMap { chunk -> [String: Any]? in
            let lines = chunk.split(separator: "\n", omittingEmptySubsequences: true)
            guard let head = lines.first else { return nil }
            let f = head.split(separator: "\u{1f}", omittingEmptySubsequences: false).map(String.init)
            guard f.count >= 5 else { return nil }
            let tag = f[2].replacingOccurrences(of: "@buddy.local", with: "").split(separator: "+", maxSplits: 1).map(String.init)
            var added = 0, removed = 0
            let files: [[String: Any]] = lines.dropFirst().compactMap { line in
                let p = line.split(separator: "\t", maxSplits: 2).map(String.init); guard p.count == 3 else { return nil }
                let a = Int(p[0]), r = Int(p[1]); added += a ?? 0; removed += r ?? 0
                return ["path": p[2], "added": a ?? 0, "removed": r ?? 0, "binary": a == nil]
            }
            return ["hash": String(f[0].prefix(7)), "full": f[0], "name": f[1], "author": tag.first ?? "", "kind": tag.count > 1 ? tag[1] : "step", "at": f[3],
                    "message": f.dropFirst(4).joined(separator: "\u{1f}"), "files": Array(files.prefix(50)), "fileCount": files.count, "added": added, "removed": removed]
        }
    }
    /// Where each copied file came from: its project path → {folderId, path, commit (the step that copied it), version}.
    func sources() -> [String: [String: Any]] {
        (try? JSONSerialization.jsonObject(with: Data(contentsOf: sourcesURL))) as? [String: [String: Any]] ?? [:]
    }
    private func saveSources(_ value: [String: [String: Any]]) throws {
        try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]).write(to: sourcesURL, options: .atomic)
    }
    func notes() -> [String: String] { (try? JSONSerialization.jsonObject(with: Data(contentsOf: notesURL))) as? [String: String] ?? [:] }
    private func saveNotes(_ given: [String: String]) throws {
        var all = notes(); for (path, note) in given { let n = note.trimmingCharacters(in: .whitespacesAndNewlines); if !n.isEmpty { all[path] = String(n.prefix(200)) } }
        try JSONSerialization.data(withJSONObject: all, options: [.sortedKeys]).write(to: notesURL, options: .atomic)
    }
    /// Files copied in from a connected folder (`copied`, as BuddyProjectFiles.copy reports them), saved as Buddy's step and remembered by source.
    @discardableResult
    func copied(_ copied: [[String: Any]], from folderId: String, folderName: String) throws -> [String: Any]? {
        guard !copied.isEmpty else { return nil }
        let step = try save("Copied \(copied.count == 1 ? "1 file" : "\(copied.count) files") from \(folderName)", author: Self.buddy, kind: "copy")
        let head = try headHash()
        var all = sources()
        for c in copied { if let to = c["to"] as? String, let path = c["path"] as? String { all[to] = ["folderId": folderId, "path": path, "commit": head, "version": c["version"] as? String ?? ""] } }
        try saveSources(all)
        return step
    }
    func headHash() throws -> String { try text(["rev-parse", "HEAD"]).trimmingCharacters(in: .whitespacesAndNewlines) }
    /// A file as it was at a step, or nil when it wasn't there.
    func content(_ path: String, at commit: String) -> Data? {
        guard commit != Self.emptyTree, let shown = try? git(["show", "\(commit):\(path)"], allow: [0, 128]), shown.status == 0 else { return nil }
        return shown.out
    }

    /// Every file that differs from where it started (its copy for a copied file, nothing for a new one): new, changed or removed, with lines.
    func changes() throws -> [[String: Any]] {
        guard hasSteps else { return [] }
        let src = sources(), notes = notes()
        let tracked = Set(try text(["ls-tree", "-r", "--name-only", "HEAD"]).split(separator: "\n").map(String.init))
        var out: [[String: Any]] = []
        func numstat(_ base: String, _ paths: [String]) throws -> [(String, Int?, Int?)] {
            var rows: [(String, Int?, Int?)] = []
            for chunk in stride(from: 0, to: paths.count, by: 200).map({ Array(paths[$0..<min($0 + 200, paths.count)]) }) {
                for line in try text(["diff", "--numstat", "--no-renames", base, "HEAD", "--"] + chunk).split(separator: "\n") {
                    let p = line.split(separator: "\t", maxSplits: 2).map(String.init); if p.count == 3 { rows.append((p[2], Int(p[0]), Int(p[1]))) }
                }
            }
            return rows
        }
        for (commit, paths) in Dictionary(grouping: src.keys.sorted(), by: { src[$0]?["commit"] as? String ?? Self.emptyTree }) {
            for (path, a, r) in try numstat(commit, paths) {
                var row: [String: Any] = ["path": path, "status": tracked.contains(path) ? "changed" : "removed", "added": a ?? 0, "removed": r ?? 0, "binary": a == nil]
                if let s = src[path] { row["from"] = ["folderId": s["folderId"] ?? "", "path": s["path"] ?? path] }
                if let n = notes[path] { row["note"] = n }
                out.append(row)
            }
        }
        let fresh = tracked.filter { src[$0] == nil }.sorted().prefix(2000)
        for (path, a, r) in try numstat(Self.emptyTree, Array(fresh)) {
            var row: [String: Any] = ["path": path, "status": "new", "added": a ?? 0, "removed": r ?? 0, "binary": a == nil]
            if let n = notes[path] { row["note"] = n }
            out.append(row)
        }
        return out.sorted { (($0["added"] as? Int ?? 0) + ($0["removed"] as? Int ?? 0), $1["path"] as? String ?? "") > (($1["added"] as? Int ?? 0) + ($1["removed"] as? Int ?? 0), $0["path"] as? String ?? "") }
    }
    /// One file's change from where it started: rows of hunk, ctx, add and del lines with their line numbers, at most `diffRows`.
    func diff(_ path: String) throws -> [String: Any] {
        guard hasSteps, !path.isEmpty, !path.hasPrefix("/"), !path.split(separator: "/").contains("..") else { throw Failure(message: "Choose a file from the list.") }
        let base = sources()[path]?["commit"] as? String ?? Self.emptyTree
        let raw = try text(["diff", "--no-color", "--no-renames", "-U3", base, "HEAD", "--", path])
        if raw.contains("\nBinary files ") || raw.hasPrefix("Binary files ") { return ["path": path, "binary": true, "rows": []] }
        var rows: [[String: Any]] = [], old = 0, new = 0, truncated = false
        for line in raw.split(separator: "\n", omittingEmptySubsequences: false) {
            if line.hasPrefix("diff --git") || line.hasPrefix("index ") || line.hasPrefix("--- ") || line.hasPrefix("+++ ") || line.hasPrefix("new file mode") || line.hasPrefix("deleted file mode") || line.hasPrefix("\\ No newline") { continue }
            guard rows.count < Self.diffRows else { truncated = true; break }
            if line.hasPrefix("@@") {
                let parts = line.split(separator: " ")
                old = Int(parts.count > 1 ? parts[1].dropFirst().split(separator: ",").first ?? "0" : "0") ?? 0
                new = Int(parts.count > 2 ? parts[2].dropFirst().split(separator: ",").first ?? "0" : "0") ?? 0
                rows.append(["kind": "hunk", "text": String(line)]); continue
            }
            if line.hasPrefix("+") { rows.append(["kind": "add", "n": new, "text": String(line.dropFirst())]); new += 1 }
            else if line.hasPrefix("-") { rows.append(["kind": "del", "n": old, "text": String(line.dropFirst())]); old += 1 }
            else if line.hasPrefix(" ") { rows.append(["kind": "ctx", "n": new, "text": String(line.dropFirst())]); old += 1; new += 1 }
        }
        return ["path": path, "binary": false, "rows": rows, "truncated": truncated]
    }

    // MARK: the person's folder

    /// The connected folder most copied files came from: where new files go.
    func mainFolder() -> String? {
        let counts = Dictionary(grouping: sources().values.compactMap { $0["folderId"] as? String }, by: { $0 }).mapValues(\.count)
        return counts.max { ($0.value, $1.key) < ($1.value, $0.key) }?.key
    }
    static func hash(_ data: Data?) -> String { data.map { SHA256.hash(data: $0).map { String(format: "%02x", $0) }.joined() } ?? "" }

    /// The copy against the person's folder as it is now (`read` gives a file there, nil when there is none). Each changed or new file either
    /// comes in as it is (its file there is still as copied, or there is none), comes in combined with the person's edits (they changed other
    /// lines), or clashes (they changed the same lines, removed the file, or have a different file of that name). Removed files never remove
    /// anything from the person's folder.
    func compare(agentName: String, read: (String, String) -> Data?) throws -> [String: Any] {
        let changes = try changes(), src = sources(), main = mainFolder()
        var bring: [[String: Any]] = [], clashes: [[String: Any]] = [], combined: [String] = [], kept: [String] = []
        for change in changes {
            guard let path = change["path"] as? String, let status = change["status"] as? String else { continue }
            if status == "removed" { kept.append(path); continue }
            let agent = content(path, at: "HEAD")
            if let s = src[path], let folder = s["folderId"] as? String, let there = s["path"] as? String, let commit = s["commit"] as? String {
                let base = content(path, at: commit)
                guard let current = read(folder, there) else { clashes.append(["path": path, "folderId": folder, "to": there, "kind": "gone"]); continue }
                if Self.hash(current) == Self.hash(base) { bring.append(["path": path, "folderId": folder, "to": there, "how": "as-is"]); continue }
                let merged = try merge(yours: current, base: base ?? Data(), agent: agent ?? Data(), agentName: agentName)
                if merged.conflicts == 0 { combined.append(path); bring.append(["path": path, "folderId": folder, "to": there, "how": "combined"]) }
                else { clashes.append(["path": path, "folderId": folder, "to": there, "kind": "lines", "count": merged.conflicts, "hunks": Self.conflictHunks(merged.text)]) }
            } else {
                guard let folder = main else { continue }
                if let current = read(folder, path), Self.hash(current) != Self.hash(agent) { clashes.append(["path": path, "folderId": folder, "to": path, "kind": "exists"]); continue }
                bring.append(["path": path, "folderId": folder, "to": path, "how": "new"])
            }
        }
        return ["at": ISO8601DateFormatter().string(from: Date()), "head": (try? headHash()) ?? "", "folderId": main ?? "", "bring": bring, "clashes": clashes, "combined": combined, "kept": kept,
                "ready": clashes.isEmpty && !bring.isEmpty]
    }
    /// A three-way merge of one file: the person's version, the version copied, and the agent's. `text` carries conflict markers where they clash.
    func merge(yours: Data, base: Data, agent: Data, agentName: String) throws -> (text: Data, conflicts: Int) {
        let scratch = home.appendingPathComponent("Merge-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true); defer { try? FileManager.default.removeItem(at: scratch) }
        let a = scratch.appendingPathComponent("yours"), b = scratch.appendingPathComponent("base"), c = scratch.appendingPathComponent("agent")
        try yours.write(to: a); try base.write(to: b); try agent.write(to: c)
        // merge-file's status is the number of clashes (capped at 127), negative on error.
        let result = try git(["merge-file", "-p", "-L", "yours", "-L", "copied", "-L", agentName, a.path, b.path, c.path], allow: Set(0...127))
        return (result.out, Int(result.status))
    }
    /// The first few clashes in a merged file: the line it starts at, the person's lines and the agent's.
    static func conflictHunks(_ merged: Data, limit: Int = 5) -> [[String: Any]] {
        var out: [[String: Any]] = [], yours: [String] = [], agent: [String] = [], side = 0, line = 0, start = 0
        for raw in String(decoding: merged, as: UTF8.self).split(separator: "\n", omittingEmptySubsequences: false) {
            line += 1
            if raw.hasPrefix("<<<<<<< ") { side = 1; start = line; yours = []; agent = []; continue }
            if side == 1, raw.hasPrefix("=======") { side = 2; continue }
            if side == 2, raw.hasPrefix(">>>>>>> ") {
                out.append(["line": start, "yours": yours.prefix(12).joined(separator: "\n"), "agent": agent.prefix(12).joined(separator: "\n")]); side = 0
                if out.count >= limit { break }; continue
            }
            if side == 1 { yours.append(String(raw.prefix(300))) } else if side == 2 { agent.append(String(raw.prefix(300))) }
        }
        return out
    }

    /// Brings the copy into the person's folder, after `compare`: files that come in as they are, combined files (saved first as a step by the
    /// person, so what is written is a step too), and each clash as the person chose ("agent" writes the agent's version, "yours" leaves theirs).
    /// `write` writes one file there, with Buddy's file receipt. The written files become the new starting point for the next compare.
    func bringIn(agentName: String, folderName: String, choices: [String: String], read: (String, String) -> Data?, write: (String, String, Data) throws -> Void) throws -> [String: Any] {
        let found = try compare(agentName: agentName, read: read)
        let clashes = found["clashes"] as? [[String: Any]] ?? []
        let open = clashes.compactMap { $0["path"] as? String }.filter { !["agent", "yours"].contains(choices[$0] ?? "") }
        guard open.isEmpty else { throw Failure(message: "Choose yours or \(agentName)’s for each clash first: " + open.prefix(3).joined(separator: ", ") + ".") }
        var plan = found["bring"] as? [[String: Any]] ?? []
        for c in clashes where choices[c["path"] as? String ?? ""] == "agent" { plan.append(c.merging(["how": "chosen"]) { _, n in n }) }
        guard !plan.isEmpty else { throw Failure(message: "There is nothing to bring in: every change was left out.") }
        // The combined versions are written into the copy first, as the person's step, so the history shows what came in.
        for item in plan where item["how"] as? String == "combined" {
            guard let path = item["path"] as? String, let folder = item["folderId"] as? String, let to = item["to"] as? String, let current = read(folder, to),
                  let commit = sources()[path]?["commit"] as? String else { continue }
            let merged = try merge(yours: current, base: content(path, at: commit) ?? Data(), agent: content(path, at: "HEAD") ?? Data(), agentName: agentName)
            guard merged.conflicts == 0 else { throw Failure(message: "\(to) changed again in your folder. Compare again before bringing it in.") }
            try merged.text.write(to: project.appendingPathComponent(path), options: .atomic)
        }
        if plan.contains(where: { $0["how"] as? String == "combined" }) { try save("Your edits combined into " + (found["combined"] as? [String] ?? []).map { ($0 as NSString).lastPathComponent }.joined(separator: ", "), author: Self.person, kind: "combine") }
        var written: [String] = [], all = sources()
        let head = try headHash()
        for item in plan {
            guard let path = item["path"] as? String, let folder = item["folderId"] as? String, let to = item["to"] as? String, let data = content(path, at: "HEAD") else { continue }
            try write(folder, to, data)
            written.append(to); all[path] = ["folderId": folder, "path": to, "commit": head, "version": Self.hash(data)]
        }
        try saveSources(all)
        try save("Brought \(written.count == 1 ? "1 file" : "\(written.count) files") into \(folderName)", author: Self.person, kind: "in", empty: true)
        return ["at": ISO8601DateFormatter().string(from: Date()), "files": written, "folderId": found["folderId"] ?? "", "left": clashes.compactMap { c in choices[c["path"] as? String ?? ""] == "yours" ? c["path"] as? String : nil }]
    }
    /// For "ask the agent to combine": the clashing files get the person's version and the agent's side by side with conflict markers, saved
    /// as the person's step, so the agent finds them in its copy and settles them. Returns the files marked.
    func markClashes(agentName: String, read: (String, String) -> Data?) throws -> [String] {
        let found = try compare(agentName: agentName, read: read), src = sources()
        var merges: [(path: String, yours: Data, marked: Data)] = []
        for c in found["clashes"] as? [[String: Any]] ?? [] where c["kind"] as? String == "lines" {
            guard let path = c["path"] as? String, let folder = c["folderId"] as? String, let to = c["to"] as? String, let current = read(folder, to), let commit = src[path]?["commit"] as? String else { continue }
            let merged = try merge(yours: current, base: content(path, at: commit) ?? Data(), agent: content(path, at: "HEAD") ?? Data(), agentName: agentName)
            merges.append((path, current, merged.text))
        }
        guard !merges.isEmpty else { return [] }
        let names = merges.map { ($0.path as NSString).lastPathComponent }.joined(separator: ", ")
        // First the person's version as it is in their folder, as their step: it is where the agent's settling starts, so the next compare
        // brings in what the agent changes from there. Then both sides with conflict markers, for the agent to settle.
        for m in merges { try m.yours.write(to: project.appendingPathComponent(m.path), options: .atomic) }
        try save("Your edits taken in: " + names, author: Self.person, kind: "combine")
        var all = sources(); let head = try headHash()
        for m in merges { if var s = all[m.path] { s["commit"] = head; s["version"] = Self.hash(m.yours); all[m.path] = s } }
        try saveSources(all)
        for m in merges { try m.marked.write(to: project.appendingPathComponent(m.path), options: .atomic) }
        try save("Clashes marked for \(agentName) in " + names, author: Self.buddy, kind: "combine")
        return merges.map(\.path)
    }
}
