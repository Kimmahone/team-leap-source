#!/usr/bin/env python3
"""SVG -> PNG 내보내기 (macOS QuickLook 사용, 외부 도구 설치 불필요)

qlmanage 는 항상 정사각 썸네일을 만들고 내용을 좌상단에 붙인다.
그래서 가로형 로고는 정사각 캔버스 가운데에 배치해 렌더한 뒤 sips 로 잘라낸다.
"""
import os, re, shutil, subprocess, sys

BRAND = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(BRAND, "logo")
OUT = os.path.join(BRAND, "logo-png")
TMP = os.path.join(BRAND, ".pngtmp")

# (소스파일, 출력이름, viewBox 가로, viewBox 세로, 내보낼 픽셀 가로들)
JOBS = [
    ("leap-mark.svg",                 "leap-mark",                 64, 64,  [256, 512, 1024]),
    ("leap-mark-dark.svg",            "leap-mark-dark",            64, 64,  [256, 512]),
    ("leap-badge.svg",                "leap-badge",                96, 96,  [256, 512, 1024]),
    ("leap-favicon.svg",              "leap-favicon",              64, 64,  [32, 64, 128, 256]),
    ("leap-logo-horizontal.svg",      "leap-logo-horizontal",     250, 64,  [600, 1200, 2400]),
    ("leap-logo-horizontal-dark.svg", "leap-logo-horizontal-dark",250, 64,  [600, 1200]),
    ("leap-logo-stacked.svg",         "leap-logo-stacked",        200, 114, [400, 800, 1600]),
]


def body_of(svg_text):
    """<svg ...> 와 </svg> 사이의 알맹이만 꺼낸다."""
    inner = svg_text.split(">", 1)[1]
    return inner.rsplit("</svg>", 1)[0]


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def main():
    shutil.rmtree(TMP, ignore_errors=True)
    os.makedirs(TMP, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)

    made = []
    for src, name, vw, vh, widths in JOBS:
        raw = open(os.path.join(LOGO, src), encoding="utf-8").read()
        inner = body_of(raw)
        side = max(vw, vh)               # 정사각 캔버스 한 변 (viewBox 단위)
        dx, dy = (side - vw) / 2, (side - vh) / 2

        for w in widths:
            px = round(w * side / vw)    # 정사각으로 렌더할 픽셀 크기
            # qlmanage 는 내재 크기가 -s 이하이면 그 크기 그대로 그리고 남는 곳을 비운다.
            # 내재 크기를 -s 보다 크게 줘서 반드시 축소되도록(=꽉 차도록) 만든다.
            pad = (
                f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side} {side}" '
                f'width="{px * 2}" height="{px * 2}">'
                f'<g transform="translate({dx} {dy})">{inner}</g></svg>'
            )
            stem = f"{name}-{w}w" if vw != vh else f"{name}-{w}"
            tmp_svg = os.path.join(TMP, stem + ".svg")
            open(tmp_svg, "w", encoding="utf-8").write(pad)

            r = run(["qlmanage", "-t", "-s", str(px), "-o", TMP, tmp_svg])
            rendered = os.path.join(TMP, stem + ".svg.png")
            if not os.path.exists(rendered):
                print(f"  실패 {stem}: {r.stderr.strip()[:120]}")
                continue

            final = os.path.join(OUT, stem + ".png")
            if vw == vh:
                shutil.move(rendered, final)
            else:
                h = round(w * vh / vw)
                run(["sips", "--cropToHeightWidth", str(h), str(w), rendered,
                     "--out", final])
            if os.path.exists(final):
                made.append((os.path.basename(final), os.path.getsize(final)))

    shutil.rmtree(TMP, ignore_errors=True)
    print(f"{len(made)}개 생성\n")
    for n, s in made:
        print(f"  {n:<36} {s/1024:6.1f} KB")


if __name__ == "__main__":
    main()
