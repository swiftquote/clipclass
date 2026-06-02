from PIL import Image
import os

def create_promo_tiles():
    # Source image path
    src_path = "/Users/mohammedismail/.gemini/antigravity-ide/brain/19c37cef-f876-4afd-a9a2-e67ee518a48c/clipclass_promo_raw_1780431122050.png"
    if not os.path.exists(src_path):
        print(f"Source raw promo image not found: {src_path}")
        return
        
    src_image = Image.open(src_path)
    
    # Destination directories
    dest_dirs = [
        "/Users/mohammedismail/Desktop/clipclass-extension/promos",
        "/Users/mohammedismail/.gemini/antigravity-ide/scratch/clipclass/extension/promos"
    ]
    
    for d in dest_dirs:
        os.makedirs(d, exist_ok=True)
        
    # We will use the average background edge color from the source image to blend seamlessly
    # The edges of the generated image are dark purple/black: #0c0d14 or (12, 13, 20)
    bg_color = (12, 13, 20, 255)
    
    # 1. Create Small Promo Tile (440 x 280)
    # Scale raw square to height of 310 (slight vertical overflow crop for tighter layout)
    small_h = 310
    small_w = 310
    resized_small = src_image.resize((small_w, small_h), Image.Resampling.LANCZOS)
    
    small_canvas = Image.new("RGBA", (440, 280), bg_color)
    # Center paste with vertical crop (-15px offset top/bottom)
    small_canvas.paste(resized_small, ((440 - small_w) // 2, (280 - small_h) // 2))
    
    # Convert to RGB (removes alpha channel, satisfying 24-bit PNG requirement)
    small_final = small_canvas.convert("RGB")
    
    # 2. Create Marquee Promo Tile (1400 x 560)
    # Scale raw square to height of 620 (slight vertical overflow crop)
    marquee_h = 620
    marquee_w = 620
    resized_marquee = src_image.resize((marquee_w, marquee_h), Image.Resampling.LANCZOS)
    
    marquee_canvas = Image.new("RGBA", (1400, 560), bg_color)
    # Center paste with vertical crop (-30px offset top/bottom)
    marquee_canvas.paste(resized_marquee, ((1400 - marquee_w) // 2, (560 - marquee_h) // 2))
    
    # Convert to RGB
    marquee_final = marquee_canvas.convert("RGB")
    
    # Save files
    for d in dest_dirs:
        small_path = os.path.join(d, "promo-small.png")
        marquee_path = os.path.join(d, "promo-marquee.png")
        
        small_final.save(small_path, format="PNG")
        marquee_final.save(marquee_path, format="PNG")
        print(f"Saved: {small_path} (440x280)")
        print(f"Saved: {marquee_path} (1400x560)")

if __name__ == "__main__":
    create_promo_tiles()
