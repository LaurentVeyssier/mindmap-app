import uuid
import json
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
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


@app.get("/api/mindmaps", response_model=List[TopicResponse])
def list_mindmaps() -> List[TopicResponse]:
    """
    Retrieves all created mindmaps (topics) from the Neo4j database.
    """
    try:
        return neo4j_client.get_all_topics()
    except Exception as err:
        logger.error(f"[red]Failed to fetch mindmaps[/red]: {err}")
        raise HTTPException(status_code=500, detail=str(err))


@app.post("/api/mindmap/create")
def create_mindmap(payload: TopicCreate) -> StreamingResponse:
    """
    Creates a new Topic and generates a 2-level hierarchical mindmap.
    Streams progress updates, finalizing with the GraphResponse payload.
    """
    def event_generator():
        if not settings.use_critic:
            yield json.dumps({"step": "critic", "status": "disabled", "message": "Critic Agent: Disabled in settings"}) + "\n"
        # Step 1: Planner Agent
        yield json.dumps({"step": "planner", "status": "active", "message": "Planner Agent: Decomposing topic and drafting 2-level schema..."}) + "\n"
        try:
            topic_id = str(uuid.uuid4())
            decomposition = agents.plan_topic_draft(payload.topic, payload.guidelines, 8)
            yield json.dumps({"step": "planner", "status": "done", "message": f"Planner Agent: Drafted {len(decomposition.concepts)} concept areas."}) + "\n"
        except Exception as err:
            yield json.dumps({"step": "planner", "status": "failed", "message": f"Planner Agent failed: {err}"}) + "\n"
            return

        # Step 2: Critic Agent
        if not settings.use_critic:
            yield json.dumps({"step": "critic", "status": "disabled", "message": "Critic Agent: Disabled (skipped)"}) + "\n"
            finalized_decomposition = decomposition
        else:
            yield json.dumps({"step": "critic", "status": "active", "message": f"Critic Agent: Reviewing structure, relations, and distinctness..."}) + "\n"
            try:
                finalized_decomposition = agents.criticize_plan(payload.topic, payload.guidelines, decomposition)
                yield json.dumps({"step": "critic", "status": "done", "message": "Critic Agent: Refined and consolidated concepts."}) + "\n"
            except Exception as err:
                yield json.dumps({"step": "critic", "status": "failed", "message": f"Critic Agent failed: {err}. Using draft."}) + "\n"
                finalized_decomposition = decomposition

        # Step 3: Database Persist
        yield json.dumps({"step": "db", "status": "active", "message": "Neo4j Database: Saving graph nodes and edges..."}) + "\n"
        try:
            # 2. Save root Topic metadata
            topic_node = neo4j_client.save_topic(
                topic_id=topic_id,
                title=payload.topic,
                description=finalized_decomposition.description
            )
            
            # 3. Create Node and Edge Schemas
            nodes_list: List[MindmapNodeSchema] = []
            edges_list: List[MindmapEdgeSchema] = []
            
            for concept in finalized_decomposition.concepts:
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
            yield json.dumps({"step": "db", "status": "done", "message": "Neo4j Database: Graph saved successfully."}) + "\n"
        except Exception as err:
            yield json.dumps({"step": "db", "status": "failed", "message": f"Neo4j Database failed: {err}"}) + "\n"
            return
            
        final_payload = GraphResponse(
            topic=topic_node,
            nodes=nodes_list,
            edges=edges_list
        )
        yield json.dumps({"status": "completed", "data": final_payload.model_dump()}) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


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


