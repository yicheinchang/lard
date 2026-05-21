import re
import html
from io import BytesIO
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def get_string_val(val) -> str:
    """Helper to convert optional and enum values into clean strings."""
    if val is None:
        return ""
    if hasattr(val, "value"):
        return str(val.value)
    return str(val)

def format_date(dt) -> str:
    """Safely format standard datetime values."""
    if not dt:
        return "N/A"
    if isinstance(dt, str):
        try:
            # Parse ISO date prefix
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            return dt
    return dt.strftime("%b %d, %Y")

def parse_inline_markdown(text: str) -> str:
    """Escapes HTML and translates standard inline Markdown formats to XML tags."""
    if not text:
        return ""
    
    # 1. Escape HTML special characters since Paragraph parses XML tags
    escaped_text = html.escape(text)
    
    # 2. Translate Markdown Bold (**text** or __text__)
    escaped_text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', escaped_text)
    escaped_text = re.sub(r'__(.*?)__', r'<b>\1</b>', escaped_text)
    
    # 3. Translate Markdown Italic (*text* or _text_)
    escaped_text = re.sub(r'\*(.*?)\*', r'<i>\1</i>', escaped_text)
    escaped_text = re.sub(r'_(.*?)_', r'<i>\1</i>', escaped_text)
    
    # 4. Translate inline code (`code`)
    escaped_text = re.sub(r'`(.*?)`', r'<font face="Courier" color="#111827"><b>\1</b></font>', escaped_text)
    
    # 5. Translate links ([text](url))
    escaped_text = re.sub(r'\[(.*?)\]\((.*?)\)', r'<u><font color="#0000ff">\1</font></u>', escaped_text)
    
    return escaped_text

