import os
import json
import logging
from crewai import Agent, Task, Crew, Process
from langchain_google_genai import ChatGoogleGenerativeAI

logger = logging.getLogger(__name__)

class ReelRecreationCrew:
    """
    CrewAI Orchestrator for deconstructing a reference reel and 
    rebuilding it in Pavilion's Malayalam brand style.
    """
    def __init__(self):
        model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")
        # Ensure it has the correct prefix for LiteLLM if not using Vertex AI
        if not model_name.startswith("gemini/") and not model_name.startswith("vertex_ai/"):
            model_name = f"gemini/{model_name}"
            
        self.llm_model = model_name  # Using liteLLM format, works natively with CrewAI

    def get_vision_agent(self):
        return Agent(
            role='Senior Video & Visual Analyst',
            goal='Analyze the reference sports reel and extract a detailed breakdown of visual elements, text, and narrative.',
            backstory=(
                "You are an expert sports video analyst. You can break down a fast-paced sports reel "
                "into its core components. You identify exactly what player is shown, what text appears on screen, "
                "and the exact flow of the narrative."
            ),
            verbose=True,
            allow_delegation=False,
            llm=self.llm_model
        )

    def get_writer_agent(self):
        return Agent(
            role='Malayalam Sports Brand Copywriter & JSON Engineer',
            goal='Write a high-energy Malayalam sports script and output a strictly formatted modular JSON.',
            backstory=(
                "You are the lead copywriter for 'Pavilion', a premier Malayalam sports news brand. "
                "Your Malayalam is highly engaging, factual, and energetic. You are also an expert in "
                "generating precise JSON structures that feed directly into automated video rendering engines."
            ),
            verbose=True,
            allow_delegation=False,
            llm=self.llm_model
        )

    def run_pipeline(self, reference_url: str) -> dict:
        logger.info(f"Starting CrewAI Pipeline for URL: {reference_url}")
        
        vision_agent = self.get_vision_agent()
        writer_agent = self.get_writer_agent()

        analyze_task = Task(
            description=f"Analyze the following sports reel URL/Topic: {reference_url}. Extract the key visual moments, player names, statistics, and the core news update being reported.",
            expected_output="A structured text document detailing the visual scenes, facts, and narrative of the reference reel.",
            agent=vision_agent
        )

        write_task = Task(
            description=(
                "Based on the video analysis, create a Pavilion-branded Malayalam reel.\n"
                "1. Write an engaging Malayalam voiceover script.\n"
                "2. Output a strictly formatted JSON EXACTLY matching this structure (no markdown, just valid JSON):\n"
                "{\"scene1Headline\": \"...\", \"heroSrc\": \"image_url_related_to_topic\", \"scene2Headline\": \"...\", \"playerName\": \"...\", \"playerImage\": \"image_url\", \"stats\": [{\"label\":\"...\", \"value\":\"...\"}]}\n"
            ),
            expected_output="A valid JSON string containing the translated Malayalam content and visual props for the video renderer.",
            agent=writer_agent
        )

        crew = Crew(
            agents=[vision_agent, writer_agent],
            tasks=[analyze_task, write_task],
            process=Process.sequential,
        )

        result = crew.kickoff()
        return result