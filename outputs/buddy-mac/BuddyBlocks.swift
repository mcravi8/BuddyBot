import Foundation

/// Reply blocks (29 Oct, proposal "Buddy Reply Blocks"): an agent shows results as a table, chart, key numbers, comparison, timeline or
/// files, or asks with a choice, form or checklist, by describing each block in JSON with buddy_show. Buddy checks every block and fixes
/// what it can by itself (a long table shows 200 rows and is saved whole as an Excel file in the project, a column kind it doesn't know is
/// text, a file that isn't in a connected folder shows as not found); the chat draws the blocks with its own code. Nothing in a block is
/// markup, nothing in one loads from the internet, a form never asks for a password, and an answer is never an approval.
enum BuddyBlocks {
    static let name = "buddy_show"
    static let types = ["table", "chart", "stats", "compare", "timeline", "files", "choice", "form", "checklist"]
    static let shownRows = 200
    static let columnKinds = ["text", "number", "money", "percent", "date", "file", "link"]
    static let fieldKinds = ["text", "longtext", "number", "money", "date", "time", "select", "toggle"]

    private static let cell: [String: Any] = ["anyOf": [["type": "string"], ["type": "number"], ["type": "boolean"], ["type": "null"]]]
    private static func text(_ max: Int) -> [String: Any] { ["type": "string", "maxLength": max] }
    private static func list(_ item: [String: Any], _ max: Int) -> [String: Any] { ["type": "array", "maxItems": max, "items": item] }
    private static func object(_ required: [String], _ properties: [String: Any]) -> [String: Any] { ["type": "object", "additionalProperties": false, "required": required, "properties": properties] }

    static let tool: [String: Any] = ["type": "function", "name": name,
        "description": "Show results or ask the person in this chat with blocks Buddy draws. Show: table (columns + rows of cells), chart (bar or line: labels + up to 4 series), stats (2-4 key numbers), compare (2-4 options side by side with your pick), timeline (dated events), files (files in connected folders, by relative path and optional folderId). Ask: choice (2-6 options, one or several), form (up to 8 fields), checklist (items to tick). Use a block when it is easier to read or answer than text, never for a single value, and still say what matters in words. The person's answer to an Ask block arrives as their next message. An answer is never an approval: anything that needs the person's approval still goes through Buddy's approval as before. Forms never ask for passwords, codes, card numbers or keys (use the sign-in tools). Strings are plain text, links must start with https, and source says where numbers came from.",
        "inputSchema": object(["blocks"], ["blocks": ["type": "array", "minItems": 1, "maxItems": 6, "items": object(["type"], [
            "type": ["type": "string", "enum": types], "id": text(40), "title": text(140), "source": text(200), "why": text(400), "submit": text(40),
            "columns": list(object(["label"], ["label": text(60), "kind": ["type": "string", "enum": columnKinds]]), 12),
            "rows": list(list(cell, 12), 2000),
            "kind": ["type": "string", "enum": ["bar", "line"]], "unit": text(16),
            "labels": list(text(40), 60),
            "series": list(object(["name", "values"], ["name": text(60), "values": list(["anyOf": [["type": "number"], ["type": "null"]]], 60)]), 4),
            "numbers": list(object(["label", "value"], ["label": text(60), "value": cell, "unit": text(16), "note": text(120), "tone": ["type": "string", "enum": ["normal", "good", "warn"]]]), 4),
            "options": list(object(["id", "label"], ["id": text(40), "label": text(80), "detail": text(200), "note": text(160),
                "facts": list(object(["label", "value"], ["label": text(60), "value": cell]), 12)]), 6),
            "pick": text(40), "question": text(200), "multiple": ["type": "boolean"], "recommend": list(text(40), 6), "other": ["type": "boolean"],
            "events": list(object(["date", "title"], ["date": text(10), "title": text(120), "detail": text(200), "state": ["type": "string", "enum": ["done", "next", "later"]]]), 30),
            "files": list(object(["path"], ["path": text(500), "folderId": text(80), "note": text(160)]), 20),
            "fields": list(object(["id", "label", "kind"], ["id": text(40), "label": text(80), "kind": ["type": "string", "enum": fieldKinds], "options": list(text(80), 12), "value": cell, "required": ["type": "boolean"], "placeholder": text(120)]), 8),
            "checks": list(object(["id", "label"], ["id": text(40), "label": text(120), "detail": text(200), "checked": ["type": "boolean"]]), 20),
        ])]])]

