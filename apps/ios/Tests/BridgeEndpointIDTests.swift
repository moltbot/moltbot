import ClawdisKit
import Network
import Testing
@testable import Clawdis

@Suite struct BridgeEndpointIDTests {
    @Test func stableIDForServiceDecodesAndNormalizesName() {
        let endpoint = NWEndpoint.service(
            name: "Clawdis\\032Bridge   \\032  Node\n",
            type: "_clawdis-bridge._tcp",
            domain: "local.",
            interface: nil)

        #expect(BridgeEndpointID.stableID(endpoint) == "_clawdis-bridge._tcp|local.|Clawdis Bridge Node")
    }

    @Test func stableIDForNonServiceUsesEndpointDescription() {
        let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host("127.0.0.1"), port: 4242)
        #expect(BridgeEndpointID.stableID(endpoint) == String(describing: endpoint))
    }

    @Test func prettyDescriptionDecodesBonjourEscapes() {
        let endpoint = NWEndpoint.service(
            name: "Clawdis\\032Bridge",
            type: "_clawdis-bridge._tcp",
            domain: "local.",
            interface: nil)

        let pretty = BridgeEndpointID.prettyDescription(endpoint)
        #expect(pretty == BonjourEscapes.decode(String(describing: endpoint)))
        #expect(!pretty.localizedCaseInsensitiveContains("\\032"))
    }
}
