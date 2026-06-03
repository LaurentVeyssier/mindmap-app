import os
import time
from typing import List, Optional
import uuid

from google import genai
from google.genai import types

from app.config import settings
from app.logger import logger
from app.schemas import (
    FullMindmapSchema,
    MindmapNodeSchema,
    MindmapEdgeSchema,
    TopicResponse
)


CANONICAL_SYNONYMS = {
    # Verb variants (singles/plurals/synonyms)
    "GATHER": "COLLECTS",
    "GATHERS": "COLLECTS",
    "ACQUIRE": "COLLECTS",
    "ACQUIRES": "COLLECTS",
    "COLLECT": "COLLECTS",
    
    "PROVIDE": "PROVIDES",
    "OFFER": "PROVIDES",
    "OFFERS": "PROVIDES",
    "GIVE": "PROVIDES",
    "GIVES": "PROVIDES",
    
    "ENABLE": "ENABLES",
    "ALLOW": "ENABLES",
    "ALLOWS": "ENABLES",
    "PERMIT": "ENABLES",
    "PERMITS": "ENABLES",
    
    "SECURE": "SECURES",
    "PROTECT": "SECURES",
    "PROTECTS": "SECURES",
    "SAFEGUARD": "SECURES",
    "SAFEGUARDS": "SECURES",
    
    "TRACK": "TRACKS",
    "MONITOR": "TRACKS",
    "MONITORS": "TRACKS",
    "OBSERVE": "TRACKS",
    "OBSERVES": "TRACKS",
    
    "IMPLEMENT": "IMPLEMENTS",
    "EXECUTE": "IMPLEMENTS",
    "EXECUTES": "IMPLEMENTS",
    "REALIZE": "IMPLEMENTS",
    "REALIZES": "IMPLEMENTS",
    
    "CONTAIN": "INCLUDES",
    "CONTAINS": "INCLUDES",
    "INCLUDE": "INCLUDES",
    "COMPOSE": "INCLUDES",
    "COMPOSES": "INCLUDES",
    
    "FACILITATE": "FACILITATES",
    "EASE": "FACILITATES",
    "EASES": "FACILITATES",
    "ASSIST": "FACILITATES",
    "ASSISTS": "FACILITATES",
    
    "ADHERE_TO": "ADHERES_TO",
    "COMPLY_WITH": "ADHERES_TO",
    "COMPLIES_WITH": "ADHERES_TO",
    "FOLLOW": "ADHERES_TO",
    "FOLLOWS": "ADHERES_TO",
}

def harmonize_relation(relation: str) -> str:
    """
    Standardizes a relationship verb/phrase.
    Converts to uppercase, strips whitespace, replaces spaces with underscores,
    and maps common synonyms to canonical capitalized forms.
    """
    if not relation:
        return "RELATED_TO"
    clean = relation.strip().upper().replace(" ", "_")
    while "__" in clean:
        clean = clean.replace("__", "_")
    return CANONICAL_SYNONYMS.get(clean, clean)


