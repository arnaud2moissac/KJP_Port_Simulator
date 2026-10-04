"""Render the same vector drawing operations as the SVGs into A3 PDFs."""
import json
import sys
from pathlib import Path

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

font_paths = [
    Path('/System/Library/Fonts/Supplemental/Arial.ttf'),
    Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
]
font_path = next((p for p in font_paths if p.exists()), None)
if font_path:
    pdfmetrics.registerFont(TTFont('Tech', str(font_path)))
    bold = font_path.with_name('Arial Bold.ttf') if 'Arial' in font_path.name else font_path.with_name('DejaVuSans-Bold.ttf')
    pdfmetrics.registerFont(TTFont('TechBold', str(bold if bold.exists() else font_path)))
else:
    raise RuntimeError('A Unicode TrueType font is needed for the technical annotations.')

drawings = json.loads(Path(sys.argv[1]).read_text())
out = Path(sys.argv[2])
pw, ph = landscape(A3)
scale = pw / 1680
for name, pages in drawings.items():
    target = out / f'{name}-dessin-technique.pdf'
    pdf = canvas.Canvas(str(target), pagesize=(pw, ph), pageCompression=1)
    pdf.setTitle(pages[0]['title'])
    pdf.setAuthor('KJP Port Simulator')
    pdf.setSubject('Versioned physical model: exact positions, areas and axes; equivalent contours explicitly identified')
    for page in pages:
        for op in page['ops']:
            pdf.saveState()
            pdf.setLineWidth(op.get('width', 1) * scale)
            if op.get('dash'):
                pdf.setDash([a * scale for a in op['dash']])
            if op['type'] == 'text':
                pdf.setFillColor(HexColor(op['color']))
                pdf.setFont('TechBold' if op['weight'] == 'bold' else 'Tech', op['size'] * scale)
                x, y, text = op['x'] * scale, ph - op['y'] * scale, op['text']
                if op['anchor'] == 'middle':
                    pdf.drawCentredString(x, y, text)
                elif op['anchor'] == 'end':
                    pdf.drawRightString(x, y, text)
                else:
                    pdf.drawString(x, y, text)
            elif op['type'] == 'line':
                pdf.setStrokeColor(HexColor(op['color']))
                a, b = op['points']
                pdf.line(a[0] * scale, ph - a[1] * scale, b[0] * scale, ph - b[1] * scale)
            elif op['type'] == 'poly':
                if op.get('fill'):
                    pdf.setFillColor(HexColor(op['fill']))
                    pdf.setFillAlpha(op.get('alpha', 1))
                if op.get('stroke'):
                    pdf.setStrokeColor(HexColor(op['stroke']))
                p = pdf.beginPath()
                for i, (x, y) in enumerate(op['points']):
                    if i == 0:
                        p.moveTo(x * scale, ph - y * scale)
                    else:
                        p.lineTo(x * scale, ph - y * scale)
                p.close()
                pdf.drawPath(p, fill=int(bool(op.get('fill'))), stroke=int(bool(op.get('stroke'))))
            elif op['type'] == 'circle':
                if op.get('fill'):
                    pdf.setFillColor(HexColor(op['fill']))
                if op.get('stroke'):
                    pdf.setStrokeColor(HexColor(op['stroke']))
                pdf.circle(op['x'] * scale, ph - op['y'] * scale, op['r'] * scale,
                           fill=int(bool(op.get('fill'))), stroke=int(bool(op.get('stroke'))))
            pdf.restoreState()
        pdf.showPage()
    pdf.save()
    print(f'PDF: {target}')
