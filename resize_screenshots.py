from PIL import Image, ImageDraw
import os

def resize_screenshots():
    # Targets
    target_width = 1280
    target_height = 800
    background_color = (18, 20, 28, 255) # Dark theme #12141c
    
    # Path settings
    input_dirs = [
        "/Users/mohammedismail/Desktop/clipclass-extension/screenshots",
        "/Users/mohammedismail/.gemini/antigravity-ide/scratch/clipclass/extension/screenshots"
    ]
    
    # Files to process
    files_to_process = [
        ("dashboard.png", 700, (18, 20, 28, 255), (255, 255, 255, 20)),     # Filename, target height, bg_color, border_color
        ("pdf-preview.png", 700, (255, 255, 255, 255), (200, 200, 200, 255))
    ]
    
    for filename, fit_height, bg_color, border_color in files_to_process:
        # Load from Desktop first (which is the source)
        source_path = os.path.join(input_dirs[0], filename)
        if not os.path.exists(source_path):
            print(f"Source file not found: {source_path}")
            continue
            
        print(f"Processing: {source_path} with background: {bg_color}")
        src_image = Image.open(source_path)
        
        # Calculate aspect ratio resize
        src_w, src_h = src_image.size
        aspect_ratio = src_w / src_h
        
        new_h = fit_height
        new_w = int(fit_height * aspect_ratio)
        
        # Resize source image
        resized_src = src_image.resize((new_w, new_h), Image.Resampling.LANCZOS)
        
        # Create canvas
        canvas = Image.new("RGBA", (target_width, target_height), bg_color)
        
        # Center coordinates
        paste_x = (target_width - new_w) // 2
        paste_y = (target_height - new_h) // 2
        
        # Paste resized screenshot onto canvas
        canvas.paste(resized_src, (paste_x, paste_y), resized_src if resized_src.mode == 'RGBA' else None)
        
        # Add a subtle border outline around the screenshot mockup for separation
        draw = ImageDraw.Draw(canvas)
        draw.rectangle(
            [paste_x, paste_y, paste_x + new_w, paste_y + new_h],
            outline=border_color,
            width=1 if filename == "pdf-preview.png" else 2
        )
        
        # Convert to RGB (removes alpha channel, satisfying 24-bit "no alpha" PNG requirement)
        final_image = canvas.convert("RGB")
        
        # Save to both folders
        for out_dir in input_dirs:
            out_path = os.path.join(out_dir, filename)
            final_image.save(out_path, format="PNG")
            print(f"Successfully saved 1280x800 RGB PNG to: {out_path}")

if __name__ == "__main__":
    resize_screenshots()