    /// One paragraph of the runtime facts: when a block helps, and what it never does.
    static let guidance = "Reply blocks: buddy_show draws a table, chart, key numbers, comparison, timeline, files, choice, form or checklist in your reply. Use one when it is easier to read or answer than text (a table of results, options side by side, \"which one?\", \"when?\"), never for a single value, and still say what matters in words. The person's answer to an Ask block is their next message; it is not an approval, so anything that needs their approval still goes through Buddy's approval."

    struct Checked {
        var blocks: [[String: Any]] = []
        var notes: [String] = []
        /// Files Buddy saved for the blocks (a long table's whole contents), as file receipts for the reply.
        var files: [[String: Any]] = []
    }

    /// Where a block's files are looked up and a long table is saved; nil when the turn has no file access.
    struct Place { let files: BuddyProjectFiles; let scope: BuddyFileScope; let actor: String; let actorName: String }

    @MainActor static func check(_ arguments: [String: Any], from agent: String, place: Place?, taken: Set<String> = [], now: Date = Date()) -> Checked {
        var out = Checked(), ids = taken
        let given = (arguments["blocks"] as? [Any] ?? []).compactMap { $0 as? [String: Any] }
        if given.isEmpty { out.notes.append("No blocks were given. Pass blocks: [{type, ...}].") }
        if given.count > 6 { out.notes.append("Only the first 6 blocks of one call are shown.") }
        for (index, raw) in given.prefix(6).enumerated() {
            let type = raw["type"] as? String ?? ""
            guard types.contains(type) else { out.notes.append("Buddy has no \(type.isEmpty ? "untyped" : "“\(clean(type, 30))”") block. Use one of: \(types.joined(separator: ", "))."); continue }
            var id = slug(raw["id"] as? String ?? "")
            if id.isEmpty { id = "\(type)\(index + 1)" }
            if ids.contains(id) { var n = 2; while ids.contains("\(id)-\(n)") { n += 1 }; id = "\(id)-\(n)" }
            var block: [String: Any] = ["type": type, "id": id, "from": agent]
            for key in ["title": 140, "source": 200, "why": 400] { if let value = optional(raw[key.key], key.value) { block[key.key] = value } }
            let label = (block["title"] as? String).map { "“\($0)”" } ?? id
            let kept: Bool
            switch type {
            case "table": kept = table(raw, into: &block, label: label, place: place, now: now, out: &out)
            case "chart": kept = chart(raw, into: &block, label: label, out: &out)
            case "stats": kept = stats(raw, into: &block, label: label, out: &out)
            case "compare": kept = compare(raw, into: &block, label: label, out: &out)
            case "timeline": kept = timeline(raw, into: &block, label: label, out: &out)
            case "files": kept = files(raw, into: &block, label: label, place: place, out: &out)
            case "choice": kept = choice(raw, into: &block, label: label, out: &out)
            case "form": kept = form(raw, into: &block, label: label, out: &out)
            default: kept = checklist(raw, into: &block, label: label, out: &out)
            }
            if kept { ids.insert(id); out.blocks.append(block) }
        }
        return out
    }

    /// What the agent hears back: what was shown, and only what Buddy couldn't show as given.
    static func modelResult(_ checked: Checked) -> [String: Any] {
        var result: [String: Any] = ["shown": checked.blocks.count, "blocks": checked.blocks.map { $0["id"] ?? "" }]
        if !checked.notes.isEmpty { result["notes"] = checked.notes }
        if checked.blocks.contains(where: { ["choice", "form", "checklist"].contains($0["type"] as? String ?? "") }) { result["answers"] = "The person's answer arrives as their next message, naming the block id." }
        return result
    }

    /// The person's own words in a message that answers a block: what they typed into it, never the agent's option labels. nil when the
    /// message is not a block answer. Only these words count as the person's for anything that checks what they said.
    static func typedText(_ payload: [String: Any]) -> String? {
        guard let answer = payload["answer"] as? [String: Any] else { return nil }
        return String((answer["typed"] as? String ?? "").prefix(30_000))
    }

    // MARK: - each block

