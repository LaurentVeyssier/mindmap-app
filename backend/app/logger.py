import logging
from rich.logging import RichHandler


def setup_logger(name: str = "mindmap") -> logging.Logger:
    """
    Configures and returns a logger using RichHandler for beautiful, color-coded terminal output.
    
    Args:
        name: Name of the logger.
        
    Returns:
        A configured logging.Logger instance.
    """
    # Configure the basic logging setup
    logging.basicConfig(
        level="INFO",
        format="%(message)s",
        datefmt="[%X]",
        handlers=[
            RichHandler(
                rich_tracebacks=True,
                markup=True,
                show_path=False
            )
        ]
    )
    
    custom_logger = logging.getLogger(name)
    custom_logger.setLevel(logging.INFO)
    return custom_logger


# Global logger instance
logger = setup_logger()
