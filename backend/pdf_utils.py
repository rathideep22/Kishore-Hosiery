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

    def generate_order_bill(self, order_data: dict) -> str:
        """Generate professional PDF bill for order and upload to S3"""
        # Create PDF in memory
        pdf_buffer = io.BytesIO()
        pdf = SimpleDocTemplate(
            pdf_buffer,
            pagesize=A4,
            rightMargin=0.4*inch,
            leftMargin=0.4*inch,
            topMargin=0.4*inch,
            bottomMargin=0.4*inch
        )

        # Build PDF content
        elements = []

        # Title
        title = Paragraph("KISHORE HOSIERY - ORDER BILL", self.title_style)
        elements.append(title)
        elements.append(Spacer(1, 0.15*inch))

        # Order Info Section
        order_info_data = [
            ["Order ID", order_data.get('orderId', 'N/A'), "Godown", order_data.get('godown', 'N/A')],
            ["Party Name", order_data.get('partyName', 'N/A'), "Date", order_data.get('createdAt', datetime.now().isoformat())[:10]],
            ["Location", order_data.get('location', 'N/A'), "Status", order_data.get('readinessStatus', 'Pending')],
        ]

        order_info_table = Table(order_info_data, colWidths=[1.2*inch, 2*inch, 1.2*inch, 2*inch])
        order_info_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F3F4F6')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('PADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))

        elements.append(order_info_table)
        elements.append(Spacer(1, 0.15*inch))

        # Items Table
        items_data = [["Category", "Size", "Qty", "Weight (kg)", "Rate (₹)", "Total (₹)"]]

        total_weight = 0
        total_amount = 0

        for item in order_data.get('items', []):
            # Calculate weights
            fulfillment = item.get('fulfillment', [])
            weights = [w for w in fulfillment if w is not None]
            total_item_weight = sum(weights) if weights else 0

            try:
                rate_val = float(item.get('rate', 0))
                item_total = total_item_weight * rate_val
            except:
                item_total = 0
                rate_val = 0

            total_weight += total_item_weight
            total_amount += item_total

            items_data.append([
                item.get('category', 'N/A'),  # Full category name
                item.get('size', 'N/A'),
                str(item.get('quantity', 0)),
                f"{total_item_weight:.2f}",
                f"{rate_val:.2f}",
                f"{item_total:.2f}"
            ])

        # Add total row
        items_data.append([
            "TOTAL", "", "",
            f"{total_weight:.2f}",
            "",
            f"{total_amount:.2f}"
        ])

        items_table = Table(items_data, colWidths=[2.8*inch, 0.75*inch, 0.55*inch, 1*inch, 0.85*inch, 1*inch])
        items_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2563EB')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('VALIGN', (0, 0), (-1, 0), 'MIDDLE'),
            ('PADDING', (0, 0), (-1, 0), 8),

            # Data rows
            ('FONTSIZE', (0, 1), (-1, -2), 9),
            ('PADDING', (0, 1), (-1, -2), 6),
            ('ALIGN', (2, 1), (-1, -2), 'RIGHT'),
            ('VALIGN', (0, 1), (-1, -2), 'MIDDLE'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#F9FAFB')]),

            # Total row
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#DBEAFE')),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, -1), (-1, -1), 10),
            ('PADDING', (0, -1), (-1, -1), 8),
            ('ALIGN', (2, -1), (-1, -1), 'RIGHT'),

            # Borders
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
        ]))

        elements.append(items_table)
        elements.append(Spacer(1, 0.15*inch))

        # Summary
        summary_data = [
            ["Total Weight", f"{total_weight:.2f} kg", "Total Amount", f"₹ {total_amount:.2f}"],
            ["Total Parcels", str(order_data.get('totalParcels', 0)), "Created By", order_data.get('createdByName', 'System')],
        ]

        summary_table = Table(summary_data, colWidths=[2*inch, 2*inch, 2*inch, 2*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F0F9FF')),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('PADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))

        elements.append(summary_table)

        # Footer
        elements.append(Spacer(1, 0.2*inch))
        footer_text = f"<i>Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Kishore Hosiery</i>"
        footer = Paragraph(footer_text, ParagraphStyle('footer', parent=self.styles['Normal'], fontSize=8, textColor=colors.grey, alignment=TA_CENTER))
        elements.append(footer)

        # Build PDF
        pdf.build(elements)

        # Get PDF content
        pdf_content = pdf_buffer.getvalue()

        # Upload to S3
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
