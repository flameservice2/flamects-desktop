#!/usr/bin/env python3
"""Signs an unsigned, zip-aligned APK with APK Signature Scheme v2
(RSA PKCS#1 v1.5 + SHA-256), the scheme Android 7+ checks.

    python3 sign_apk.py in.apk out.apk key.p12 PASSWORD

The key file is a PKCS#12 keystore holding the release key and its
certificate. Every Flame CTS APK must be signed with the same key, or phones
refuse to install it over the previous one.
"""
import hashlib
import struct
import sys

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import pkcs12

V2_ID = 0x7109871A
RSA_PKCS1_SHA256 = 0x0103
CHUNK = 1 << 20


def lp(b):
    """uint32 little-endian length prefix."""
    return struct.pack('<I', len(b)) + b


def find_eocd(data):
    for i in range(len(data) - 22, max(-1, len(data) - 22 - 65536), -1):
        if data[i:i + 4] == b'PK\x05\x06':
            return i
    raise SystemExit('Not a zip file (no end of central directory).')


def chunked_digest(sections):
    digests = []
    for s in sections:
        for off in range(0, len(s), CHUNK):
            c = s[off:off + CHUNK]
            digests.append(hashlib.sha256(b'\xa5' + struct.pack('<I', len(c)) + c).digest())
    return hashlib.sha256(b'\x5a' + struct.pack('<I', len(digests)) + b''.join(digests)).digest()


def sign(inp, out, keyfile, password):
    data = open(inp, 'rb').read()
    eocd = find_eocd(data)
    cd_size, cd_off = struct.unpack('<II', data[eocd + 12:eocd + 20])
    if data[cd_off - 16:cd_off] == b'APK Sig Block 42':
        raise SystemExit('This APK is already signed.')
    entries, cd, eocd_bytes = data[:cd_off], data[cd_off:cd_off + cd_size], data[eocd:]

    key, cert, _ = pkcs12.load_key_and_certificates(open(keyfile, 'rb').read(), password.encode())
    cert_der = cert.public_bytes(serialization.Encoding.DER)
    pub_der = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)

    # The EOCD is digested with its central-directory offset pointing at the
    # signing block, which starts exactly where the central directory starts now.
    digest = chunked_digest([entries, cd, eocd_bytes])
    signed_data = (lp(lp(struct.pack('<I', RSA_PKCS1_SHA256) + lp(digest)))
                   + lp(lp(cert_der))
                   + lp(b''))
    sig = key.sign(signed_data, padding.PKCS1v15(), hashes.SHA256())
    signer = lp(signed_data) + lp(lp(struct.pack('<I', RSA_PKCS1_SHA256) + lp(sig))) + lp(pub_der)
    v2 = lp(lp(signer))

    pair = struct.pack('<Q', 4 + len(v2)) + struct.pack('<I', V2_ID) + v2
    size = len(pair) + 8 + 16
    block = struct.pack('<Q', size) + pair + struct.pack('<Q', size) + b'APK Sig Block 42'

    new_eocd = eocd_bytes[:16] + struct.pack('<I', cd_off + len(block)) + eocd_bytes[20:]
    with open(out, 'wb') as f:
        f.write(entries + block + cd + new_eocd)


if __name__ == '__main__':
    if len(sys.argv) != 5:
        raise SystemExit(__doc__)
    sign(*sys.argv[1:])
