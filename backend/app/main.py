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
    Creates a new Topic and generates a macro-level mindmap.
    
    Planner Agent divides the topic into 8 disjoint nodes.
    Homogenizer Agent links them with standardized relationships.
    Nodes and edges are persisted to Neo4j.
    """
    try:
        topic_id = str(uuid.uuid4())
        
        # 1. Decompose Topic into Concept Nodes
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
        
        # 3. Create Node Schemas with Unique IDs
        nodes_list: List[MindmapNodeSchema] = []
        label_to_id: Dict[str, str] = {}
        
        for index, node in enumerate(decomposition.nodes):
            node_id = str(uuid.uuid4())
            label_to_id[node.label] = node_id
            
            nodes_list.append(
                MindmapNodeSchema(
                    id=node_id,
                    label=node.label,
                    description=node.description,
                    content=None,
                    level=0,
                    parent_id=None,
                    topic_id=topic_id
                )
            )
            
        # 4. Extract relationships using Homogenizer Agent
        nodes_dict = [{"label": n.label, "description": n.description} for n in decomposition.nodes]
        relationship_data = agents.homogenize_relationships(
            topic=payload.topic,
            nodes=nodes_dict
        )
        
        # 5. Build Edge Schemas using mapped node IDs
        edges_list: List[MindmapEdgeSchema] = []
        for edge in relationship_data.edges:
            source_id = label_to_id.get(edge.source_label)
            target_id = label_to_id.get(edge.target_label)
            
            # Verify that source and target labels were actually generated nodes
            if source_id and target_id:
                edge_id = f"edge-{source_id}-{target_id}"
                edges_list.append(
                    MindmapEdgeSchema(
                        id=edge_id,
                        source=source_id,
                        target=target_id,
                        relation=edge.relation
                    )
                )
                
        # 6. Save the graph to Neo4j database
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
    
    Decomposes the node concept in detail, standardizes internal relationships,
    creates the child nodes at parent_level + 1 linked via parent_id, and
    saves them to Neo4j.
    """
    parent_node = neo4j_client.get_node(node_id)
    if not parent_node:
        raise HTTPException(status_code=404, detail="Parent node not found")
        
    topic_node = neo4j_client.get_topic(parent_node.topic_id)
    if not topic_node:
        raise HTTPException(status_code=404, detail="Topic not found")

    try:
        # 1. Decompose the sub-topic (fewer nodes for visual clarity, e.g. 5 to 6)
        sub_topic_context = f"{parent_node.label} (within the scope of {topic_node.title})"
        decomposition = agents.plan_topic(
            topic=sub_topic_context,
            guidelines=payload.guidelines,
            num_nodes=6
        )
        
        # 2. Create sub-nodes (linked to parent)
        sub_nodes_list: List[MindmapNodeSchema] = []
        label_to_id: Dict[str, str] = {}
        
        for node in decomposition.nodes:
            sub_node_id = str(uuid.uuid4())
            label_to_id[node.label] = sub_node_id
            
            sub_nodes_list.append(
                MindmapNodeSchema(
                    id=sub_node_id,
                    label=node.label,
                    description=node.description,
                    content=None,
                    level=parent_node.level + 1,
                    parent_id=parent_node.id,
                    topic_id=parent_node.topic_id
                )
            )

        # 3. Extract internal relationships between sub-nodes
        nodes_dict = [{"label": n.label, "description": n.description} for n in decomposition.nodes]
        relationship_data = agents.homogenize_relationships(
            topic=sub_topic_context,
            nodes=nodes_dict
        )
        
        # 4. Build sub-edges
        sub_edges_list: List[MindmapEdgeSchema] = []
        for edge in relationship_data.edges:
            source_id = label_to_id.get(edge.source_label)
            target_id = label_to_id.get(edge.target_label)
            
            if source_id and target_id:
                edge_id = f"edge-{source_id}-{target_id}"
                sub_edges_list.append(
                    MindmapEdgeSchema(
                        id=edge_id,
                        source=source_id,
                        target=target_id,
                        relation=edge.relation
                    )
                )

        # 5. Persist sub-graph to database
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
