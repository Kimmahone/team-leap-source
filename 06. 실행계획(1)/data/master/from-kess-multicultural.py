#!/usr/bin/env python3
"""교육통계연보 「다문화학생 현황」 엑셀 → multicultural-<연도>.csv

한 해에 한 번 사람이 돌립니다. CI 에서는 돌지 않습니다
(저장소에 엑셀 해석기를 들이지 않으려는 뜻입니다).

★ 열 위치를 «고정하지 않는» 이유
  같은 표인데도 학교급마다 열 배치가 다릅니다. 실제로 2025년 파일에서는
    초등학교 — (1)에 총계(D)·소계(A), (2)에 소계(B), (3)에 소계(C)
    중학교   — (1)에 총계(D)·소계(A)·소계(B), (2)에 소계(C), (3)에는 소계가 없음
  이었습니다. 국가별 열이 길어져 다음 파일로 밀린 탓입니다.
  그래서 «머리글에서 소계(A)(B)(C)·총계(D) 를 찾아» 씁니다.

  검산: 표의 주석대로 (D) = (A) + (B) + (C) 인지 확인합니다. 어긋나면 멈춥니다.

쓰는 법:
  python3 from-kess-multicultural.py <엑셀들이 있는 폴더> <연도> [지역]
  예) python3 from-kess-multicultural.py "../../../08. 추가 자료/다문화 학생 현황" 2025 경북
"""
import csv, glob, os, re, sys

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl 이 필요합니다:  pip3 install openpyxl")

LEVELS = {'초': '3-12', '중': '4-14', '고': '5-9'}   # 초·중·고 «전체» 표만 씁니다.
# 일반고(6-10)·특목고(7-17)·특성화고(8-1-11)·자율고(9-10) 는 고등학교(5-9)의 내역이라
# 함께 더하면 두 번 세게 됩니다.
TYPES = {'소계(A)': '국내출생', '소계(B)': '중도입국', '소계(C)': '외국인가정'}


def norm(v):
    return re.sub(r'\s+', '', str(v)) if v is not None else ''


def num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return int(v)
    t = str(v).replace(',', '').strip()
    if t in ('-', '', '–', '...'):
        return 0
    return int(t) if re.fullmatch(r'-?\d+', t) else None


def collect(folder, code, region):
    """한 학교급의 (1)(2)(3) 파일을 훑어 소계·총계를 모읍니다."""
    got = {}
    for path in glob.glob(os.path.join(folder, '*.xlsx')):
        m = re.search(r'_([\d\-]+)\.\s*다문화학생\s*현황\s*\((\d)\)', os.path.basename(path))
        if not m or m.group(1) != code:
            continue
        ws = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
        rows = list(ws.iter_rows(values_only=True))
        cols = {}
        for rn in range(4, 9):                       # 머리글은 5~9행 어딘가에 있습니다
            if rn >= len(rows):
                break
            for c, v in enumerate(rows[rn]):
                t = norm(v)
                if re.fullmatch(r'(총계|소계)\([A-D]\)', t):
                    cols[t] = c
        if not cols:
            continue
        for r in rows:
            if norm(r[0]) == region:
                for k, c in cols.items():
                    if c < len(r):
                        got[k] = num(r[c])
                break
    return got


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    folder, year = sys.argv[1], int(sys.argv[2])
    region = sys.argv[3] if len(sys.argv) > 3 else '경북'
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), f'multicultural-{year}.csv')

    rows, problems = [], []
    for lv, code in LEVELS.items():
        g = collect(folder, code, region)
        if not g:
            problems.append(f'{lv}: 표를 찾지 못했습니다 (코드 {code})')
            continue
        total = 0
        for key, label in TYPES.items():
            v = g.get(key)
            if v is None:
                problems.append(f'{lv}: {label}({key}) 을 찾지 못했습니다')
                continue
            rows.append([year, region, lv, label, v])
            total += v
        D = g.get('총계(D)')
        if D is None:
            problems.append(f'{lv}: 총계(D) 를 찾지 못했습니다')
        elif D != total:
            problems.append(f'{lv}: 검산 불일치 — A+B+C={total} 인데 표의 총계(D)={D}')
        else:
            print(f'  ✓ {lv}  국내출생·중도입국·외국인가정 합 {total} = 총계(D) {D}')

    if problems:
        print('\n✗ 그대로 두었습니다. 아래를 먼저 확인하세요:')
        for p in problems:
            print('   ·', p)
        sys.exit(1)

    with open(out, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['year', 'region', 'level', 'type', 'students'])
        w.writerows(rows)
    print(f'\n✓ {os.path.basename(out)}  ({len(rows)}행 · 합계 {sum(r[4] for r in rows):,}명)')
    print('  다음:  node "open api/bake-multicultural.mjs"')


if __name__ == '__main__':
    main()
