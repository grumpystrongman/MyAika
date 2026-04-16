from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable, Tuple

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

Color = Tuple[int, int, int]


def clamp_channel(value: float) -> int:
    return max(0, min(255, int(round(value))))


def adjust_color(color: Color, *, r: float = 1.0, g: float = 1.0, b: float = 1.0, add: Tuple[int, int, int] = (0, 0, 0)) -> Color:
    return (
        clamp_channel(color[0] * r + add[0]),
        clamp_channel(color[1] * g + add[1]),
        clamp_channel(color[2] * b + add[2]),
    )


def average_color(image: Image.Image, box: Tuple[int, int, int, int]) -> Color:
    crop = image.crop(box).convert("RGB")
    stat = ImageStatLite(crop)
    return tuple(clamp_channel(v) for v in stat.mean)


class ImageStatLite:
    def __init__(self, image: Image.Image):
        hist = image.histogram()
        self.mean = []
        pixels = image.size[0] * image.size[1]
        for offset in range(0, len(hist), 256):
            channel = hist[offset : offset + 256]
            total = sum(v * i for i, v in enumerate(channel))
            self.mean.append(total / max(1, pixels))


def soft_mask(size: Tuple[int, int], draw_commands: Iterable[tuple], blur: int = 18) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    for command in draw_commands:
        kind = command[0]
        args = command[1:]
        if kind == "ellipse":
            draw.ellipse(*args)
        elif kind == "polygon":
            draw.polygon(*args)
        elif kind == "rectangle":
            draw.rectangle(*args)
        elif kind == "line":
            draw.line(*args)
    if blur > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(blur))
    return mask


def tone_towards(base: Image.Image, color: Color, amount: float, mask: Image.Image | None = None) -> Image.Image:
    overlay = Image.new("RGBA", base.size, color + (255,))
    toned = Image.blend(base, overlay, amount)
    if mask is None:
        return toned
    return Image.composite(toned, base, mask)


def multiply_color(base: Image.Image, color: Color, mask: Image.Image | None = None) -> Image.Image:
    overlay = Image.new("RGBA", base.size, color + (255,))
    multiplied = ImageChops.multiply(base, overlay)
    if mask is None:
        return multiplied
    return Image.composite(multiplied, base, mask)


def add_overlay(base: Image.Image, color: Color, mask: Image.Image, opacity: float) -> Image.Image:
    overlay = Image.new("RGBA", base.size, color + (clamp_channel(255 * opacity),))
    composed = Image.composite(overlay, Image.new("RGBA", base.size, (0, 0, 0, 0)), mask)
    return Image.alpha_composite(base, composed)


def non_black_mask(image: Image.Image, threshold: int = 10) -> Image.Image:
    rgb = image.convert("RGB")
    mask = Image.new("L", image.size, 0)
    src = rgb.load()
    dst = mask.load()
    for y in range(image.size[1]):
        for x in range(image.size[0]):
            px = src[x, y]
            if max(px) > threshold:
                dst[x, y] = 255
    return mask.filter(ImageFilter.GaussianBlur(2))


