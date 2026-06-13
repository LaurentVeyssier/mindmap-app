import os
import sys
from rich.console import Console

# Ensure the backend directory is in the Python path so we can import from app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.neo4j_client import neo4j_client

console = Console()

def run_keep_alive() -> None:
    """
    Connects to the Neo4j AuraDB instance and executes a single dummy write query
    to update the last_ping timestamp, preventing the instance from being paused.
    This query will simply create a single, isolated node inside the existing database.
    This query checks the database to see if a node with the label :KeepAlive and the property id: 'singleton' already exists.
    - If it exists, it updates the last_ping timestamp with the current date and time.
    - If it doesn't exist, it creates it with the current timestamp.
    This :KeepAlive node has no relationships (edges) linking it to users, topics, or mindmap concepts.
    Because this node is labeled :KeepAlive, it will never be loaded by the frontend or backend and will remain completely 
    invisible on dashboards and mindmap canvases.
    It can be queried using a Cypher query like "MATCH (k:KeepAlive) RETURN k" from Neo4j Aura console/browser
    
    Raises:
        Exception: If database query or connection fails.
    """
    console.print("[bold cyan]Executing AuraDB Keep-Alive write query...[/bold cyan]")
    
    query = """
    MERGE (k:KeepAlive {id: 'singleton'})
    SET k.last_ping = datetime()
    RETURN k.last_ping AS last_ping
    """
    try:
        result = neo4j_client.driver.execute_query(
            query,
            database_=neo4j_client.database,
            result_transformer_=lambda r: r.single()
        )
        if result:
            console.print(f"[bold green]✔ Success! Database updated last_ping: {result['last_ping']}[/bold green]")
        else:
            console.print("[bold red]✘ Keep-alive query did not return any records.[/bold red]")
            sys.exit(1)
    except Exception as err:
        console.print(f"[bold red]✘ Failed to execute keep-alive query:[/bold red] {err}")
        sys.exit(1)

if __name__ == "__main__":
    try:
        run_keep_alive()
    finally:
        # Close driver connection cleanly
        neo4j_client.close()
