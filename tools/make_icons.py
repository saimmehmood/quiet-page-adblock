#!/usr/bin/env python3
"""Draws the toolbar icons (an octagon with a bar) with no dependencies.

Writes icons/{on,off}-{16,32,48,128}.png.  Run: python3 tools/make_icons.py
"""
import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SIZES = [16, 32, 48, 128]
COLORS = {"on": (217, 58, 63), "off": (138, 143, 152)}
SS = 4  # supersampling factor per axis


def octagon(cx, cy, r):
    return [(cx + r * math.cos(math.radians(22.5 + 45 * i)),
             cy + r * math.sin(math.radians(22.5 + 45 * i))) for i in range(8)]


def inside_convex(pts, x, y):
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        if (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1) < 0:
            return False
    return True


def in_bar(x, y, size):
    w, h = size * 0.56, size * 0.17
    x0, y0 = (size - w) / 2, (size - h) / 2
    r = h / 2
    if not (x0 <= x <= x0 + w and y0 <= y <= y0 + h):
        return False
    cx = min(max(x, x0 + r), x0 + w - r)
    return (x - cx) ** 2 + (y - size / 2) ** 2 <= r * r


def render(size, color):
    outer = octagon(size / 2, size / 2, size * 0.5)
    rows = []
    for py in range(size):
        row = bytearray([0])  # PNG filter: none
        for px in range(size):
            red = white = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = px + (sx + 0.5) / SS
                    y = py + (sy + 0.5) / SS
                    if inside_convex(outer, x, y):
                        if in_bar(x, y, size):
                            white += 1
                        else:
                            red += 1
            n = SS * SS
            a = (red + white) / n
            if a == 0:
                row += bytes(4)
                continue
            mix = white / (red + white)
            rgb = [round(c * (1 - mix) + 255 * mix) for c in color]
            row += bytes(rgb + [round(a * 255)])
        rows.append(bytes(row))
    return png(size, size, b"".join(rows))


def png(w, h, raw):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


def main():
    out = ROOT / "icons"
    out.mkdir(exist_ok=True)
    for state, color in COLORS.items():
        for size in SIZES:
            (out / f"{state}-{size}.png").write_bytes(render(size, color))
    print("wrote", len(COLORS) * len(SIZES), "icons")


if __name__ == "__main__":
    main()
