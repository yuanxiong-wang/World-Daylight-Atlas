import Foundation

// Uses BinaryExplorer's unmodified Core sources; the desktop UI is not launched.
@main
struct InspectIOSBinary {
    static func main() throws {
        guard CommandLine.arguments.count == 4 else {
            throw NSError(domain: "BinaryAudit", code: 1, userInfo: [NSLocalizedDescriptionKey: "Expected input.ipa output-directory BinaryExplorer-revision"])
        }
        let source = URL(fileURLWithPath: CommandLine.arguments[1])
        let output = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
        try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
        let analysis = try IPAAnalyzer.analyze(url: source) { progress in
            print("\(progress.stage.rawValue): \(Int(progress.fraction * 100))%")
        }
        defer { try? FileManager.default.removeItem(at: analysis.extractionRoot) }
        let app = analysis.app
        let binaries: [[String: Any]] = analysis.allBundles.compactMap { bundle in
            guard let macho = bundle.machO else { return nil }
            let slices: [[String: Any]] = macho.slices.map { slice in
                ["architecture": slice.architecture, "platform": slice.platform ?? "unknown",
                 "minimumOS": slice.minimumOS ?? "unknown", "sdk": slice.sdk ?? "unknown",
                 "bytes": slice.size, "textBytes": slice.textSize,
                 "positionIndependent": slice.isPositionIndependent,
                 "hasCodeSignature": slice.codeSignature != nil,
                 "adHocSignature": slice.codeSignature?.isAdHoc ?? false,
                 "chainedFixups": slice.hasChainedFixups,
                 "encrypted": slice.encryption?.isEncrypted ?? false,
                 "rpaths": slice.rpaths,
                 "libraries": slice.libraries.map { ["path": $0.path, "kind": $0.kind.rawValue] }]
            }
            return ["bundle": bundle.relativePath, "bytes": macho.fileSize, "slices": slices]
        }
        let findings = analysis.insights.map { ["level": $0.level.title, "category": $0.category, "title": $0.title, "detail": $0.detail] }
        let privacy: [[String: Any]] = analysis.privacyManifests.map {
            ["owner": $0.owner, "tracking": $0.tracking, "trackingDomains": $0.trackingDomains,
             "collectedDataTypes": $0.collectedDataTypes, "accessedAPITypes": $0.accessedAPITypes]
        }
        let report: [String: Any] = [
            "tool": "Viktorianec/BinaryExplorer Core", "toolRevision": CommandLine.arguments[3],
            "scope": "Unsigned device archive repackaged for static inspection; not a signed or installable distribution IPA.",
            "bundleIdentifier": app.bundleIdentifier, "displayName": app.displayName,
            "version": app.shortVersion, "build": app.buildNumber, "minimumOS": app.minimumOS ?? "unknown",
            "platforms": app.platforms, "deviceFamilies": app.deviceFamilies,
            "archiveBytes": analysis.archiveSize, "installedBytes": analysis.uncompressedSize,
            "files": analysis.payloadRoot.fileCount, "hasProvisioningProfile": app.provisioning != nil,
            "usageDescriptions": app.usageDescriptions.map { ["key": $0.key, "value": $0.value] },
            "appTransportSecurity": app.appTransportSecurity ?? [:],
            "nonExemptEncryption": app.encryptionDeclared as Any? ?? NSNull(),
            "backgroundModes": app.backgroundModes, "urlSchemes": app.urlSchemes,
            "privacyManifests": privacy, "binaries": binaries, "findings": findings,
            "largestFiles": analysis.largestFiles.prefix(12).map { ["path": $0.relativePath, "bytes": $0.size] as [String: Any] }
        ]
        let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: output.appendingPathComponent("binary-explorer-report.json"))
        var markdown = "# BinaryExplorer inspection\n\n"
        markdown += "Tool revision: `\(CommandLine.arguments[3])`\n\n"
        markdown += "Unsigned device build, repackaged for inspection only. Signing/profile findings are expected until Apple distribution signing. This report does not verify signature validity or App Store acceptance.\n\n"
        markdown += "- Bundle: `\(app.bundleIdentifier)`\n- Minimum iOS: \(app.minimumOS ?? "unknown")\n- Installed size: \(analysis.uncompressedSize) bytes\n- Privacy manifests: \(privacy.count)\n\n"
        for item in analysis.insights {
            markdown += "## \(item.level.title): \(item.title)\n\n\(item.detail)\n\n"
        }
        try markdown.write(to: output.appendingPathComponent("binary-explorer-report.md"), atomically: true, encoding: .utf8)
        print("Report written: \(analysis.insights.count) findings, \(binaries.count) binaries, \(privacy.count) privacy manifests")
    }
}
