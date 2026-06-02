import os
import time
from typing import List, Optional
import uuid

from google import genai
from google.genai import types

from app.config import settings
from app.logger import logger
from app.schemas import (
    ConceptDecomposition,
    RelationshipExtraction,
    MindmapNodeSchema,
    MindmapEdgeSchema,
    TopicResponse
)


class MindmapAgents:
    """
    Orchestrates the LLM Agents using the new google-genai SDK.
    
    Implements Planner, Homogenizer, and Content Writer agents to build,
    relate, and write content for mindmaps.
    """

    def __init__(self, model_name: str = "gemini-2.5-flash") -> None:
        """
        Initializes the Gemini GenAI client.
        
        Args:
            model_name: The Gemini model ID to use (default: gemini-2.5-flash).
        """
        self.model_name = model_name
        
        # Load API key from settings or environment
        api_key = settings.gemini_api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        
        if not api_key:
            logger.warning("[yellow]GEMINI_API_KEY is not configured. Google GenAI calls will fail unless running in an environment with implicit auth.[/yellow]")
            
        self.client = genai.Client(api_key=api_key)

    def plan_topic(
        self,
        topic: str,
        guidelines: Optional[str] = None,
        num_nodes: int = 8
    ) -> ConceptDecomposition:
        """
        Planner Agent: Decomposes a topic into disjoint concepts of similar granularity.
        
        Args:
            topic: The main subject.
            guidelines: Additional instructions or focus areas.
            num_nodes: Number of concept nodes to generate.
            
        Returns:
            ConceptDecomposition: Pydantic model with topic description and generated nodes.
        """
        logger.info(f"Planner Agent: Decomposing topic [bold cyan]'{topic}'[/bold cyan]...")
        
        prompt = f"""
        Decompose the topic: '{topic}'
        Guidelines/Context: {guidelines or 'None'}

        Your job is to break down this topic into exactly {num_nodes} sub-concepts of similar importance and scope.
        Follow these rules strictly:
        1. The concepts must be disjointed and non-overlapping. Each concept should cover a unique, distinct aspect of the topic.
        2. The concepts should have a relative similar level of importance and granularity. Do not mix extremely broad concepts with narrow ones.
        3. Keep labels concise (1 to 4 words).
        4. Provide a single-sentence description for each concept explaining its relevance.
        """

        for attempt in range(4):
            try:
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=prompt,
                    config={
                        "response_mime_type": "application/json",
                        "response_schema": ConceptDecomposition,
                    }
                )
                decomposition: ConceptDecomposition = response.parsed
                logger.info(f"Planner Agent: Successfully generated {len(decomposition.nodes)} concept nodes.")
                return decomposition
            except Exception as err:
                err_msg = str(err).upper()
                is_transient = any(kw in err_msg for kw in ["503", "429", "UNAVAILABLE", "TEMPORARY", "LIMIT", "DEMAND", "RESOURCE"])
                if is_transient and attempt < 3:
                    sleep_time = 2 ** attempt
                    logger.warning(f"Transient Gemini API error in Planner (attempt {attempt + 1}/4): {err}. Retrying in {sleep_time}s...")
                    time.sleep(sleep_time)
                else:
                    logger.error(f"[red]Planner Agent failed on final attempt[/red]: {err}")
                    raise

    def homogenize_relationships(
        self,
        topic: str,
        nodes: List[dict]
    ) -> RelationshipExtraction:
        """
        Homogenizer Agent: Extracts and standardizes relationships between generated concepts.
        
        Args:
            topic: The main subject.
            nodes: List of dictionaries with 'label' and 'description' keys.
            
        Returns:
            RelationshipExtraction: Pydantic model containing standardized relationships.
        """
        logger.info("Homogenizer Agent: Standardizing relationships between concept nodes...")
        
        nodes_details = "\n".join([f"- {n['label']}: {n['description']}" for n in nodes])
        
        prompt = f"""
        We have decomposed the topic '{topic}' into these concept nodes:
        {nodes_details}

        Your task is to identify and standardize the relationships between these nodes.
        Rules:
        1. Do not connect every node. Create a clean, sparse network (typically 6 to 12 relationships total).
        2. For each relationship, identify the source node label, target node label, and a homogenized relationship verb.
        3. You MUST homogenize the relationship labels. Map all relationships to a small set of standardized uppercase verb phrases, such as:
           - 'INCLUDES' (A includes/is composed of B)
           - 'PART_OF' (A is a component of B)
           - 'DEPENDS_ON' (A requires B first)
           - 'INFLUENCES' (A affects/shapes B)
           - 'EXPLAINS' (A clarifies/elaborates B)
           - 'UTILIZES' (A utilizes B)
           - 'ENSURES' (A ensures B)
           - 'SUPPORTS' (A supports B)
           - 'IDENTIFIES' (A identifies B)
           - 'PROVIDES' (A provides B)
           - 'FACILITATES' (A facilitates B)
           - 'IMPROVES' (A improves B)
           - 'TRACKS' (A tracks B)
           - 'DEFINES' (A defines B)
           - 'IMPLEMENTS' (A is an execution/code structure of B)
           - 'ASSOCIATED_WITH' (A is linked to B but without direct dependency/composition)
        4. Do not use custom verbs outside this list unless absolutely necessary, and always capitalize and format them with underscores (e.g. 'EXTENDS').
        5. Ensure the source and target names MATCH EXACTLY the names in the provided list.
        """

        for attempt in range(4):
            try:
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=prompt,
                    config={
                        "response_mime_type": "application/json",
                        "response_schema": RelationshipExtraction,
                    }
                )
                extraction: RelationshipExtraction = response.parsed
                logger.info(f"Homogenizer Agent: Successfully homogenized {len(extraction.edges)} relationships.")
                return extraction
            except Exception as err:
                err_msg = str(err).upper()
                is_transient = any(kw in err_msg for kw in ["503", "429", "UNAVAILABLE", "TEMPORARY", "LIMIT", "DEMAND", "RESOURCE"])
                if is_transient and attempt < 3:
                    sleep_time = 2 ** attempt
                    logger.warning(f"Transient Gemini API error in Homogenizer (attempt {attempt + 1}/4): {err}. Retrying in {sleep_time}s...")
                    time.sleep(sleep_time)
                else:
                    logger.error(f"[red]Homogenizer Agent failed on final attempt[/red]: {err}")
                    raise

    def generate_node_content(
        self,
        node_label: str,
        node_description: str,
        topic_title: str,
        parent_label: Optional[str] = None,
        user_guidelines: Optional[str] = None
    ) -> str:
        """
        Content Writer Agent: Writes a detailed markdown article about a concept node.
        
        Args:
            node_label: The concept name.
            node_description: One-sentence summary.
            topic_title: Title of root topic.
            parent_label: Parent concept name (if sub-graph).
            user_guidelines: Custom writing guidelines.
            
        Returns:
            str: Generated markdown text.
        """
        logger.info(f"Content Writer Agent: Writing detailed content for [bold cyan]'{node_label}'[/bold cyan]...")
        
        parent_context = f"This is a sub-concept under parent concept: '{parent_label}'." if parent_label else ""
        
        prompt = f"""
        You are a content writer agent. Your task is to write a comprehensive, high-quality, and detailed guide/article about:
        Concept: '{node_label}'
        Overview: '{node_description}'
        This is a component of the broader topic: '{topic_title}'
        {parent_context}

        Additional Writing Guidelines: {user_guidelines or 'None'}

        Write the article in clean, professional markdown format. 
        Structure it with clear headings, bullet points, and code blocks or examples where relevant. Do not include any HTML. Start directly with the main content.
        """

        for attempt in range(4):
            try:
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=prompt
                )
                content: str = response.text
                logger.info(f"Content Writer Agent: Successfully wrote detailed article ({len(content)} characters).")
                return content
            except Exception as err:
                err_msg = str(err).upper()
                is_transient = any(kw in err_msg for kw in ["503", "429", "UNAVAILABLE", "TEMPORARY", "LIMIT", "DEMAND", "RESOURCE"])
                if is_transient and attempt < 3:
                    sleep_time = 2 ** attempt
                    logger.warning(f"Transient Gemini API error in Content Writer (attempt {attempt + 1}/4): {err}. Retrying in {sleep_time}s...")
                    time.sleep(sleep_time)
                else:
                    logger.error(f"[red]Content Writer Agent failed on final attempt[/red]: {err}")
                    raise


# Global agents client instance
agents = MindmapAgents()
