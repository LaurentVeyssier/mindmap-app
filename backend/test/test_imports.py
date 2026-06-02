import unittest
from app.config import settings
from app.schemas import ConceptDecomposition, RelationshipExtraction
from app.neo4j_client import Neo4jClient
from app.agents import MindmapAgents


class TestImports(unittest.TestCase):
    """
    Basic unit tests verifying imports and environment loading.
    """

    def test_imports(self) -> None:
        """
        Verify that all modules can be imported and initialized.
        """
        self.assertIsNotNone(settings)
        self.assertIsNotNone(ConceptDecomposition)
        self.assertIsNotNone(RelationshipExtraction)
        
        # Test Neo4jClient can be instantiated (without active DB connection check)
        client = Neo4jClient()
        self.assertIsNotNone(client)
        client.close()
        
        # Test MindmapAgents can be instantiated
        agents = MindmapAgents()
        self.assertIsNotNone(agents)


if __name__ == "__main__":
    unittest.main()
