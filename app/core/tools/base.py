from typing import Dict, Any, Optional
from abc import ABC, abstractmethod

class Tool(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        pass
    
    @property
    @abstractmethod
    def version(self) -> str:
        pass
    
    @abstractmethod
    async def run(self, input_data: Dict[str, Any], ctx) -> Dict[str, Any]:
        pass