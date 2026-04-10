import os
from io import BytesIO
from PIL import Image
from django.core.files.base import ContentFile

def process_image_to_webp(image_file, max_width=1024, quality=85):
    """
    Convert an image file to WebP format and resize it if needed.
    
    Args:
        image_file: The image file object (File or ContentFile or BytesIO)
        max_width: Maximum width for the image (default 1024)
        quality: WebP quality (default 85)
        
    Returns:
        tuple: (filename, content_file)
            - filename: New filename with .webp extension
            - content_file: Django ContentFile containing the WebP image data
    """
    try:
        # Open the image
        img = Image.open(image_file)
        
        # Convert to RGB (if RGBA or P)
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
            
        # Resize if width is greater than max_width
        if img.width > max_width:
            # Calculate new height to maintain aspect ratio
            ratio = max_width / float(img.width)
            new_height = int(float(img.height) * ratio)
            img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
            
        # Save as WebP to a BytesIO object
        output = BytesIO()
        img.save(output, format='WEBP', quality=quality)
        output.seek(0)
        
        # Create new filename
        original_name = getattr(image_file, 'name', 'image.jpg')
        name_without_ext = os.path.splitext(os.path.basename(original_name))[0]
        new_filename = f"{name_without_ext}.webp"
        
        return new_filename, ContentFile(output.read())
        
    except Exception as e:
        # If conversion fails, return original (or raise)
        print(f"Image conversion failed: {e}")
        return None, None

def generate_cutout_image(image_file):
    """
    Remove background from an image using rembg.
    
    Args:
        image_file: The image file object or path
        
    Returns:
        tuple: (filename, content_file) or (None, None) if failed
    """
    try:
        from rembg import remove
        
        # Open the image
        img = Image.open(image_file).convert("RGBA")
        
        # Process with rembg
        output_img = remove(img)
        
        # Save as PNG (to preserve transparency)
        output = BytesIO()
        output_img.save(output, format='PNG')
        output.seek(0)
        
        # Create new filename
        original_name = getattr(image_file, 'name', 'cutout.png')
        name_without_ext = os.path.splitext(os.path.basename(original_name))[0]
        # Avoid double 'cutout' if already present
        if 'cutout' not in name_without_ext:
            new_filename = f"{name_without_ext}_cutout.png"
        else:
            new_filename = f"{name_without_ext}.png"
            
        return new_filename, ContentFile(output.read())
        
    except ImportError:
        print("rembg not installed")
        return None, None
    except Exception as e:
        print(f"Background removal failed: {e}")
        return None, None
