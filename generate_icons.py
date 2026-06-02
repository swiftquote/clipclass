from PIL import Image, ImageDraw
import os

def create_icon():
    # Draw at 1024x1024 for ultra-smooth anti-aliased scaling
    size = 1024
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    
    # Coordinates for the rounded square outline
    margin = 48
    border_width = 24
    corner_radius = 256
    
    # Outer box coordinates
    rect_box = [margin, margin, size - margin, size - margin]
    
    # Draw transparent rounded rectangle with a solid coral outline
    draw.rounded_rectangle(
        rect_box,
        radius=corner_radius,
        fill=None,
        outline=(255, 107, 98, 255), # Solid #FF6B62
        width=border_width
    )
    
    # Draw the play triangle scaled down to match the exact SVG proportion (14px inside 32px box)
    # Centered container width is 448x448 inside 1024x1024
    # Bounding box of triangle is derived from original SVG path: M8 5V19L19 12L8 5Z
    triangle_points = [
        (437, 381),  # Top-left (8, 5)
        (437, 643),  # Bottom-left (8, 19)
        (643, 512)   # Tip pointing right (19, 12)
    ]
    
    draw.polygon(triangle_points, fill=(255, 107, 98, 255))
    
    # List of sizes to output
    target_sizes = [16, 48, 128]
    
    # Output directories
    output_dirs = [
        "/Users/mohammedismail/.gemini/antigravity-ide/scratch/clipclass/extension/icons",
        "/Users/mohammedismail/Desktop/clipclass-extension/icons"
    ]
    
    for out_dir in output_dirs:
        os.makedirs(out_dir, exist_ok=True)
        
    for target_size in target_sizes:
        # Resize using LANCZOS filter for smooth downscaling
        resized_img = image.resize((target_size, target_size), Image.Resampling.LANCZOS)
        
        # Save to both locations
        for out_dir in output_dirs:
            out_path = os.path.join(out_dir, f"icon-{target_size}.png")
            resized_img.save(out_path, format="PNG")
            print(f"Saved: {out_path} ({target_size}x{target_size})")

if __name__ == "__main__":
    create_icon()
