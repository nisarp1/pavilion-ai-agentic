
from playwright.async_api import async_playwright
import google.generativeai as genai
import os
import json
import logging
import asyncio
from django.conf import settings

logger = logging.getLogger(__name__)

async def fetch_trends_visually():
    """
    Launches a headless browser, screenshots Google Trends, and uses Gemini to extract topics.
    Returns a list of trend strings.
    """
    screenshot_path = "/tmp/google_trends_visual.png"
    trends = []
    
    try:
        logger.info("Starting Visual Trend Fetch (Playwright + Gemini)...")
        async with async_playwright() as p:
            # Launch with specific args for container/cloud environments
            browser = await p.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            )
            
            context = await browser.new_context(
                viewport={'width': 1280, 'height': 800},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )
            page = await context.new_page()
            
            # Navigate to Google Trends Realtime Sports (India)
            # category 17 = Sports
            url = "https://trends.google.com/trending?geo=IN&hl=en-US&category=17"
            logger.info(f"Navigating to {url}...")
            await page.goto(url, wait_until="networkidle", timeout=30000)
            
            # Wait a bit for dynamic content
            await page.wait_for_timeout(3000)
            
            # Take Screenshot
            await page.screenshot(path=screenshot_path)
            logger.info("Screenshot captured.")
            await browser.close()
            
        # Send to Gemini
        api_key = os.environ.get('GEMINI_API_KEY') or getattr(settings, 'GEMINI_API_KEY', None)
        if not api_key:
            logger.error("No Gemini API Key found for visual analysis.")
            return []

        genai.configure(api_key=api_key)
        # Use gemini-2.0-flash or gemini-1.5-flash as available
        model_name = os.environ.get('GEMINI_MODEL', 'gemini-2.0-flash')
        model = genai.GenerativeModel(model_name)
        
        logger.info(f"Sending screenshot to {model_name}...")
        
        with open(screenshot_path, "rb") as f:
            image_data = f.read()
            
        prompt = """
        You are a sports data analyst. Look at this screenshot of the Google Trends 'Realtime Search Trends' page.
        Identified the list of trending topics (athletes, matches, teams, sport names) visible in the list.
        Igore non-sports topics if any.
        
        Return the result as a raw JSON list of strings. Example: ["India vs Australia", "Virat Kohli", "NBA"]
        Do not use markdown formatting. Just the JSON list.
        """
        
        response = model.generate_content([
            {'mime_type': 'image/png', 'data': image_data},
            prompt
        ])
        
        text = response.text.strip()
        # Clean markdown if present
        if text.startswith('```json'):
            text = text.replace('```json', '').replace('```', '')
        elif text.startswith('```'):
            text = text.replace('```', '')
            
        trends = json.loads(text)
        logger.info(f"Visually identified trends: {trends}")
        
    except Exception as e:
        logger.error(f"Visual Trend Fetch failed: {e}")
        
    return trends

def run_visual_fetch():
    """Synchronous wrapper for Celery"""
    return asyncio.run(fetch_trends_visually())
