import * as assert from 'assert';
import * as sni from '../lib/sni';

const good_data: number[] = [
    // TLS record
    0x16, // Content Type: Handshake
    0x03, 0x01, // Version: TLS 1.0
    0x00, 0x6c, // Length (use for bounds checking)
    // Handshake
    0x01, // Handshake Type: Client Hello
    0x00, 0x00, 0x68, // Length (use for bounds checking)
    0x03, 0x03, // Version: TLS 1.2
    // Random (32 bytes fixed length)
    0xb6, 0xb2, 0x6a, 0xfb, 0x55, 0x5e, 0x03, 0xd5,
    0x65, 0xa3, 0x6a, 0xf0, 0x5e, 0xa5, 0x43, 0x02,
    0x93, 0xb9, 0x59, 0xa7, 0x54, 0xc3, 0xdd, 0x78,
    0x57, 0x58, 0x34, 0xc5, 0x82, 0xfd, 0x53, 0xd1,
    0x00, // Session ID Length (skip past this much)
    0x00, 0x04, // Cipher Suites Length (skip past this much)
    0x00, 0x01, // NULL-MD5
    0x00, 0xff, // RENEGOTIATION INFO SCSV
    0x01, // Compression Methods Length (skip past this much)
    0x00, // NULL
    0x00, 0x3b, // Extensions Length (use for bounds checking)
    // Extension
    0x00, 0x00, // Extension Type: Server Name (check extension type)
    0x00, 0x0e, // Length (use for bounds checking)
    0x00, 0x0c, // Server Name Indication Length
    0x00, // Server Name Type: host_name (check server name type)
    0x00, 0x09, // Length (length of your data)
    // "localhost" (data your after)
    0x6c, 0x6f, 0x63, 0x61, 0x6c, 0x68, 0x6f, 0x73, 0x74,
    // Extension
    0x00, 0x0d, // Extension Type: Signature Algorithms (check extension type)
    0x00, 0x20, // Length (skip past since this is the wrong extension)
    // Data
    0x00, 0x1e, 0x06, 0x01, 0x06, 0x02, 0x06, 0x03,
    0x05, 0x01, 0x05, 0x02, 0x05, 0x03, 0x04, 0x01,
    0x04, 0x02, 0x04, 0x03, 0x03, 0x01, 0x03, 0x02,
    0x03, 0x03, 0x02, 0x01, 0x02, 0x02, 0x02, 0x03,
    // Extension
    0x00, 0x0f, // Extension Type: Heart Beat (check extension type)
    0x00, 0x01, // Length (skip past since this is the wrong extension)
    0x01 // Mode: Peer allows to send requests
];

describe('ClientHello SNI extraction', function() {
    it('should extract a hostname from a ClientHello with SNI extension', function() {
        let data = new Buffer(good_data),
            hostname = sni.extractServerNameFromClientHello(data);
        assert.equal(hostname, 'localhost');
    });
});
