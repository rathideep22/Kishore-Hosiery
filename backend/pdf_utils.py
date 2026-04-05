"""PDF generation utilities for order bills"""
import io
import os
from datetime import datetime
import boto3
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT


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
        self.title_style = ParagraphStyle(
            'CustomTitle',
            parent=self.styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#2563EB'),
            spaceAfter=12,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )
        self.normal_style = ParagraphStyle(
            'Normal',
            parent=self.styles['Normal'],
            fontSize=10,
            alignment=TA_LEFT
        )

    def generate_order_bill(self, order_data: dict, custom_filename: str = None) -> str:
        """Generate professional PDF bill for order and upload to S3

        Args:
            order_data: Order document data
            custom_filename: Optional custom filename (without extension) e.g., "Party Name (2026-04-05)"
        """
        # Create PDF in memory
        pdf_buffer = io.BytesIO()
        pdf = SimpleDocTemplate(
            pdf_buffer,
            pagesize=A4,
            rightMargin=0.5*inch,
            leftMargin=0.5*inch,
            topMargin=0.5*inch,
            bottomMargin=0.5*inch
        )

        # Build PDF content
        elements = []

        # ─── Title: Kishor Hosiery (boxed, centered) ─────────────────────────
        title_table = Table([["Kishor Hosiery"]], colWidths=[2.5*inch])
        title_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 16),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOX', (0, 0), (-1, -1), 1.2, colors.black),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        # Center the title box
        title_wrapper = Table([[title_table]], colWidths=[7.5*inch])
        title_wrapper.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        elements.append(title_wrapper)
        elements.append(Spacer(1, 0.25*inch))

        # ─── Header Info: Order/Party/Location on left, Date/Godown/Bill on right ──
        order_date = order_data.get('createdAt', datetime.now().isoformat())[:10]
        header_data = [
            [
                Paragraph(f"<b>Order No:</b> <u>{order_data.get('orderId', 'N/A')}</u>", self.normal_style),
                Paragraph(f"<b>Date:</b> <u>{order_date}</u>", self.normal_style),
            ],
            [
                Paragraph(f"<b>Party Name:</b> <u>{order_data.get('partyName', 'N/A')}</u>", self.normal_style),
                Paragraph(f"<b>Godown:</b> <u>{order_data.get('godown', 'N/A')}</u>", self.normal_style),
            ],
            [
                Paragraph(f"<b>Location:</b> <u>{order_data.get('location', 'N/A')}</u>", self.normal_style),
                Paragraph(f"<b>Bill No:</b> <u>{order_data.get('billNo', 'N/A')}</u>", self.normal_style),
            ],
        ]
        header_table = Table(header_data, colWidths=[4*inch, 3.5*inch])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(header_table)
        elements.append(Spacer(1, 0.2*inch))

        # ─── Items Section: Each item listed with parcels ─────────────────────
        items = order_data.get('items', [])
        grand_total_weight = 0
        grand_total_parcels = 0

        # Style for parcel list
        parcel_style = ParagraphStyle(
            'Parcel',
            parent=self.styles['Normal'],
            fontSize=10,
            leftIndent=20,
            spaceAfter=2,
        )
        item_header_style = ParagraphStyle(
            'ItemHeader',
            parent=self.styles['Normal'],
            fontSize=11,
            fontName='Helvetica-Bold',
        )

        for idx, item in enumerate(items, start=1):
            fulfillment = item.get('fulfillment', [])
            weights = [w for w in fulfillment if w is not None]
            total_item_weight = sum(weights) if weights else 0
            total_item_parcels = len(weights)

            try:
                rate_val = float(item.get('rate', 0))
            except:
                rate_val = 0

            grand_total_weight += total_item_weight
            grand_total_parcels += total_item_parcels

            # Item header row: "(N) Print Name Item" on left, boxes on right
            print_name = item.get('printName', item.get('category', 'N/A'))
            item_title = Paragraph(
                f"<b>({idx}) {print_name}</b> — <i>{item.get('category', '')} / {item.get('size', '')}</i>",
                item_header_style
            )

            # Three boxes: Total weight, Total Parcel, Rate
            boxes_data = [[
                f"Total Weight\n{total_item_weight:.2f} kg",
                f"Total Parcel\n{total_item_parcels}",
                f"Rate\n₹ {rate_val:.2f}",
            ]]
            boxes_table = Table(boxes_data, colWidths=[1.15*inch, 1.05*inch, 1*inch])
            boxes_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BOX', (0, 0), (0, 0), 0.8, colors.black),
                ('BOX', (1, 0), (1, 0), 0.8, colors.black),
                ('BOX', (2, 0), (2, 0), 0.8, colors.black),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ]))

            # Combine title and boxes on same row
            header_row = Table(
                [[item_title, boxes_table]],
                colWidths=[4.1*inch, 3.4*inch]
            )
            header_row.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ]))
            elements.append(header_row)
            elements.append(Spacer(1, 0.08*inch))

            # Parcel list: P1 - weight, P2 - weight, ...
            if fulfillment:
                for p_idx, weight in enumerate(fulfillment, start=1):
                    if weight is not None:
                        parcel_text = f"P{p_idx} — {weight:.2f} kg"
                    else:
                        parcel_text = f"P{p_idx} — —"
                    elements.append(Paragraph(parcel_text, parcel_style))
            else:
                for p_idx in range(1, (item.get('quantity', 0) or 0) + 1):
                    elements.append(Paragraph(f"P{p_idx} — —", parcel_style))

            elements.append(Spacer(1, 0.15*inch))

        # ─── Grand Total Boxes: Total Parcel, Total Weight ────────────────────
        total_boxes_data = [[
            f"Total Parcel\n{grand_total_parcels}",
            f"Total Weight\n{grand_total_weight:.2f} kg",
        ]]
        total_boxes_table = Table(total_boxes_data, colWidths=[1.5*inch, 1.5*inch])
        total_boxes_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOX', (0, 0), (0, 0), 1, colors.black),
            ('BOX', (1, 0), (1, 0), 1, colors.black),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(Spacer(1, 0.15*inch))
        elements.append(total_boxes_table)
        elements.append(Spacer(1, 0.25*inch))

        # ─── Dispatch Note Section ────────────────────────────────────────────
        dispatch_label = Table([["Dispatch Note"]], colWidths=[1.5*inch])
        dispatch_label.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOX', (0, 0), (-1, -1), 1, colors.black),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(dispatch_label)

        dispatch_note_text = order_data.get('dispatchNote') or order_data.get('message') or ""
        dispatch_box = Table(
            [[Paragraph(dispatch_note_text, self.normal_style)]],
            colWidths=[7.5*inch],
            rowHeights=[0.8*inch]
        )
        dispatch_box.setStyle(TableStyle([
            ('BOX', (0, 0), (-1, -1), 1, colors.black),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(dispatch_box)

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