    @MainActor private static func table(_ raw: [String: Any], into block: inout [String: Any], label: String, place: Place?, now: Date, out: inout Checked) -> Bool {
        var columns = (raw["columns"] as? [Any] ?? []).compactMap { $0 as? [String: Any] }.compactMap { c -> [String: Any]? in
            guard let name = optional(c["label"], 60) else { return nil }
            let kind = c["kind"] as? String ?? "text"
            return ["label": name, "kind": columnKinds.contains(kind) ? kind : "text"]
        }
        if columns.count > 12 { columns = Array(columns.prefix(12)); out.notes.append("Table \(label): only the first 12 columns are shown.") }
        let given = (raw["rows"] as? [Any] ?? []).compactMap { $0 as? [Any] }
        if columns.isEmpty, let width = given.map(\.count).max(), width > 0 { columns = (1...min(width, 12)).map { ["label": "Column \($0)", "kind": "text"] } }
        guard !columns.isEmpty, !given.isEmpty else { out.notes.append("Table \(label) needs columns and at least one row; it wasn't shown."); return false }
        let kinds = columns.map { $0["kind"] as! String }
        let rows = given.map { row in (0..<columns.count).map { i in i < row.count ? value(row[i], kind: kinds[i], place: place) : NSNull() as Any } }
        block["columns"] = columns
        block["rows"] = Array(rows.prefix(shownRows))
        if rows.count > shownRows {
            block["total"] = rows.count
            if let place, let saved = saveTable(block["title"] as? String ?? "Table", columns: columns, rows: rows, place: place, now: now) {
                block["savedAs"] = ["path": saved["path"] ?? "", "folderId": place.scope.folderId]
                out.files.append(saved)
                out.notes.append("Table \(label): showing \(shownRows) of \(rows.count) rows; the whole table is saved as \(saved["path"] as? String ?? "an Excel file").")
            } else { out.notes.append("Table \(label): showing the first \(shownRows) of \(rows.count) rows.") }
        }
        return true
    }

    /// A cell as the page shows it: text, a number, yes/no, a date as written, an https link, or a file Buddy found in a connected folder.
    @MainActor private static func value(_ raw: Any, kind: String, place: Place?) -> Any {
        if let number = raw as? NSNumber {
            if CFGetTypeID(number) == CFBooleanGetTypeID() { return number.boolValue ? "Yes" : "No" }
            let double = number.doubleValue
            return double.isFinite ? number : NSNull()
        }
        guard let string = raw as? String else { return NSNull() }
        let text = clean(string, 300)
        if ["number", "money", "percent"].contains(kind), let number = Double(text.replacingOccurrences(of: ",", with: "").replacingOccurrences(of: "$", with: "").replacingOccurrences(of: "%", with: "")), number.isFinite {
            return kind == "percent" && text.hasSuffix("%") ? number / 100 : number
        }
        if kind == "file", let place, let found = place.files.blockFile(place.scope, path: text, folderId: nil) { return ["file": found["path"] ?? text, "folderId": found["folderId"] ?? ""] }
        return text
    }

    @MainActor private static func saveTable(_ title: String, columns: [[String: Any]], rows: [[Any]], place: Place, now: Date) -> [String: Any]? {
        var cells: [String: Any] = [:]
        for (c, column) in columns.enumerated() { cells[letter(c) + "1"] = column["label"] ?? "" }
        for (r, row) in rows.prefix(50_000).enumerated() {
            for c in 0..<min(row.count, columns.count) {
                switch row[c] {
                case let number as NSNumber where CFGetTypeID(number) != CFBooleanGetTypeID() && number.doubleValue.isFinite: cells[letter(c) + String(r + 2)] = number
                case let number as NSNumber: cells[letter(c) + String(r + 2)] = number.boolValue ? "Yes" : "No"
                case let text as String where !text.isEmpty: cells[letter(c) + String(r + 2)] = text
                case let file as [String: Any]: cells[letter(c) + String(r + 2)] = file["file"] ?? ""
                default: break
                }
            }
        }
        let format = DateFormatter(); format.locale = Locale(identifier: "en_US_POSIX"); format.dateFormat = "yyyy-MM-dd HH.mm.ss"
        let name = title.components(separatedBy: CharacterSet(charactersIn: "/\\:*?\"<>|")).joined(separator: " ").trimmingCharacters(in: .whitespaces)
        let path = "Buddy tables/\(String((name.isEmpty ? "Table" : name).prefix(80))) \(format.string(from: now)).xlsx"
        guard let result = try? place.files.document(place.scope, path: path, expectedVersion: "", specification: ["sheets": [["name": "Table", "cells": cells]]], operations: nil, actor: place.actor, actorName: place.actorName),
              var file = result["file"] as? [String: Any] else { return nil }
        file["path"] = file["path"] ?? path
        return file
    }