@app.post("/api/mindmap/node/{node_id}/drill-down")
def drill_down_node(node_id: str, payload: DrillDownRequest) -> StreamingResponse:
    """
    Generates a sub-graph for a specific parent node.
    Streams progress updates, finalizing with the GraphResponse payload.
    """
    def event_generator():
        parent_node = neo4j_client.get_node(node_id)
        if not parent_node:
            yield json.dumps({"status": "error", "message": "Parent node not found"}) + "\n"
            return
            
        topic_node = neo4j_client.get_topic(parent_node.topic_id)
        if not topic_node:
            yield json.dumps({"status": "error", "message": "Topic not found"}) + "\n"
            return
            
        # Check if sub-graph already exists in database to prevent regeneration and keep level unchanged
        existing_nodes, existing_edges = neo4j_client.get_nodes_and_edges(
            topic_id=parent_node.topic_id,
            parent_id=parent_node.id
        )
        if existing_nodes:
            logger.info(f"Drill down: Returning existing sub-graph for node '{parent_node.label}' from database.")
            yield json.dumps({"step": "planner", "status": "done", "message": "Planner Agent: Loaded existing sub-graph from Neo4j."}) + "\n"
            yield json.dumps({"step": "critic", "status": "done", "message": "Critic Agent: Checked database record."}) + "\n"
            yield json.dumps({"step": "db", "status": "done", "message": "Neo4j Database: Retrieved sub-graph."}) + "\n"
            
            final_payload = GraphResponse(
                topic=topic_node,
                nodes=existing_nodes,
                edges=existing_edges
            )
            yield json.dumps({"status": "completed", "data": final_payload.model_dump()}) + "\n"
            return

        # 1. Decompose the sub-topic with context and boundaries
        if not settings.use_critic:
            yield json.dumps({"step": "critic", "status": "disabled", "message": "Critic Agent: Disabled in settings"}) + "\n"
        yield json.dumps({"step": "planner", "status": "active", "message": f"Planner Agent: Decomposing sub-topic '{parent_node.label}' with master graph boundaries..."}) + "\n"
        try:
            lineage = [{"id": topic_node.id, "label": topic_node.title}] + neo4j_client.get_breadcrumbs(parent_node.id)
            other_nodes = neo4j_client.get_other_nodes_in_graph(
                topic_id=parent_node.topic_id,
                parent_id=parent_node.id
            )
            decomposition = agents.plan_subgraph_draft(
                topic=topic_node.title,
                parent_node_label=parent_node.label,
                parent_node_level=parent_node.level,
                lineage_path=lineage,
                other_nodes=other_nodes,
                guidelines=payload.guidelines
            )
            yield json.dumps({"step": "planner", "status": "done", "message": "Planner Agent: Drafted sub-concepts."}) + "\n"
        except Exception as err:
            yield json.dumps({"step": "planner", "status": "failed", "message": f"Planner Agent failed: {err}"}) + "\n"
            return

        # 2. Call Critic Agent
        if not settings.use_critic:
            yield json.dumps({"step": "critic", "status": "disabled", "message": "Critic Agent: Disabled (skipped)"}) + "\n"
            finalized_decomposition = decomposition
        else:
            yield json.dumps({"step": "critic", "status": "active", "message": f"Critic Agent: Reviewing sub-graph structure and boundaries..."}) + "\n"
            try:
                finalized_decomposition = agents.criticize_subgraph_plan(
                    topic=topic_node.title,
                    parent_node_label=parent_node.label,
                    lineage_path=lineage,
                    other_nodes=other_nodes,
                    draft_plan=decomposition,
                    guidelines=payload.guidelines
                )
                yield json.dumps({"step": "critic", "status": "done", "message": "Critic Agent: Refined and consolidated sub-concepts."}) + "\n"
            except Exception as err:
                yield json.dumps({"step": "critic", "status": "failed", "message": f"Critic Agent failed: {err}. Using draft."}) + "\n"
                finalized_decomposition = decomposition

        # 3. Create sub-nodes (linked to parent) and edges, then persist
        yield json.dumps({"step": "db", "status": "active", "message": "Neo4j Database: Saving sub-graph..."}) + "\n"
        try:
            sub_nodes_list: List[MindmapNodeSchema] = []
            sub_edges_list: List[MindmapEdgeSchema] = []
            
            for concept in finalized_decomposition.concepts:
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
            yield json.dumps({"step": "db", "status": "done", "message": "Neo4j Database: Sub-graph saved successfully."}) + "\n"
        except Exception as err:
            yield json.dumps({"step": "db", "status": "failed", "message": f"Neo4j Database failed: {err}"}) + "\n"
            return
            
        final_payload = GraphResponse(
            topic=topic_node,
            nodes=sub_nodes_list,
            edges=sub_edges_list
        )
        yield json.dumps({"status": "completed", "data": final_payload.model_dump()}) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


