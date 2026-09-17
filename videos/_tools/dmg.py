# Pulls files out of a UDZO .dmg (zlib chunks over an HFS+ volume) with no Mac and no 7-Zip.
# Used for Apple's product bezels. See VIDEOS.md section 12.
#
#   python videos/_tools/dmg.py image Bezel-iPhone-18.dmg hfs.img        the HFS+ volume, decompressed
#   python videos/_tools/dmg.py list hfs.img                              every file and its size
#   python videos/_tools/dmg.py extract hfs.img outdir "<path part>" ...  files whose path contains any part
import struct, plistlib, zlib, sys, os

def hfs_image(dmg, out):
    f = open(dmg, "rb"); f.seek(-512, 2); koly = f.read(512)
    xml_off, xml_len = struct.unpack(">QQ", koly[0xD8:0xE8])
    f.seek(xml_off); pl = plistlib.loads(f.read(xml_len))
    part = [p for p in pl["resource-fork"]["blkx"] if "Apple_HFS" in p.get("Name", "")][0]
    data = part["Data"]; data_start = struct.unpack(">Q", koly[0x18:0x20])[0]
    n = struct.unpack(">I", data[0xC8:0xCC])[0]
    with open(out, "wb") as o:
        for i in range(n):
            t, _, s_num, s_cnt, c_off, c_len = struct.unpack(">IIQQQQ", data[0xCC + i * 40: 0xCC + (i + 1) * 40])
            if t == 0xFFFFFFFF: break
            if t == 0x7FFFFFFE: continue
            o.seek(s_num * 512)
            if t == 0x80000005:
                f.seek(data_start + c_off); o.write(zlib.decompress(f.read(c_len)))
            elif t == 1:
                f.seek(data_start + c_off); o.write(f.read(c_len))
            elif t in (0, 2):
                o.write(b"\0" * (s_cnt * 512))
            else:
                raise SystemExit(f"unsupported chunk type {hex(t)}")

class HFS:
    def __init__(self, path):
        self.f = open(path, "rb"); self.f.seek(1024); vh = self.f.read(512)
        assert vh[:2] in (b"H+", b"HX"), vh[:2]
        self.bs = struct.unpack(">I", vh[40:44])[0]
        self.catalog = self.fork(vh[272:352])
    def fork(self, b):
        size = struct.unpack(">Q", b[0:8])[0]
        ext = [struct.unpack(">II", b[16 + i * 8: 24 + i * 8]) for i in range(8)]
        return size, [e for e in ext if e[1]]
    def read_fork(self, fork):
        size, ext = fork; out = bytearray()
        for start, count in ext:
            self.f.seek(start * self.bs); out += self.f.read(count * self.bs)
        if len(out) < size: raise SystemExit("fork uses overflow extents")
        return bytes(out[:size])
    def walk(self):
        cat = self.read_fork(self.catalog)
        node_size = struct.unpack(">H", cat[32:34])[0]
        first_leaf = struct.unpack(">I", cat[24:28])[0]
        folders, files = {1: (0, "")}, []
        node = first_leaf
        while node:
            nd = cat[node * node_size:(node + 1) * node_size]
            flink, _, kind, _, nrec = struct.unpack(">IIbBH", nd[:12])
            offs = [struct.unpack(">H", nd[node_size - 2 * (i + 1): node_size - 2 * i])[0] for i in range(nrec)]
            for o in offs:
                klen = struct.unpack(">H", nd[o:o + 2])[0]
                parent = struct.unpack(">I", nd[o + 2:o + 6])[0]
                nlen = struct.unpack(">H", nd[o + 6:o + 8])[0]
                name = nd[o + 8:o + 8 + nlen * 2].decode("utf-16-be")
                r = nd[o + 2 + klen:]
                rtype = struct.unpack(">H", r[:2])[0]
                if rtype == 1:
                    folders[struct.unpack(">I", r[8:12])[0]] = (parent, name)
                elif rtype == 2:
                    files.append((parent, name, self.fork(r[88:168])))
            node = flink
        def path(fid):
            parts = []
            while fid in folders and fid != 1:
                p, nme = folders[fid]; parts.append(nme); fid = p
            return "/".join(reversed(parts))
        return [(path(p) + "/" + n, fork) for p, n, fork in files]

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "image":
        hfs_image(sys.argv[2], sys.argv[3])
    elif cmd == "list":
        for p, (size, _) in sorted(HFS(sys.argv[2]).walk()):
            print(f"{size:>12}  {p}")
    elif cmd == "extract":
        h = HFS(sys.argv[2]); want = sys.argv[4:]
        for p, fork in h.walk():
            if any(w in p for w in want):
                dest = os.path.join(sys.argv[3], p.replace("/", "__"))
                open(dest, "wb").write(h.read_fork(fork)); print("wrote", dest)
