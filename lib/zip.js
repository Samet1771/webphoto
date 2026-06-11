/*
 * lib/zip.js
 * Minimal, self-contained ZIP writer (STORE method — no compression, since
 * PNG/JPEG are already compressed). No third-party code and no network: this
 * keeps FoxSS fully auditable and offline. Exposes a global `FoxZip`.
 *
 * Not Zip64 — fine for screenshots (well under the 4 GB per-file limit).
 */
"use strict";

const FoxZip = (() => {
  // Precomputed CRC-32 table (IEEE polynomial).
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  // Encode a Date into DOS time/date fields used by the ZIP format.
  function dosDateTime(d) {
    const time =
      ((d.getHours() & 0x1f) << 11) |
      ((d.getMinutes() & 0x3f) << 5) |
      ((d.getSeconds() / 2) & 0x1f);
    const date =
      (((d.getFullYear() - 1980) & 0x7f) << 9) |
      (((d.getMonth() + 1) & 0x0f) << 5) |
      (d.getDate() & 0x1f);
    return { time, date };
  }

  const encoder = new TextEncoder();

  // entries: [{ name: string, blob: Blob }] -> Promise<Blob> (application/zip)
  async function create(entries) {
    const { time, date } = dosDateTime(new Date());
    const localParts = [];
    const records = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBytes = encoder.encode(entry.name);
      const data = new Uint8Array(await entry.blob.arrayBuffer());
      const crc = crc32(data);
      const size = data.length;

      const header = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(header.buffer);
      dv.setUint32(0, 0x04034b50, true); // local file header signature
      dv.setUint16(4, 20, true); // version needed to extract
      dv.setUint16(6, 0x0800, true); // flags: bit 11 = UTF-8 filename
      dv.setUint16(8, 0, true); // compression method 0 = store
      dv.setUint16(10, time, true);
      dv.setUint16(12, date, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true); // compressed size
      dv.setUint32(22, size, true); // uncompressed size
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true); // extra field length
      header.set(nameBytes, 30);

      localParts.push(header, data);
      records.push({ nameBytes, crc, size, offset });
      offset += header.length + size;
    }

    const centralParts = [];
    let centralSize = 0;
    for (const rec of records) {
      const cd = new Uint8Array(46 + rec.nameBytes.length);
      const dv = new DataView(cd.buffer);
      dv.setUint32(0, 0x02014b50, true); // central directory signature
      dv.setUint16(4, 20, true); // version made by
      dv.setUint16(6, 20, true); // version needed
      dv.setUint16(8, 0x0800, true); // flags: UTF-8
      dv.setUint16(10, 0, true); // method store
      dv.setUint16(12, time, true);
      dv.setUint16(14, date, true);
      dv.setUint32(16, rec.crc, true);
      dv.setUint32(20, rec.size, true);
      dv.setUint32(24, rec.size, true);
      dv.setUint16(28, rec.nameBytes.length, true);
      dv.setUint16(30, 0, true); // extra length
      dv.setUint16(32, 0, true); // comment length
      dv.setUint16(34, 0, true); // disk number start
      dv.setUint16(36, 0, true); // internal attributes
      dv.setUint32(38, 0, true); // external attributes
      dv.setUint32(42, rec.offset, true); // offset of local header
      cd.set(rec.nameBytes, 46);
      centralParts.push(cd);
      centralSize += cd.length;
    }

    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true); // end of central directory signature
    edv.setUint16(4, 0, true); // disk number
    edv.setUint16(6, 0, true); // disk with central dir
    edv.setUint16(8, records.length, true); // entries on this disk
    edv.setUint16(10, records.length, true); // total entries
    edv.setUint32(12, centralSize, true);
    edv.setUint32(16, offset, true); // offset of central directory
    edv.setUint16(20, 0, true); // comment length

    return new Blob([...localParts, ...centralParts, eocd], { type: "application/zip" });
  }

  return { create, crc32 };
})();
