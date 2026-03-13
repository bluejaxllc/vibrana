"""
Vibrana AI — NLS Bioresonance Report PDF Generator

Generates a professional PDF from the NLS scan report JSON data.
Uses reportlab to produce a branded, multi-section document.
"""
import io
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, PageBreak
)


# ── Brand Colors ──
PURPLE_DARK = colors.HexColor('#1e1b4b')
PURPLE      = colors.HexColor('#6d28d9')
PURPLE_LIGHT= colors.HexColor('#a78bfa')
CYAN        = colors.HexColor('#8be9fd')
CYAN_DARK   = colors.HexColor('#22d3ee')
GREEN       = colors.HexColor('#50fa7b')
GREEN_DARK  = colors.HexColor('#22c55e')
RED         = colors.HexColor('#ff5555')
RED_DARK    = colors.HexColor('#dc2626')
AMBER       = colors.HexColor('#f59e0b')
GRAY_LIGHT  = colors.HexColor('#f1f5f9')
GRAY        = colors.HexColor('#94a3b8')
GRAY_DARK   = colors.HexColor('#475569')
WHITE       = colors.HexColor('#ffffff')
BG_DARK     = colors.HexColor('#0f172a')
ROW_ALT     = colors.HexColor('#f8fafc')


def _build_styles():
    """Create custom paragraph styles for the PDF."""
    base = getSampleStyleSheet()

    styles = {
        'title': ParagraphStyle(
            'VTitle', parent=base['Title'],
            fontSize=22, textColor=PURPLE, fontName='Helvetica-Bold',
            spaceAfter=4, alignment=TA_CENTER
        ),
        'subtitle': ParagraphStyle(
            'VSubtitle', parent=base['Normal'],
            fontSize=10, textColor=GRAY, fontName='Helvetica',
            spaceAfter=14, alignment=TA_CENTER
        ),
        'heading': ParagraphStyle(
            'VHeading', parent=base['Heading2'],
            fontSize=14, textColor=PURPLE_DARK, fontName='Helvetica-Bold',
            spaceBefore=18, spaceAfter=8,
            borderPadding=(0, 0, 4, 0),
        ),
        'heading_small': ParagraphStyle(
            'VHeadingSm', parent=base['Heading3'],
            fontSize=12, textColor=PURPLE, fontName='Helvetica-Bold',
            spaceBefore=12, spaceAfter=6
        ),
        'body': ParagraphStyle(
            'VBody', parent=base['Normal'],
            fontSize=9.5, leading=13, spaceAfter=6,
            fontName='Helvetica', textColor=colors.HexColor('#1e293b'),
            alignment=TA_JUSTIFY
        ),
        'body_small': ParagraphStyle(
            'VBodySm', parent=base['Normal'],
            fontSize=8.5, leading=11, spaceAfter=4,
            fontName='Helvetica', textColor=GRAY_DARK,
        ),
        'metric_label': ParagraphStyle(
            'VMetricLabel', parent=base['Normal'],
            fontSize=8, textColor=GRAY, fontName='Helvetica',
            alignment=TA_CENTER, spaceAfter=2,
        ),
        'metric_value': ParagraphStyle(
            'VMetricValue', parent=base['Normal'],
            fontSize=18, textColor=PURPLE, fontName='Helvetica-Bold',
            alignment=TA_CENTER, spaceAfter=4,
        ),
        'category': ParagraphStyle(
            'VCategory', parent=base['Normal'],
            fontSize=10, textColor=PURPLE, fontName='Helvetica-Bold',
            spaceBefore=8, spaceAfter=4,
        ),
        'item_name': ParagraphStyle(
            'VItemName', parent=base['Normal'],
            fontSize=9.5, textColor=PURPLE_DARK, fontName='Helvetica-Bold',
            spaceBefore=4, spaceAfter=2,
        ),
        'legal': ParagraphStyle(
            'VLegal', parent=base['Normal'],
            fontSize=7.5, textColor=GRAY, fontName='Helvetica-Oblique',
            spaceBefore=12, spaceAfter=4, alignment=TA_CENTER,
        ),
    }
    return styles


def _hr():
    """Return a thin horizontal rule."""
    return HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#e2e8f0'), spaceAfter=6, spaceBefore=6)


def _section_header(styles, icon, text):
    """Return a section heading paragraph."""
    return Paragraph(f'{icon} {text}', styles['heading'])


def _table_style_base():
    """Common table styling."""
    return TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PURPLE),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTSIZE', (0, 1), (-1, -1), 8.5),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, ROW_ALT]),
    ])


