from pydantic import BaseModel, Field
from typing import List, Optional


class TopicCreate(BaseModel):
    """Payload to create a new macro-level mindmap."""
    topic: str = Field(..., description="The main topic of the mindmap.")
    guidelines: Optional[str] = Field(None, description="Optional guidelines or context to direct the generation.")


class TopicResponse(BaseModel):
    """Response containing root Topic information."""
    id: str = Field(..., description="Unique ID of the topic.")
    title: str = Field(..., description="Title of the topic.")
    description: str = Field(..., description="Brief description of the topic.")


class MindmapNodeSchema(BaseModel):
    """Schema representing a single node in the mindmap, compatible with database storage and frontend rendering."""
    id: str = Field(..., description="Unique ID of the node.")
    label: str = Field(..., description="Text label of the concept.")
    description: str = Field(..., description="One-sentence description of the concept.")
    content: Optional[str] = Field(None, description="Detailed markdown content generated for the node.")
    level: int = Field(..., description="Depth level of the node in the drill-down hierarchy (0 for root level).")
    parent_id: Optional[str] = Field(None, description="ID of the parent node if this node belongs to a sub-graph.")
    sub_graph_parent_id: Optional[str] = Field(None, description="ID of the node drilled down from to generate this node's view (None for root level).")
    has_subgraph: bool = Field(False, description="Whether this node has an active sub-graph available.")
    topic_id: str = Field(..., description="ID of the root Topic this node belongs to.")


class MindmapEdgeSchema(BaseModel):
    """Schema representing a directed relationship between two nodes in the mindmap."""
    id: str = Field(..., description="Unique ID of the edge.")
    source: str = Field(..., description="Source node ID.")
    target: str = Field(..., description="Target node ID.")
    relation: str = Field(..., description="Standardized verb/relationship type (e.g. PART_OF, DEPENDS_ON).")


class GraphResponse(BaseModel):
    """Response payload enclosing the full graph structure (nodes and edges) for frontend rendering."""
    topic: TopicResponse = Field(..., description="Topic context.")
    nodes: List[MindmapNodeSchema] = Field(..., description="List of nodes in the graph.")
    edges: List[MindmapEdgeSchema] = Field(..., description="List of edges/relationships in the graph.")


class NodeCreateContent(BaseModel):
    """Request payload for writing detailed node content."""
    instructions: Optional[str] = Field(None, description="Optional writing instructions or constraints.")


class DrillDownRequest(BaseModel):
    """Request payload to perform a sub-graph drill down from a specific node."""
    guidelines: Optional[str] = Field(None, description="Optional focus area or guidelines for the sub-graph.")


# --- Structured Output Pydantic schemas for Gemini Agent queries ---

class LeafNode(BaseModel):
    """Structure for a leaf concept (Level 2 concept)."""
    label: str = Field(..., description="Concise label representing the leaf sub-concept (1 to 4 words).")
    description: str = Field(..., description="A one-sentence summary explaining this leaf's role.")
    relation: str = Field(
        ..., 
        description=(
            "Concise uppercase verb phrase connecting the parent concept to this leaf (e.g. 'PROVIDES', 'SECURES', "
            "'TRACKS', 'IMPLEMENTS', 'INCLUDES', 'ENABLES'). Keep it highly standard (1-2 words), capitalized with "
            "underscores if needed, and reuse existing relationship verbs across the graph to maintain consistency."
        )
    )


class MainConcept(BaseModel):
    """Structure for a main concept (Level 1 concept)."""
    label: str = Field(..., description="Concise label representing the main sub-topic component (1 to 4 words).")
    description: str = Field(..., description="A one-sentence summary explaining this main concept.")
    relation_from_topic: str = Field(
        ..., 
        description=(
            "Concise uppercase verb phrase connecting the main topic to this concept (e.g. 'PROVIDES', 'SECURES', "
            "'TRACKS', 'IMPLEMENTS', 'INCLUDES', 'ENABLES'). Keep it highly standard (1-2 words), capitalized with "
            "underscores if needed, and reuse existing relationship verbs across the graph to maintain consistency."
        )
    )
    leaves: List[LeafNode] = Field(..., description="Exactly 3 specific leaf nodes that further detail this main concept.")


class FullMindmapSchema(BaseModel):
    """Response structure for generating the entire 2-level mindmap at once."""
    description: str = Field(..., description="An overall description summarizing the topic.")
    concepts: List[MainConcept] = Field(..., description="A list of 5 to 8 main concept nodes detailing the topic.")
