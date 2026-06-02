import uuid
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.logger import logger
from app.neo4j_client import neo4j_client
from app.agents import agents
from app.schemas import (
    TopicCreate,
    TopicResponse,
    GraphResponse,
    NodeCreateContent,
    DrillDownRequest,
    MindmapNodeSchema,
    MindmapEdgeSchema
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handles startup and shutdown events for database connections."""
    logger.info("[bold green]Starting Mindmap Backend API...[/bold green]")
    # Test Neo4j connection
    db_connected = neo4j_client.check_connection()
    if not db_connected:
        logger.warning("[bold yellow]Backend started but Neo4j database is unreachable. Graph endpoints will fail.[/bold yellow]")
    yield
    # Cleanup driver resources on shutdown
    logger.info("[bold red]Shutting down Mindmap Backend API...[/bold red]")
    neo4j_client.close()


app = FastAPI(
    title="Agentic Mindmap API",
    description="Backend service that uses Gemini agents to decompose topics into Neo4j graph mindmaps.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend interactions
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def get_health() -> Dict[str, Any]:
    """
    Checks the connectivity of the backend dependencies (Neo4j and Gemini API key presence).
    
    Returns:
        A dictionary with health status indicators.
    """
    db_status = neo4j_client.check_connection()
    gemini_key_present = bool(
        settings.gemini_api_key or 
        settings.openai_api_key or 
        import_api_key_check()
    )
    
    overall_status = "ok" if (db_status and gemini_key_present) else "degraded"
    
    return {
        "status": overall_status,
        "database": "connected" if db_status else "disconnected",
        "gemini_api_key_configured": gemini_key_present
    }


def import_api_key_check() -> bool:
    """Helper to check env variables for Gemini API key."""
    import os
    return bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))


@app.post("/api/mindmap/create", response_model=GraphResponse)
def create_mindmap(payload: TopicCreate) -> GraphResponse:
    """
    Creates a new Topic and generates a 2-level hierarchical mindmap.
    
    Planner Agent divides the topic into 5-8 disjoint concept nodes,
    and each concept node into exactly 3 leaf nodes.
    Nodes and edges are persisted to Neo4j.
    """
    try:
        topic_id = str(uuid.uuid4())
        
        # 1. Decompose Topic into Concept and Leaf Nodes
        decomposition = agents.plan_topic(
            topic=payload.topic,
            guidelines=payload.guidelines,
            num_nodes=8
        )
        
        # 2. Save root Topic metadata
        topic_node = neo4j_client.save_topic(
            topic_id=topic_id,
            title=payload.topic,
            description=decomposition.description
        )
        
        # 3. Create Node and Edge Schemas
        nodes_list: List[MindmapNodeSchema] = []
        edges_list: List[MindmapEdgeSchema] = []
        
        for concept in decomposition.concepts:
            concept_id = str(uuid.uuid4())
            
            # Level 1 Concept Node
            nodes_list.append(
                MindmapNodeSchema(
                    id=concept_id,
                    label=concept.label,
                    description=concept.description,
                    content=None,
                    level=1,
                    parent_id=None,
                    sub_graph_parent_id=None,
                    topic_id=topic_id
                )
            )
            
            # Edge from Topic (Level 0) to Concept (Level 1)
            edge_id = f"edge-{topic_id}-{concept_id}"
            edges_list.append(
                MindmapEdgeSchema(
                    id=edge_id,
                    source=topic_id,
                    target=concept_id,
                    relation=concept.relation_from_topic
                )
            )
            
            # Level 2 Leaf Nodes
            for leaf in concept.leaves:
                leaf_id = str(uuid.uuid4())
                nodes_list.append(
                    MindmapNodeSchema(
                        id=leaf_id,
                        label=leaf.label,
                        description=leaf.description,
                        content=None,
                        level=2,
                        parent_id=concept_id,
                        sub_graph_parent_id=None,
                        topic_id=topic_id
                    )
                )
                
                # Edge from Concept (Level 1) to Leaf (Level 2)
                leaf_edge_id = f"edge-{concept_id}-{leaf_id}"
                edges_list.append(
                    MindmapEdgeSchema(
                        id=leaf_edge_id,
                        source=concept_id,
                        target=leaf_id,
                        relation=leaf.relation
                    )
                )
                
        # 4. Save the full 2-level graph to Neo4j database
        neo4j_client.save_graph(
            topic_id=topic_id,
            nodes=nodes_list,
            edges=edges_list
        )
        
        return GraphResponse(
            topic=topic_node,
            nodes=nodes_list,
            edges=edges_list
        )
        
    except Exception as err:
        logger.error(f"[red]Failed to create mindmap[/red]: {err}")
        raise HTTPException(status_code=500, detail=str(err))


@app.get("/api/mindmap/{topic_id}/graph", response_model=GraphResponse)
def get_mindmap_graph(
    topic_id: str,
    parent_id: Optional[str] = Query(None, description="Filter for a sub-graph level")
) -> GraphResponse:
    """
    Fetches the nodes and edges for a specific level of hierarchy in a Topic.
    
    If parent_id is omitted, returns the root/macro level nodes (level 0).
    """
    topic_node = neo4j_client.get_topic(topic_id)
    if not topic_node:
        raise HTTPException(status_code=404, detail="Topic not found")
        
    nodes, edges = neo4j_client.get_nodes_and_edges(topic_id, parent_id)
    return GraphResponse(
        topic=topic_node,
        nodes=nodes,
        edges=edges
    )


@app.post("/api/mindmap/node/{node_id}/drill-down", response_model=GraphResponse)
def drill_down_node(node_id: str, payload: DrillDownRequest) -> GraphResponse:
    """
    Generates a sub-graph for a specific parent node.
    
    Decomposes the node concept in detail, standardizes relationships,
    creates the child concepts at parent_level + 1 and leaf nodes at parent_level + 2,
    and saves them to Neo4j.
    """
    parent_node = neo4j_client.get_node(node_id)
    if not parent_node:
        raise HTTPException(status_code=404, detail="Parent node not found")
        
    topic_node = neo4j_client.get_topic(parent_node.topic_id)
    if not topic_node:
        raise HTTPException(status_code=404, detail="Topic not found")
 
    try:
        # Check if sub-graph already exists in database to prevent regeneration and keep level unchanged
        existing_nodes, existing_edges = neo4j_client.get_nodes_and_edges(
            topic_id=parent_node.topic_id,
            parent_id=parent_node.id
        )
        if existing_nodes:
            logger.info(f"Drill down: Returning existing sub-graph for node '{parent_node.label}' from database.")
            return GraphResponse(
                topic=topic_node,
                nodes=existing_nodes,
                edges=existing_edges
            )

        # 1. Decompose the sub-topic
        sub_topic_context = f"{parent_node.label} (within the scope of {topic_node.title})"
        decomposition = agents.plan_topic(
            topic=sub_topic_context,
            guidelines=payload.guidelines,
            num_nodes=6
        )
        
        # 2. Create sub-nodes (linked to parent) and edges
        sub_nodes_list: List[MindmapNodeSchema] = []
        sub_edges_list: List[MindmapEdgeSchema] = []
        
        for concept in decomposition.concepts:
            concept_id = str(uuid.uuid4())
            
            # Level L + 1 Concept Node
            sub_nodes_list.append(
                MindmapNodeSchema(
                    id=concept_id,
                    label=concept.label,
                    description=concept.description,
                    content=None,
                    level=parent_node.level + 1,
                    parent_id=parent_node.id,
                    sub_graph_parent_id=parent_node.id,
                    topic_id=parent_node.topic_id
                )
            )
            
            # Edge from Parent to Sub-Concept
            edge_id = f"edge-{parent_node.id}-{concept_id}"
            sub_edges_list.append(
                MindmapEdgeSchema(
                    id=edge_id,
                    source=parent_node.id,
                    target=concept_id,
                    relation=concept.relation_from_topic
                )
            )
            
            # Level L + 2 Leaf Nodes
            for leaf in concept.leaves:
                leaf_id = str(uuid.uuid4())
                sub_nodes_list.append(
                    MindmapNodeSchema(
                        id=leaf_id,
                        label=leaf.label,
                        description=leaf.description,
                        content=None,
                        level=parent_node.level + 2,
                        parent_id=concept_id,
                        sub_graph_parent_id=parent_node.id,
                        topic_id=parent_node.topic_id
                    )
                )
                
                # Edge from Sub-Concept to Leaf
                leaf_edge_id = f"edge-{concept_id}-{leaf_id}"
                sub_edges_list.append(
                    MindmapEdgeSchema(
                        id=leaf_edge_id,
                        source=concept_id,
                        target=leaf_id,
                        relation=leaf.relation
                    )
                )
 
        # 3. Persist sub-graph to database
        neo4j_client.save_graph(
            topic_id=parent_node.topic_id,
            nodes=sub_nodes_list,
            edges=sub_edges_list
        )
        
        return GraphResponse(
            topic=topic_node,
            nodes=sub_nodes_list,
            edges=sub_edges_list
        )
        
    except Exception as err:
        logger.error(f"[red]Failed to drill down node {node_id}[/red]: {err}")
        raise HTTPException(status_code=500, detail=str(err))


@app.post("/api/mindmap/node/{node_id}/generate-content")
def generate_node_content(node_id: str, payload: NodeCreateContent) -> Dict[str, str]:
    """
    Generates a detailed markdown article/content for a specific concept node.
    
    Invokes Content Writer Agent and saves markdown to database.
    """
    node = neo4j_client.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
        
    topic = neo4j_client.get_topic(node.topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
        
    parent_label: Optional[str] = None
    if node.parent_id:
        parent_node = neo4j_client.get_node(node.parent_id)
        if parent_node:
            parent_label = parent_node.label
            
    try:
        content = agents.generate_node_content(
            node_label=node.label,
            node_description=node.description,
            topic_title=topic.title,
            parent_label=parent_label,
            user_guidelines=payload.instructions
        )
        
        neo4j_client.update_node_content(node_id, content)
        return {"content": content}
        
    except Exception as err:
        logger.error(f"[red]Failed to generate content for node {node_id}[/red]: {err}")
        raise HTTPException(status_code=500, detail=str(err))


@app.get("/api/mindmap/node/{node_id}/breadcrumbs")
def get_breadcrumbs(node_id: str) -> Dict[str, List[Dict[str, str]]]:
    """
    Gets breadcrumbs navigation path from the root topic down to the specified node.
    """
    node = neo4j_client.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
        
    breadcrumbs = neo4j_client.get_breadcrumbs(node_id)
    return {"breadcrumbs": breadcrumbs}


@app.delete("/api/mindmap/clear")
def clear_database() -> Dict[str, str]:
    """Wipes all graphs and nodes from Neo4j database."""
    try:
        neo4j_client.clear_db()
        return {"status": "cleared"}
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))
