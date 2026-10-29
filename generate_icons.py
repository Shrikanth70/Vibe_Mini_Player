"""
generate_icons.py — Generate real PNG icons for Vibe Mini Player.
Draws a PiP-style icon: dark rounded-rect background + white PiP symbol.
Requires: Pillow (pip install Pillow)
"""
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Installing Pillow...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow", "--quiet"])
    from PIL import Image, ImageDraw

import os

SIZES = [16, 32, 48, 128]
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "extension", "icons")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def draw_icon(size: int) -> Image.Image:
    """Draw the Vibe Mini Player icon at the given size."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = max(1, size // 10)
    r = max(2, size // 6)  # corner radius

    # Background: dark rounded rectangle with slight gradient simulation
    bg_box = [pad, pad, size - pad - 1, size - pad - 1]
    draw.rounded_rectangle(bg_box, radius=r, fill=(30, 30, 40, 240))

    # Outer frame of the PiP icon (full-screen video representation)
    frame_margin = size // 5
    frame_box = [
        frame_margin,
        frame_margin,
        size - frame_margin - 1,
        size - frame_margin - 1,
    ]
    line_w = max(1, size // 16)
    draw.rounded_rectangle(frame_box, radius=max(1, r // 2), outline=(255, 255, 255, 220), width=line_w)

    # Inner PiP mini-window (bottom-right quadrant)
    inner_x1 = frame_box[0] + (frame_box[2] - frame_box[0]) // 2 + line_w
    inner_y1 = frame_box[1] + (frame_box[3] - frame_box[1]) // 2 + line_w
    inner_x2 = frame_box[2] - line_w
    inner_y2 = frame_box[3] - line_w
    inner_margin = max(1, size // 20)
    draw.rounded_rectangle(
        [inner_x1 + inner_margin, inner_y1 + inner_margin,
         inner_x2 - inner_margin, inner_y2 - inner_margin],
        radius=max(1, r // 3),
        fill=(74, 144, 232, 240),
    )

    return img


for sz in SIZES:
    icon = draw_icon(sz)
    path = os.path.join(OUTPUT_DIR, f"icon{sz}.png")
    icon.save(path, "PNG")
    print(f"  Written: {path}")

print("Icons generated.")

