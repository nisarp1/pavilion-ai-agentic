
import os
import logging
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO
from django.core.files.base import ContentFile
from django.conf import settings
from .models import PosterTemplate

logger = logging.getLogger(__name__)

def wrap_text(text, font, max_width):
    """
    Wrap text to fit within max_width.
    Returns a list of lines.
    """
    lines = []
    
    # If text is empty, return empty list
    if not text:
        return lines
        
    words = text.split()
    if not words:
        return lines

    current_line = words[0]
    
    for word in words[1:]:
        # Check width of line with next word
        test_line = current_line + " " + word
        bbox = font.getbbox(test_line)
        # getbbox returns (left, top, right, bottom)
        w = bbox[2] - bbox[0]
        
        if w <= max_width:
            current_line = test_line
        else:
            lines.append(current_line)
            current_line = word
            
    lines.append(current_line)
    return lines

def generate_poster(article, template_id=None):
    """
    Generate a social media poster for the article.
    If template_id is provided, uses that template.
    Otherwise, uses the first active template found.
    """
    try:
        # 1. Get Template
        if template_id:
            try:
                template = PosterTemplate.objects.get(id=template_id)
            except PosterTemplate.DoesNotExist:
                 return False, f"Template with ID {template_id} not found."
        else:
            template = PosterTemplate.objects.filter(is_active=True).first()
            
        if not template:
            # Self-healing: Try to create a default template if none exist
            count = PosterTemplate.objects.count()
            logger.warning(f"No active poster template found. Total templates in DB: {count}")
            
            # Try to recover by creating default templates if DB is empty
            if count == 0:
                try:
                    from django.core.management import call_command
                    logger.info("Auto-seeding poster templates...")
                    call_command('seed_posters')
                except Exception as e:
                    logger.error(f"Failed to auto-seed: {e}")
            
            # Re-check for template
            template = PosterTemplate.objects.filter(is_active=True).first()
            if not template:
                 # Try to force activate one if it exists but inactive
                 template = PosterTemplate.objects.first()
                 if template:
                     template.is_active = True
                     template.save()
            
            if not template:
                return False, "No poster templates found in database. Auto-seeding failed."

        if not template.background_image or not os.path.exists(template.background_image.path):
            logger.error(f"Template {template.name} has missing background image at {template.background_image.path if template.background_image else 'None'}")
            return False, "Template has no valid background image file."

        # 2. Open Template Image
        try:
            bg_image = Image.open(template.background_image.path).convert("RGBA")
        except Exception as e:
            logger.error(f"Failed to open template image: {e}")
            return False, f"Failed to open template image: {e}"
            
        # 3. Process Featured Image Overlay
        if article.featured_image:
            img_config_list = template.image_config.get('image_fields', [])
            
            # Default behavior if config is empty but we have an image
            # Put it in top half or center? Better to rely on config.
            # If config is empty, we might skip overlay or do a default center crop.
            
            for config in img_config_list:
                if config.get('name') == 'featured_image':
                    try:
                        # Load article image
                        article_img = Image.open(article.featured_image.path).convert("RGBA")
                        
                        target_w = config.get('width', 500)
                        target_h = config.get('height', 500)
                        pos_x = config.get('x', 0)
                        pos_y = config.get('y', 0)
                        
                        # Resize/Crop logic (Aspect Fill)
                        img_ratio = article_img.width / article_img.height
                        target_ratio = target_w / target_h
                        
                        # Background Removal logic
                        # If enabled in config (default False)
                        remove_bg = config.get('remove_background', False)
                        
                        if remove_bg:
                            try:
                                from rembg import remove
                                logger.info(f"Removing background from image for article {article.id}")
                                article_img = remove(article_img)
                            except ImportError:
                                logger.warning("rembg not installed, skipping background removal")
                            except Exception as e:
                                logger.error(f"Background removal failed: {e}")

                        # If we removed background, we probably want to Fit/Contain rather than Fill/Crop?
                        # Or maybe we still want to scale but not CROP?
                        # Usually for a "cutout", you want it to fit within the box without getting chopped.
                        # Let's check config for 'fit_mode' or assume 'contain' if remove_bg is True
                        
                        fit_mode = config.get('fit_mode', 'cover')  # cover (crop), contain (no crop)
                        if remove_bg and 'fit_mode' not in config:
                            fit_mode = 'contain'
                            
                        if fit_mode == 'contain':
                            # Aspect Fit
                             # Resize to fit within target box without cropping
                            ratio = min(target_w / article_img.width, target_h / article_img.height)
                            new_w = int(article_img.width * ratio)
                            new_h = int(article_img.height * ratio)
                            article_img = article_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                            
                            # Center in target box
                            final_paste_x = pos_x + (target_w - new_w) // 2
                            # Align bottom? Specially for person cutouts, bottom align is often better
                            if config.get('align_vertical') == 'bottom':
                                final_paste_y = pos_y + (target_h - new_h)
                            else:
                                final_paste_y = pos_y + (target_h - new_h) // 2 # Center
                                
                            # Paste
                            bg_image.paste(article_img, (final_paste_x, final_paste_y), article_img)
                            
                        else:
                            # Standard Cover/Crop logic
                            if img_ratio > target_ratio:
                                # Image is wider - crop width
                                new_height = target_h
                                new_width = int(new_height * img_ratio)
                            else:
                                # Image is taller - crop height
                                new_width = target_w
                                new_height = int(new_width / img_ratio)
                                
                            # Resize
                            article_img = article_img.resize((new_width, new_height), Image.Resampling.LANCZOS)
                            
                            # Center Crop
                            left = (new_width - target_w) / 2
                            top = (new_height - target_h) / 2
                            right = (new_width + target_w) / 2
                            bottom = (new_height + target_h) / 2
                            
                            article_img = article_img.crop((left, top, right, bottom))
                            
                            # Paste onto background
                            bg_image.paste(article_img, (pos_x, pos_y), article_img)
                        
                    except Exception as e:
                        logger.warning(f"Failed to process featured image overlay: {e}")

        # 4. Process Text Overlay
        draw = ImageDraw.Draw(bg_image)
        
        # Load Font
        font_path = os.path.join(settings.BASE_DIR, 'static/fonts/Manjari-Bold.ttf')
        if not os.path.exists(font_path):
             # Fallback to a system font if specific one not found
            font_path = "arial.ttf" # This might fail on linux, but PIL has defaults
            logger.warning("Manjari-Bold.ttf not found, using default.")

        text_config_list = template.text_config.get('text_fields', [])
        
        # Default if no config: Just print headlines in center
        if not text_config_list:
             # Basic default placement
             text_config_list = [
                 {"name": "headline", "x": 50, "y": 50, "font_size": 60, "color": "#FFFFFF", "max_width": bg_image.width - 100}
             ]
             
        for config in text_config_list:
            field_name = config.get('name')
            
            text_content = ""
            # Check for JSON poster context first (Highest Priority)
            poster_context = getattr(article, 'poster_context', {}) or {}
            json_image_content = poster_context.get('image_content', {})
            
            if field_name == 'headline':
                # Priority 1: JSON 'text_overlay_malayalam'
                if json_image_content.get('text_overlay_malayalam'):
                    text_content = json_image_content.get('text_overlay_malayalam')
                # Priority 2: Manual override
                elif article.social_media_poster_text:
                    text_content = article.social_media_poster_text
                # Priority 3: Title
                else:
                    text_content = article.title
                    
            elif field_name == 'summary':
                # Priority 1: JSON Stats
                # Format: "Sanju Samson: 24 (15) | SR: 160"
                if json_image_content.get('match_statistics'):
                    stats = json_image_content.get('match_statistics', {})
                    player = json_image_content.get('player_name', '')
                    
                    runs = stats.get('runs', '')
                    balls = stats.get('balls_faced', '')
                    sr = stats.get('strike_rate', '')
                    
                    parts = []
                    if player: parts.append(player.upper())
                    if runs: parts.append(f"{runs} ({balls})")
                    if sr: parts.append(f"SR: {sr}")
                    
                    if parts:
                         text_content = " | ".join(parts)
                         
                # Priority 2: Manual override
                if not text_content:
                    text_content = article.social_media_caption or article.summary
                    
            elif field_name == 'slug':
                # JSON Branding
                if json_image_content.get('branding', {}).get('website'):
                     text_content = json_image_content.get('branding', {}).get('website').upper()
                else:
                     text_content = f"@{article.source_feed}" if article.source_feed else "@PAVILIONEND.IN"
            
            if not text_content:
                continue
                
            # Font settings
            font_size = config.get('font_size', 40)
            text_color = config.get('color', '#FFFFFF')
            max_width = config.get('max_width', bg_image.width)
            x = config.get('x', 0)
            y = config.get('y', 0)
            align = config.get('align', 'left')
            
            try:
                if "Manjari" in font_path:
                    font = ImageFont.truetype(font_path, font_size)
                else:
                    font = ImageFont.load_default()
            except IOError:
                font = ImageFont.load_default()

            # Wrap text
            lines = wrap_text(text_content, font, max_width)
            
            # Draw lines
            current_y = y
            line_height_factor = 1.2
            
            for line in lines:
                # Calculate text width for alignment
                bbox = font.getbbox(line)
                line_w = bbox[2] - bbox[0]
                line_h = bbox[3] - bbox[1] # Approximate height
                
                draw_x = x
                if align == 'center':
                    draw_x = x + (max_width - line_w) / 2
                elif align == 'right':
                    draw_x = x + (max_width - line_w)
                
                # Draw text with outline for better visibility
                outline_color = "#000000"
                outline_width = 2
                draw.text((draw_x-outline_width, current_y), line, font=font, fill=outline_color)
                draw.text((draw_x+outline_width, current_y), line, font=font, fill=outline_color)
                draw.text((draw_x, current_y-outline_width), line, font=font, fill=outline_color)
                draw.text((draw_x, current_y+outline_width), line, font=font, fill=outline_color)
                
                draw.text((draw_x, current_y), line, font=font, fill=text_color)
                
                current_y += font_size * line_height_factor

        # 5. Save Result
        buffer = BytesIO()
        bg_image = bg_image.convert('RGB') # Remove alpha for JPEG
        bg_image.save(buffer, format='JPEG', quality=95)
        
        filename = f"poster_{article.id}_{template.id}.jpg"
        
        # Save to article model
        article.generated_poster.save(filename, ContentFile(buffer.getvalue()), save=True)
        
        return True, article.generated_poster.url
        
    except Exception as e:
        logger.error(f"Error generating poster: {e}", exc_info=True)
        return False, str(e)