def generate_nls_pdf(report_data: dict) -> bytes:
    """
    Generate a professional PDF from the NLS scan report data.
    
    Args:
        report_data: The report JSON with keys like clinical_synthesis,
                     entropic_analysis, foods_to_eat, recommended_etalons, etc.
    
    Returns:
        PDF as bytes
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=letter,
        topMargin=0.6 * inch, bottomMargin=0.5 * inch,
        leftMargin=0.65 * inch, rightMargin=0.65 * inch,
    )
    
    styles = _build_styles()
    elements = []
    
    # ─────────────────────────────────
    # HEADER
    # ─────────────────────────────────
    elements.append(Paragraph("VIBRANA", styles['title']))
    
    organ = report_data.get('scan_metadata', {}).get('organ_or_tissue', 'Escaneo Completo')
    freq = report_data.get('scan_metadata', {}).get('base_frequency_hz', 'N/A')
    date_str = datetime.now().strftime('%d/%m/%Y %H:%M')
    elements.append(Paragraph(
        f'Reporte de Análisis NLS — {organ}<br/>'
        f'Frecuencia Base: {freq} Hz | Generado: {date_str}',
        styles['subtitle']
    ))
    elements.append(_hr())
    
    # ─────────────────────────────────
    # ENTROPIC METRICS
    # ─────────────────────────────────
    ea = report_data.get('entropic_analysis', {})
    if ea:
        fleindler = ea.get('fleindler_entropy_level', '—')
        css_d = ea.get('css_d_value', '—')
        dissoc = ea.get('red_blue_dissociation', '—')
        
        # Determine severity colors
        fl_val = fleindler if isinstance(fleindler, (int, float)) else 0
        fl_color = RED_DARK if fl_val >= 5 else AMBER if fl_val >= 3 else GREEN_DARK
        
        metric_data = [
            [
                Paragraph('Nivel Fleindler', styles['metric_label']),
                Paragraph('Brecha Rojo/Azul', styles['metric_label']),
                Paragraph('CSS (Valor-D)', styles['metric_label']),
            ],
            [
                Paragraph(f'<font color="{fl_color.hexval()}" size="18"><b>{fleindler}</b></font><font size="9" color="#94a3b8">/6</font>', styles['body']),
                Paragraph(f'<font color="#d97706" size="11"><b>{dissoc}</b></font>', styles['body']),
                Paragraph(f'<font color="#6d28d9" size="16"><b>{css_d}</b></font>', styles['body']),
            ]
        ]
        
        metric_table = Table(metric_data, colWidths=[doc.width / 3] * 3)
        metric_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(metric_table)
        elements.append(Spacer(1, 10))
    
    # ─────────────────────────────────
    # CLINICAL SYNTHESIS
    # ─────────────────────────────────
    synthesis = report_data.get('clinical_synthesis', '')
    if synthesis:
        elements.append(_section_header(styles, '🔬', 'Síntesis Clínica'))
        elements.append(Paragraph(synthesis, styles['body']))
        elements.append(Spacer(1, 6))
    
    # ─────────────────────────────────
    # RECOMMENDED THERAPIES
    # ─────────────────────────────────
    etalons = report_data.get('recommended_etalons', [])
    if etalons:
        elements.append(_section_header(styles, '🎯', 'Terapias Recomendadas'))
        
        for etalon in etalons:
            category = etalon.get('category', '')
            remedy = etalon.get('remedy_name', '')
            target = etalon.get('target_action', '')
            items = etalon.get('items', [])
            
            elements.append(Paragraph(
                f'<b>{category}</b> — {remedy}',
                styles['heading_small']
            ))
            if target:
                elements.append(Paragraph(
                    f'<i>Objetivo: {target}</i>',
                    styles['body_small']
                ))
            
            if items:
                table_data = [['Terapia / Remedio', 'Protocolo', 'Impacto Esperado']]
                for item in items:
                    table_data.append([
                        Paragraph(f'<b>{item.get("name", "")}</b><br/><font size="7" color="#6d28d9">{item.get("purpose", "")}</font>', styles['body_small']),
                        Paragraph(item.get('protocol', ''), styles['body_small']),
                        Paragraph(item.get('expected_impact', ''), styles['body_small']),
                    ])
                
                t = Table(table_data, colWidths=[doc.width * 0.35, doc.width * 0.35, doc.width * 0.30])
                t.setStyle(_table_style_base())
                elements.append(t)
                elements.append(Spacer(1, 8))
    
    # ─────────────────────────────────
    # FOODS TO EAT
    # ─────────────────────────────────
    foods_eat = report_data.get('foods_to_eat', [])
    if foods_eat:
        elements.append(_section_header(styles, '🥗', 'Alimentos Recomendados'))
        
        table_data = [['Alimento', 'Beneficio', 'Cómo Consumir', 'Compuestos Activos']]
        for f in foods_eat:
            compounds = ', '.join(f.get('active_compounds', []))
            table_data.append([
                Paragraph(f'<b>{f.get("food", "")}</b>', styles['body_small']),
                Paragraph(f.get('benefit', ''), styles['body_small']),
                Paragraph(f.get('how_to_consume', ''), styles['body_small']),
                Paragraph(f'<font size="7">{compounds}</font>', styles['body_small']),
            ])
        
        t = Table(table_data, colWidths=[doc.width * 0.20, doc.width * 0.35, doc.width * 0.25, doc.width * 0.20])
        t.setStyle(_table_style_base())
        elements.append(t)
        elements.append(Spacer(1, 8))
    
    # ─────────────────────────────────
    # FOODS TO AVOID
    # ─────────────────────────────────
    foods_avoid = report_data.get('foods_to_avoid', [])
    if foods_avoid:
        elements.append(_section_header(styles, '🚫', 'Alimentos a Evitar'))
        
        table_data = [['Alimento', 'Razón']]
        for f in foods_avoid:
            table_data.append([
                Paragraph(f'<b>{f.get("food", "")}</b>', styles['body_small']),
                Paragraph(f.get('reason', ''), styles['body_small']),
            ])
        
        t = Table(table_data, colWidths=[doc.width * 0.30, doc.width * 0.70])
        ts = _table_style_base()
        ts.add('BACKGROUND', (0, 0), (-1, 0), RED_DARK)
        t.setStyle(ts)
        elements.append(t)
        elements.append(Spacer(1, 8))
    
    # ─────────────────────────────────
    # HERBAL TEAS
    # ─────────────────────────────────
    teas = report_data.get('herbal_teas', [])
    if teas:
        elements.append(_section_header(styles, '🍵', 'Infusiones Herbales'))
        
        table_data = [['Hierba', 'Beneficio', 'Preparación', 'Cuándo Tomar']]
        for t_item in teas:
            table_data.append([
                Paragraph(f'<b>{t_item.get("herb", "")}</b>', styles['body_small']),
                Paragraph(t_item.get('benefit', ''), styles['body_small']),
                Paragraph(t_item.get('preparation', ''), styles['body_small']),
                Paragraph(t_item.get('when', ''), styles['body_small']),
            ])
        
        t = Table(table_data, colWidths=[doc.width * 0.20, doc.width * 0.30, doc.width * 0.30, doc.width * 0.20])
        ts = _table_style_base()
        ts.add('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#92400e'))
        t.setStyle(ts)
        elements.append(t)
        elements.append(Spacer(1, 8))
    
    # ─────────────────────────────────
    # WEEKLY REGIME
    # ─────────────────────────────────
    regime = report_data.get('weekly_regime', [])
    if regime:
        elements.append(PageBreak())
        elements.append(_section_header(styles, '📅', 'Régimen Semanal'))
        
        for day_data in regime:
            day_name = day_data.get('day', '')
            elements.append(Paragraph(f'<b>{day_name}</b>', styles['heading_small']))
            
            for period_key, period_label, period_emoji in [
                ('morning', 'Mañana', '☀️'),
                ('midday', 'Mediodía', '🌤️'),
                ('evening', 'Noche', '🌙'),
            ]:
                period = day_data.get(period_key, {})
                if not period:
                    continue
                
                parts = [f'<b>{period_emoji} {period_label}</b>']
                
                if period.get('food'):
                    parts.append(f'<b>Alimentación:</b> {period["food"]}')
                if period.get('exercise'):
                    parts.append(f'<b>Ejercicio:</b> {period["exercise"]}')
                if period.get('therapy'):
                    parts.append(f'<b>Terapia:</b> {period["therapy"]}')
                if period.get('supplements'):
                    supps = '; '.join(period['supplements'])
                    parts.append(f'<b>Suplementos:</b> {supps}')
                
                text = '<br/>'.join(parts)
                elements.append(Paragraph(text, styles['body_small']))
                elements.append(Spacer(1, 3))
            
            elements.append(_hr())
    
    # ─────────────────────────────────
    # NEXT SCAN
    # ─────────────────────────────────
    next_scan = report_data.get('next_scan', {})
    if next_scan:
        elements.append(_section_header(styles, '📋', 'Próximo Escaneo Recomendado'))
        
        timeframe = next_scan.get('timeframe', 'No especificado')
        reason = next_scan.get('reason', '')
        monitors = next_scan.get('what_to_monitor', [])
        
        elements.append(Paragraph(
            f'<b>Plazo:</b> <font color="#d97706"><b>{timeframe}</b></font>',
            styles['body']
        ))
        if reason:
            elements.append(Paragraph(f'<b>Razón:</b> {reason}', styles['body']))
        
        if monitors:
            elements.append(Paragraph('<b>Qué Monitorear:</b>', styles['body']))
            for m in monitors:
                elements.append(Paragraph(f'  → {m}', styles['body_small']))
        
        elements.append(Spacer(1, 8))
    
    # ─────────────────────────────────
    # LEGAL DISCLAIMER
    # ─────────────────────────────────
    elements.append(_hr())
    elements.append(Paragraph(
        'Este reporte es generado por análisis de biorresonancia NLS con inteligencia artificial '
        'y no constituye un diagnóstico médico. Consulte a su profesional de salud para decisiones clínicas. '
        '© Vibrana AI',
        styles['legal']
    ))
    
    # Build PDF
    doc.build(elements)
    return buffer.getvalue()
