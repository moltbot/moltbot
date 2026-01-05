import Foundation

public struct ClawdisCanvasNavigateParams: Codable, Sendable, Equatable {
    public var url: String

    public init(url: String) {
        self.url = url
    }
}

public struct ClawdisCanvasPlacement: Codable, Sendable, Equatable {
    public var x: Double?
    public var y: Double?
    public var width: Double?
    public var height: Double?

    public init(x: Double? = nil, y: Double? = nil, width: Double? = nil, height: Double? = nil) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }
}

public struct ClawdisCanvasPresentParams: Codable, Sendable, Equatable {
    public var url: String?
    public var placement: ClawdisCanvasPlacement?

    public init(url: String? = nil, placement: ClawdisCanvasPlacement? = nil) {
        self.url = url
        self.placement = placement
    }
}

public struct ClawdisCanvasEvalParams: Codable, Sendable, Equatable {
    public var javaScript: String

    public init(javaScript: String) {
        self.javaScript = javaScript
    }
}

public enum ClawdisCanvasSnapshotFormat: String, Codable, Sendable {
    case png
    case jpeg

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        let raw = try c.decode(String.self).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        switch raw {
        case "png":
            self = .png
        case "jpeg", "jpg":
            self = .jpeg
        default:
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Invalid snapshot format: \(raw)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(self.rawValue)
    }
}

public struct ClawdisCanvasSnapshotParams: Codable, Sendable, Equatable {
    public var maxWidth: Int?
    public var quality: Double?
    public var format: ClawdisCanvasSnapshotFormat?

    public init(maxWidth: Int? = nil, quality: Double? = nil, format: ClawdisCanvasSnapshotFormat? = nil) {
        self.maxWidth = maxWidth
        self.quality = quality
        self.format = format
    }
}
