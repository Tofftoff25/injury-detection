"""
Unit tests for scan image preprocessing in BACKEND/app.py.

Verifies that EXIF orientation metadata is applied before JPEG
re-encoding, so camera captures are not sent to inference sideways.
"""
import io
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "BACKEND"))

from PIL import Image

from app import normalize_to_jpeg  # noqa: E402

# EXIF tag 274 = Orientation
EXIF_ORIENTATION = 274


def _make_orientation_test_jpeg(orientation):
    """
    Build a JPEG whose stored pixels are 200x100 (red left, blue right)
    but whose EXIF says it should display with the given orientation.
    """
    img = Image.new("RGB", (200, 100))
    pixels = img.load()
    for x in range(200):
        color = (255, 0, 0) if x < 100 else (0, 0, 255)
        for y in range(100):
            pixels[x, y] = color

    exif = img.getexif()
    exif[EXIF_ORIENTATION] = orientation
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", exif=exif.tobytes())
    return buffer.getvalue()


def test_exif_orientation_is_applied():
    """Orientation 6 rotates 90° CW: stored 200x100 becomes upright 100x200."""
    raw_bytes = _make_orientation_test_jpeg(orientation=6)

    with Image.open(io.BytesIO(raw_bytes)) as raw:
        assert raw.size == (200, 100), "Fixture should be stored as 200x100"

    jpeg_bytes = normalize_to_jpeg(raw_bytes)

    with Image.open(io.BytesIO(jpeg_bytes)) as corrected:
        assert corrected.size == (100, 200), (
            f"Expected 100x200 after EXIF correction, got {corrected.size}"
        )


def test_no_exif_keeps_dimensions():
    """Images without orientation metadata should keep their pixel dimensions."""
    img = Image.new("RGB", (160, 120), color=(0, 128, 0))
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG")

    jpeg_bytes = normalize_to_jpeg(buffer.getvalue())

    with Image.open(io.BytesIO(jpeg_bytes)) as out:
        assert out.size == (160, 120)


if __name__ == "__main__":
    test_exif_orientation_is_applied()
    test_no_exif_keeps_dimensions()
    print("PASSED: normalize_to_jpeg EXIF handling")
