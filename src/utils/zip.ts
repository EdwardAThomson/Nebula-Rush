// Minimal "stored" (no-compression) ZIP writer. PNG/JPEG screenshots are
// already compressed, so store mode bundles them into a single .zip without
// pulling in a compression dependency. Lets "Download all" be one file/one
// download instead of N programmatic downloads (which browsers gate behind a
// "allow multiple downloads" prompt and often silently drop).

const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();

const crc32 = (data: Uint8Array): number => {
    let c = 0xffffffff;
    for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

export interface ZipEntry {
    name: string;
    data: Uint8Array;
}

export const createStoredZip = (entries: ZipEntry[]): Blob => {
    const encoder = new TextEncoder();
    const parts: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;

    for (const entry of entries) {
        const nameBytes = encoder.encode(entry.name);
        const crc = crc32(entry.data);
        const size = entry.data.length;

        // Local file header (30 bytes) + filename
        const local = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true); // signature
        lv.setUint16(4, 20, true);         // version needed
        lv.setUint16(6, 0, true);          // flags
        lv.setUint16(8, 0, true);          // method: 0 = store
        lv.setUint16(10, 0, true);         // mod time
        lv.setUint16(12, 0, true);         // mod date
        lv.setUint32(14, crc, true);
        lv.setUint32(18, size, true);      // compressed size
        lv.setUint32(22, size, true);      // uncompressed size
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);         // extra len
        local.set(nameBytes, 30);
        parts.push(local, entry.data);

        // Central directory header (46 bytes) + filename
        const cd = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(cd.buffer);
        cv.setUint32(0, 0x02014b50, true); // signature
        cv.setUint16(4, 20, true);         // version made by
        cv.setUint16(6, 20, true);         // version needed
        cv.setUint16(8, 0, true);          // flags
        cv.setUint16(10, 0, true);         // method
        cv.setUint16(12, 0, true);         // mod time
        cv.setUint16(14, 0, true);         // mod date
        cv.setUint32(16, crc, true);
        cv.setUint32(20, size, true);      // compressed size
        cv.setUint32(24, size, true);      // uncompressed size
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint16(30, 0, true);         // extra len
        cv.setUint16(32, 0, true);         // comment len
        cv.setUint16(34, 0, true);         // disk number
        cv.setUint16(36, 0, true);         // internal attrs
        cv.setUint32(38, 0, true);         // external attrs
        cv.setUint32(42, offset, true);    // local header offset
        cd.set(nameBytes, 46);
        central.push(cd);

        offset += local.length + size;
    }

    const centralSize = central.reduce((s, c) => s + c.length, 0);

    // End of central directory record (22 bytes)
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true); // signature
    ev.setUint16(4, 0, true);          // disk number
    ev.setUint16(6, 0, true);          // central dir start disk
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);    // central dir offset
    ev.setUint16(20, 0, true);         // comment len

    return new Blob([...parts, ...central, eocd] as unknown as BlobPart[], { type: 'application/zip' });
};