@app.post("/api/mindmap/node/{node_id}/generate-content")
def generate_node_content(node_id: str, payload: NodeCreateContent) -> StreamingResponse:
    """
    Generates a detailed markdown article/content for a specific concept node or root Topic node.
    Streams progress updates, finalizing with the content payload.
    """
    def event_generator():
        node = neo4j_client.get_node(node_id)
        if node:
            topic = neo4j_client.get_topic(node.topic_id)
            if not topic:
                yield json.dumps({"status": "error", "message": "Topic not found"}) + "\n"
                return
                
            parent_label: Optional[str] = None
            if node.parent_id:
                parent_node = neo4j_client.get_node(node.parent_id)
                if parent_node:
                    parent_label = parent_node.label
                    
            # 1. Draft content
            if not settings.use_critic:
                yield json.dumps({"step": "critic", "status": "disabled", "message": "Critic Agent: Disabled in settings"}) + "\n"
            yield json.dumps({"step": "writer", "status": "active", "message": f"Content Writer: Drafting comprehensive guide for '{node.label}'..."}) + "\n"
            try:
                content = agents.generate_node_content_draft(
                    node_label=node.label,
                    node_description=node.description,
                    topic_title=topic.title,
                    parent_label=parent_label,
                    user_guidelines=payload.instructions
                )
                yield json.dumps({"step": "writer", "status": "done", "message": "Content Writer: Completed initial article draft."}) + "\n"
            except Exception as err:
                yield json.dumps({"step": "writer", "status": "failed", "message": f"Content Writer failed: {err}"}) + "\n"
                return
                
            # 2. Critic
            if not settings.use_critic:
                yield json.dumps({"step": "critic", "status": "disabled", "message": "Critic Agent: Disabled (skipped)"}) + "\n"
            else:
                yield json.dumps({"step": "critic", "status": "active", "message": f"Critic Agent: Polishing and refining article flow..."}) + "\n"
                try:
                    content = agents.criticize_content(
                        node_label=node.label,
                        node_description=node.description,
                        topic_title=topic.title,
                        parent_label=parent_label,
                        user_guidelines=payload.instructions,
                        draft_content=content
                    )
                    yield json.dumps({"step": "critic", "status": "done", "message": "Critic Agent: Polished and finalized article content."}) + "\n"
                except Exception as err:
                    yield json.dumps({"step": "critic", "status": "failed", "message": f"Critic Agent failed: {err}. Using draft."}) + "\n"
                
            # 3. DB Sync
            yield json.dumps({"step": "db", "status": "active", "message": "Neo4j Database: Saving article content..."}) + "\n"
            try:
                neo4j_client.update_node_content(node_id, content)
                yield json.dumps({"step": "db", "status": "done", "message": "Neo4j Database: Article saved successfully."}) + "\n"
            except Exception as err:
                yield json.dumps({"step": "db", "status": "failed", "message": f"Neo4j Database failed: {err}"}) + "\n"
                return
                
            yield json.dumps({"status": "completed", "data": {"content": content}}) + "\n"
        else:
            # Fallback to root Topic
            topic = neo4j_client.get_topic(node_id)
            if not topic:
                yield json.dumps({"status": "error", "message": "Node or Topic not found"}) + "\n"
                return
                
            # 1. Draft content
            if not settings.use_critic:
                yield json.dumps({"step": "critic", "status": "disabled", "message": "Critic Agent: Disabled in settings"}) + "\n"
            yield json.dumps({"step": "writer", "status": "active", "message": f"Content Writer: Drafting topic overview guide for '{topic.title}'..."}) + "\n"
            try:
                content = agents.generate_node_content_draft(
                    node_label=topic.title,
                    node_description=topic.description,
                    topic_title=topic.title,
                    parent_label=None,
                    user_guidelines=payload.instructions
                )
                yield json.dumps({"step": "writer", "status": "done", "message": "Content Writer: Completed initial topic guide draft."}) + "\n"
            except Exception as err:
                yield json.dumps({"step": "writer", "status": "failed", "message": f"Content Writer failed: {err}"}) + "\n"
                return
                
            # 2. Critic
            if not settings.use_critic:
                yield json.dumps({"step": "critic", "status": "disabled", "message": "Critic Agent: Disabled (skipped)"}) + "\n"
            else:
                yield json.dumps({"step": "critic", "status": "active", "message": f"Critic Agent: Polishing and refining topic guide..."}) + "\n"
                try:
                    content = agents.criticize_content(
                        node_label=topic.title,
                        node_description=topic.description,
                        topic_title=topic.title,
                        parent_label=None,
                        user_guidelines=payload.instructions,
                        draft_content=content
                    )
                    yield json.dumps({"step": "critic", "status": "done", "message": "Critic Agent: Polished and finalized topic overview guide."}) + "\n"
                except Exception as err:
                    yield json.dumps({"step": "critic", "status": "failed", "message": f"Critic Agent failed: {err}. Using draft."}) + "\n"
                
            # 3. DB Sync
            yield json.dumps({"step": "db", "status": "active", "message": "Neo4j Database: Saving topic overview guide..."}) + "\n"
            try:
                neo4j_client.update_topic_content(node_id, content)
                yield json.dumps({"step": "db", "status": "done", "message": "Neo4j Database: Topic guide saved successfully."}) + "\n"
            except Exception as err:
                yield json.dumps({"step": "db", "status": "failed", "message": f"Neo4j Database failed: {err}"}) + "\n"
                return
                
            yield json.dumps({"status": "completed", "data": {"content": content}}) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


@app.get("/api/mindmap/node/{node_id}", response_model=MindmapNodeSchema)
def get_node_details(node_id: str) -> MindmapNodeSchema:
    """
    Retrieves the properties (label, description, content, level, parent_id) for a single node.
    """
    node = neo4j_client.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node



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


@app.get("/api/mindmap/{topic_id}/export")
def export_mindmap(topic_id: str) -> Dict[str, Any]:
    """
    Fetches the entire graph (all nodes, edges, content, and root Topic metadata)
    for a given topic_id, serialized in a single payload.
    """
    data = neo4j_client.get_entire_graph(topic_id)
    if not data:
        raise HTTPException(status_code=404, detail="Topic not found")
    return data


@app.delete("/api/mindmap/clear")
def clear_database() -> Dict[str, str]:
    """Wipes all graphs and nodes from Neo4j database."""
    try:
        neo4j_client.clear_db()
        return {"status": "cleared"}
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err))
