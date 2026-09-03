#!/usr/bin/env python3
"""국립특수교육원 「특수교육통계」 PDF → sped-placement-<연도>.csv

한 해에 한 번 사람이 돌립니다.

★ 왜 이 자료가 필요한가
  특수교육 배치는 넷입니다 — 특수학교 · 특수학급 · 일반학급(완전통합) · 특수교육지원센터.
  학교알리미는 앞의 둘만 줍니다. 그래서 그것만 세면 «완전통합 학생»이 통째로 빠져
  실제보다 적은 수를 「특수교육대상자」라고 부르게 됩니다.
  2026년 경북에서 그 차이는 1,363명(일반학급 1,348 + 지원센터 15)이었습니다.

★ 어디서 받나
  국립특수교육원 → NISE 자료 → 특수교육통계 → 특수교육 통계조사
  http://www.nise.go.kr/boardCnts/list.do?boardID=356&m=010502&s=nise
  「○○○○ 특수교육통계(국문)」 PDF 를 받습니다. 매년 4월 1일 기준입니다.

★ 어느 쪽을 읽나
  「시･도별 개황」 표 (2026년판 기준 13쪽).
  열 차례: 특수학교(학교수·학급수·학생수·교원수·일반직) · 특수학급(학교수·학급수·학생수·교사)
           · 일반학급(학교수·학급수·학생수) · 지원센터(학생수) · 장애영아 · 계
  쪽 번호는 해마다 바뀌므로 «표의 머리글로 찾습니다».

  검산: 특수학교 + 특수학급 + 일반학급 + 지원센터 학생 수 = 계.
        어긋나면 파일을 쓰지 않고 멈춥니다.

쓰는 법:
  python3 from-nise-placement.py <PDF 경로> 2026 [지역]
"""
import csv, os, re, sys

try:
    import pdfplumber
except ImportError:
    sys.exit("pdfplumber 가 필요합니다:  pip3 install pdfplumber")

COLS = ['특수학교_학교수', '특수학교_학급수', '특수학교_학생수', '특수학교_교원수', '특수학교_일반직',
        '특수학급_학교수', '특수학급_학급수', '특수학급_학생수', '특수학급_교사',
        '일반학급_학교수', '일반학급_학급수', '일반학급_학생수',
        '지원센터_학생수', '장애영아', '계']

# CSV 로 남길 배치유형 (학교수, 학급수, 학생수, 교사)
PLACEMENTS = [
    ('특수학교',       '특수학교_학교수', '특수학교_학급수', '특수학교_학생수', '특수학교_교원수'),
    ('특수학급',       '특수학급_학교수', '특수학급_학급수', '특수학급_학생수', '특수학급_교사'),
    ('일반학급',       '일반학급_학교수', '일반학급_학급수', '일반학급_학생수', None),
    ('특수교육지원센터', None,            None,             '지원센터_학생수',  None),
]


def find_page(pdf):
    """「시･도별 개황」 표가 있는 쪽을 머리글로 찾습니다."""
    for i, pg in enumerate(pdf.pages[:80]):
        t = pg.extract_text() or ''
        if '시･도별 개황' in t or '시·도별 개황' in t:
            if '일반학급' in t and '특수교육지원센터' in t:
                return i, t
    return None, None


def parse_row(txt, name):
    for line in txt.split('\n'):
        parts = line.split()
        if parts and parts[0] == name:
            nums = [int(x.replace(',', '')) for x in parts[1:] if re.fullmatch(r'[\d,]+', x)]
            if len(nums) == len(COLS):
                return dict(zip(COLS, nums))
    return None


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    pdf_path, year = sys.argv[1], int(sys.argv[2])
    region = sys.argv[3] if len(sys.argv) > 3 else '경북'
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), f'sped-placement-{year}.csv')

    with pdfplumber.open(pdf_path) as pdf:
        idx, txt = find_page(pdf)
        if idx is None:
            sys.exit('✗ 「시･도별 개황」 표를 찾지 못했습니다. 표 이름이 바뀌었는지 확인하세요.')
        print(f'  「시･도별 개황」 {idx + 1}쪽에서 읽습니다.')
        d = parse_row(txt, region)

    if not d:
        sys.exit(f'✗ {region} 줄을 찾지 못했습니다(또는 열 개수가 {len(COLS)}개가 아닙니다).')

    total = d['특수학교_학생수'] + d['특수학급_학생수'] + d['일반학급_학생수'] + d['지원센터_학생수']
    if total != d['계']:
        sys.exit(f'✗ 검산 불일치 — 배치 4곳 합 {total:,} 인데 표의 계 {d["계"]:,}. 그대로 두었습니다.')
    print(f'  ✓ 검산  특수학교+특수학급+일반학급+지원센터 = {total:,} = 표의 계')

    rows = []
    for label, sc, cl, st, te in PLACEMENTS:
        rows.append([year, region, label,
                     d[sc] if sc else '', d[cl] if cl else '', d[st], d[te] if te else ''])
    rows.append([year, region, '장애영아', '', '', d['장애영아'], ''])

    with open(out, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['year', 'region', 'placement', 'schools', 'classes', 'students', 'teachers'])
        w.writerows(rows)
    print(f'\n✓ {os.path.basename(out)}  ({region} 특수교육대상자 {total:,}명 · 장애영아 {d["장애영아"]:,}명 별도)')
    print('  다음:  node "open api/bake-sped-placement.mjs"')


if __name__ == '__main__':
    main()
