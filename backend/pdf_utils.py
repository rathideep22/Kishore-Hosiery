"""PDF generation utilities for order bills"""
import io
import os
from datetime import datetime
import boto3
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, KeepTogether
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT


# ─── Brand Color Palette ──────────────────────────────────────────────────────
BRAND_DARK = colors.HexColor('#0F172A')       # slate-900 - headers
BRAND_PRIMARY = colors.HexColor('#1E3A8A')    # blue-900 - primary accent
BRAND_ACCENT = colors.HexColor('#D97706')     # amber-600 - totals highlight
BRAND_ACCENT_LIGHT = colors.HexColor('#FEF3C7')  # amber-100
LIGHT_BG = colors.HexColor('#F8FAFC')         # slate-50
SUBTLE_BG = colors.HexColor('#F1F5F9')        # slate-100
ROW_ALT = colors.HexColor('#EFF6FF')          # blue-50
BORDER = colors.HexColor('#E2E8F0')           # slate-200
BORDER_STRONG = colors.HexColor('#CBD5E1')    # slate-300
TEXT_MUTED = colors.HexColor('#64748B')       # slate-500
TEXT_DARK = colors.HexColor('#0F172A')        # slate-900
WHITE = colors.HexColor('#FFFFFF')


class OrderPDFGenerator:
    def __init__(self, bucket_name: str = None):
        self.bucket_name = bucket_name or os.environ.get('AWS_S3_BUCKET', 'bills-kishore')

        # Create S3 client with credentials from environment
        aws_access_key = os.environ.get('AWS_ACCESS_KEY_ID')
        aws_secret_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
        aws_region = os.environ.get('AWS_REGION', 'eu-north-1')

        if aws_access_key and aws_secret_key:
            self.s3_client = boto3.client(
                's3',
                aws_access_key_id=aws_access_key,
                aws_secret_access_key=aws_secret_key,
                region_name=aws_region
            )
        else:
            self.s3_client = boto3.client('s3', region_name=aws_region)

        self.styles = getSampleStyleSheet()
        self._setup_styles()

    def _setup_styles(self):
        """Setup custom paragraph styles"""
        self.brand_title = ParagraphStyle(
            'BrandTitle',
            parent=self.styles['Heading1'],
            fontSize=24,
            textColor=WHITE,
            fontName='Helvetica-Bold',
            alignment=TA_LEFT,
            leading=26,
        )
        self.brand_tagline = ParagraphStyle(
            'BrandTagline',
            parent=self.styles['Normal'],
            fontSize=9,
            textColor=colors.HexColor('#CBD5E1'),
            fontName='Helvetica',
            alignment=TA_LEFT,
            leading=11,
        )
        self.invoice_label = ParagraphStyle(
            'InvoiceLabel',
            parent=self.styles['Normal'],
            fontSize=18,
            textColor=BRAND_ACCENT,
            fontName='Helvetica-Bold',
            alignment=TA_RIGHT,
            leading=20,
        )
        self.invoice_sub = ParagraphStyle(
            'InvoiceSub',
            parent=self.styles['Normal'],
            fontSize=9,
            textColor=colors.HexColor('#CBD5E1'),
            fontName='Helvetica',
            alignment=TA_RIGHT,
            leading=11,
        )
        self.section_label = ParagraphStyle(
            'SectionLabel',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=TEXT_MUTED,
            fontName='Helvetica-Bold',
            alignment=TA_LEFT,
            leading=10,
        )
        self.info_label = ParagraphStyle(
            'InfoLabel',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=TEXT_MUTED,
            fontName='Helvetica',
            alignment=TA_LEFT,
            leading=10,
        )
        self.info_value = ParagraphStyle(
            'InfoValue',
            parent=self.styles['Normal'],
            fontSize=10,
            textColor=TEXT_DARK,
            fontName='Helvetica-Bold',
            alignment=TA_LEFT,
            leading=12,
        )
        self.item_title_style = ParagraphStyle(
            'ItemTitle',
            parent=self.styles['Normal'],
            fontSize=11,
            textColor=WHITE,
            fontName='Helvetica-Bold',
            alignment=TA_LEFT,
            leading=13,
        )
        self.parcel_style = ParagraphStyle(
            'ParcelStyle',
            parent=self.styles['Normal'],
            fontSize=9,
            textColor=TEXT_DARK,
            fontName='Helvetica',
            alignment=TA_CENTER,
            leading=11,
        )
        self.normal_style = ParagraphStyle(
            'Normal',
            parent=self.styles['Normal'],
            fontSize=10,
            textColor=TEXT_DARK,
            alignment=TA_LEFT,
            leading=12,
        )
        self.footer_style = ParagraphStyle(
            'Footer',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=TEXT_MUTED,
            fontName='Helvetica-Oblique',
            alignment=TA_CENTER,
            leading=10,
        )

    def generate_order_bill(self, order_data: dict, custom_filename: str = None) -> str:
        """Generate professional PDF bill for order and upload to S3

        Args:
            order_data: Order document data
            custom_filename: Optional custom filename (without extension) e.g., "Party Name (2026-04-05)"
        """
        # Create PDF in memory - zero margins, we'll handle spacing inside
        pdf_buffer = io.BytesIO()
        pdf = SimpleDocTemplate(
            pdf_buffer,
            pagesize=A4,
            rightMargin=0,
            leftMargin=0,
            topMargin=0,
            bottomMargin=0
        )

        # A4 is 8.27" wide. Content width = 7.27" with 0.5" margins
        PAGE_WIDTH = 8.27 * inch
        CONTENT_WIDTH = 7.27 * inch
        SIDE_MARGIN = 0.5 * inch

        elements = []

        # ═══ 1. HEADER BAND (full-width dark bar with brand + invoice label) ═══
        order_id = order_data.get('orderId', 'N/A')
        brand_block = [
            [Paragraph("KISHOR HOSIERY", self.brand_title)],
            [Paragraph("Quality Hosiery &amp; Garments Manufacturing", self.brand_tagline)],
        ]
        brand_table = Table(brand_block, colWidths=[4*inch])
        brand_table.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))

        invoice_block = [
            [Paragraph("INVOICE", self.invoice_label)],
            [Paragraph(f"Order #{order_id}", self.invoice_sub)],
        ]
        invoice_table = Table(invoice_block, colWidths=[3*inch])
        invoice_table.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))

        header_band = Table(
            [[brand_table, invoice_table]],
            colWidths=[4.3*inch, 3.97*inch]
        )
        header_band.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), BRAND_DARK),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (0, 0), 0.5*inch),
            ('RIGHTPADDING', (-1, 0), (-1, 0), 0.5*inch),
            ('TOPPADDING', (0, 0), (-1, -1), 22),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 22),
        ]))
        elements.append(header_band)

        # Thin amber accent strip under header
        accent_strip = Table([[""]], colWidths=[PAGE_WIDTH], rowHeights=[4])
        accent_strip.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), BRAND_ACCENT),
        ]))
        elements.append(accent_strip)
        elements.append(Spacer(1, 0.3*inch))

        # ═══ 2. INFO CARDS (Bill To | Invoice Details) ═══════════════════════
        order_date = order_data.get('createdAt', datetime.now().isoformat())[:10]

        info_pair_style = ParagraphStyle(
            'InfoPair', parent=self.styles['Normal'],
            fontSize=10, textColor=TEXT_DARK, alignment=TA_LEFT, leading=13,
            fontName='Helvetica',
        )

        def info_pair(label, value):
            """Build a single Paragraph with small label above bold value."""
            value_str = str(value) if value else "—"
            # Escape angle brackets for safety
            value_str = value_str.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            text = (
                f'<font size="7" color="#64748B"><b>{label.upper()}</b></font><br/>'
                f'<font size="10" color="#0F172A"><b>{value_str}</b></font>'
            )
            return Paragraph(text, info_pair_style)

        card_header_style = ParagraphStyle(
            'CardHeader', parent=self.styles['Normal'],
            fontSize=9, textColor=WHITE, fontName='Helvetica-Bold',
            alignment=TA_LEFT, leading=11
        )

        # Left card: Bill To (stacked rows, single column)
        bill_to_data = [
            [Paragraph("BILL TO", card_header_style)],
            [info_pair("Party Name", order_data.get('partyName', 'N/A'))],
            [info_pair("Location", order_data.get('location', 'N/A'))],
            [info_pair("Godown", order_data.get('godown', 'N/A'))],
        ]
        bill_to_card = Table(bill_to_data, colWidths=[3.4*inch])
        bill_to_card.setStyle(TableStyle([
            # Header row (row 0)
            ('BACKGROUND', (0, 0), (-1, 0), BRAND_PRIMARY),
            ('LEFTPADDING', (0, 0), (-1, 0), 12),
            ('RIGHTPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 0), (-1, 0), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            # Body rows (rows 1+)
            ('BACKGROUND', (0, 1), (-1, -1), LIGHT_BG),
            ('LEFTPADDING', (0, 1), (-1, -1), 12),
            ('RIGHTPADDING', (0, 1), (-1, -1), 12),
            ('TOPPADDING', (0, 1), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
            ('BOX', (0, 0), (-1, -1), 0.5, BORDER),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))

        # Right card: Invoice Details
        invoice_details_data = [
            [Paragraph("INVOICE DETAILS", card_header_style)],
            [info_pair("Order No", order_id)],
            [info_pair("Date", order_date)],
            [info_pair("Bill No", order_data.get('billNo') or "—")],
        ]
        invoice_details_card = Table(invoice_details_data, colWidths=[3.4*inch])
        invoice_details_card.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), BRAND_PRIMARY),
            ('LEFTPADDING', (0, 0), (-1, 0), 12),
            ('RIGHTPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 0), (-1, 0), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('BACKGROUND', (0, 1), (-1, -1), LIGHT_BG),
            ('LEFTPADDING', (0, 1), (-1, -1), 12),
            ('RIGHTPADDING', (0, 1), (-1, -1), 12),
            ('TOPPADDING', (0, 1), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
            ('BOX', (0, 0), (-1, -1), 0.5, BORDER),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))

        cards_row = Table(
            [[bill_to_card, "", invoice_details_card]],
            colWidths=[3.4*inch, 0.27*inch, 3.4*inch]
        )
        cards_row.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]))

        cards_wrapper = Table([[cards_row]], colWidths=[CONTENT_WIDTH])
        cards_wrapper.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), SIDE_MARGIN),
            ('RIGHTPADDING', (0, 0), (-1, -1), SIDE_MARGIN),
        ]))
        elements.append(cards_wrapper)
        elements.append(Spacer(1, 0.3*inch))

        # ═══ 3. ITEMS SECTIONS ═══════════════════════════════════════════════
        items = order_data.get('items', [])
        grand_total_weight = 0
        grand_total_parcels = 0

        # Section title
        section_title = Table(
            [[Paragraph(
                "ORDER ITEMS",
                ParagraphStyle('ST', parent=self.styles['Normal'], fontSize=10,
                               textColor=BRAND_DARK, fontName='Helvetica-Bold',
                               alignment=TA_LEFT, leading=12)
            )]],
            colWidths=[CONTENT_WIDTH]
        )
        section_title.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), SIDE_MARGIN),
            ('RIGHTPADDING', (0, 0), (-1, -1), SIDE_MARGIN),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(section_title)

        # Divider line
        divider = Table([[""]], colWidths=[CONTENT_WIDTH], rowHeights=[1.5])
        divider.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), BRAND_ACCENT),
            ('LEFTPADDING', (0, 0), (-1, -1), SIDE_MARGIN),
            ('RIGHTPADDING', (0, 0), (-1, -1), SIDE_MARGIN),
        ]))
        divider_wrap = Table([[Table([[""]], colWidths=[CONTENT_WIDTH - 2*SIDE_MARGIN], rowHeights=[1.5], style=[('BACKGROUND', (0,0), (-1,-1), BRAND_ACCENT)])]], colWidths=[CONTENT_WIDTH])
        divider_wrap.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), SIDE_MARGIN),
            ('RIGHTPADDING', (0, 0), (-1, -1), SIDE_MARGIN),
        ]))
        elements.append(divider_wrap)
        elements.append(Spacer(1, 0.15*inch))

        for idx, item in enumerate(items, start=1):
            fulfillment = item.get('fulfillment', []) or []
            weights = [w for w in fulfillment if w is not None]
            total_item_weight = sum(weights) if weights else 0
            total_item_parcels = len(weights)

            try:
                rate_val = float(item.get('rate') or 0)
            except:
                rate_val = 0

            grand_total_weight += total_item_weight
            grand_total_parcels += total_item_parcels

            print_name = item.get('printName', item.get('category', 'N/A'))
            category = item.get('category', '')
            size = item.get('size', '')

            # Item header bar: dark background with number badge + name + category
            item_title_text = f'<font color="#D97706"><b>#{idx}</b></font>  <b>{print_name}</b>  <font color="#94A3B8">&nbsp;&nbsp;|&nbsp;&nbsp; {category} · Size {size}</font>'
            item_header = Table(
                [[Paragraph(item_title_text, self.item_title_style)]],
                colWidths=[CONTENT_WIDTH - 2*SIDE_MARGIN]
            )
            item_header.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), BRAND_DARK),
                ('LEFTPADDING', (0, 0), (-1, -1), 14),
                ('RIGHTPADDING', (0, 0), (-1, -1), 14),
                ('TOPPADDING', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ]))

            # Parcel grid - 4 columns
            parcel_count = max(len(fulfillment), item.get('quantity', 0) or 0)
            parcel_cells = []
            for p_idx in range(parcel_count):
                weight = fulfillment[p_idx] if p_idx < len(fulfillment) else None
                if weight is not None:
                    cell_content = [
                        Paragraph(f"P{p_idx+1}", ParagraphStyle(
                            'PLabel', parent=self.styles['Normal'],
                            fontSize=8, textColor=TEXT_MUTED,
                            fontName='Helvetica-Bold', alignment=TA_CENTER, leading=10
                        )),
                        Paragraph(f"{weight:.2f} kg", ParagraphStyle(
                            'PWeight', parent=self.styles['Normal'],
                            fontSize=11, textColor=TEXT_DARK,
                            fontName='Helvetica-Bold', alignment=TA_CENTER, leading=13
                        )),
                    ]
                else:
                    cell_content = [
                        Paragraph(f"P{p_idx+1}", ParagraphStyle(
                            'PLabel', parent=self.styles['Normal'],
                            fontSize=8, textColor=TEXT_MUTED,
                            fontName='Helvetica-Bold', alignment=TA_CENTER, leading=10
                        )),
                        Paragraph("—", ParagraphStyle(
                            'PEmpty', parent=self.styles['Normal'],
                            fontSize=11, textColor=TEXT_MUTED,
                            fontName='Helvetica', alignment=TA_CENTER, leading=13
                        )),
                    ]
                parcel_cells.append(cell_content)

            # Build parcel grid rows (4 per row)
            parcel_rows = []
            cols_per_row = 4
            for i in range(0, len(parcel_cells), cols_per_row):
                row = parcel_cells[i:i+cols_per_row]
                while len(row) < cols_per_row:
                    row.append("")
                parcel_rows.append(row)

            inner_w = CONTENT_WIDTH - 2*SIDE_MARGIN
            col_w = inner_w / cols_per_row
            if parcel_rows:
                parcel_grid = Table(parcel_rows, colWidths=[col_w]*cols_per_row)
                grid_style = [
                    ('BACKGROUND', (0, 0), (-1, -1), WHITE),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 4),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                    ('TOPPADDING', (0, 0), (-1, -1), 10),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                    # Grid lines
                    ('LINEBEFORE', (1, 0), (-1, -1), 0.3, BORDER),
                    ('LINEABOVE', (0, 1), (-1, -1), 0.3, BORDER),
                    ('BOX', (0, 0), (-1, -1), 0.5, BORDER_STRONG),
                ]
                # Alternate row backgrounds
                for r in range(len(parcel_rows)):
                    if r % 2 == 1:
                        grid_style.append(('BACKGROUND', (0, r), (-1, r), LIGHT_BG))
                parcel_grid.setStyle(TableStyle(grid_style))
            else:
                parcel_grid = Spacer(1, 1)

            # Item summary strip (bottom of item card)
            amount = total_item_weight * rate_val
            summary_row = [[
                Paragraph(
                    f'<font color="#64748B" size="8">TOTAL WEIGHT</font><br/><b><font size="11" color="#0F172A">{total_item_weight:.2f} kg</font></b>',
                    ParagraphStyle('s1', parent=self.styles['Normal'], alignment=TA_CENTER, leading=13)
                ),
                Paragraph(
                    f'<font color="#64748B" size="8">TOTAL PARCELS</font><br/><b><font size="11" color="#0F172A">{total_item_parcels}</font></b>',
                    ParagraphStyle('s2', parent=self.styles['Normal'], alignment=TA_CENTER, leading=13)
                ),
                Paragraph(
                    f'<font color="#64748B" size="8">RATE / KG</font><br/><b><font size="11" color="#0F172A">Rs. {rate_val:,.2f}</font></b>',
                    ParagraphStyle('s3', parent=self.styles['Normal'], alignment=TA_CENTER, leading=13)
                ),
                Paragraph(
                    f'<font color="#FEF3C7" size="8">AMOUNT</font><br/><b><font size="12" color="#FFFFFF">Rs. {amount:,.2f}</font></b>',
                    ParagraphStyle('s4', parent=self.styles['Normal'], alignment=TA_CENTER, leading=14)
                ),
            ]]
            summary_table = Table(summary_row, colWidths=[col_w]*4)
            summary_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (2, -1), SUBTLE_BG),
                ('BACKGROUND', (3, 0), (3, -1), BRAND_ACCENT),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('TOPPADDING', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                ('LINEBEFORE', (1, 0), (-1, -1), 0.3, BORDER),
                ('BOX', (0, 0), (-1, -1), 0.5, BORDER_STRONG),
            ]))

            # Stack item parts and wrap with side margins
            item_stack = Table(
                [[item_header], [parcel_grid], [summary_table]],
                colWidths=[CONTENT_WIDTH - 2*SIDE_MARGIN]
            )
            item_stack.setStyle(TableStyle([
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ]))
            item_wrapper = Table([[item_stack]], colWidths=[CONTENT_WIDTH])
            item_wrapper.setStyle(TableStyle([
                ('LEFTPADDING', (0, 0), (-1, -1), SIDE_MARGIN),
                ('RIGHTPADDING', (0, 0), (-1, -1), SIDE_MARGIN),
            ]))
            elements.append(KeepTogether(item_wrapper))
            elements.append(Spacer(1, 0.2*inch))

        # ═══ 4. GRAND TOTAL BAR ═══════════════════════════════════════════════
        grand_amount = 0
        for item in items:
            fulfillment = item.get('fulfillment') or []
            weights = [w for w in fulfillment if w is not None]
            try:
                rv = float(item.get('rate') or 0)
            except:
                rv = 0
            grand_amount += sum(weights) * rv

        grand_total_row = [[
            Paragraph(
                '<font color="#CBD5E1" size="9">TOTAL PARCELS</font><br/><b><font size="16" color="#FFFFFF">' + str(grand_total_parcels) + '</font></b>',
                ParagraphStyle('g1', parent=self.styles['Normal'], alignment=TA_CENTER, leading=18)
            ),
            Paragraph(
                f'<font color="#CBD5E1" size="9">TOTAL WEIGHT</font><br/><b><font size="16" color="#FFFFFF">{grand_total_weight:.2f} kg</font></b>',
                ParagraphStyle('g2', parent=self.styles['Normal'], alignment=TA_CENTER, leading=18)
            ),
            Paragraph(
                f'<font color="#FEF3C7" size="9">GRAND TOTAL</font><br/><b><font size="16" color="#FFFFFF">Rs. {grand_amount:,.2f}</font></b>',
                ParagraphStyle('g3', parent=self.styles['Normal'], alignment=TA_CENTER, leading=18)
            ),
        ]]
        inner_w = CONTENT_WIDTH - 2*SIDE_MARGIN
        grand_table = Table(grand_total_row, colWidths=[inner_w/3]*3)
        grand_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (1, -1), BRAND_DARK),
            ('BACKGROUND', (2, 0), (2, -1), BRAND_ACCENT),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 16),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 16),
            ('LINEBEFORE', (1, 0), (-1, -1), 1, colors.HexColor('#334155')),
        ]))
        grand_wrapper = Table([[grand_table]], colWidths=[CONTENT_WIDTH])
        grand_wrapper.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), SIDE_MARGIN),
            ('RIGHTPADDING', (0, 0), (-1, -1), SIDE_MARGIN),
        ]))
        elements.append(grand_wrapper)
        elements.append(Spacer(1, 0.3*inch))

        # ═══ 5. DISPATCH NOTE ═════════════════════════════════════════════════
        dispatch_note_text = order_data.get('dispatchNote') or order_data.get('message') or "—"

        dispatch_card_data = [
            [Paragraph("DISPATCH NOTE", ParagraphStyle(
                'DispLabel', parent=self.styles['Normal'],
                fontSize=9, textColor=WHITE, fontName='Helvetica-Bold',
                alignment=TA_LEFT, leading=11
            ))],
            [Paragraph(dispatch_note_text, ParagraphStyle(
                'DispBody', parent=self.styles['Normal'],
                fontSize=10, textColor=TEXT_DARK, fontName='Helvetica',
                alignment=TA_LEFT, leading=14
            ))],
        ]
        dispatch_card = Table(dispatch_card_data, colWidths=[CONTENT_WIDTH - 2*SIDE_MARGIN])
        dispatch_card.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), BRAND_PRIMARY),
            ('LEFTPADDING', (0, 0), (-1, 0), 14),
            ('RIGHTPADDING', (0, 0), (-1, 0), 14),
            ('TOPPADDING', (0, 0), (-1, 0), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('BACKGROUND', (0, 1), (-1, 1), LIGHT_BG),
            ('LEFTPADDING', (0, 1), (-1, 1), 14),
            ('RIGHTPADDING', (0, 1), (-1, 1), 14),
            ('TOPPADDING', (0, 1), (-1, 1), 14),
            ('BOTTOMPADDING', (0, 1), (-1, 1), 14),
            ('BOX', (0, 0), (-1, -1), 0.5, BORDER),
        ]))
        dispatch_wrapper = Table([[dispatch_card]], colWidths=[CONTENT_WIDTH])
        dispatch_wrapper.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), SIDE_MARGIN),
            ('RIGHTPADDING', (0, 0), (-1, -1), SIDE_MARGIN),
        ]))
        elements.append(dispatch_wrapper)
        elements.append(Spacer(1, 0.4*inch))

        # ═══ 6. FOOTER ════════════════════════════════════════════════════════
        footer_text = (
            f"<b>Thank you for your business!</b><br/>"
            f"Generated on {datetime.now().strftime('%B %d, %Y at %I:%M %p')} · Kishor Hosiery"
        )
        footer_para = Paragraph(footer_text, self.footer_style)
        footer_wrapper = Table([[footer_para]], colWidths=[CONTENT_WIDTH])
        footer_wrapper.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), SIDE_MARGIN),
            ('RIGHTPADDING', (0, 0), (-1, -1), SIDE_MARGIN),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ('LINEABOVE', (0, 0), (-1, -1), 0.5, BORDER),
        ]))
        elements.append(footer_wrapper)

        # Build PDF
        pdf.build(elements)

        # Get PDF content
        pdf_content = pdf_buffer.getvalue()

        # Generate PDF key with custom filename or default
        if custom_filename:
            # Use custom filename format: "Party name (date).pdf"
            pdf_key = f"bills/{custom_filename}.pdf"
        else:
            # Use default format with timestamp
            pdf_key = f"bills/{order_data.get('orderId', 'order')}_bill_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"

        self.s3_client.put_object(
            Bucket=self.bucket_name,
            Key=pdf_key,
            Body=pdf_content,
            ContentType='application/pdf'
        )

        # Generate permanent public URL
        pdf_url = f"https://{self.bucket_name}.s3.eu-north-1.amazonaws.com/{pdf_key}"

        return pdf_url
