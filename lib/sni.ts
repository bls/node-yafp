// Parse TLS ClientHello to see if the client supports SNI
// Logic adapted from: https://github.com/dlundquist/sniproxy/blob/master/src/tls.c

const TLS_HEADER_LEN = 5,
      TLS_HANDSHAKE_CONTENT_TYPE = 0x16,
      TLS_HANDSHAKE_TYPE_CLIENT_HELLO = 0x01;

export function hasSNI(buf: Buffer): boolean {
    // Check that our TCP payload is at least large enough for a TLS header
    if(buf.length < TLS_HEADER_LEN) {
        return false;
    }

    // SSL 2.0 compatible Client Hello?
    if (buf.readUInt8(0) & 0x80 && buf.readUInt8(2) == 1) {
        // High bit of first byte (length) and content type is Client Hello
        // See RFC5246 Appendix E.2
        // Received SSL 2.0 Client Hello which can not support SNI.
        return false;
    }

    let tls_content_type = buf.readUInt8(0),
        tls_version_major = buf.readUInt8(1),
        tls_version_minor = buf.readUInt8(2);

    if (tls_content_type != TLS_HANDSHAKE_CONTENT_TYPE) {
        // Request did not begin with TLS handshake.
        return false;
    }

    if (tls_version_major < 3) {
        // debug("Received SSL %d.%d handshake which which can not support SNI.",
        //    tls_version_major, tls_version_minor);
        return false;
    }

    let len: number = (buf.readUInt8(3) << 8) + buf.readUInt8(4) + TLS_HEADER_LEN,
        data_len = Math.min(buf.length, len);

    if(data_len < len) {
        // Not enough data, maybe we didn't read the whole TLS record?
        return false;
    }


}