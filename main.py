from dataclasses import dataclass
from typing import List, Dict, Optional
import os
import json
from openai import OpenAI
from dotenv import load_dotenv
import textwrap
from colorama import init, Fore, Style

# Initialize colorama for cross-platform colored output
init()

@dataclass
class GameConfig:
    """Configuration settings for the game"""
    topic: str
    difficulty: str
    language: str

@dataclass
class WrongGuess:
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
        
        # Initialize OpenAI client
        self._initialize_api_client()
        
        # Load system prompts
        self.system_prompt = self._load_prompt("system_prompt.txt")
        self.system_prompt_2 = self._load_prompt("system_prompt_2.txt")
        
        # Game state
        self.current_word: Optional[str] = None
        self.attempts: int = 0
        self.max_attempts: int = 5

    def _initialize_api_client(self) -> None:
        """Initialize the OpenAI API client with environment variables"""
        api_key = os.getenv("API_KEY")
        base_url = os.getenv("BASE_URL")
        self.model = os.getenv("MODEL_NAME")

        if not all([api_key, base_url, self.model]):
            raise TabooGameException("Missing required environment variables")

        self.client = OpenAI(api_key=api_key, base_url=base_url)

    def _load_prompt(self, filename: str) -> str:
        """Load and return content from a prompt file"""
        try:
            with open(filename, "r") as file:
                return file.read().strip()
        except FileNotFoundError:
            raise TabooGameException(f"Required prompt file {filename} not found")

    def generate_taboo(self, config: GameConfig) -> Dict:
        """Generate a new taboo word and its properties"""
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": json.dumps(config.__dict__)}
                ],
                temperature=1,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content
            try:
                parsed_content = json.loads(content)
                self.current_word = parsed_content["word"].lower()
                return parsed_content
            except (json.JSONDecodeError, KeyError) as e:
                raise TabooGameException(f"Invalid taboo word response format: {str(e)}\nResponse: {content}")
        except Exception as e:
            raise TabooGameException(f"Failed to generate taboo word: {str(e)}")

    def generate_hint(self, props: Dict, previous_guesses: Optional[List[WrongGuess]] = None) -> str:
        """Generate a new hint based on the word properties and previous guesses"""
        try:
            request_props = props.copy()
            if previous_guesses:
                request_props["olderwrongs"] = [g.__dict__ for g in previous_guesses]

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt_2},
                    {"role": "user", "content": json.dumps(request_props)}
                ],
                response_format={"type": "json_object"},
                temperature=1,
            )
            
            content = response.choices[0].message.content
            try:
                parsed_content = json.loads(content)
                if isinstance(parsed_content, dict):
                    # Try different possible keys where the hint might be
                    for key in ["hints", "hint", "sentence"]:
                        if key in parsed_content:
                            return parsed_content[key]
                    # If we found no known keys but it's a single-key dict, use that value
                    if len(parsed_content) == 1:
                        return next(iter(parsed_content.values()))
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
            raise TabooGameException(f"Failed to generate hint: {str(e)}")

class GameUI:
    """Handle game user interface and interactions"""
    
    @staticmethod
    def display_welcome() -> None:
        """Display welcome message and game instructions"""
        print(f"\n{Fore.CYAN}Welcome to Taboo Game!{Style.RESET_ALL}")
        print(textwrap.dedent("""
            Try to guess the secret word based on the hints provided.
            The hints will try to describe the word without using certain taboo terms.
            You have 5 attempts to guess correctly!
        """))

    @staticmethod
    def display_hint(hint: str, attempt: int, max_attempts: int) -> None:
        """Display the current hint and attempt count"""
        print(f"\n{Fore.YELLOW}Hint #{attempt}/{max_attempts}:{Style.RESET_ALL}")
        # Clean up the hint text
        hint = hint.strip()
        if hint.startswith('"') and hint.endswith('"'):
            hint = hint[1:-1]
        # Capitalize first letter and add period if missing
        hint = hint[0].upper() + hint[1:]
        if not hint.endswith(('.', '!', '?')):
            hint += '.'
        print(textwrap.fill(hint, width=70))

    @staticmethod
    def get_guess() -> str:
        """Get user's guess input"""
        return input(f"\n{Fore.GREEN}Enter your guess: {Style.RESET_ALL}").strip().lower()

    @staticmethod
    def display_game_over(won: bool, word: str, attempts: int) -> None:
        """Display game over message"""
        if won:
            print(f"\n{Fore.GREEN}Congratulations! You guessed the word '{word}' in {attempts} attempts!{Style.RESET_ALL}")
        else:
            print(f"\n{Fore.RED}Game Over! The word was '{word}'{Style.RESET_ALL}")

def main():
    """Main game loop"""
    game = TabooGame()
    ui = GameUI()
    
    try:
        ui.display_welcome()
        
        # Initialize game with configuration
        config = GameConfig(
            topic="sports",
            difficulty="easy",
            language="english"
        )
        
        # Generate initial taboo word and properties
        taboo_props = game.generate_taboo(config)
        previous_guesses: List[WrongGuess] = []
        
        while game.attempts < game.max_attempts:
            game.attempts += 1
            
            # Generate and display hint
            hint = game.generate_hint(taboo_props, previous_guesses)
            ui.display_hint(hint, game.attempts, game.max_attempts)
            
            # Get and process user's guess
            guess = ui.get_guess()
            
            if guess == game.current_word:
                ui.display_game_over(won=True, word=game.current_word, attempts=game.attempts)
                break
            
            # Store wrong guess
            previous_guesses.append(WrongGuess(predict=guess, sentence=hint))
            
            # Check if last attempt
            if game.attempts == game.max_attempts:
                ui.display_game_over(won=False, word=game.current_word, attempts=game.attempts)

    except TabooGameException as e:
        print(f"\n{Fore.RED}Game Error: {str(e)}{Style.RESET_ALL}")
    except KeyboardInterrupt:
        print(f"\n{Fore.YELLOW}Game terminated by user.{Style.RESET_ALL}")

if __name__ == "__main__":
    main()