def markdown_to_reportlab(text: str, body_style: ParagraphStyle, bullet_style: ParagraphStyle, h1: ParagraphStyle, h2: ParagraphStyle, h3: ParagraphStyle, h4: ParagraphStyle, h5: ParagraphStyle, h6: ParagraphStyle) -> list:
    """
    Parses dynamic markdown text into ReportLab Flowables.
    Line-by-line single-pass parser supporting:
      - Headings (H1-H6)
      - Bullet lists (- / * / +)
      - Numbered lists (1. / 2.)
      - Tables (| Header | Header |)
      - Horizontal rules (--- / ***)
      - Paragraph lines grouped naturally.
    """
    if not text:
        return []
    
    lines = text.split('\n')
    flowables = []
    current_paragraph = []
    current_table_rows = []
    
    def flush_paragraph():
        if current_paragraph:
            content = " ".join(current_paragraph).strip()
            if content:
                flowables.append(Paragraph(parse_inline_markdown(content), body_style))
            current_paragraph.clear()
            
    def flush_table():
        if current_table_rows:
            table_data = []
            for row in current_table_rows:
                row_data = [Paragraph(parse_inline_markdown(cell), body_style) for cell in row]
                table_data.append(row_data)
            
            num_cols = len(table_data[0]) if table_data else 1
            col_width = 504.0 / num_cols
            t = Table(table_data, colWidths=[col_width] * num_cols)
            t.setStyle(TableStyle([
                ('VALIGN', (0,0), (-1,-1), 'TOP'),
                ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
                ('TOPPADDING', (0,0), (-1,-1), 5),
                ('BOTTOMPADDING', (0,0), (-1,-1), 5),
                ('LEFTPADDING', (0,0), (-1,-1), 6),
                ('RIGHTPADDING', (0,0), (-1,-1), 6),
            ]))
            flowables.append(Spacer(1, 4))
            flowables.append(t)
            flowables.append(Spacer(1, 6))
            current_table_rows.clear()
            
    def flush_all():
        flush_paragraph()
        flush_table()
        
    for line in lines:
        stripped = line.strip()
        if not stripped:
            flush_all()
            continue
            
        # Check for table rows
        if stripped.startswith('|') and stripped.endswith('|'):
            flush_paragraph() # Table breaks paragraph
            cells = [c.strip() for c in stripped.split('|')[1:-1]]
            if all(re.match(r'^:?-+:?$', c) for c in cells):
                continue
            current_table_rows.append(cells)
            continue
            
        # Check headings
        match_h = re.match(r'^(#{1,6})\s+(.*)$', stripped)
        if match_h:
            flush_all()
            level = len(match_h.group(1))
            heading_text = re.sub(r'\s+#+$', '', match_h.group(2).strip())
            heading_content = parse_inline_markdown(heading_text)
            
            styles = [h1, h2, h3, h4, h5, h6]
            heading_style = styles[min(level - 1, 5)]
            flowables.append(Paragraph(heading_content, heading_style))
            continue
            
        # Check bullet list
        match_b = re.match(r'^[\-\*\+]\s+(.*)$', stripped)
        if match_b:
            flush_all()
            bullet_content = parse_inline_markdown(match_b.group(1).strip())
            flowables.append(Paragraph(f"&bull; {bullet_content}", bullet_style))
            continue
            
        # Check numbered list
        match_n = re.match(r'^(\d+)\.\s+(.*)$', stripped)
        if match_n:
            flush_all()
            num_str, num_content = match_n.groups()
            numbered_content = parse_inline_markdown(num_content.strip())
            flowables.append(Paragraph(f"{num_str}. {numbered_content}", bullet_style))
            continue
            
        # Check horizontal rule
        if re.match(r'^(?:-{3,}|\*{3,}|_{3,})$', stripped):
            flush_all()
            hr_table = Table([[""]], colWidths=[504])
            hr_table.setStyle(TableStyle([
                ('LINEBELOW', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
                ('BOTTOMPADDING', (0,0), (-1,-1), 2),
                ('TOPPADDING', (0,0), (-1,-1), 2),
            ]))
            flowables.append(Spacer(1, 4))
            flowables.append(hr_table)
            flowables.append(Spacer(1, 4))
            continue
            
        # Regular paragraph text line
        flush_table() # Paragraph breaks table
        current_paragraph.append(stripped)
        
    flush_all()
    return flowables

def add_footer(canvas, doc):
    """Draw a clean monochrome footer line with a page number on the right."""
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#9ca3af"))  # Clean gray divider
    canvas.setLineWidth(0.5)
    canvas.line(54, 45, doc.pagesize[0] - 54, 45)
    
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(colors.HexColor("#4b5563"))
    canvas.drawRightString(doc.pagesize[0] - 54, 30, f"Page {doc.page}")
    canvas.restoreState()

def generate_job_pdf_buffer(job) -> BytesIO:
    """
    Generates a beautifully typeset, monochrome-optimized PDF representing
    the job details and layout.
    """
    buffer = BytesIO()
    
    # 54pt margin = 0.75 in
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=60
    )
    
    styles = getSampleStyleSheet()
    
    # --- Custom styles optimized for Monochrome Laser Printers ---
    title_style = ParagraphStyle(
        'PDFTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=colors.black,
        spaceAfter=4
    )
    
    subtitle_style = ParagraphStyle(
        'PDFSubtitle',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#1f2937"),
        spaceAfter=12
    )
    
    h2_style = ParagraphStyle(
        'PDFSectionHeader',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.black,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    h3_style = ParagraphStyle(
        'PDFSectionSubHeader',
        parent=styles['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#1f2937"),
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'PDFBody',
        parent=styles['BodyText'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor("#1f2937"),
        spaceAfter=6
    )
    
    bullet_style = ParagraphStyle(
        'PDFBullet',
        parent=body_style,
        leftIndent=15,
        bulletIndent=5,
        spaceAfter=4
    )

    # Heading styles specifically for Markdown content (H1-H6)
    md_h1 = ParagraphStyle('MDH1', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=15, leading=19, textColor=colors.black, spaceBefore=10, spaceAfter=5, keepWithNext=True)
    md_h2 = ParagraphStyle('MDH2', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=13, leading=17, textColor=colors.black, spaceBefore=9, spaceAfter=4.5, keepWithNext=True)
    md_h3 = ParagraphStyle('MDH3', parent=styles['Heading3'], fontName='Helvetica-Bold', fontSize=11, leading=15, textColor=colors.HexColor("#1f2937"), spaceBefore=8, spaceAfter=4, keepWithNext=True)
    md_h4 = ParagraphStyle('MDH4', parent=styles['Heading4'], fontName='Helvetica-Bold', fontSize=10, leading=14, textColor=colors.HexColor("#1f2937"), spaceBefore=7, spaceAfter=3.5, keepWithNext=True)
    md_h5 = ParagraphStyle('MDH5', parent=styles['Heading5'], fontName='Helvetica-Bold', fontSize=9.5, leading=13.5, textColor=colors.HexColor("#374151"), spaceBefore=6, spaceAfter=3, keepWithNext=True)
    md_h6 = ParagraphStyle('MDH6', parent=styles['Heading6'], fontName='Helvetica-Bold', fontSize=9.5, leading=13.5, textColor=colors.HexColor("#4b5563"), spaceBefore=5, spaceAfter=2, keepWithNext=True)
    
    meta_label_style = ParagraphStyle(
        'PDFMetaLabel',
        parent=body_style,
        fontName='Helvetica-Bold',
        textColor=colors.black,
        spaceAfter=0
    )
    
    meta_val_style = ParagraphStyle(
        'PDFMetaVal',
        parent=body_style,
        fontName='Helvetica',
        textColor=colors.HexColor("#1f2937"),
        spaceAfter=0
    )
    
    table_header_style = ParagraphStyle(
        'PDFTableHeader',
        parent=body_style,
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.black,
        spaceAfter=0
    )
    
    story = []
    
    # 1. Header Block (Company & Role)
    company_name = get_string_val(getattr(job, "company", "Unknown Company"))
    role_name = get_string_val(getattr(job, "role", "Unknown Role"))
    story.append(Paragraph(company_name, title_style))
    story.append(Paragraph(role_name, subtitle_style))
    
    # Subtle black divider line
    line_table = Table([[""]], colWidths=[504])
    line_table.setStyle(TableStyle([
        ('LINEBELOW', (0,0), (-1,-1), 1, colors.HexColor("#4b5563")),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(line_table)
    story.append(Spacer(1, 10))
    
    # 2. Metadata Grid (2 columns, pure white background for printer safety)
    status_str = get_string_val(getattr(job, "status", "N/A"))
    employment_type_str = get_string_val(getattr(job, "employment_type", "N/A"))
    location_str = get_string_val(getattr(job, "location", "N/A"))
    salary_str = get_string_val(getattr(job, "salary_range", "N/A"))
    job_id_str = get_string_val(getattr(job, "company_job_id", "N/A"))
    url_str = get_string_val(getattr(job, "url", "N/A"))
    
    posted_date = format_date(getattr(job, "job_posted_date", None))
    deadline = format_date(getattr(job, "application_deadline", None))
    applied_date = format_date(getattr(job, "applied_date", None))
    
    # Build key-value pairs formatted cleanly in cells
    def make_cell(label, val):
        return [Paragraph(label, meta_label_style), Paragraph(val if val else "N/A", meta_val_style)]
    
    meta_data = [
        [make_cell("Status:", status_str), make_cell("Job ID:", job_id_str)],
        [make_cell("Employment Type:", employment_type_str), make_cell("Posted Date:", posted_date)],
        [make_cell("Location:", location_str), make_cell("Application Deadline:", deadline)],
        [make_cell("Salary Range:", salary_str), make_cell("Actually Applied:", applied_date)],
    ]
    
    # URL spans the full bottom row (merged)
    url_escaped = html.escape(url_str)
    url_link = f'<u><font color="#0000ff"><a href="{url_escaped}">{url_escaped}</a></font></u>' if url_str != "N/A" else "N/A"
    meta_data.append([
        [Paragraph("URL:", meta_label_style), Paragraph(url_link, meta_val_style)],
        ["", ""] # Empty cell to satisfy grid size
    ])
    
    # Construct sub-tables for each cell to prevent alignment issues
    meta_table_cells = []
    for row in meta_data:
        row_cells = []
        for cell in row:
            if isinstance(cell, list):
                # Sub table for label/value side-by-side or stacked
                sub_t = Table([[cell[0], cell[1]]], colWidths=[100, 142])
                sub_t.setStyle(TableStyle([
                    ('VALIGN', (0,0), (-1,-1), 'TOP'),
                    ('LEFTPADDING', (0,0), (-1,-1), 0),
                    ('RIGHTPADDING', (0,0), (-1,-1), 0),
                    ('TOPPADDING', (0,0), (-1,-1), 0),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 0),
                ]))
                row_cells.append(sub_t)
            else:
                row_cells.append(cell)
        meta_table_cells.append(row_cells)
        
    meta_table = Table(meta_table_cells, colWidths=[252, 252])
    meta_table.setStyle(TableStyle([
        ('SPAN', (0, 4), (1, 4)), # Merge the URL cell across both columns
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#4b5563")),  # High contrast crisp border
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    
    story.append(meta_table)
    story.append(Spacer(1, 14))
    
    # 3. Contacts Section (if any exist)
    hr_email = get_string_val(getattr(job, "hr_email", None))
    hm_name = get_string_val(getattr(job, "hiring_manager_name", None))
    hm_email = get_string_val(getattr(job, "hiring_manager_email", None))
    hh_name = get_string_val(getattr(job, "headhunter_name", None))
    hh_email = get_string_val(getattr(job, "headhunter_email", None))
    
    has_contacts = hr_email or hm_name or hm_email or hh_name or hh_email
    
    if has_contacts:
        story.append(Paragraph("Contact Information", h2_style))
        contact_rows = []
        if hm_name or hm_email:
            contact_rows.append([
                Paragraph("Hiring Manager", meta_label_style),
                Paragraph(f"{hm_name} ({hm_email})" if hm_name and hm_email else (hm_name or hm_email), meta_val_style)
            ])
        if hr_email:
            contact_rows.append([
                Paragraph("HR / Recruiter", meta_label_style),
                Paragraph(hr_email, meta_val_style)
            ])
        if hh_name or hh_email:
            contact_rows.append([
                Paragraph("Headhunter / Agency", meta_label_style),
                Paragraph(f"{hh_name} ({hh_email})" if hh_name and hh_email else (hh_name or hh_email), meta_val_style)
            ])
            
        contact_table = Table(contact_rows, colWidths=[150, 354])
        contact_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor("#4b5563")),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(contact_table)
        story.append(Spacer(1, 14))
        
    # 4. Job Description Section
    description = getattr(job, "description", None)
    if description:
        story.append(Paragraph("Job Description", h2_style))
        desc_flowables = markdown_to_reportlab(description, body_style, bullet_style, md_h1, md_h2, md_h3, md_h4, md_h5, md_h6)
        story.extend(desc_flowables)
        story.append(Spacer(1, 14))
        
    # 5. Personal / Application Notes
    notes = getattr(job, "notes", None)
    if notes:
        story.append(Paragraph("Personal Notes", h2_style))
        notes_flowables = markdown_to_reportlab(notes, body_style, bullet_style, md_h1, md_h2, md_h3, md_h4, md_h5, md_h6)
        story.extend(notes_flowables)
        story.append(Spacer(1, 14))
        
    # 6. Timeline / Interview Process (On separate page at the very end)
    steps = getattr(job, "steps", [])
    if steps:
        story.append(PageBreak())  # Force placement to the very end on a clean page
        story.append(Paragraph("Interview Process Timeline", h2_style))
        
        # Sort steps by date (ascending for sequential timeline progression)
        def step_date_key(s):
            if not s.step_date:
                return datetime.max.replace(tzinfo=timezone.utc) if hasattr(datetime, "max") else datetime.max
            if isinstance(s.step_date, str):
                try:
                    return datetime.fromisoformat(s.step_date.replace("Z", "+00:00"))
                except Exception:
                    pass
            return s.step_date
            
        sorted_steps = sorted(steps, key=step_date_key)
        
        timeline_rows = [[
            Paragraph("Date", table_header_style),
            Paragraph("Stage / Event", table_header_style),
            Paragraph("Status", table_header_style),
            Paragraph("Feedback & Notes", table_header_style),
        ]]
        
        for step in sorted_steps:
            step_date_str = format_date(step.step_date)
            step_name = get_string_val(step.step_type.name if hasattr(step, "step_type") and step.step_type else getattr(step, "step_type_name", "Stage"))
            step_status = get_string_val(step.status)
            step_notes = get_string_val(step.notes)
            
            # Wrap all cell strings in Paragraphs to enforce automatic cell wrapping
            # Convert \n to <br/> AFTER markdown parsing so ReportLab renders line breaks
            notes_html = parse_inline_markdown(step_notes).replace("\n", "<br/>") if step_notes else ""
            timeline_rows.append([
                Paragraph(step_date_str, body_style),
                Paragraph(step_name, body_style),
                Paragraph(step_status, body_style),
                Paragraph(notes_html, body_style),
            ])
            
        timeline_table = Table(timeline_rows, colWidths=[80, 120, 80, 224])
        timeline_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#4b5563")),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(timeline_table)

    # Build the document, calling add_footer on page draw
    doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)
    
    buffer.seek(0)
    return buffer
