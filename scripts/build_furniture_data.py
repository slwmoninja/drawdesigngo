"""Regenerates ../furniture-data.json from the furniture sourcing master
spreadsheet. Run this after the spreadsheet is updated, then commit the
refreshed furniture-data.json alongside it.

Usage: python build_furniture_data.py <path-to-xlsx>

Pulls the live thumbnail URL out of each row's =IMAGE(url,...) formula
(openpyxl can't evaluate it, so the source file must be read with
data_only=False) and drops the Price/Price High columns, which the app
doesn't display -- keeps the app's copy of the data compact.
"""
import sys, json, re
import openpyxl

def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    src = sys.argv[1]
    wb = openpyxl.load_workbook(src, data_only=False)
    ws = wb['Furniture']
    img_re = re.compile(r'IMAGE\("([^"]+)"')
    rows = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        store, room, ftype, name, price, plow, phigh, prange, img, link = r
        if not name:
            continue
        m = img_re.search(img) if isinstance(img, str) else None
        img_url = m.group(1) if m else ''
        rows.append([store, room, ftype, name, prange, float(plow) if plow is not None else None, img_url, link])
    # Matches the source spreadsheet's own default view (see its Notes sheet).
    rows.sort(key=lambda r: (r[2], r[5] if r[5] is not None else 0))
    out = {'columns': ['store', 'room', 'type', 'name', 'priceRange', 'priceLow', 'img', 'link'], 'rows': rows}
    s = json.dumps(out, separators=(',', ':'), ensure_ascii=False)
    with open('../furniture-data.json', 'w', encoding='utf-8') as f:
        f.write(s)
    print(f'{len(rows)} rows written, {len(s)} bytes')

if __name__ == '__main__':
    main()
