import os
from openai import OpenAI
import hishel
import json
import dotenv
dotenv.load_dotenv(override=True)

class open_ai_repository:
    def __init__(self, api_key):
        self.api_key = api_key

    def get_similar_tracks(self, artist, title):
        client = OpenAI(
            http_client = hishel.CacheClient()
        )

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": f"Give me similar tracks to '{title}' by the artist '{artist}'"
                }
            ],
            response_format = {
                "type": "json_schema",
                "json_schema": {
                    "name": "similar_tracks",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "tracks": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "title": {"type": "string"},
                                        "artist": {"type": "string"}
                                    }
                                }
                            }
                        }
                    }
                }
            }
        )

        return json.loads(completion.choices[0].message.content)