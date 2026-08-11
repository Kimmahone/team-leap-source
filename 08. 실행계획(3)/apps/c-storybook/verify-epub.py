#!/usr/bin/env python3
"""풀어 놓은 EPUB 폴더를 검사한다. test-epub.js 가 불러 쓴다.

EPUB 은 XHTML(엄격한 XML)이라 태그 하나만 안 닫혀도 뷰어가 책을 열지 못한다.
그래서 파일이 만들어졌는지가 아니라 '규격에 맞는지'를 본다.
"""
import pathlib
import sys
import xml.dom.minidom

ok = fail = 0


def chk(name, cond, extra=''):
    global ok, fail
    if cond:
        ok += 1
        print('  OK   ' + name)
    else:
        fail += 1
        print('  실패 ' + name + (('\n       ' + extra) if extra else ''))


def main(root):
    d = pathlib.Path(root)

    print('=== XML 적합성 ===')
    for f in sorted(d.rglob('*')):
        if f.suffix in ('.xhtml', '.opf', '.xml'):
            try:
                xml.dom.minidom.parse(str(f))
                chk(str(f.relative_to(d)), True)
            except Exception as e:                      # noqa: BLE001
                chk(str(f.relative_to(d)), False, str(e)[:120])

    print('\n=== 겉껍데기 ===')
    mt = (d / 'mimetype').read_text()
    chk('mimetype 이 application/epub+zip', mt == 'application/epub+zip', repr(mt))
    chk('container.xml 이 content.opf 를 가리킨다',
        'OEBPS/content.opf' in (d / 'META-INF/container.xml').read_text())

    print('\n=== content.opf ===')
    opf_path = d / 'OEBPS/content.opf'
    opf = opf_path.read_text()
    dom = xml.dom.minidom.parseString(opf)
    items = {i.getAttribute('id'): i.getAttribute('href')
             for i in dom.getElementsByTagName('item')}
    spine = [r.getAttribute('idref') for r in dom.getElementsByTagName('itemref')]

    chk('차례(nav) 항목이 있다',
        any(i.getAttribute('properties') == 'nav' for i in dom.getElementsByTagName('item')))
    chk('표지 그림에 cover-image 표시',
        any('cover-image' in i.getAttribute('properties') for i in dom.getElementsByTagName('item')))
    chk('언어가 ko', '<dc:language>ko</dc:language>' in opf)
    chk('저작권 표기가 들어 있다', 'TEAM LEAP' in opf)
    chk('dcterms:modified 가 있다', 'dcterms:modified' in opf)

    missing = [h for h in items.values() if not (d / 'OEBPS' / h).exists()]
    chk('매니페스트의 모든 파일이 실제로 있다', not missing, str(missing))

    files = {str(p.relative_to(d / 'OEBPS'))
             for p in (d / 'OEBPS').rglob('*') if p.is_file() and p.name != 'content.opf'}
    unlisted = files - set(items.values())
    chk('빠짐없이 매니페스트에 올라 있다', not unlisted, str(unlisted))

    chk('spine 이 표지부터 시작한다', spine and spine[0] == 'cover', str(spine))
    chk('spine 이 마지막 장으로 끝난다', spine and spine[-1] == 'back', str(spine))
    chk('spine 항목이 모두 매니페스트에 있다', all(s in items for s in spine))

    print('\n=== 탐방 지도 쪽 ===')
    tm = d / 'OEBPS/tripmap.xhtml'
    chk('탐방 지도 쪽이 들어 있다', tm.exists())
    if tm.exists():
        t = tm.read_text()
        # XML 적합성은 위에서 이미 봤다. 여기서는 내용이 제대로 들어갔는지 본다.
        chk('지도가 SVG 로 들어간다', '<svg' in t and 'viewBox' in t)
        chk('그림 파일이 아니라 글자로 된 그림', '.jpg' not in t and '.png' not in t)
        chk('다녀온 시군이 적힌다', '안동시' in t and '의성군' in t and '울릉군' in t)
        chk('안 간 시군은 이름이 안 나온다', '청도' not in t)
        chk('탐방지 이름이 적힌다', '하회마을' in t)
        chk('위험한 글자가 그대로 들어가지 않는다', '<느티나무>' not in t)
        chk('학교에서의 거리가 적힌다', 'km' in t)
        chk('우리 학교 이름이 나온다', '안동초등학교' in t,
            '시군이 아니라 학교가 「우리 자리」다')
        chk('별표가 XML 로 읽힌다', 'M' in t and 'Z"' in t)
        chk('차례에 있다', 'tripmap.xhtml' in (d / 'OEBPS/nav.xhtml').read_text())
        chk('spine 에 표지 바로 다음', 
            (d / 'OEBPS/content.opf').read_text().find('tripmap') <
            (d / 'OEBPS/content.opf').read_text().find('idref="p1"'))

    print('\n=== 마지막 장 ===')
    back = (d / 'OEBPS/back.xhtml').read_text()
    chk('판권지로 표시된다', 'epub:type="colophon"' in back)
    chk('맺음말이 들어 있다', '우리가 배운 것' in back)
    chk('줄바꿈이 <br/> 로 변환', '<br/>' in back)
    chk('만든 사람이 들어 있다', '두루미 모둠' in back)
    chk('책 제목이 자동으로 들어간다', '우리 마을 이야기' in back)
    chk('마지막 장에 저작권을 찍지 않는다', '2026 TEAM LEAP' not in back)
    chk('만든 도구 이름만 남는다', '지역 탐방 디지털 스토리북으로 만들었습니다' in back)
    chk('차례에 마지막 장이 있다', 'back.xhtml' in (d / 'OEBPS/nav.xhtml').read_text())

    print('\n----------------------------------------')
    print(f'{ok}개 통과, {fail}개 실패')
    return 1 if fail else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else '.'))
