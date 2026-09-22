import base64
import io
from dataclasses import dataclass


@dataclass(frozen=True)
class PdfContent:
    text: str
    page_images: list[str]
    page_count: int
    is_scanned: bool


def _decode_pdf(encoded_document: str) -> bytes:
    try:
        return base64.b64decode(encoded_document.split(",", 1)[-1], validate=True)
    except Exception as error:
        raise RuntimeError("NOVA could not read the uploaded PDF data. Please choose the PDF again.") from error


def _extract_selectable_text(data: bytes) -> tuple[str, int]:
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages[:18]]
        return "\n".join(pages).strip()[:45_000], len(reader.pages)
    except Exception as error:
        raise RuntimeError("NOVA could not open this PDF. Try an unprotected PDF smaller than 8 MB.") from error


def _render_scanned_pages(data: bytes, page_count: int) -> list[str]:
    try:
        import fitz

        document = fitz.open(stream=data, filetype="pdf")
        images: list[str] = []
        # Two restrained pages prevent a scanned PDF from exhausting an 8 GB laptop.
        for number in range(min(2, page_count)):
            page = document.load_page(number)
            bitmap = page.get_pixmap(matrix=fitz.Matrix(1.05, 1.05), alpha=False)
            images.append(base64.b64encode(bitmap.tobytes("jpeg", jpg_quality=68)).decode("ascii"))
        document.close()
        return images
    except Exception as error:
        raise RuntimeError("NOVA could not render this scanned PDF. Try a smaller, unprotected PDF.") from error


def extract_pdf_content(encoded_document: str) -> PdfContent:
    """Keep regular PDFs lightweight and send only limited scans to the vision model."""
    data = _decode_pdf(encoded_document)
    text, page_count = _extract_selectable_text(data)
    if len(text) >= 40:
        return PdfContent(text=text, page_images=[], page_count=page_count, is_scanned=False)

    page_images = _render_scanned_pages(data, page_count)
    if not page_images:
        raise RuntimeError("This PDF has no readable pages. Try another PDF or export it again.")
    return PdfContent(
        text="This is a scanned PDF. Read the supplied page images carefully and state uncertainty where text is unclear.",
        page_images=page_images,
        page_count=page_count,
        is_scanned=True,
    )