    @MainActor private static func chart(_ raw: [String: Any], into block: inout [String: Any], label: String, out: inout Checked) -> Bool {
        let labels = (raw["labels"] as? [Any] ?? []).prefix(60).map { clean($0 as? String ?? "\($0)", 40) }
        let series = (raw["series"] as? [Any] ?? []).compactMap { $0 as? [String: Any] }.prefix(4).map { s -> [String: Any] in
            let values = (s["values"] as? [Any] ?? []).prefix(labels.count).map { v -> Any in
                if let n = v as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite { return n }
                return NSNull()
            }
            return ["name": clean(s["name"] as? String ?? "Series", 60), "values": values + Array(repeating: NSNull(), count: max(0, labels.count - values.count))]
        }
        guard !labels.isEmpty, series.contains(where: { ($0["values"] as? [Any] ?? []).contains { $0 is NSNumber } }) else { out.notes.append("Chart \(label) needs labels and at least one series of numbers; it wasn't shown."); return false }
        block["kind"] = raw["kind"] as? String == "line" ? "line" : "bar"
        block["labels"] = Array(labels); block["series"] = Array(series)
        if let unit = optional(raw["unit"], 16) { block["unit"] = unit }
        return true
    }

    @MainActor private static func stats(_ raw: [String: Any], into block: inout [String: Any], label: String, out: inout Checked) -> Bool {
        let numbers = (raw["numbers"] as? [Any] ?? []).compactMap { $0 as? [String: Any] }.prefix(4).compactMap { n -> [String: Any]? in
            guard let name = optional(n["label"], 60) else { return nil }
            var item: [String: Any] = ["label": name, "value": value(n["value"] ?? NSNull(), kind: "text", place: nil)]
            for key in ["unit": 16, "note": 120] { if let v = optional(n[key.key], key.value) { item[key.key] = v } }
            if let tone = n["tone"] as? String, ["good", "warn"].contains(tone) { item["tone"] = tone }
            return item
        }
        guard !numbers.isEmpty else { out.notes.append("Key numbers \(label) needs at least one number with a label; it wasn't shown."); return false }
        block["numbers"] = Array(numbers); return true
    }

    @MainActor private static func compare(_ raw: [String: Any], into block: inout [String: Any], label: String, out: inout Checked) -> Bool {
        var options = choices(raw["options"], max: 4)
        options = options.map { o in
            var o = o
            o["facts"] = (o["raw"] as? [String: Any])?["facts"].flatMap { $0 as? [Any] }.map { list in list.compactMap { $0 as? [String: Any] }.prefix(12).compactMap { f -> [String: Any]? in
                guard let name = optional(f["label"], 60) else { return nil }
                return ["label": name, "value": value(f["value"] ?? NSNull(), kind: "text", place: nil)]
            } } ?? []
            o.removeValue(forKey: "raw"); return o
        }
        if (raw["options"] as? [Any])?.count ?? 0 > 4 { out.notes.append("Comparison \(label): only the first 4 options are shown.") }
        guard options.count >= 2 else { out.notes.append("Comparison \(label) needs at least two options; it wasn't shown."); return false }
        block["options"] = options
        if let pick = raw["pick"] as? String, options.contains(where: { $0["id"] as? String == slug(pick) }) { block["pick"] = slug(pick) }
        return true
    }

    @MainActor private static func timeline(_ raw: [String: Any], into block: inout [String: Any], label: String, out: inout Checked) -> Bool {
        let events = (raw["events"] as? [Any] ?? []).compactMap { $0 as? [String: Any] }.prefix(30).compactMap { e -> [String: Any]? in
            guard let title = optional(e["title"], 120), let date = optional(e["date"], 10) else { return nil }
            var item: [String: Any] = ["date": date, "title": title, "state": ["done", "next"].contains(e["state"] as? String ?? "") ? e["state"] as! String : "later"]
            if let detail = optional(e["detail"], 200) { item["detail"] = detail }
            return item
        }
        guard !events.isEmpty else { out.notes.append("Timeline \(label) needs events with a date and a title; it wasn't shown."); return false }
        block["events"] = Array(events); return true
    }

