const SIMILARITY_THRESHOLD = 0.8;
const HINT_FADE_DURATION = 300;
const MAX_ATTEMPTS = 5;
const ERROR_MESSAGE_DURATION = 3000;
class TabooGame {
    constructor() {
        this.setupEventListeners();
        this.currentAttempt = 0;
        this.maxAttempts = MAX_ATTEMPTS;
        this.previousGuesses = [];
        this.initializeGuessesList();
        this.timerInterval = null;
        this.resetGame();
    }

    

    setupEventListeners() {
        document.getElementById('start-game').addEventListener('click', () => this.startGame());
        const guessInput = document.getElementById('guess-input');
        guessInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.makeGuess(e.target.value);
        });
        document.getElementById('replay').addEventListener('click', () => this.resetGame());

        const difficultySelect = document.getElementById('difficulty');
        const startButton = document.getElementById('start-game');


        difficultySelect.addEventListener('change', () => this.updateStartButtonState());
        document.getElementById('topic').addEventListener('input', () => this.updateStartButtonState());

        this.updateStartButtonState();
    }

    updateStartButtonState() {
        const difficultySelect = document.getElementById('difficulty');
        const startButton = document.getElementById('start-game');
        const topicInput = document.getElementById('topic').value;

        if (difficultySelect.value === '' || !topicInput.trim()) {
            startButton.classList.add('unclickable');
        } else {
            startButton.classList.remove('unclickable');
        }
    }

    async startGame() {
        const difficulty = document.getElementById('difficulty').value;
        if (!difficulty) {
          return;
        }
        const topic = document.getElementById('topic').value;
        if (!topic || !topic.trim()) {
            return;
        }

        this.showLoader();


        try {
            const response = await fetch('/game', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    difficulty,
                    topic
                })
            });

            const data = await response.json();
            if (response.ok) {
                this.gameProps = data;
                 this.gameProps.banned = data.banned;
                this.switchScreen('game-screen');
                this.updateGameInfo(difficulty, topic);
                this.hideLoader();
                await this.getNewHint();
                this.startTimer(20);
            } else {
                 this.showError('Unable to start game. Please try again later.');
                 console.error('Error starting game:', data.error);
            }
        } catch (error) {
             console.error('Failed to start game:', error);
             this.showError('Failed to start game. Please check your connection and try again.');
        }
    }

    async getNewHint() {
        this.showHintLoader();
        document.getElementById('current-hint').textContent = '';

        try {
            const response = await fetch('/hints', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    props: this.gameProps,
                    previous_guesses: this.previousGuesses
                })
            });

            const data = await response.json();
            if (response.ok) {
                const hintElement = document.getElementById('current-hint');
                hintElement.textContent = data.hint;
                const hintBox = document.getElementById('hint-box');
                hintBox.style.height = 'auto';
                const newHeight = hintBox.scrollHeight;
                hintBox.style.height = `${newHeight}px`;
            } else {
                 this.showError('Unable to get new hint. Please try again.');
                 console.error('Error getting hint:', data.error);
            }
        } catch (error) {
            console.error('Failed to get hint:', error);
            this.showError('Failed to get hint. Please check your connection and try again.');
        } finally {
            this.hideHintLoader();
        }
    }

    async makeGuess(guess) {
        if (!guess.trim()) return;

        document.getElementById('guess-input').disabled = true;

        try {
            this.currentAttempt++;
            const similarity = this.checkSimilarity(guess, this.gameProps.word);
            if (similarity > SIMILARITY_THRESHOLD) {
                this.showResult(true);
            } else {
                this.previousGuesses.push({
                    predict: guess,
                    sentence: document.getElementById('current-hint').textContent
                });

                if (this.currentAttempt === 1) {
                    this.removeGuessesListPlaceholder();
                }
                this.updateWrongGuessesList();

                if (this.currentAttempt >= MAX_ATTEMPTS) {
                    this.showResult(false);
                } else {
                    await this.getNewHint();
                }
            }
            document.getElementById('guess-input').value = '';
        }  catch (error) {
            console.error('Failed to make guess:', error);
            this.showError('Failed to make guess: ' + error);
        }
         finally {
            document.getElementById('guess-input').disabled = false;
        }
    }

    checkSimilarity(str1, str2) {
        const str1Lower = str1.toLowerCase();
        const str2Lower = str2.toLowerCase();
        const edits = this.levenshteinDistance(str1Lower, str2Lower);
        const maxLength = Math.max(str1Lower.length, str2Lower.length);
        return 1 - (edits / maxLength);
    }

    levenshteinDistance(a, b) {
        // base cases
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        const matrix = [];

        // increment along the first column of each row
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        // increment each column in the first row
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        // Fill in the rest of the matrix
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1]; // no cost
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    updateGameInfo(difficulty, topic) {
        document.getElementById('difficulty-display').textContent = `difficulty: ${difficulty}`;
        document.getElementById('topic-display').textContent = `topic: ${topic}`;
    }

    updateWrongGuessesList() {
        const list = document.getElementById('guesses-list');
        list.innerHTML = this.previousGuesses
            .map((guess, index) => `<li>#${index + 1} -> ${guess.predict}</li>`)
            .join('');
    }

    showResult(won) {
        const resultMessage = document.getElementById('result-message');
        resultMessage.innerHTML = won ?
            `you won! you guessed the word <span class="correct-word">${this.gameProps.word}</span> in ${this.currentAttempt} attempts` :
            `you lose! you could not guess the correct word <span class="correct-word">${this.gameProps.word}</span>`;
        resultMessage.className = won ? 'win-message' : 'lose-message';
        
        this.switchScreen('result-screen');
        const bannedWordsList = document.getElementById('banned-words-list');
        bannedWordsList.innerHTML = '';
        if (this.gameProps.banned) {
          this.gameProps.banned.forEach(word => {
                const wordElement = document.createElement('span');
                wordElement.textContent = word;
                wordElement.classList.add('banned-word');
                bannedWordsList.appendChild(wordElement);
            });
        }
        
        if (won) {
          this.clearTimer();
        }
    }

    generateRandomPosition(container, element) {
      const containerRect = container.getBoundingClientRect();
      const padding = 10;
      return {
          top: Math.random() * (containerRect.height - padding * 2) + padding,
          left: Math.random() * (containerRect.width - padding * 2) + padding
      };
  }


    switchScreen(screenId) {
        document.querySelectorAll('.screen').forEach((screen) => {
            screen.classList.toggle('hidden', screen.id !== screenId);
            screen.style.transform = screen.id === screenId ? 'translateY(0)' : 'translateY(10px)';
            screen.style.opacity = screen.id === screenId ? '1' : '0';
        });
    }

    resetGame() {
        this.currentAttempt = 0;
        this.previousGuesses = [];
        this.switchScreen('setup-screen');
        this.initializeGuessesList();
        this.clearTimer();
        document.getElementById('timer-display').textContent = 20;
    }

    initializeGuessesList() {
        const list = document.getElementById('guesses-list');
        list.innerHTML = '<li>no older guesses for now</li>';
    }

    removeGuessesListPlaceholder() {
        const list = document.getElementById('guesses-list');
        list.innerHTML = '';
    }

    showLoader() {
        const loader = document.getElementById('loader');
        loader.style.display = 'block';
    }

    hideLoader() {
        const loader = document.getElementById('loader');
        loader.style.display = 'none';
    }

    showHintLoader() {
        const loader = document.getElementById('hint-loader');
        loader.style.display = 'block';
    }

    hideHintLoader() {
        const loader = document.getElementById('hint-loader');
        loader.style.display = 'none';
    }

     showError(message) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
        setTimeout(() => errorDiv.classList.add('hidden'), ERROR_MESSAGE_DURATION);
    }

    startTimer(duration) {
        let timer = duration;
        const timerDisplay = document.getElementById('timer-display');
        timerDisplay.style.color = 'white';
        timerDisplay.textContent = timer;

        const tick = () => {
            timerDisplay.textContent = timer;
            timerDisplay.classList.add('timer-animation');
            setTimeout(() => {
                timerDisplay.classList.remove('timer-animation');
            }, HINT_FADE_DURATION);
            if (timer > 10) {
                timerDisplay.style.color = 'white';
            } else if (timer <= 10) {
                timerDisplay.style.color = 'yellow';
            }
            if (timer <= 5) {
                timerDisplay.style.color = 'red';
            }

            if (timer < 0) {
                this.clearTimer();
                this.showResult(false);
                return;
            }
            timer--;
        };
        this.timerInterval = setInterval(tick, 1000);
        tick();
    }

    clearTimer() {
        if (this.timerInterval) {
          clearInterval(this.timerInterval);
          clearTimeout(this.timerInterval);
          this.timerInterval = null;
        }
    }
}


document.addEventListener('DOMContentLoaded', () => {
   new TabooGame();
});