class MindmapAgents:
    """
    Orchestrates the LLM Agents using the new google-genai SDK.
    
    Implements Planner and Content Writer agents to build 2-level hierarchical
    mindmaps and write content for concepts.
    """

    def __init__(self, model_name: str = "gemini-2.5-flash", critic_model_name: str = "gemini-3.5-flash") -> None:
        """
        Initializes the Gemini GenAI client.
        
        Args:
            model_name: The Gemini model ID to use (default: gemini-2.5-flash).
            critic_model_name: The Critic Gemini model ID to use (default: gemini-3.5-flash).
        """
        self.model_name = model_name
        self.critic_model_name = critic_model_name
        
        # Load API key from settings or environment
        api_key = settings.gemini_api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        
        if not api_key:
            logger.warning("[yellow]GEMINI_API_KEY is not configured. Google GenAI calls will fail unless running in an environment with implicit auth.[/yellow]")
            
        self.client = genai.Client(api_key=api_key)

    def plan_topic_draft(
        self,
        topic: str,
        guidelines: Optional[str] = None,
        num_nodes: int = 6
    ) -> FullMindmapSchema:
        """
        Planner Agent: Drafts a 2-level hierarchical tree structure.
        """
        logger.info(f"Planner Agent: Drafting hierarchical mindmap for [bold cyan]'{topic}'[/bold cyan]...")
        
        prompt = f"""
        Decompose the topic: '{topic}'
        Guidelines/Context: {guidelines or 'None'}

        Your job is to break down this topic into a 2-level hierarchical mindmap tree.
        Follow these rules strictly:
        1. Generate between 5 and 8 main sub-concept nodes (Level 1) representing the major disjoint components of the topic.
        2. For EACH main sub-concept, generate exactly 3 leaf concepts (Level 2) that further detail, implement, or support it.
        3. Standardize and homogenize the relationship verbs. Limit relationships (both from the topic to main concepts, and from main concepts to leaves) to standard capitalized relationship verbs. Avoid using multiple different synonyms (e.g. choose either 'COLLECTS' or 'GATHERS', choose either 'PROVIDES' or 'OFFERS').
        4. Do not include cross-links between sibling concepts; the structure must be a strict tree where each node connects to its parent.
        5. Keep labels concise (1 to 4 words). Provide a single-sentence description explaining each node's role.
        """

        for attempt in range(4):
            try:
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=prompt,
                    config={
                        "response_mime_type": "application/json",
                        "response_schema": FullMindmapSchema,
                    }
                )
                decomposition: FullMindmapSchema = response.parsed
                # Programmatically harmonize relations to prevent duplicate verbs
                for concept in decomposition.concepts:
                    concept.relation_from_topic = harmonize_relation(concept.relation_from_topic)
                    for leaf in concept.leaves:
                        leaf.relation = harmonize_relation(leaf.relation)
                logger.info(f"Planner Agent: Successfully generated draft with {len(decomposition.concepts)} Concepts.")
                return decomposition
            except Exception as err:
                err_msg = str(err).upper()
                is_transient = any(kw in err_msg for kw in ["503", "429", "UNAVAILABLE", "TEMPORARY", "LIMIT", "DEMAND", "RESOURCE"])
                if is_transient and attempt < 3:
                    sleep_time = 2 ** attempt
                    logger.warning(f"Transient Gemini API error in Planner Draft (attempt {attempt + 1}/4): {err}. Retrying in {sleep_time}s...")
                    time.sleep(sleep_time)
                else:
                    logger.error(f"[red]Planner Agent Draft failed on final attempt[/red]: {err}")
                    raise

    def plan_topic(
        self,
        topic: str,
        guidelines: Optional[str] = None,
        num_nodes: int = 6
    ) -> FullMindmapSchema:
        """
        Planner Agent: Decomposes a topic and calls Critic Agent to refine.
        """
        decomposition = self.plan_topic_draft(topic, guidelines, num_nodes)
        
        # Call Critic Agent to review and refine the planned decomposition
        try:
            decomposition = self.criticize_plan(
                topic=topic,
                guidelines=guidelines,
                draft_plan=decomposition
            )
        except Exception as critic_err:
            logger.warning(f"Critic Agent failed to criticize plan: {critic_err}. Using original draft.")
            
        logger.info(f"Planner Agent: Successfully finalized mindmap with {len(decomposition.concepts)} main concepts.")
        return decomposition

    def generate_node_content_draft(
        self,
        node_label: str,
        node_description: str,
        topic_title: str,
        parent_label: Optional[str] = None,
        user_guidelines: Optional[str] = None
    ) -> str:
        """
        Content Writer Agent: Drafts a detailed markdown article about a concept node.
        """
        logger.info(f"Content Writer Agent: Drafting content for [bold cyan]'{node_label}'[/bold cyan]...")
        
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
                logger.info(f"Content Writer Agent: Successfully wrote draft article ({len(content)} characters).")
                return content
            except Exception as err:
                err_msg = str(err).upper()
                is_transient = any(kw in err_msg for kw in ["503", "429", "UNAVAILABLE", "TEMPORARY", "LIMIT", "DEMAND", "RESOURCE"])
                if is_transient and attempt < 3:
                    sleep_time = 2 ** attempt
                    logger.warning(f"Transient Gemini API error in Content Writer Draft (attempt {attempt + 1}/4): {err}. Retrying in {sleep_time}s...")
                    time.sleep(sleep_time)
                else:
                    logger.error(f"[red]Content Writer Agent Draft failed on final attempt[/red]: {err}")
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
        Content Writer Agent: Writes a detailed markdown article and calls Critic Agent to polish.
        """
        content = self.generate_node_content_draft(
            node_label=node_label,
            node_description=node_description,
            topic_title=topic_title,
            parent_label=parent_label,
            user_guidelines=user_guidelines
        )
        
        # Call Critic Agent to review and refine the content
        try:
            content = self.criticize_content(
                node_label=node_label,
                node_description=node_description,
                topic_title=topic_title,
                parent_label=parent_label,
                user_guidelines=user_guidelines,
                draft_content=content
            )
        except Exception as critic_err:
            logger.warning(f"Critic Agent failed to criticize content: {critic_err}. Using original draft.")
            
        return content


    def criticize_plan(
        self,
        topic: str,
        guidelines: Optional[str],
        draft_plan: FullMindmapSchema
    ) -> FullMindmapSchema:
        """
        Critic Agent: Reviews the draft mindmap plan using a stronger LLM,
        suggests/applies improvements, and returns the finalized plan.
        """
        logger.info(f"Critic Agent (Model: {self.critic_model_name}): Reviewing draft plan for '{topic}'...")
        
        draft_str = ""
        for i, concept in enumerate(draft_plan.concepts):
            draft_str += f"- Concept {i+1}: '{concept.label}' (Relation: '{concept.relation_from_topic}')\n"
            draft_str += f"  Description: {concept.description}\n"
            for j, leaf in enumerate(concept.leaves):
                draft_str += f"    * Leaf {j+1}: '{leaf.label}' (Relation: '{leaf.relation}')\n"
                draft_str += f"      Description: {leaf.description}\n"

        prompt = f"""
        You are a Critic Agent. Your task is to critically review and refine the following draft mindmap decomposition.
        
        Main Topic: '{topic}'
        Guidelines/Context: {guidelines or 'None'}
        
        Here is the draft decomposition:
        {draft_str}

        Please review and improve this plan based on the following criteria:
        1. Disjointness: Ensure all Level 1 concepts are completely disjoint. If there is any semantic overlap, rename or consolidate them to maximize distinctness.
        2. Clarity & Detail: Ensure descriptions are informative, high-quality, and clearly explain each component's role.
        3. Strict Tree Structure: Sibling concepts must remain disjoint, and each node must connect to its parent (Level 0 Topic -> Level 1 Concept -> Level 2 Leaves).
        4. Conciseness: Keep concept and leaf labels short and punchy (1 to 4 words).
        5. Edge Relationship Standardizing: Use standard, concise capitalized relationship verbs.
        
        Output the finalized, improved, and polished version of the mindmap schema.
        """

        for attempt in range(4):
            try:
                response = self.client.models.generate_content(
                    model=self.critic_model_name,
                    contents=prompt,
                    config={
                        "response_mime_type": "application/json",
                        "response_schema": FullMindmapSchema,
                    }
                )
                finalized_plan: FullMindmapSchema = response.parsed
                # Programmatically harmonize relations to prevent duplicate verbs
                for concept in finalized_plan.concepts:
                    concept.relation_from_topic = harmonize_relation(concept.relation_from_topic)
                    for leaf in concept.leaves:
                        leaf.relation = harmonize_relation(leaf.relation)
                logger.info(f"Critic Agent: Successfully reviewed and finalized the plan.")
                return finalized_plan
            except Exception as err:
                err_msg = str(err).upper()
                is_transient = any(kw in err_msg for kw in ["503", "429", "UNAVAILABLE", "TEMPORARY", "LIMIT", "DEMAND", "RESOURCE"])
                if is_transient and attempt < 3:
                    sleep_time = 2 ** attempt
                    logger.warning(f"Transient Gemini API error in Critic Plan (attempt {attempt + 1}/4): {err}. Retrying in {sleep_time}s...")
                    time.sleep(sleep_time)
                else:
                    logger.error(f"[red]Critic Agent Plan failed on final attempt[/red]: {err}")
                    return draft_plan

    def criticize_content(
        self,
        node_label: str,
        node_description: str,
        topic_title: str,
        parent_label: Optional[str],
        user_guidelines: Optional[str],
        draft_content: str
    ) -> str:
        """
        Critic Agent: Reviews the draft markdown content using a stronger LLM,
        refines and polishes it, and returns the finalized article.
        """
        logger.info(f"Critic Agent (Model: {self.critic_model_name}): Reviewing draft article for '{node_label}'...")
        
        parent_context = f"Parent concept: '{parent_label}'." if parent_label else ""
        
        prompt = f"""
        You are a Critic Agent. Your task is to critically review and refine the following draft article.
        
        Concept Name: '{node_label}'
        Description: '{node_description}'
        Part of Topic: '{topic_title}'
        {parent_context}
        
        Additional Writing Guidelines: {user_guidelines or 'None'}
        
        Here is the draft article:
        ---
        {draft_content}
        ---

        Please review and improve this draft based on the following criteria:
        1. Clarity & Flow: Fix any awkward phrasing, grammar, spelling, or flow issues.
        2. Depth & Detail: Ensure the article is high-quality, comprehensive, and contains deep explanations or relevant code snippets/examples where useful.
        3. Strict Guideline Compliance: Ensure any user guidelines or constraints are fully respected.
        4. Markdown Structure: Verify that the document starts directly with the content, uses clean, well-structured headings, bullet points, and code formatting, and contains absolutely no HTML tags.
        
        Output the finalized, polished, and improved version of the article.
        """

        for attempt in range(4):
            try:
                response = self.client.models.generate_content(
                    model=self.critic_model_name,
                    contents=prompt
                )
                finalized_content: str = response.text
                logger.info(f"Critic Agent: Successfully reviewed and finalized the article ({len(finalized_content)} characters).")
                return finalized_content
            except Exception as err:
                err_msg = str(err).upper()
                is_transient = any(kw in err_msg for kw in ["503", "429", "UNAVAILABLE", "TEMPORARY", "LIMIT", "DEMAND", "RESOURCE"])
                if is_transient and attempt < 3:
                    sleep_time = 2 ** attempt
                    logger.warning(f"Transient Gemini API error in Critic Content (attempt {attempt + 1}/4): {err}. Retrying in {sleep_time}s...")
                    time.sleep(sleep_time)
                else:
                    logger.error(f"[red]Critic Agent Content failed on final attempt[/red]: {err}")
                    return draft_content


# Global agents client instance
agents = MindmapAgents(
    model_name=settings.primary_model,
    critic_model_name=settings.critic_model
)
