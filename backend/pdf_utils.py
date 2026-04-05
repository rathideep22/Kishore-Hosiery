"""PDF generation utilities for order bills"""
import io
from datetime import datetime
from typing import List, Dict, Any
import boto3
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT


class OrderPDFGenerator:
    def __init__(self, bucket_name: str):
        self.bucket_name = bucket_name
        self.s3_client = boto3.client('s3')
        self.styles = getSampleStyleSheet()
        self._setup_styles()

    def _setup_styles(self):
        """Setup custom paragraph styles"""
        self.title_style = ParagraphStyle(
            'CustomTitle',
            parent=self.styles['Heading1'],
            fontSize=18,
            textColor=colors.HexColor('#2563EB'),
            spaceAfter=12,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )
        self.heading_style = ParagraphStyle(
            'CustomHeading',
            parent=self.styles['Heading2'],
            fontSize=12,
            textColor=colors.HexColor('#1F2937'),
            spaceAfter=6,
            fontName='Helvetica-Bold'
        )

    def generate_order_bill(self, order_data: Dict[str, Any]) -> str:
        """Generate PDF bill for order and upload to S3"""
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

        # Header
        title = Paragraph("📋 ORDER BILL", self.title_style)
        elements.append(title)
        elements.append(Spacer(1, 0.2*inch))

        # Order Info Section
        order_info_data = [
            ["Order ID", order_data.get('orderId', 'N/A')],
            ["Party Name", order_data.get('partyName', 'N/A')],
            ["Location", order_data.get('location', 'N/A')],
            ["Godown", order_data.get('godown', 'N/A')],
            ["Date", order_data.get('createdAt', datetime.now().isoformat())[:10]],
            ["Status", order_data.get('readinessStatus', 'Pending')],
        ]

        order_info_table = Table(order_info_data, colWidths=[2*inch, 4*inch])
        order_info_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#F3F4F6')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB')),
        ]))

        elements.append(order_info_table)
        elements.append(Spacer(1, 0.2*inch))

        # Items Table
        items_heading = Paragraph("📦 ORDER ITEMS", self.heading_style)
        elements.append(items_heading)
        elements.append(Spacer(1, 0.1*inch))

        # Build items table
        items_data = [["Category", "Size", "Qty", "Weight (kg)", "Rate (₹)", "Total"]]

        total_weight = 0
        total_amount = 0

        for item in order_data.get('items', []):
            category = item.get('category', 'N/A')
            size = item.get('size', 'N/A')
            qty = item.get('quantity', 0)
            rate = item.get('rate', '0')

            # Calculate weights
            fulfillment = item.get('fulfillment', [])
            weights = [w for w in fulfillment if w is not None]
            total_item_weight = sum(weights) if weights else 0

            try:
                rate_val = float(rate)
                item_total = total_item_weight * rate_val
            except:
                item_total = 0
                rate_val = 0

            total_weight += total_item_weight
            total_amount += item_total

            items_data.append([
                category,
                size,
                str(qty),
                f"{total_item_weight:.2f}",
                f"{rate_val:.2f}",
                f"{item_total:.2f}"
            ])

        # Add total row
        items_data.append([
            "TOTAL", "", "",
            f"{total_weight:.2f}", "",
            f"{total_amount:.2f}"
        ])

        items_table = Table(items_data, colWidths=[1.5*inch, 1*inch, 0.8*inch, 1.2*inch, 1.2*inch, 1.2*inch])
        items_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2563EB')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#F0F9FF')),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, -1), (-1, -1), 11),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor('#F9FAFB')]),
        ]))

        elements.append(items_table)
        elements.append(Spacer(1, 0.2*inch))

        # Summary
        summary_data = [
            ["Total Weight", f"{total_weight:.2f} kg"],
            ["Total Amount", f"₹ {total_amount:.2f}"],
            ["Total Parcels", str(order_data.get('totalParcels', 0))],
        ]

        summary_table = Table(summary_data, colWidths=[2*inch, 2*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#DBEAFE')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('PADDING', (0, 0), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB')),
        ]))

        elements.append(summary_table)

        # Footer
        elements.append(Spacer(1, 0.3*inch))
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
            ContentType='application/pdf',
        )

        # Generate S3 URL (permanent, no expiration)
        pdf_url = f"https://{self.bucket_name}.s3.amazonaws.com/{pdf_key}"

        return pdf_url
