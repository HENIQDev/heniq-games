#!/usr/bin/env python3
"""JPEG から、メタデータ（EXIF・XMP・コメント）を取り除く（Python 標準機能のみ）。公開する画像に、撮影情報などを残さないため。
  python3 tools/strip_exif.py 画像.jpg [画像2.jpg …]    （上書き）
画像のデータ（ピクセル）と、色の情報（ICC プロファイル）は、そのまま残す。
"""
import struct
import sys


def strip(data):
    if data[:2] != b"\xff\xd8":
        raise ValueError("JPEG ではありません")
    out = bytearray(b"\xff\xd8")
    i = 2
    while i < len(data):
        if data[i] != 0xFF:
            raise ValueError("JPEG の構造が不正です")
        marker = data[i + 1]
        if marker == 0xDA:                    # 画像データの開始：残りはそのまま
            out += data[i:]
            return bytes(out)
        if marker == 0xD9 or 0xD0 <= marker <= 0xD7 or marker == 0x01:
            out += data[i:i + 2]; i += 2; continue
        (ln,) = struct.unpack(">H", data[i + 2:i + 4])
        seg = data[i:i + 2 + ln]
        payload = seg[4:]
        drop = marker == 0xFE or (marker == 0xE1 and (payload.startswith(b"Exif") or payload.startswith(b"http://ns.adobe.com/xap")))
        drop = drop or (marker == 0xED)       # Photoshop の情報
        if not drop:
            out += seg
        i += 2 + ln
    return bytes(out)


def has_metadata(data):
    return strip(data) != data


if __name__ == "__main__":
    for path in sys.argv[1:]:
        raw = open(path, "rb").read()
        clean = strip(raw)
        open(path, "wb").write(clean)
        print("%s：%d → %d バイト%s" % (path, len(raw), len(clean), "（メタデータを除去）" if clean != raw else "（もともと無し）"))
