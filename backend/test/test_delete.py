import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from app.neo4j_client import Neo4jClient
from app.main import delete_mindmap
from app.schemas import CurrentUser

class TestDeleteTopic(unittest.TestCase):
    """
    Tests for the deletion functionality of a specific mindmap topic.
    """

    @patch("app.main.neo4j_client")
    def test_delete_mindmap_endpoint_success(self, mock_neo4j_client: MagicMock) -> None:
        """
        Verify that the delete_mindmap endpoint correctly finds the topic,
        calls the delete_topic client method, and returns a success response.

        Args:
            mock_neo4j_client: The mocked Neo4jClient instance.
        """
        # Mock get_topic to return a valid TopicResponse object
        mock_topic = MagicMock()
        mock_topic.id = "test-topic-id"
        mock_neo4j_client.get_topic.return_value = mock_topic

        # Mock user
        mock_user = CurrentUser(id="test-user-id", email="test@example.com", is_admin=False)

        # Call the endpoint handler
        response = delete_mindmap(topic_id="test-topic-id", current_user=mock_user)

        # Assertions
        mock_neo4j_client.get_topic.assert_called_once_with("test-user-id", "test-topic-id", False)
        mock_neo4j_client.delete_topic.assert_called_once_with("test-user-id", "test-topic-id", False)
        self.assertEqual(response, {"status": "deleted", "topic_id": "test-topic-id"})

    @patch("app.main.neo4j_client")
    def test_delete_mindmap_endpoint_not_found(self, mock_neo4j_client: MagicMock) -> None:
        """
        Verify that the delete_mindmap endpoint raises an HTTP 404 Exception
        if the topic does not exist.

        Args:
            mock_neo4j_client: The mocked Neo4jClient instance.
        """
        # Mock get_topic to return None (not found)
        mock_neo4j_client.get_topic.return_value = None

        # Mock user
        mock_user = CurrentUser(id="test-user-id", email="test@example.com", is_admin=False)

        # Assertions
        with self.assertRaises(HTTPException) as context:
            delete_mindmap(topic_id="non-existent", current_user=mock_user)
        
        self.assertEqual(context.exception.status_code, 404)
        self.assertEqual(context.exception.detail, "Topic not found")
        mock_neo4j_client.get_topic.assert_called_once_with("test-user-id", "non-existent", False)
        mock_neo4j_client.delete_topic.assert_not_called()

if __name__ == "__main__":
    unittest.main()
