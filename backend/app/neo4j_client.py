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

    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves a user record by email.

        Args:
            email: User's email address.

        Returns:
            Optional[Dict[str, Any]]: The user record properties, or None.
        """
        query = "MATCH (u:User {email: $email}) RETURN u.id AS id, u.email AS email, u.hashed_password AS hashed_password, coalesce(u.is_admin, false) AS is_admin"
        try:
            result = self.driver.execute_query(
                query,
                email=email,
                database_=self.database,
                result_transformer_=lambda r: r.single()
            )
            return dict(result) if result else None
        except Exception as err:
            logger.error(f"[red]Error fetching user by email {email}[/red]: {err}")
            return None

    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves a user record by unique ID.

        Args:
            user_id: Unique User ID.

        Returns:
            Optional[Dict[str, Any]]: The user record properties, or None.
        """
        query = "MATCH (u:User {id: $id}) RETURN u.id AS id, u.email AS email, coalesce(u.is_admin, false) AS is_admin"
        try:
            result = self.driver.execute_query(
                query,
                id=user_id,
                database_=self.database,
                result_transformer_=lambda r: r.single()
            )
            return dict(result) if result else None
        except Exception as err:
            logger.error(f"[red]Error fetching user by ID {user_id}[/red]: {err}")
            return None

    def create_user(self, user_id: str, email: str, hashed_password: str, is_admin: bool = False) -> Dict[str, Any]:
        """
        Creates a new User node in the database.

        Args:
            user_id: Unique UUID.
            email: User email address.
            hashed_password: Encrypted password hash.
            is_admin: Whether the user has admin role.

        Returns:
            Dict[str, Any]: Properties of the created user.
        """
        query = """
        CREATE (u:User {id: $id, email: $email, hashed_password: $hashed_password, is_admin: $is_admin, created_at: datetime()})
        RETURN u.id AS id, u.email AS email, u.is_admin AS is_admin
        """
        try:
            result = self.driver.execute_query(
                query,
                id=user_id,
                email=email,
                hashed_password=hashed_password,
                is_admin=is_admin,
                database_=self.database,
                result_transformer_=lambda r: r.single()
            )
            return dict(result)
        except Exception as err:
            logger.error(f"[red]Error creating user {email}[/red]: {err}")
            raise

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

    def delete_topic(self, user_id: str, topic_id: str, is_admin: bool = False) -> None:
        """
        Deletes a specific Topic and all its associated MindmapNodes and relationships, verifying ownership or admin status.

        Args:
            user_id: The authenticated user ID.
            topic_id: The unique ID of the Topic to be deleted.
            is_admin: Whether the current user is an admin.
        """
        query = """
        MATCH (t:Topic {id: $topic_id})
        WHERE $is_admin = true OR (:User {id: $user_id})-[:OWNS_TOPIC]->(t)
        OPTIONAL MATCH (n:MindmapNode {topic_id: $topic_id})
        DETACH DELETE t, n
        """
        try:
            self.driver.execute_query(query, user_id=user_id, topic_id=topic_id, is_admin=is_admin, database_=self.database)
            logger.warning(f"Deleted topic {topic_id} and all its associated nodes for user {user_id} (Admin: {is_admin}).")
        except Exception as err:
            logger.error(f"[red]Error deleting topic {topic_id}[/red]: {err}")
            raise


    def save_topic(self, user_id: str, topic_id: str, title: str, description: str) -> TopicResponse:
        """
        Saves a new root Topic node and links it to the User.
        
        Args:
            user_id: The authenticated user ID.
            topic_id: Unique identifier for the topic.
            title: Topic title.
            description: Overview description.
            
        Returns:
            TopicResponse: The saved topic data.
        """
        query = """
        MATCH (u:User {id: $user_id})
        MERGE (t:Topic {id: $id})
        ON CREATE SET t.title = $title, t.description = $description, t.created_at = datetime()
        ON MATCH SET t.title = $title, t.description = $description
        MERGE (u)-[:OWNS_TOPIC]->(t)
        RETURN t.id AS id, t.title AS title, t.description AS description, t.content AS content, u.email AS owner_email
        """
        try:
            result = self.driver.execute_query(
                query,
                user_id=user_id,
                id=topic_id,
                title=title,
                description=description,
                database_=self.database,
                result_transformer_=lambda r: r.single()
            )
            return TopicResponse(
                id=result["id"],
                title=result["title"],
                description=result["description"],
                content=result.get("content"),
                owner_email=result.get("owner_email")
            )
        except Exception as err:
            logger.error(f"[red]Error saving topic {title}[/red]: {err}")
            raise

    def get_topic(self, user_id: str, topic_id: str, is_admin: bool = False) -> Optional[TopicResponse]:
        """
        Retrieves a root Topic by ID, verifying user ownership or admin status.
        
        Args:
            user_id: The authenticated user ID.
            topic_id: Unique topic ID.
            is_admin: Whether the current user is an admin.
            
        Returns:
            Optional[TopicResponse]: The topic details, or None if not found.
        """
        query = """
        MATCH (t:Topic {id: $id})
        WHERE $is_admin = true OR (:User {id: $user_id})-[:OWNS_TOPIC]->(t)
        OPTIONAL MATCH (owner:User)-[:OWNS_TOPIC]->(t)
        RETURN t.id AS id, t.title AS title, t.description AS description, t.content AS content, owner.email AS owner_email
        """
        try:
            result = self.driver.execute_query(
                query,
                user_id=user_id,
                id=topic_id,
                is_admin=is_admin,
                database_=self.database,
                result_transformer_=lambda r: r.single()
            )
            if not result:
                return None
            return TopicResponse(
                id=result["id"],
                title=result["title"],
                description=result["description"],
                content=result.get("content"),
                owner_email=result.get("owner_email")
            )
        except Exception as err:
            logger.error(f"[red]Error getting topic {topic_id}[/red]: {err}")
            return None


    def save_graph(
        self,
        user_id: str,
        topic_id: str,
        nodes: List[MindmapNodeSchema],
        edges: List[MindmapEdgeSchema],
        is_admin: bool = False
    ) -> None:
        """
        Saves a batch of nodes and edges to Neo4j, scoped by user_id or admin privileges.
        
        Args:
            user_id: The authenticated user ID.
            topic_id: Root Topic ID.
            nodes: List of MindmapNodeSchema.
            edges: List of MindmapEdgeSchema.
            is_admin: Whether the current user is an admin.
        """
        node_query = """
        MATCH (t:Topic {id: $topic_id})
        WHERE $is_admin = true OR (:User {id: $user_id})-[:OWNS_TOPIC]->(t)
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
                    user_id=user_id,
                    is_admin=is_admin,
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
        user_id: str,
        topic_id: str,
        parent_id: Optional[str] = None,
        is_admin: bool = False
    ) -> Tuple[List[MindmapNodeSchema], List[MindmapEdgeSchema]]:
        """
        Retrieves nodes and edges for a specific level of hierarchy in a Topic, verifying user ownership or admin status.
        For a given parent_id (or None for root), retrieves nodes belonging to that level's view.
        
        Args:
            user_id: The authenticated user ID.
            topic_id: Root topic ID.
            parent_id: The ID of the parent node to drill down into. If None, retrieves root level.
            is_admin: Whether the current user is an admin.
            
        Returns:
            Tuple[List[MindmapNodeSchema], List[MindmapEdgeSchema]]: Extracted nodes and edges.
        """
        # Retrieve all nodes that belong to the active level view, along with has_subgraph indicator
        if parent_id is None:
            node_query = """
            MATCH (t:Topic {id: $topic_id})
            WHERE $is_admin = true OR (:User {id: $user_id})-[:OWNS_TOPIC]->(t)
            MATCH (n:MindmapNode {topic_id: $topic_id})
            WHERE n.sub_graph_parent_id IS NULL
            OPTIONAL MATCH (child:MindmapNode {topic_id: $topic_id})
            WHERE child.sub_graph_parent_id = n.id
            RETURN n, count(child) > 0 AS has_subgraph
            """
        else:
            node_query = """
            MATCH (t:Topic {id: $topic_id})
            WHERE $is_admin = true OR (:User {id: $user_id})-[:OWNS_TOPIC]->(t)
            MATCH (n:MindmapNode {topic_id: $topic_id})
            WHERE n.sub_graph_parent_id = $parent_id
            OPTIONAL MATCH (child:MindmapNode {topic_id: $topic_id})
            WHERE child.sub_graph_parent_id = n.id
            RETURN n, count(child) > 0 AS has_subgraph
            """
  
        try:
            records = self.driver.execute_query(
                node_query,
                user_id=user_id,
                topic_id=topic_id,
                parent_id=parent_id,
                is_admin=is_admin,
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

    def update_node_content(self, user_id: str, node_id: str, content: str, is_admin: bool = False) -> None:
        """
        Updates the detailed markdown content of a specific node, verifying user ownership or admin status.
        
        Args:
            user_id: The authenticated user ID.
            node_id: Node ID.
            content: The detailed markdown article generated.
            is_admin: Whether the current user is an admin.
        """
        query = """
        MATCH (t:Topic)-[:HAS_NODE]->(n:MindmapNode {id: $id})
        WHERE $is_admin = true OR (:User {id: $user_id})-[:OWNS_TOPIC]->(t)
        SET n.content = $content
        RETURN n.id AS id
        """
        try:
            self.driver.execute_query(
                query,
                user_id=user_id,
                id=node_id,
                content=content,
                is_admin=is_admin,
                database_=self.database
            )
            logger.info(f"Updated content for node {node_id} for user {user_id} (Admin: {is_admin}).")
        except Exception as err:
            logger.error(f"[red]Error updating content for node {node_id}[/red]: {err}")
            raise

    def get_node(self, user_id: str, node_id: str, is_admin: bool = False) -> Optional[MindmapNodeSchema]:
        """
        Retrieves a single node by its ID, verifying user ownership or admin status.
        
        Args:
            user_id: The authenticated user ID.
            node_id: Node ID.
            is_admin: Whether the current user is an admin.
            
        Returns:
            Optional[MindmapNodeSchema]: The node schema, or None if not found.
        """
        query = """
        MATCH (t:Topic)-[:HAS_NODE]->(n:MindmapNode {id: $id})
        WHERE $is_admin = true OR (:User {id: $user_id})-[:OWNS_TOPIC]->(t)
        OPTIONAL MATCH (child:MindmapNode)
        WHERE child.sub_graph_parent_id = n.id
        RETURN n, count(child) > 0 AS has_subgraph
        """
        try:
            result = self.driver.execute_query(
                query,
                user_id=user_id,
                id=node_id,
                is_admin=is_admin,
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
 
    def get_breadcrumbs(self, user_id: str, node_id: str, is_admin: bool = False) -> List[Dict[str, str]]:
        """
        Traverses upward using SUB_GRAPH_OF relationships to build navigation path, verifying user ownership or admin status.
        
        Args:
            user_id: The authenticated user ID.
            node_id: Node ID.
            is_admin: Whether the current user is an admin.
            
        Returns:
            List[Dict[str, str]]: A list of breadcrumbs from root topic to the current node.
        """
        query = """
        MATCH (t:Topic)-[:HAS_NODE]->(n:MindmapNode {id: $id})
        WHERE $is_admin = true OR (:User {id: $user_id})-[:OWNS_TOPIC]->(t)
        OPTIONAL MATCH path = (n)-[:SUB_GRAPH_OF*]->(root:MindmapNode)
        WHERE root.parent_id IS NULL
        RETURN n, nodes(path) AS ancestors
        """
        try:
            result = self.driver.execute_query(
                query,
                user_id=user_id,
                id=node_id,
                is_admin=is_admin,
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
 
    def get_other_nodes_in_graph(
        self,
        user_id: str,
        topic_id: str,
        parent_id: str,
        is_admin: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Retrieves all other nodes in the mindmap graph that are not the parent node itself
        and not descendants of the parent node. Used as negative space boundaries.
        """
        query = """
        MATCH (t:Topic {id: $topic_id})
        WHERE $is_admin = true OR (:User {id: $user_id})-[:OWNS_TOPIC]->(t)
        MATCH (n:MindmapNode {topic_id: $topic_id})
        WHERE NOT (n)-[:SUB_GRAPH_OF*0..]->(:MindmapNode {id: $parent_id})
        RETURN n.label AS label, n.description AS description, n.level AS level
        """
        try:
            records = self.driver.execute_query(
                query,
                user_id=user_id,
                topic_id=topic_id,
                parent_id=parent_id,
                is_admin=is_admin,
                database_=self.database,
                routing_=RoutingControl.READ
            )
            return [
                {"label": r["label"], "description": r["description"], "level": r["level"]}
                for r in records.records
            ]
        except Exception as err:
            logger.error(f"[red]Error fetching negative space boundaries[/red]: {err}")
            return []
 
    def get_all_topics(self, user_id: str, is_admin: bool = False) -> List[TopicResponse]:
        """
        Retrieves all Topic nodes saved in Neo4j (all topics if admin, user's own if standard user).
        
        Args:
            user_id: The authenticated user ID.
            is_admin: Whether the current user is an admin.
            
        Returns:
            List[TopicResponse]: The list of topics.
        """
        query = """
        MATCH (t:Topic)
        WHERE $is_admin = true OR (:User {id: $user_id})-[:OWNS_TOPIC]->(t)
        OPTIONAL MATCH (owner:User)-[:OWNS_TOPIC]->(t)
        RETURN t.id AS id, t.title AS title, t.description AS description, t.content AS content, owner.email AS owner_email
        ORDER BY t.created_at DESC
        """
        try:
            records = self.driver.execute_query(
                query,
                user_id=user_id,
                is_admin=is_admin,
                database_=self.database,
                routing_=RoutingControl.READ,
                result_transformer_=lambda r: [dict(record) for record in r]
            )
            return [
                TopicResponse(
                    id=record["id"],
                    title=record["title"],
                    description=record["description"],
                    content=record.get("content"),
                    owner_email=record.get("owner_email")
                )
                for record in records
            ]
        except Exception as err:
            logger.error(f"[red]Error fetching all topics[/red]: {err}")
            return []
 
    def update_topic_content(self, user_id: str, topic_id: str, content: str, is_admin: bool = False) -> None:
        """
        Updates the detailed markdown content of a root Topic node, verifying user ownership or admin status.
        
        Args:
            user_id: The authenticated user ID.
            topic_id: Topic ID.
            content: The detailed markdown article generated.
            is_admin: Whether the current user is an admin.
        """
        query = """
        MATCH (t:Topic {id: $id})
        WHERE $is_admin = true OR (:User {id: $user_id})-[:OWNS_TOPIC]->(t)
        SET t.content = $content
        RETURN t.id AS id
        """
        try:
            self.driver.execute_query(
                query,
                user_id=user_id,
                id=topic_id,
                content=content,
                is_admin=is_admin,
                database_=self.database
            )
            logger.info(f"Updated content for Topic {topic_id} for user {user_id} (Admin: {is_admin}).")
        except Exception as err:
            logger.error(f"[red]Error updating content for Topic {topic_id}[/red]: {err}")
            raise

    def get_entire_graph(self, user_id: str, topic_id: str, is_admin: bool = False) -> Dict[str, Any]:
        """
        Retrieves the complete tree (all levels, nodes, edges, content, and the root topic metadata)
        for a given topic_id, verifying user ownership or admin status. Used for exporting/downloading.
        """
        topic = self.get_topic(user_id, topic_id, is_admin)
        if not topic:
            return {}
            
        node_query = """
        MATCH (n:MindmapNode {topic_id: $topic_id})
        RETURN n
        """
        
        edge_query = """
        MATCH (s)-[r]->(t:MindmapNode {topic_id: $topic_id})
        WHERE ((s:MindmapNode AND s.topic_id = $topic_id) OR (s:Topic AND s.id = $topic_id))
          AND type(r) <> 'SUB_GRAPH_OF' 
          AND type(r) <> 'HAS_NODE'
        RETURN s.id AS source, t.id AS target, coalesce(r.relation, type(r)) AS relation, coalesce(r.id, 'edge-' + s.id + '-' + t.id) AS id
        """
        
        try:
            # Fetch all nodes
            records = self.driver.execute_query(
                node_query,
                topic_id=topic_id,
                database_=self.database,
                routing_=RoutingControl.READ
            )
            nodes = []
            for record in records.records:
                n_node = record.get("n")
                if n_node:
                    nodes.append({
                        "id": n_node["id"],
                        "label": n_node["label"],
                        "description": n_node["description"],
                        "content": n_node.get("content"),
                        "level": n_node["level"],
                        "parent_id": n_node.get("parent_id"),
                        "sub_graph_parent_id": n_node.get("sub_graph_parent_id"),
                        "topic_id": n_node["topic_id"]
                    })
                    
            # Fetch all edges
            edge_records = self.driver.execute_query(
                edge_query,
                topic_id=topic_id,
                database_=self.database,
                routing_=RoutingControl.READ,
                result_transformer_=lambda r: [dict(record) for record in r]
            )
            
            return {
                "topic": {
                    "id": topic.id,
                    "title": topic.title,
                    "description": topic.description,
                    "content": topic.content
                },
                "nodes": nodes,
                "edges": edge_records
            }
        except Exception as err:
            logger.error(f"[red]Error retrieving entire graph for topic {topic_id}[/red]: {err}")
            raise
 
    def get_generation_count(self, user_id: str, topic_id: str, is_admin: bool = False) -> int:
        """
        Returns the total number of generated sub-graphs and detailed descriptions
        for a given topic_id, verifying user ownership or admin status, to enforce usage limits.
        """
        # Ensure user owns the topic (or is admin)
        check_query = """
        MATCH (t:Topic {id: $topic_id})
        WHERE $is_admin = true OR (:User {id: $user_id})-[:OWNS_TOPIC]->(t)
        RETURN count(t) AS count
        """
        check_res = self.driver.execute_query(
            check_query,
            user_id=user_id,
            topic_id=topic_id,
            is_admin=is_admin,
            database_=self.database,
            result_transformer_=lambda r: r.single()
        )
        if not check_res or check_res["count"] == 0:
            return 999999 # refuse if not owned
            
        # Count sub-graphs (nodes that have had subgraphs generated via drill down)
        subgraph_query = """
        MATCH (child:MindmapNode {topic_id: $topic_id})
        WHERE child.sub_graph_parent_id IS NOT NULL
        RETURN count(distinct child.sub_graph_parent_id) AS subgraphs_count
        """
        
        # Count nodes and topics with non-null content (detailed descriptions)
        desc_query = """
        MATCH (n)
        WHERE (n:Topic AND n.id = $topic_id AND n.content IS NOT NULL)
           OR (n:MindmapNode AND n.topic_id = $topic_id AND n.content IS NOT NULL)
        RETURN count(n) AS descriptions_count
        """
        
        try:
            subgraph_res = self.driver.execute_query(
                subgraph_query,
                topic_id=topic_id,
                database_=self.database,
                routing_=RoutingControl.READ,
                result_transformer_=lambda r: r.single()
            )
            subgraphs_count = subgraph_res["subgraphs_count"] if subgraph_res else 0
            
            desc_res = self.driver.execute_query(
                desc_query,
                topic_id=topic_id,
                database_=self.database,
                routing_=RoutingControl.READ,
                result_transformer_=lambda r: r.single()
            )
            descriptions_count = desc_res["descriptions_count"] if desc_res else 0
            
            total = subgraphs_count + descriptions_count
            logger.info(f"Topic {topic_id} usage: {subgraphs_count} subgraphs, {descriptions_count} descriptions. Total: {total}")
            return total
        except Exception as err:
            logger.error(f"[red]Error counting generations for topic {topic_id}[/red]: {err}")
            return 0


# Global database client instance (lazy initialized or active import)
neo4j_client = Neo4jClient()