def generate_head(source: Image.Image, palette: dict[str, Color]) -> Image.Image:
    image = source.convert("RGBA")
    base_mask = non_black_mask(image)
    face_mask = soft_mask(
        image.size,
        [
            ("ellipse", (220, 180, 810, 930), 255),
            ("rectangle", (340, 700, 680, 1010), 255),
        ],
        blur=32,
    )
    forehead_mask = soft_mask(image.size, [("rectangle", (170, 0, 860, 300), 255)], blur=55)
    image = tone_towards(image, palette["skin_base"], 0.10, base_mask)
    image = tone_towards(image, palette["skin_pale"], 0.16, face_mask)
    image = multiply_color(image, adjust_color(palette["skin_shadow"], r=0.94, g=0.92, b=0.94), forehead_mask)

    cheek_shadow = soft_mask(
        image.size,
        [
            ("ellipse", (230, 420, 410, 660), 255),
            ("ellipse", (612, 420, 792, 660), 255),
        ],
        blur=30,
    )
    brow_mask = soft_mask(
        image.size,
        [
            ("line", [(374, 324), (410, 304), (450, 296), (488, 306)], 18, 255),
            ("line", [(536, 306), (574, 296), (614, 304), (650, 324)], 18, 255),
        ],
        blur=7,
    )
    eye_shadow = soft_mask(
        image.size,
        [
            ("ellipse", (366, 322, 500, 406), 255),
            ("ellipse", (522, 322, 658, 406), 255),
        ],
        blur=14,
    )
    wing_mask = soft_mask(
        image.size,
        [
            ("polygon", [(378, 360), (446, 352), (492, 364), (478, 376), (420, 378), (386, 372)], 255),
            ("polygon", [(534, 352), (602, 360), (594, 372), (560, 378), (548, 376), (486, 364)], 255),
            ("polygon", [(488, 360), (520, 346), (510, 372)], 255),
            ("polygon", [(504, 346), (536, 360), (514, 372)], 255),
        ],
        blur=4,
    )
    lip_mask = soft_mask(
        image.size,
        [
            ("ellipse", (426, 476, 594, 560), 255),
            ("line", [(432, 520), (588, 520)], 16, 255),
        ],
        blur=8,
    )
    blush_mask = soft_mask(
        image.size,
        [
            ("ellipse", (262, 466, 424, 628), 255),
            ("ellipse", (600, 466, 762, 628), 255),
        ],
        blur=40,
    )
    contour_mask = soft_mask(
        image.size,
        [
            ("ellipse", (210, 300, 360, 710), 255),
            ("ellipse", (664, 300, 814, 710), 255),
        ],
        blur=30,
    )
    nose_shadow = soft_mask(image.size, [("ellipse", (460, 392, 564, 688), 255)], blur=20)
    hairline_mask = soft_mask(
        image.size,
        [
            ("ellipse", (240, 90, 784, 316), 255),
            ("rectangle", (300, 120, 724, 320), 255),
        ],
        blur=28,
    )

    image = add_overlay(image, palette["contour"], contour_mask, 0.08)
    image = add_overlay(image, adjust_color(palette["contour"], add=(12, 0, 12)), cheek_shadow, 0.07)
    image = add_overlay(image, palette["eye_shadow"], eye_shadow, 0.18)
    image = add_overlay(image, palette["liner"], wing_mask, 0.44)
    image = add_overlay(image, palette["brow"], brow_mask, 0.62)
    image = add_overlay(image, palette["lip"], lip_mask, 0.58)
    image = add_overlay(image, adjust_color(palette["lip"], add=(18, 6, 10)), blush_mask, 0.05)
    image = add_overlay(image, adjust_color(palette["contour"], add=(6, 4, 10)), nose_shadow, 0.05)
    image = add_overlay(image, adjust_color(palette["hair"], add=(18, 12, 18)), hairline_mask, 0.34)

    image = ImageEnhance.Contrast(image).enhance(1.03)
    image = ImageEnhance.Color(image).enhance(0.96)
    return image


def generate_body(source: Image.Image, palette: dict[str, Color]) -> Image.Image:
    image = source.convert("RGBA")
    base_mask = non_black_mask(image)
    image = tone_towards(image, palette["skin_base"], 0.15, base_mask)
    pale_mask = soft_mask(
        image.size,
        [
            ("ellipse", (0, 220, 1024, 980), 255),
            ("rectangle", (0, 0, 1024, 1024), 255),
        ],
        blur=60,
    )
    image = tone_towards(image, palette["skin_pale"], 0.22, pale_mask)

    cleavage_shadow = soft_mask(
        image.size,
        [
            ("polygon", [(488, 372), (542, 372), (566, 730), (514, 890), (460, 730)], 255),
            ("ellipse", (360, 460, 520, 730), 255),
            ("ellipse", (504, 460, 664, 730), 255),
        ],
        blur=36,
    )
    collar_mask = soft_mask(
        image.size,
        [
            ("ellipse", (310, 250, 714, 460), 255),
        ],
        blur=38,
    )
    image = add_overlay(image, adjust_color(palette["contour"], add=(14, 10, 10)), cleavage_shadow, 0.18)
    image = add_overlay(image, adjust_color(palette["skin_pale"], add=(8, 5, 10)), collar_mask, 0.08)
    image = ImageEnhance.Contrast(image).enhance(1.05)
    return image