    @MainActor private static func files(_ raw: [String: Any], into block: inout [String: Any], label: String, place: Place?, out: inout Checked) -> Bool {
        var missing: [String] = []
        let items = (raw["files"] as? [Any] ?? []).compactMap { $0 as? [String: Any] }.prefix(20).compactMap { f -> [String: Any]? in
            guard let path = optional(f["path"], 500) else { return nil }
            var item: [String: Any] = ["path": path]
            if let note = optional(f["note"], 160) { item["note"] = note }
            if let place, let found = place.files.blockFile(place.scope, path: path, folderId: (f["folderId"] as? String).flatMap { $0.isEmpty ? nil : $0 }) {
                item["folderId"] = found["folderId"] ?? ""; item["bytes"] = found["bytes"] ?? 0
            } else { item["missing"] = true; missing.append((path as NSString).lastPathComponent) }
            return item
        }
        guard !items.isEmpty else { out.notes.append("Files \(label) needs at least one file path; it wasn't shown."); return false }
        if !missing.isEmpty { out.notes.append("Files \(label): \(missing.count) of \(items.count) \(items.count == 1 ? "file isn't" : "files aren't") in a connected folder and \(missing.count == 1 ? "shows" : "show") as not found: \(missing.joined(separator: ", ")). Use paths relative to a connected folder, with its folderId.") }
        block["files"] = Array(items); return true
    }

    @MainActor private static func choice(_ raw: [String: Any], into block: inout [String: Any], label: String, out: inout Checked) -> Bool {
        let options = choices(raw["options"], max: 6).map { o -> [String: Any] in var o = o; o.removeValue(forKey: "raw"); o.removeValue(forKey: "note"); return o }
        if (raw["options"] as? [Any])?.count ?? 0 > 6 { out.notes.append("Choice \(label): only the first 6 options are shown.") }
        guard let question = optional(raw["question"], 200) ?? (block["title"] as? String), options.count >= 2 else { out.notes.append("Choice \(label) needs a question and at least two options; it wasn't shown."); return false }
        block["question"] = question; block["options"] = options
        block["multiple"] = raw["multiple"] as? Bool == true; block["other"] = raw["other"] as? Bool == true
        let ids = Set(options.compactMap { $0["id"] as? String })
        let recommend = ((raw["recommend"] as? [Any]) ?? (raw["recommend"].map { [$0] } ?? [])).compactMap { ($0 as? String).map(slug) }.filter(ids.contains)
        if !recommend.isEmpty { block["recommend"] = block["multiple"] as? Bool == true ? recommend : [recommend[0]] }
        block["submit"] = optional(raw["submit"], 40) ?? "Send"
        return true
    }

