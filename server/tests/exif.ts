/**
 * Builds a tiny JPEG whose EXIF block contains GPS coordinates and a
 * capture time, exactly like a phone camera writes them. exifr only reads
 * the metadata segments, so no real image data is needed.
 *
 * Layout (little-endian TIFF inside an APP1 "Exif" segment):
 *   IFD0 -> pointers to the Exif IFD (DateTimeOriginal) and the GPS IFD
 *   GPS IFD -> latitude/longitude as degree/minute/second rationals
 */
export function jpegWithExif(opts: { lat: number; lng: number; takenAt: Date }): Buffer {
  const t = Buffer.alloc(178);
  let o = 0;
  const u16 = (v: number) => ((o = t.writeUInt16LE(v, o)), undefined);
  const u32 = (v: number) => ((o = t.writeUInt32LE(v, o)), undefined);
  const entry = (tag: number, type: number, count: number, value: number) => (u16(tag), u16(type), u32(count), u32(value));

  // TIFF header
  t.write('II', 0, 'ascii');
  o = 2;
  u16(42);
  u32(8);
  // IFD0 @8: Exif pointer, GPS pointer
  u16(2);
  entry(0x8769, 4, 1, 38);
  entry(0x8825, 4, 1, 76);
  u32(0);
  // Exif IFD @38: DateTimeOriginal -> data @56
  u16(1);
  entry(0x9003, 2, 20, 56);
  u32(0);
  const p = (n: number) => String(n).padStart(2, '0');
  const d = opts.takenAt;
  t.write(`${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}\0`, 56, 'ascii');
  // GPS IFD @76
  o = 76;
  u16(4);
  entry(1, 2, 2, opts.lat >= 0 ? 0x4e : 0x53); // 'N' / 'S' stored inline
  entry(2, 5, 3, 130);
  entry(3, 2, 2, opts.lng >= 0 ? 0x45 : 0x57); // 'E' / 'W'
  entry(4, 5, 3, 154);
  u32(0);
  const dms = (v: number, at: number) => {
    const a = Math.abs(v);
    const deg = Math.floor(a);
    const min = Math.floor((a - deg) * 60);
    const sec = Math.round(((a - deg) * 60 - min) * 60 * 1000);
    [deg, 1, min, 1, sec, 1000].forEach((x, i) => t.writeUInt32LE(x, at + i * 4));
  };
  dms(opts.lat, 130);
  dms(opts.lng, 154);

  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), t]);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(payload.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, payload, Buffer.from([0xff, 0xd9])]);
}
