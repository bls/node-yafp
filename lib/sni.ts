// Parse TLS ClientHello to see if the client supports SNI
// Logic from: https://github.com/dlundquist/sniproxy/blob/master/src/tls.c @ 6fa5157
// Ported as directly as possible to TypeScript.

/* tslint:disable:no-bitwise */

export function extractServerNameFromClientHello(buf: Buffer): string {
    return parse_tls_header(new Uint8Array(buf));
}

const TLS_HEADER_LEN = 5,
      TLS_HANDSHAKE_CONTENT_TYPE = 0x16,
      TLS_HANDSHAKE_TYPE_CLIENT_HELLO = 0x01;

// Parse a TLS packet for the Server Name Indication extension in the client
// hello handshake, returning the first servername found.

function parse_tls_header(data: Uint8Array): string {
    let tls_content_type: number,
        tls_version_major: number,
        tls_version_minor: number,
        pos: number = TLS_HEADER_LEN,
        len: number,
        data_len = data.byteLength;

    /* Check that our TCP payload is at least large enough for a TLS header */
    if (data_len < TLS_HEADER_LEN) {
        throw new Error('ClientHello too short');
    }

    /* SSL 2.0 compatible Client Hello
     *
     * High bit of first byte (length) and content type is Client Hello
     *
     * See RFC5246 Appendix E.2
     */
    if (data[0] & 0x80 && data[2] === 1) {
        throw new Error('Received SSL 2.0 Client Hello which can not support SNI.');
    }

    tls_content_type = data[0];
    if (tls_content_type !== TLS_HANDSHAKE_CONTENT_TYPE) {
        throw new Error('Request did not begin with TLS handshake.');
    }

    tls_version_major = data[1];
    tls_version_minor = data[2];
    if (tls_version_major < 3) {
        let ver = `${tls_version_major}.${tls_version_minor}`;
        throw new Error(`Received SSL ${ver} handshake which which can not support SNI.`);
    }

    /* TLS record length */
    len = (data[3] << 8) + data[4] + TLS_HEADER_LEN;
    data_len = Math.min(data_len, len);

    /* Check we received entire TLS record length */
    if (data_len < len) {
        throw new Error('ClientHello length mismatch');
    }

    /*
     * Handshake
     */
    if (pos + 1 > data_len) {
        throw new Error('Could not read handshake type');
    }
    if (data[pos] !== TLS_HANDSHAKE_TYPE_CLIENT_HELLO) {
        throw new Error('Not a ClientHello');
    }

    /* Skip past fixed length records:
     1	Handshake Type
     3	Length
     2	Version (again)
     32	Random
     to	Session ID Length
     */
    pos += 38;

    /* Session ID */
    if (pos + 1 > data_len) {
        throw new Error('Could not read session ID length');
    }
    len = data[pos];
    pos += 1 + len;

    /* Cipher Suites */
    if (pos + 2 > data_len) {
        throw new Error('Could not read cipher suite length');
    }
    len = (data[pos] << 8) + data[pos + 1];
    pos += 2 + len;

    /* Compression Methods */
    if (pos + 1 > data_len) {
        throw new Error('Could not read compression message length');
    }
    len = data[pos];
    pos += 1 + len;

    if (pos === data_len && tls_version_major === 3 && tls_version_minor === 0) {
        throw new Error('Received SSL 3.0 handshake without extensions');
    }

    /* Extensions */
    if (pos + 2 > data_len) {
        throw new Error('Could not read TLS extensions length');
    }
    len = (data[pos] << 8) + data[pos + 1];
    pos += 2;

    if (pos + len > data_len) {
        throw new Error('Packet is too short to hold extensions');
    }
    return parse_extensions(data.slice(pos, pos + len));
}

function parse_extensions(data: Uint8Array) {
    let pos: number = 0,
        data_len = data.byteLength;

    /* Parse each 4 bytes for the extension header */
    while (pos + 4 <= data_len) {
        /* Extension Length */
        let len = (data[pos + 2] << 8) + data[pos + 3];

        /* Check if it's a server name extension */
        if (data[pos] === 0x00 && data[pos + 1] === 0x00) {
            /* There can be only one extension of each type, so we break
             our state and move p to beinnging of the extension here */
            if (pos + 4 + len > data_len) {
                throw new Error('Oops, failed to read TLS extensions');
            }
            return parse_server_name_extension(data.slice(pos + 4, pos + 4 + len));
        }
        pos += 4 + len; /* Advance to the next extension header */
    }
    /* Check we ended where we expected to */
    if (pos !== data_len) {
        throw new Error('Failed to parse all TLS extensions, corrupt ClientHello?');
    }

    throw new Error('SNI extension not found');
}

function parse_server_name_extension(data: Uint8Array) {
    let pos: number = 2,
        data_len: number = data.byteLength;

    while (pos + 3 < data_len) {
        let len = (data[pos + 1] << 8) + data[pos + 2];

        if (pos + 3 + len > data_len) {
            throw new Error('Error parsing SNI extension');
        }

        switch (data[pos]) { /* name type */
            case 0x00: /* host_name */
                let namebuf = data.slice(pos + 3, pos + 3 + len);
                return String.fromCharCode.apply(null, namebuf);
            default:
                // Ignore unknown SNI extension name type
                // throw new Error(`Unknown server name extension name type: ${data[pos]}`);
        }
        pos += 3 + len;
    }
    /* Check we ended where we expected to */
    if (pos !== data_len) {
        throw new Error('Error parsing SNI extension: failed to consume everything');
    }

    throw new Error('SNI hostname not found :(');
}