    /// Words that mark a field as asking for a secret: forms never collect those (sign-ins have their own private field).
    static func secret(_ text: String) -> Bool {
        text.range(of: #"(?i)pass ?(word|code|phrase)|\bpin\b|\botp\b|one[- ]time|verification code|security code|2fa|two[- ]factor|\bcvv\b|\bcvc\b|card number|credit card|debit card|\bssn\b|social security|routing number|account number|api[ _-]?key|access token|\btoken\b|secret|private key"#, options: .regularExpression) != nil
    }

    @MainActor private static func form(_ raw: [String: Any], into block: inout [String: Any], label: String, out: inout Checked) -> Bool {
        var ids = Set<String>(), refused: [String] = []
        let fields = (raw["fields"] as? [Any] ?? []).compactMap { $0 as? [String: Any] }.prefix(8).compactMap { f -> [String: Any]? in
            guard let name = optional(f["label"], 80) else { return nil }
            var id = slug(f["id"] as? String ?? ""); if id.isEmpty { id = slug(name) }; if id.isEmpty { id = "field" }
            if secret(name + " " + id + " " + (f["placeholder"] as? String ?? "")) { refused.append(name); return nil }
            if ids.contains(id) { var n = 2; while ids.contains("\(id)-\(n)") { n += 1 }; id = "\(id)-\(n)" }
            ids.insert(id)
            var kind = f["kind"] as? String ?? "text"; if !fieldKinds.contains(kind) { kind = "text" }
            var field: [String: Any] = ["id": id, "label": name, "kind": kind, "required": f["required"] as? Bool == true]
            if kind == "select" {
                let options = (f["options"] as? [Any] ?? []).compactMap { $0 as? String }.prefix(12).map { clean($0, 80) }.filter { !$0.isEmpty }
                if options.isEmpty { field["kind"] = "text" } else { field["options"] = Array(options) }
            }
            if let placeholder = optional(f["placeholder"], 120) { field["placeholder"] = placeholder }
            if let given = f["value"], !(given is NSNull) {
                if kind == "toggle" { field["value"] = (given as? Bool) ?? ((given as? NSNumber)?.boolValue ?? false) }
                else if let n = given as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() { field["value"] = n.stringValue }
                else if let s = given as? String { field["value"] = clean(s, 300) }
            }
            return field
        }
        if (raw["fields"] as? [Any])?.count ?? 0 > 8 { out.notes.append("Form \(label): only the first 8 fields are shown.") }
        if !refused.isEmpty { out.notes.append("Form \(label): removed \(refused.map { "“\($0)”" }.joined(separator: ", ")). Forms can't ask for passwords, codes, card numbers or keys; a sign-in goes through Buddy's sign-in tools.") }
        guard !fields.isEmpty else { out.notes.append("Form \(label) has no fields Buddy can show; it wasn't shown."); return false }
        block["fields"] = Array(fields); block["submit"] = optional(raw["submit"], 40) ?? "Send"
        return true
    }

    @MainActor private static func checklist(_ raw: [String: Any], into block: inout [String: Any], label: String, out: inout Checked) -> Bool {
        var ids = Set<String>()
        let checks = (raw["checks"] as? [Any] ?? []).compactMap { $0 as? [String: Any] }.prefix(20).compactMap { c -> [String: Any]? in
            guard let name = optional(c["label"], 120) else { return nil }
            var id = slug(c["id"] as? String ?? ""); if id.isEmpty { id = slug(name) }; if id.isEmpty { id = "item" }
            if ids.contains(id) { var n = 2; while ids.contains("\(id)-\(n)") { n += 1 }; id = "\(id)-\(n)" }
            ids.insert(id)
            var item: [String: Any] = ["id": id, "label": name, "checked": c["checked"] as? Bool == true]
            if let detail = optional(c["detail"], 200) { item["detail"] = detail }
            return item
        }
        guard !checks.isEmpty else { out.notes.append("Checklist \(label) needs at least one item; it wasn't shown."); return false }
        block["checks"] = Array(checks); block["submit"] = optional(raw["submit"], 40) ?? "Send"
        return true
    }

    // MARK: - helpers

    /// Options for a comparison or a choice: an id, a label, a detail and a note, each id unique; `raw` keeps the agent's entry for facts.
    private static func choices(_ value: Any?, max: Int) -> [[String: Any]] {
        var ids = Set<String>()
        return (value as? [Any] ?? []).compactMap { $0 as? [String: Any] }.prefix(max).compactMap { o -> [String: Any]? in
            guard let label = optional(o["label"], 80) else { return nil }
            var id = slug(o["id"] as? String ?? ""); if id.isEmpty { id = slug(label) }; if id.isEmpty { id = "option" }
            if ids.contains(id) { var n = 2; while ids.contains("\(id)-\(n)") { n += 1 }; id = "\(id)-\(n)" }
            ids.insert(id)
            var option: [String: Any] = ["id": id, "label": label, "raw": o]
            if let detail = optional(o["detail"], 200) { option["detail"] = detail }
            if let note = optional(o["note"], 160) { option["note"] = note }
            return option
        }
    }

    /// Plain text on one line: control characters and runs of spaces become one space, cut to `max` characters.
    static func clean(_ text: String, _ max: Int) -> String {
        let flat = text.unicodeScalars.map { CharacterSet.controlCharacters.contains($0) ? " " : String($0) }.joined()
        let squeezed = flat.split(whereSeparator: { $0 == " " }).joined(separator: " ")
        return squeezed.count > max ? String(squeezed.prefix(max - 1)) + "…" : squeezed
    }
    private static func optional(_ value: Any?, _ max: Int) -> String? {
        guard let string = value as? String else { return nil }
        let text = clean(string, max); return text.isEmpty ? nil : text
    }
    static func slug(_ text: String) -> String {
        let kept = text.lowercased().map { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" ? String($0) : "-" }.joined()
        return String(kept.split(separator: "-").joined(separator: "-").prefix(40))
    }
    private static func letter(_ index: Int) -> String {
        var n = index + 1, name = ""
        while n > 0 { let r = (n - 1) % 26; name = String(UnicodeScalar(65 + r)!) + name; n = (n - 1) / 26 }
        return name
    }
}