def generate_hair(source: Image.Image, palette: dict[str, Color]) -> Image.Image:
    image = source.convert("RGBA")
    alpha = image.getchannel("A") if "A" in image.getbands() else non_black_mask(image)
    grayscale = ImageOps.grayscale(image.convert("RGB"))
    dark = ImageOps.colorize(grayscale, black="#050306", white="#3f2a37").convert("RGBA")
    image = Image.blend(image, dark, 0.9)
    sheen_mask = soft_mask(image.size, [("rectangle", (0, 0, 1024, 512), 255)], blur=160)
    image = add_overlay(image, palette["hair_sheen"], sheen_mask, 0.08)
    image.putalpha(alpha)
    return image


def generate_outfit(source: Image.Image) -> Image.Image:
    image = source.convert("RGBA")
    alpha = image.getchannel("A") if "A" in image.getbands() else non_black_mask(image)
    grayscale = ImageOps.grayscale(image.convert("RGB"))
    velvet = ImageOps.colorize(grayscale, black="#050306", white="#1a1018").convert("RGBA")
    velvet = ImageEnhance.Contrast(velvet).enhance(1.42)
    velvet.putalpha(alpha)
    return velvet


def generate_shoes(source: Image.Image) -> Image.Image:
    image = source.convert("RGBA")
    alpha = image.getchannel("A") if "A" in image.getbands() else non_black_mask(image)
    grayscale = ImageOps.grayscale(image.convert("RGB"))
    dark = ImageOps.colorize(grayscale, black="#030204", white="#1b141d").convert("RGBA")
    dark.putalpha(alpha)
    return dark


def derive_palette(reference: Image.Image) -> dict[str, Color]:
    skin = average_color(reference, (380, 420, 660, 980))
    lips = average_color(reference, (408, 640, 636, 770))
    hair = average_color(reference, (220, 60, 780, 360))
    return {
        "skin_base": adjust_color(skin, r=1.04, g=1.03, b=1.06, add=(12, 8, 16)),
        "skin_pale": adjust_color(skin, r=1.12, g=1.1, b=1.15, add=(24, 18, 28)),
        "skin_shadow": adjust_color(skin, r=0.7, g=0.64, b=0.7, add=(-18, -20, -8)),
        "lip": adjust_color(lips, r=0.7, g=0.52, b=0.68, add=(-16, -10, -4)),
        "hair": adjust_color(hair, r=0.16, g=0.12, b=0.16, add=(-8, -8, -6)),
        "hair_sheen": (92, 74, 96),
        "liner": (18, 10, 18),
        "eye_shadow": (50, 28, 44),
        "brow": (24, 10, 18),
        "contour": (84, 50, 62),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    reference = Image.open(args.reference).convert("RGB")
    palette = derive_palette(reference)

    head = generate_head(Image.open(args.source_dir / "Image_11.png"), palette)
    body = generate_body(Image.open(args.source_dir / "Image_1.png"), palette)
    hair = generate_hair(Image.open(args.source_dir / "Image_17.png"), palette)
    outfit = generate_outfit(Image.open(args.source_dir / "Image_24.png"))
    shoes = generate_shoes(Image.open(args.source_dir / "Image_20.png"))

    head.save(args.output_dir / "head_basecolor.png")
    body.save(args.output_dir / "body_basecolor.png")
    hair.save(args.output_dir / "hair_basecolor.png")
    outfit.save(args.output_dir / "outfit_basecolor.png")
    shoes.save(args.output_dir / "shoes_basecolor.png")

    manifest = {
        "reference": str(args.reference),
        "source_dir": str(args.source_dir),
        "palette": {k: list(v) for k, v in palette.items()},
        "outputs": [
            "head_basecolor.png",
            "body_basecolor.png",
            "hair_basecolor.png",
            "outfit_basecolor.png",
            "shoes_basecolor.png",
        ],
    }
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
