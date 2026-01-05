import Foundation

enum ClawdisEnv {
    static func path(_ key: String) -> String? {
        // Normalize env overrides once so UI + file IO stay consistent.
        guard let value = ProcessInfo.processInfo.environment[key]?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !value.isEmpty
        else {
            return nil
        }
        return value
    }
}

enum ClawdisPaths {
    private static let configPathEnv = "CLAWDIS_CONFIG_PATH"
    private static let stateDirEnv = "CLAWDIS_STATE_DIR"

    static var stateDirURL: URL {
        if let override = ClawdisEnv.path(self.stateDirEnv) {
            return URL(fileURLWithPath: override, isDirectory: true)
        }
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".clawdis", isDirectory: true)
    }

    static var configURL: URL {
        if let override = ClawdisEnv.path(self.configPathEnv) {
            return URL(fileURLWithPath: override)
        }
        return self.stateDirURL.appendingPathComponent("clawdis.json")
    }

    static var workspaceURL: URL {
        self.stateDirURL.appendingPathComponent("workspace", isDirectory: true)
    }
}
