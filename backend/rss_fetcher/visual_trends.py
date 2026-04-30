
try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

import google.generativeai as genai
import os
import json
import logging
import asyncio
from django.conf import settings

logger = logging.getLogger(__name__)

async def fetch_trends_visually():
    """
    Launches a headless browser to scrape Google Trends (IN Sports Realtime) directly from the DOM.
    URL: https://trends.google.com/trending?geo=IN&category=17&hours=4&status=active&sort=recency
    Returns a list of EXACT trend strings (Topic Names) as shown on the page.
    """
    if not PLAYWRIGHT_AVAILABLE:
        logger.warning("Playwright not installed, skipping visual fetch.")
        return []

    trends = []
    try:
        logger.info("Starting High-Accuracy DOM Fetch (Playwright) for Google Trends Sports...")
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            )
            context = await browser.new_context(
                viewport={'width': 1280, 'height': 800},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )
            page = await context.new_page()
            
            # The exact URL for Realtime Sports (IN) sorted by recency
            url = "https://trends.google.com/trending?geo=IN&category=17&hours=4&status=active&sort=recency"
            logger.info(f"Navigating to {url}...")
            await page.goto(url, wait_until="networkidle", timeout=30000)
            
            # Wait for the specific topic elements to load
            # mZ3RIc is the class for the main topic name div
            try:
                await page.wait_for_selector('div.mZ3RIc', timeout=15000)
                elements = await page.query_selector_all('div.mZ3RIc')
                for el in elements:
                    text = await el.inner_text()
                    clean_text = text.strip()
                    if clean_text:
                        trends.append(clean_text)
            except Exception as e:
                logger.warning(f"Selector div.mZ3RIc not found or timeout: {e}")
                # Fallback: maybe the page structure changed, try another common selector
                elements = await page.query_selector_all('div.title')
                for el in elements:
                    text = await el.inner_text()
                    clean_text = text.strip()
                    if clean_text:
                        trends.append(clean_text)
            
            await browser.close()
            logger.info(f"DOM Fetch found {len(trends)} exact topics from Google Trends.")
            
    except Exception as e:
        logger.error(f"High-Accuracy DOM Fetch failed: {e}")
        
    return trends

def run_visual_fetch():
    """Synchronous wrapper for Celery and other sync contexts"""
    try:
        # If we are already in an event loop, we can't use asyncio.run
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # This is tricky in a sync wrapper. 
            # In production (Celery), the loop shouldn't be running yet.
            # For testing in an async environment, the test should await the async function.
            logger.warning("Event loop is already running. run_visual_fetch may fail if not awaited.")
            # We'll try to run it in a separate thread to avoid nested loop error
            from concurrent.futures import ThreadPoolExecutor
            with ThreadPoolExecutor() as executor:
                return executor.submit(asyncio.run, fetch_trends_visually()).result()
        else:
            return asyncio.run(fetch_trends_visually())
    except Exception as e:
        # Fallback for environments where get_event_loop fails or other issues
        try:
            return asyncio.run(fetch_trends_visually())
        except Exception as e2:
            logger.error(f"run_visual_fetch critical failure: {e2}")
            return []
