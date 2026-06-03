import re
from typing import List, Optional, Tuple, Dict, Any
from neo4j import GraphDatabase, RoutingControl
from neo4j.exceptions import DriverError, Neo4jError

from app.config import settings
from app.logger import logger
from app.schemas import TopicResponse, MindmapNodeSchema, MindmapEdgeSchema


class Neo4jClient:
    """
    Wrapper client around the Neo4j Graph Database Driver.
    
    Provides utility methods to execute Cypher queries for saving, updating,
    and fetching hierarchical mindmap nodes and relationships.
    """

    def __init__(self) -> None:
        """Initializes the Neo4j driver using settings configuration."""
        self.uri = settings.neo4j_uri
        self.username = settings.neo4j_username
        self.password = settings.neo4j_password
        self.database = settings.neo4j_database
        
        logger.info(f"Connecting to Neo4j database at [cyan]{self.uri}[/cyan]...")
        self.driver = GraphDatabase.driver(
            self.uri,
            auth=(self.username, self.password)
        )

    def close(self) -> None:
        """Closes the active database driver connection."""
        if self.driver:
            self.driver.close()
            logger.info("Neo4j driver connection closed.")

    def check_connection(self) -> bool:
        """
        Verifies the database connection health by executing a simple query.
        
        Returns:
            bool: True if connection is successful, False otherwise.
        """
        query = "RETURN 1 AS val"
        try:
            # We can use execute_query (available in neo4j >= 5.0) which is cleaner
            self.driver.execute_query(
                query,
                database_=self.database,
                routing_=RoutingControl.READ
            )
            logger.info("Successfully connected to Neo4j database.")
            return True
        except (DriverError, Neo4jError, Exception) as err:
            logger.error(f"[red]Failed to connect to Neo4j[/red]: {err}")
            return False

    def clear_db(self) -> None:
        """Wipes the database by deleting all nodes and relationships."""
        query = "MATCH (n) DETACH DELETE n"
        try:
            self.driver.execute_query(query, database_=self.database)
            logger.warning("Wiped Neo4j database (DETACH DELETE).")
        except Exception as err:
            logger.error(f"[red]Error clearing database[/red]: {err}")
            raise

    def save_topic(self, topic_id: str, title: str, description: str) -> TopicResponse:
        """
        Saves a new root Topic node.
        
        Args:
            topic_id: Unique identifier for the topic.
            title: Topic title.
            description: Overview description.
            
        Returns:
            TopicResponse: The saved topic data.
        """
        query = """
        MERGE (t:Topic {id: $id})
        ON CREATE SET t.title = $title, t.description = $description, t.created_at = datetime()
        ON MATCH SET t.title = $title, t.description = $description
        RETURN t.id AS id, t.title AS title, t.description AS description
        """
        try:
            result = self.driver.execute_query(
                query,
                id=topic_id,
                title=title,
                description=description,
                database_=self.database,
                result_transformer_=lambda r: r.single()
            )
            return TopicResponse(
                id=result["id"],
                title=result["title"],
                description=result["description"]
            )
        except Exception as err:
            logger.error(f"[red]Error saving topic {title}[/red]: {err}")
            raise

    def get_topic(self, topic_id: str) -> Optional[TopicResponse]:
        """
        Retrieves a root Topic by ID.
        
        Args:
            topic_id: Unique topic ID.
            
        Returns:
            Optional[TopicResponse]: The topic details, or None if not found.
        """
        query = "MATCH (t:Topic {id: $id}) RETURN t.id AS id, t.title AS title, t.description AS description"
        try:
            result = self.driver.execute_query(
                query,
                id=topic_id,
                database_=self.database,
                result_transformer_=lambda r: r.single()
            )
            if not result:
                return None
            return TopicResponse(
                id=result["id"],
                title=result["title"],
                description=result["description"]
            )
        except Exception as err:
            logger.error(f"[red]Error getting topic {topic_id}[/red]: {err}")
            return None

    def save_graph(
        self,
        topic_id: str,
        nodes: List[MindmapNodeSchema],
        edges: List[MindmapEdgeSchema]
    ) -> None:
        """
        Saves a batch of nodes and edges to Neo4j.
        
        Args:
            topic_id: Root Topic ID.
            nodes: List of MindmapNodeSchema.
            edges: List of MindmapEdgeSchema.
        """
        node_query = """
        MATCH (t:Topic {id: $topic_id})
        MERGE (n:MindmapNode {id: $id})
        ON CREATE SET n.label = $label,
                      n.description = $description,
                      n.content = $content,
                      n.level = $level,
                      n.parent_id = $parent_id,
                      n.sub_graph_parent_id = $sub_graph_parent_id,
                      n.topic_id = $topic_id
        ON MATCH SET n.label = $label,
                     n.description = $description,
                     n.level = $level,
                     n.parent_id = $parent_id,
                     n.sub_graph_parent_id = $sub_graph_parent_id
        MERGE (t)-[:HAS_NODE]->(n)
        """
        
        # We will use homogenized relationships stored as properties.
        # But to support Neo4j's visual representation, we can dynamically build Cypher 
        # relationship statements using sanitized relationship names (like [:DEPENDS_ON] or [:CONTAINS]).
        # Safe regex check for capital alphanumeric + underscore strings.
        relation_pattern = re.compile(r"^[A-Z_]+$")

        try:
            # Save all nodes first
            for node in nodes:
                self.driver.execute_query(
                    node_query,
                    topic_id=topic_id,
                    id=node.id,
                    label=node.label,
                    description=node.description,
                    content=node.content,
                    level=node.level,
                    parent_id=node.parent_id,
                    sub_graph_parent_id=node.sub_graph_parent_id,
                    database_=self.database
                )
                
                # If this node has a parent, link it with a hierarchy relationship
                if node.parent_id:
                    parent_link_query = """
                    MATCH (parent:MindmapNode {id: $parent_id})
                    MATCH (child:MindmapNode {id: $child_id})
                    MERGE (child)-[:SUB_GRAPH_OF]->(parent)
                    """
                    self.driver.execute_query(
                        parent_link_query,
                        parent_id=node.parent_id,
                        child_id=node.id,
                        database_=self.database
                    )

            # Save all edges
            for edge in edges:
                rel_type = "RELATED_TO"
                if relation_pattern.match(edge.relation):
                    rel_type = edge.relation
                
                # We merge nodes to ensure they exist, then merge the relationship with relationship type rel_type.
                # Storing 'relation' property as well for frontend query.
                edge_query = f"""
                MATCH (s) WHERE s.id = $source
                MATCH (t:MindmapNode {{id: $target}})
                MERGE (s)-[r:{rel_type}]->(t)
                SET r.relation = $relation, r.id = $id
                """
                self.driver.execute_query(
                    edge_query,
                    source=edge.source,
                    target=edge.target,
                    relation=edge.relation,
                    id=edge.id,
                    database_=self.database
                )

            logger.info(f"Saved graph for topic {topic_id} ({len(nodes)} nodes, {len(edges)} edges).")
        except Exception as err:
            logger.error(f"[red]Error saving graph[/red]: {err}")
            raise

    def get_nodes_and_edges(
        self,
        topic_id: str,
        parent_id: Optional[str] = None
    ) -> Tuple[List[MindmapNodeSchema], List[MindmapEdgeSchema]]:
        """
        Retrieves nodes and edges for a specific level of hierarchy in a Topic.
        For a given parent_id (or None for root), retrieves nodes belonging to that level's view.
        
        Args:
            topic_id: Root topic ID.
            parent_id: The ID of the parent node to drill down into. If None, retrieves root level.
            
        Returns:
            Tuple[List[MindmapNodeSchema], List[MindmapEdgeSchema]]: Extracted nodes and edges.
        """
        # Retrieve all nodes that belong to the active level view, along with has_subgraph indicator
        if parent_id is None:
            node_query = """
            MATCH (n:MindmapNode {topic_id: $topic_id})
            WHERE n.sub_graph_parent_id IS NULL
            OPTIONAL MATCH (child:MindmapNode {topic_id: $topic_id})
            WHERE child.sub_graph_parent_id = n.id
            RETURN n, count(child) > 0 AS has_subgraph
            """
        else:
            node_query = """
            MATCH (n:MindmapNode {topic_id: $topic_id})
            WHERE n.sub_graph_parent_id = $parent_id
            OPTIONAL MATCH (child:MindmapNode {topic_id: $topic_id})
            WHERE child.sub_graph_parent_id = n.id
            RETURN n, count(child) > 0 AS has_subgraph
            """

        try:
            records = self.driver.execute_query(
                node_query,
                topic_id=topic_id,
                parent_id=parent_id,
                database_=self.database,
                routing_=RoutingControl.READ
            )

            nodes = []
            node_ids = set()
            for record in records.records:
                n_node = record.get("n")
                if n_node:
                    n_id = n_node["id"]
                    if n_id not in node_ids:
                        nodes.append(MindmapNodeSchema(
                            id=n_id,
                            label=n_node["label"],
                            description=n_node["description"],
                            content=n_node.get("content"),
                            level=n_node["level"],
                            parent_id=n_node.get("parent_id"),
                            sub_graph_parent_id=n_node.get("sub_graph_parent_id"),
                            has_subgraph=bool(record.get("has_subgraph", False)),
                            topic_id=n_node["topic_id"]
                        ))
                        node_ids.add(n_id)

            # Fetching edges connecting the retrieved nodes
            if not node_ids:
                return [], []

            edge_query = """
            MATCH (s:MindmapNode {topic_id: $topic_id})-[r]->(t:MindmapNode {topic_id: $topic_id})
            WHERE s.id IN $node_ids AND t.id IN $node_ids AND type(r) <> 'SUB_GRAPH_OF'
            RETURN s.id AS source, t.id AS target, coalesce(r.relation, type(r)) AS relation, coalesce(r.id, 'edge-' + s.id + '-' + t.id) AS id
            
            UNION
            
            MATCH (s)-[r]->(t:MindmapNode {topic_id: $topic_id})
            WHERE t.id IN $node_ids
              AND ((s:Topic AND s.id = $topic_id AND $parent_id IS NULL)
                   OR (s:MindmapNode AND s.id = $parent_id AND $parent_id IS NOT NULL))
              AND type(r) <> 'HAS_NODE'
              AND type(r) <> 'SUB_GRAPH_OF'
            RETURN s.id AS source, t.id AS target, coalesce(r.relation, type(r)) AS relation, coalesce(r.id, 'edge-' + s.id + '-' + t.id) AS id
            """
            
            edge_records = self.driver.execute_query(
                edge_query,
                topic_id=topic_id,
                parent_id=parent_id,
                node_ids=list(node_ids),
                database_=self.database,
                routing_=RoutingControl.READ,
                result_transformer_=lambda r: [dict(record) for record in r]
            )

            edges = []
            for record in edge_records:
                edge = MindmapEdgeSchema(
                    id=record["id"],
                    source=record["source"],
                    target=record["target"],
                    relation=record["relation"]
                )
                edges.append(edge)

            return nodes, edges
        except Exception as err:
            logger.error(f"[red]Error retrieving graph for topic {topic_id} and parent {parent_id}[/red]: {err}")
            raise

    def update_node_content(self, node_id: str, content: str) -> None:
        """
        Updates the detailed markdown content of a specific node.
        
        Args:
            node_id: Node ID.
            content: The detailed markdown article generated.
        """
        query = """
        MATCH (n:MindmapNode {id: $id})
        SET n.content = $content
        RETURN n.id AS id
        """
        try:
            self.driver.execute_query(
                query,
                id=node_id,
                content=content,
                database_=self.database
            )
            logger.info(f"Updated content for node {node_id}.")
        except Exception as err:
            logger.error(f"[red]Error updating content for node {node_id}[/red]: {err}")
            raise

    def get_node(self, node_id: str) -> Optional[MindmapNodeSchema]:
        """
        Retrieves a single node by its ID.
        
        Args:
            node_id: Node ID.
            
        Returns:
            Optional[MindmapNodeSchema]: The node schema, or None if not found.
        """
        query = """
        MATCH (n:MindmapNode {id: $id})
        OPTIONAL MATCH (child:MindmapNode)
        WHERE child.sub_graph_parent_id = n.id
        RETURN n, count(child) > 0 AS has_subgraph
        """
        try:
            result = self.driver.execute_query(
                query,
                id=node_id,
                database_=self.database,
                routing_=RoutingControl.READ,
                result_transformer_=lambda r: r.single()
            )
            if not result:
                return None
            record = result["n"]
            return MindmapNodeSchema(
                id=record["id"],
                label=record["label"],
                description=record["description"],
                content=record.get("content"),
                level=record["level"],
                parent_id=record.get("parent_id"),
                sub_graph_parent_id=record.get("sub_graph_parent_id"),
                has_subgraph=bool(result.get("has_subgraph", False)),
                topic_id=record["topic_id"]
            )
        except Exception as err:
            logger.error(f"[red]Error fetching node {node_id}[/red]: {err}")
            return None

    def get_breadcrumbs(self, node_id: str) -> List[Dict[str, str]]:
        """
        Traverses upward using SUB_GRAPH_OF relationships to build navigation path.
        
        Args:
            node_id: Node ID.
            
        Returns:
            List[Dict[str, str]]: A list of breadcrumbs from root topic to the current node.
        """
        query = """
        MATCH (n:MindmapNode {id: $id})
        OPTIONAL MATCH path = (n)-[:SUB_GRAPH_OF*]->(root:MindmapNode)
        WHERE root.parent_id IS NULL
        RETURN n, nodes(path) AS ancestors
        """
        try:
            result = self.driver.execute_query(
                query,
                id=node_id,
                database_=self.database,
                routing_=RoutingControl.READ,
                result_transformer_=lambda r: r.single()
            )
            if not result:
                return []
            
            breadcrumbs = []
            ancestors = result.get("ancestors")
            
            # If there's a path, reverse it so it starts from root down to node
            if ancestors:
                # remove none elements
                ancestors = [a for a in ancestors if a]
                # reverse to get root-first
                ancestors.reverse()
                for anc in ancestors:
                    breadcrumbs.append({
                        "id": anc["id"],
                        "label": anc["label"]
                    })
            else:
                # Only the node itself is present
                node_rec = result["n"]
                breadcrumbs.append({
                    "id": node_rec["id"],
                    "label": node_rec["label"]
                })
                
            return breadcrumbs
        except Exception as err:
            logger.error(f"[red]Error fetching breadcrumbs for {node_id}[/red]: {err}")
            return []

    def get_all_topics(self) -> List[TopicResponse]:
        """
        Retrieves all Topic nodes saved in Neo4j, sorted by creation time descending.
        
        Returns:
            List[TopicResponse]: The list of topics.
        """
        query = """
        MATCH (t:Topic)
        RETURN t.id AS id, t.title AS title, t.description AS description
        ORDER BY t.created_at DESC
        """
        try:
            records = self.driver.execute_query(
                query,
                database_=self.database,
                routing_=RoutingControl.READ,
                result_transformer_=lambda r: [dict(record) for record in r]
            )
            return [
                TopicResponse(
                    id=record["id"],
                    title=record["title"],
                    description=record["description"]
                )
                for record in records
            ]
        except Exception as err:
            logger.error(f"[red]Error fetching all topics[/red]: {err}")
            return []


# Global database client instance (lazy initialized or active import)
neo4j_client = Neo4jClient()
