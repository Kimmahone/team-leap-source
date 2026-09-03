#!/usr/bin/env python3
"""지방교육재정알리미 「폐교목록」 엑셀 → closed-schools-<연도>.csv (경북)

★ 어디서 받나
  지방교육재정알리미 → 학교정보 → 폐교정보 → 현황
  https://eduinfo.go.kr/portal/theme/abolSchStatusPage.do
  화면 아래 「엑셀」 단추를 누르면 「시도교육청_폐교목록.xlsx」 이 내려옵니다.
  (전국 4,037건. 그 가운데 경북만 씁니다.)

★ 주소에서 시군을 뽑습니다
  이 자료에는 시군 열이 따로 없고 주소 문자열만 있습니다.
  「경북 ○○시/군 …」 에서 시군을 읽습니다.
  원본에 오타가 있어 못 읽는 줄이 몇 개 있습니다(2026년 자료에서 2건) —
  아래 FIX 에 적어 두고 고쳐 읽습니다. 지어내는 것이 아니라 «오타를 바로잡는» 것이므로
  새 자료를 받을 때마다 실패 건수를 확인하고 필요하면 FIX 에 더합니다.

  좌표는 없습니다. 주소만 있으므로 지도에는 «시군 단위»로 그립니다.
  학교마다 핀을 찍으려면 카카오 로컬로 주소를 좌표로 바꿔야 합니다
  (open api/kakao-geocode.mjs 와 같은 방법).

쓰는 법:
  python3 from-eduinfo-closed.py <엑셀 경로> [연도]
"""
import csv, os, re, sys
from collections import Counter

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl 이 필요합니다:  pip3 install openpyxl")

SIGUNGU = ['포항', '경주', '김천', '안동', '구미', '영주', '영천', '상주', '문경', '경산', '의성',
           '청송', '영양', '영덕', '청도', '고령', '성주', '칠곡', '예천', '봉화', '울진', '울릉']

# 원본 주소의 오타 → 바로잡을 시군 (2026년 자료 기준)
FIX = {'포항지': '포항', '봉호군': '봉화'}


def sigungu(addr):
    a = str(addr or '')
    for wrong, right in FIX.items():
        if wrong in a:
            return right
    for s in SIGUNGU:
        if re.search(r'(^|\s)' + s + r'(시|군)', a):
            return s
    return None


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    year = int(sys.argv[2]) if len(sys.argv) > 2 else 2026
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), f'closed-schools-{year}.csv')

    import warnings
    warnings.filterwarnings('ignore')
    rows = list(openpyxl.load_workbook(src, data_only=True).worksheets[0].iter_rows(values_only=True))
    head = [str(c).strip() if c else '' for c in rows[0]]
    need = ['시도교육청', '폐교명', '폐교연도', '급별', '활용현황', '주소']
    idx = {}
    for k in need:
        if k not in head:
            sys.exit(f'✗ 「{k}」 열이 없습니다. 머리글: {head}')
        idx[k] = head.index(k)

    out_rows, missed = [], []
    for r in rows[1:]:
        if not r[idx['시도교육청']] or '경북' not in str(r[idx['시도교육청']]):
            continue
        addr = str(r[idx['주소']] or '').strip()
        sg = sigungu(addr)
        if not sg:
            missed.append(addr)
        yr = str(r[idx['폐교연도']] or '').strip()
        out_rows.append([sg or '',
                         str(r[idx['폐교명']] or '').strip(),
                         int(yr) if yr.isdigit() else '',
                         str(r[idx['급별']] or '').strip(),
                         str(r[idx['활용현황']] or '').strip(),
                         addr])

    if not out_rows:
        sys.exit('✗ 경북 줄을 찾지 못했습니다.')
    if missed:
        print(f'  ⚠ 시군을 못 읽은 줄 {len(missed)}건 — FIX 에 더할지 확인하세요:')
        for a in missed[:5]:
            print('     ·', a)

    with open(out, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['sigungu', 'name', 'closed_year', 'level', 'use', 'address'])
        w.writerows(sorted(out_rows, key=lambda x: (x[0], x[2] or 0)))

    use = Counter(r[4] for r in out_rows)
    print(f'\n✓ {os.path.basename(out)}  (경북 폐교 {len(out_rows)}곳)')
    print('  활용현황:', ' · '.join(f'{k} {v}' for k, v in use.most_common()))
    print('  다음:  node "open api/bake-closed-schools.mjs"')


if __name__ == '__main__':
    main()
