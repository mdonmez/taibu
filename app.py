import logging
from flask import Flask, request, jsonify, render_template
from dataclasses import dataclass
from typing import List, Dict, Optional
import os
import json
from openai import OpenAI
from dotenv import load_dotenv
import difflib

app = Flask(__name__)

@dataclass
class game_config:
    """Configuration settings for the game"""
    topic: str
    difficulty: str
    language: str

@dataclass
class wrong_guess:
    """Structure for storing wrong guesses and their corresponding hints"""
    predict: str
    sentence: str

class TabooGameException(Exception):
    """Custom exception for TabooGame-specific errors"""
    pass
class TabooGame:
    def __init__(self):
        """Initialize the TabooGame with API configurations and prompts"""
        load_dotenv()
        self.logger = logging.getLogger('taboo_game')
        self.logger.setLevel(logging.DEBUG)
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
        self.logger.addHandler(handler)
        load_dotenv()

        # Initialize OpenAI client
        self._initialize_api_client()

        # Load system prompts
        self.system_prompt_wordgen = self._load_prompt("system_prompts/system_prompt_wordgen.txt")
        self.system_prompt_hintgen = self._load_prompt("system_prompts/system_prompt_hintgen.txt")

        # Game state
        self.current_word: Optional[str] = None
        self.attempts: int = 0
        self.max_attempts: int = 5

    def _initialize_api_client(self) -> None:
        """Initialize the OpenAI API client with environment variables"""
        self.logger.info("Initializing OpenAI API client")
        api_key = os.getenv("API_KEY")
        base_url = os.getenv("BASE_URL")
        self.model = os.getenv("MODEL_NAME")

        if not all([api_key, base_url, self.model]):
            self.logger.error("Missing required environment variables: API_KEY, BASE_URL, and MODEL_NAME must be set.")
            raise TabooGameException("Missing required environment variables: API_KEY, BASE_URL, and MODEL_NAME must be set.")

        try:
            self.client = OpenAI(api_key=api_key, base_url=base_url)
            self.logger.info("OpenAI API client initialized successfully")
        except Exception as e:
            self.logger.error(f"Failed to initialize OpenAI API client: {str(e)}")
            raise TabooGameException(f"Failed to initialize OpenAI API client: {str(e)}")

    def _load_prompt(self, filename: str) -> str:
        """Load and return content from a prompt file"""
        try:
            with open(filename, "r") as file:
                return file.read().strip()
        except FileNotFoundError:
            raise TabooGameException(f"Required prompt file {filename} not found")

    def generate_taboo(self, config: game_config) -> Dict:
        """Generate a new taboo word and its properties"""
        self.logger.info(f"Generating taboo word with config: {config.__dict__}")
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt_wordgen},
                    {"role": "user", "content": json.dumps(config.__dict__)}
                ],
                temperature=1,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content
            self.logger.info(f"OpenAI API response: {content}")
            try:
                parsed_content = json.loads(content)
                self.current_word = parsed_content["word"].lower()
                return parsed_content
            except (json.JSONDecodeError, KeyError) as e:
                self.logger.error(f"Invalid taboo word response format: {str(e)}\nResponse: {content}")
                raise TabooGameException(f"Invalid taboo word response format: {str(e)}\nResponse: {content}")
        except Exception as e:
            self.logger.error(f"Failed to generate taboo word. OpenAI API error: {str(e)}")
            raise TabooGameException(f"Failed to generate taboo word. OpenAI API error: {str(e)}")

    def generate_hint(self, props: Dict, previous_guesses: Optional[List[wrong_guess]] = None) -> str:
        """Generate a new hint based on the word properties and previous guesses"""
        self.logger.info(f"Generating hint with props: {props}, previous guesses: {previous_guesses}")
        try:
            request_props = props.copy()
            if previous_guesses:
                request_props["olderwrongs"] = [g.__dict__ for g in previous_guesses]

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt_hintgen},
                    {"role": "user", "content": json.dumps(request_props)}
                ],
                response_format={"type": "json_object"},
                temperature=1,
            )

            content = response.choices[0].message.content
            self.logger.info(f"OpenAI API response: {content}")
            try:
                parsed_content = json.loads(content)
                if isinstance(parsed_content, dict) and "hint" in parsed_content:
                        return parsed_content["hint"]
                return content  # Fallback to raw content
            except json.JSONDecodeError:
                # Clean up raw string if it looks like JSON but couldn't be parsed
                content = content.strip()
                if content.startswith('{') and content.endswith('}'):
                    # Try to extract text between quotes after a colon
                    import re
                    match = re.search(r':\s*"([^"]+)"', content)
                    if match:
                        return match.group(1)
                return content
        except Exception as e:
            self.logger.error(f"Failed to generate hint. OpenAI API error: {str(e)}")
            raise TabooGameException(f"Failed to generate hint. OpenAI API error: {str(e)}")

    def check_similarity(self, guess, word):
        guess = guess.lower()
        word = word.lower()
        return difflib.SequenceMatcher(None, guess, word).ratio()

game = TabooGame()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/game', methods=['POST'])
def start_game():
    try:
        data = request.json
        config = game_config(
            topic=data.get('topic'),
            difficulty=data.get('difficulty'),
            language='english'
        )
        taboo_properties = game.generate_taboo(config)
        return jsonify(taboo_properties)
    except TabooGameException as e:
        return jsonify({"error": str(e)}), 400

@app.route('/hints', methods=['POST'])
def get_hint():
    try:
        data = request.json
        props = data.get('props')
        previous_guesses = data.get('previous_guesses', [])
        previous_guesses = [wrong_guess(**guess) for guess in previous_guesses]
        hint = game.generate_hint(props, previous_guesses)
        return jsonify({"hint": hint})
    except TabooGameException as e:
        return jsonify({"error": str(e)}), 400

if __name__ == '__main__':
    app.run(debug=True)